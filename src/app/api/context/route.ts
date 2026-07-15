import { NextResponse, type NextRequest } from "next/server";

import {
  buildServerContext,
  DEFAULT_CONSENT,
  type UserConsent,
} from "@/lib/context-engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface ContextPostBody {
  consent?: Partial<UserConsent>;
  selection?: string | null;
  devforgeView?: string | null;
}

/**
 * GET /api/context
 *
 * Returns the current server-side context snapshot (active window only —
 * the client must POST any selection / devforgeView it wants attached).
 *
 * Query params:
 *   ?shareActiveWindow=1   → forces the active window to be included even
 *                            if the client didn't send consent (useful for
 *                            the "preview context" button in Settings).
 */
export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const forceShare =
      url.searchParams.get("shareActiveWindow") === "1" ||
      url.searchParams.get("preview") === "1";

    const consent: UserConsent = {
      ...DEFAULT_CONSENT,
      shareActiveWindow: forceShare || DEFAULT_CONSENT.shareActiveWindow,
    };

    const ctx = await buildServerContext({ consent });
    return NextResponse.json({ context: ctx, consent });
  } catch (err) {
    console.error("[api/context] GET failed:", err);
    const message =
      err instanceof Error ? err.message : "Unexpected server error.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * POST /api/context
 *
 * Body: {
 *   consent: Partial<UserConsent>,
 *   selection?: string | null,
 *   devforgeView?: string | null,
 * }
 *
 * Returns the assembled UserContext. The client typically calls this just
 * before sending a chat message, then forwards the result as part of the
 * /api/chat request body.
 */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => null)) as ContextPostBody | null;
    if (!body) {
      return NextResponse.json(
        { error: "Invalid JSON body." },
        { status: 400 },
      );
    }

    const consent: UserConsent = {
      shareActiveWindow: Boolean(body.consent?.shareActiveWindow),
      shareSelection: Boolean(body.consent?.shareSelection),
      shareBrowserUrl: Boolean(body.consent?.shareBrowserUrl),
      shareDevforgeView:
        body.consent?.shareDevforgeView === undefined
          ? DEFAULT_CONSENT.shareDevforgeView
          : Boolean(body.consent?.shareDevforgeView),
    };

    const ctx = await buildServerContext({
      consent,
      selection: body.selection ?? null,
      devforgeView: body.devforgeView ?? null,
    });

    return NextResponse.json({ context: ctx, consent });
  } catch (err) {
    console.error("[api/context] POST failed:", err);
    const message =
      err instanceof Error ? err.message : "Unexpected server error.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
