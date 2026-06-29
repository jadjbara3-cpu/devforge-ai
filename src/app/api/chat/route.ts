import { NextResponse, type NextRequest } from "next/server";

import { db } from "@/lib/db";
import { getZai } from "@/lib/zai";

export const dynamic = "force-dynamic";

const SYSTEM_PROMPT =
  "You are DevForge AI, a helpful senior software engineer assistant. Be concise, technical, and friendly. Use markdown.";

const HISTORY_LIMIT = 20;

type ChatRole = "user" | "assistant" | "system";

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => null)) as
      | { message?: unknown; session?: unknown }
      | null;

    if (!body || typeof body.message !== "string" || !body.message.trim()) {
      return NextResponse.json(
        { error: "A non-empty 'message' string is required." },
        { status: 400 }
      );
    }

    const message = body.message.trim();
    const session =
      typeof body.session === "string" && body.session.trim()
        ? body.session.trim()
        : "default";

    // 1. Persist the user message first so it is included in the history window.
    await db.chatMessage.create({
      data: { role: "user", content: message, session },
    });

    // 2. Load the last N messages for this session (most recent last).
    const recent = await db.chatMessage.findMany({
      where: { session },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: HISTORY_LIMIT,
    });
    const history = recent.reverse();

    const messages: { role: ChatRole; content: string }[] = [
      { role: "system", content: SYSTEM_PROMPT },
      ...history.map((row) => ({
        role: (row.role === "assistant" || row.role === "system"
          ? row.role
          : "user") as ChatRole,
        content: row.content,
      })),
    ];

    // 3. Call the LLM.
    let reply: string | undefined;
    try {
      const zai = await getZai();
      const completion = await zai.chat.completions.create({
        messages,
        thinking: { type: "disabled" },
      });
      reply = completion.choices[0]?.message?.content;
    } catch (llmErr) {
      console.error("[chat] LLM call failed:", llmErr);
      return NextResponse.json(
        {
          error:
            "The AI model failed to respond. Please try again in a moment.",
        },
        { status: 502 }
      );
    }

    if (!reply || !reply.trim()) {
      return NextResponse.json(
        { error: "The model returned an empty response." },
        { status: 502 }
      );
    }

    // 4. Persist the assistant reply.
    const saved = await db.chatMessage.create({
      data: { role: "assistant", content: reply, session },
    });

    return NextResponse.json({ reply, id: saved.id });
  } catch (err) {
    console.error("[chat] POST /api/chat failed:", err);
    const message =
      err instanceof Error ? err.message : "Unexpected server error.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
