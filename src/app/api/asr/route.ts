import { NextRequest, NextResponse } from "next/server";
import { getZai } from "@/lib/zai";

// Speech recognition runs through the Node.js runtime (Buffer + form parsing).
export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

const ACCEPTED_AUDIO_TYPES = new Set([
  "audio/webm",
  "audio/wav",
  "audio/wave",
  "audio/x-wav",
  "audio/mp3",
  "audio/mpeg",
  "audio/ogg",
  "audio/x-m4a",
  "audio/mp4",
]);

const MAX_FILE_BYTES = 25 * 1024 * 1024; // 25 MB safety cap.

/**
 * POST /api/asr
 *
 * Accepts multipart/form-data with a single `audio` File (webm/wav/mp3/etc).
 * Reads the file, converts it to base64, calls ZAI ASR, and returns
 * `{ text: string }`. On failure responds with JSON `{ error: string }`.
 */
export async function POST(req: NextRequest) {
  try {
    const contentType = req.headers.get("content-type") || "";
    if (!contentType.includes("multipart/form-data")) {
      return NextResponse.json(
        {
          error:
            "Unsupported content type. Send multipart/form-data with an 'audio' file.",
        },
        { status: 415 },
      );
    }

    const fd = await req.formData();
    const field = fd.get("audio");

    if (!(field instanceof File)) {
      return NextResponse.json(
        { error: "An 'audio' file is required." },
        { status: 400 },
      );
    }

    // Some browsers record as `audio/webm;codecs=opus` — only check the base type.
    const baseType = (field.type || "").split(";")[0].trim().toLowerCase();
    const extension = field.name.toLowerCase().split(".").pop() || "";

    const looksAudio =
      ACCEPTED_AUDIO_TYPES.has(baseType) ||
      ["webm", "wav", "mp3", "mpeg", "ogg", "m4a", "mp4"].includes(extension);

    if (!looksAudio) {
      return NextResponse.json(
        {
          error: `Unsupported audio format (${field.type || extension || "unknown"}). Use webm, wav, or mp3.`,
        },
        { status: 400 },
      );
    }

    if (field.size === 0) {
      return NextResponse.json(
        { error: "The uploaded audio file is empty." },
        { status: 400 },
      );
    }
    if (field.size > MAX_FILE_BYTES) {
      return NextResponse.json(
        {
          error: `Audio file is too large (${Math.round(field.size / 1024 / 1024)}MB). Limit is 25MB.`,
        },
        { status: 413 },
      );
    }

    const arrayBuffer = await field.arrayBuffer();
    const buffer = Buffer.from(new Uint8Array(arrayBuffer));
    const base64Audio = buffer.toString("base64");

    const zai = await getZai();
    const response = await zai.audio.asr.create({ file_base64: base64Audio });
    const text =
      typeof response?.text === "string" && response.text.trim().length > 0
        ? response.text.trim()
        : "";

    if (!text) {
      return NextResponse.json(
        { error: "No speech could be recognized in the audio. Try again." },
        { status: 422 },
      );
    }

    return NextResponse.json({ text });
  } catch (err) {
    console.error("[api/asr] error:", err);
    const message =
      err instanceof Error ? err.message : "Failed to transcribe audio.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
