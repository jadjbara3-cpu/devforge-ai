/**
 * PowerShell runner for the Computer Use module.
 *
 * All Windows automation goes through this single chokepoint so we can:
 *   1. Force `-NoProfile -NonInteractive` (no $PROFILE loading, no prompts).
 *   2. Use `-EncodedCommand` (base64 UTF-16LE) for EVERY invocation — this
 *      is the only quoting-safe way to pass arbitrary script text on Windows
 *      because it sidesteps cmd.exe's quoting rules entirely.
 *   3. Enforce a timeout + capture stdout/stderr separately.
 *   4. Detect non-Windows hosts and throw a friendly error (the API routes
 *      gracefully return 503 instead of crashing).
 *
 * The agent loop NEVER builds PowerShell by string-concatenating user input
 * — all dynamic values are passed as PowerShell variables via a tiny
 * parameter-binding preamble emitted from `psVars()`. The script body is a
 * constant string, so there is no injection surface.
 */

import { spawn } from "node:child_process";

export interface PsRunOptions {
  /** Wall-clock timeout in ms. Default 15_000. Max 60_000. */
  timeoutMs?: number;
  /** Working directory. Default: %USERPROFILE%. */
  cwd?: string;
  /** Extra env vars. */
  env?: NodeJS.ProcessEnv;
}

export interface PsRunResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  timedOut: boolean;
  durationMs: number;
}

const POWERSHELL_EXE =
  process.env.DEVFORGE_POWERSHELL_EXE ||
  // Prefer Windows PowerShell 5.1 (always present on Win10/11) for maximum
  // .NET compatibility — `Add-Type` for Win32 P/Invoke works reliably.
  "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe";

const DEFAULT_TIMEOUT = 15_000;
const MAX_TIMEOUT = 60_000;

/** True when running on a Windows host (`process.platform === "win32"`). */
export function isWindowsHost(): boolean {
  return process.platform === "win32";
}

/**
 * Throw a friendly, machine-readable error when invoked off-Windows.
 * Every API route calls this BEFORE building a script so we never spawn
 * `powershell.exe` on Linux/macOS dev boxes (where it doesn't exist).
 */
export function assertWindowsHost(): void {
  if (!isWindowsHost()) {
    throw new WindowsNotAvailableError();
  }
}

export class WindowsNotAvailableError extends Error {
  code = "WINDOWS_NOT_AVAILABLE" as const;
  constructor() {
    super(
      "Computer Use requires a Windows host. The DevForge AI server is currently running on a non-Windows platform — screen capture, mouse, keyboard, windows, clipboard, and process control are unavailable.",
    );
    this.name = "WindowsNotAvailableError";
  }
}

/**
 * Build the parameter-binding preamble for a PowerShell script.
 *
 * Given `{ x: 100, y: 200, title: "Notepad" }` returns:
 *
 *   $x = 100
 *   $y = 200
 *   $title = 'Notepad'
 *
 * Strings are single-quoted with any internal single-quote escaped by
 * doubling (`'` → `''`) per PowerShell's literal-string rule. Numbers,
 * booleans, and nulls are emitted bare. This is the ONLY place we touch
 * user input before it reaches PowerShell, and the escaping is total —
 * there is no way for `'; Start-Process calc; '` to break out of the
 * string literal because every `'` becomes `''`.
 */
export function psVars(vars: Record<string, unknown>): string {
  const lines: string[] = [];
  for (const [name, value] of Object.entries(vars)) {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
      throw new Error(`Invalid PowerShell variable name: ${name}`);
    }
    lines.push(`$${name} = ${psLiteral(value)}`);
  }
  return lines.join("\n");
}

/** Render a single JS value as a PowerShell literal. */
export function psLiteral(value: unknown): string {
  if (value === null || value === undefined) return "$null";
  if (typeof value === "boolean") return value ? "$true" : "$false";
  if (typeof value === "number") {
    return Number.isFinite(value) ? String(value) : "0";
  }
  if (typeof value === "string") {
    // Literal single-quoted string — escape `'` by doubling.
    return `'${value.replace(/'/g, "''")}'`;
  }
  // Arrays + objects: convert to JSON and let PowerShell parse via ConvertFrom-Json.
  const json = JSON.stringify(value);
  return `ConvertFrom-Json -InputObject '${json.replace(/'/g, "''")}'`;
}

/**
 * Run a PowerShell script. The script is ALWAYS passed via
 * `-EncodedCommand` (base64 UTF-16LE) — never via `-Command` — to bypass
 * cmd.exe's quoting hell entirely.
 *
 * The script is prefixed with the standard preamble:
 *   - `$ErrorActionPreference = 'Stop'` — uncaught errors throw.
 *   - `Add-Type -AssemblyName System.Windows.Forms, System.Drawing` — done
 *     lazily per route (only the routes that need them) to keep cold-start
 *     fast.
 */
export async function runPowerShell(
  script: string,
  options: PsRunOptions = {},
): Promise<PsRunResult> {
  assertWindowsHost();

  const timeoutMs = Math.min(
    Math.max(options.timeoutMs ?? DEFAULT_TIMEOUT, 1_000),
    MAX_TIMEOUT,
  );

  const cwd = options.cwd || process.env.USERPROFILE || "C:\\";

  // Force UTF-8 output so emoji / non-ASCII paths survive intact.
  const fullScript = `\
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new()
[Console]::InputEncoding = [System.Text.UTF8Encoding]::new()
$OutputEncoding = [System.Text.UTF8Encoding]::new()
${script}
`;

  // -EncodedCommand expects base64 of UTF-16LE bytes.
  const encoded = Buffer.from(fullScript, "utf16le").toString("base64");

  const args = [
    "-NoProfile",
    "-NonInteractive",
    "-ExecutionPolicy", "Bypass",
    "-EncodedCommand", encoded,
  ];

  return new Promise<PsRunResult>((resolve) => {
    const startedAt = Date.now();
    const child = spawn(POWERSHELL_EXE, args, {
      cwd,
      env: { ...process.env, ...options.env },
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });

    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    let timedOut = false;
    let settled = false;

    const timer = setTimeout(() => {
      timedOut = true;
      try {
        child.kill("SIGKILL");
      } catch {
        /* ignore */
      }
    }, timeoutMs);

    child.stdout.on("data", (c: Buffer) => stdoutChunks.push(c));
    child.stderr.on("data", (c: Buffer) => stderrChunks.push(c));

    child.on("error", () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({
        stdout: Buffer.concat(stdoutChunks).toString("utf8"),
        stderr: Buffer.concat(stderrChunks).toString("utf8"),
        exitCode: null,
        timedOut,
        durationMs: Date.now() - startedAt,
      });
    });

    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({
        stdout: Buffer.concat(stdoutChunks).toString("utf8"),
        stderr: Buffer.concat(stderrChunks).toString("utf8"),
        exitCode: typeof code === "number" ? code : null,
        timedOut,
        durationMs: Date.now() - startedAt,
      });
    });
  });
}

/**
 * Run a PowerShell script and parse the LAST non-empty stdout line as JSON.
 *
 * Convention: every Computer Use PowerShell script ends by writing a single
 * JSON object (via `ConvertTo-Json -Compress -Depth 10`) summarising the
 * result. We strip ANSI escape codes + BOM + trailing newlines, take the
 * last JSON-looking line, and JSON.parse it. This makes the boundary
 * between PowerShell and TypeScript completely structured — no regex
 * parsing of human-readable output.
 */
export async function runPowerShellJson<T = unknown>(
  script: string,
  options: PsRunOptions = {},
): Promise<{ result: T; raw: PsRunResult }> {
  const raw = await runPowerShell(script, options);
  if (raw.exitCode !== 0 && !raw.stdout) {
    throw new Error(
      `PowerShell exited with code ${raw.exitCode}: ${raw.stderr.trim() || "(no stderr)"}`,
    );
  }
  // Strip ANSI escape codes + BOM.
  const cleaned = raw.stdout
    .replace(/\u001b\[[0-9;]*[A-Za-z]/g, "")
    .replace(/^\uFEFF/, "")
    .trim();
  if (!cleaned) {
    throw new Error(
      `PowerShell produced no JSON output. stderr: ${raw.stderr.trim()}`,
    );
  }
  // The JSON is always the LAST line — scripts may emit progress text above.
  const lines = cleaned.split(/\r?\n/).filter((l) => l.trim().startsWith("{") || l.trim().startsWith("["));
  const last = lines[lines.length - 1];
  if (!last) {
    throw new Error(
      `PowerShell produced no JSON line. stdout: ${cleaned.slice(0, 500)}`,
    );
  }
  let parsed: T;
  try {
    parsed = JSON.parse(last) as T;
  } catch (err) {
    throw new Error(
      `PowerShell JSON parse failed: ${err instanceof Error ? err.message : String(err)}. Line: ${last.slice(0, 200)}`,
    );
  }
  return { result: parsed, raw };
}

// ---------------------------------------------------------------------------
// Reusable PowerShell snippets (constants — no interpolation)
// ---------------------------------------------------------------------------

/**
 * P/Invoke helpers for mouse + keyboard simulation. Defined once as a C#
 * Add-Type; subsequent runs that re-Add the same type are no-ops (PowerShell
 * keeps the type loaded in the AppDomain for the process lifetime — but each
 * `powershell.exe` invocation is a fresh process, so we re-emit each time).
 *
 * We expose:
 *   - Win32.SetCursorPos(x, y)
 *   - Win32.mouse_event(flags, dx, dy, buttons, extra)
 *   - Win32.keybd_event(vk, scan, flags, extra)
 *   - Win32.GetForegroundWindow()
 *   - Win32.GetWindowText(handle)
 *   - Win32.GetWindowRect(handle, out rect)
 *
 * Constants: MOUSEEVENTF_MOVE=1, LEFTDOWN=2, LEFTUP=4, RIGHTDOWN=8, RIGHTUP=16,
 * MIDDLEDOWN=32, MIDDLEUP=64, WHEEL=0x0800, ABSOLUTE=0x8000.
 * KEYBD: KEYDOWN=0, KEYUP=2.
 */
export const PS_WIN32_ADD_TYPE = `
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public class Win32 {
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")] public static extern void mouse_event(uint dwFlags, uint dx, uint dy, uint cButtons, uint dwExtraInfo);
  [DllImport("user32.dll")] public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr dwExtraInfo);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll", CharSet = CharSet.Auto)] public static extern int GetWindowText(IntPtr hWnd, System.Text.StringBuilder lpString, int nMaxCount);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool PostMessage(IntPtr hWnd, uint Msg, IntPtr wParam, IntPtr lParam);
  [DllImport("user32.dll")] public static extern IntPtr FindWindow(string lpClassName, string lpWindowName);
  [DllImport("user32.dll", CharSet = CharSet.Auto)] public static extern int GetWindowTextLength(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);
  [StructLayout(LayoutKind.Sequential)]
  public struct RECT { public int Left, Top, Right, Bottom; }
  public const int SW_MINIMIZE = 6, SW_MAXIMIZE = 3, SW_RESTORE = 9, SW_HIDE = 0, SW_SHOW = 5;
  public const uint WM_CLOSE = 0x0010;
  public const uint MOUSEEVENTF_MOVE = 0x0001, MOUSEEVENTF_LEFTDOWN = 0x0002, MOUSEEVENTF_LEFTUP = 0x0004,
                     MOUSEEVENTF_RIGHTDOWN = 0x0008, MOUSEEVENTF_RIGHTUP = 0x0010,
                     MOUSEEVENTF_MIDDLEDOWN = 0x0020, MOUSEEVENTF_MIDDLEUP = 0x0040,
                     MOUSEEVENTF_WHEEL = 0x0800, MOUSEEVENTF_ABSOLUTE = 0x8000;
  public const uint KEYEVENTF_KEYUP = 0x0002, KEYEVENTF_EXTENDEDKEY = 0x0001;
}
'@ -ErrorAction SilentlyContinue
`.trim();
