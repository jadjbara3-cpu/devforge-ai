/**
 * GET    /api/workflow/[id]  — fetch a single workflow (with steps)
 * PUT    /api/workflow/[id]  — update name/description/tags
 * DELETE /api/workflow/[id]  — delete a workflow (cascade steps)
 */

import { NextResponse } from "next/server";

import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

function serialize(row: {
  id: string;
  name: string;
  description: string | null;
  tags: string | null;
  runCount: number;
  lastRunAt: Date | null;
  schedule: string | null;
  createdAt: Date;
  updatedAt: Date;
  steps: Array<{
    id: string;
    workflowId: string;
    index: number;
    type: string;
    selector: string | null;
    text: string | null;
    value: string | null;
    description: string | null;
    durationMs: number;
  }>;
}) {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    tags: row.tags,
    runCount: row.runCount,
    lastRunAt: row.lastRunAt ? row.lastRunAt.toISOString() : null,
    schedule: row.schedule,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    steps: row.steps
      .map((s) => ({
        id: s.id,
        workflowId: s.workflowId,
        index: s.index,
        type: s.type,
        selector: s.selector ?? undefined,
        text: s.text ?? undefined,
        value: s.value ?? undefined,
        description: s.description ?? "",
        durationMs: s.durationMs,
      }))
      .sort((a, b) => a.index - b.index),
  };
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "id required" }, { status: 400 });
    }
    const row = await db.workflow.findUnique({
      where: { id },
      include: { steps: true },
    });
    if (!row) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ workflow: serialize(row) });
  } catch (err) {
    console.error("[workflow/[id]] GET failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Server error." },
      { status: 500 },
    );
  }
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "id required" }, { status: 400 });
    }
    const body = (await req.json().catch(() => null)) as {
      name?: unknown;
      description?: unknown;
      tags?: unknown;
      schedule?: unknown;
    } | null;
    if (!body) {
      return NextResponse.json(
        { error: "Invalid JSON body." },
        { status: 400 },
      );
    }

    const data: Record<string, unknown> = {};
    if (typeof body.name === "string" && body.name.trim()) {
      data.name = body.name.trim();
    }
    if (typeof body.description === "string") {
      data.description = body.description.trim() || null;
    }
    if (typeof body.tags === "string") {
      data.tags = body.tags.trim() || null;
    }
    if (typeof body.schedule === "string") {
      data.schedule = body.schedule.trim() || null;
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json(
        { error: "No updatable fields provided." },
        { status: 400 },
      );
    }

    const row = await db.workflow.update({
      where: { id },
      data,
      include: { steps: true },
    });
    return NextResponse.json({ workflow: serialize(row) });
  } catch (err) {
    console.error("[workflow/[id]] PUT failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Server error." },
      { status: 500 },
    );
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "id required" }, { status: 400 });
    }
    await db.workflow.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[workflow/[id]] DELETE failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Server error." },
      { status: 500 },
    );
  }
}
