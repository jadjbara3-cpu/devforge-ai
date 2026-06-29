import { NextRequest, NextResponse } from "next/server";
import { getZai } from "@/lib/zai";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST /api/web/read
 *
 * Body: { url: string }
 *
 * Returns: { title, text, html, publishedTime, url }
 *   - 400 on invalid input / malformed URL.
 *   - 502 when the reader returns no usable content.
 *   - 500 with `{ error }` on unexpected failure.
 *
 * The ZAI page_reader result shape may be either:
 *   - `{ data: { title, text, html, url, publishedTime, usage } }`
 *   - or a plain object `{ title, text, html, url, publishedTime, usage }`
 * We extract defensively from both.
 */
export async function POST(req: NextRequest) {
  try {
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

    const zai = await getZai();

    const response = await zai.functions.invoke("page_reader", {
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
