// ============================================================================
//  GET /api/update/check
// ----------------------------------------------------------------------------
//  Checks GitHub for a newer release of DevForge AI.
//
//  Caching strategy (two layers):
//    1. In-process memoization (module-level `cache` variable) - prevents
//       duplicate fetches within the same server process.
//    2. HTTP Cache-Control header (max-age=3600) - lets the browser cache
//       the result for 1 hour so background polls from the UI don't even
//       hit this route.
//
//  The check itself is fully network-fault tolerant (see lib/updater.ts) -
//  it never throws, so this route always returns 200 with a descriptive
//  payload even when GitHub is unreachable.
// ============================================================================

import { NextResponse } from "next/server";
import { checkForUpdates, type UpdateInfo } from "@/lib/updater";

export const dynamic = "force-dynamic";
// Allow the route to run for up to 30s (GitHub can be slow on cold edges).
export const maxDuration = 30;

interface CachedEntry {
  info: UpdateInfo;
  fetchedAt: number;
}

const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
let cache: CachedEntry | null = null;

export async function GET() {
  const now = Date.now();

  // Serve from in-process cache if fresh.
  if (cache && now - cache.fetchedAt < CACHE_TTL_MS) {
    return NextResponse.json(cache.info, {
      headers: {
        "Cache-Control":
          "public, max-age=3600, stale-while-revalidate=86400",
        "X-DevForge-Cache": "HIT",
      },
    });
  }

  const info = await checkForUpdates();
  cache = { info, fetchedAt: now };

  return NextResponse.json(info, {
    headers: {
      "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
      "X-DevForge-Cache": "MISS",
    },
  });
}
