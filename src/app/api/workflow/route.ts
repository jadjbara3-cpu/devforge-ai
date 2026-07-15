/**
 * GET  /api/workflow     — list all workflows (newest first)
 * POST /api/workflow     — create a new workflow from a step list
 *
 * POST body: { name: string, description?: string, tags?: string, steps: WorkflowStepDraft[] }
 *   where WorkflowStepDraft = { type, selector?, text?, value?, description, durationMs }
 */

import { NextResponse, type NextRequest } from "next/server";

import { db } from "@/lib/db";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const VALID_TYPES = new Set([
  "click",
  "type",
  "scroll",
  "navigate",
  "paste",
  "custom",
]);

interface CreateBody {
  name?: unknown;
  description?: unknown;
  tags?: unknown;
  steps?: unknown;
}

function serializeWorkflow(row: {
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

export async function GET() {
  try {
    const rows = await db.workflow.findMany({
      include: { steps: true },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    });
    return NextResponse.json({
      workflows: rows.map(serializeWorkflow),
    });
  } catch (err) {
    console.error("[workflow] GET failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Server error." },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => null)) as CreateBody | null;
    if (!body) {
      return NextResponse.json(
        { error: "Invalid JSON body." },
        { status: 400 },
      );
    }
    if (typeof body.name !== "string" || !body.name.trim()) {
      return NextResponse.json(
        { error: "A non-empty 'name' string is required." },
        { status: 400 },
      );
    }
    if (!Array.isArray(body.steps)) {
      return NextResponse.json(
        { error: "'steps' must be an array." },
        { status: 400 },
      );
    }

    // Validate + normalize each step.
    const steps = (body.steps as unknown[]).map((raw, idx) => {
      const s = raw as Record<string, unknown>;
      const type =
        typeof s.type === "string" && VALID_TYPES.has(s.type) ? s.type : "custom";
      return {
        index: idx,
        type,
        selector: typeof s.selector === "string" ? s.selector : null,
        text: typeof s.text === "string" ? s.text : null,
        value: typeof s.value === "string" ? s.value : null,
        description:
          typeof s.description === "string" ? s.description : `${type} #${idx + 1}`,
        durationMs:
          typeof s.durationMs === "number" && Number.isFinite(s.durationMs)
            ? Math.max(0, Math.floor(s.durationMs))
            : 200,
      };
    });

    const created = await db.workflow.create({
      data: {
        name: body.name.trim(),
        description:
          typeof body.description === "string" ? body.description.trim() : null,
        tags: typeof body.tags === "string" ? body.tags.trim() : null,
        steps: { create: steps },
      },
      include: { steps: true },
    });

    return NextResponse.json(
      { workflow: serializeWorkflow(created) },
      { status: 201 },
    );
  } catch (err) {
    console.error("[workflow] POST failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Server error." },
      { status: 500 },
    );
  }
}
