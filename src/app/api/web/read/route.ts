import { NextRequest, NextResponse } from "next/server";

import { getZaiClient } from "@/lib/ai-providers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST /api/web/read
 *
 * Body: { url: string }
 *
 * Page reading is a Z.ai-only specialty service. Gated behind the
 * SpecialtyServiceConfig "web" slot. Returns 501 if not configured.
 *
 * Returns: { title, text, html, publishedTime, url }
 *   - 400 on invalid input / malformed URL.
 *   - 502 when the reader returns no usable content.
 *   - 500 with `{ error }` on unexpected failure.
 */
export async function POST(req: NextRequest) {
  try {
    // 1. Verify the Z.ai "web" specialty is enabled before doing anything.
    const { client, enabled, source } = await getZaiClient("web");
    if (!enabled || !client) {
      return NextResponse.json(
        {
          error:
            "Page reading requires the Z.ai specialty 'web' service. Open Settings → Specialty services to add a Z.ai API key and enable it.",
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

    const rawUrl = typeof body.url === "string" ? body.url.trim() : "";
    if (!rawUrl) {
      return NextResponse.json(
        { error: "A non-empty 'url' string is required." },
        { status: 400 },
      );
    }

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(rawUrl);
    } catch {
      return NextResponse.json(
        { error: "The provided URL is not valid. Include the scheme (https://)." },
        { status: 400 },
      );
    }

    if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
      return NextResponse.json(
        { error: "Only http(s) URLs are supported." },
        { status: 400 },
      );
    }

    const response = await client.functions.invoke("page_reader", {
      url: parsedUrl.toString(),
    });

    // Defensive extraction: unwrap { data } if present.
    const payload: Record<string, unknown> =
      response && typeof response === "object"
        ? ("data" in response &&
            response.data &&
            typeof response.data === "object"
            ? (response.data as Record<string, unknown>)
            : (response as Record<string, unknown>))
        : {};

    const title =
      typeof payload.title === "string" ? payload.title.trim() : "";
    const text =
      typeof payload.text === "string" ? payload.text : "";
    const html =
      typeof payload.html === "string" ? payload.html : "";
    const publishedTime =
      typeof payload.publishedTime === "string"
        ? payload.publishedTime
        : "";
    const finalUrl =
      typeof payload.url === "string" && payload.url
        ? payload.url
        : parsedUrl.toString();

    if (!title && !text && !html) {
      return NextResponse.json(
        { error: "The reader returned no content for that URL." },
        { status: 502 },
      );
    }

    return NextResponse.json({
      title,
      text,
      html,
      publishedTime,
      url: finalUrl,
    });
  } catch (err) {
    console.error("[api/web/read] error:", err);
    const message =
      err instanceof Error
        ? err.message
        : "Failed to read page. Please try again.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
