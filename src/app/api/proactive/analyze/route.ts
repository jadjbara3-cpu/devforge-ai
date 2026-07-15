/**
 * POST /api/proactive/analyze
 *
 * Analyzes a screenshot (data-URL or uploaded File) using the "complex"
 * (vision-capable) slot. Returns the AI's interpretation of:
 *   - what app/website the user is in
 *   - what they're doing
 *   - how the AI can help
 *
 * Body: { image: <dataUrl>, hint?: string }
 *   - image: a data:image/* URL (the client pastes / drops the screenshot)
 *   - hint:  optional text hint ("I was working on...")
 *
 * On success, also creates a ProactiveSuggestion row with kind="offer".
 *
 * Returns: { analysis: string, suggestion: { id, title, body } }
 */

import { NextResponse, type NextRequest } from "next/server";
import type { OpenAI } from "openai";

import {
  getChatClient,
  ProviderNotConfiguredError,
} from "@/lib/ai-providers";
import { createSuggestion } from "@/lib/proactive-engine";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface AnalyzeBody {
  image?: unknown;
  hint?: unknown;
}

const SYSTEM_PROMPT = [
  "You are a proactive AI assistant inside DevForge AI. The user has shared a",
  "screenshot of their current screen. Analyze it and respond with THREE short",
  "sections, each on its own line, prefixed with the labels:",
  "",
  "APP: <what app or website this is — 1 short phrase>",
  "DOING: <what the user appears to be doing — 1 short phrase>",
  "HELP: <a single concrete offer of help — phrased as a friendly question>",
  "",
  "Be concise. No markdown. No preamble.",
].join("\n");

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => null)) as AnalyzeBody | null;
    if (!body || typeof body.image !== "string") {
      return NextResponse.json(
        { error: "A 'image' data URL is required." },
        { status: 400 },
      );
    }

    const dataUrl = body.image;
    if (!dataUrl.startsWith("data:image/")) {
      return NextResponse.json(
        { error: "'image' must be a data:image/* URL." },
        { status: 400 },
      );
    }

    const hint =
      typeof body.hint === "string" && body.hint.trim()
        ? `\nUser hint: ${body.hint.trim()}`
        : "";

    let resolved: { client: OpenAI; config: { model: string; temperature: number | null; maxTokens: number | null } };
    try {
      resolved = await getChatClient("complex");
    } catch (err) {
      if (err instanceof ProviderNotConfiguredError) {
        return NextResponse.json(
          {
            error:
              "Vision analysis requires the Complex model to be configured.",
            code: "PROVIDER_NOT_CONFIGURED",
          },
          { status: 503 },
        );
      }
      throw err;
    }

    const { client, config } = resolved;

    try {
      const completion = await client.chat.completions.create({
        model: config.model,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `Analyze this screenshot and tell me how I can help.${hint}`,
              },
              { type: "image_url", image_url: { url: dataUrl } },
            ],
          },
        ],
        ...(typeof config.temperature === "number"
          ? { temperature: config.temperature }
          : {}),
        ...(typeof config.maxTokens === "number"
          ? { max_tokens: config.maxTokens }
          : {}),
      });

      const analysis =
        completion.choices?.[0]?.message?.content?.toString().trim() || "";

      // Parse the three labeled lines.
      const lines = analysis.split("\n").map((l) => l.trim()).filter(Boolean);
      const appLine = lines.find((l) => /^APP:/i.test(l))?.replace(/^APP:\s*/i, "") ?? "";
      const doingLine = lines.find((l) => /^DOING:/i.test(l))?.replace(/^DOING:\s*/i, "") ?? "";
      const helpLine = lines.find((l) => /^HELP:/i.test(l))?.replace(/^HELP:\s*/i, "") ?? "";

      // Create a suggestion row.
      const suggestion = await createSuggestion({
        kind: "offer",
        title: appLine || "Proactive offer",
        body: doingLine
          ? `I see you're ${doingLine.toLowerCase()}. ${helpLine}`.trim()
          : helpLine || analysis,
        action: "open",
        context: { source: "screenshot-analysis" },
      });

      return NextResponse.json({
        analysis,
        parsed: { app: appLine, doing: doingLine, help: helpLine },
        suggestion,
      });
    } catch (llmErr) {
      console.error("[proactive/analyze] LLM call failed:", llmErr);
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
    console.error("[proactive/analyze] POST failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Server error." },
      { status: 500 },
    );
  }
}
