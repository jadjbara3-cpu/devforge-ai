import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * Rename a chat session by updating the `session` field on all its messages.
 * Body: { from: string, to: string }
 * This lets users give a custom name to a conversation.
 */
export async function POST(req: NextRequest) {
  try {
    const { from, to } = (await req.json()) as { from?: string; to?: string };
    if (!from || !to || from.trim() === "" || to.trim() === "") {
      return NextResponse.json(
        { error: "Both 'from' and 'to' are required." },
        { status: 400 }
      );
    }
    if (from === to) {
      return NextResponse.json({ ok: true, renamed: 0 });
    }

    // If target session already exists, we still proceed (merges conversations).
    const result = await db.chatMessage.updateMany({
      where: { session: from },
      data: { session: to },
    });

    return NextResponse.json({ ok: true, renamed: result.count });
  } catch (err) {
    console.error("[chat] rename failed:", err);
    const message =
      err instanceof Error ? err.message : "Unexpected server error.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
