/**
 * Proactive AI — monitoring, pattern learning, and suggestion generation.
 *
 * Browser-realistic design:
 *   - We can't actually screenshot the OS from a web app. Instead, the user
 *     pastes a screenshot (or drags one in), and we send it to the VLM for
 *     analysis ("What app is this? What is the user doing? Can I help?").
 *   - We learn usage patterns by tracking which DevForge feature the user
 *     opens and when (hour-of-day, weekday). Patterns are stored in the
 *     UserPattern Prisma table.
 *   - We generate suggestions from: (a) the screenshot analysis, (b) learned
 *     patterns ("you usually open Chat at 9 AM — want me to open it?"),
 *     (c) the daily-summary endpoint that runs at end of day.
 *
 * Settings are persisted to localStorage on the client; the engine itself
 * runs server-side (for pattern queries) with a thin client wrapper.
 */

import { db } from "@/lib/db";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SuggestionKind = "tip" | "offer" | "summary" | "reminder";

export interface ProactiveSettings {
  enabled: boolean;
  intervalMs: number; // suggestion-check interval
  focusMode: boolean; // when true, suppress notifications
  focusModeUntil: number | null; // timestamp
  dailySummary: boolean; // show end-of-day summary
  dailySummaryHour: number; // 0-23
  blockedSites: string[]; // for future focus-mode blocking
}

export const DEFAULT_SETTINGS: ProactiveSettings = {
  enabled: true,
  intervalMs: 2 * 60 * 1000, // 2 minutes
  focusMode: false,
  focusModeUntil: null,
  dailySummary: true,
  dailySummaryHour: 18, // 6 PM
  blockedSites: [],
};

const SETTINGS_KEY = "devforge-proactive-settings";

// Client-side settings helpers ---------------------------------------------

/** Read settings from localStorage. Falls back to defaults. */
export function readSettings(): ProactiveSettings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  try {
    const raw = window.localStorage.getItem(SETTINGS_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    return { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<ProactiveSettings>) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function writeSettings(s: ProactiveSettings): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}

// ---------------------------------------------------------------------------
// Pattern tracking — server-side
// ---------------------------------------------------------------------------

export interface TrackInput {
  /** The feature the user opened (e.g. "chat", "image", "vision"). */
  feature: string;
  /** Optional sub-action (e.g. "send-message"). */
  action?: string;
}

/**
 * Record a usage observation. Updates (or creates) the matching UserPattern
 * rows for the current hour, weekday, and day.
 *
 * Patterns we track:
 *   - "feature:<feature>:hour:<0-23>"           — count of times opened at hour
 *   - "feature:<feature>:weekday:<0-6>"          — count of times opened on weekday
 *   - "feature:<feature>:action:<action>"        — count of action invocations
 */
export async function trackUsage(input: TrackInput): Promise<void> {
  const now = new Date();
  const hour = now.getHours();
  const weekday = now.getDay();
  const day = now.toISOString().slice(0, 10); // YYYY-MM-DD

  const keys: Array<{ key: string; bucket: string; value: string }> = [
    {
      key: `feature:${input.feature}:hour:${hour}`,
      bucket: "hour",
      value: "1",
    },
    {
      key: `feature:${input.feature}:weekday:${weekday}`,
      bucket: "weekday",
      value: "1",
    },
    {
      key: `feature:${input.feature}:day:${day}`,
      bucket: "day",
      value: "1",
    },
  ];

  if (input.action) {
    keys.push({
      key: `feature:${input.feature}:action:${input.action}`,
      bucket: "action",
      value: "1",
    });
  }

  // Upsert each pattern — increment the numeric value.
  for (const k of keys) {
    try {
      const existing = await db.userPattern.findUnique({
        where: {
          key_bucket_observedAt: {
            key: k.key,
            bucket: k.bucket,
            observedAt: now,
          },
        },
      });
      if (existing) {
        await db.userPattern.update({
          where: { id: existing.id },
          data: { value: String(parseInt(existing.value, 10) + 1) },
        });
      } else {
        await db.userPattern.create({
          data: {
            key: k.key,
            bucket: k.bucket,
            value: k.value,
            observedAt: now,
          },
        });
      }
    } catch (err) {
      console.error("[proactive-engine] trackUsage error:", err);
    }
  }
}

/**
 * Aggregate the user's hourly pattern for a feature.
 * Returns an array of 24 numbers — count of uses at each hour of the day.
 */
export async function getHourlyPattern(feature: string): Promise<number[]> {
  const rows = await db.userPattern.findMany({
    where: {
      bucket: "hour",
      key: { startsWith: `feature:${feature}:hour:` },
    },
  });
  const hours = new Array(24).fill(0);
  for (const r of rows) {
    const m = /:hour:(\d+)$/.exec(r.key);
    if (m) {
      const h = parseInt(m[1], 10);
      if (h >= 0 && h < 24) hours[h] += parseInt(r.value, 10) || 0;
    }
  }
  return hours;
}

/**
 * Find the most-used feature at a given hour. Returns null if no data.
 */
export async function getTopFeatureAtHour(hour: number): Promise<{
  feature: string;
  count: number;
} | null> {
  const rows = await db.userPattern.findMany({
    where: {
      bucket: "hour",
      key: { contains: `:hour:${hour}` },
    },
  });
  let best: { feature: string; count: number } | null = null;
  for (const r of rows) {
    const m = /^feature:([^:]+):hour:/.exec(r.key);
    if (m) {
      const feature = m[1];
      const count = parseInt(r.value, 10) || 0;
      if (!best || count > best.count) {
        best = { feature, count };
      }
    }
  }
  return best;
}

// ---------------------------------------------------------------------------
// Suggestions
// ---------------------------------------------------------------------------

export interface SuggestionInput {
  kind: SuggestionKind;
  title: string;
  body: string;
  action?: string;
  context?: Record<string, unknown>;
}

export async function createSuggestion(
  input: SuggestionInput,
): Promise<{
  id: string;
  kind: string;
  title: string;
  body: string;
  action: string | null;
  dismissed: boolean;
  createdAt: string;
}> {
  const row = await db.proactiveSuggestion.create({
    data: {
      kind: input.kind,
      title: input.title,
      body: input.body,
      action: input.action ?? null,
      context: input.context ? JSON.stringify(input.context) : null,
    },
  });
  return {
    id: row.id,
    kind: row.kind,
    title: row.title,
    body: row.body,
    action: row.action,
    dismissed: row.dismissed,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function listActiveSuggestions(limit = 20): Promise<
  Array<{
    id: string;
    kind: string;
    title: string;
    body: string;
    action: string | null;
    dismissed: boolean;
    snoozedUntil: string | null;
    createdAt: string;
  }>
> {
  const now = new Date();
  const rows = await db.proactiveSuggestion.findMany({
    where: {
      dismissed: false,
      OR: [{ snoozedUntil: null }, { snoozedUntil: { lt: now } }],
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit,
  });
  return rows.map((r: {
    id: string;
    kind: string;
    title: string;
    body: string;
    action: string | null;
    dismissed: boolean;
    snoozedUntil: Date | null;
    createdAt: Date;
  }) => ({
    id: r.id,
    kind: r.kind,
    title: r.title,
    body: r.body,
    action: r.action,
    dismissed: r.dismissed,
    snoozedUntil: r.snoozedUntil ? r.snoozedUntil.toISOString() : null,
    createdAt: r.createdAt.toISOString(),
  }));
}

export async function dismissSuggestion(id: string): Promise<boolean> {
  try {
    await db.proactiveSuggestion.update({
      where: { id },
      data: { dismissed: true },
    });
    return true;
  } catch {
    return false;
  }
}

export async function snoozeSuggestion(
  id: string,
  minutes: number,
): Promise<boolean> {
  try {
    await db.proactiveSuggestion.update({
      where: { id },
      data: { snoozedUntil: new Date(Date.now() + minutes * 60_000) },
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Generate a daily-summary suggestion by aggregating today's usage.
 */
export async function generateDailySummary(): Promise<{
  title: string;
  body: string;
}> {
  const today = new Date().toISOString().slice(0, 10);
  const rows = await db.userPattern.findMany({
    where: { bucket: "day", key: { contains: `:day:${today}` } },
  });

  const perFeature: Record<string, number> = {};
  for (const r of rows) {
    const m = /^feature:([^:]+):day:/.exec(r.key);
    if (m) {
      const feature = m[1];
      perFeature[feature] = (perFeature[feature] || 0) + (parseInt(r.value, 10) || 0);
    }
  }

  const sorted = Object.entries(perFeature).sort((a, b) => b[1] - a[1]);
  const total = sorted.reduce((s, [, c]) => s + c, 0);

  if (total === 0) {
    return {
      title: "Daily summary",
      body: "You haven't used DevForge AI yet today. Ready to dive in?",
    };
  }

  const top = sorted.slice(0, 3);
  const lines = top.map(
    ([f, c]) => `• ${f}: ${c} interaction${c === 1 ? "" : "s"}`,
  );
  return {
    title: "Your day in DevForge AI",
    body: `Total: ${total} interaction${total === 1 ? "" : "s"}.\n${lines.join("\n")}`,
  };
}
