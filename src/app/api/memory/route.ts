import { NextResponse, type NextRequest } from "next/server";

import {
  listMemories,
  createMemory,
  type CreateMemoryInput,
  type MemoryType,
} from "@/lib/memory-engine";

export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// GET /api/memory
// Returns every memory, ordered pinned-first then by importance.
// ---------------------------------------------------------------------------

export async function GET() {
  try {
    const memories = await listMemories();
    return NextResponse.json({
      memories: memories.map((m) => ({
        ...m,
        createdAt: m.createdAt.toISOString(),
        updatedAt: m.updatedAt.toISOString(),
      })),
    });
  } catch (err) {
    console.error("[api/memory] GET failed:", err);
    const message =
      err instanceof Error ? err.message : "Unexpected server error.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// POST /api/memory
// Creates a new memory. Body: { type, content, importance?, pinned?, source? }
// ---------------------------------------------------------------------------

interface CreateBody {
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

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => null)) as CreateBody | null;
    if (!body) {
      return NextResponse.json(
        { error: "Invalid JSON body." },
        { status: 400 },
      );
    }

    if (typeof body.type !== "string" || !VALID_TYPES.has(body.type)) {
      return NextResponse.json(
        {
          error:
            "'type' must be one of: fact, preference, pattern, skill, contact.",
        },
        { status: 400 },
      );
    }

    const content =
      typeof body.content === "string" ? body.content.trim() : "";
    if (!content) {
      return NextResponse.json(
        { error: "'content' must be a non-empty string." },
        { status: 400 },
      );
    }

    const input: CreateMemoryInput = {
      type: body.type as MemoryType,
      content,
      importance: typeof body.importance === "number" ? body.importance : 5,
      pinned: typeof body.pinned === "boolean" ? body.pinned : false,
      source:
        body.source === "manual" ||
        body.source === "extracted" ||
        body.source === "observed"
          ? body.source
          : "manual",
    };

    const created = await createMemory(input);
    return NextResponse.json(
      {
        memory: {
          ...created,
          createdAt: created.createdAt.toISOString(),
          updatedAt: created.updatedAt.toISOString(),
        },
      },
      { status: 201 },
    );
  } catch (err) {
    console.error("[api/memory] POST failed:", err);
    const message =
      err instanceof Error ? err.message : "Unexpected server error.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
