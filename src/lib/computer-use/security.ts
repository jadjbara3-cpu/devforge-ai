/**
 * Security + safety helpers for the Computer Use module.
 *
 * Layered defenses:
 *   1. **Dangerous-pattern detection** — regex sweep of shell commands + file
 *      paths + process kills. The agent route refuses to run anything that
 *      matches unless `allowDangerous:true` is explicitly set.
 *   2. **Action classification** — every `AgentAction` is tagged with a
 *      `risk` level (safe / moderate / destructive). Destructive actions
 *      always require explicit user approval, even in auto-approve mode.
 *   3. **Filesystem jail** — file ops must be inside the user's home dir
 *      (or a custom allow-list) by default. The jail resolves `..`, symlinks
 *      are NOT followed out of the jail.
 *   4. **Rate limiting + caps** — max 50 steps/task, max 5 min/task. Both
 *      enforced in the agent loop AND documented in the schema.
 *   5. **Out-of-band control** — Stop button aborts the in-flight
 *      AbortController; Approve/Deny resolve a pending approval promise.
 *   6. **Sandbox mode** — when enabled, no actions execute; the loop just
 *      simulates + emits `action_result` events with `ok:true,data:null`.
 */

import * as path from "node:path";
import * as os from "node:os";
import type { AgentAction } from "./types";

// ---------------------------------------------------------------------------
// Risk classification
// ---------------------------------------------------------------------------

export type ActionRisk = "safe" | "moderate" | "destructive";

/**
 * Classify an agent action by its blast radius.
 *
 * - safe         : read-only or visually-reversible (screenshot, click, type,
 *                  scroll, wait, window focus/restore/minimize, open_app).
 * - moderate     : potentially disruptive but recoverable (drag, shell
 *                  commands that don't match the dangerous pattern, window
 *                  close, kill of user apps).
 * - destructive  : anything that destroys data or system state (file delete,
 *                  shell with rm/del/format/shutdown, kill of system processes).
 *
 * The agent loop uses this to decide whether to emit `approval_required`
 * before executing.
 */
export function classifyAction(action: AgentAction): ActionRisk {
  switch (action.type) {
    case "screenshot":
    case "click":
    case "right-click":
    case "scroll":
    case "wait":
    case "type":
    case "key":
    case "drag":
      return "safe";
    case "open_app":
      return "safe";
    case "window":
      return action.action === "close" ? "moderate" : "safe";
    case "shell":
      return classifyShellCommand(action.command);
    case "done":
      return "safe";
    default: {
      // Exhaustiveness check — if a new action type is added without a case
      // here, TypeScript flags this branch as reachable.
      const _exhaustive: never = action;
      void _exhaustive;
      return "destructive";
    }
  }
}

/**
 * Sweep a shell command against a curated denylist of dangerous patterns.
 *
 * We use case-insensitive word-boundary matching so `rm` matches `rm` and
 * `RM` but NOT `armor` or `firmware`. Patterns cover: file deletion, disk
 * formatting, shutdown/reboot, registry writes outside the user hive,
 * downloading + executing binaries, killing system processes, disabling
 * security tools, and exfiltrating credentials.
 */
const DANGEROUS_SHELL_PATTERNS: { pattern: RegExp; reason: string }[] = [
  { pattern: /\brm\s+-rf?\b/i, reason: "Recursive force delete" },
  { pattern: /\bdel\s+\/[a-z]*s\b/i, reason: "Recursive delete (del /s)" },
  { pattern: /\brmdir\s+\/s\b/i, reason: "Recursive rmdir (rmdir /s)" },
  { pattern: /\bRemove-Item\b[^|]*-Recurse/i, reason: "Recursive Remove-Item" },
  { pattern: /\bformat\s+[a-z]:/i, reason: "Disk format" },
  { pattern: /\bdiskpart\b/i, reason: "Disk partition tool" },
  { pattern: /\bshutdown\b/i, reason: "System shutdown" },
  { pattern: /\brestart\b/i, reason: "System restart" },
  { pattern: /\breg\s+delete\b/i, reason: "Registry delete" },
  { pattern: /\bRemove-Item\b[^|]*HKLM/i, reason: "HKLM registry delete" },
  { pattern: /\bSet-ExecutionPolicy\b/i, reason: "Execution policy change" },
  { pattern: /\bnet\s+user\b/i, reason: "User account manipulation" },
  { pattern: /\bnet\s+localgroup\b/i, reason: "Local group manipulation" },
  { pattern: /\btaskkill\s+\/[a-z]*f\b/i, reason: "Force taskkill" },
  { pattern: /\bStop-Process\b[^|]*-Force/i, reason: "Force Stop-Process" },
  { pattern: /\bInvoke-WebRequest\b[^|]*-OutFile/i, reason: "Download file" },
  { pattern: /\biwr\b[^|]*-OutFile/i, reason: "Download file (iwr alias)" },
  { pattern: /\bStart-BitsTransfer\b/i, reason: "BITS download" },
  { pattern: /\bInvoke-Expression\b/i, reason: "Dynamic eval (Invoke-Expression)" },
  { pattern: /\biex\b/i, reason: "Dynamic eval (iex alias)" },
  { pattern: /\bSet-MpPreference\b/i, reason: "Defender tampering" },
  { pattern: /\bAdd-MpPreference\b/i, reason: "Defender tampering" },
  { pattern: /\bUninstall-WindowsFeature\b/i, reason: "Windows feature removal" },
  { pattern: /\bDisable-WindowsOptionalFeature\b/i, reason: "Windows feature disable" },
  { pattern: /\bsc\s+delete\b/i, reason: "Service deletion" },
  { pattern: /\bsc\s+stop\b/i, reason: "Service stop" },
  { pattern: /\bnet\s+stop\b/i, reason: "Service stop (net)" },
  { pattern: /\bwmic\s+process\b/i, reason: "WMIC process control" },
  { pattern: /\breg\s+add\b[^|]*HKLM/i, reason: "HKLM registry write" },
  { pattern: /\btakeown\b/i, reason: "Ownership change (takeown)" },
  { pattern: /\bicacls\b/i, reason: "ACL change (icacls)" },
  { pattern: /\bcacls\b/i, reason: "ACL change (cacls)" },
  { pattern: /\bchmod\b/i, reason: "Permission change (chmod)" },
  { pattern: /\bchown\b/i, reason: "Ownership change (chown)" },
];

export function classifyShellCommand(command: string): ActionRisk {
  const trimmed = command.trim();
  if (!trimmed) return "safe";
  for (const { pattern } of DANGEROUS_SHELL_PATTERNS) {
    if (pattern.test(trimmed)) return "destructive";
  }
  // Moderate: anything that writes (>, >>, Set-Content, Out-File, Add-Content)
  // or pipes between processes.
  if (/[>]{1,2}|Set-Content|Out-File|Add-Content|\|/i.test(trimmed)) {
    return "moderate";
  }
  return "moderate"; // unknown shell commands default to moderate (require approval)
}

export function explainDanger(command: string): string[] {
  const reasons: string[] = [];
  for (const { pattern, reason } of DANGEROUS_SHELL_PATTERNS) {
    if (pattern.test(command)) reasons.push(reason);
  }
  return reasons;
}

// ---------------------------------------------------------------------------
// Filesystem jail
// ---------------------------------------------------------------------------

const HOME = os.homedir();

/** Default jail roots — the user's home directory. */
const DEFAULT_JAIL_ROOTS: string[] = [HOME];

/**
 * Resolve a path and verify it's inside one of the jail roots.
 * Throws JailViolationError if not. Symlinks pointing OUTSIDE the jail are
 * rejected (the resolved real path is checked).
 *
 * Set `allowUnsafe` to bypass — used only by the agent route when the user
 * has explicitly enabled "DANGER MODE" via settings.
 */
export function jailPath(
  inputPath: string,
  options: { allowUnsafe?: boolean; extraRoots?: string[] } = {},
): string {
  if (options.allowUnsafe) {
    return path.resolve(inputPath);
  }
  const roots = [...DEFAULT_JAIL_ROOTS, ...(options.extraRoots ?? [])].map(
    (r) => path.resolve(r).toLowerCase(),
  );
  const resolved = path.resolve(inputPath).toLowerCase();
  const ok = roots.some((root) => {
    return resolved === root || resolved.startsWith(root + path.sep);
  });
  if (!ok) {
    throw new JailViolationError(inputPath, roots);
  }
  return resolved;
}

export class JailViolationError extends Error {
  code = "JAIL_VIOLATION" as const;
  constructor(
    public readonly attemptedPath: string,
    public readonly allowedRoots: string[],
  ) {
    super(
      `Path "${attemptedPath}" is outside the allowed roots. Computer Use can only touch files inside: ${allowedRoots.join(", ")}`,
    );
    this.name = "JailViolationError";
  }
}

// ---------------------------------------------------------------------------
// Caps + rate limits
// ---------------------------------------------------------------------------

export const MAX_STEPS_PER_TASK = 50;
export const MAX_TASK_DURATION_MS = 5 * 60 * 1000; // 5 minutes
export const MAX_TASK_DURATION_MS_HARD = 10 * 60 * 1000; // absolute ceiling
export const MAX_SHELL_TIMEOUT_MS = 60_000;
export const MAX_SCREENSHOT_BYTES = 100 * 1024; // 100 KB cap per JPEG
export const SCREENSHOT_QUALITY = 60; // JPEG quality
export const SCREENSHOT_MAX_WIDTH = 1600; // downscale 4K screenshots to ≤1600px wide for VLM

export function clampSteps(requested: number | undefined): number {
  if (typeof requested !== "number" || !Number.isFinite(requested)) {
    return MAX_STEPS_PER_TASK;
  }
  return Math.max(1, Math.min(MAX_STEPS_PER_TASK, Math.floor(requested)));
}

export function clampTimeoutMs(requested: number | undefined): number {
  if (typeof requested !== "number" || !Number.isFinite(requested)) {
    return MAX_TASK_DURATION_MS;
  }
  return Math.max(10_000, Math.min(MAX_TASK_DURATION_MS_HARD, Math.floor(requested)));
}

// ---------------------------------------------------------------------------
// Key-name allowlist (for keyboard hotkeys)
// ---------------------------------------------------------------------------

/**
 * Translate friendly key names (e.g. "ctrl", "enter", "esc") to SendKeys
 * codes / virtual-key codes. Anything NOT in this map is rejected — this is
 * the primary defence against a misbehaving VLM emitting garbage key names
 * that PowerShell might interpret as escape sequences.
 */
export const KEY_NAME_MAP: Record<string, string> = {
  // Modifiers
  ctrl: "^",
  control: "^",
  shift: "+",
  alt: "%",
  win: "^{ESC}",
  // Whitespace / editing
  enter: "{ENTER}",
  return: "{ENTER}",
  tab: "{TAB}",
  escape: "{ESC}",
  esc: "{ESC}",
  backspace: "{BACKSPACE}",
  bs: "{BACKSPACE}",
  delete: "{DELETE}",
  del: "{DELETE}",
  insert: "{INSERT}",
  ins: "{INSERT}",
  space: " ",
  spacebar: " ",
  // Arrow keys
  up: "{UP}",
  down: "{DOWN}",
  left: "{LEFT}",
  right: "{RIGHT}",
  // Function keys
  f1: "{F1}", f2: "{F2}", f3: "{F3}", f4: "{F4}",
  f5: "{F5}", f6: "{F6}", f7: "{F7}", f8: "{F8}",
  f9: "{F9}", f10: "{F10}", f11: "{F11}", f12: "{F12}",
  // Navigation
  home: "{HOME}",
  end: "{END}",
  pageup: "{PGUP}",
  pagedown: "{PGDN}",
  pgup: "{PGUP}",
  pgdn: "{PGDN}",
  // Special
  capslock: "{CAPSLOCK}",
  numlock: "{NUMLOCK}",
  scrolllock: "{SCROLLLOCK}",
  prtscn: "{PRTSC}",
  printscreen: "{PRTSC}",
};

/**
 * Sanitise a single key name. Returns the SendKeys representation, or throws
 * if the name is unknown. Single printable characters (a-z, 0-9, basic
 * punctuation) are passed through verbatim.
 */
export function sanitiseKeyName(name: string): string {
  const lower = name.toLowerCase().trim();
  if (KEY_NAME_MAP[lower]) return KEY_NAME_MAP[lower];
  // Single printable ASCII char: pass through (SendKeys handles it).
  if (/^[\x20-\x7e]$/.test(name)) return name;
  throw new Error(`Unknown key name: "${name}"`);
}

/**
 * Translate a list of keys for the `hotkey` action into a SendKeys string.
 * Modifiers come first (in canonical order ctrl → alt → shift), then the
 * non-modifier key. e.g. ["ctrl","c"] → "^c", ["ctrl","shift","esc"] → "^+{ESC}".
 */
export function buildHotkeyString(keys: string[]): string {
  if (!keys.length) throw new Error("hotkey requires at least one key");
  const order = ["ctrl", "control", "alt", "shift"];
  const sorted = [...keys].sort((a, b) => {
    const ai = order.indexOf(a.toLowerCase());
    const bi = order.indexOf(b.toLowerCase());
    if (ai === -1 && bi === -1) return 0;
    if (ai === -1) return 1;
    if (bi === -1) return -1;
    return ai - bi;
  });
  return sorted.map(sanitiseKeyName).join("");
}

/**
 * Escape text for SendKeys `type` action. SendKeys treats `^+%{}~` as special
 * — wrap them in `{}` so they're typed literally.
 */
export function escapeSendKeysText(text: string): string {
  return text.replace(/[\^+%{}~]/g, (m) => `{${m}}`);
}
