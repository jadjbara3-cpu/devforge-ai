import { NextRequest, NextResponse } from "next/server";
import type { OpenAI } from "openai";

import {
  getChatClient,
  ProviderNotConfiguredError,
  type ResolvedChatConfig,
} from "@/lib/ai-providers";

// Vision analysis runs through the Node.js runtime (Buffer + form parsing).
export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * POST /api/vision/analyze
 *
 * Accepts either:
 *  - multipart/form-data with fields `image` (File) and `question` (string)
 *  - JSON `{ image: <dataUrl>, question: string }`
 *
 * Uses the "complex" slot (strong / vision-capable model) via the OpenAI
 * SDK's standard vision format: messages with `image_url` content parts.
 * NO `thinking` field — that is a Z.ai-only extension that breaks DeepSeek.
 *
 * Returns `{ reply: string }` on success, `{ error: string, code? }` on failure.
 */
export async function POST(req: NextRequest) {
  try {
    let dataUrl: string | null = null;
    let question: string | null = null;

    const contentType = req.headers.get("content-type") || "";

    if (contentType.includes("multipart/form-data")) {
      const fd = await req.formData();
      const imageField = fd.get("image");
      question = (fd.get("question") as string | null) ?? "";

      if (imageField instanceof File) {
        if (!imageField.type.startsWith("image/")) {
          return NextResponse.json(
            { error: "Uploaded file is not an image." },
            { status: 400 },
          );
        }
        const buf = Buffer.from(await imageField.arrayBuffer());
        dataUrl = `data:${imageField.type};base64,${buf.toString("base64")}`;
      } else if (typeof imageField === "string" && imageField.startsWith("data:image/")) {
        // Already a data URL passed through FormData.
        dataUrl = imageField;
      }
    } else if (contentType.includes("application/json")) {
      const body = await req.json().catch(() => ({}));
      question = typeof body.question === "string" ? body.question : "";
      if (typeof body.image === "string") {
        dataUrl = body.image;
      }
    } else {
      return NextResponse.json(
        { error: "Unsupported content type. Use multipart/form-data or application/json." },
        { status: 415 },
      );
    }

    if (!dataUrl || !dataUrl.startsWith("data:image/")) {
      return NextResponse.json(
        { error: "A valid image is required (data:image/* URL or image file)." },
        { status: 400 },
      );
    }
    if (!question || !question.trim()) {
      return NextResponse.json(
        { error: "A question is required." },
        { status: 400 },
      );
    }

    // Resolve the "complex" slot — must be a vision-capable model.
    let resolved: { client: OpenAI; config: ResolvedChatConfig } | null = null;
    try {
      resolved = await getChatClient("complex");
    } catch (err) {
      if (err instanceof ProviderNotConfiguredError) {
        return NextResponse.json(
          {
            error:
              "Vision requires the Complex tasks model to be configured. Open Settings → AI Provider to add one.",
            code: err.code,
            slot: err.slot,
          },
          { status: 503 },
        );
      }
      throw err;
    }
    if (!resolved) {
      return NextResponse.json(
        { error: "Failed to resolve vision model.", code: "INTERNAL" },
        { status: 500 },
      );
    }
    const { client, config } = resolved;

    // Standard OpenAI vision format. Works with GPT-4o, Claude (via OpenAI-
    // compatible proxy), GLM-4V, Qwen-VL, etc.
    const completion = await client.chat.completions.create({
      model: config.model,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: question.trim() },
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

    const reply =
      completion.choices?.[0]?.message?.content?.toString().trim() ||
      "I couldn't produce an analysis for that image. Please try a different question or image.";

    return NextResponse.json({ reply, model: config.model });
  } catch (err) {
    console.error("[api/vision/analyze] error:", err);
    const message =
      err instanceof Error
        ? err.message
        : "Failed to analyze image. Please try again.";
    return NextResponse.json(
      { error: message, code: "VISION_FAILED" },
      { status: 502 },
    );
  }
}
