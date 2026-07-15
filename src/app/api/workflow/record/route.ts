/**
 * POST /api/workflow/record
 *
 * Body: { action: "start" | "stop", name?: string, description?: string, steps?: WorkflowStepDraft[] }
 *
 * - "start" — server-side no-op for now (recording happens client-side via
 *   the WorkflowRecorder). Returns `{ ok: true, recording: true }`.
 * - "stop"  — accepts the recorded steps + name and creates a new Workflow
 *   row. Returns `{ workflow: Workflow }` with 201.
 *
 * This endpoint exists primarily so the client has a clean save entrypoint
 * and so future versions can keep recording state server-side.
 */

import { NextResponse, type NextRequest } from "next/server";

import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

const VALID_TYPES = new Set([
  "click",
  "type",
  "scroll",
  "navigate",
  "paste",
  "custom",
]);

interface RecordBody {
  action?: unknown;
  name?: unknown;
  description?: unknown;
  tags?: unknown;
  steps?: unknown;
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => null)) as RecordBody | null;
    if (!body || typeof body.action !== "string") {
      return NextResponse.json(
        { error: "'action' (start|stop) is required." },
        { status: 400 },
      );
    }

    if (body.action === "start") {
      return NextResponse.json({ ok: true, recording: true, startedAt: new Date().toISOString() });
    }

    if (body.action === "stop") {
      if (typeof body.name !== "string" || !body.name.trim()) {
        return NextResponse.json(
          { error: "A non-empty 'name' is required to save a recording." },
          { status: 400 },
        );
      }
      if (!Array.isArray(body.steps)) {
        return NextResponse.json(
          { error: "'steps' must be an array." },
          { status: 400 },
        );
      }

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
        {
          ok: true,
          recording: false,
          workflow: {
            id: created.id,
            name: created.name,
            description: created.description,
            tags: created.tags,
            runCount: created.runCount,
            lastRunAt: created.lastRunAt?.toISOString() ?? null,
            schedule: created.schedule,
            createdAt: created.createdAt.toISOString(),
            updatedAt: created.updatedAt.toISOString(),
            steps: (created.steps as Array<{
              id: string;
              workflowId: string;
              index: number;
              type: string;
              selector: string | null;
              text: string | null;
              value: string | null;
              description: string | null;
              durationMs: number;
            }>)
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
          },
        },
        { status: 201 },
      );
    }

    return NextResponse.json(
      { error: `'action' must be "start" or "stop" (got "${body.action}").` },
      { status: 400 },
    );
  } catch (err) {
    console.error("[workflow/record] POST failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Server error." },
      { status: 500 },
    );
  }
}
