import { NextRequest, NextResponse } from "next/server";

import { runPowerShellJson, psVars, WindowsNotAvailableError, PS_WIN32_ADD_TYPE } from "@/lib/computer-use/powershell";
import type { MouseRequest, MouseActionType, MouseButton } from "@/lib/computer-use/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const VALID_ACTIONS = new Set<MouseActionType>([
  "move", "click", "double-click", "right-click", "middle-click", "drag", "scroll", "scroll-down", "scroll-up",
]);

/**
 * POST /api/computer/mouse
 *
 * Body: MouseRequest
 *   { action, x?, y?, fromX?, fromY?, button?, scrollAmount?, delayMs? }
 *
 * Returns: `{ ok: true, action, durationMs }` on success.
 */
export async function POST(req: NextRequest) {
  let body: MouseRequest;
  try {
    body = (await req.json()) as MouseRequest;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body.", code: "BAD_BODY" }, { status: 400 });
  }

  if (!body || typeof body.action !== "string" || !VALID_ACTIONS.has(body.action as MouseActionType)) {
    return NextResponse.json(
      { error: `Invalid action. Must be one of: ${[...VALID_ACTIONS].join(", ")}` },
      { status: 400 },
    );
  }

  // Coordinate validation.
  const needsXY = body.action !== "drag" && !body.action.startsWith("scroll-");
  if (needsXY && (!Number.isFinite(body.x) || !Number.isFinite(body.y))) {
    return NextResponse.json(
      { error: `Action "${body.action}" requires numeric x and y.` },
      { status: 400 },
    );
  }
  if (body.action === "drag" && (
    !Number.isFinite(body.fromX) || !Number.isFinite(body.fromY) ||
    !Number.isFinite(body.x) || !Number.isFinite(body.y)
  )) {
    return NextResponse.json(
      { error: "drag requires numeric fromX, fromY, x (toX), y (toY)." },
      { status: 400 },
    );
  }

  const button: MouseButton =
    body.button === "right" || body.button === "middle" ? body.button : "left";

  try {
    const result = await execMouse(body, button);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    if (err instanceof WindowsNotAvailableError) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: 503 });
    }
    console.error("[api/computer/mouse] error:", err);
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : "Mouse action failed.",
        code: "MOUSE_FAILED",
      },
      { status: 500 },
    );
  }
}

async function execMouse(
  body: MouseRequest,
  button: MouseButton,
): Promise<{ action: MouseActionType; durationMs: number }> {
  const startedAt = Date.now();

  // Normalize scroll-down / scroll-up into scroll with sign.
  let effectiveAction = body.action;
  let scrollAmount = body.scrollAmount ?? 0;
  if (body.action === "scroll-down") { effectiveAction = "scroll"; scrollAmount = Math.abs(scrollAmount) || 3; }
  if (body.action === "scroll-up") { effectiveAction = "scroll"; scrollAmount = -Math.abs(scrollAmount) || -3; }

  const vars = psVars({
    action: effectiveAction,
    x: Math.round(body.x ?? 0),
    y: Math.round(body.y ?? 0),
    fromX: Math.round(body.fromX ?? 0),
    fromY: Math.round(body.fromY ?? 0),
    button,
    scrollDelta: Math.round(Math.max(-50, Math.min(50, scrollAmount)) * 120),
    double: body.action === "double-click",
    delay: Math.max(0, Math.min(500, body.delayMs ?? 30)),
  });

  const script = `
${PS_WIN32_ADD_TYPE}
Add-Type -AssemblyName System.Windows.Forms
${vars}

switch ($action) {
  'move' {
    [Win32]::SetCursorPos($x, $y)
  }
  'click' {
    [Win32]::SetCursorPos($x, $y)
    Start-Sleep -Milliseconds $delay
    $down = if ($button -eq 'right') { 8 } elseif ($button -eq 'middle') { 32 } else { 2 }
    $up   = if ($button -eq 'right') { 16 } elseif ($button -eq 'middle') { 64 } else { 4 }
    [Win32]::mouse_event($down, 0, 0, 0, [UIntPtr]::Zero)
    Start-Sleep -Milliseconds 30
    [Win32]::mouse_event($up, 0, 0, 0, [UIntPtr]::Zero)
    if ($double) {
      Start-Sleep -Milliseconds 80
      [Win32]::mouse_event($down, 0, 0, 0, [UIntPtr]::Zero)
      Start-Sleep -Milliseconds 30
      [Win32]::mouse_event($up, 0, 0, 0, [UIntPtr]::Zero)
    }
  }
  'double-click' {
    [Win32]::SetCursorPos($x, $y)
    Start-Sleep -Milliseconds $delay
    [Win32]::mouse_event(2, 0, 0, 0, [UIntPtr]::Zero)
    [Win32]::mouse_event(4, 0, 0, 0, [UIntPtr]::Zero)
    Start-Sleep -Milliseconds 80
    [Win32]::mouse_event(2, 0, 0, 0, [UIntPtr]::Zero)
    [Win32]::mouse_event(4, 0, 0, 0, [UIntPtr]::Zero)
  }
  'scroll' {
    [Win32]::SetCursorPos($x, $y)
    Start-Sleep -Milliseconds $delay
    [Win32]::mouse_event(0x0800, 0, 0, $scrollDelta, [UIntPtr]::Zero)
  }
  'drag' {
    [Win32]::SetCursorPos($fromX, $fromY)
    Start-Sleep -Milliseconds 100
    [Win32]::mouse_event(2, 0, 0, 0, [UIntPtr]::Zero)
    $steps = 20
    for ($i = 1; $i -le $steps; $i++) {
      $cx = [int]($fromX + ($x - $fromX) * $i / $steps)
      $cy = [int]($fromY + ($y - $fromY) * $i / $steps)
      [Win32]::SetCursorPos($cx, $cy)
      Start-Sleep -Milliseconds 10
    }
    Start-Sleep -Milliseconds 80
    [Win32]::mouse_event(4, 0, 0, 0, [UIntPtr]::Zero)
  }
  default { throw "Unknown mouse action: $action" }
}
@{ ok = $true; action = $action } | ConvertTo-Json -Compress
`;

  await runPowerShellJson(script, { timeoutMs: 5_000 });
  return { action: body.action, durationMs: Date.now() - startedAt };
}
