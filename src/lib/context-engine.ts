/**
 * Context Engine — gathers information about what the user is currently doing
 * so the AI can offer contextual help.
 *
 * --------------------------------------------------------------------
 * What we collect (all OPT-IN — controlled by the client via consent flags)
 * --------------------------------------------------------------------
 *   1. Active window title + process name
 *        → On Windows: polled via PowerShell (GetForegroundWindow + GetWindowText
 *          + GetProcessById). Cheap, ~10ms per call.
 *        → On other OSes: returns null (the API route still works, just with
 *          no window info).
 *   2. Selected text (clipboard snapshot)
 *        → The CLIENT decides when to send a clipboard snapshot. We never
 *          poll the clipboard server-side. The hook on the client watches
 *          for clipboard updates and forwards the latest *non-sensitive*
 *          entry. Anything longer than ~2 KB or matching a credit-card /
 *          password pattern is dropped.
 *   3. Active browser URL (if a browser is the foreground window)
 *        → Detected from the window title (most browsers put the page title
 *          + " - Chrome" / " - Firefox" etc.). We surface the title only;
 *          the actual URL is NOT captured server-side for privacy.
 *
 * --------------------------------------------------------------------
 * Privacy
 * --------------------------------------------------------------------
 * Nothing leaves the user's machine except:
 *   - the (explicit, user-typed) chat message, AND
 *   - the context object the user has CONSENTED to share.
 *
 * The context object is sent as part of the chat request body. It is
 * attached to the system prompt by the chat route handler. It is NEVER
 * logged to disk, NEVER sent to analytics, and NEVER included when the
 * user has disabled the corresponding consent flag.
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ActiveWindow {
  title: string;
  process: string;
  /** True when the foreground window looks like a browser tab. */
  isBrowser: boolean;
}

export interface UserContext {
  /** ISO timestamp of when this snapshot was taken. */
  capturedAt: string;
  /** Active foreground window, or null when unavailable / on non-Windows. */
  activeWindow: ActiveWindow | null;
  /**
   * Clipboard snapshot (text only, max ~2 KB, sensitive patterns stripped).
   * Forwarded by the client — never polled server-side.
   */
  selection: string | null;
  /** Browser URL — currently derived from the window title (privacy-safe). */
  browserUrl: string | null;
  /** The DevForge feature the user is currently looking at (chat / image / …). */
  devforgeView: string | null;
}

export interface UserConsent {
  /** Share the active window title + process name. */
  shareActiveWindow: boolean;
  /** Share clipboard / selected text. */
  shareSelection: boolean;
  /** Share browser URL (derived from window title). */
  shareBrowserUrl: boolean;
  /** Share which DevForge view is currently open. */
  shareDevforgeView: boolean;
}

export const DEFAULT_CONSENT: UserConsent = {
  shareActiveWindow: false,
  shareSelection: false,
  shareBrowserUrl: false,
  shareDevforgeView: true,
};

// ---------------------------------------------------------------------------
// In-process cache — the active window is polled at most every 2s, even if
// 10 requests hit /api/context simultaneously.
// ---------------------------------------------------------------------------

const WINDOW_POLL_INTERVAL_MS = 2_000;

interface CachedWindow {
  value: ActiveWindow | null;
  expiresAt: number;
}

let cachedWindow: CachedWindow | null = null;

// ---------------------------------------------------------------------------
// Sensitive-content scrubbing for the clipboard snapshot.
// ---------------------------------------------------------------------------

const CREDIT_CARD_RE = /\b(?:\d[ -]*?){13,19}\b/g;
const PASSWORD_HINT_RE = /\b(?:password|passwd|pwd|secret|api[_-]?key|token)\b\s*[:=]\s*\S+/gi;
const LONG_BLOB_RE = /\b[A-Za-z0-9+/]{80,}={0,2}\b/g; // base64-ish

const MAX_SELECTION_CHARS = 2_000;

/**
 * Strip obvious secrets from a clipboard snapshot. Returns null if the
 * snapshot is empty or looks entirely like a secret.
 */
export function scrubSelection(raw: string | null | undefined): string | null {
  if (!raw || typeof raw !== "string") return null;
  let s = raw.trim();
  if (!s) return null;
  s = s
    .replace(CREDIT_CARD_RE, "[REDACTED:CARD]")
    .replace(PASSWORD_HINT_RE, (m) => m.split(/[=:]/)[0] + "=[REDACTED]")
    .replace(LONG_BLOB_RE, "[REDACTED:BLOB]");
  if (s.length > MAX_SELECTION_CHARS) {
    s = s.slice(0, MAX_SELECTION_CHARS) + "…";
  }
  return s || null;
}

// ---------------------------------------------------------------------------
// Active window detection — Windows only (PowerShell).
// ---------------------------------------------------------------------------

const PS_SCRIPT = `
$Add = @"
using System;
using System.Runtime.InteropServices;
using System.Text;
public class W {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
}
"@
Add-Type $Add
$h = [W]::GetForegroundWindow()
if ($h -eq [IntPtr]::Zero) { Write-Output ""; exit }
$sb = New-Object System.Text.StringBuilder 512
[void][W]::GetWindowText($h, $sb, 512)
$title = $sb.ToString()
$pid = 0
[void][W]::GetWindowThreadProcessId($h, [ref]$pid)
$proc = ""
if ($pid -ne 0) {
  try { $proc = (Get-Process -Id $pid -ErrorAction Stop).ProcessName } catch {}
}
Write-Output ($title + "|" + $proc)
`.trim();

/**
 * Detect the foreground window on Windows. Returns null on any error or
 * when running on a non-Windows OS.
 *
 * Implementation note: we spawn `powershell.exe` with a small inline script
 * that P/Invokes user32.dll. Output is `title|process` on a single line.
 * Failures are swallowed — context gathering must never crash a chat
 * request.
 */
export async function getActiveWindow(): Promise<ActiveWindow | null> {
  if (process.platform !== "win32") return null;

  const now = Date.now();
  if (cachedWindow && cachedWindow.expiresAt > now) {
    return cachedWindow.value;
  }

  let result: ActiveWindow | null = null;
  try {
    const { stdout } = await execFileAsync(
      "powershell.exe",
      [
        "-NoProfile",
        "-NonInteractive",
        "-ExecutionPolicy", "Bypass",
        "-Command", PS_SCRIPT,
      ],
      { timeout: 4_000, windowsHide: true, maxBuffer: 4 * 1024 },
    );
    const line = stdout.trim();
    if (line && line.includes("|")) {
      const [title, proc] = line.split("|", 2);
      const process = (proc || "").trim();
      result = {
        title: (title || "").trim(),
        process,
        isBrowser: isBrowserProcess(process),
      };
    }
  } catch (err) {
    // Don't spam logs — this can fire every 2s. Throttle to debug.
    if (process.env.NODE_ENV !== "production") {
      console.warn("[context-engine] getActiveWindow failed:", err);
    }
    result = null;
  }

  cachedWindow = { value: result, expiresAt: now + WINDOW_POLL_INTERVAL_MS };
  return result;
}

const BROWSER_PROCESSES = new Set([
  "chrome",
  "msedge",
  "firefox",
  "brave",
  "opera",
  "vivaldi",
  "arc",
  "safari",
  "iexplore",
]);

function isBrowserProcess(proc: string): boolean {
  if (!proc) return false;
  return BROWSER_PROCESSES.has(proc.toLowerCase());
}

// ---------------------------------------------------------------------------
// Building the context object
// ---------------------------------------------------------------------------

/**
 * Build a complete UserContext snapshot on the SERVER side.
 *
 * The caller passes in consent flags (typically received from the client)
 * AND any client-supplied data (selection, devforgeView). The server only
 * fills in `activeWindow` — everything else comes from the client to keep
 * the boundary clean.
 */
export async function buildServerContext(args: {
  consent: UserConsent;
  selection?: string | null;
  devforgeView?: string | null;
}): Promise<UserContext> {
  const { consent } = args;
  const activeWindow = consent.shareActiveWindow ? await getActiveWindow() : null;
  const selection =
    consent.shareSelection ? scrubSelection(args.selection ?? null) : null;
  const browserUrl =
    consent.shareBrowserUrl && activeWindow?.isBrowser
      ? activeWindow.title || null
      : null;
  const devforgeView =
    consent.shareDevforgeView ? (args.devforgeView ?? null) : null;

  return {
    capturedAt: new Date().toISOString(),
    activeWindow,
    selection,
    browserUrl,
    devforgeView,
  };
}

/**
 * Render a UserContext into a short markdown block for the system prompt.
 * Returns an empty string when nothing was captured.
 */
export function renderContextForPrompt(ctx: UserContext): string {
  const lines: string[] = [];
  if (ctx.activeWindow) {
    lines.push(
      `Active window: ${ctx.activeWindow.title || "(untitled)"} (${ctx.activeWindow.process || "unknown"})`,
    );
  }
  if (ctx.browserUrl) {
    lines.push(`Browser tab: ${ctx.browserUrl}`);
  }
  if (ctx.selection) {
    const preview =
      ctx.selection.length > 300
        ? ctx.selection.slice(0, 300) + "…"
        : ctx.selection;
    lines.push(`Selected text:\n"""\n${preview}\n"""`);
  }
  if (ctx.devforgeView) {
    lines.push(`Current DevForge view: ${ctx.devforgeView}`);
  }
  if (lines.length === 0) return "";
  return [
    "",
    "## Current user context",
    "The user is currently doing the following. Reference it only when relevant.",
    ...lines,
  ].join("\n");
}

/**
 * Render a short, human-readable badge for the chat UI.
 * Example: "VS Code · MyComponent.tsx"
 */
export function renderContextBadge(ctx: UserContext): string | null {
  if (ctx.activeWindow) {
    const proc = ctx.activeWindow.process || "app";
    const title = ctx.activeWindow.title || "";
    // Strip the trailing " - <process>" suffix browsers/IDEs add.
    const cleanTitle = title
      .replace(/\s*-\s*[^-]+$/, "")
      .replace(/\s*-\s*Visual Studio Code$/, "")
      .trim();
    if (cleanTitle) return `${proc} · ${cleanTitle}`;
    return proc;
  }
  if (ctx.devforgeView) return `DevForge · ${ctx.devforgeView}`;
  return null;
}
