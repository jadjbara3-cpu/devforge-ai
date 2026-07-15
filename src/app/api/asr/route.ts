import { NextRequest, NextResponse } from "next/server";

import {
  getZaiClient,
  getChatClient,
  ProviderNotConfiguredError,
} from "@/lib/ai-providers";

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
 *
 * Strategy:
 *   1. Try Z.ai specialty ASR (slot "asr").
 *   2. Fall back to OpenAI whisper-1 via the "complex" slot.
 *   3. If neither is configured → 501.
 *
 * Returns `{ text: string }` on success, `{ error, code? }` on failure.
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

    // 1. Try Z.ai specialty ASR.
    let text: string = "";
    try {
      const { client, enabled } = await getZaiClient("asr");
      if (enabled && client) {
        const response = await client.audio.asr.create({
          file_base64: base64Audio,
        });
        text =
          typeof response?.text === "string" && response.text.trim().length > 0
            ? response.text.trim()
            : "";
      }
    } catch (zaiErr) {
      console.warn("[asr] Z.ai specialty failed, trying fallback:", zaiErr instanceof Error ? zaiErr.message : zaiErr);
      text = "";
    }

    // 2. Fall back to OpenAI whisper-1 via the "complex" slot.
    if (!text) {
      try {
        const { client } = await getChatClient("complex");
        // OpenAI expects multipart upload — convert from base64 back to a Blob/File.
        const audioBlob = new Blob([buffer], { type: baseType || "audio/webm" });
        const file = new File([audioBlob], field.name || "audio.webm", {
          type: baseType || "audio/webm",
        });

        const transcription = await client.audio.transcriptions.create({
          model: "whisper-1",
          file,
        });

        text =
          typeof transcription.text === "string" && transcription.text.trim().length > 0
            ? transcription.text.trim()
            : "";
      } catch (err) {
        if (err instanceof ProviderNotConfiguredError) {
          return NextResponse.json(
            {
              error:
                "Speech recognition is not configured. Enable the Z.ai specialty 'asr' service, OR set the Complex tasks model slot to an OpenAI-compatible provider that supports whisper-1.",
              code: "ASR_NOT_CONFIGURED",
            },
            { status: 501 },
          );
        }
        console.error("[api/asr] OpenAI fallback failed:", err);
        const message =
          err instanceof Error ? err.message : "Failed to transcribe audio.";
        return NextResponse.json(
          { error: message, code: "ASR_FAILED" },
          { status: 502 },
        );
      }
    }

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
