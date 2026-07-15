/**
 * Memory Engine — long-term storage, retrieval, and prompt injection for
 * DevForge AI's persistent memory layer.
 *
 * --------------------------------------------------------------------
 * Design
 * --------------------------------------------------------------------
 * Memories are short natural-language statements typed into one of five
 * buckets: "fact", "preference", "pattern", "skill", "contact". They are
 * stored in the SQLite `Memory` table (see prisma/schema.prisma) and never
 * leave the user's machine except when forwarded to the configured LLM
 * provider as part of the chat system prompt.
 *
 * Three layers of memory are merged into every chat request:
 *
 *   1. Pinned memories      — always injected (user-curated ground truth).
 *   2. Top-N by importance  — bounded by `MAX_INJECTED_BYTES` so the
 *                              system prompt stays token-friendly.
 *   3. Short-term context   — handled by the caller (recent ChatMessage
 *                              rows); this module focuses on long-term
 *                              memory only.
 *
 * The "extract" path uses the configured chat provider to mine new memories
 * from a finished conversation. The LLM is prompted to return strict JSON;
 * we validate the shape and de-duplicate against existing memories before
 * persisting.
 *
 * All functions are safe to call from API route handlers (server-side).
 * They never run in the browser bundle.
 */

import type { OpenAI } from "openai";

import { db } from "@/lib/db";
import {
  getChatClient,
  ProviderNotConfiguredError,
  type ChatSlot,
} from "@/lib/ai-providers";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type MemoryType =
  | "fact"
  | "preference"
  | "pattern"
  | "skill"
  | "contact";

export type MemorySource = "manual" | "extracted" | "observed";

export interface MemoryRow {
  id: string;
  type: MemoryType;
  content: string;
  importance: number;
  source: MemorySource;
  pinned: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateMemoryInput {
  type: MemoryType;
  content: string;
  importance?: number;
  source?: MemorySource;
  pinned?: boolean;
}

export interface UpdateMemoryInput {
  type?: MemoryType;
  content?: string;
  importance?: number;
  source?: MemorySource;
  pinned?: boolean;
}

export interface ExtractedFact {
  type: MemoryType;
  content: string;
  importance?: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Hard cap (in characters) on the memory section injected into the prompt. */
const MAX_INJECTED_BYTES = 2_400;

/** Hard cap on the number of non-pinned memories injected. */
const MAX_INJECTED_COUNT = 12;

const VALID_TYPES: ReadonlySet<MemoryType> = new Set([
  "fact",
  "preference",
  "pattern",
  "skill",
  "contact",
]);

const VALID_SOURCES: ReadonlySet<MemorySource> = new Set([
  "manual",
  "extracted",
  "observed",
]);

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

function isMemoryType(v: unknown): v is MemoryType {
  return typeof v === "string" && (VALID_TYPES as Set<string>).has(v);
}

function isMemorySource(v: unknown): v is MemorySource {
  return typeof v === "string" && (VALID_SOURCES as Set<string>).has(v);
}

function clampImportance(n: unknown): number {
  const fallback = 5;
  if (typeof n !== "number" || !Number.isFinite(n)) return fallback;
  const rounded = Math.round(n);
  if (rounded < 0) return 0;
  if (rounded > 10) return 10;
  return rounded;
}

// ---------------------------------------------------------------------------
// DB helpers — every read goes through here so we can transparently degrade
// when the Memory table doesn't exist yet (e.g. before `bun run db:push`).
// ---------------------------------------------------------------------------

function isPrismaMissingTableError(err: unknown): boolean {
  const msg =
    err instanceof Error
      ? err.message.toLowerCase()
      : String(err ?? "").toLowerCase();
  return (
    msg.includes("does not exist") ||
    msg.includes("no such table") ||
    msg.includes("unknown field") ||
    msg.includes("invalid prisma")
  );
}

function serialize(row: {
  id: string;
  type: string;
  content: string;
  importance: number;
  source: string;
  pinned: boolean;
  createdAt: Date;
  updatedAt: Date;
}): MemoryRow {
  return {
    id: row.id,
    type: isMemoryType(row.type) ? row.type : "fact",
    content: row.content,
    importance: typeof row.importance === "number" ? row.importance : 5,
    source: isMemorySource(row.source) ? row.source : "manual",
    pinned: Boolean(row.pinned),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

export async function listMemories(): Promise<MemoryRow[]> {
  try {
    const rows = await db.memory.findMany({
      orderBy: [
        { pinned: "desc" },
        { importance: "desc" },
        { updatedAt: "desc" },
      ],
    });
    return rows.map(serialize);
  } catch (err) {
    if (isPrismaMissingTableError(err)) {
      console.warn(
        "[memory-engine] Memory table not found — returning empty list. Run `bun run db:push` to migrate.",
      );
      return [];
    }
    throw err;
  }
}

export async function getMemory(id: string): Promise<MemoryRow | null> {
  try {
    const row = await db.memory.findUnique({ where: { id } });
    return row ? serialize(row) : null;
  } catch (err) {
    if (isPrismaMissingTableError(err)) return null;
    throw err;
  }
}

export async function createMemory(
  input: CreateMemoryInput,
): Promise<MemoryRow> {
  if (!isMemoryType(input.type)) {
    throw new Error(
      `Invalid memory type "${String(input.type)}". Expected one of: fact, preference, pattern, skill, contact.`,
    );
  }
  const content = typeof input.content === "string" ? input.content.trim() : "";
  if (!content) {
    throw new Error("Memory content must be a non-empty string.");
  }
  if (content.length > 500) {
    throw new Error("Memory content must be 500 characters or fewer.");
  }

  const data = {
    type: input.type,
    content,
    importance: clampImportance(input.importance),
    source: isMemorySource(input.source) ? input.source : "manual",
    pinned: Boolean(input.pinned),
  };

  try {
    const row = await db.memory.create({ data });
    return serialize(row);
  } catch (err) {
    if (isPrismaMissingTableError(err)) {
      throw new Error(
        "Memory table not found. Run `bun run db:push` to create it.",
      );
    }
    throw err;
  }
}

export async function updateMemory(
  id: string,
  patch: UpdateMemoryInput,
): Promise<MemoryRow | null> {
  const existing = await getMemory(id);
  if (!existing) return null;

  const data: Record<string, unknown> = {};
  if (patch.type !== undefined) {
    if (!isMemoryType(patch.type)) {
      throw new Error(`Invalid memory type "${String(patch.type)}".`);
    }
    data.type = patch.type;
  }
  if (patch.content !== undefined) {
    const content = patch.content.trim();
    if (!content) {
      throw new Error("Memory content must be a non-empty string.");
    }
    if (content.length > 500) {
      throw new Error("Memory content must be 500 characters or fewer.");
    }
    data.content = content;
  }
  if (patch.importance !== undefined) {
    data.importance = clampImportance(patch.importance);
  }
  if (patch.source !== undefined) {
    if (!isMemorySource(patch.source)) {
      throw new Error(`Invalid memory source "${String(patch.source)}".`);
    }
    data.source = patch.source;
  }
  if (patch.pinned !== undefined) {
    data.pinned = Boolean(patch.pinned);
  }

  try {
    const row = await db.memory.update({ where: { id }, data });
    return serialize(row);
  } catch (err) {
    if (isPrismaMissingTableError(err)) {
      throw new Error(
        "Memory table not found. Run `bun run db:push` to create it.",
      );
    }
    throw err;
  }
}

export async function deleteMemory(id: string): Promise<boolean> {
  try {
    const existing = await db.memory.findUnique({ where: { id } });
    if (!existing) return false;
    await db.memory.delete({ where: { id } });
    return true;
  } catch (err) {
    if (isPrismaMissingTableError(err)) return false;
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Retrieval — pick the memories that get injected into the system prompt.
// ---------------------------------------------------------------------------

/**
 * Build the "Long-term memory" section that's appended to the system prompt.
 * Returns an empty string when there are no memories (so the caller can
 * unconditionally concatenate).
 *
 * Strategy:
 *   1. Always include every pinned memory (no cap).
 *   2. Fill the rest with the highest-importance non-pinned memories, up to
 *      `MAX_INJECTED_COUNT` items and `MAX_INJECTED_BYTES` characters.
 */
export async function buildMemoryPromptSection(): Promise<string> {
  const memories = await listMemories();
  if (memories.length === 0) return "";

  const pinned = memories.filter((m) => m.pinned);
  const nonPinned = memories
    .filter((m) => !m.pinned)
    .slice(0, MAX_INJECTED_COUNT);

  const selected = [...pinned, ...nonPinned];
  if (selected.length === 0) return "";

  const lines: string[] = [];
  let used = 0;
  for (const m of selected) {
    const line = `- [${m.type}] ${m.content}`;
    if (used + line.length > MAX_INJECTED_BYTES && lines.length > 0) break;
    lines.push(line);
    used += line.length + 1;
  }

  return [
    "",
    "## Long-term memory about the user",
    "Use these facts to personalise your answer. Do not mention that you have this list.",
    ...lines,
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Extraction — call the LLM to mine new memories from a conversation.
// ---------------------------------------------------------------------------

const EXTRACTION_SYSTEM_PROMPT = `You are a memory extraction assistant.
Read the conversation and extract durable facts worth remembering about the user.
Respond with STRICT JSON only — no markdown, no commentary.

Schema:
{
  "facts": [
    { "type": "fact" | "preference" | "pattern" | "skill" | "contact",
      "content": string,        // one short sentence, third person
      "importance": number      // 0..10
    }
  ]
}

Rules:
- Only extract things that are STILL TRUE after this conversation ends
  (not transient questions). Examples of good memories:
    - "User prefers TypeScript over JavaScript"
    - "User works on a React + Next.js project called DevForge"
    - "User's name is Jad"
- Skip one-off questions ("how do I parse JSON in Python?").
- Skip anything the user explicitly asked to forget.
- Cap content at 200 characters. Be specific and concrete.
- If there is nothing worth remembering, return { "facts": [] }.`;

export async function extractMemoriesFromConversation(args: {
  /** The full conversation transcript (user + assistant turns). */
  transcript: string;
  /** Which chat slot to use. Defaults to "agents" (cheap/fast). */
  slot?: ChatSlot;
}): Promise<ExtractedFact[]> {
  const { transcript, slot = "agents" } = args;
  if (!transcript || transcript.trim().length === 0) return [];

  let client: OpenAI;
  let model: string;
  try {
    const resolved = await getChatClient(slot);
    client = resolved.client;
    model = resolved.config.model;
  } catch (err) {
    if (err instanceof ProviderNotConfiguredError) {
      console.warn(
        `[memory-engine] extraction skipped — chat slot "${slot}" not configured.`,
      );
      return [];
    }
    throw err;
  }

  let raw: string | undefined;
  try {
    const completion = await client.chat.completions.create({
      model,
      temperature: 0,
      max_tokens: 800,
      messages: [
        { role: "system", content: EXTRACTION_SYSTEM_PROMPT },
        {
          role: "user",
          content: `Conversation:\n\n${transcript.slice(0, 12_000)}`,
        },
      ],
    });
    raw = completion.choices?.[0]?.message?.content ?? undefined;
  } catch (err) {
    console.error("[memory-engine] extraction LLM call failed:", err);
    return [];
  }

  if (!raw) return [];

  // The model sometimes wraps JSON in ```json fences despite instructions.
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/i, "")
    .trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    console.warn(
      "[memory-engine] extraction returned non-JSON — skipping.",
      cleaned.slice(0, 200),
    );
    return [];
  }

  const facts = (parsed as { facts?: unknown }).facts;
  if (!Array.isArray(facts)) return [];

  const result: ExtractedFact[] = [];
  for (const f of facts) {
    if (!f || typeof f !== "object") continue;
    const obj = f as { type?: unknown; content?: unknown; importance?: unknown };
    if (!isMemoryType(obj.type)) continue;
    if (typeof obj.content !== "string" || !obj.content.trim()) continue;
    result.push({
      type: obj.type,
      content: obj.content.trim().slice(0, 500),
      importance:
        typeof obj.importance === "number" ? clampImportance(obj.importance) : 5,
    });
  }
  return result;
}

/**
 * Persist extracted facts, de-duplicating against existing memories by
 * case-insensitive content equality.
 *
 * Returns the number of NEW memories actually created (skipped duplicates
 * don't count).
 */
export async function persistExtractedFacts(
  facts: ExtractedFact[],
): Promise<number> {
  if (facts.length === 0) return 0;

  const existing = await listMemories();
  const existingLower = new Set(
    existing.map((m) => m.content.toLowerCase().trim()),
  );

  let created = 0;
  for (const f of facts) {
    const content = f.content.trim();
    if (!content) continue;
    if (existingLower.has(content.toLowerCase())) continue;
    try {
      await db.memory.create({
        data: {
          type: f.type,
          content,
          importance: clampImportance(f.importance),
          source: "extracted",
          pinned: false,
        },
      });
      existingLower.add(content.toLowerCase());
      created++;
    } catch (err) {
      if (isPrismaMissingTableError(err)) {
        console.warn(
          "[memory-engine] Memory table missing — skipping extraction persist.",
        );
        return created;
      }
      console.error("[memory-engine] failed to persist extracted fact:", err);
    }
  }
  return created;
}
