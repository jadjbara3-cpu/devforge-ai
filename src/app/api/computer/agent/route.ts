import { NextRequest, NextResponse } from "next/server";

import {
  createTaskRecord,
  runAgentLoop,
  encodeSse,
  SSE_DONE,
  stopTask,
} from "@/lib/computer-use/agent-loop";
import { clampSteps, clampTimeoutMs } from "@/lib/computer-use/security";
import type { AgentRunRequest, AgentSseEvent } from "@/lib/computer-use/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Vercel-style max-duration. We allow the full 5-min default + 1 min of
// overhead. On a self-hosted Bun server (which is how DevForge ships) this
// is informational only.
export const maxDuration = 300;

/**
 * POST /api/computer/agent
 *
 * Body: AgentRunRequest
 *   {
 *     task: string,                       // natural-language goal
 *     maxSteps?: number,                  // default 50, capped at 50
 *     timeoutMs?: number,                 // default 300_000, capped at 600_000
 *     requireApproval?: boolean,          // every action needs approval
 *     blockDestructive?: boolean,         // refuse destructive actions
 *     sandboxMode?: boolean,              // simulate, don't execute
 *     monitor?: number,                   // 0 = primary
 *     vlmSlot?: "complex"|"agents"        // default "complex"
 *   }
 *
 * Response: Server-Sent Events stream
 *   data: {"type":"start","taskId":"...","task":"...","maxSteps":50}
 *   data: {"type":"screenshot","base64":"...","step":1,"reason":"initial"}
 *   data: {"type":"thought","step":1,"text":"..."}
 *   data: {"type":"action","step":1,"action":{...}}
 *   data: {"type":"approval_required","step":1,"reason":"destructive","action":{...}}
 *   data: {"type":"action_result","step":1,"ok":true,"durationMs":42}
 *   ...
 *   data: {"type":"done","taskId":"...","result":"...","steps":12}
 *   data: [DONE]
 *
 * The stream is cancelable: client disconnect → AbortController fires →
 * loop exits at the next step boundary.
 */
export async function POST(req: NextRequest) {
  let body: AgentRunRequest;
  try {
    body = (await req.json()) as AgentRunRequest;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (!body || typeof body.task !== "string" || !body.task.trim()) {
    return NextResponse.json(
      { error: "A non-empty 'task' string is required." },
      { status: 400 },
    );
  }
  if (body.task.length > 2000) {
    return NextResponse.json(
      { error: "Task description exceeds 2000 char limit." },
      { status: 400 },
    );
  }

  const task = body.task.trim();
  const maxSteps = clampSteps(body.maxSteps);
  const timeoutMs = clampTimeoutMs(body.timeoutMs);

  // 1. Create the DB row up front so the UI has a taskId immediately.
  const taskId = await createTaskRecord(task, maxSteps);

  // 2. Build the SSE stream.
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;

      const safeEnqueue = (chunk: Uint8Array): boolean => {
        if (closed) return false;
        try {
          controller.enqueue(chunk);
          return true;
        } catch {
          closed = true;
          return false;
        }
      };

      const safeClose = () => {
        if (closed) return;
        closed = true;
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      };

      const emit = (event: AgentSseEvent) => {
        safeEnqueue(encodeSse(event));
      };

      try {
        await runAgentLoop({
          taskId,
          task,
          maxSteps,
          timeoutMs,
          requireApproval: body.requireApproval,
          blockDestructive: body.blockDestructive,
          sandboxMode: body.sandboxMode,
          monitor: body.monitor ?? 0,
          vlmSlot: body.vlmSlot ?? "complex",
          clientSignal: req.signal,
          emit,
        });
      } catch (err) {
        console.error("[api/computer/agent] loop crashed:", err);
        safeEnqueue(
          encodeSse({
            type: "error",
            taskId,
            error: err instanceof Error ? err.message : "Agent loop crashed.",
            code: "AGENT_LOOP_CRASH",
          }),
        );
      } finally {
        safeEnqueue(SSE_DONE);
        safeClose();
      }
    },

    // Client disconnect — abort the loop. The req.signal already bridges to
    // runAgentLoop's internal AbortController via the runtime registry.
    cancel() {
      stopTask(taskId, "client_disconnected");
    },
  });

  // Suppress unused-import warning for encoder (kept for symmetry with /api/chat).
  void encoder;

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no", // defeat nginx/Cloudflare buffering
    },
  });
}
