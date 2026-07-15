import { NextResponse, type NextRequest } from "next/server";

import {
  extractMemoriesFromConversation,
  persistExtractedFacts,
  listMemories,
} from "@/lib/memory-engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface ExtractBody {
  transcript?: unknown;
  session?: unknown;
  slot?: unknown;
}

/**
 * POST /api/memory/extract
 *
 * Body: { transcript?: string, session?: string, slot?: "agents"|"complex" }
 *
 * If `transcript` is missing but `session` is supplied, the route loads the
 * last 40 messages of that chat session from the DB and builds the
 * transcript itself.
 *
 * Returns { created: number, facts: ExtractedFact[], skipped: number }.
 */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => null)) as ExtractBody | null;
    if (!body) {
      return NextResponse.json(
        { error: "Invalid JSON body." },
        { status: 400 },
      );
    }

    let transcript =
      typeof body.transcript === "string" ? body.transcript : "";

    // If no transcript was supplied but a session was, load it from the DB.
    if (!transcript && typeof body.session === "string" && body.session.trim()) {
      const { db } = await import("@/lib/db");
      const rows = await db.chatMessage.findMany({
        where: { session: body.session.trim() },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        take: 40,
      });
      transcript = rows
        .map((r) => `${r.role.toUpperCase()}: ${r.content}`)
        .join("\n\n");
    }

    if (!transcript.trim()) {
      return NextResponse.json(
        { error: "Nothing to extract — transcript is empty." },
        { status: 400 },
      );
    }

    const slot =
      body.slot === "complex" || body.slot === "agents" ? body.slot : "agents";

    const before = await listMemories();
    const facts = await extractMemoriesFromConversation({ transcript, slot });
    const created = await persistExtractedFacts(facts);

    return NextResponse.json({
      created,
      facts,
      skipped: facts.length - created,
      totalBefore: before.length,
    });
  } catch (err) {
    console.error("[api/memory/extract] POST failed:", err);
    const message =
      err instanceof Error ? err.message : "Unexpected server error.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
