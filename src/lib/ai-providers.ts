/**
 * AI Provider orchestration layer for DevForge AI.
 *
 * Two slots:
 *   - "complex"  → strong / reasoning model (vision, code review, agents)
 *   - "agents"   → fast / default chat model (everyday Q&A)
 *
 * Each slot is OpenAI-compatible. We use the official `openai` npm package
 * against any OpenAI-compatible endpoint (DeepSeek, OpenAI, Groq, Together,
 * Ollama, Z.ai /v4, etc.) by passing `{ apiKey, baseURL }`.
 *
 * Specialty (non-OpenAI-compatible) services — image gen, TTS, ASR, web —
 * are gated behind a separate SpecialtyServiceConfig table and served by
 * the Z.ai SDK (z-ai-web-dev-sdk).
 *
 * All clients are cached for 30s (per slot) and invalidated on save so the
 * app can hot-swap providers without a process restart.
 */

import { OpenAI } from "openai";
import ZAI from "z-ai-web-dev-sdk";

import { db } from "@/lib/db";
import {
  encrypt,
  decrypt,
  isEncrypted,
  maskApiKey as maskApiKeyImpl,
} from "./crypto";

export type ChatSlot = "complex" | "agents";
export type SpecialtySlot = "image" | "tts" | "asr" | "web";
export type ProviderType =
  | "openai"
  | "deepseek"
  | "zai"
  | "groq"
  | "together"
  | "ollama"
  | "custom";

export interface ProviderConfigRow {
  id: string;
  slot: string;
  label: string;
  providerType: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  temperature: number | null;
  maxTokens: number | null;
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface SpecialtyServiceConfigRow {
  id: string;
  slot: string;
  apiKey: string;
  baseUrl: string;
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export type ZaiClient = Awaited<ReturnType<typeof ZAI.create>>;

// ---------------------------------------------------------------------------
// TTL cache — clients are re-built at most every 30s per slot.
// ---------------------------------------------------------------------------

const TTL_MS = 30_000;

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

const openAICache = new Map<ChatSlot, CacheEntry<OpenAI>>();
const zaiCache = new Map<SpecialtySlot | "shared", CacheEntry<ZaiClient>>();
const dbConfigCache = new Map<
  string,
  CacheEntry<ProviderConfigRow | SpecialtyServiceConfigRow | null>
>();

function fresh<T>(entry: CacheEntry<T> | undefined): entry is CacheEntry<T> {
  return !!entry && entry.expiresAt > Date.now();
}

/**
 * Invalidate all cached clients (called after a config save).
 * Also accepts an optional slot to nuke just one entry.
 */
export function invalidateProviderCache(slot?: ChatSlot | SpecialtySlot): void {
  if (slot) {
    openAICache.delete(slot as ChatSlot);
    zaiCache.delete(slot as SpecialtySlot);
    dbConfigCache.delete(`provider:${slot}`);
    dbConfigCache.delete(`specialty:${slot}`);
    return;
  }
  openAICache.clear();
  zaiCache.clear();
  dbConfigCache.clear();
}

/** Convenience alias used by the legacy lib/zai.ts re-export. */
export function invalidateZaiCache(): void {
  zaiCache.clear();
  dbConfigCache.delete("specialty:image");
  dbConfigCache.delete("specialty:tts");
  dbConfigCache.delete("specialty:asr");
  dbConfigCache.delete("specialty:web");
}

// ---------------------------------------------------------------------------
// DB helpers — gracefully degrade if the schema isn't migrated yet.
// ---------------------------------------------------------------------------

function isPrismaMissingTableError(err: unknown): boolean {
  const msg =
    err instanceof Error
      ? err.message.toLowerCase()
      : String(err ?? "").toLowerCase();
  return (
    msg.includes("does not exist") ||
    msg.includes("no such table") ||
    msg.includes("prismaclientunknownargumenterror") ||
    msg.includes("unknown field") ||
    msg.includes("invalid prisma")
  );
}

async function fetchProviderRow(
  slot: ChatSlot,
): Promise<ProviderConfigRow | null> {
  const cached = dbConfigCache.get(`provider:${slot}`);
  if (fresh(cached)) {
    const v = cached.value;
    return v && "providerType" in v ? (v as ProviderConfigRow) : null;
  }

  let row: ProviderConfigRow | null = null;
  try {
    row = (await db.providerConfig.findUnique({
      where: { slot },
    })) as ProviderConfigRow | null;
  } catch (err) {
    if (isPrismaMissingTableError(err)) {
      console.warn(
        `[ai-providers] ProviderConfig table not found — falling back to env vars for slot "${slot}". Run \`bun run db:push\` to migrate.`,
      );
    } else {
      console.error(`[ai-providers] Failed to read ProviderConfig(${slot}):`, err);
    }
    row = null;
  }

  dbConfigCache.set(`provider:${slot}`, {
    value: row,
    expiresAt: Date.now() + TTL_MS,
  });

  // Transparent re-encryption: if the stored key is legacy plaintext (pre-
  // encryption rollout), write back the encrypted version in the background.
  // This is self-limiting — once encrypted, this branch no longer fires.
  if (row && row.apiKey && !isEncrypted(row.apiKey)) {
    void maybeReencryptChatRow(slot, row.apiKey).catch((err) => {
      console.warn(
        `[ai-providers] transparent re-encrypt failed for chat slot ${slot}:`,
        err,
      );
    });
  }

  return row;
}

async function fetchSpecialtyRow(
  slot: SpecialtySlot,
): Promise<SpecialtyServiceConfigRow | null> {
  const cached = dbConfigCache.get(`specialty:${slot}`);
  if (fresh(cached)) {
    const v = cached.value;
    // SpecialtyServiceConfigRow has no `providerType` field.
    return v && !("providerType" in v)
      ? (v as SpecialtyServiceConfigRow)
      : null;
  }

  let row: SpecialtyServiceConfigRow | null = null;
  try {
    row = (await db.specialtyServiceConfig.findUnique({
      where: { slot },
    })) as SpecialtyServiceConfigRow | null;
  } catch (err) {
    if (isPrismaMissingTableError(err)) {
      console.warn(
        `[ai-providers] SpecialtyServiceConfig table not found — falling back to env vars for slot "${slot}". Run \`bun run db:push\` to migrate.`,
      );
    } else {
      console.error(
        `[ai-providers] Failed to read SpecialtyServiceConfig(${slot}):`,
        err,
      );
    }
    row = null;
  }

  dbConfigCache.set(`specialty:${slot}`, {
    value: row,
    expiresAt: Date.now() + TTL_MS,
  });

  // Transparent re-encryption for specialty rows (see fetchProviderRow).
  if (row && row.apiKey && !isEncrypted(row.apiKey)) {
    void maybeReencryptSpecialtyRow(slot, row.apiKey).catch((err) => {
      console.warn(
        `[ai-providers] transparent re-encrypt failed for specialty slot ${slot}:`,
        err,
      );
    });
  }

  return row;
}

// ---------------------------------------------------------------------------
// Env fallback (used before migration / when DB row missing)
// ---------------------------------------------------------------------------

function envFallbackConfig(slot: ChatSlot): {
  apiKey: string;
  baseUrl: string;
  model: string;
} | null {
  const apiKey = process.env.AI_API_KEY?.trim();
  const baseUrl =
    process.env.AI_BASE_URL?.trim() ||
    "https://api.z.ai/api/paas/v4";
  const model =
    process.env.AI_MODEL?.trim() ||
    (slot === "complex" ? "glm-4.6" : "glm-4.5-air");
  if (!apiKey) return null;
  return { apiKey, baseUrl, model };
}

function envFallbackZai(): { apiKey: string; baseUrl: string } | null {
  const apiKey = process.env.AI_API_KEY?.trim();
  const baseUrl = process.env.AI_BASE_URL?.trim();
  if (!apiKey) return null;
  return {
    apiKey,
    baseUrl: baseUrl || "https://api.z.ai/api/paas/v4",
  };
}

// ---------------------------------------------------------------------------
// Public: chat / vision client (OpenAI SDK)
// ---------------------------------------------------------------------------

export interface ResolvedChatConfig {
  config: ProviderConfigRow | null;
  apiKey: string;
  baseUrl: string;
  model: string;
  temperature: number | null;
  maxTokens: number | null;
  source: "db" | "env" | "none";
}

/**
 * Resolve the effective chat config for a slot (DB row, else env fallback).
 * Returns `source: "none"` when nothing is configured.
 */
export async function resolveChatConfig(
  slot: ChatSlot,
): Promise<ResolvedChatConfig> {
  const row = await fetchProviderRow(slot);
  if (row && row.apiKey && row.model) {
    return {
      config: row,
      apiKey: decrypt(row.apiKey),
      baseUrl: row.baseUrl,
      model: row.model,
      temperature: row.temperature,
      maxTokens: row.maxTokens,
      source: "db",
    };
  }
  const env = envFallbackConfig(slot);
  if (env) {
    return {
      config: row,
      apiKey: env.apiKey,
      baseUrl: env.baseUrl,
      model: env.model,
      temperature: null,
      maxTokens: null,
      source: "env",
    };
  }
  return {
    config: row,
    apiKey: "",
    baseUrl: "",
    model: "",
    temperature: null,
    maxTokens: null,
    source: "none",
  };
}

/**
 * Returns an OpenAI SDK client for the given slot, configured against the
 * slot's OpenAI-compatible endpoint. Cached for TTL_MS; call
 * `invalidateProviderCache(slot)` after a save.
 */
export async function getChatClient(slot: ChatSlot): Promise<{
  client: OpenAI;
  config: ResolvedChatConfig;
}> {
  const resolved = await resolveChatConfig(slot);
  if (resolved.source === "none" || !resolved.apiKey || !resolved.model) {
    throw new ProviderNotConfiguredError(
      `No AI provider configured for slot "${slot}". Open Settings → AI Provider to add one.`,
      slot,
    );
  }

  const cached = openAICache.get(slot);
  if (fresh(cached)) {
    return { client: cached.value, config: resolved };
  }

  const client = new OpenAI({
    apiKey: resolved.apiKey,
    baseURL: resolved.baseUrl,
    // We surface real errors ourselves; SDK retries can mask 400s.
    maxRetries: 1,
  });

  openAICache.set(slot, {
    value: client,
    expiresAt: Date.now() + TTL_MS,
  });
  return { client, config: resolved };
}

// ---------------------------------------------------------------------------
// Public: Z.ai specialty client (image / tts / asr / web)
// ---------------------------------------------------------------------------

/**
 * Returns the Z.ai SDK client for a specialty service. Pulls the row from
 * SpecialtyServiceConfig, falls back to env vars if the row is missing or
 * the table isn't migrated yet.
 *
 * Returns `{ client: null }` when the specialty service is explicitly
 * disabled (or env has no key).
 */
export async function getZaiClient(slot: SpecialtySlot = "web"): Promise<{
  client: ZaiClient | null;
  enabled: boolean;
  source: "db" | "env" | "none";
}> {
  const row = await fetchSpecialtyRow(slot);
  let apiKey: string | undefined;
  let baseUrl: string | undefined;

  if (row && row.enabled && row.apiKey) {
    apiKey = decrypt(row.apiKey);
    baseUrl = row.baseUrl;
  } else if (row && row.enabled === false) {
    return { client: null, enabled: false, source: "db" };
  } else {
    const env = envFallbackZai();
    if (env) {
      apiKey = env.apiKey;
      baseUrl = env.baseUrl;
    }
  }

  if (!apiKey || !baseUrl) {
    return { client: null, enabled: false, source: "none" };
  }

  const cacheKey: SpecialtySlot | "shared" = slot;
  const cached = zaiCache.get(cacheKey);
  if (fresh(cached)) {
    return { client: cached.value, enabled: true, source: row ? "db" : "env" };
  }

  try {
    const client = await ZAI.create({ apiKey, baseUrl });
    zaiCache.set(cacheKey, {
      value: client,
      expiresAt: Date.now() + TTL_MS,
    });
    return { client, enabled: true, source: row ? "db" : "env" };
  } catch (err) {
    console.error(`[ai-providers] ZAI.create failed for ${slot}:`, err);
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Public: masked status / upsert (used by /api/provider routes)
// ---------------------------------------------------------------------------

/**
 * Mask an API key for UI display / API responses.
 * Format: first 4 + `****` + last 4 — e.g. `sk-1abcdwxyz` → `sk-1****wxyz`.
 * Delegates to `./crypto` so the masking scheme lives in one place.
 * Input is assumed to be the DECRYPTED plaintext (callers must `decrypt()` first).
 */
export function maskApiKey(key: string): string {
  return maskApiKeyImpl(key);
}

export interface ProviderStatusPublic {
  slot: ChatSlot;
  configured: boolean;
  enabled: boolean;
  source: "db" | "env" | "none";
  label?: string;
  providerType?: string;
  baseUrl?: string;
  model?: string;
  temperature?: number | null;
  maxTokens?: number | null;
  apiKeyMasked?: string;
}

export async function getProviderStatus(
  slot: ChatSlot,
): Promise<ProviderStatusPublic> {
  const resolved = await resolveChatConfig(slot);
  if (resolved.source === "none") {
    return {
      slot,
      configured: false,
      enabled: false,
      source: "none",
    };
  }
  const row = resolved.config;
  return {
    slot,
    configured: true,
    enabled: row?.enabled ?? true,
    source: resolved.source,
    label: row?.label,
    providerType: row?.providerType,
    baseUrl: resolved.baseUrl,
    model: resolved.model,
    temperature: resolved.temperature,
    maxTokens: resolved.maxTokens,
    apiKeyMasked: maskApiKey(resolved.apiKey),
  };
}

export interface SpecialtyStatusPublic {
  slot: SpecialtySlot;
  enabled: boolean;
  source: "db" | "env" | "none";
  baseUrl?: string;
  apiKeyMasked?: string;
}

export async function getSpecialtyStatus(
  slot: SpecialtySlot,
): Promise<SpecialtyStatusPublic> {
  const row = await fetchSpecialtyRow(slot);
  if (row) {
    return {
      slot,
      enabled: row.enabled,
      source: "db",
      baseUrl: row.baseUrl,
      apiKeyMasked: row.enabled ? maskApiKey(decrypt(row.apiKey)) : "",
    };
  }
  const env = envFallbackZai();
  if (env) {
    return {
      slot,
      enabled: true,
      source: "env",
      baseUrl: env.baseUrl,
      apiKeyMasked: maskApiKey(env.apiKey),
    };
  }
  return { slot, enabled: false, source: "none" };
}

export interface UpsertProviderInput {
  slot: ChatSlot;
  label?: string;
  providerType?: ProviderType | string;
  baseUrl: string;
  apiKey: string;
  model: string;
  temperature?: number | null;
  maxTokens?: number | null;
  enabled?: boolean;
}

export async function upsertProviderConfig(
  input: UpsertProviderInput,
): Promise<ProviderConfigRow> {
  const data = {
    slot: input.slot,
    label: input.label?.trim() || defaultLabelFor(input.slot),
    providerType: (input.providerType ?? "custom").toString(),
    baseUrl: input.baseUrl.trim(),
    // Encrypt before persisting — `encrypt()` is idempotent on already-
    // encrypted input, so passing the existing (encrypted) row's apiKey back
    // through upsert is safe and won't double-encrypt.
    apiKey: encrypt(input.apiKey.trim()),
    model: input.model.trim(),
    temperature:
      typeof input.temperature === "number" && Number.isFinite(input.temperature)
        ? input.temperature
        : null,
    maxTokens:
      typeof input.maxTokens === "number" && Number.isFinite(input.maxTokens)
        ? Math.floor(input.maxTokens)
        : null,
    enabled: input.enabled ?? true,
  };

  const row = (await db.providerConfig.upsert({
    where: { slot: input.slot },
    create: data,
    update: {
      label: data.label,
      providerType: data.providerType,
      baseUrl: data.baseUrl,
      apiKey: data.apiKey,
      model: data.model,
      temperature: data.temperature,
      maxTokens: data.maxTokens,
      enabled: data.enabled,
    },
  })) as ProviderConfigRow;

  invalidateProviderCache(input.slot);
  return row;
}

export async function disableProviderConfig(slot: ChatSlot): Promise<void> {
  try {
    await db.providerConfig.update({
      where: { slot },
      data: { enabled: false },
    });
  } catch (err) {
    if (isPrismaMissingTableError(err)) {
      console.warn(
        `[ai-providers] Cannot disable slot ${slot} — ProviderConfig table missing.`,
      );
      return;
    }
    throw err;
  }
  invalidateProviderCache(slot);
}

export interface UpsertSpecialtyInput {
  slot: SpecialtySlot;
  apiKey: string;
  baseUrl?: string;
  enabled?: boolean;
}

export async function upsertSpecialtyConfig(
  input: UpsertSpecialtyInput,
): Promise<SpecialtyServiceConfigRow> {
  const data = {
    slot: input.slot,
    // Encrypt before persisting (idempotent on already-encrypted input).
    apiKey: encrypt(input.apiKey.trim()),
    baseUrl: input.baseUrl?.trim() || "https://api.z.ai/api/paas/v4",
    enabled: input.enabled ?? true,
  };

  const row = (await db.specialtyServiceConfig.upsert({
    where: { slot: input.slot },
    create: data,
    update: {
      apiKey: data.apiKey,
      baseUrl: data.baseUrl,
      enabled: data.enabled,
    },
  })) as SpecialtyServiceConfigRow;

  invalidateProviderCache(input.slot);
  return row;
}

export async function disableSpecialtyConfig(
  slot: SpecialtySlot,
): Promise<void> {
  try {
    await db.specialtyServiceConfig.update({
      where: { slot },
      data: { enabled: false },
    });
  } catch (err) {
    if (isPrismaMissingTableError(err)) {
      console.warn(
        `[ai-providers] Cannot disable specialty slot ${slot} — table missing.`,
      );
      return;
    }
    throw err;
  }
  invalidateProviderCache(slot);
}

// ---------------------------------------------------------------------------
// Public: connection test (used by /api/provider/test)
// ---------------------------------------------------------------------------

export interface TestConnectionInput {
  baseUrl: string;
  apiKey: string;
  model: string;
  /** Optional slot — purely for log context. */
  slot?: ChatSlot;
}

export interface TestConnectionResult {
  ok: boolean;
  model: string;
  latencyMs?: number;
  reply?: string;
  error?: string;
}

/**
 * Sends a 5-token-max ping (`max_tokens: 5`) to verify credentials/model.
 * Returns ok/err with the real error message (no masking) so the UI can
 * show the actual provider response (e.g. "Model Not Exist").
 */
export async function testProviderConnection(
  input: TestConnectionInput,
): Promise<TestConnectionResult> {
  if (!input.apiKey.trim()) {
    return { ok: false, model: input.model, error: "Missing API key." };
  }
  if (!input.baseUrl.trim()) {
    return { ok: false, model: input.model, error: "Missing base URL." };
  }
  if (!input.model.trim()) {
    return { ok: false, model: input.model, error: "Missing model name." };
  }

  const client = new OpenAI({
    apiKey: input.apiKey.trim(),
    baseURL: input.baseUrl.trim(),
    maxRetries: 0,
  });

  const t0 = Date.now();
  try {
    const completion = await client.chat.completions.create({
      model: input.model.trim(),
      messages: [
        {
          role: "user",
          content: "Reply with exactly: ok",
        },
      ],
      max_tokens: 5,
      temperature: 0,
    });
    const latencyMs = Date.now() - t0;
    const reply = completion.choices?.[0]?.message?.content?.trim() || "";
    return {
      ok: true,
      model: input.model,
      latencyMs,
      reply: reply.slice(0, 200),
    };
  } catch (err) {
    const latencyMs = Date.now() - t0;
    const message =
      err instanceof Error
        ? err.message
        : typeof err === "string"
          ? err
          : "Unknown provider error.";
    return {
      ok: false,
      model: input.model,
      latencyMs,
      error: message,
    };
  }
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class ProviderNotConfiguredError extends Error {
  code = "PROVIDER_NOT_CONFIGURED" as const;
  slot: ChatSlot;
  constructor(message: string, slot: ChatSlot) {
    super(message);
    this.name = "ProviderNotConfiguredError";
    this.slot = slot;
  }
}

// ---------------------------------------------------------------------------
// Ollama (local) — detect running daemon + list installed models
// ---------------------------------------------------------------------------
//
//  Ollama (https://ollama.com) is a local LLM runner. It exposes an OpenAI-
//  compatible REST API at http://localhost:11434/v1 (no API key required), so
//  the existing OpenAI SDK client already works against it — we just need a
//  "no-op" API key (any non-empty string) and a way to enumerate the models
//  the user has `ollama pull`ed.
//
//  Detection hits GET /api/tags (the native Ollama model-list endpoint) with
//  a short timeout so the UI never blocks when Ollama isn't installed.

/** Default Ollama endpoint (OpenAI-compatible). Override via OLLAMA_BASE_URL. */
export const OLLAMA_DEFAULT_ENDPOINT = "http://localhost:11434/v1";

/** Native Ollama root (used for /api/tags — NOT OpenAI-compatible). */
export const OLLAMA_DEFAULT_ROOT = "http://localhost:11434";

/** Detection timeout — short so a missing daemon doesn't stall the UI. */
const OLLAMA_DETECT_TIMEOUT_MS = 1500;

export interface OllamaModel {
  /** Model name as Ollama knows it, e.g. "llama3.2:3b". */
  name: string;
  /** SHA256 digest, useful as a stable React key. */
  digest: string;
  /** Size in bytes (quantized file size, not raw param count). */
  size: number;
  /** ISO timestamp of last modification (e.g. "2024-11-05T12:34:56Z"). */
  modifiedAt: string | null;
  /** Parameter size label from Ollama (e.g. "3B", "8B"), when available. */
  parameterSize?: string;
  /** Quantization label (e.g. "q4_K_M"), when available. */
  quantizationLevel?: string;
}

export interface OllamaDetectionResult {
  running: boolean;
  models: OllamaModel[];
  /** OpenAI-compatible endpoint, suitable for the OpenAI SDK `baseURL` field. */
  endpoint: string;
  /** Native Ollama root URL (`.../api/tags` lives here). */
  root: string;
  /** Human-readable reason for `running === false` — used by the UI. */
  reason?: string;
}

/**
 * Resolve the Ollama root URL. Honors the `OLLAMA_BASE_URL` env var if set
 * (some users run Ollama on a different host / port for LAN sharing), else
 * defaults to http://localhost:11434. Always strips any trailing `/v1` /
 * `/api` suffix so we can append our own paths cleanly.
 */
function ollamaRootUrl(): string {
  const raw =
    (process.env.OLLAMA_BASE_URL?.trim() || OLLAMA_DEFAULT_ROOT)
      .replace(/\/+$/, "")
      .replace(/\/v1$/i, "")
      .replace(/\/api$/i, "");
  return raw;
}

/**
 * Convert a native Ollama root (http://localhost:11434) into the OpenAI-
 * compatible base URL (http://localhost:11434/v1) for the OpenAI SDK.
 */
function ollamaEndpointFromRoot(root: string): string {
  return `${root}/v1`;
}

/**
 * Detect whether Ollama is running locally and, if so, list the models the
 * user has installed (`ollama pull`ed).
 *
 * Non-throwing: returns `{ running: false, models: [] }` on any failure
 * (network error, timeout, non-200, malformed JSON). The UI uses this to
 * show a green "Ollama running" badge with a model dropdown, or a yellow
 * "Ollama not detected" badge with an install link.
 *
 * Timeout: OLLAMA_DETECT_TIMEOUT_MS (1.5s default). Tuned so a missing
 * daemon returns promptly — `fetch` against a closed port is usually instant,
 * but on some Windows configs the loopback TCP handshake can stall.
 */
export async function detectOllama(): Promise<OllamaDetectionResult> {
  const root = ollamaRootUrl();
  const endpoint = ollamaEndpointFromRoot(root);
  const tagsUrl = `${root}/api/tags`;

  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    OLLAMA_DETECT_TIMEOUT_MS,
  );

  try {
    const res = await fetch(tagsUrl, {
      method: "GET",
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        // Some Ollama builds reject requests without a User-Agent.
        "User-Agent": "DevForge-AI/1.0 (ollama-detector)",
      },
      // Never send credentials to a localhost service.
      credentials: "omit",
      // Always fetch fresh — model list changes when users pull new models.
      cache: "no-store",
    });

    if (!res.ok) {
      return {
        running: false,
        models: [],
        endpoint,
        root,
        reason: `Ollama responded with HTTP ${res.status} ${res.statusText}`,
      };
    }

    const data = (await res.json().catch(() => null)) as
      | { models?: unknown[] }
      | null;

    if (!data || !Array.isArray(data.models)) {
      return {
        running: true, // daemon answered with valid JSON, just no models field
        models: [],
        endpoint,
        root,
        reason: "Ollama responded, but no models were returned.",
      };
    }

    const models: OllamaModel[] = [];
    for (const raw of data.models) {
      if (!raw || typeof raw !== "object") continue;
      const m = raw as Record<string, unknown>;
      const name = typeof m.name === "string" ? m.name : "";
      if (!name) continue;
      const digest =
        typeof m.digest === "string" ? m.digest : "";
      const size =
        typeof m.size === "number"
          ? m.size
          : typeof m.size === "string"
            ? Number(m.size) || 0
            : 0;
      const modifiedAt =
        typeof m.modified_at === "string" ? m.modified_at : null;
      // `details` is an optional nested object with parameter_size +
      // quantization_level. Older Ollama versions don't emit it.
      const details =
        m.details && typeof m.details === "object"
          ? (m.details as Record<string, unknown>)
          : {};
      models.push({
        name,
        digest,
        size,
        modifiedAt,
        parameterSize:
          typeof details.parameter_size === "string"
            ? details.parameter_size
            : undefined,
        quantizationLevel:
          typeof details.quantization_level === "string"
            ? details.quantization_level
            : undefined,
      });
    }

    // Sort: alphabetical for stability — Ollama's /api/tags returns in
    // modification-time order which can shuffle on each pull.
    models.sort((a, b) => a.name.localeCompare(b.name));

    return {
      running: true,
      models,
      endpoint,
      root,
    };
  } catch (err) {
    // Distinguish abort (timeout) from real network errors for nicer UI copy.
    const isAbort =
      err instanceof DOMException && err.name === "AbortError";
    return {
      running: false,
      models: [],
      endpoint,
      root,
      reason: isAbort
        ? `Ollama did not respond within ${OLLAMA_DETECT_TIMEOUT_MS}ms.`
        : err instanceof Error
          ? err.message
          : "Ollama not reachable.",
    };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Convenience: just the list of installed Ollama model names. Returns `[]`
 * when Ollama is not running or has no models installed.
 *
 * Used by `getOllamaModels()` callers that don't care about digests / sizes.
 */
export async function getOllamaModels(): Promise<string[]> {
  const detected = await detectOllama();
  return detected.models.map((m) => m.name);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function defaultLabelFor(slot: ChatSlot): string {
  return slot === "complex" ? "Complex tasks model" : "Agents model";
}

// ---------------------------------------------------------------------------
// Transparent re-encryption helpers (fire-and-forget on first plaintext read)
// ---------------------------------------------------------------------------

/**
 * Write back an encrypted version of a legacy plaintext key for a chat slot.
 * Called from `fetchProviderRow` when the stored key isn't yet encrypted.
 * Self-limiting: once the row is encrypted, the caller won't trigger this.
 */
async function maybeReencryptChatRow(
  slot: ChatSlot,
  plaintext: string,
): Promise<void> {
  if (!plaintext || isEncrypted(plaintext)) return;
  try {
    await db.providerConfig.update({
      where: { slot },
      data: { apiKey: encrypt(plaintext) },
    });
    // Bust the cache so the next read picks up the encrypted version.
    dbConfigCache.delete(`provider:${slot}`);
  } catch (err) {
    if (isPrismaMissingTableError(err)) return; // table missing — nothing to do
    throw err;
  }
}

/**
 * Same as `maybeReencryptChatRow` but for specialty service rows.
 */
async function maybeReencryptSpecialtyRow(
  slot: SpecialtySlot,
  plaintext: string,
): Promise<void> {
  if (!plaintext || isEncrypted(plaintext)) return;
  try {
    await db.specialtyServiceConfig.update({
      where: { slot },
      data: { apiKey: encrypt(plaintext) },
    });
    dbConfigCache.delete(`specialty:${slot}`);
  } catch (err) {
    if (isPrismaMissingTableError(err)) return;
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Public: admin reveal (returns DECRYPTED plaintext — use with care)
// ---------------------------------------------------------------------------

/**
 * Returns the DECRYPTED API key for a chat slot.
 *
 * SECURITY: This bypasses masking and returns real plaintext. Only the
 * `POST /api/provider { reveal: true }` admin endpoint should call this.
 * The route layer is responsible for any additional auth checks.
 *
 * Returns `null` if the slot is not configured or the key cannot be
 * decrypted (e.g. wrong machine). Never throws to the caller.
 */
export async function revealProviderKey(
  slot: ChatSlot,
): Promise<string | null> {
  try {
    const row = (await db.providerConfig.findUnique({
      where: { slot },
    })) as ProviderConfigRow | null;
    if (!row || !row.apiKey) return null;
    return decrypt(row.apiKey);
  } catch (err) {
    console.error(`[ai-providers] revealProviderKey(${slot}) failed:`, err);
    return null;
  }
}

/**
 * Returns the DECRYPTED API key for a specialty service slot.
 * Same security caveats as `revealProviderKey`.
 */
export async function revealSpecialtyKey(
  slot: SpecialtySlot,
): Promise<string | null> {
  try {
    const row = (await db.specialtyServiceConfig.findUnique({
      where: { slot },
    })) as SpecialtyServiceConfigRow | null;
    if (!row || !row.apiKey) return null;
    return decrypt(row.apiKey);
  } catch (err) {
    console.error(`[ai-providers] revealSpecialtyKey(${slot}) failed:`, err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Public: encryption diagnostics + bulk re-encrypt (admin tooling)
// ---------------------------------------------------------------------------

export interface EncryptionStats {
  /** Chat-slot keys stored as `enc:` ciphertext. */
  encryptedChat: number;
  /** Chat-slot keys still stored as legacy plaintext. */
  plaintextChat: number;
  /** Specialty keys stored as `enc:` ciphertext. */
  encryptedSpecialty: number;
  /** Specialty keys still stored as legacy plaintext. */
  plaintextSpecialty: number;
  /** Convenience: total across both tables. */
  total: number;
  encrypted_count: number;
  plaintext_count: number;
}

/**
 * Counts how many stored keys are already encrypted vs. legacy plaintext.
 * Used by `/api/provider/verify-encryption` for diagnostics. Returns zeros
 * if the tables don't exist yet (pre-migration).
 */
export async function getEncryptionStats(): Promise<EncryptionStats> {
  let chatRows: ProviderConfigRow[] = [];
  let specialtyRows: SpecialtyServiceConfigRow[] = [];
  try {
    chatRows = (await db.providerConfig.findMany()) as ProviderConfigRow[];
  } catch (err) {
    if (!isPrismaMissingTableError(err)) {
      console.error("[ai-providers] getEncryptionStats chat query failed:", err);
    }
  }
  try {
    specialtyRows = (await db.specialtyServiceConfig.findMany()) as SpecialtyServiceConfigRow[];
  } catch (err) {
    if (!isPrismaMissingTableError(err)) {
      console.error("[ai-providers] getEncryptionStats specialty query failed:", err);
    }
  }

  let encryptedChat = 0;
  let plaintextChat = 0;
  for (const r of chatRows) {
    if (!r.apiKey) continue;
    if (isEncrypted(r.apiKey)) encryptedChat++;
    else plaintextChat++;
  }
  let encryptedSpecialty = 0;
  let plaintextSpecialty = 0;
  for (const r of specialtyRows) {
    if (!r.apiKey) continue;
    if (isEncrypted(r.apiKey)) encryptedSpecialty++;
    else plaintextSpecialty++;
  }

  const encrypted_count = encryptedChat + encryptedSpecialty;
  const plaintext_count = plaintextChat + plaintextSpecialty;

  return {
    encryptedChat,
    plaintextChat,
    encryptedSpecialty,
    plaintextSpecialty,
    total: encrypted_count + plaintext_count,
    encrypted_count,
    plaintext_count,
  };
}

export interface ReencryptResult {
  /** Number of plaintext keys successfully re-encrypted. */
  reencrypted: number;
  /** Number of keys already encrypted (no action needed). */
  alreadyEncrypted: number;
  /** Number of keys that failed to re-encrypt (with slot list). */
  failed: number;
  failedSlots: string[];
}

/**
 * Bulk re-encrypts any plaintext keys found in both ProviderConfig and
 * SpecialtyServiceConfig. Idempotent: keys already encrypted are skipped.
 * Used by `POST /api/provider/verify-encryption`.
 */
export async function reencryptPlaintextKeys(): Promise<ReencryptResult> {
  const result: ReencryptResult = {
    reencrypted: 0,
    alreadyEncrypted: 0,
    failed: 0,
    failedSlots: [],
  };

  // Chat rows
  let chatRows: ProviderConfigRow[] = [];
  try {
    chatRows = (await db.providerConfig.findMany()) as ProviderConfigRow[];
  } catch (err) {
    if (!isPrismaMissingTableError(err)) {
      result.failed++;
      result.failedSlots.push("ProviderConfig:read");
      console.error("[ai-providers] reencrypt chat read failed:", err);
    }
  }
  for (const r of chatRows) {
    if (!r.apiKey) continue;
    if (isEncrypted(r.apiKey)) {
      result.alreadyEncrypted++;
      continue;
    }
    try {
      await db.providerConfig.update({
        where: { slot: r.slot },
        data: { apiKey: encrypt(r.apiKey) },
      });
      result.reencrypted++;
    } catch (err) {
      result.failed++;
      result.failedSlots.push(`chat:${r.slot}`);
      console.error(
        `[ai-providers] reencrypt chat slot ${r.slot} failed:`,
        err,
      );
    }
  }

  // Specialty rows
  let specialtyRows: SpecialtyServiceConfigRow[] = [];
  try {
    specialtyRows = (await db.specialtyServiceConfig.findMany()) as SpecialtyServiceConfigRow[];
  } catch (err) {
    if (!isPrismaMissingTableError(err)) {
      result.failed++;
      result.failedSlots.push("SpecialtyServiceConfig:read");
      console.error("[ai-providers] reencrypt specialty read failed:", err);
    }
  }
  for (const r of specialtyRows) {
    if (!r.apiKey) continue;
    if (isEncrypted(r.apiKey)) {
      result.alreadyEncrypted++;
      continue;
    }
    try {
      await db.specialtyServiceConfig.update({
        where: { slot: r.slot },
        data: { apiKey: encrypt(r.apiKey) },
      });
      result.reencrypted++;
    } catch (err) {
      result.failed++;
      result.failedSlots.push(`specialty:${r.slot}`);
      console.error(
        `[ai-providers] reencrypt specialty slot ${r.slot} failed:`,
        err,
      );
    }
  }

  // Bust all caches so subsequent reads see the freshly-encrypted rows.
  invalidateProviderCache();
  return result;
}
