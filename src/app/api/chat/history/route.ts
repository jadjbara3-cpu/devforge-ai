import { NextResponse, type NextRequest } from "next/server";

import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

const HISTORY_LIMIT = 50;

export async function GET(req: NextRequest) {
  try {
    const session =
      req.nextUrl.searchParams.get("session")?.trim() || "default";

    const rows = await db.chatMessage.findMany({
      where: { session },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: HISTORY_LIMIT,
    });

    const messages = rows.reverse().map((row) => ({
      id: row.id,
      role: row.role,
      content: row.content,
      createdAt: row.createdAt.toISOString(),
    }));

    return NextResponse.json({ messages, session });
  } catch (err) {
    console.error("[chat] GET /api/chat/history failed:", err);
    const message =
      err instanceof Error ? err.message : "Unexpected server error.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
