import { NextResponse, type NextRequest } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

import { db } from "@/lib/db";
import { getZai } from "@/lib/zai";

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
 * Returns: { id, url, prompt, size, createdAt }
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

    // 1. Call the ZAI image generation API.
    let base64: string | undefined;
    try {
      const zai = await getZai();
      const response = await zai.images.generations.create({
        prompt,
        size,
      });
      base64 = response.data?.[0]?.base64;
    } catch (genErr) {
      console.error("[images/generate] ZAI call failed:", genErr);
      return NextResponse.json(
        {
          error:
            "The image generation service failed to respond. Please try again in a moment.",
        },
        { status: 502 },
      );
    }

    if (!base64 || !base64.trim()) {
      return NextResponse.json(
        { error: "The image model returned an empty response." },
        { status: 502 },
      );
    }

    // 2. Decode and persist the image to public/generated/.
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

    // 3. Persist metadata in the database.
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
