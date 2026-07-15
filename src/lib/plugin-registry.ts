/**
 * DevForge Plugin Registry
 * =========================
 *
 * Single in-memory registry of all known plugins (built-in + dynamically
 * registered). The built-in list comes from `@/plugins` (which lazy-loads
 * each plugin's component via `next/dynamic`).
 *
 * The registry is reactive: components subscribe via `usePluginRegistry()`
 * (built on `useSyncExternalStore`) and re-render whenever the set of
 * enabled plugins changes.
 *
 * Persistence:
 *   • enable/disable state        → localStorage("devforge-plugins-enabled")
 *   • per-plugin settings values  → localStorage("devforge-plugins-settings")
 *   • a static `plugins/registry.json` ships with the app and seeds the
 *     default enabled/disabled state on first run.
 *
 * NOTE: This module is CLIENT-ONLY. It must not be imported from a Server
 * Component or a route handler.
 */

"use client";

import * as React from "react";

import type {
  DevForgePlugin,
  PluginMeta,
  PluginSettings,
} from "@/lib/plugin-types";
import { BUILTIN_PLUGINS } from "@/plugins";

// ---------------------------------------------------------------------------
// Persistence keys
// ---------------------------------------------------------------------------

const ENABLED_KEY = "devforge-plugins-enabled-v1";
const SETTINGS_KEY = "devforge-plugins-settings-v1";

/**
 * Shape of the per-plugin entry in `plugins/registry.json`.
 * Stored as `{ [pluginId]: { enabled: boolean } }`.
 */
interface RegistryEntry {
  enabled: boolean;
}
type RegistryFile = Record<string, RegistryEntry>;

// ---------------------------------------------------------------------------
// In-memory store (singleton)
// ---------------------------------------------------------------------------

interface RegistryState {
  /** All registered plugins (full objects, including lazy components). */
  plugins: DevForgePlugin[];
  /** Map of pluginId → enabled. Source of truth for the toggle state. */
  enabledMap: Record<string, boolean>;
  /** Map of pluginId → settings values. */
  settingsMap: Record<string, PluginSettings>;
}

let state: RegistryState = {
  plugins: [...BUILTIN_PLUGINS],
  enabledMap: {},
  settingsMap: {},
};

const listeners = new Set<() => void>();

function notify() {
  for (const l of listeners) {
    try {
      l();
    } catch {
      /* swallow — a faulty subscriber must not break others */
    }
  }
}

function setState(next: Partial<RegistryState>) {
  state = { ...state, ...next };
  notify();
}

// ---------------------------------------------------------------------------
// localStorage hydration
// ---------------------------------------------------------------------------

/** Seed defaults from the in-tree registry.json + per-plugin `enabled` flag. */
function seedDefaults(): Record<string, boolean> {
  const defaults: Record<string, boolean> = {};
  for (const p of state.plugins) {
    defaults[p.id] = p.enabled;
  }
  return defaults;
}

function readEnabledMap(): Record<string, boolean> {
  if (typeof window === "undefined") return seedDefaults();
  try {
    const raw = window.localStorage.getItem(ENABLED_KEY);
    if (!raw) return seedDefaults();
    const parsed = JSON.parse(raw) as Record<string, boolean>;
    // Merge with defaults so newly-added built-in plugins appear.
    return { ...seedDefaults(), ...parsed };
  } catch {
    return seedDefaults();
  }
}

function writeEnabledMap(map: Record<string, boolean>) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(ENABLED_KEY, JSON.stringify(map));
  } catch {
    /* quota / privacy mode — ignore */
  }
}

function readSettingsMap(): Record<string, PluginSettings> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(SETTINGS_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as Record<string, PluginSettings>;
  } catch {
    return {};
  }
}

function writeSettingsMap(map: Record<string, PluginSettings>) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(map));
  } catch {
    /* ignore */
  }
}

/**
 * Hydrate from localStorage exactly once on the client. Called from a
 * `useEffect` inside the `PluginRegistryProvider`.
 */
let hydrated = false;
function hydrate() {
  if (hydrated) return;
  hydrated = true;
  setState({
    enabledMap: readEnabledMap(),
    settingsMap: readSettingsMap(),
  });
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Returns the full list of registered plugins (enabled and disabled). */
export function getAllPlugins(): DevForgePlugin[] {
  return state.plugins;
}

/** Returns only enabled plugins (in registry order). */
export function getEnabledPlugins(): DevForgePlugin[] {
  return state.plugins.filter(
    (p) => state.enabledMap[p.id] ?? p.enabled,
  );
}

/** Returns only enabled plugins whose `position` is "sidebar" (or unset). */
export function getSidebarPlugins(): DevForgePlugin[] {
  return getEnabledPlugins().filter(
    (p) => p.position !== "command-palette-only",
  );
}

/** Returns only enabled plugins (any position) — for the command palette. */
export function getPalettePlugins(): DevForgePlugin[] {
  return getEnabledPlugins();
}

/** Look up a single plugin by id (returns `undefined` if not found). */
export function getPlugin(id: string): DevForgePlugin | undefined {
  return state.plugins.find((p) => p.id === id);
}

/** Returns true if the plugin exists AND is enabled. */
export function isPluginEnabled(id: string): boolean {
  const p = getPlugin(id);
  if (!p) return false;
  return state.enabledMap[id] ?? p.enabled;
}

/** Enable a plugin by id. Persists to localStorage and notifies subscribers. */
export function enablePlugin(id: string): void {
  if (!getPlugin(id)) return;
  const next = { ...state.enabledMap, [id]: true };
  writeEnabledMap(next);
  setState({ enabledMap: next });
}

/** Disable a plugin by id. Persists and notifies. */
export function disablePlugin(id: string): void {
  if (!getPlugin(id)) return;
  const next = { ...state.enabledMap, [id]: false };
  writeEnabledMap(next);
  setState({ enabledMap: next });
}

/** Toggle a plugin's enabled state. Returns the new state. */
export function togglePlugin(id: string): boolean {
  if (isPluginEnabled(id)) {
    disablePlugin(id);
    return false;
  }
  enablePlugin(id);
  return true;
}

/**
 * Register a plugin at runtime (used by user-loaded plugins and tests).
 * If a plugin with the same id already exists, it is replaced.
 */
export function registerPlugin(plugin: DevForgePlugin): void {
  const others = state.plugins.filter((p) => p.id !== plugin.id);
  setState({
    plugins: [...others, plugin],
    enabledMap: {
      ...state.enabledMap,
      [plugin.id]: state.enabledMap[plugin.id] ?? plugin.enabled,
    },
  });
}

/** Bulk-set the enabled state. Used by the Plugin Manager's "reset" action. */
export function setEnabledMap(map: Record<string, boolean>): void {
  writeEnabledMap(map);
  setState({ enabledMap: { ...seedDefaults(), ...map } });
}

// ---------------------------------------------------------------------------
// Per-plugin settings
// ---------------------------------------------------------------------------

/** Get the stored settings for a plugin, merged with defaults. */
export function getPluginSettings(id: string): PluginSettings {
  const plugin = getPlugin(id);
  if (!plugin || !plugin.settings) return {};
  const defaults: PluginSettings = {};
  for (const s of plugin.settings) defaults[s.key] = s.default;
  return { ...defaults, ...(state.settingsMap[id] ?? {}) };
}

/** Persist a single setting value for a plugin. */
export function setPluginSetting(
  id: string,
  key: string,
  value: string | number | boolean,
): void {
  const current = state.settingsMap[id] ?? {};
  const next = { ...state.settingsMap, [id]: { ...current, [key]: value } };
  writeSettingsMap(next);
  setState({ settingsMap: next });
}

// ---------------------------------------------------------------------------
// React bindings
// ---------------------------------------------------------------------------

/** Subscribe to registry changes (for `useSyncExternalStore`). */
function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Snapshot used by `useSyncExternalStore`. */
function getSnapshot(): RegistryState {
  return state;
}

/**
 * Hook: subscribe a component to the registry. Re-renders on every enable /
 * disable / settings change. Triggers one-time localStorage hydration on
 * first mount.
 */
export function usePluginRegistry(): RegistryState {
  // Hydrate from localStorage exactly once on the client.
  React.useEffect(() => {
    hydrate();
  }, []);
  return React.useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/**
 * Hook: returns the array of enabled sidebar plugins. Re-renders when the
 * set of enabled plugins changes.
 */
export function useSidebarPlugins(): DevForgePlugin[] {
  usePluginRegistry();
  return getSidebarPlugins();
}

/** Hook: returns the array of all enabled plugins (any position). */
export function usePalettePlugins(): DevForgePlugin[] {
  usePluginRegistry();
  return getPalettePlugins();
}

/**
 * Hook: returns `[enabled, toggle]` for a single plugin. Useful for the
 * Plugin Manager's toggle switches.
 */
export function usePluginEnabled(id: string): [boolean, () => void] {
  usePluginRegistry();
  const enabled = isPluginEnabled(id);
  const toggle = React.useCallback(() => {
    togglePlugin(id);
  }, [id]);
  return [enabled, toggle];
}

// ---------------------------------------------------------------------------
// Lucide icon resolver
// ---------------------------------------------------------------------------

/**
 * Map of supported plugin icon names → Lucide components. The sidebar &
 * command palette look up icons here so plugin authors can use a string in
 * their metadata (keeping the metadata JSON-serialisable).
 *
 * Add new icons to this map as needed.
 */
import {
  Sparkles,
  Bot,
  Image as ImageIcon,
  Eye,
  AudioLines,
  Globe,
  Code2,
  KanbanSquare,
  Languages,
  Braces,
  StickyNote,
  Puzzle,
  Wrench,
  Calculator,
  Calendar,
  Clock,
  Mail,
  FileText,
  Hash,
  Palette,
  Music,
  Camera,
  Table,
  TreePine,
  Zap,
  ClipboardList,
  Command,
  Workflow,
  Bell,
  MonitorSmartphone,
  Wand2,
  ScanLine,
} from "lucide-react";

export const PLUGIN_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  Sparkles,
  Bot,
  Image: ImageIcon,
  ImageIcon,
  Eye,
  AudioLines,
  Globe,
  Code2,
  KanbanSquare,
  Languages,
  Braces,
  StickyNote,
  Puzzle,
  Wrench,
  Calculator,
  Calendar,
  Clock,
  Mail,
  FileText,
  Hash,
  Palette,
  Music,
  Camera,
  Table,
  TreePine,
  Zap,
  ClipboardList,
  Command,
  Workflow,
  Bell,
  MonitorSmartphone,
  Wand2,
  ScanLine,
};

/** Resolve a plugin icon name to a Lucide component, falling back to `Puzzle`. */
export function resolvePluginIcon(
  name: string,
): React.ComponentType<{ className?: string }> {
  return PLUGIN_ICONS[name] ?? Puzzle;
}

// ---------------------------------------------------------------------------
// Re-exports
// ---------------------------------------------------------------------------

export type { DevForgePlugin, PluginMeta, PluginSettings };
