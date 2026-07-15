import { NextResponse, type NextRequest } from "next/server";

import { updateMemory, deleteMemory } from "@/lib/memory-engine";

export const dynamic = "force-dynamic";

interface UpdateBody {
  type?: unknown;
  content?: unknown;
  importance?: unknown;
  pinned?: unknown;
  source?: unknown;
}

const VALID_TYPES = new Set([
  "fact",
  "preference",
  "pattern",
  "skill",
  "contact",
]);

/**
 * PUT /api/memory/[id]
 * Partially updates a memory. Only fields present in the body are applied.
 */
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json(
        { error: "A valid memory id is required." },
        { status: 400 },
      );
    }

    const body = (await req.json().catch(() => null)) as UpdateBody | null;
    if (!body) {
      return NextResponse.json(
        { error: "Invalid JSON body." },
        { status: 400 },
      );
    }

    if (
      body.type !== undefined &&
      (typeof body.type !== "string" || !VALID_TYPES.has(body.type))
    ) {
      return NextResponse.json(
        { error: "Invalid memory 'type'." },
        { status: 400 },
      );
    }

    const patch: {
      type?: "fact" | "preference" | "pattern" | "skill" | "contact";
      content?: string;
      importance?: number;
      pinned?: boolean;
      source?: "manual" | "extracted" | "observed";
    } = {};

    if (body.type !== undefined) {
      patch.type = body.type as "fact" | "preference" | "pattern" | "skill" | "contact";
    }
    if (body.content !== undefined) {
      if (typeof body.content !== "string" || !body.content.trim()) {
        return NextResponse.json(
          { error: "'content' must be a non-empty string." },
          { status: 400 },
        );
      }
      patch.content = body.content.trim();
    }
    if (body.importance !== undefined) {
      if (typeof body.importance !== "number") {
        return NextResponse.json(
          { error: "'importance' must be a number (0..10)." },
          { status: 400 },
        );
      }
      patch.importance = body.importance;
    }
    if (body.pinned !== undefined) {
      if (typeof body.pinned !== "boolean") {
        return NextResponse.json(
          { error: "'pinned' must be a boolean." },
          { status: 400 },
        );
      }
      patch.pinned = body.pinned;
    }
    if (body.source !== undefined) {
      if (
        body.source !== "manual" &&
        body.source !== "extracted" &&
        body.source !== "observed"
      ) {
        return NextResponse.json(
          { error: "Invalid memory 'source'." },
          { status: 400 },
        );
      }
      patch.source = body.source;
    }

    const updated = await updateMemory(id, patch);
    if (!updated) {
      return NextResponse.json(
        { error: "Memory not found." },
        { status: 404 },
      );
    }

    return NextResponse.json({
      memory: {
        ...updated,
        createdAt: updated.createdAt.toISOString(),
        updatedAt: updated.updatedAt.toISOString(),
      },
    });
  } catch (err) {
    console.error("[api/memory/[id]] PUT failed:", err);
    const message =
      err instanceof Error ? err.message : "Unexpected server error.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * DELETE /api/memory/[id]
 * Deletes a memory. Returns { ok: true } on success, 404 when not found.
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json(
        { error: "A valid memory id is required." },
        { status: 400 },
      );
    }
    const deleted = await deleteMemory(id);
    if (!deleted) {
      return NextResponse.json(
        { error: "Memory not found." },
        { status: 404 },
      );
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[api/memory/[id]] DELETE failed:", err);
    const message =
      err instanceof Error ? err.message : "Unexpected server error.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
