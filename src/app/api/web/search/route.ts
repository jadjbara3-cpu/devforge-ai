import { NextRequest, NextResponse } from "next/server";

import { getZaiClient } from "@/lib/ai-providers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST /api/web/search
 *
 * Body: { query: string, num?: number }
 *   - query: required, non-empty string.
 *   - num:   optional, default 10, clamped to [1, 20].
 *
 * Web search is a Z.ai-only specialty service. Gated behind the
 * SpecialtyServiceConfig "web" slot. Returns 501 if not configured.
 *
 * Returns: { results: Array<{ url, name, snippet, host_name, rank, date, favicon }> }
 */
export async function POST(req: NextRequest) {
  try {
    // 1. Verify the Z.ai "web" specialty is enabled before doing anything.
    const { client, enabled, source } = await getZaiClient("web");
    if (!enabled || !client) {
      return NextResponse.json(
        {
          error:
            "Web search requires the Z.ai specialty 'web' service. Open Settings → Specialty services to add a Z.ai API key and enable it.",
          code: "WEB_NOT_CONFIGURED",
          source,
        },
        { status: 501 },
      );
    }

    const body = await req.json().catch(() => null);

    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { error: "Request body must be a JSON object." },
        { status: 400 },
      );
    }

    const query = typeof body.query === "string" ? body.query.trim() : "";
    if (!query) {
      return NextResponse.json(
        { error: "A non-empty 'query' string is required." },
        { status: 400 },
      );
    }

    let num = 10;
    if (body.num !== undefined && body.num !== null) {
      const parsed = Number(body.num);
      if (!Number.isFinite(parsed)) {
        return NextResponse.json(
          { error: "'num' must be a number." },
          { status: 400 },
        );
      }
      num = Math.max(1, Math.min(20, Math.floor(parsed)));
    }

    const results = await client.functions.invoke("web_search", {
      query,
      num,
    });

    // The SDK returns an array of result objects. Guard defensively in case
    // the shape changes (e.g. wrapped in { results } or { data }).
    let list: unknown[] = [];
    if (Array.isArray(results)) {
      list = results;
    } else if (results && typeof results === "object") {
      const r = results as Record<string, unknown>;
      if (Array.isArray(r.results)) list = r.results;
      else if (Array.isArray(r.data)) list = r.data;
    }

    const cleaned = list
      .filter((item): item is Record<string, unknown> =>
        !!item && typeof item === "object",
      )
      .map((item) => ({
        url: typeof item.url === "string" ? item.url : "",
        name: typeof item.name === "string" ? item.name : "",
        snippet: typeof item.snippet === "string" ? item.snippet : "",
        host_name:
          typeof item.host_name === "string" ? item.host_name : "",
        rank: typeof item.rank === "number" ? item.rank : 0,
        date: typeof item.date === "string" ? item.date : "",
        favicon: typeof item.favicon === "string" ? item.favicon : "",
      }));

    return NextResponse.json({ results: cleaned });
  } catch (err) {
    console.error("[api/web/search] error:", err);
    const message =
      err instanceof Error
        ? err.message
        : "Web search failed. Please try again.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
