/**
 * POST /api/workflow/[id]/play
 *
 * Marks a workflow as played — bumps `runCount` and sets `lastRunAt`.
 *
 * Body: { aiAssisted?: boolean }
 *
 * This is a metadata-only endpoint. The actual playback happens client-side
 * (in `lib/workflow-engine.ts`) because it requires DOM access. The UI calls
 * this endpoint AFTER a successful playback so the workflow's run stats
 * stay in sync.
 */

import { NextResponse, type NextRequest } from "next/server";

import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "id required" }, { status: 400 });
    }

    const body = (await req.json().catch(() => ({}))) as {
      aiAssisted?: unknown;
    };

    const existing = await db.workflow.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const updated = await db.workflow.update({
      where: { id },
      data: {
        runCount: { increment: 1 },
        lastRunAt: new Date(),
      },
    });

    return NextResponse.json({
      ok: true,
      runCount: updated.runCount,
      lastRunAt: updated.lastRunAt?.toISOString() ?? null,
      aiAssisted: body.aiAssisted === true,
    });
  } catch (err) {
    console.error("[workflow/[id]/play] POST failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Server error." },
      { status: 500 },
    );
  }
}
