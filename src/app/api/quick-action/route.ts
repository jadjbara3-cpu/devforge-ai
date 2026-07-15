/**
 * POST /api/quick-action
 *
 * Routes a user's natural-language or keyword-prefixed input to the right
 * "action" and returns the result.
 *
 * Body: { input: string }
 *
 * Actions handled here (server-side):
 *   - search    → uses the Z.ai "web" specialty (returns top 8 results)
 *   - chat      → one-shot LLM call (no history) via the "agents" slot
 *   - translate → one-shot LLM call via the "complex" slot
 *   - code      → one-shot LLM call via the "complex" slot
 *   - ai        → intent detection: the LLM picks one of the above
 *
 * Actions handled on the client (no server round-trip needed):
 *   - calc      → evaluateMath (lib/quick-actions.ts)
 *   - color     → parseColor (lib/quick-actions.ts)
 *   - open      → show launch instructions (the app runs in a browser, so we
 *                 can't actually exec Windows binaries; we show the command
 *                 for the user to run)
 *
 * Returns: { result: ActionResult } on success.
 */

import { NextResponse, type NextRequest } from "next/server";
import type { OpenAI } from "openai";

import {
  getChatClient,
  getZaiClient,
  ProviderNotConfiguredError,
  type ChatSlot,
} from "@/lib/ai-providers";
import {
  parseAction,
  QUICK_ACTIONS,
  findApp,
  type ActionResult,
  type ParsedAction,
} from "@/lib/quick-actions";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface QuickActionBody {
  input?: unknown;
}

const LANGS: Record<string, string> = {
  en: "English",
  ar: "Arabic",
  fr: "French",
  es: "Spanish",
  de: "German",
  it: "Italian",
  pt: "Portuguese",
  ru: "Russian",
  zh: "Chinese",
  ja: "Japanese",
};

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => null)) as QuickActionBody | null;
    if (!body || typeof body.input !== "string" || !body.input.trim()) {
      return NextResponse.json(
        { error: "A non-empty 'input' string is required." },
        { status: 400 },
      );
    }

    const parsed = parseAction(body.input);
    const result = await dispatch(parsed);
    return NextResponse.json({ result });
  } catch (err) {
    console.error("[quick-action] POST failed:", err);
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : "Server error.",
        result: {
          kind: "error",
          title: "Action failed",
          body: err instanceof Error ? err.message : "Unknown error",
        } satisfies ActionResult,
      },
      { status: 500 },
    );
  }
}

// ---------------------------------------------------------------------------
// Dispatcher
// ---------------------------------------------------------------------------

async function dispatch(parsed: ParsedAction): Promise<ActionResult> {
  switch (parsed.action) {
    case "search":
      return runSearch(parsed.query);
    case "chat":
      return runChat(parsed.query);
    case "translate":
      return runTranslate(parsed.query, parsed.target ?? "en");
    case "code":
      return runCode(parsed.query);
    case "open": {
      const app = findApp(parsed.query);
      if (!app) {
        return {
          kind: "error",
          title: "App not found",
          body: `No Windows app matches "${parsed.query}". Try: notepad, calc, explorer, paint, cmd, settings.`,
        };
      }
      return {
        kind: "open",
        title: `Open ${app.description}`,
        app,
      };
    }
    case "ai":
    default:
      return runAIDetect(parsed.query);
  }
}

// ---------------------------------------------------------------------------
// Individual actions
// ---------------------------------------------------------------------------

async function runSearch(query: string): Promise<ActionResult> {
  if (!query.trim()) {
    return { kind: "error", title: "Empty query", body: "Type something to search." };
  }

  try {
    const { client, enabled } = await getZaiClient("web");
    if (!enabled || !client) {
      return {
        kind: "error",
        title: "Web search not configured",
        body: "Add a Z.ai API key in Settings → Specialty services to enable web search.",
      };
    }

    const raw = await client.functions.invoke("web_search", {
      query,
      num: 8,
    });

    let list: unknown[] = [];
    if (Array.isArray(raw)) list = raw;
    else if (raw && typeof raw === "object") {
      const r = raw as Record<string, unknown>;
      if (Array.isArray(r.results)) list = r.results;
      else if (Array.isArray(r.data)) list = r.data;
    }

    const items = list
      .filter((x): x is Record<string, unknown> => !!x && typeof x === "object")
      .map((item) => ({
        title: typeof item.name === "string" ? item.name : "",
        subtitle: typeof item.snippet === "string" ? item.snippet : "",
        url: typeof item.url === "string" ? item.url : "",
      }))
      .filter((x) => x.title || x.url);

    return {
      kind: "list",
      title: `Web results for "${query}"`,
      items,
    };
  } catch (err) {
    return {
      kind: "error",
      title: "Search failed",
      body: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

async function runChat(query: string): Promise<ActionResult> {
  return llmText({
    slot: "agents",
    system:
      "You are DevForge AI, a helpful assistant. Be concise and friendly. Use markdown when useful.",
    user: query,
    title: "Quick answer",
    kind: "markdown",
  });
}

async function runTranslate(text: string, target: string): Promise<ActionResult> {
  const targetName = LANGS[target] ?? "English";
  return llmText({
    slot: "complex",
    system:
      "You are a professional translator. Output ONLY the translation — no commentary, no quotes.",
    user: `Translate the following text into ${targetName}:\n\n${text}`,
    title: `Translation (${targetName})`,
    kind: "text",
  });
}

async function runCode(description: string): Promise<ActionResult> {
  return llmText({
    slot: "complex",
    system:
      "You are a senior software engineer. Generate clean, idiomatic code that solves the user's request. Wrap the code in a fenced code block with the correct language tag. Add a one-line comment at the top describing what the code does. No prose explanation outside the code block.",
    user: description,
    title: "Generated code",
    kind: "markdown",
  });
}

async function runAIDetect(query: string): Promise<ActionResult> {
  // Ask the LLM to classify the user's intent into one of the known actions.
  const classifierPrompt = [
    "You are an intent classifier. Given the user's input, decide which of these actions fits best:",
    QUICK_ACTIONS.map((a) => `- ${a.id}: ${a.description}`).join("\n"),
    "- ai: none of the above (general conversation)",
    "",
    "Respond with EXACTLY one line in this format:",
    "ACTION|target|<rewritten query>",
    "",
    "Where:",
    "- ACTION is one of: search, chat, translate, code, open, calc, color, ai",
    "- target is a language code (en, ar, fr, ...) — only meaningful for translate; otherwise use '-'",
    "- <rewritten query> is the user's intent stripped of the action keyword, suitable for re-dispatch",
    "",
    "Examples:",
    'Input: "what is the capital of France" → ai|-|what is the capital of France',
    'Input: "find me a React tutorial" → search|-|React tutorial',
    'Input: "translate this to Spanish: hello world" → translate|es|hello world',
    'Input: "how do I reverse a list in Python" → code|-|reverse a list in Python',
  ].join("\n");

  const classifierResult = await llmRaw({
    slot: "agents",
    system: classifierPrompt,
    user: query,
  });

  // Parse the classifier's response.
  const lines = classifierResult.split("\n").map((l) => l.trim()).filter(Boolean);
  const firstLine = lines[0] || "";
  const parts = firstLine.split("|");
  const actionRaw = (parts[0] || "ai").toLowerCase().trim();
  const target = parts[1] && parts[1] !== "-" ? parts[1].trim() : undefined;
  const rewritten = parts.slice(2).join("|").trim() || query;

  const allowedActions = new Set([
    "search",
    "chat",
    "translate",
    "code",
    "open",
    "calc",
    "color",
    "ai",
  ]);

  if (!allowedActions.has(actionRaw)) {
    // Default to chat — most inputs are general questions.
    return runChat(query);
  }

  if (actionRaw === "ai") {
    return {
      kind: "ai",
      title: "AI assistant",
      intent: "general",
      body: await llmRaw({
        slot: "agents",
        system:
          "You are DevForge AI, a helpful assistant. Be concise and friendly.",
        user: query,
      }),
    };
  }

  // Re-dispatch to the chosen action with the rewritten query.
  return dispatch({
    action: actionRaw as ParsedAction["action"],
    query: rewritten,
    target,
  });
}

// ---------------------------------------------------------------------------
// LLM helpers
// ---------------------------------------------------------------------------

async function llmRaw(opts: {
  slot: ChatSlot;
  system: string;
  user: string;
}): Promise<string> {
  let resolved: { client: OpenAI; config: { model: string; temperature: number | null; maxTokens: number | null } };
  try {
    resolved = await getChatClient(opts.slot);
  } catch (err) {
    if (err instanceof ProviderNotConfiguredError) {
      throw new Error(
        "No AI provider configured. Open Settings → AI Provider to add one.",
      );
    }
    throw err;
  }

  const { client, config } = resolved;
  const completion = await client.chat.completions.create({
    model: config.model,
    messages: [
      { role: "system", content: opts.system },
      { role: "user", content: opts.user },
    ],
    ...(typeof config.temperature === "number"
      ? { temperature: config.temperature }
      : {}),
    ...(typeof config.maxTokens === "number"
      ? { max_tokens: config.maxTokens }
      : {}),
  });

  return completion.choices?.[0]?.message?.content?.toString().trim() || "";
}

async function llmText(opts: {
  slot: ChatSlot;
  system: string;
  user: string;
  title: string;
  kind: "text" | "markdown";
}): Promise<ActionResult> {
  try {
    const body = await llmRaw(opts);
    if (!body) {
      return {
        kind: "error",
        title: "Empty response",
        body: "The AI returned no content.",
      };
    }
    return { kind: opts.kind, title: opts.title, body };
  } catch (err) {
    return {
      kind: "error",
      title: "AI call failed",
      body: err instanceof Error ? err.message : "Unknown error",
    };
  }
}
