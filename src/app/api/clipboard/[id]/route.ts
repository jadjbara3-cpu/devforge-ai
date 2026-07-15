/**
 * GET    /api/clipboard/[id]  — fetch a single item
 * DELETE /api/clipboard/[id]  — delete a single item
 * PATCH  /api/clipboard/[id]  — update (pin/category) — body: { pinned?, category? }
 */

import { NextResponse } from "next/server";

import {
  getClipboardItem,
  deleteClipboardItem,
  updateClipboardItem,
  type ClipboardCategory,
} from "@/lib/clipboard-store";

export const dynamic = "force-dynamic";

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

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json(
        { error: "A valid id is required." },
        { status: 400 },
      );
    }
    const item = await getClipboardItem(id);
    if (!item) {
      return NextResponse.json({ error: "Not found." }, { status: 404 });
    }
    return NextResponse.json({ item });
  } catch (err) {
    console.error("[clipboard/[id]] GET failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Server error." },
      { status: 500 },
    );
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json(
        { error: "A valid id is required." },
        { status: 400 },
      );
    }
    const ok = await deleteClipboardItem(id);
    if (!ok) {
      return NextResponse.json({ error: "Not found." }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[clipboard/[id]] DELETE failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Server error." },
      { status: 500 },
    );
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json(
        { error: "A valid id is required." },
        { status: 400 },
      );
    }

    const body = (await req.json().catch(() => null)) as {
      pinned?: unknown;
      category?: unknown;
    } | null;
    if (!body) {
      return NextResponse.json(
        { error: "Invalid JSON body." },
        { status: 400 },
      );
    }

    const patch: { pinned?: boolean; category?: ClipboardCategory } = {};
    if (typeof body.pinned === "boolean") patch.pinned = body.pinned;
    if (
      typeof body.category === "string" &&
      (CATEGORIES as string[]).includes(body.category)
    ) {
      patch.category = body.category as ClipboardCategory;
    }

    if (Object.keys(patch).length === 0) {
      return NextResponse.json(
        { error: "No updatable fields provided." },
        { status: 400 },
      );
    }

    const item = await updateClipboardItem(id, patch);
    if (!item) {
      return NextResponse.json({ error: "Not found." }, { status: 404 });
    }
    return NextResponse.json({ item });
  } catch (err) {
    console.error("[clipboard/[id]] PATCH failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Server error." },
      { status: 500 },
    );
  }
}
