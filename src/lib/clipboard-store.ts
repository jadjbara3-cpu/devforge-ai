/**
 * Smart Clipboard Manager — storage + categorization layer.
 *
 * This module sits between the API routes and Prisma. It:
 *   - Normalizes incoming clipboard payloads (text / image data-URL / URL).
 *   - Auto-categorizes items using lightweight local heuristics so we don't
 *     burn an LLM call on every clipboard poll. The AI auto-categorizer in
 *     `app/api/clipboard/ai-process/route.ts` can later refine the category.
 *   - Trims the history to the most recent N items (configurable, default 100).
 *   - Computes the next expiry timestamp from a TTL setting.
 */

import { db } from "@/lib/db";

/** Maximum items kept in the history (oldest non-pinned get evicted first). */
export const DEFAULT_MAX_ITEMS = 100;
/** Default TTL in ms (7 days). 0 means never expire. */
export const DEFAULT_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export type ClipboardKind = "text" | "image" | "url";

export type ClipboardCategory =
  | "code"
  | "url"
  | "text"
  | "email"
  | "phone"
  | "address"
  | "json"
  | "snippet"
  | "image"
  | "other";

export interface ClipboardItemRow {
  id: string;
  kind: string;
  content: string;
  preview: string;
  category: string;
  pinned: boolean;
  source: string;
  sizeBytes: number;
  expiresAt: Date | null;
  createdAt: Date;
}

export interface SerializedClipboardItem {
  id: string;
  kind: ClipboardKind;
  content: string;
  preview: string;
  category: ClipboardCategory;
  pinned: boolean;
  source: string;
  sizeBytes: number;
  expiresAt: string | null;
  createdAt: string;
}

export function serializeItem(row: ClipboardItemRow): SerializedClipboardItem {
  return {
    id: row.id,
    kind: (row.kind as ClipboardKind) ?? "text",
    content: row.content,
    preview: row.preview,
    category: (row.category as ClipboardCategory) ?? "text",
    pinned: row.pinned,
    source: row.source,
    sizeBytes: row.sizeBytes,
    expiresAt: row.expiresAt ? row.expiresAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Local heuristic categorizer — fast + free, used at insertion time.
// ---------------------------------------------------------------------------

const RE_URL = /^https?:\/\/\S+$/i;
const RE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const RE_PHONE =
  /^(?:\+?\d{1,3}[\s.-]?)?(?:\(?\d{2,4}\)?[\s.-]?)?\d{3,4}[\s.-]?\d{3,4}$/;
const RE_JSON = /^[\[{][\s\S]*[\]}]$/;
const RE_CODE =
  /(\bfunction\b|\bclass\b|\bimport\b|\bconst\b|\bvar\b|\b=>\b|;\s*$|^\s*#|^\s*\/\/|<\?php|<html|<svg|<\w+\s+xmlns)/m;

export function categorizeLocally(
  text: string,
  kind: ClipboardKind,
): ClipboardCategory {
  if (kind === "image") return "image";
  const trimmed = text.trim();
  if (!trimmed) return "text";
  if (RE_URL.test(trimmed)) return "url";
  if (RE_EMAIL.test(trimmed)) return "email";
  if (RE_PHONE.test(trimmed) && trimmed.replace(/\D/g, "").length >= 7) {
    return "phone";
  }
  if (RE_JSON.test(trimmed)) {
    try {
      JSON.parse(trimmed);
      return "json";
    } catch {
      /* fall through */
    }
  }
  if (RE_CODE.test(trimmed)) return "code";
  if (trimmed.split("\n").length >= 3) return "snippet";
  return "text";
}

/** Build a one-line preview (~120 chars) for the list view. */
export function buildPreview(content: string, kind: ClipboardKind): string {
  if (kind === "image") {
    return "[image]";
  }
  const single = content.replace(/\s+/g, " ").trim();
  return single.length > 120 ? single.slice(0, 117) + "…" : single;
}

/** Detect the kind from raw content. */
export function detectKind(content: string): ClipboardKind {
  if (content.startsWith("data:image/")) return "image";
  if (RE_URL.test(content.trim())) return "url";
  return "text";
}

// ---------------------------------------------------------------------------
// Public CRUD helpers
// ---------------------------------------------------------------------------

export interface AddItemInput {
  content: string;
  kind?: ClipboardKind;
  category?: ClipboardCategory;
  source?: string;
  pinned?: boolean;
  ttlMs?: number;
  maxItems?: number;
}

/**
 * Add an item to the clipboard history. Returns the serialized new row.
 *
 * - Deduplicates against the most recent item (same content → no-op).
 * - Computes preview, category, size, expiry.
 * - Trims the history to `maxItems` (default 100), evicting oldest
 *   non-pinned items first.
 */
export async function addClipboardItem(
  input: AddItemInput,
): Promise<SerializedClipboardItem | null> {
  const content = input.content;
  if (!content || !content.trim()) return null;

  const kind = input.kind ?? detectKind(content);
  const category = input.category ?? categorizeLocally(content, kind);
  const preview = buildPreview(content, kind);
  const sizeBytes = Buffer.byteLength(content, "utf8");
  const maxItems = input.maxItems ?? DEFAULT_MAX_ITEMS;
  const ttlMs = input.ttlMs ?? DEFAULT_TTL_MS;
  const expiresAt =
    ttlMs > 0 ? new Date(Date.now() + ttlMs) : null;

  // Deduplicate: if the most-recent non-pinned row has identical content,
  // treat as a no-op (don't pollute the history).
  const last = await db.clipboardItem.findFirst({
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 1,
  });
  if (last && last.content === content) {
    return serializeItem(last as ClipboardItemRow);
  }

  const created = await db.clipboardItem.create({
    data: {
      kind,
      content,
      preview,
      category,
      pinned: input.pinned ?? false,
      source: input.source ?? "clipboard",
      sizeBytes,
      expiresAt,
    },
  });

  // Trim — keep pinned items + the newest non-pinned items up to maxItems.
  const nonPinnedCount = await db.clipboardItem.count({
    where: { pinned: false },
  });
  if (nonPinnedCount > maxItems) {
    const overflow = nonPinnedCount - maxItems;
    const toEvict = await db.clipboardItem.findMany({
      where: { pinned: false },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: overflow,
      select: { id: true },
    });
    if (toEvict.length > 0) {
      await db.clipboardItem.deleteMany({
        where: { id: { in: toEvict.map((r: { id: string }) => r.id) } },
      });
    }
  }

  return serializeItem(created as ClipboardItemRow);
}

export interface ListOptions {
  search?: string;
  category?: ClipboardCategory | "all";
  pinnedOnly?: boolean;
  limit?: number;
}

export async function listClipboardItems(
  opts: ListOptions = {},
): Promise<SerializedClipboardItem[]> {
  const where: Record<string, unknown> = {};
  if (opts.pinnedOnly) where.pinned = true;
  if (opts.category && opts.category !== "all") {
    where.category = opts.category;
  }
  if (opts.search && opts.search.trim()) {
    where.preview = { contains: opts.search.trim() };
  }

  const rows = await db.clipboardItem.findMany({
    where,
    orderBy: [{ pinned: "desc" }, { createdAt: "desc" }, { id: "desc" }],
    take: opts.limit ?? 200,
  });

  return rows.map((r: ClipboardItemRow) => serializeItem(r));
}

export async function getClipboardItem(
  id: string,
): Promise<SerializedClipboardItem | null> {
  const row = await db.clipboardItem.findUnique({ where: { id } });
  return row ? serializeItem(row as ClipboardItemRow) : null;
}

export async function deleteClipboardItem(id: string): Promise<boolean> {
  try {
    await db.clipboardItem.delete({ where: { id } });
    return true;
  } catch {
    return false;
  }
}

export async function clearClipboard(
  opts: { pinnedToo?: boolean } = {},
): Promise<number> {
  const where = opts.pinnedToo ? {} : { pinned: false };
  const result = await db.clipboardItem.deleteMany({ where });
  return result.count;
}

export interface UpdateItemInput {
  pinned?: boolean;
  category?: ClipboardCategory;
}

export async function updateClipboardItem(
  id: string,
  patch: UpdateItemInput,
): Promise<SerializedClipboardItem | null> {
  const data: Record<string, unknown> = {};
  if (patch.pinned !== undefined) data.pinned = patch.pinned;
  if (patch.category !== undefined) data.category = patch.category;
  if (Object.keys(data).length === 0) {
    return getClipboardItem(id);
  }
  try {
    const row = await db.clipboardItem.update({ where: { id }, data });
    return serializeItem(row as ClipboardItemRow);
  } catch {
    return null;
  }
}

/** Remove items whose `expiresAt` has passed. Returns count deleted. */
export async function pruneExpired(): Promise<number> {
  const result = await db.clipboardItem.deleteMany({
    where: { expiresAt: { lt: new Date() } },
  });
  return result.count;
}
