/**
 * Plugin Registry — Single Source of Truth
 * ==========================================
 *
 * Every plugin that ships with DevForge AI is listed here. To add a new
 * plugin:
 *
 *   1. Create `src/plugins/<your-id>/plugin.tsx` with a default export
 *      (a React Client Component).
 *   2. (Optional) Create API routes under
 *      `src/app/api/plugin/<your-id>/...`.
 *   3. Add a metadata entry to `BUILTIN_PLUGINS` below, using `lazy(...)`
 *      for the `component` field so the plugin's code lands in its own JS
 *      chunk and is fetched on first render.
 *   4. (Optional) Add an entry to `src/plugins/registry.json` to override
 *      the default `enabled` state.
 *
 * The metadata here is what the sidebar / command palette / Plugin Manager
 * read at startup — heavy plugin dependencies (syntax highlighters, markdown
 * renderers, etc.) are NOT imported until the user actually opens the plugin.
 */

"use client";

import type { ComponentType } from "react";
import dynamic from "next/dynamic";

import type { DevForgePlugin, PluginSetting } from "@/lib/plugin-types";

// ---------------------------------------------------------------------------
// Loading skeleton shown while a plugin chunk is being fetched
// ---------------------------------------------------------------------------

function PluginSkeleton() {
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-4 py-8">
      <div className="h-8 w-48 animate-pulse rounded bg-muted/60" />
      <div className="h-4 w-full animate-pulse rounded bg-muted/40" />
      <div className="h-4 w-2/3 animate-pulse rounded bg-muted/40" />
      <div className="h-32 w-full animate-pulse rounded bg-muted/30" />
    </div>
  );
}

/**
 * Wrap a plugin's default export with `next/dynamic({ ssr: false })` so the
 * plugin's code is split into its own chunk and only fetched when the user
 * actually opens the plugin.
 */
function lazy(
  loader: () => Promise<{ default: ComponentType }>,
): ComponentType {
  return dynamic(loader, {
    ssr: false,
    loading: () => <PluginSkeleton />,
  }) as ComponentType;
}

// ---------------------------------------------------------------------------
// Optional plugin settings — rendered by the Plugin Manager
// ---------------------------------------------------------------------------

const translatorSettings: PluginSetting[] = [
  {
    key: "defaultTarget",
    label: "Default target language",
    type: "select",
    default: "en",
    description: "Language the translator defaults to on open.",
    options: [
      { label: "English", value: "en" },
      { label: "Arabic", value: "ar" },
      { label: "French", value: "fr" },
      { label: "Spanish", value: "es" },
      { label: "German", value: "de" },
      { label: "Chinese", value: "zh" },
      { label: "Japanese", value: "ja" },
    ],
  },
];

const codeFormatterSettings: PluginSetting[] = [
  {
    key: "defaultStyle",
    label: "Default formatting style",
    type: "select",
    default: "clean",
    description: "Style preset selected on open.",
    options: [
      { label: "Clean (Prettier-like)", value: "clean" },
      { label: "Compact", value: "compact" },
      { label: "Verbose (with comments)", value: "verbose" },
    ],
  },
];

const quickNotesSettings: PluginSetting[] = [
  {
    key: "defaultColor",
    label: "Default note color",
    type: "select",
    default: "amber",
    description: "Color applied to new notes by default.",
    options: [
      { label: "Amber", value: "amber" },
      { label: "Emerald", value: "emerald" },
      { label: "Sky", value: "sky" },
      { label: "Fuchsia", value: "fuchsia" },
      { label: "Violet", value: "violet" },
      { label: "Rose", value: "rose" },
      { label: "Neutral", value: "zinc" },
    ],
  },
];

// ---------------------------------------------------------------------------
// The built-in plugin manifest
// ---------------------------------------------------------------------------

export const BUILTIN_PLUGINS: DevForgePlugin[] = [
  {
    id: "translator",
    name: "Translator",
    description:
      "Translate text between 20+ languages using your AI provider.",
    icon: "Languages",
    category: "ai",
    enabled: true,
    position: "sidebar",
    component: lazy(() => import("./translator/plugin")),
    settings: translatorSettings,
    author: "DevForge",
    version: "1.0.0",
  },
  {
    id: "code-formatter",
    name: "Code Formatter",
    description:
      "Reformat source code with the Complex tasks model. Preserves behaviour.",
    icon: "Braces",
    category: "tool",
    enabled: true,
    position: "sidebar",
    component: lazy(() => import("./code-formatter/plugin")),
    settings: codeFormatterSettings,
    author: "DevForge",
    version: "1.0.0",
  },
  {
    id: "quick-notes",
    name: "Quick Notes",
    description:
      "Lightweight notes saved to your browser. No AI, no server — fully private.",
    icon: "StickyNote",
    category: "utility",
    enabled: true,
    position: "sidebar",
    component: lazy(() => import("./quick-notes/plugin")),
    settings: quickNotesSettings,
    author: "DevForge",
    version: "1.0.0",
  },
];
