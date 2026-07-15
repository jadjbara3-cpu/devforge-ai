import { NextRequest, NextResponse } from "next/server";

import { runPowerShellJson, psVars, WindowsNotAvailableError, PS_WIN32_ADD_TYPE } from "@/lib/computer-use/powershell";
import type { WindowsRequest, WindowsResponse, WindowInfo, WindowActionType } from "@/lib/computer-use/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const VALID_WINDOW_ACTIONS = new Set<WindowActionType>([
  "focus", "minimize", "maximize", "restore", "close", "move", "resize",
]);

/**
 * GET /api/computer/windows
 *   ?titleContains=Notepad
 *   ?processContains=chrome
 *
 * POST /api/computer/windows
 *   { action: "focus"|"minimize"|..., targetTitle?, titleContains?, x?, y?, width?, height? }
 *
 * GET returns the list of open windows. POST performs a window action and
 * returns the (updated) list.
 */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const titleContains = sp.get("titleContains") || undefined;
  const processContains = sp.get("processContains") || undefined;

  try {
    const windows = await listWindows(titleContains, processContains);
    const res: WindowsResponse = { windows };
    return NextResponse.json(res);
  } catch (err) {
    if (err instanceof WindowsNotAvailableError) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: 503 });
    }
    console.error("[api/computer/windows] GET error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to list windows." },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  let body: WindowsRequest;
  try {
    body = (await req.json()) as WindowsRequest;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (!body.action || !VALID_WINDOW_ACTIONS.has(body.action)) {
    return NextResponse.json(
      { error: `action must be one of: ${[...VALID_WINDOW_ACTIONS].join(", ")}` },
      { status: 400 },
    );
  }

  // Resolve target title.
  const targetTitle = body.targetTitle ?? body.titleContains;
  if (!targetTitle && body.action !== "focus") {
    return NextResponse.json(
      { error: "Either targetTitle or titleContains is required." },
      { status: 400 },
    );
  }

  try {
    const actionResult = await performWindowAction(
      body.action,
      targetTitle ?? "",
      body,
    );
    // Also return the updated window list for the client to refresh.
    const windows = await listWindows(undefined, undefined);
    const res: WindowsResponse = {
      windows,
      action: {
        type: body.action,
        target: targetTitle ?? "",
        ok: actionResult.ok,
        error: actionResult.error,
      },
    };
    return NextResponse.json(res);
  } catch (err) {
    if (err instanceof WindowsNotAvailableError) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: 503 });
    }
    console.error("[api/computer/windows] POST error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Window action failed." },
      { status: 500 },
    );
  }
}

// ---------------------------------------------------------------------------
// Implementations
// ---------------------------------------------------------------------------

async function listWindows(
  titleContains?: string,
  processContains?: string,
): Promise<WindowInfo[]> {
  const vars = psVars({
    titleContains: titleContains ?? "",
    processContains: processContains ?? "",
    hasTitle: Boolean(titleContains),
    hasProcess: Boolean(processContains),
  });

  const script = `
${PS_WIN32_ADD_TYPE}
${vars}
$procs = Get-Process | Where-Object {
  $_.MainWindowHandle -ne [IntPtr]::Zero -and
  $_.MainWindowTitle
}
if ($hasTitle) {
  $procs = $procs | Where-Object { $_.MainWindowTitle -like "*$($titleContains)*" }
}
if ($hasProcess) {
  $procs = $procs | Where-Object { $_.ProcessName -like "*$($processContains)*" }
}
$list = @()
foreach ($p in $procs) {
  $r = New-Object Win32+RECT
  [void][Win32]::GetWindowRect($p.MainWindowHandle, [ref]$r)
  $list += @{
    handle        = [int64]$p.MainWindowHandle
    title         = $p.MainWindowTitle
    processName   = $p.ProcessName
    processId     = $p.Id
    x             = $r.Left
    y             = $r.Top
    width         = $r.Right - $r.Left
    height        = $r.Bottom - $r.Top
    isMinimized   = ($r.Right - $r.Left -le 0 -or $r.Bottom - $r.Top -le 0)
    isMaximized   = $false
    isVisible     = $true
  }
}
$list | ConvertTo-Json -Compress -Depth 4
`;

  const { result } = await runPowerShellJson<WindowInfo[] | WindowInfo>(script, {
    timeoutMs: 8_000,
  });
  // PowerShell emits a single object when the array has one element.
  return Array.isArray(result) ? result : [result];
}

async function performWindowAction(
  action: WindowActionType,
  targetTitle: string,
  body: WindowsRequest,
): Promise<{ ok: boolean; error?: string }> {
  const vars = psVars({
    titleContains: targetTitle,
    action,
    x: body.x ?? 0,
    y: body.y ?? 0,
    width: body.width ?? 0,
    height: body.height ?? 0,
  });

  const script = `
${PS_WIN32_ADD_TYPE}
${vars}
$proc = Get-Process | Where-Object { $_.MainWindowTitle -and $_.MainWindowTitle -like "*$($titleContains)*" } | Select-Object -First 1
if (-not $proc) { @{ ok = $false; error = "No window matching '" + $titleContains + "'" } | ConvertTo-Json -Compress; exit }
$h = $proc.MainWindowHandle
try {
  switch ($action) {
    'focus'    { [void][Win32]::SetForegroundWindow($h) }
    'minimize' { [void][Win32]::ShowWindow($h, 6) }
    'maximize' { [void][Win32]::ShowWindow($h, 3) }
    'restore'  { [void][Win32]::ShowWindow($h, 9) }
    'close'    { [void][Win32]::PostMessage($h, 0x0010, [IntPtr]::Zero, [IntPtr]::Zero) }
    'move'     { throw 'Use mouse drag for move' }
    'resize'   { throw 'Use mouse drag for resize' }
    default    { throw "Unknown action: $action" }
  }
  @{ ok = $true; title = $proc.MainWindowTitle } | ConvertTo-Json -Compress
} catch {
  @{ ok = $false; error = $_.Exception.Message } | ConvertTo-Json -Compress
}
`;

  const { result } = await runPowerShellJson<{ ok: boolean; error?: string }>(script, {
    timeoutMs: 5_000,
  });
  return { ok: result.ok, error: result.error };
}
