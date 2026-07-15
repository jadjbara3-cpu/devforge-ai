/**
 * GET  /api/proactive          — list active (non-dismissed) suggestions
 * POST /api/proactive          — update settings OR dismiss/snooze a suggestion
 *
 * POST body (settings):  { action: "settings", settings: ProactiveSettings }
 * POST body (dismiss):   { action: "dismiss", id: string }
 * POST body (snooze):    { action: "snooze", id: string, minutes: number }
 * POST body (track):     { action: "track", feature: string, action?: string }
 *   (the "track" sub-action logs a UserPattern observation)
 *
 * NOTE: settings are persisted client-side (localStorage) because the
 * browser is the only place that knows when the user is actively using
 * the app. This endpoint accepts the settings blob for completeness and
 * echoes them back. Server-side, we only manage suggestions + patterns.
 */

import { NextResponse, type NextRequest } from "next/server";

import {
  listActiveSuggestions,
  dismissSuggestion,
  snoozeSuggestion,
  trackUsage,
  type ProactiveSettings,
  DEFAULT_SETTINGS,
} from "@/lib/proactive-engine";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET() {
  try {
    const suggestions = await listActiveSuggestions();
    return NextResponse.json({ suggestions, defaults: DEFAULT_SETTINGS });
  } catch (err) {
    console.error("[proactive] GET failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Server error." },
      { status: 500 },
    );
  }
}

interface PostBody {
  action?: unknown;
  settings?: unknown;
  id?: unknown;
  minutes?: unknown;
  feature?: unknown;
  actionName?: unknown;
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => null)) as PostBody | null;
    if (!body || typeof body.action !== "string") {
      return NextResponse.json(
        { error: "'action' is required (settings|dismiss|snooze|track)." },
        { status: 400 },
      );
    }

    switch (body.action) {
      case "settings": {
        // We trust the client for these. Just validate types and echo back.
        if (!body.settings || typeof body.settings !== "object") {
          return NextResponse.json(
            { error: "'settings' must be an object." },
            { status: 400 },
          );
        }
        const s = body.settings as Partial<ProactiveSettings>;
        const merged: ProactiveSettings = {
          ...DEFAULT_SETTINGS,
          ...s,
          blockedSites: Array.isArray(s.blockedSites) ? s.blockedSites : [],
        };
        return NextResponse.json({ ok: true, settings: merged });
      }

      case "dismiss": {
        if (typeof body.id !== "string" || !body.id.trim()) {
          return NextResponse.json(
            { error: "'id' is required for dismiss." },
            { status: 400 },
          );
        }
        const ok = await dismissSuggestion(body.id);
        return NextResponse.json({ ok });
      }

      case "snooze": {
        if (typeof body.id !== "string" || !body.id.trim()) {
          return NextResponse.json(
            { error: "'id' is required for snooze." },
            { status: 400 },
          );
        }
        const minutes =
          typeof body.minutes === "number" && Number.isFinite(body.minutes)
            ? Math.max(1, Math.floor(body.minutes))
            : 15;
        const ok = await snoozeSuggestion(body.id, minutes);
        return NextResponse.json({ ok, minutes });
      }

      case "track": {
        if (typeof body.feature !== "string" || !body.feature.trim()) {
          return NextResponse.json(
            { error: "'feature' is required for track." },
            { status: 400 },
          );
        }
        await trackUsage({
          feature: body.feature.trim(),
          action:
            typeof body.actionName === "string" ? body.actionName : undefined,
        });
        return NextResponse.json({ ok: true });
      }

      default:
        return NextResponse.json(
          { error: `Unknown action: ${body.action}` },
          { status: 400 },
        );
    }
  } catch (err) {
    console.error("[proactive] POST failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Server error." },
      { status: 500 },
    );
  }
}
