import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

interface ActivityItem {
  id: string;
  type: "chat" | "snippet" | "image";
  title: string;
  detail: string;
  href: string;
  createdAt: string;
  icon: string;
  url?: string;
}

export async function GET() {
  try {
    const [messages, snippets, images] = await Promise.all([
      db.chatMessage.findMany({
        orderBy: { createdAt: "desc" },
        take: 6,
      }),
      db.snippet.findMany({
        orderBy: { createdAt: "desc" },
        take: 6,
      }),
      db.generatedImage.findMany({
        orderBy: { createdAt: "desc" },
        take: 6,
      }),
    ]);

    const items: ActivityItem[] = [];

    for (const m of messages) {
      items.push({
        id: `chat-${m.id}`,
        type: "chat",
        title: m.role === "user" ? "You asked" : "AI replied",
        detail: m.content.slice(0, 120) + (m.content.length > 120 ? "…" : ""),
        href: "chat",
        createdAt: m.createdAt.toISOString(),
        icon: m.role === "user" ? "user" : "bot",
      });
    }

    for (const s of snippets) {
      items.push({
        id: `snippet-${s.id}`,
        type: "snippet",
        title: `Saved snippet: ${s.title}`,
        detail:
          s.description ||
          `${s.language} · ${s.code.split("\n").length} lines`,
        href: "snippets",
        createdAt: s.createdAt.toISOString(),
        icon: "code",
      });
    }

    for (const img of images) {
      items.push({
        id: `image-${img.id}`,
        type: "image",
        title: "Generated image",
        detail:
          img.prompt.slice(0, 100) + (img.prompt.length > 100 ? "…" : ""),
        href: "image",
        createdAt: img.createdAt.toISOString(),
        icon: "image",
        url: img.url,
      });
    }

    items.sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));

    return NextResponse.json({ items: items.slice(0, 12) });
  } catch (err) {
    console.error("[api/activity] error:", err);
    return NextResponse.json(
      { items: [], error: "Failed to load activity" },
      { status: 500 }
    );
  }
}
