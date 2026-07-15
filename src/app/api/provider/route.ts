import { NextResponse, type NextRequest } from "next/server";

import {
  getProviderStatus,
  getSpecialtyStatus,
  upsertProviderConfig,
  upsertSpecialtyConfig,
  disableProviderConfig,
  disableSpecialtyConfig,
  invalidateProviderCache,
  revealProviderKey,
  revealSpecialtyKey,
  type ChatSlot,
  type SpecialtySlot,
  type ProviderType,
} from "@/lib/ai-providers";

export const dynamic = "force-dynamic";

const VALID_CHAT_SLOTS = new Set<ChatSlot>(["complex", "agents"]);
const VALID_SPECIALTY_SLOTS = new Set<SpecialtySlot>([
  "image",
  "tts",
  "asr",
  "web",
]);
const VALID_PROVIDER_TYPES = new Set<ProviderType | string>([
  "openai",
  "deepseek",
  "zai",
  "groq",
  "together",
  "ollama",
  "custom",
]);

/**
 * GET /api/provider
 *
 * Returns the status of all chat slots + specialty services. Keys are masked
 * (`sk-1****wxyz` format) — the encrypted ciphertext is never returned, and
 * the decrypted plaintext is never returned either. Use POST with
 * `reveal: true` to fetch the real key for the UI "show key" feature.
 */
export async function GET() {
  try {
    const [complex, agents, image, tts, asr, web] = await Promise.all([
      getProviderStatus("complex"),
      getProviderStatus("agents"),
      getSpecialtyStatus("image"),
      getSpecialtyStatus("tts"),
      getSpecialtyStatus("asr"),
      getSpecialtyStatus("web"),
    ]);

    return NextResponse.json({
      chat: { complex, agents },
      specialty: { image, tts, asr, web },
    });
  } catch (err) {
    console.error("[provider] GET failed:", err);
    const message =
      err instanceof Error ? err.message : "Unexpected server error.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * POST /api/provider
 *
 * Body shapes:
 *   - { slot: "complex"|"agents", providerType, baseUrl, apiKey, model,
 *       temperature?, maxTokens?, enabled?, label? }
 *   - { slot: "image"|"tts"|"asr"|"web", apiKey, baseUrl?, enabled? }
 *   - { slot, reveal: true }  → returns the DECRYPTED key for admin "show key"
 *
 * Persists the config (DB-backed, hot-swap) and invalidates the cache.
 * `apiKey` is encrypted (AES-256-GCM, machine-bound) before being written.
 *
 * If `apiKey` is empty/omitted on a save request AND the slot already exists,
 * the existing key is preserved (lets the UI save other fields without
 * re-entering the key).
 */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => null)) as
      | Record<string, unknown>
      | null;

    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { error: "Invalid request body." },
        { status: 400 },
      );
    }

    const slot = typeof body.slot === "string" ? body.slot.trim() : "";

    // Admin "reveal" path — bypasses the save flow and returns the
    // DECRYPTED key. The route layer trusts the local admin context
    // (single-user desktop app); add auth here if this ever ships multi-user.
    if (body.reveal === true) {
      return await handleReveal(slot, body);
    }

    if (VALID_CHAT_SLOTS.has(slot as ChatSlot)) {
      return await handleChatUpsert(slot as ChatSlot, body);
    }
    if (VALID_SPECIALTY_SLOTS.has(slot as SpecialtySlot)) {
      return await handleSpecialtyUpsert(slot as SpecialtySlot, body);
    }

    return NextResponse.json(
      {
        error:
          "'slot' must be one of: complex, agents, image, tts, asr, web.",
      },
      { status: 400 },
    );
  } catch (err) {
    console.error("[provider] POST failed:", err);
    const message =
      err instanceof Error ? err.message : "Unexpected server error.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * DELETE /api/provider?slot=<slot>
 *
 * Disables a chat or specialty slot (does not delete the row — preserves
 * history so the user can re-enable later by saving again).
 */
export async function DELETE(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const slot = url.searchParams.get("slot")?.trim() || "";

    if (VALID_CHAT_SLOTS.has(slot as ChatSlot)) {
      await disableProviderConfig(slot as ChatSlot);
      invalidateProviderCache(slot as ChatSlot);
      return NextResponse.json({ ok: true, slot, disabled: true });
    }
    if (VALID_SPECIALTY_SLOTS.has(slot as SpecialtySlot)) {
      await disableSpecialtyConfig(slot as SpecialtySlot);
      invalidateProviderCache(slot as SpecialtySlot);
      return NextResponse.json({ ok: true, slot, disabled: true });
    }

    return NextResponse.json(
      { error: "Invalid or missing 'slot' query parameter." },
      { status: 400 },
    );
  } catch (err) {
    console.error("[provider] DELETE failed:", err);
    const message =
      err instanceof Error ? err.message : "Unexpected server error.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------

/**
 * Handle `{ slot, reveal: true }` — returns the DECRYPTED API key for the
 * UI "show key" feature. This is the ONLY endpoint that returns plaintext
 * keys to the browser. Add auth gating here if the app ever ships multi-user.
 */
async function handleReveal(
  slot: string,
  body: Record<string, unknown>,
): Promise<Response> {
  // Optional admin confirmation token — the UI should send `confirm: true`
  // to acknowledge it really wants the plaintext. Currently advisory; the
  // desktop app is single-user so we don't enforce a secret.
  const confirm = body.confirm === true;

  if (VALID_CHAT_SLOTS.has(slot as ChatSlot)) {
    const apiKey = await revealProviderKey(slot as ChatSlot);
    if (apiKey === null) {
      return NextResponse.json(
        { error: `No API key stored for slot "${slot}".` },
        { status: 404 },
      );
    }
    return NextResponse.json({
      ok: true,
      slot,
      apiKey,
      confirm,
      warning:
        "Decrypted key returned in plaintext — handle with care.",
    });
  }
  if (VALID_SPECIALTY_SLOTS.has(slot as SpecialtySlot)) {
    const apiKey = await revealSpecialtyKey(slot as SpecialtySlot);
    if (apiKey === null) {
      return NextResponse.json(
        { error: `No API key stored for specialty slot "${slot}".` },
        { status: 404 },
      );
    }
    return NextResponse.json({
      ok: true,
      slot,
      apiKey,
      confirm,
      warning:
        "Decrypted key returned in plaintext — handle with care.",
    });
  }
  return NextResponse.json(
    { error: "'slot' is required for reveal." },
    { status: 400 },
  );
}

async function handleChatUpsert(
  slot: ChatSlot,
  body: Record<string, unknown>,
): Promise<Response> {
  const apiKeyRaw =
    typeof body.apiKey === "string" ? body.apiKey.trim() : "";
  const baseUrl = typeof body.baseUrl === "string" ? body.baseUrl.trim() : "";
  const model = typeof body.model === "string" ? body.model.trim() : "";
  const providerType =
    typeof body.providerType === "string" ? body.providerType.trim() : "custom";
  const label =
    typeof body.label === "string" && body.label.trim()
      ? body.label.trim()
      : undefined;
  const enabled =
    typeof body.enabled === "boolean" ? body.enabled : true;
  const temperature =
    typeof body.temperature === "number" && Number.isFinite(body.temperature)
      ? body.temperature
      : null;
  const maxTokens =
    typeof body.maxTokens === "number" && Number.isFinite(body.maxTokens)
      ? Math.floor(body.maxTokens)
      : null;

  // If no apiKey was sent, preserve the existing one (lets the UI save other
  // fields without re-entering the key). `revealProviderKey` returns the
  // decrypted plaintext — we re-encrypt on save, so passing the plaintext
  // through `upsertProviderConfig` is fine and idempotent.
  let apiKey = apiKeyRaw;
  if (!apiKey) {
    const existing = await revealProviderKey(slot);
    if (!existing) {
      return NextResponse.json(
        {
          error:
            "'apiKey' is required for a new configuration. Enter a key or reveal the existing one first.",
        },
        { status: 400 },
      );
    }
    apiKey = existing;
  }

  if (!baseUrl) {
    return NextResponse.json(
      { error: "'baseUrl' is required." },
      { status: 400 },
    );
  }
  if (!model) {
    return NextResponse.json(
      { error: "'model' is required (e.g. deepseek-chat, gpt-4o-mini)." },
      { status: 400 },
    );
  }
  if (!VALID_PROVIDER_TYPES.has(providerType)) {
    return NextResponse.json(
      { error: `Unknown providerType: ${providerType}` },
      { status: 400 },
    );
  }

  try {
    const row = await upsertProviderConfig({
      slot,
      label,
      providerType,
      baseUrl,
      apiKey,
      model,
      temperature,
      maxTokens,
      enabled,
    });
    invalidateProviderCache(slot);

    return NextResponse.json({
      ok: true,
      slot,
      message: `Configuration saved — ${providerType} / ${model}.`,
      savedAt: row.updatedAt,
    });
  } catch (err) {
    console.error("[provider] chat upsert failed:", err);
    const message =
      err instanceof Error ? err.message : "Failed to save configuration.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

async function handleSpecialtyUpsert(
  slot: SpecialtySlot,
  body: Record<string, unknown>,
): Promise<Response> {
  const apiKeyRaw =
    typeof body.apiKey === "string" ? body.apiKey.trim() : "";
  const baseUrl =
    typeof body.baseUrl === "string" && body.baseUrl.trim()
      ? body.baseUrl.trim()
      : undefined;
  const enabled =
    typeof body.enabled === "boolean" ? body.enabled : true;

  // Preserve existing key if the UI didn't send one (see handleChatUpsert).
  let apiKey = apiKeyRaw;
  if (!apiKey) {
    const existing = await revealSpecialtyKey(slot);
    if (!existing) {
      return NextResponse.json(
        { error: "'apiKey' is required for a new specialty configuration." },
        { status: 400 },
      );
    }
    apiKey = existing;
  }

  try {
    const row = await upsertSpecialtyConfig({ slot, apiKey, baseUrl, enabled });
    invalidateProviderCache(slot);

    return NextResponse.json({
      ok: true,
      slot,
      message: `Specialty service "${slot}" ${enabled ? "enabled" : "saved"}.`,
      savedAt: row.updatedAt,
    });
  } catch (err) {
    console.error("[provider] specialty upsert failed:", err);
    const message =
      err instanceof Error ? err.message : "Failed to save specialty config.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
