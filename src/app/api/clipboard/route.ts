/**
 * GET  /api/clipboard       — list clipboard history
 * POST /api/clipboard       — add a new item
 * DELETE /api/clipboard     — clear all (non-pinned by default)
 *
 * Body for POST:  { content: string, kind?: "text"|"image"|"url", source?: string, pinned?: boolean }
 * Query for DELETE: ?pinned=1 to also clear pinned items.
 */

import { NextResponse, type NextRequest } from "next/server";

import {
  addClipboardItem,
  listClipboardItems,
  clearClipboard,
  pruneExpired,
  type ClipboardCategory,
  type ClipboardKind,
} from "@/lib/clipboard-store";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const CATEGORIES: ClipboardCategory[] = [
  "code",
  "url",
  "text",
  "email",
  "phone",
  "address",
  "json",
  "snippet",
  "image",
  "other",
];

const KINDS: ClipboardKind[] = ["text", "image", "url"];

interface AddBody {
  content?: unknown;
  kind?: unknown;
  category?: unknown;
  source?: unknown;
  pinned?: unknown;
  ttlMs?: unknown;
}

export async function GET(req: NextRequest) {
  try {
    // Opportunistically prune expired items on each list call.
    await pruneExpired().catch(() => null);

    const url = new URL(req.url);
    const search = url.searchParams.get("search") ?? undefined;
    const categoryParam = url.searchParams.get("category");
    const category =
      categoryParam && (CATEGORIES as string[]).includes(categoryParam)
        ? (categoryParam as ClipboardCategory)
        : "all";
    const pinnedOnly = url.searchParams.get("pinnedOnly") === "1";

    const items = await listClipboardItems({
      search: search ?? undefined,
      category,
      pinnedOnly,
    });

    return NextResponse.json({ items });
  } catch (err) {
    console.error("[clipboard] GET failed:", err);
    const message =
      err instanceof Error ? err.message : "Unexpected server error.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => null)) as AddBody | null;
    if (!body || typeof body.content !== "string" || !body.content.trim()) {
      return NextResponse.json(
        { error: "A non-empty 'content' string is required." },
        { status: 400 },
      );
    }

    const kind: ClipboardKind | undefined =
      typeof body.kind === "string" && (KINDS as string[]).includes(body.kind)
        ? (body.kind as ClipboardKind)
        : undefined;

    const item = await addClipboardItem({
      content: body.content,
      kind,
      source: typeof body.source === "string" ? body.source : undefined,
      pinned: typeof body.pinned === "boolean" ? body.pinned : undefined,
      ttlMs:
        typeof body.ttlMs === "number" && Number.isFinite(body.ttlMs)
          ? body.ttlMs
          : undefined,
    });

    if (!item) {
      return NextResponse.json(
        { error: "Item could not be created (empty content?)." },
        { status: 400 },
      );
    }
    return NextResponse.json({ item }, { status: 201 });
  } catch (err) {
    console.error("[clipboard] POST failed:", err);
    const message =
      err instanceof Error ? err.message : "Unexpected server error.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const pinnedToo = url.searchParams.get("pinned") === "1";
    const count = await clearClipboard({ pinnedToo });
    return NextResponse.json({ ok: true, cleared: count });
  } catch (err) {
    console.error("[clipboard] DELETE failed:", err);
    const message =
      err instanceof Error ? err.message : "Unexpected server error.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
