import { NextRequest, NextResponse } from "next/server";

import { captureScreenshot } from "@/lib/computer-use/screenshot";
import { WindowsNotAvailableError } from "@/lib/computer-use/powershell";
import type { ScreenshotRequest, ScreenshotResponse } from "@/lib/computer-use/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * GET /api/computer/screenshot
 *
 * Query params:
 *   - monitor     : int (default 0). 0 = primary, 1 = secondary, etc.
 *   - region      : "x,y,w,h" virtual-screen coordinates.
 *   - windowTitle : substring match against window titles (case-insensitive).
 *   - quality     : JPEG quality 10-95 (default 60).
 *   - maxWidth    : downscale cap in pixels (default 1600).
 *
 * Returns: `{ base64, width, height, bytes, monitor, capturedAt }` (no data: prefix).
 */
export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const monitor = sp.has("monitor") ? parseInt(sp.get("monitor")!, 10) : 0;
    const region = sp.has("region")
      ? parseRegion(sp.get("region")!)
      : undefined;
    const windowTitle = sp.get("windowTitle") || undefined;
    const quality = sp.has("quality") ? parseInt(sp.get("quality")!, 10) : undefined;
    const maxWidth = sp.has("maxWidth") ? parseInt(sp.get("maxWidth")!, 10) : undefined;

    const request: ScreenshotRequest = {
      monitor: Number.isFinite(monitor) ? monitor : 0,
      region,
      windowTitle,
      quality,
      maxWidth,
    };

    const result: ScreenshotResponse = await captureScreenshot(request);
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof WindowsNotAvailableError) {
      return NextResponse.json(
        { error: err.message, code: err.code },
        { status: 503 },
      );
    }
    console.error("[api/computer/screenshot] error:", err);
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : "Screenshot failed.",
        code: "SCREENSHOT_FAILED",
      },
      { status: 500 },
    );
  }
}

function parseRegion(s: string): { x: number; y: number; w: number; h: number } | undefined {
  const parts = s.split(",").map((p) => parseInt(p.trim(), 10));
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) return undefined;
  const [x, y, w, h] = parts;
  return { x, y, w, h };
}
