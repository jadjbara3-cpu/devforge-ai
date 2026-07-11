import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    // Group by session, count messages, get last activity timestamp.
    const grouped = await db.chatMessage.groupBy({
      by: ["session"],
      _count: { id: true },
      _max: { createdAt: true },
    });

    // For each session, grab the first + last user message for title/preview.
    const sessions = await Promise.all(
      grouped.map(async (g) => {
        const [firstUser, lastUser] = await Promise.all([
          db.chatMessage.findFirst({
            where: { session: g.session, role: "user" },
            orderBy: { createdAt: "asc" },
            select: { content: true },
          }),
          db.chatMessage.findFirst({
            where: { session: g.session, role: "user" },
            orderBy: { createdAt: "desc" },
            select: { content: true },
          }),
        ]);

        const titleText = firstUser?.content || "New conversation";
        const previewText = lastUser?.content || "";

        return {
          id: g.session,
          title:
            titleText.slice(0, 60) + (titleText.length > 60 ? "…" : ""),
          preview:
            previewText.slice(0, 80) + (previewText.length > 80 ? "…" : ""),
          messageCount: g._count.id,
          lastActivity: (g._max.createdAt ?? new Date()).toISOString(),
        };
      }),
    );

    sessions.sort(
      (a, b) => +new Date(b.lastActivity) - +new Date(a.lastActivity)
    );

    return NextResponse.json({ sessions });
  } catch (err) {
    console.error("[chat] GET /api/chat/sessions failed:", err);
    return NextResponse.json({ sessions: [] }, { status: 200 });
  }
}
