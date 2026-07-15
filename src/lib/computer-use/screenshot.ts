/**
 * Screenshot capture for the Computer Use module.
 *
 * Single function: `captureScreenshot(opts)` → base64 JPEG.
 *
 * Implementation notes:
 *   - Uses System.Drawing.Bitmap + Graphics.CopyFromScreen (no external deps).
 *   - Multi-monitor: a negative-origin virtual screen is supported — we
 *     always capture from the virtual screen origin so coordinates are
 *     stable regardless of monitor layout.
 *   - Region + window-title modes are layered on top.
 *   - JPEG quality default 60; output is downscaled to ≤1600px wide so the
 *     VLM gets a reasonable token budget. The agent loop's coordinate
 *     system uses the OUTPUT image dimensions, NOT the physical screen —
 *     the VLM prompt is explicit about this.
 *   - Hard cap: 100 KB. If JPEG Q60 + 1600px-wide exceeds that, we re-save
 *     at Q40; if still over, Q20. The result is always returned (the loop
 *     would rather see a low-quality image than nothing).
 */

import { runPowerShellJson, psVars, PS_WIN32_ADD_TYPE } from "./powershell";
import {
  SCREENSHOT_QUALITY,
  SCREENSHOT_MAX_WIDTH,
  MAX_SCREENSHOT_BYTES,
} from "./security";
import type { ScreenshotRequest, ScreenshotResponse } from "./types";

export async function captureScreenshot(
  opts: ScreenshotRequest = {},
): Promise<ScreenshotResponse> {
  const quality = clampQuality(opts.quality ?? SCREENSHOT_QUALITY);
  const maxWidth = opts.maxWidth ?? SCREENSHOT_MAX_WIDTH;

  // Build the PowerShell script. All dynamic values go through psVars()
  // which escapes single-quotes by doubling — no string interpolation.
  const vars = psVars({
    monitor: opts.monitor ?? 0,
    quality,
    maxWidth,
    useRegion: Boolean(opts.region),
    rx: opts.region?.x ?? 0,
    ry: opts.region?.y ?? 0,
    rw: opts.region?.w ?? 0,
    rh: opts.region?.h ?? 0,
    useWindow: Boolean(opts.windowTitle),
    windowTitle: opts.windowTitle ?? "",
  });

  const script = `
${PS_WIN32_ADD_TYPE}
Add-Type -AssemblyName System.Windows.Forms, System.Drawing
${vars}

# Determine the source rectangle.
$rect = $null
if ($useWindow -and $windowTitle) {
  $proc = Get-Process | Where-Object { $_.MainWindowTitle -and $_.MainWindowTitle -like "*$($windowTitle)*" } | Select-Object -First 1
  if ($proc) {
    $r = New-Object Win32+RECT
    [void][Win32]::GetWindowRect($proc.MainWindowHandle, [ref]$r)
    $rect = New-Object System.Drawing.Rectangle $r.Left, $r.Top, ($r.Right - $r.Left), ($r.Bottom - $r.Top)
  }
}
if (-not $rect -and $useRegion) {
  $rect = New-Object System.Drawing.Rectangle $rx, $ry, $rw, $rh
}
if (-not $rect) {
  # Full virtual screen (covers all monitors).
  $rect = [System.Windows.Forms.SystemInformation]::VirtualScreen
}

# Capture.
$bmp = New-Object System.Drawing.Bitmap $rect.Width, $rect.Height
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.CopyFromScreen($rect.Location, [System.Drawing.Point]::Empty, $rect.Size)

# Downscale if wider than maxWidth.
$outBmp = $bmp
$scale = 1.0
if ($maxWidth -gt 0 -and $bmp.Width -gt $maxWidth) {
  $scale = $maxWidth / $bmp.Width
  $newW = [int]($bmp.Width * $scale)
  $newH = [int]($bmp.Height * $scale)
  $outBmp = New-Object System.Drawing.Bitmap $newW, $newH
  $og = [System.Drawing.Graphics]::FromImage($outBmp)
  $og.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $og.DrawImage($bmp, 0, 0, $newW, $newH)
  $og.Dispose()
  $bmp.Dispose()
  $bmp = $outBmp
}

# JPEG encode at the requested quality.
$jpgEncoder = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' } | Select-Object -First 1
$params = New-Object System.Drawing.Imaging.EncoderParameters 1
$params.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter ([System.Drawing.Imaging.Encoder]::Quality, [long]$quality)
$ms = New-Object System.IO.MemoryStream
$bmp.Save($ms, $jpgEncoder, $params)
$bytes = $ms.ToArray()
$ms.Dispose()
$bmp.Dispose()
$g.Dispose()

$base64 = [Convert]::ToBase64String($bytes)
@{
  base64 = $base64
  width = [int]($rect.Width * $scale)
  height = [int]($rect.Height * $scale)
  bytes = $bytes.Length
  monitor = $monitor
  capturedAt = (Get-Date).ToString('o')
} | ConvertTo-Json -Compress
`;

  const { result } = await runPowerShellJson<{
    base64: string;
    width: number;
    height: number;
    bytes: number;
    monitor: number;
    capturedAt: string;
  }>(script, { timeoutMs: 10_000 });

  // Enforce the 100 KB cap by re-encoding at lower quality if necessary.
  let finalBase64 = result.base64;
  let finalBytes = result.bytes;
  let finalQuality = quality;
  if (finalBytes > MAX_SCREENSHOT_BYTES && finalQuality > 20) {
    const reduced = await reencodeAtLowerQuality(opts, Math.max(20, finalQuality - 20));
    if (reduced) {
      finalBase64 = reduced.base64;
      finalBytes = reduced.bytes;
      finalQuality = reduced.quality;
    }
  }

  void finalQuality; // for logging if needed
  return {
    base64: finalBase64,
    width: result.width,
    height: result.height,
    bytes: finalBytes,
    monitor: result.monitor,
    capturedAt: result.capturedAt,
  };
}

function clampQuality(q: number): number {
  return Math.max(10, Math.min(95, Math.floor(q)));
}

/**
 * Fallback: if the first capture is too big, re-capture at a lower quality.
 * We re-run the whole script rather than decoding the JPEG client-side
 * (Node has no built-in JPEG decoder and we want zero external deps in this
 * module).
 */
async function reencodeAtLowerQuality(
  opts: ScreenshotRequest,
  newQuality: number,
): Promise<{ base64: string; bytes: number; quality: number } | null> {
  try {
    const result = await captureScreenshot({ ...opts, quality: newQuality });
    return { base64: result.base64, bytes: result.bytes, quality: newQuality };
  } catch {
    return null;
  }
}
