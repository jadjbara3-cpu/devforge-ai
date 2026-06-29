import { NextRequest, NextResponse } from "next/server";
import { getZai } from "@/lib/zai";

// Audio synthesis runs through the Node.js runtime (Buffer handling).
export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

const ALLOWED_VOICES = [
  "tongtong",
  "chuichui",
  "xiaochen",
  "jam",
  "kazi",
  "douji",
  "luodo",
] as const;
type Voice = (typeof ALLOWED_VOICES)[number];

const MAX_TEXT = 1024;

/**
 * POST /api/tts
 *
 * Body (JSON): { text: string, voice?: Voice, speed?: number }
 *
 * Returns the synthesized WAV audio directly with Content-Type: audio/wav.
 * On failure responds with JSON `{ error: string }` and the appropriate status.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { error: "Invalid JSON body." },
        { status: 400 },
      );
    }

    const { text, voice, speed } = body as {
      text?: unknown;
      voice?: unknown;
      speed?: unknown;
    };

    if (typeof text !== "string" || text.trim().length === 0) {
      return NextResponse.json(
        { error: "A non-empty 'text' string is required." },
        { status: 400 },
      );
    }

    if (text.length > MAX_TEXT) {
      return NextResponse.json(
        {
          error: `Text is too long (${text.length}/${MAX_TEXT} characters).`,
        },
        { status: 400 },
      );
    }

    const selectedVoice: Voice =
      typeof voice === "string" &&
      (ALLOWED_VOICES as readonly string[]).includes(voice)
        ? (voice as Voice)
        : "tongtong";

    let selectedSpeed = 1.0;
    if (typeof speed === "number" && Number.isFinite(speed)) {
      if (speed < 0.5 || speed > 2.0) {
        return NextResponse.json(
          { error: "'speed' must be between 0.5 and 2.0." },
          { status: 400 },
        );
      }
      selectedSpeed = Math.round(speed * 10) / 10;
    }

    const zai = await getZai();

    const response = await zai.audio.tts.create({
      input: text,
      voice: selectedVoice,
      speed: selectedSpeed,
      response_format: "wav",
      stream: false,
    });

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(new Uint8Array(arrayBuffer));

    if (!buffer || buffer.length === 0) {
      return NextResponse.json(
        { error: "TTS provider returned an empty audio buffer." },
        { status: 502 },
      );
    }

    return new Response(buffer, {
      status: 200,
      headers: {
        "Content-Type": "audio/wav",
        "Content-Length": buffer.length.toString(),
        "Cache-Control": "no-store, max-age=0",
      },
    });
  } catch (err) {
    console.error("[api/tts] error:", err);
    const message =
      err instanceof Error ? err.message : "Failed to synthesize audio.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
