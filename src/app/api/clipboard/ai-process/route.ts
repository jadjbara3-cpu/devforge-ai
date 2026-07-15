/**
 * POST /api/clipboard/ai-process
 *
 * "Paste with AI" — applies an AI transform to a clipboard item.
 *
 * Body: { id?: string, content?: string, op: "translate"|"summarize"|"format"|"grammar", target?: string }
 *   - If `id` is provided we load the content from the DB; else use `content`.
 *   - op = "translate" → translate to `target` (default "en")
 *   - op = "summarize" → 3-bullet summary
 *   - op = "format"    → clean up formatting (whitespace, line breaks)
 *   - op = "grammar"   → fix grammar & spelling, preserve meaning
 *
 * Returns: { result: string, model: string, op: string }
 */

import { NextResponse, type NextRequest } from "next/server";
import type { OpenAI } from "openai";

import {
  getChatClient,
  ProviderNotConfiguredError,
  type ChatSlot,
} from "@/lib/ai-providers";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Op = "translate" | "summarize" | "format" | "grammar";

interface ProcessBody {
  id?: unknown;
  content?: unknown;
  op?: unknown;
  target?: unknown;
}

const TARGETS: Record<string, string> = {
  en: "English",
  ar: "Arabic",
  fr: "French",
  es: "Spanish",
  de: "German",
  it: "Italian",
  pt: "Portuguese",
  ru: "Russian",
  zh: "Chinese",
  ja: "Japanese",
};

const SYSTEM_PROMPTS: Record<Op, string> = {
  translate:
    "You are a professional translator. Translate the user's text faithfully. Output ONLY the translation — no commentary, no quotes, no markdown.",
  summarize:
    "You are a precise summarizer. Produce exactly 3 concise bullet points (using • prefix) that capture the essential information. No preamble.",
  format:
    "You are a text formatter. Clean up whitespace, normalize line breaks, fix indentation, and tidy punctuation. Preserve all content. Output ONLY the cleaned text.",
  grammar:
    "You are an expert proofreader. Fix grammar, spelling, and punctuation. Preserve the original meaning, tone, and language. Output ONLY the corrected text.",
};

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => null)) as ProcessBody | null;
    if (!body) {
      return NextResponse.json(
        { error: "Invalid JSON body." },
        { status: 400 },
      );
    }

    const op = body.op as Op;
    if (
      op !== "translate" &&
      op !== "summarize" &&
      op !== "format" &&
      op !== "grammar"
    ) {
      return NextResponse.json(
        { error: "'op' must be one of: translate, summarize, format, grammar." },
        { status: 400 },
      );
    }

    // Resolve content — from DB if id given, else from body.
    let content = "";
    if (typeof body.id === "string" && body.id.trim()) {
      const row = await db.clipboardItem.findUnique({
        where: { id: body.id },
        select: { content: true, kind: true },
      });
      if (!row) {
        return NextResponse.json(
          { error: "Clipboard item not found." },
          { status: 404 },
        );
      }
      if (row.kind === "image") {
        return NextResponse.json(
          { error: "AI processing is text-only for now." },
          { status: 400 },
        );
      }
      content = row.content;
    } else if (typeof body.content === "string") {
      content = body.content;
    }

    if (!content.trim()) {
      return NextResponse.json(
        { error: "No text content to process." },
        { status: 400 },
      );
    }

    // Resolve target language for translate.
    const targetCode =
      typeof body.target === "string" && TARGETS[body.target]
        ? body.target
        : "en";
    const targetName = TARGETS[targetCode];

    // Use the "agents" slot for format/grammar (cheap) and "complex" for
    // translate/summarize (better at nuance).
    const slot: ChatSlot =
      op === "translate" || op === "summarize" ? "complex" : "agents";

    let resolved: {
      client: OpenAI;
      config: {
        model: string;
        temperature: number | null;
        maxTokens: number | null;
      };
    };
    try {
      resolved = await getChatClient(slot);
    } catch (err) {
      if (err instanceof ProviderNotConfiguredError) {
        return NextResponse.json(
          { error: err.message, code: "PROVIDER_NOT_CONFIGURED" },
          { status: 503 },
        );
      }
      throw err;
    }

    const { client, config } = resolved;

    const userMessage =
      op === "translate"
        ? `Translate the following text into ${targetName}:\n\n${content}`
        : `Process the following text:\n\n${content}`;

    try {
      const completion = await client.chat.completions.create({
        model: config.model,
        messages: [
          { role: "system", content: SYSTEM_PROMPTS[op] },
          { role: "user", content: userMessage },
        ],
        ...(typeof config.temperature === "number"
          ? {
              temperature:
                op === "format" || op === "grammar" ? 0.2 : config.temperature,
            }
          : {}),
        ...(typeof config.maxTokens === "number"
          ? { max_tokens: config.maxTokens }
          : {}),
      });

      const result =
        completion.choices?.[0]?.message?.content?.toString().trim() || "";

      if (!result) {
        return NextResponse.json(
          { error: "The model returned an empty result." },
          { status: 502 },
        );
      }

      return NextResponse.json({ result, model: config.model, op });
    } catch (llmErr) {
      console.error("[clipboard/ai-process] LLM call failed:", llmErr);
      const message =
        llmErr instanceof Error
          ? llmErr.message
          : "The AI model failed to respond.";
      return NextResponse.json(
        { error: message, code: "LLM_CALL_FAILED" },
        { status: 502 },
      );
    }
  } catch (err) {
    console.error("[clipboard/ai-process] POST failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Server error." },
      { status: 500 },
    );
  }
}
