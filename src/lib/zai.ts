import ZAI from "z-ai-web-dev-sdk";

/**
 * AI Provider configuration.
 *
 * The Z.ai SDK accepts a config object with `baseUrl` and `apiKey`.
 * We read these from environment variables so the app works with
 * ANY OpenAI-compatible AI provider (Z.ai, OpenAI, Azure, Ollama, etc.).
 *
 * Set these in your .env file:
 *   AI_API_KEY=your-key-here
 *   AI_BASE_URL=https://api.example.com/v1
 *
 * If not set, the SDK falls back to its default .z-ai-config file lookup.
 */

interface ZaiConfig {
  apiKey: string;
  baseUrl: string;
}

function loadConfigFromEnv(): ZaiConfig | null {
  const apiKey = process.env.AI_API_KEY?.trim();
  const baseUrl = process.env.AI_BASE_URL?.trim();
  if (apiKey && baseUrl) {
    return { apiKey, baseUrl };
  }
  return null;
}

let zaiInstance: Awaited<ReturnType<typeof ZAI.create>> | null = null;

export async function getZai() {
  if (!zaiInstance) {
    const envConfig = loadConfigFromEnv();
    if (envConfig) {
      // Use explicit env configuration (works with any OpenAI-compatible provider)
      zaiInstance = await ZAI.create(envConfig);
    } else {
      // Fall back to the SDK's default config file lookup (.z-ai-config)
      zaiInstance = await ZAI.create();
    }
  }
  return zaiInstance;
}

export type ZaiClient = Awaited<ReturnType<typeof ZAI.create>>;

/**
 * Returns the current provider configuration status (without exposing the key).
 * Used by the settings UI to show whether a key is configured.
 */
export function getProviderStatus(): {
  configured: boolean;
  source: "env" | "config-file" | "none";
  baseUrl?: string;
} {
  const envConfig = loadConfigFromEnv();
  if (envConfig) {
    return { configured: true, source: "env", baseUrl: envConfig.baseUrl };
  }
  // The SDK will try .z-ai-config on create — we can't know without reading the file,
  // so report "config-file" optimistically (the SDK will throw on create if missing).
  return { configured: false, source: "none" };
}
