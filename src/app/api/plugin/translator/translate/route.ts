/**
 * Plugin API route: POST /api/plugin/translator/translate
 * --------------------------------------------------------
 * Translates `text` from `source` language to `target` language using the
 * "agents" chat slot (no history is persisted — this is a one-shot call).
 *
 * Body: { text: string, source: string, target: string }
 * 200:  { translation: string, model: string }
 * 400:  { error: string }
 * 503:  { error: string, code: "PROVIDER_NOT_CONFIGURED" }
 */

import { NextResponse, type NextRequest } from "next/server";

import {
  getChatClient,
  ProviderNotConfiguredError,
} from "@/lib/ai-providers";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface TranslateBody {
  text?: unknown;
  source?: unknown;
  target?: unknown;
}

const LANGS: Record<string, string> = {
  auto: "auto-detect",
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
  ko: "Korean",
  hi: "Hindi",
  tr: "Turkish",
  nl: "Dutch",
  pl: "Polish",
  sv: "Swedish",
  he: "Hebrew",
  fa: "Persian",
  ur: "Urdu",
};

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as TranslateBody | null;

  if (!body || typeof body.text !== "string" || !body.text.trim()) {
    return NextResponse.json(
      { error: "A non-empty 'text' string is required." },
      { status: 400 },
    );
  }

  const text = body.text.trim();
  const source =
    typeof body.source === "string" && LANGS[body.source]
      ? body.source
      : "auto";
  const target =
    typeof body.target === "string" && LANGS[body.target] ? body.target : "en";

  if (source === target && source !== "auto") {
    return NextResponse.json(
      { error: "Source and target languages must differ." },
      { status: 400 },
    );
  }

  let resolved: Awaited<ReturnType<typeof getChatClient>>;
  try {
    resolved = await getChatClient("agents");
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

  const system = [
    "You are a professional translator.",
    "Translate the user's text faithfully, preserving tone, numbers, and code.",
    "Output ONLY the translation — no commentary, no quotes, no markdown.",
  ].join(" ");

  const userMsg =
    source === "auto"
      ? `Translate the following text into ${LANGS[target]}:\n\n${text}`
      : `Translate the following text from ${LANGS[source]} into ${LANGS[target]}:\n\n${text}`;

  try {
    const completion = await client.chat.completions.create({
      model: config.model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: userMsg },
      ],
      ...(typeof config.temperature === "number"
        ? { temperature: config.temperature }
        : {}),
      ...(typeof config.maxTokens === "number"
        ? { max_tokens: config.maxTokens }
        : {}),
    });
    const translation = completion.choices?.[0]?.message?.content ?? "";
    return NextResponse.json({
      translation: translation.trim(),
      model: config.model,
    });
  } catch (err) {
    const msg =
      err instanceof Error
        ? err.message
        : "The AI model failed to respond.";
    return NextResponse.json(
      { error: msg, code: "LLM_CALL_FAILED" },
      { status: 502 },
    );
  }
}
