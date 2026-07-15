/**
 * Backward-compatibility shim. New code should import from `@/lib/ai-providers`
 * directly. This file re-exports the legacy `getZai` / `getProviderStatus`
 * shapes so existing API routes keep working during the migration.
 */

import ZAI from "z-ai-web-dev-sdk";

import {
  getZaiClient,
  invalidateProviderCache,
} from "@/lib/ai-providers";

export type ZaiClient = Awaited<ReturnType<typeof ZAI.create>>;

/**
 * Legacy singleton accessor. Delegates to `getZaiClient("web")` so existing
 * callers (image / tts / asr / web routes) keep working. The returned client
 * is TTL-cached in ai-providers.ts; call `invalidateZaiCache()` to reset.
 */
export async function getZai(): Promise<ZaiClient> {
  const { client } = await getZaiClient("web");
  if (!client) {
    throw new Error(
      "Z.ai specialty services are not configured. Open Settings → Specialty services to add a Z.ai API key.",
    );
  }
  return client;
}

/**
 * Legacy status accessor. Returns a shape close to the old
 * `{ configured, source, baseUrl }` for callers that haven't migrated.
 *
 * NOTE: Synchronous best-effort — we cannot await DB here. The new async
 * `getProviderStatus(slot)` lives in `@/lib/ai-providers` (re-exported below
 * as `getProviderStatusAsync` for migration).
 */
export function getProviderStatus(): {
  configured: boolean;
  source: "env" | "config-file" | "none";
  baseUrl?: string;
} {
  const envKey = process.env.AI_API_KEY?.trim();
  const envBase = process.env.AI_BASE_URL?.trim();
  if (envKey && envBase) {
    return { configured: true, source: "env", baseUrl: envBase };
  }
  return { configured: false, source: "none" };
}

/**
 * Invalidate the Z.ai client cache. Call after saving a new specialty
 * config so the next request rebuilds the client.
 */
export function invalidateZaiCache(): void {
  invalidateProviderCache();
}

// Re-export the new orchestration API so importers can migrate cleanly.
export {
  getZaiClient,
  getProviderStatus as getProviderStatusAsync,
  invalidateProviderCache,
} from "@/lib/ai-providers";
