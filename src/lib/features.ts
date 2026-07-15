/**
 * Feature registry for DevForge AI.
 *
 * The 9 built-in Workspace features are listed in `FEATURES` and their display
 * metadata in `FEATURE_META`. Plugins extend this set at runtime — see
 * `lib/plugin-registry.ts` and `plugins/index.ts`.
 *
 * `ViewKey` is the union of built-in feature keys + arbitrary plugin ids
 * (strings). Use `isFeatureKey(k)` to narrow to the built-in set.
 *
 * The 5 Assistant features (Task 1-C) live in `ASSISTANT_FEATURES` /
 * `ASSISTANT_META`. They're built-in (not plugins) and appear in their own
 * "ASSISTANT" sidebar section.
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
  "computer",
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
  computer: { title: "Computer Use", tagline: "Local AI agent that controls Windows" },
};

// ---------------------------------------------------------------------------
// Assistant features (Task 1-C)
// ---------------------------------------------------------------------------

export const ASSISTANT_FEATURES = [
  "clipboard",
  "quickactions",
  "workflow",
  "proactive",
  "screens",
] as const;

export type AssistantFeatureKey = (typeof ASSISTANT_FEATURES)[number];

export const ASSISTANT_META: Record<
  AssistantFeatureKey,
  { title: string; tagline: string }
> = {
  clipboard: { title: "Smart Clipboard", tagline: "AI-powered clipboard history" },
  quickactions: { title: "Quick Actions", tagline: "Raycast-style command overlay" },
  workflow: { title: "Workflow Studio", tagline: "Record & replay UI actions" },
  proactive: { title: "Proactive AI", tagline: "Anticipates what you need" },
  screens: { title: "Multi-Screen", tagline: "One AI per monitor" },
};

// ---------------------------------------------------------------------------
// Plugin-aware view keys
// ---------------------------------------------------------------------------

/**
 * A view key is either a built-in feature key (Workspace or Assistant),
 * or a plugin id (arbitrary string). Components that accept a view key
 * should use `isFeatureKey(k)` / `isAssistantKey(k)` to narrow before
 * indexing into the metadata maps.
 */
export type ViewKey = FeatureKey | AssistantFeatureKey | string;

/** Set of built-in Workspace feature keys — used by `isFeatureKey` for O(1) lookup. */
const FEATURE_KEY_SET: ReadonlySet<string> = new Set(FEATURES);

/** Set of built-in Assistant feature keys. */
const ASSISTANT_KEY_SET: ReadonlySet<string> = new Set(ASSISTANT_FEATURES);

/** Union set of all built-in keys (Workspace + Assistant). */
const ALL_BUILTIN_SET: ReadonlySet<string> = new Set([
  ...FEATURES,
  ...ASSISTANT_FEATURES,
]);

/**
 * Type guard: returns true if `k` is one of the 8 built-in Workspace
 * feature keys (NOT an Assistant key, NOT a plugin id).
 */
export function isFeatureKey(k: ViewKey): k is FeatureKey {
  return FEATURE_KEY_SET.has(k as string);
}

/**
 * Type guard: returns true if `k` is one of the 5 Assistant feature keys
 * added in Task 1-C.
 */
export function isAssistantKey(k: ViewKey): k is AssistantFeatureKey {
  return ASSISTANT_KEY_SET.has(k as string);
}

/**
 * Type guard: returns true if `k` is any built-in key (Workspace or
 * Assistant). Useful when you want to know "is this a plugin id?".
 */
export function isBuiltinKey(
  k: ViewKey,
): k is FeatureKey | AssistantFeatureKey {
  return ALL_BUILTIN_SET.has(k as string);
}
