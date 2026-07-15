import { NextResponse, type NextRequest } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

import { db } from "@/lib/db";
import {
  getZaiClient,
  getChatClient,
  ProviderNotConfiguredError,
} from "@/lib/ai-providers";

// Image generation is CPU/IO bound and writes to disk; use the Node runtime.
export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

const SUPPORTED_SIZES = [
  "1024x1024",
  "768x1344",
  "864x1152",
  "1344x768",
  "1152x864",
  "1440x720",
  "720x1440",
] as const;

const DEFAULT_SIZE = "1024x1024";

// DALL-E 3 only supports these three sizes — used when we fall back to the
// OpenAI "complex" slot's image endpoint.
const DALLE3_SIZES = new Set(["1024x1024", "1792x1024", "1024x1792"]);

type SupportedSize = (typeof SUPPORTED_SIZES)[number];

function isSupportedSize(value: unknown): value is SupportedSize {
  return (
    typeof value === "string" &&
    (SUPPORTED_SIZES as readonly string[]).includes(value)
  );
}

/**
 * POST /api/images/generate
 *
 * Body: { prompt: string, size?: string }
 *
 * Strategy:
 *   1. Try Z.ai specialty service (slot "image") — best for Z.ai users.
 *   2. Fall back to OpenAI DALL-E 3 via the "complex" slot.
 *   3. If neither is configured → 501 with a helpful message.
 */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => null)) as
      | { prompt?: unknown; size?: unknown }
      | null;

    if (!body || typeof body.prompt !== "string" || !body.prompt.trim()) {
      return NextResponse.json(
        { error: "A non-empty 'prompt' string is required." },
        { status: 400 },
      );
    }

    const prompt = body.prompt.trim();
    const size = isSupportedSize(body.size) ? body.size : DEFAULT_SIZE;

    // 1. Try Z.ai specialty (returns base64).
    let base64: string | undefined;
    try {
      const { client, enabled } = await getZaiClient("image");
      if (enabled && client) {
        const response = await client.images.generations.create({
          prompt,
          size,
        });
        base64 = response.data?.[0]?.base64;
      }
    } catch (zaiErr) {
      console.warn("[images/generate] Z.ai specialty failed, trying fallback:", zaiErr instanceof Error ? zaiErr.message : zaiErr);
      base64 = undefined;
    }

    // 2. Fall back to OpenAI DALL-E 3 via the "complex" slot.
    if (!base64) {
      try {
        const { client, config } = await getChatClient("complex");
        const dalleSize = DALLE3_SIZES.has(size) ? size : "1024x1024";
        const response = await client.images.generate({
          model: "dall-e-3",
          prompt,
          n: 1,
          size: dalleSize as "1024x1024" | "1792x1024" | "1024x1792",
          response_format: "b64_json",
        });
        base64 = response.data?.[0]?.b64_json ?? undefined;
        if (base64) {
          console.info(`[images/generate] using OpenAI DALL-E 3 via complex slot (${config.model} parent).`);
        }
      } catch (err) {
        if (err instanceof ProviderNotConfiguredError) {
          return NextResponse.json(
            {
              error:
                "Image generation is not configured. Enable the Z.ai specialty 'image' service, OR set the Complex tasks model slot to an OpenAI-compatible provider that supports dall-e-3.",
              code: "IMAGE_NOT_CONFIGURED",
            },
            { status: 501 },
          );
        }
        console.error("[images/generate] OpenAI DALL-E fallback failed:", err);
        const message =
          err instanceof Error ? err.message : "Image generation failed.";
        return NextResponse.json(
          { error: message, code: "IMAGE_FAILED" },
          { status: 502 },
        );
      }
    }

    if (!base64 || !base64.trim()) {
      return NextResponse.json(
        {
          error:
            "The image model returned an empty response. Try a different prompt or provider.",
          code: "IMAGE_EMPTY",
        },
        { status: 502 },
      );
    }

    // 3. Decode and persist the image to public/generated/.
    const buffer = Buffer.from(base64, "base64");
    const filename = `${crypto.randomUUID()}.png`;
    const publicDir = path.join(process.cwd(), "public", "generated");
    const filePath = path.join(publicDir, filename);

    try {
      // Ensure the directory exists (idempotent — the dir usually already exists).
      await fs.mkdir(publicDir, { recursive: true });
      await fs.writeFile(filePath, buffer);
    } catch (writeErr) {
      console.error("[images/generate] file write failed:", writeErr);
      return NextResponse.json(
        { error: "Failed to save the generated image to disk." },
        { status: 500 },
      );
    }

    const url = `/generated/${filename}`;

    // 4. Persist metadata in the database.
    const saved = await db.generatedImage.create({
      data: { prompt, url, size },
    });

    return NextResponse.json({
      id: saved.id,
      url,
      prompt,
      size,
      createdAt: saved.createdAt,
    });
  } catch (err) {
    console.error("[images/generate] POST failed:", err);
    const message =
      err instanceof Error ? err.message : "Unexpected server error.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
