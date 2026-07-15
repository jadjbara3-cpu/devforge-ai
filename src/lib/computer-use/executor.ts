/**
 * Action executor for the Computer Use agent.
 *
 * Takes a validated `AgentAction` and performs it against the Windows host
 * by calling the same PowerShell primitives that the HTTP routes use. Keeps
 * the agent loop's body small: `const result = await executeAction(action, opts)`.
 *
 * Returns a structured outcome that the agent loop forwards as
 * `action_result` SSE events and persists in `ComputerTask.steps`.
 */

import { runPowerShell, runPowerShellJson, psVars, PS_WIN32_ADD_TYPE } from "./powershell";
import {
  classifyAction,
  classifyShellCommand,
  explainDanger,
  buildHotkeyString,
  escapeSendKeysText,
  sanitiseKeyName,
} from "./security";
import type {
  AgentAction,
  ShellKind,
} from "./types";

export interface ActionExecOptions {
  /** When true, do nothing — return a fake success. For sandbox mode. */
  sandbox?: boolean;
  /** Default monitor index for screenshots inside the loop (unused here but kept for symmetry). */
  monitor?: number;
}

export interface ActionResult {
  ok: boolean;
  error?: string;
  data?: unknown;
  durationMs: number;
  /** True if the action was destructive (for audit logging). */
  risk: "safe" | "moderate" | "destructive";
  /** True if the action was simulated rather than executed. */
  simulated: boolean;
}

/**
 * Execute one agent action. NEVER throws — failures are returned as
 * `{ ok:false, error }` so the agent loop can feed the error back to the
 * VLM as part of the next iteration's history.
 */
export async function executeAction(
  action: AgentAction,
  options: ActionExecOptions = {},
): Promise<ActionResult> {
  const startedAt = Date.now();
  const risk = classifyAction(action);
  const simulated = Boolean(options.sandbox);

  // Sandbox mode short-circuits every action except "screenshot" (which is
  // safe + needed for the VLM to see what's happening).
  if (simulated && action.type !== "screenshot" && action.type !== "done") {
    return {
      ok: true,
      data: { simulated: true },
      durationMs: Date.now() - startedAt,
      risk,
      simulated: true,
    };
  }

  try {
    switch (action.type) {
      case "screenshot": {
        // The agent loop already takes a fresh screenshot every iteration.
        // A "screenshot" action is a no-op that just asks the loop to advance.
        return {
          ok: true,
          data: { note: "screenshot is implicit — loop will capture next frame" },
          durationMs: Date.now() - startedAt,
          risk,
          simulated: false,
        };
      }
      case "click":
        await execClick(action.x, action.y, action.button ?? "left", action.double ?? false);
        return ok(startedAt, risk);
      case "right-click":
        await execClick(action.x, action.y, "right", false);
        return ok(startedAt, risk);
      case "drag":
        await execDrag(action.fromX, action.fromY, action.toX, action.toY);
        return ok(startedAt, risk);
      case "scroll":
        await execScroll(action.x, action.y, action.amount);
        return ok(startedAt, risk);
      case "type":
        await execType(action.text, action.interval ?? 0);
        return ok(startedAt, risk);
      case "key":
        await execHotkey(action.keys);
        return ok(startedAt, risk);
      case "wait": {
        await sleep(action.ms);
        return ok(startedAt, risk);
      }
      case "shell": {
        const result = await execShell(action.command, action.kind ?? "powershell");
        return {
          ok: result.exitCode === 0,
          data: result,
          durationMs: Date.now() - startedAt,
          risk,
          simulated: false,
        };
      }
      case "open_app": {
        const result = await execOpenApp(action.name, action.args);
        return {
          ok: result.ok,
          data: result,
          error: result.error,
          durationMs: Date.now() - startedAt,
          risk,
          simulated: false,
        };
      }
      case "window": {
        const result = await execWindowAction(action.action, action.titleContains);
        return {
          ok: result.ok,
          data: result,
          error: result.error,
          durationMs: Date.now() - startedAt,
          risk,
          simulated: false,
        };
      }
      case "done":
        return {
          ok: true,
          data: { result: action.result },
          durationMs: Date.now() - startedAt,
          risk,
          simulated: false,
        };
      default: {
        const _exhaustive: never = action;
        void _exhaustive;
        return {
          ok: false,
          error: "Unknown action type (this is a bug)",
          durationMs: Date.now() - startedAt,
          risk: "destructive",
          simulated: false,
        };
      }
    }
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      durationMs: Date.now() - startedAt,
      risk,
      simulated: false,
    };
  }
}

function ok(startedAt: number, risk: "safe" | "moderate" | "destructive"): ActionResult {
  return {
    ok: true,
    durationMs: Date.now() - startedAt,
    risk,
    simulated: false,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, Math.min(10_000, Math.max(0, ms))));
}

// ---------------------------------------------------------------------------
// Concrete PowerShell-backed implementations
// ---------------------------------------------------------------------------

async function execClick(
  x: number,
  y: number,
  button: "left" | "right" | "middle",
  double: boolean,
): Promise<void> {
  const vars = psVars({
    x: Math.round(x),
    y: Math.round(y),
    button,
    double,
  });
  const script = `
${PS_WIN32_ADD_TYPE}
Add-Type -AssemblyName System.Windows.Forms
${vars}
[Win32]::SetCursorPos($x, $y)
Start-Sleep -Milliseconds 50
$down = switch ($button) { 'left' { 2 } 'right' { 8 } 'middle' { 32 } }
$up = switch ($button) { 'left' { 4 } 'right' { 16 } 'middle' { 64 } }
[Win32]::mouse_event($down, 0, 0, 0, [UIntPtr]::Zero)
Start-Sleep -Milliseconds 30
[Win32]::mouse_event($up, 0, 0, 0, [UIntPtr]::Zero)
if ($double) {
  Start-Sleep -Milliseconds 80
  [Win32]::mouse_event($down, 0, 0, 0, [UIntPtr]::Zero)
  Start-Sleep -Milliseconds 30
  [Win32]::mouse_event($up, 0, 0, 0, [UIntPtr]::Zero)
}
@{ ok = $true } | ConvertTo-Json -Compress
`;
  await runPowerShellJson(script, { timeoutMs: 5_000 });
}

async function execDrag(
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
): Promise<void> {
  const vars = psVars({
    fromX: Math.round(fromX),
    fromY: Math.round(fromY),
    toX: Math.round(toX),
    toY: Math.round(toY),
  });
  const script = `
${PS_WIN32_ADD_TYPE}
${vars}
[Win32]::SetCursorPos($fromX, $fromY)
Start-Sleep -Milliseconds 100
[Win32]::mouse_event(2, 0, 0, 0, [UIntPtr]::Zero)   # LEFTDOWN
# Smooth-ish drag: 20 steps over ~200ms.
$steps = 20
for ($i = 1; $i -le $steps; $i++) {
  $cx = [int]($fromX + ($toX - $fromX) * $i / $steps)
  $cy = [int]($fromY + ($toY - $fromY) * $i / $steps)
  [Win32]::SetCursorPos($cx, $cy)
  Start-Sleep -Milliseconds 10
}
Start-Sleep -Milliseconds 80
[Win32]::mouse_event(4, 0, 0, 0, [UIntPtr]::Zero)   # LEFTUP
@{ ok = $true } | ConvertTo-Json -Compress
`;
  await runPowerShellJson(script, { timeoutMs: 5_000 });
}

async function execScroll(x: number, y: number, amount: number): Promise<void> {
  // MOUSEEVENTF_WHEEL = 0x0800. The wheel delta is in multiples of 120 (WHEEL_DELTA).
  const delta = Math.round(Math.max(-50, Math.min(50, amount)) * 120);
  const vars = psVars({ x: Math.round(x), y: Math.round(y), delta });
  const script = `
${PS_WIN32_ADD_TYPE}
${vars}
[Win32]::SetCursorPos($x, $y)
Start-Sleep -Milliseconds 50
[Win32]::mouse_event(0x0800, 0, 0, $delta, [UIntPtr]::Zero)
@{ ok = $true } | ConvertTo-Json -Compress
`;
  await runPowerShellJson(script, { timeoutMs: 5_000 });
}

async function execType(text: string, intervalMs: number): Promise<void> {
  // We use SendKeys with the text escaped. For long text, SendWait is the
  // most reliable approach (it pumps WM_CHAR messages).
  const escaped = escapeSendKeysText(text);
  const vars = psVars({ text: escaped, interval: Math.max(0, Math.min(200, intervalMs)) });
  const script = `
Add-Type -AssemblyName System.Windows.Forms
${vars}
if ($interval -gt 0) { [System.Windows.Forms.SendKeys]::SendWait($text) }
else { [System.Windows.Forms.SendKeys]::SendWait($text) }
@{ ok = $true; chars = $text.Length } | ConvertTo-Json -Compress
`;
  await runPowerShellJson(script, { timeoutMs: 30_000 });
}

async function execHotkey(keys: string[]): Promise<void> {
  // Validate every key first (throws synchronously if any is unknown).
  // The resulting SendKeys string is built via the security helper.
  const sendKeysStr = buildHotkeyString(keys);
  const vars = psVars({ combo: sendKeysStr });
  const script = `
Add-Type -AssemblyName System.Windows.Forms
${vars}
[System.Windows.Forms.SendKeys]::SendWait($combo)
@{ ok = $true; combo = $combo } | ConvertTo-Json -Compress
`;
  await runPowerShellJson(script, { timeoutMs: 5_000 });
}

interface ShellExecResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  durationMs: number;
  timedOut: boolean;
}

async function execShell(command: string, kind: ShellKind): Promise<ShellExecResult> {
  // Re-classify here in case the agent loop's check was bypassed.
  if (classifyShellCommand(command) === "destructive") {
    throw new Error(
      `Destructive shell command blocked: ${explainDanger(command).join("; ")}`,
    );
  }
  // We delegate to the shell route's logic by inlining a minimal version.
  // (The route does the same thing — both call runPowerShell with the user's
  // command. We keep this inline so the agent loop doesn't make an HTTP
  // round-trip to itself.)
  const vars = psVars({ cmd: command });
  const psScript = kind === "cmd"
    ? `${vars}\n$out = & cmd.exe /c $cmd 2>&1\n$out | Out-String | ConvertTo-Json -Compress`
    : `${vars}\n$out = Invoke-Expression -Command $cmd 2>&1 | Out-String\n@{ output = $out } | ConvertTo-Json -Compress`;

  const start = Date.now();
  const raw = await runPowerShell(psScript, { timeoutMs: 15_000 });
  return {
    stdout: raw.stdout,
    stderr: raw.stderr,
    exitCode: raw.exitCode,
    durationMs: Date.now() - start,
    timedOut: raw.timedOut,
  };
}

async function execOpenApp(
  name: string,
  args?: string,
): Promise<{ ok: boolean; error?: string }> {
  // Use the Start Menu search by sending Win key + app name + Enter.
  // This is more robust than guessing the executable path.
  const sanitised = sanitiseAppName(name);
  const escaped = escapeSendKeysText(sanitised);
  const vars = psVars({
    app: escaped,
    args: args ? escapeSendKeysText(args) : "",
    hasArgs: Boolean(args),
  });
  const script = `
${PS_WIN32_ADD_TYPE}
Add-Type -AssemblyName System.Windows.Forms
${vars}
# Press Win key
[Win32]::keybd_event(0x5B, 0, 0, [UIntPtr]::Zero)   # VK_LWIN down
[Win32]::keybd_event(0x5B, 0, 2, [UIntPtr]::Zero)   # VK_LWIN up
Start-Sleep -Milliseconds 400
[System.Windows.Forms.SendKeys]::SendWait($app)
Start-Sleep -Milliseconds 600
if ($hasArgs) {
  [System.Windows.Forms.SendKeys]::SendWait('{TAB}')
  Start-Sleep -Milliseconds 200
  [System.Windows.Forms.SendKeys]::SendWait($args)
  Start-Sleep -Milliseconds 200
}
[System.Windows.Forms.SendKeys]::SendWait('{ENTER}')
@{ ok = $true } | ConvertTo-Json -Compress
`;
  try {
    await runPowerShellJson(script, { timeoutMs: 8_000 });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

async function execWindowAction(
  action: "focus" | "minimize" | "maximize" | "restore" | "close" | "move" | "resize",
  titleContains?: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!titleContains) {
    return { ok: false, error: "window action requires titleContains" };
  }
  const vars = psVars({ titleContains });
  const cmdMap: Record<string, string> = {
    focus: "[Win32]::SetForegroundWindow($h)",
    minimize: "[Win32]::ShowWindow($h, 6)",
    maximize: "[Win32]::ShowWindow($h, 3)",
    restore: "[Win32]::ShowWindow($h, 9)",
    close: "[Win32]::PostMessage($h, 0x0010, [IntPtr]::Zero, [IntPtr]::Zero)",
    move: "throw 'move not supported via window action; use drag'",
    resize: "throw 'resize not supported via window action; use drag'",
  };
  const cmd = cmdMap[action];
  const script = `
${PS_WIN32_ADD_TYPE}
${vars}
$procs = Get-Process | Where-Object { $_.MainWindowTitle -and $_.MainWindowTitle -like "*$($titleContains)*" } | Select-Object -First 1
if (-not $procs) { @{ ok = $false; error = "No window matching '" + $titleContains + "'" } | ConvertTo-Json -Compress; exit }
$h = $procs.MainWindowHandle
try {
  ${cmd}
  @{ ok = $true; title = $procs.MainWindowTitle } | ConvertTo-Json -Compress
} catch {
  @{ ok = $false; error = $_.Exception.Message } | ConvertTo-Json -Compress
}
`;
  try {
    const { result } = await runPowerShellJson<{ ok: boolean; error?: string; title?: string }>(
      script,
      { timeoutMs: 5_000 },
    );
    return { ok: result.ok, error: result.error };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Crude app-name sanitiser: keep alphanumerics, spaces, dots, hyphens.
 * This is a defence-in-depth — the Start Menu search is forgiving, but a
 * weird string with `;` could in principle confuse SendKeys.
 */
function sanitiseAppName(name: string): string {
  return name.replace(/[^\w\s.\-]/g, "").slice(0, 80);
}
