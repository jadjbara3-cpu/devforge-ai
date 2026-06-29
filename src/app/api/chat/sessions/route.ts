import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

interface SessionRow {
  session: string;
  count: bigint;
  lastAt: Date;
  firstUser?: string;
}

export async function GET() {
  try {
    // Group by session, count messages, get last activity timestamp.
    const rows = (await db.chatMessage.groupBy({
      by: ["session"],
      _count: { id: true },
      _max: { createdAt: true },
    })) as unknown as SessionRow[];

    // For each session, grab the first user message as a preview/title.
    const sessions = await Promise.all(
      rows.map(async (r) => {
        const firstUser = await db.chatMessage.findFirst({
          where: { session: r.session, role: "user" },
          orderBy: { createdAt: "asc" },
          select: { content: true },
        });
        const lastUser = await db.chatMessage.findFirst({
          where: { session: r.session, role: "user" },
          orderBy: { createdAt: "desc" },
          select: { content: true },
        });
        return {
          id: r.session,
          title:
            (firstUser?.content || "New conversation").slice(0, 60) +
            ((firstUser?.content?.length ?? 0) > 60 ? "…" : ""),
          preview:
            (lastUser?.content || "").slice(0, 80) +
            ((lastUser?.content?.length ?? 0) > 80 ? "…" : ""),
          messageCount: Number(r._count?.id ?? r.count ?? 0),
          lastActivity: (r._max?.createdAt ?? r.lastAt ?? new Date()).toISOString(),
        };
      })
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
