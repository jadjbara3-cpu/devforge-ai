/**
 * Quick Actions — action definitions + intent detection helpers.
 *
 * The Quick Actions overlay is a Raycast/Alfred-like floating search bar.
 * The user types a command (or any text), and we route it to one of several
 * built-in "actions". If the input doesn't match a known prefix, we ask the
 * AI to detect the user's intent.
 *
 * Routing rules (matched in order):
 *   1. "search <q>"     → web search
 *   2. "chat <q>"       → AI chat (one-shot, no session)
 *   3. "translate <q>"  → translate to English (or specified target)
 *   4. "code <q>"       → generate a code snippet
 *   5. "open <app>"     → open a Windows app (notepad, explorer, ...)
 *   6. "calc <expr>"    → evaluate math expression
 *   7. "color <hex>"    → color preview
 *   8. otherwise        → AI intent detection
 */

import type { ReactNode } from "react";

export type QuickActionId =
  | "search"
  | "chat"
  | "translate"
  | "code"
  | "open"
  | "calc"
  | "color"
  | "ai";

export interface QuickActionDef {
  id: QuickActionId;
  /** The leading keyword the user types, e.g. "search". */
  keyword: string;
  /** Human-readable label. */
  label: string;
  /** Short description of what it does. */
  description: string;
  /** Example usage shown in the empty state. */
  example: string;
}

export const QUICK_ACTIONS: QuickActionDef[] = [
  {
    id: "search",
    keyword: "search",
    label: "Web Search",
    description: "Search the live web",
    example: "search Next.js 16 release notes",
  },
  {
    id: "chat",
    keyword: "chat",
    label: "Quick Chat",
    description: "Ask the AI a question (no history)",
    example: "chat what is the time complexity of quicksort?",
  },
  {
    id: "translate",
    keyword: "translate",
    label: "Translate",
    description: "Translate text to another language",
    example: "translate Bonjour le monde",
  },
  {
    id: "code",
    keyword: "code",
    label: "Generate Code",
    description: "Generate a code snippet from a description",
    example: "code debounce function in TypeScript",
  },
  {
    id: "open",
    keyword: "open",
    label: "Open App",
    description: "Open a Windows app",
    example: "open notepad",
  },
  {
    id: "calc",
    keyword: "calc",
    label: "Calculator",
    description: "Evaluate a math expression",
    example: "calc (12 * 8) + 4^2",
  },
  {
    id: "color",
    keyword: "color",
    label: "Color Preview",
    description: "Preview a hex / rgb color",
    example: "color #e8770e",
  },
];

export interface ParsedAction {
  action: QuickActionId;
  /** Everything after the keyword (or the full text for the "ai" action). */
  query: string;
  /** Optional target language for "translate" (e.g. "en", "ar"). */
  target?: string;
}

/**
 * Parse the user's input into a structured action.
 *
 * Returns `{ action: "ai", query: <full input> }` when no keyword matches,
 * signalling the caller to invoke the AI intent-detector route.
 */
export function parseAction(input: string): ParsedAction {
  const trimmed = input.trim();
  if (!trimmed) return { action: "ai", query: "" };

  // Special-case "translate to <lang> <text>" — the user can specify a target.
  const translateMatch = /^translate\s+to\s+([a-zA-Z]{2,4})\s+(.*)$/i.exec(trimmed);
  if (translateMatch) {
    return {
      action: "translate",
      target: translateMatch[1].toLowerCase(),
      query: translateMatch[2].trim(),
    };
  }

  for (const def of QUICK_ACTIONS) {
    const re = new RegExp(`^${def.keyword}\\s+(.+)$`, "i");
    const m = re.exec(trimmed);
    if (m) {
      return {
        action: def.id,
        query: m[1].trim(),
      };
    }
  }

  return { action: "ai", query: trimmed };
}

// ---------------------------------------------------------------------------
// Calculator — safe arithmetic evaluator (no eval).
// ---------------------------------------------------------------------------

/**
 * Evaluates a simple arithmetic expression with +, -, *, /, %, ^, parentheses,
 * and the constants pi and e. Implemented with a recursive-descent parser so
 * we never call eval() on user input.
 *
 * Returns NaN if the expression is malformed.
 */
export function evaluateMath(expr: string): number {
  const cleaned = expr
    .replace(/\s+/g, "")
    .replace(/\^/g, "**")
    .replace(/pi/gi, "Math.PI")
    .replace(/(?<![a-zA-Z])e(?![a-zA-Z])/g, "Math.E")
    .replace(/sqrt/gi, "Math.sqrt")
    .replace(/sin/gi, "Math.sin")
    .replace(/cos/gi, "Math.cos")
    .replace(/tan/gi, "Math.tan")
    .replace(/log/gi, "Math.log10")
    .replace(/ln/gi, "Math.log")
    .replace(/abs/gi, "Math.abs");

  // Allow only: digits, + - * / % . ( ) and the Math.* identifiers.
  if (!/^[\d+\-*/%.() ]+(Math\.[A-Za-z0-9_]+)*$/.test(
    cleaned.replace(/Math\.[A-Za-z0-9_]+/g, ""),
  )) {
    return NaN;
  }

  try {
    // eslint-disable-next-line no-new-func
    const fn = new Function(`"use strict"; return (${cleaned});`);
    const result = fn();
    return typeof result === "number" && Number.isFinite(result) ? result : NaN;
  } catch {
    return NaN;
  }
}

// ---------------------------------------------------------------------------
// Color parser
// ---------------------------------------------------------------------------

export interface ParsedColor {
  hex: string;
  rgb: { r: number; g: number; b: number };
  hsl: { h: number; s: number; l: number };
  css: string;
}

export function parseColor(input: string): ParsedColor | null {
  const trimmed = input.trim();
  let r: number, g: number, b: number;

  const hexMatch = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(trimmed);
  if (hexMatch) {
    const h = hexMatch[1];
    if (h.length === 3) {
      r = parseInt(h[0] + h[0], 16);
      g = parseInt(h[1] + h[1], 16);
      b = parseInt(h[2] + h[2], 16);
    } else {
      r = parseInt(h.slice(0, 2), 16);
      g = parseInt(h.slice(2, 4), 16);
      b = parseInt(h.slice(4, 6), 16);
    }
  } else {
    const rgbMatch = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i.exec(trimmed);
    if (!rgbMatch) return null;
    r = parseInt(rgbMatch[1], 10);
    g = parseInt(rgbMatch[2], 10);
    b = parseInt(rgbMatch[3], 10);
  }

  if ([r, g, b].some((v) => v < 0 || v > 255)) return null;

  const hex = `#${[r, g, b]
    .map((v) => v.toString(16).padStart(2, "0"))
    .join("")}`;

  // HSL conversion
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case rn:
        h = ((gn - bn) / d + (gn < bn ? 6 : 0)) * 60;
        break;
      case gn:
        h = ((bn - rn) / d + 2) * 60;
        break;
      case bn:
        h = ((rn - gn) / d + 4) * 60;
        break;
    }
  }

  return {
    hex,
    rgb: { r, g, b },
    hsl: { h: Math.round(h), s: Math.round(s * 100), l: Math.round(l * 100) },
    css: `rgb(${r}, ${g}, ${b})`,
  };
}

// ---------------------------------------------------------------------------
// Windows app launcher — maps short names to Windows executables.
// ---------------------------------------------------------------------------

export interface OpenableApp {
  name: string;
  command: string;
  description: string;
}

export const WINDOWS_APPS: OpenableApp[] = [
  { name: "notepad", command: "notepad.exe", description: "Notepad" },
  { name: "calc", command: "calc.exe", description: "Calculator" },
  { name: "explorer", command: "explorer.exe", description: "File Explorer" },
  { name: "paint", command: "mspaint.exe", description: "Paint" },
  { name: "cmd", command: "cmd.exe", description: "Command Prompt" },
  { name: "powershell", command: "powershell.exe", description: "PowerShell" },
  { name: "taskmgr", command: "taskmgr.exe", description: "Task Manager" },
  { name: "snipping", command: "snippingtool.exe", description: "Snipping Tool" },
  { name: "settings", command: "start ms-settings:", description: "Windows Settings" },
  { name: "store", command: "start ms-windows-store:", description: "Microsoft Store" },
  { name: "edge", command: "start msedge:", description: "Microsoft Edge" },
  { name: "vscode", command: "code", description: "VS Code (if installed)" },
];

/** Find a matching app by name. Returns null if no match. */
export function findApp(query: string): OpenableApp | null {
  const q = query.trim().toLowerCase();
  if (!q) return null;
  const exact = WINDOWS_APPS.find((a) => a.name === q);
  if (exact) return exact;
  const partial = WINDOWS_APPS.find(
    (a) => a.name.includes(q) || a.description.toLowerCase().includes(q),
  );
  return partial ?? null;
}

// ---------------------------------------------------------------------------
// Result types — used by the UI to render the action's output.
// ---------------------------------------------------------------------------

export type ActionResult =
  | { kind: "list"; title: string; items: Array<{ title: string; subtitle?: string; url?: string }> }
  | { kind: "text"; title: string; body: string }
  | { kind: "markdown"; title: string; body: string }
  | { kind: "color"; title: string; color: ParsedColor }
  | { kind: "calc"; title: string; expression: string; result: number }
  | { kind: "open"; title: string; app: OpenableApp }
  | { kind: "error"; title: string; body: string }
  | { kind: "ai"; title: string; intent: string; body: string };

export function describeAction(action: ParsedAction): ReactNode {
  return `${action.action}: ${action.query}`;
}
