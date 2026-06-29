import { NextResponse } from "next/server";

import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

interface CreateSnippetBody {
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
 * GET /api/snippets
 *
 * Returns every snippet, newest first.
 * Shape: { snippets: Snippet[] }
 */
export async function GET() {
  try {
    const rows = await db.snippet.findMany({
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    });

    const snippets = rows.map(serialize);
    return NextResponse.json({ snippets });
  } catch (err) {
    console.error("[snippets] GET failed:", err);
    const message =
      err instanceof Error ? err.message : "Unexpected server error.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * POST /api/snippets
 *
 * Body: { title, language?, code, description?, tags?, favorite? }
 * Creates a new snippet. Returns { snippet } with 201 on success.
 * 400 when title or code is missing/empty.
 */
export async function POST(req: Request) {
  try {
    let body: CreateSnippetBody;
    try {
      body = (await req.json()) as CreateSnippetBody;
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON body." },
        { status: 400 },
      );
    }

    const title = isNonEmptyString(body.title) ? body.title.trim() : "";
    const code = isNonEmptyString(body.code) ? body.code : "";
    if (!title || !code) {
      return NextResponse.json(
        {
          error: "Both 'title' and 'code' are required and must be non-empty.",
        },
        { status: 400 },
      );
    }

    const language =
      typeof body.language === "string" && body.language.trim()
        ? body.language.trim()
        : "text";
    const description =
      typeof body.description === "string" ? body.description.trim() : null;
    const tags = typeof body.tags === "string" ? body.tags.trim() : null;
    const favorite = typeof body.favorite === "boolean" ? body.favorite : false;

    const created = await db.snippet.create({
      data: { title, language, code, description, tags, favorite },
    });

    return NextResponse.json(
      { snippet: serialize(created) },
      { status: 201 },
    );
  } catch (err) {
    console.error("[snippets] POST failed:", err);
    const message =
      err instanceof Error ? err.message : "Unexpected server error.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
