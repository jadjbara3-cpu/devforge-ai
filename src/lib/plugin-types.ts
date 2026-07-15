/**
 * DevForge Plugin System — Type Definitions
 * ===========================================
 *
 * A plugin extends DevForge AI with a new "tool" that appears in the sidebar
 * and command palette, renders its own UI in the main area, and (optionally)
 * provides API routes.
 *
 * Plugin files live under `src/plugins/<id>/plugin.tsx` and are referenced by
 * the central registry at `src/plugins/index.ts`. Each plugin's component is
 * lazy-loaded via `next/dynamic` so it lands in its own JS chunk and does NOT
 * bloat the initial bundle.
 *
 * See `src/plugins/_template/plugin.tsx` for a fully commented starter.
 */

import type React from "react";

export type PluginCategory = "tool" | "ai" | "utility" | "game";

export type PluginPosition = "sidebar" | "command-palette-only";

/**
 * The full shape of a DevForge plugin.
 *
 * `component` is a `React.ComponentType` — in practice the registry wraps each
 * plugin's `default` export with `next/dynamic({ ssr: false })` so the actual
 * implementation is fetched on first render.
 */
export interface DevForgePlugin {
  /** Unique identifier, e.g. `"translator"`. Used as the active-view key. */
  id: string;
  /** Human-readable display name shown in the sidebar / command palette. */
  name: string;
  /** Short one-line description (tooltip / palette hint). */
  description: string;
  /** Lucide icon name, e.g. `"Languages"`, `"Braces"`, `"StickyNote"`. */
  icon: string;
  /** High-level bucket used to group plugins in the UI. */
  category: PluginCategory;
  /** Whether the plugin is currently enabled (user-controlled). */
  enabled: boolean;
  /** Where the plugin shows up. Defaults to "sidebar" if omitted. */
  position?: PluginPosition;

  /**
   * The React component rendered in the main area when the plugin is active.
   * Must be a Client Component (`"use client"` at the top of the file).
   */
  component: React.ComponentType;

  /** Optional API routes the plugin exposes (mounted under `/api/plugin/<id>`). */
  apiRoutes?: PluginApiRoute[];

  /** Optional settings the plugin exposes (rendered in the Plugin Manager). */
  settings?: PluginSetting[];

  /** Optional author / version metadata for the Plugin Manager UI. */
  author?: string;
  version?: string;
}

export interface PluginApiRoute {
  /** Sub-path under `/api/plugin/<id>/`, e.g. `"/translate"`. */
  path: string;
  method: "GET" | "POST";
  handler: (req: Request) => Promise<Response>;
}

export interface PluginSetting {
  key: string;
  label: string;
  type: "string" | "number" | "boolean" | "select";
  default: string | number | boolean;
  options?: { label: string; value: string | number | boolean }[];
  /** Optional helper text shown under the field. */
  description?: string;
}

/**
 * Lightweight metadata used by the registry & UI before the plugin component
 * is loaded. Stripped of the `component` / `apiRoutes` / `settings` heavy
 * fields so it can be safely imported into the sidebar without pulling in
 * the plugin's runtime dependencies.
 */
export type PluginMeta = Omit<
  DevForgePlugin,
  "component" | "apiRoutes" | "settings"
> & {
  /** Optional settings (kept here so the Plugin Manager can render them). */
  settings?: PluginSetting[];
};

/** Per-plugin setting values, keyed by setting key. */
export type PluginSettings = Record<string, string | number | boolean>;
