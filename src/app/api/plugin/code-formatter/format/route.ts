/**
 * Plugin API route: POST /api/plugin/code-formatter/format
 * ---------------------------------------------------------
 * Formats source code using the "complex" chat slot (no history persisted).
 *
 * Body: { code: string, language: string, style?: "clean" | "compact" | "verbose" }
 * 200:  { formatted: string, model: string }
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

interface FormatBody {
  code?: unknown;
  language?: unknown;
  style?: unknown;
}

const SUPPORTED_LANGS = new Set([
  "javascript",
  "typescript",
  "jsx",
  "tsx",
  "python",
  "go",
  "rust",
  "java",
  "c",
  "cpp",
  "csharp",
  "php",
  "ruby",
  "swift",
  "kotlin",
  "sql",
  "json",
  "html",
  "css",
  "scss",
  "bash",
  "yaml",
  "markdown",
  "text",
]);

const STYLES: Record<string, string> = {
  clean: "Apply standard formatting (e.g. Prettier-like) — 2-space indent, single quotes, semicolons.",
  compact: "Format compactly — fewer blank lines, shorter where unambiguous.",
  verbose: "Format with explicit spacing and added clarifying comments where useful.",
};

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as FormatBody | null;

  if (!body || typeof body.code !== "string" || !body.code.trim()) {
    return NextResponse.json(
      { error: "A non-empty 'code' string is required." },
      { status: 400 },
    );
  }

  const code = body.code;
  const language =
    typeof body.language === "string" && SUPPORTED_LANGS.has(body.language)
      ? body.language
      : "text";
  const style =
    typeof body.style === "string" && STYLES[body.style] ? body.style : "clean";

  let resolved: Awaited<ReturnType<typeof getChatClient>>;
  try {
    resolved = await getChatClient("complex");
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
    "You are an expert code formatter.",
    `The user gives you ${language} code.`,
    "Reformat it according to the requested style. Do NOT change behaviour.",
    "Do NOT add explanation prose. Output ONLY the formatted code.",
    "Preserve all comments unless they are clearly orphaned.",
  ].join(" ");

  const userMsg = `Style: ${STYLES[style]}\n\nCode:\n\n\`\`\`${language}\n${code}\n\`\`\``;

  try {
    const completion = await client.chat.completions.create({
      model: config.model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: userMsg },
      ],
      // Low temperature → deterministic formatting.
      temperature: 0.2,
      ...(typeof config.maxTokens === "number"
        ? { max_tokens: config.maxTokens }
        : {}),
    });
    let formatted = completion.choices?.[0]?.message?.content ?? "";

    // Strip a single pair of wrapping ``` fences if the model added them.
    const fenceMatch = formatted.match(/^```[a-zA-Z]*\n([\s\S]*?)\n?```\s*$/);
    if (fenceMatch) {
      formatted = fenceMatch[1];
    }

    return NextResponse.json({
      formatted: formatted.trimEnd(),
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
