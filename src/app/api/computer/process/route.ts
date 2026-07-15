import { NextRequest, NextResponse } from "next/server";

import { runPowerShellJson, WindowsNotAvailableError } from "@/lib/computer-use/powershell";
import type {
  ProcessActionType,
  ProcessInfo,
  ProcessRequest,
  ProcessResponse,
} from "@/lib/computer-use/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 20;

const VALID_ACTIONS = new Set<ProcessActionType>(["list", "start", "kill"]);

/**
 * System processes that we NEVER kill, even when targeted explicitly. These
 * are critical Windows services — killing them would crash the OS.
 */
const PROTECTED_PROCESSES = new Set([
  "lsass", "csrss", "wininit", "services", "svchost", "winlogon",
  "smss", "System", "Idle", "Registry", "fontdrvhost",
]);

/**
 * GET /api/computer/process?nameContains=chrome
 *      /api/computer/process
 *
 * POST /api/computer/process
 *   { action: "list"|"start"|"kill",
 *     target?, args?, pid?, nameContains?, includeServices? }
 */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const nameContains = sp.get("nameContains") || undefined;
  try {
    const processes = await listProcesses(nameContains);
    return NextResponse.json({
      action: "list",
      processes,
      ok: true,
    } satisfies ProcessResponse);
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(req: NextRequest) {
  let body: ProcessRequest;
  try {
    body = (await req.json()) as ProcessRequest;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (!body || typeof body.action !== "string" || !VALID_ACTIONS.has(body.action)) {
    return NextResponse.json(
      { error: `action must be one of: ${[...VALID_ACTIONS].join(", ")}` },
      { status: 400 },
    );
  }

  try {
    switch (body.action) {
      case "list": {
        const processes = await listProcesses(body.nameContains, body.includeServices);
        return NextResponse.json({
          action: "list",
          processes,
          ok: true,
        } satisfies ProcessResponse);
      }
      case "start": {
        if (!body.target) {
          return NextResponse.json({ error: "start requires target." }, { status: 400 });
        }
        const pid = await startProcess(body.target, body.args ?? "");
        return NextResponse.json({
          action: "start",
          started: { pid },
          ok: true,
        } satisfies ProcessResponse);
      }
      case "kill": {
        const result = await killProcess(body);
        return NextResponse.json({
          action: "kill",
          killed: result,
          ok: true,
        } satisfies ProcessResponse);
      }
      default:
        return NextResponse.json({ error: "Unhandled action." }, { status: 400 });
    }
  } catch (err) {
    return handleError(err);
  }
}

// ---------------------------------------------------------------------------
// Implementations
// ---------------------------------------------------------------------------

async function listProcesses(
  nameContains?: string,
  includeServices = false,
): Promise<ProcessInfo[]> {
  const script = `
$nameContains = ${JSON.stringify(nameContains ?? "")}
$includeServices = ${includeServices ? "$true" : "$false"}
$procs = if ($includeServices) { Get-Process } else { Get-Process | Where-Object { $_.MainWindowHandle -ne [IntPtr]::Zero -or $_.ProcessName -in @('explorer','notepad','chrome','msedge','firefox','code','slack','discord','spotify','powershell','cmd','devenv','winword','excel','powerpnt','outlook') } }
if ($nameContains) { $procs = $procs | Where-Object { $_.ProcessName -like "*$nameContains*" } }
$list = $procs | Select-Object -First 200 | ForEach-Object {
  $mem = if ($_.WorkingSet64) { [math]::Round($_.WorkingSet64 / 1MB, 1) } else { 0 }
  @{
    pid = $_.Id
    name = $_.ProcessName
    memoryMB = $mem
    mainWindowTitle = $_.MainWindowTitle
  }
}
$list | ConvertTo-Json -Compress -Depth 3
`;
  const { result } = await runPowerShellJson<ProcessInfo[] | ProcessInfo>(script, {
    timeoutMs: 10_000,
  });
  return Array.isArray(result) ? result : [result];
}

async function startProcess(target: string, args: string): Promise<number | null> {
  // Use Start-Process which handles PATH resolution + app aliases.
  const script = `
$target = ${JSON.stringify(target)}
$args = ${JSON.stringify(args)}
try {
  if ($args) {
    $p = Start-Process -FilePath $target -ArgumentList $args -PassThru
  } else {
    $p = Start-Process -FilePath $target -PassThru
  }
  if ($p) { @{ pid = $p.Id; ok = $true } | ConvertTo-Json -Compress } else { @{ pid = $null; ok = $true } | ConvertTo-Json -Compress }
} catch {
  @{ pid = $null; ok = $false; error = $_.Exception.Message } | ConvertTo-Json -Compress
}
`;
  const { result } = await runPowerShellJson<{ pid: number | null; ok: boolean; error?: string }>(
    script,
    { timeoutMs: 8_000 },
  );
  if (!result.ok) {
    throw new Error(result.error ?? "Failed to start process.");
  }
  return result.pid;
}

async function killProcess(body: ProcessRequest): Promise<{ target: string; count: number }> {
  // By PID (no protected check — PIDs are explicit).
  if (typeof body.pid === "number" && Number.isFinite(body.pid)) {
    const script = `
$pid_target = ${body.pid}
try {
  $p = Get-Process -Id $pid_target -ErrorAction Stop
  # Check protected list.
  $protected = @('lsass','csrss','wininit','services','svchost','winlogon','smss','System','Idle','Registry','fontdrvhost')
  if ($protected -contains $p.ProcessName) { @{ ok = $false; error = 'Cannot kill protected process: ' + $p.ProcessName } | ConvertTo-Json -Compress; exit }
  Stop-Process -Id $pid_target -Force
  @{ ok = $true; count = 1 } | ConvertTo-Json -Compress
} catch {
  @{ ok = $false; error = $_.Exception.Message } | ConvertTo-Json -Compress
}
`;
    const { result } = await runPowerShellJson<{ ok: boolean; error?: string; count?: number }>(
      script,
      { timeoutMs: 5_000 },
    );
    if (!result.ok) throw new Error(result.error ?? "Kill failed");
    return { target: String(body.pid), count: result.count ?? 1 };
  }

  // By name.
  if (!body.target) {
    throw new Error("kill requires either target or pid.");
  }
  const lower = body.target.toLowerCase().replace(/\.exe$/, "");
  if (PROTECTED_PROCESSES.has(lower)) {
    throw new Error(`Cannot kill protected system process: ${body.target}`);
  }
  const script = `
$name = ${JSON.stringify(lower)}
try {
  $procs = Get-Process -Name $name -ErrorAction Stop
  $count = ($procs | Measure-Object).Count
  $procs | Stop-Process -Force
  @{ ok = $true; count = $count } | ConvertTo-Json -Compress
} catch {
  @{ ok = $false; error = $_.Exception.Message } | ConvertTo-Json -Compress
}
`;
  const { result } = await runPowerShellJson<{ ok: boolean; error?: string; count?: number }>(
    script,
    { timeoutMs: 5_000 },
  );
  if (!result.ok) throw new Error(result.error ?? "Kill failed");
  return { target: body.target, count: result.count ?? 0 };
}

function handleError(err: unknown): Response {
  if (err instanceof WindowsNotAvailableError) {
    return NextResponse.json({ error: err.message, code: err.code }, { status: 503 });
  }
  console.error("[api/computer/process] error:", err);
  return NextResponse.json(
    {
      error: err instanceof Error ? err.message : "Process operation failed.",
      ok: false,
    },
    { status: 500 },
  );
}
