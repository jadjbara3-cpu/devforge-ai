import { NextResponse } from "next/server";

import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

interface UpdateSnippetBody {
  title?: unknown;
  language?: unknown;
  code?: unknown;
  description?: unknown;
  tags?: unknown;
  favorite?: unknown;
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

function serialize(s: {
  id: string;
  title: string;
  language: string;
  code: string;
  description: string | null;
  tags: string | null;
  favorite: boolean;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    ...s,
    createdAt: s.createdAt.toISOString(),
    updatedAt: s.updatedAt.toISOString(),
  };
}

/**
 * PUT /api/snippets/[id]
 *
 * Partially updates a snippet. Only fields present in the body are applied.
 * Returns { snippet } on success, 404 when the id does not exist.
 */
export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json(
        { error: "A valid snippet id is required." },
        { status: 400 },
      );
    }

    let body: UpdateSnippetBody;
    try {
      body = (await req.json()) as UpdateSnippetBody;
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON body." },
        { status: 400 },
      );
    }

    const existing = await db.snippet.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { error: "Snippet not found." },
        { status: 404 },
      );
    }

    const data: Record<string, unknown> = {};

    if (body.title !== undefined) {
      if (!isNonEmptyString(body.title)) {
        return NextResponse.json(
          { error: "'title' must be a non-empty string." },
          { status: 400 },
        );
      }
      data.title = (body.title as string).trim();
    }
    if (body.code !== undefined) {
      if (!isNonEmptyString(body.code)) {
        return NextResponse.json(
          { error: "'code' must be a non-empty string." },
          { status: 400 },
        );
      }
      data.code = body.code as string;
    }
    if (body.language !== undefined) {
      data.language =
        typeof body.language === "string" && body.language.trim()
          ? (body.language as string).trim()
          : "text";
    }
    if (body.description !== undefined) {
      data.description =
        typeof body.description === "string"
          ? (body.description as string).trim()
          : null;
    }
    if (body.tags !== undefined) {
      data.tags =
        typeof body.tags === "string" ? (body.tags as string).trim() : null;
    }
    if (body.favorite !== undefined) {
      data.favorite =
        typeof body.favorite === "boolean" ? body.favorite : false;
    }

    const updated = await db.snippet.update({ where: { id }, data });
    return NextResponse.json({ snippet: serialize(updated) });
  } catch (err) {
    console.error("[snippets/[id]] PUT failed:", err);
    const message =
      err instanceof Error ? err.message : "Unexpected server error.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * DELETE /api/snippets/[id]
 *
 * Deletes a snippet. Returns { ok: true } on success, 404 when the id does
 * not exist.
 */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json(
        { error: "A valid snippet id is required." },
        { status: 400 },
      );
    }

    const existing = await db.snippet.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { error: "Snippet not found." },
        { status: 404 },
      );
    }

    await db.snippet.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[snippets/[id]] DELETE failed:", err);
    const message =
      err instanceof Error ? err.message : "Unexpected server error.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
