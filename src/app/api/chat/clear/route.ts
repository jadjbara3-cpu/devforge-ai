import { NextResponse, type NextRequest } from "next/server";

import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function DELETE(req: NextRequest) {
  try {
    const session =
      req.nextUrl.searchParams.get("session")?.trim() || "default";

    const result = await db.chatMessage.deleteMany({
      where: { session },
    });

    return NextResponse.json({
      ok: true,
      deleted: result.count,
      session,
    });
  } catch (err) {
    console.error("[chat] DELETE /api/chat/clear failed:", err);
    const message =
      err instanceof Error ? err.message : "Unexpected server error.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
