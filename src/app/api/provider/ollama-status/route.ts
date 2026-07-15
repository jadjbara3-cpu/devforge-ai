import { NextResponse } from "next/server";

import { detectOllama, type OllamaModel } from "@/lib/ai-providers";

export const dynamic = "force-dynamic";

/**
 * GET /api/provider/ollama-status
 *
 * Probes the local Ollama daemon (`GET http://localhost:11434/api/tags` with
 * a 1.5s timeout) and returns:
 *
 *   {
 *     running:  boolean,
 *     models:   Array<{ name, digest, size, modifiedAt, parameterSize?,
 *                        quantizationLevel? }>,
 *     endpoint: string,   // OpenAI-compatible base URL (http://localhost:11434/v1)
 *     root:     string,   // native Ollama root
 *     reason?:  string    // human-readable explanation when running === false
 *   }
 *
 * Used by the Settings UI to show a green "Ollama running" badge with a model
 * dropdown, or a yellow "Ollama not detected" badge with an install link
 * (https://ollama.com) when the daemon isn't reachable.
 *
 * Non-throwing: always returns 200 with `running: false` on any failure so
 * the UI can render the "not detected" state gracefully without surfacing
 * a 500 error.
 */
export async function GET() {
  try {
    const result = await detectOllama();

    // Strip the `root` field — internal-only, not needed by the UI.
    // (Keeping the response shape minimal avoids leaking impl details.)
    const payload: {
      running: boolean;
      models: OllamaModel[];
      endpoint: string;
      root: string;
      reason?: string;
    } = {
      running: result.running,
      models: result.models,
      endpoint: result.endpoint,
      root: result.root,
    };
    if (result.reason) {
      payload.reason = result.reason;
    }
    return NextResponse.json(payload);
  } catch (err) {
    console.error("[ollama-status] detection failed:", err);
    // Degrade gracefully — the UI must never crash because Ollama isn't there.
    return NextResponse.json({
      running: false,
      models: [],
      endpoint: "http://localhost:11434/v1",
      root: "http://localhost:11434",
      reason:
        err instanceof Error
          ? err.message
          : "Unexpected error while probing Ollama.",
    });
  }
}
