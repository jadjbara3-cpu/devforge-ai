/**
 * The Computer Use agent loop.
 *
 * Given a task + options, runs the VLM-driven perception→action cycle and
 * streams progress via SSE. Returns the final result for DB persistence.
 *
 * LOOP:
 *   1. Capture screenshot.
 *   2. Build user message (task + history + screenshot).
 *   3. Call VLM (getChatClient(vlmSlot)) → parse JSON action.
 *   4. If `action.type === "done"`, exit with success.
 *   5. Risk-classify the action; if destructive OR `requireApproval` is on,
 *      emit `approval_required` and wait on a per-task approval promise.
 *   6. Execute the action via `executeAction()`.
 *   7. Append the step to history. Emit `action_result`.
 *   8. If step count ≥ maxSteps, stop with "max_steps_reached".
 *   9. Loop.
 *
 * SAFETY:
 *   - `AbortController` per task; the Stop endpoint calls `.abort()` and we
 *     check `signal.aborted` between every step.
 *   - Wall-clock timeout (default 5 min, max 10 min) checked between steps.
 *   - Hard cap of 50 steps per task (also enforced in the schema default).
 *   - Destructive actions always require approval, even in auto mode.
 *   - Sandbox mode: actions are simulated (no PowerShell), only screenshots
 *     and the agent loop run for real — useful for demos + tests.
 */

import type { OpenAI } from "openai";

import { getChatClient, ProviderNotConfiguredError } from "@/lib/ai-providers";
import { db } from "@/lib/db";

import { captureScreenshot } from "./screenshot";
import { executeAction } from "./executor";
import {
  SYSTEM_PROMPT,
  buildUserMessage,
  parseVlmResponse,
  stringifyAction,
} from "./prompts";
import {
  classifyAction,
  clampSteps,
  clampTimeoutMs,
  MAX_STEPS_PER_TASK,
} from "./security";
import type {
  AgentAction,
  AgentRunRequest,
  AgentSseEvent,
  AgentStep,
  VlmAction,
} from "./types";

// ---------------------------------------------------------------------------
// Per-task runtime registry (for Stop / Approve out-of-band control)
// ---------------------------------------------------------------------------

interface TaskRuntime {
  taskId: string;
  abortController: AbortController;
  /** Resolves when the user approves/denies via /api/computer/agent/approve. */
  approvalPromise: Promise<"approved" | "denied"> | null;
  approvalResolve: ((v: "approved" | "denied") => void) | null;
  startedAt: number;
  timeoutMs: number;
}

const taskRuntimes = new Map<string, TaskRuntime>();

/**
 * Look up a running task by ID. Used by the Stop + Approve endpoint to
 * reach into the loop without an HTTP round-trip.
 */
export function getTaskRuntime(taskId: string): TaskRuntime | null {
  return taskRuntimes.get(taskId) ?? null;
}

function deleteTaskRuntime(taskId: string): void {
  taskRuntimes.delete(taskId);
}

/**
 * Stop a running task. Resolves the in-flight approval promise (if any) with
 * "denied" and aborts the loop. Returns true if the task was running.
 */
export function stopTask(taskId: string, reason = "user_requested"): boolean {
  const rt = taskRuntimes.get(taskId);
  if (!rt) return false;
  if (rt.approvalResolve) {
    rt.approvalResolve("denied");
    rt.approvalResolve = null;
    rt.approvalPromise = null;
  }
  rt.abortController.abort(new Error(`stopped: ${reason}`));
  return true;
}

/**
 * Resolve a pending approval. Returns false if no approval is pending.
 */
export function resolveApproval(
  taskId: string,
  decision: "approved" | "denied",
): boolean {
  const rt = taskRuntimes.get(taskId);
  if (!rt || !rt.approvalResolve) return false;
  rt.approvalResolve(decision);
  rt.approvalResolve = null;
  rt.approvalPromise = null;
  return true;
}

// ---------------------------------------------------------------------------
// SSE helpers
// ---------------------------------------------------------------------------

const encoder = new TextEncoder();
export function encodeSse(event: AgentSseEvent): Uint8Array {
  return encoder.encode(`data: ${JSON.stringify(event)}\n\n`);
}
export const SSE_DONE = encoder.encode("data: [DONE]\n\n");

// ---------------------------------------------------------------------------
// Main loop entrypoint
// ---------------------------------------------------------------------------

export interface RunAgentOptions extends AgentRunRequest {
  taskId: string;
  /** The NextRequest signal — aborts the whole run if the client disconnects. */
  clientSignal: AbortSignal;
  /** Callback invoked for every SSE event (the route uses this to enqueue
   *  bytes into the ReadableStream body). */
  emit: (event: AgentSseEvent) => void;
}

export interface RunAgentResult {
  ok: boolean;
  result?: string;
  error?: string;
  steps: number;
  status: "completed" | "failed" | "stopped";
}

export async function runAgentLoop(opts: RunAgentOptions): Promise<RunAgentResult> {
  const {
    taskId,
    task,
    clientSignal,
    emit,
    requireApproval,
    blockDestructive,
    sandboxMode,
    monitor,
    vlmSlot = "complex",
  } = opts;

  const maxSteps = clampSteps(opts.maxSteps ?? MAX_STEPS_PER_TASK);
  const timeoutMs = clampTimeoutMs(opts.timeoutMs);

  // 1. Set up the per-task runtime (so Stop/Approve can reach in).
  const abortController = new AbortController();
  const runtime: TaskRuntime = {
    taskId,
    abortController,
    approvalPromise: null,
    approvalResolve: null,
    startedAt: Date.now(),
    timeoutMs,
  };
  taskRuntimes.set(taskId, runtime);

  // Bridge the client-signal + our internal abort into one listener.
  const onClientAbort = () => abortController.abort(new Error("client_disconnected"));
  if (clientSignal.aborted) {
    onClientAbort();
  } else {
    clientSignal.addEventListener("abort", onClientAbort, { once: true });
  }

  const signal = abortController.signal;

  // 2. Resolve the VLM client.
  let vlm: { client: OpenAI; model: string };
  try {
    const resolved = await getChatClient(vlmSlot);
    vlm = { client: resolved.client, model: resolved.config.model };
  } catch (err) {
    const error =
      err instanceof ProviderNotConfiguredError
        ? `Vision model not configured: ${err.message}`
        : err instanceof Error
          ? err.message
          : String(err);
    emit({ type: "error", taskId, error, code: "VLM_NOT_CONFIGURED" });
    cleanup();
    return { ok: false, error, steps: 0, status: "failed" };
  }

  // 3. Update DB: task is running.
  try {
    await db.computerTask.update({
      where: { id: taskId },
      data: { status: "running", startedAt: new Date(), maxSteps },
    });
  } catch (dbErr) {
    console.error("[computer-use] failed to mark task as running:", dbErr);
    // Non-fatal — continue.
  }

  emit({ type: "start", taskId, task, maxSteps });

  const history: AgentStep[] = [];
  let lastError: string | undefined;
  let finalResult = "";
  let stopped = false;
  let failed = false;
  let failureReason = "";

  // 4. Main loop.
  for (let step = 1; step <= maxSteps; step++) {
    if (signal.aborted) {
      stopped = true;
      failureReason = "aborted_before_step";
      break;
    }
    if (Date.now() - runtime.startedAt > timeoutMs) {
      failed = true;
      failureReason = `timeout (${timeoutMs}ms)`;
      break;
    }

    // 4a. Capture screenshot.
    let screenshotBase64: string;
    try {
      const shot = await captureScreenshot({
        monitor,
        maxWidth: 1600,
        quality: 60,
      });
      screenshotBase64 = shot.base64;
      emit({
        type: "screenshot",
        base64: shot.base64,
        step,
        reason: step === 1 ? "initial" : "planning",
      });
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      emit({
        type: "error",
        taskId,
        error: `Screenshot failed: ${error}`,
        code: "SCREENSHOT_FAILED",
      });
      failed = true;
      failureReason = `screenshot_failed: ${error}`;
      break;
    }

    // 4b. Build user message + call VLM.
    const userMsg = buildUserMessage({
      task,
      history,
      recentError: lastError,
      screenshotDataUrl: `data:image/jpeg;base64,${screenshotBase64}`,
      stepNumber: step,
      maxSteps,
    });

    let vlmRaw: string;
    try {
      const completion = await vlm.client.chat.completions.create({
        model: vlm.model,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          userMsg,
        ],
        temperature: 0,
        max_tokens: 600,
      });
      vlmRaw = completion.choices?.[0]?.message?.content ?? "";
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      emit({
        type: "error",
        taskId,
        error: `VLM call failed: ${error}`,
        code: "VLM_CALL_FAILED",
      });
      failed = true;
      failureReason = `vlm_call_failed: ${error}`;
      break;
    }

    if (signal.aborted) {
      stopped = true;
      failureReason = "aborted_after_vlm";
      break;
    }

    // 4c. Parse the VLM's JSON action.
    let vlmAction: VlmAction;
    try {
      vlmAction = parseVlmResponse(vlmRaw);
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      emit({
        type: "warning",
        step,
        text: `VLM produced unparseable output — retrying. Error: ${error}`,
      });
      // Record the failure in history so the VLM sees it on the next turn.
      history.push({
        index: step,
        thought: "(parse failed)",
        action: { type: "screenshot" },
        result: { ok: false, error, durationMs: 0 },
        approval: "auto",
        at: new Date().toISOString(),
      });
      lastError = error;
      continue;
    }

    emit({ type: "thought", step, text: vlmAction.thought });
    emit({ type: "action", step, action: vlmAction.action });

    // 4d. Done? Then exit.
    if (vlmAction.action.type === "done" || vlmAction.done) {
      finalResult =
        vlmAction.action.type === "done"
          ? vlmAction.action.result
          : vlmAction.thought;
      const stepRecord: AgentStep = {
        index: step,
        thought: vlmAction.thought,
        action: vlmAction.action,
        result: { ok: true, durationMs: 0, data: { result: finalResult } },
        approval: "auto",
        screenshot: screenshotBase64,
        at: new Date().toISOString(),
      };
      history.push(stepRecord);
      emit({ type: "step", step, total: step });
      break;
    }

    // 4e. Risk-classify → maybe require approval.
    const risk = classifyAction(vlmAction.action);
    let approval: "auto" | "approved" | "denied" | "skipped" = "auto";
    const needsApproval =
      requireApproval || risk === "destructive" || risk === "moderate";

    if (blockDestructive && risk === "destructive") {
      // Refuse outright — record + continue so the VLM can pick another action.
      const error = `Destructive action blocked: ${stringifyAction(vlmAction.action)}`;
      emit({ type: "warning", step, text: error });
      history.push({
        index: step,
        thought: vlmAction.thought,
        action: vlmAction.action,
        result: { ok: false, error, durationMs: 0 },
        approval: "skipped",
        at: new Date().toISOString(),
      });
      lastError = error;
      emit({ type: "step", step, total: step });
      continue;
    }

    if (needsApproval) {
      emit({
        type: "approval_required",
        step,
        reason: risk,
        action: vlmAction.action,
      });
      const decision = await waitForApproval(taskId);
      if (signal.aborted) {
        stopped = true;
        failureReason = "aborted_during_approval";
        break;
      }
      if (decision === "denied") {
        const error = `User denied action: ${stringifyAction(vlmAction.action)}`;
        emit({ type: "warning", step, text: error });
        history.push({
          index: step,
          thought: vlmAction.thought,
          action: vlmAction.action,
          result: { ok: false, error, durationMs: 0 },
          approval: "denied",
          at: new Date().toISOString(),
        });
        lastError = error;
        approval = "denied";
        emit({ type: "step", step, total: step });
        continue;
      }
      approval = "approved";
    }

    // 4f. Execute the action.
    const result = await executeAction(vlmAction.action, {
      sandbox: sandboxMode,
      monitor,
    });
    emit({
      type: "action_result",
      step,
      ok: result.ok,
      durationMs: result.durationMs,
      error: result.error,
      data: result.data,
    });

    const stepRecord: AgentStep = {
      index: step,
      thought: vlmAction.thought,
      action: vlmAction.action,
      result: {
        ok: result.ok,
        error: result.error,
        data: result.data,
        durationMs: result.durationMs,
      },
      approval,
      screenshot: screenshotBase64,
      at: new Date().toISOString(),
    };
    history.push(stepRecord);
    lastError = result.ok ? undefined : result.error;
    emit({ type: "step", step, total: step });

    // 4g. Persist the step to the DB (so a refresh doesn't lose history).
    try {
      await db.computerAction.create({
        data: {
          taskId,
          index: step,
          type: vlmAction.action.type,
          params: JSON.stringify(vlmAction.action),
          thought: vlmAction.thought,
          result: JSON.stringify(result),
          ok: result.ok,
          approval,
          screenshot: screenshotBase64,
          durationMs: result.durationMs,
        },
      });
    } catch (dbErr) {
      console.error("[computer-use] failed to persist step:", dbErr);
    }
  }

  // 5. Loop ended — decide outcome.
  if (signal.aborted && !finalResult) {
    stopped = true;
    if (!failureReason) failureReason = "user_requested";
  }
  if (!finalResult && step_count(history) >= maxSteps) {
    failed = true;
    failureReason = `max_steps_reached (${maxSteps})`;
  }

  const steps = history.length;
  let status: RunAgentResult["status"];
  let resultText = finalResult;
  let errorText: string | undefined;

  if (finalResult) {
    status = "completed";
  } else if (stopped) {
    status = "stopped";
    resultText = `Task stopped: ${failureReason}`;
  } else {
    status = "failed";
    errorText = failureReason;
  }

  // 6. Emit terminal event.
  if (status === "completed") {
    emit({ type: "done", taskId, result: finalResult, steps });
  } else if (status === "stopped") {
    emit({
      type: "stopped",
      taskId,
      reason: failureReason,
      partialResult: resultText,
    });
  } else {
    emit({
      type: "error",
      taskId,
      error: failureReason,
      code: "TASK_FAILED",
    });
  }

  // 7. Persist final state to DB.
  try {
    await db.computerTask.update({
      where: { id: taskId },
      data: {
        status:
          status === "completed"
            ? "completed"
            : status === "stopped"
              ? "stopped"
              : "failed",
        steps: JSON.stringify(history),
        result: resultText,
        error: errorText,
        finishedAt: new Date(),
      },
    });
  } catch (dbErr) {
    console.error("[computer-use] failed to persist final task state:", dbErr);
  }

  cleanup();
  return {
    ok: status === "completed",
    result: resultText,
    error: errorText,
    steps,
    status,
  };

  // ---- helpers ----
  function cleanup(): void {
    taskRuntimes.delete(taskId);
    clientSignal.removeEventListener("abort", onClientAbort);
  }
}

function step_count(history: AgentStep[]): number {
  return history.length;
}

/**
 * Wait for the user to approve/deny a destructive action.
 *
 * Sets up a Promise on the runtime that's resolved by `resolveApproval()`
 * (called from POST /api/computer/agent/approve). Times out after 5 min and
 * returns "denied" — the user can always restart the task.
 */
function waitForApproval(taskId: string): Promise<"approved" | "denied"> {
  const rt = taskRuntimes.get(taskId);
  if (!rt) return Promise.resolve("denied");
  const promise = new Promise<"approved" | "denied">((resolve) => {
    rt.approvalResolve = resolve;
    rt.approvalPromise = promise;
    // 5-min timeout — auto-deny.
    setTimeout(() => {
      if (rt.approvalResolve === resolve) {
        rt.approvalResolve("denied");
        rt.approvalResolve = null;
        rt.approvalPromise = null;
      }
    }, 5 * 60 * 1000);
  });
  rt.approvalPromise = promise;
  return promise;
}

// ---------------------------------------------------------------------------
// Helper: create a ComputerTask row before the loop starts
// ---------------------------------------------------------------------------

export async function createTaskRecord(task: string, maxSteps: number): Promise<string> {
  const row = await db.computerTask.create({
    data: { task, status: "pending", maxSteps },
  });
  return row.id;
}

/**
 * List recent tasks (for the UI's task history sidebar).
 */
export async function listRecentTasks(limit = 20): Promise<
  Array<{
    id: string;
    task: string;
    status: string;
    steps: string;
    result: string | null;
    error: string | null;
    createdAt: Date;
    finishedAt: Date | null;
  }>
> {
  try {
    return await db.computerTask.findMany({
      orderBy: { createdAt: "desc" },
      take: limit,
      select: {
        id: true,
        task: true,
        status: true,
        steps: true,
        result: true,
        error: true,
        createdAt: true,
        finishedAt: true,
      },
    });
  } catch (err) {
    console.error("[computer-use] failed to list tasks:", err);
    return [];
  }
}
