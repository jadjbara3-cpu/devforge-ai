import { NextRequest, NextResponse } from "next/server";

import { runPowerShellJson, psVars, WindowsNotAvailableError } from "@/lib/computer-use/powershell";
import type { ClipboardRequest, ClipboardResponse, ClipboardActionType } from "@/lib/computer-use/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 15;

const VALID_ACTIONS = new Set<ClipboardActionType>([
  "get-text", "set-text", "get-image", "clear",
]);

/**
 * GET /api/computer/clipboard
 *   Returns the current clipboard contents (text + hasImage flag).
 *
 * POST /api/computer/clipboard
 *   { action: "get-text"|"set-text"|"get-image"|"clear", text? }
 */
export async function GET() {
  try {
    const result = await readClipboard();
    const response: ClipboardResponse = {
      action: "get-text",
      ok: true,
      text: result.text,
      hasImage: result.hasImage,
    };
    return NextResponse.json(response);
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(req: NextRequest) {
  let body: ClipboardRequest;
  try {
    body = (await req.json()) as ClipboardRequest;
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
      case "get-text": {
        const result = await readClipboard();
        return NextResponse.json({
          action: "get-text",
          ok: true,
          text: result.text,
          hasImage: result.hasImage,
        } satisfies ClipboardResponse);
      }
      case "set-text": {
        if (typeof body.text !== "string") {
          return NextResponse.json({ error: "set-text requires string text." }, { status: 400 });
        }
        if (body.text.length > 1_000_000) {
          return NextResponse.json({ error: "Clipboard text exceeds 1MB limit." }, { status: 400 });
        }
        await writeClipboard(body.text);
        return NextResponse.json({ action: "set-text", ok: true } satisfies ClipboardResponse);
      }
      case "get-image": {
        const imageBase64 = await readClipboardImage();
        return NextResponse.json({
          action: "get-image",
          ok: true,
          hasImage: Boolean(imageBase64),
          imageBase64: imageBase64 ?? undefined,
        } satisfies ClipboardResponse);
      }
      case "clear": {
        await clearClipboard();
        return NextResponse.json({ action: "clear", ok: true } satisfies ClipboardResponse);
      }
      default:
        return NextResponse.json({ error: "Unhandled action." }, { status: 400 });
    }
  } catch (err) {
    return handleError(err);
  }
}

// ---------------------------------------------------------------------------
// PowerShell clipboard helpers
// ---------------------------------------------------------------------------

async function readClipboard(): Promise<{ text: string; hasImage: boolean }> {
  const script = `
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
$text = ""
$hasImage = $false
try {
  if ([System.Windows.Forms.Clipboard]::ContainsText()) {
    $text = [System.Windows.Forms.Clipboard]::GetText()
  }
  if ([System.Windows.Forms.Clipboard]::ContainsImage()) {
    $hasImage = $true
  }
} catch {
  # STA-thread issues — retry via the second AppDomain.
}
@{ text = $text; hasImage = $hasImage } | ConvertTo-Json -Compress
`;
  const { result } = await runPowerShellJson<{ text: string; hasImage: boolean }>(script, {
    timeoutMs: 5_000,
  });
  return { text: result.text ?? "", hasImage: Boolean(result.hasImage) };
}

async function readClipboardImage(): Promise<string | null> {
  const script = `
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
if (-not [System.Windows.Forms.Clipboard]::ContainsImage()) { @{ image = $null } | ConvertTo-Json -Compress; exit }
$img = [System.Windows.Forms.Clipboard]::GetImage()
$ms = New-Object System.IO.MemoryStream
$img.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
$bytes = $ms.ToArray()
$ms.Dispose()
@{ image = [Convert]::ToBase64String($bytes) } | ConvertTo-Json -Compress
`;
  const { result } = await runPowerShellJson<{ image: string | null }>(script, {
    timeoutMs: 5_000,
  });
  return result.image ?? null;
}

async function writeClipboard(text: string): Promise<void> {
  // SetText via the clipboard is STA-only; we use a job to be safe.
  const vars = psVars({ text });
  const script = `
Add-Type -AssemblyName System.Windows.Forms
${vars}
# Run on STA thread via Start-ThreadJob if available, else via [Windows.Forms.Application]::Run trick.
try {
  [System.Windows.Forms.Clipboard]::SetText($text)
} catch {
  # Retry via a new STA thread.
  $job = Start-ThreadJob -ScriptBlock {
    param($t)
    Add-Type -AssemblyName System.Windows.Forms
    [System.Windows.Forms.Clipboard]::SetText($t)
  } -ArgumentList $text
  $job | Wait-Job -Timeout 5 | Out-Null
}
@{ ok = $true } | ConvertTo-Json -Compress
`;
  await runPowerShellJson(script, { timeoutMs: 8_000 });
}

async function clearClipboard(): Promise<void> {
  const script = `
Add-Type -AssemblyName System.Windows.Forms
[System.Windows.Forms.Clipboard]::Clear()
@{ ok = $true } | ConvertTo-Json -Compress
`;
  await runPowerShellJson(script, { timeoutMs: 3_000 });
}

function handleError(err: unknown): Response {
  if (err instanceof WindowsNotAvailableError) {
    return NextResponse.json({ error: err.message, code: err.code }, { status: 503 });
  }
  console.error("[api/computer/clipboard] error:", err);
  return NextResponse.json(
    {
      error: err instanceof Error ? err.message : "Clipboard operation failed.",
      code: "CLIPBOARD_FAILED",
    },
    { status: 500 },
  );
}
