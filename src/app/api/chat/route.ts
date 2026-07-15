import { NextResponse, type NextRequest } from "next/server";
import type { OpenAI } from "openai";

import { db } from "@/lib/db";
import {
  getChatClient,
  ProviderNotConfiguredError,
  type ChatSlot,
  type ResolvedChatConfig,
} from "@/lib/ai-providers";
import { buildMemoryPromptSection } from "@/lib/memory-engine";
import {
  renderContextForPrompt,
  type UserContext,
} from "@/lib/context-engine";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const SYSTEM_PROMPT_BASE =
  "You are DevForge AI, a helpful senior software engineer assistant. Be concise, technical, and friendly. Use markdown.";

const HISTORY_LIMIT = 20;

type ChatRole = "user" | "assistant" | "system";

interface ChatRequestBody {
  message?: unknown;
  session?: unknown;
  slot?: unknown;
  stream?: unknown;
  /** Optional context snapshot from the client (Context Awareness Engine). */
  context?: unknown;
  /**
   * Whether to inject long-term memories into the system prompt.
   * Defaults to true. The client can disable this via Settings.
   */
  injectMemories?: unknown;
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => null)) as ChatRequestBody | null;

    if (!body || typeof body.message !== "string" || !body.message.trim()) {
      return NextResponse.json(
        { error: "A non-empty 'message' string is required." },
        { status: 400 },
      );
    }

    const message = body.message.trim();
    const session =
      typeof body.session === "string" && body.session.trim()
        ? body.session.trim()
        : "default";
    const slot: ChatSlot =
      body.slot === "complex" || body.slot === "agents" ? body.slot : "agents";
    const stream = body.stream === true;
    const injectMemories = body.injectMemories !== false; // default true

    // Coerce the context payload — the client sends a UserContext object
    // built by /api/context (or an empty stub when context awareness is off).
    const context: UserContext | null =
      body.context && typeof body.context === "object"
        ? (body.context as UserContext)
        : null;

    // 1. Resolve the chat client + config for this slot.
    //    Throws ProviderNotConfiguredError → 503.
    let resolved: { client: OpenAI; config: ResolvedChatConfig } | null = null;
    try {
      resolved = await getChatClient(slot);
    } catch (err) {
      if (err instanceof ProviderNotConfiguredError) {
        return NextResponse.json(
          {
            error: err.message,
            code: err.code,
            slot: err.slot,
          },
          { status: 503 },
        );
      }
      throw err;
    }
    if (!resolved) {
      // Defensive — should never reach here (getChatClient either returns or throws).
      return NextResponse.json(
        { error: "Failed to resolve chat client.", code: "INTERNAL" },
        { status: 500 },
      );
    }
    const { client, config } = resolved;

    // 2. Build the augmented system prompt: base + memory + context.
    //    Memory + context fetches run in parallel to keep latency flat.
    const [memorySection, contextSection] = await Promise.all([
      injectMemories ? buildMemoryPromptSection() : Promise.resolve(""),
      Promise.resolve(context ? renderContextForPrompt(context) : ""),
    ]);
    const systemPrompt = [SYSTEM_PROMPT_BASE, memorySection, contextSection]
      .filter(Boolean)
      .join("\n");

    // 3. Load history. For both paths we keep the existing semantics: the
    //    new user message is appended AFTER the system prompt and BEFORE
    //    the historical messages (legacy behaviour, preserved verbatim).
    const recent = await db.chatMessage.findMany({
      where: { session },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: HISTORY_LIMIT,
    });
    const history = recent.reverse();

    const messages: { role: ChatRole; content: string }[] = [
      { role: "system", content: systemPrompt },
      { role: "user", content: message },
      ...history.map((row) => ({
        role: (row.role === "assistant" || row.role === "system"
          ? row.role
          : "user") as ChatRole,
        content: row.content,
      })),
    ];

    // 4. Dispatch to the streaming (SSE) or non-streaming path.
    if (stream) {
      return await streamChatResponse({
        req,
        client,
        config,
        messages,
        message,
        session,
        slot,
      });
    }

    // -----------------------------------------------------------------------
    // Non-streaming path (backward-compat fallback).
    // -----------------------------------------------------------------------
    let reply: string | undefined;
    try {
      const completion = await client.chat.completions.create({
        model: config.model,
        messages,
        ...(typeof config.temperature === "number"
          ? { temperature: config.temperature }
          : {}),
        ...(typeof config.maxTokens === "number"
          ? { max_tokens: config.maxTokens }
          : {}),
      });
      reply = completion.choices?.[0]?.message?.content ?? undefined;
    } catch (llmErr) {
      // Surface the REAL error from the provider (e.g. "Model Not Exist")
      // so the user can diagnose the bad config — don't mask it.
      console.error(`[chat] LLM call failed (slot=${slot}):`, llmErr);
      const errMessage =
        llmErr instanceof Error
          ? llmErr.message
          : typeof llmErr === "string"
            ? llmErr
            : "The AI model failed to respond.";
      return NextResponse.json(
        {
          error: errMessage,
          code: "LLM_CALL_FAILED",
          slot,
          model: config.model,
        },
        { status: 502 },
      );
    }

    if (!reply || !reply.trim()) {
      return NextResponse.json(
        {
          error: "The model returned an empty response.",
          code: "EMPTY_RESPONSE",
          slot,
          model: config.model,
        },
        { status: 502 },
      );
    }

    // 4. Persist the user message + assistant reply (only on success).
    await db.chatMessage.create({
      data: { role: "user", content: message, session },
    });
    const saved = await db.chatMessage.create({
      data: { role: "assistant", content: reply, session },
    });

    return NextResponse.json({
      reply,
      id: saved.id,
      slot,
      model: config.model,
    });
  } catch (err) {
    console.error("[chat] POST /api/chat failed:", err);
    const message =
      err instanceof Error ? err.message : "Unexpected server error.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// Streaming path — Server-Sent Events (SSE)
// ---------------------------------------------------------------------------
//
// Protocol (one JSON event per `data:` line, terminated by `\n\n`):
//
//   data: {"type":"start","slot":"agents","model":"deepseek-chat"}
//
//   data: {"type":"delta","delta":"Hello"}
//   data: {"type":"delta","delta":", world"}
//   ...
//
//   data: {"type":"done","id":"<db-id>","reply":"Hello, world","aborted":false}
//   data: [DONE]
//
// On mid-stream error:
//   data: {"type":"error","error":"...","code":"LLM_STREAM_FAILED"}
//   data: [DONE]
//
// Persistence rules:
//   - User message is persisted AFTER the LLM stream is created successfully
//     (so a 401 / "Model Not Exist" doesn't leave an orphan row) but BEFORE
//     the first delta is sent to the client (so a mid-stream client disconnect
//     still leaves the user message in the DB).
//   - Assistant message is persisted AFTER the stream completes — even on
//     abort, we save whatever partial text was received so the conversation
//     history stays coherent.

type SSEEvent =
  | { type: "start"; slot: ChatSlot; model: string }
  | { type: "delta"; delta: string }
  | {
      type: "done";
      id: string | null;
      reply: string;
      aborted: boolean;
    }
  | { type: "error"; error: string; code: string };

async function streamChatResponse({
  req,
  client,
  config,
  messages,
  message,
  session,
  slot,
}: {
  req: NextRequest;
  client: OpenAI;
  config: ResolvedChatConfig;
  messages: { role: ChatRole; content: string }[];
  message: string;
  session: string;
  slot: ChatSlot;
}): Promise<Response> {
  const encoder = new TextEncoder();

  const encode = (event: SSEEvent): Uint8Array =>
    encoder.encode(`data: ${JSON.stringify(event)}\n\n`);

  // 1. Initiate the LLM stream first. If this throws (bad model, 401, 400,
  //    etc.), we return a regular JSON error — NO SSE, NO orphan user row.
  //    The OpenAI SDK rejects `create()` synchronously for HTTP-level errors.
  let llmStream: AsyncIterable<{
    choices?: Array<{ delta?: { content?: string | null } }>;
  }>;
  try {
    const s = await client.chat.completions.create(
      {
        model: config.model,
        messages,
        stream: true,
        ...(typeof config.temperature === "number"
          ? { temperature: config.temperature }
          : {}),
        ...(typeof config.maxTokens === "number"
          ? { max_tokens: config.maxTokens }
          : {}),
      },
      { signal: req.signal },
    );
    llmStream = s as AsyncIterable<{
      choices?: Array<{ delta?: { content?: string | null } }>;
    }>;
  } catch (llmErr) {
    console.error(
      `[chat] streaming LLM call failed to start (slot=${slot}):`,
      llmErr,
    );
    const errMessage =
      llmErr instanceof Error
        ? llmErr.message
        : typeof llmErr === "string"
          ? llmErr
          : "The AI model failed to respond.";
    return NextResponse.json(
      {
        error: errMessage,
        code: "LLM_CALL_FAILED",
        slot,
        model: config.model,
      },
      { status: 502 },
    );
  }

  // 2. LLM stream is alive — persist the user message BEFORE sending any
  //    chunks. This guarantees the user message survives a mid-stream
  //    client disconnect.
  await db.chatMessage.create({
    data: { role: "user", content: message, session },
  });

  let fullReply = "";

  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      let streamError: string | null = null;
      let wasAborted = false;
      let closed = false;

      const safeEnqueue = (chunk: Uint8Array): boolean => {
        if (closed) return false;
        try {
          controller.enqueue(chunk);
          return true;
        } catch {
          // Stream was cancelled (client disconnect) — stop trying to write.
          closed = true;
          return false;
        }
      };

      const safeClose = () => {
        if (closed) return;
        closed = true;
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      };

      safeEnqueue(encode({ type: "start", slot, model: config.model }));

      // 3. Iterate the stream chunks and forward each content delta.
      try {
        for await (const chunk of llmStream) {
          const delta = chunk.choices?.[0]?.delta?.content ?? "";
          if (delta) {
            fullReply += delta;
            if (!safeEnqueue(encode({ type: "delta", delta }))) {
              // Client already disconnected — stop iterating.
              break;
            }
          }
        }
      } catch (err) {
        const isAbort =
          err instanceof Error &&
          (err.name === "AbortError" || /abort/i.test(err.message));
        if (isAbort) {
          wasAborted = true;
        } else {
          console.error(
            `[chat] streaming chunk iteration failed (slot=${slot}):`,
            err,
          );
          streamError =
            err instanceof Error
              ? err.message
              : "The AI model failed mid-stream.";
        }
      }

      // 4. Persist the assistant message AFTER the stream completes —
      //    even on abort, save the partial text so the conversation
      //    history remains coherent.
      let savedAssistantId: string | null = null;
      if (fullReply.trim()) {
        try {
          const saved = await db.chatMessage.create({
            data: { role: "assistant", content: fullReply, session },
          });
          savedAssistantId = saved.id;
        } catch (dbErr) {
          console.error(
            "[chat] failed to persist assistant message after stream:",
            dbErr,
          );
        }
      }

      // 5. Send the terminal event. If the client is gone, these enqueues
      //    are no-ops (safeEnqueue / safeClose swallow the error).
      if (streamError) {
        safeEnqueue(
          encode({
            type: "error",
            error: streamError,
            code: "LLM_STREAM_FAILED",
          }),
        );
      } else {
        safeEnqueue(
          encode({
            type: "done",
            id: savedAssistantId,
            reply: fullReply,
            aborted: wasAborted,
          }),
        );
      }
      safeEnqueue(encoder.encode("data: [DONE]\n\n"));
      safeClose();
    },
    cancel() {
      // Client disconnected — nothing to do here; the for-await loop above
      // will throw an AbortError which we handle in the catch block.
    },
  });

  return new Response(body, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      // Hint to reverse proxies (nginx, Cloudflare, etc.) to disable
      // buffering so chunks reach the client immediately.
      "X-Accel-Buffering": "no",
    },
  });
}
