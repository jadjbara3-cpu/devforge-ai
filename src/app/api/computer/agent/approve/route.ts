import { NextRequest, NextResponse } from "next/server";

import { stopTask, resolveApproval } from "@/lib/computer-use/agent-loop";
import type { AgentControlRequest, AgentControlResponse } from "@/lib/computer-use/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 10;

/**
 * POST /api/computer/agent/approve
 *
 * Body: AgentControlRequest
 *   { taskId: string, op: "stop"|"approve"|"deny" }
 *
 * - "stop"    → aborts the running agent loop. The loop emits a `stopped`
 *               event and persists `status:"stopped"`.
 * - "approve" → resolves a pending `approval_required` event. The loop
 *               resumes by executing the action.
 * - "deny"    → resolves the pending approval as denied. The loop records
 *               the denial in history and continues to the next iteration.
 *
 * Returns: { ok, taskId, op, error? }
 */
export async function POST(req: NextRequest) {
  let body: AgentControlRequest;
  try {
    body = (await req.json()) as AgentControlRequest;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (!body || typeof body.taskId !== "string" || !body.taskId.trim()) {
    return NextResponse.json({ error: "taskId is required." }, { status: 400 });
  }

  const op = body.op;
  if (op !== "stop" && op !== "approve" && op !== "deny") {
    return NextResponse.json(
      { error: `op must be "stop", "approve", or "deny".` },
      { status: 400 },
    );
  }

  let ok = false;
  let error: string | undefined;

  if (op === "stop") {
    ok = stopTask(body.taskId, "user_requested");
    if (!ok) error = "Task is not running (or already finished).";
  } else if (op === "approve") {
    ok = resolveApproval(body.taskId, "approved");
    if (!ok) error = "No pending approval for this task.";
  } else {
    ok = resolveApproval(body.taskId, "denied");
    if (!ok) error = "No pending approval for this task.";
  }

  const response: AgentControlResponse = {
    ok,
    taskId: body.taskId,
    op,
    error,
  };
  return NextResponse.json(response, { status: ok ? 200 : 404 });
}
