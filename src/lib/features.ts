/**
 * Feature registry for DevForge AI.
 *
 * The 8 built-in features are listed in `FEATURES` and their display
 * metadata in `FEATURE_META`. Plugins extend this set at runtime — see
 * `lib/plugin-registry.ts` and `plugins/index.ts`.
 *
 * `ViewKey` is the union of built-in feature keys + arbitrary plugin ids
 * (strings). Use `isFeatureKey(k)` to narrow to the built-in set.
 */

export const FEATURES = [
  "overview",
  "chat",
  "image",
  "vision",
  "voice",
  "web",
  "snippets",
  "board",
] as const;

export type FeatureKey = (typeof FEATURES)[number];

export const FEATURE_META: Record<
  FeatureKey,
  { title: string; tagline: string }
> = {
  overview: { title: "Overview", tagline: "Your AI developer command center" },
  chat: { title: "AI Chat", tagline: "Multi-turn LLM conversations" },
  image: { title: "Image Studio", tagline: "Generate visuals from prompts" },
  vision: { title: "Vision Lab", tagline: "Understand images with AI" },
  voice: { title: "Voice Lab", tagline: "Speech synthesis & recognition" },
  web: { title: "Web Intelligence", tagline: "Search & read the live web" },
  snippets: { title: "Snippet Vault", tagline: "Your personal code library" },
  board: { title: "Task Board", tagline: "Real-time collaborative kanban" },
};

// ---------------------------------------------------------------------------
// Plugin-aware view keys
// ---------------------------------------------------------------------------

/**
 * A view key is either a built-in feature key or a plugin id (arbitrary
 * string). Components that accept a view key should use `isFeatureKey(k)` to
 * narrow before indexing into `FEATURE_META`.
 */
export type ViewKey = FeatureKey | string;

/** Set of built-in feature keys — used by `isFeatureKey` for O(1) lookup. */
const FEATURE_KEY_SET: ReadonlySet<string> = new Set(FEATURES);

/**
 * Type guard: returns true if `k` is one of the 8 built-in feature keys
 * (NOT a plugin id).
 */
export function isFeatureKey(k: ViewKey): k is FeatureKey {
  return FEATURE_KEY_SET.has(k as string);
}
