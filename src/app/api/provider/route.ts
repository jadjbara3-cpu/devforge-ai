import { NextResponse, type NextRequest } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";
import { getProviderStatus } from "@/lib/zai";

export const dynamic = "force-dynamic";

const ENV_FILE = path.join(process.cwd(), ".env");

/**
 * GET /api/provider
 * Returns the current AI provider configuration status (no secrets exposed).
 */
export async function GET() {
  const status = getProviderStatus();
  return NextResponse.json(status);
}

/**
 * POST /api/provider
 * Updates the AI_API_KEY and AI_BASE_URL in the .env file.
 * Body: { apiKey: string, baseUrl: string }
 *
 * NOTE: This writes to the .env file on disk. Only use in local/dev environments.
 * The dev server must be restarted for the new values to take effect.
 */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => null)) as
      | { apiKey?: unknown; baseUrl?: unknown }
      | null;

    if (!body) {
      return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
    }

    const apiKey = typeof body.apiKey === "string" ? body.apiKey.trim() : "";
    const baseUrl = typeof body.baseUrl === "string" ? body.baseUrl.trim() : "";

    if (!apiKey) {
      return NextResponse.json(
        { error: "API key is required." },
        { status: 400 }
      );
    }
    if (!baseUrl) {
      return NextResponse.json(
        { error: "Base URL is required." },
        { status: 400 }
      );
    }

    // Read existing .env (or create empty)
    let envContent = "";
    try {
      envContent = await fs.readFile(ENV_FILE, "utf-8");
    } catch {
      // File doesn't exist yet — start empty
    }

    const lines = envContent.split("\n");
    const updated = new Set<string>();
    const newLines = lines.map((line) => {
      const trimmed = line.trim();
      if (trimmed.startsWith("AI_API_KEY=")) {
        updated.add("AI_API_KEY");
        return `AI_API_KEY=${apiKey}`;
      }
      if (trimmed.startsWith("AI_BASE_URL=")) {
        updated.add("AI_BASE_URL");
        return `AI_BASE_URL=${baseUrl}`;
      }
      return line;
    });

    if (!updated.has("AI_API_KEY")) {
      newLines.push(`AI_API_KEY=${apiKey}`);
    }
    if (!updated.has("AI_BASE_URL")) {
      newLines.push(`AI_BASE_URL=${baseUrl}`);
    }

    await fs.writeFile(ENV_FILE, newLines.join("\n"), "utf-8");

    return NextResponse.json({
      ok: true,
      message:
        "Configuration saved. Restart the dev server (Ctrl+C then `bun run dev`) for changes to take effect.",
      baseUrl,
    });
  } catch (err) {
    console.error("[provider] POST failed:", err);
    const message =
      err instanceof Error ? err.message : "Unexpected server error.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
