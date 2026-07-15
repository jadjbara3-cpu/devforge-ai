/**
 * VLM prompt templates for the Computer Use agent loop.
 *
 * Two prompts:
 *   1. SYSTEM_PROMPT — defines the agent's role + the JSON action schema.
 *   2. buildUserMessage() — composes the per-iteration user message:
 *      task, action history, last error, and the current screenshot.
 *
 * The VLM is asked to emit a SINGLE JSON object matching `VlmAction` — no
 * markdown fences, no prose. We strip fences if present and parse the first
 * `{` … last `}` range so a slightly chatty model still works.
 */

import type { AgentAction, AgentStep } from "./types";

// ---------------------------------------------------------------------------
// System prompt
// ---------------------------------------------------------------------------

export const SYSTEM_PROMPT = `You are DevForge Computer Use — an autonomous agent that controls a Windows desktop to accomplish the user's task.

You receive a screenshot of the current screen and must decide the SINGLE next action to take. Think step by step, then emit ONE JSON object describing your action.

# Output format (STRICT)
Respond with EXACTLY one JSON object — no markdown fences, no prose before or after. The schema:

{
  "thought": "1-2 sentence reasoning about what you see and what you'll do.",
  "action": { ... one of the action types below ... },
  "done": false,
  "status": "in_progress" | "verifying" | "stuck" | "complete"
}

# Action types (the "action" field MUST be one of these)

1. Click (left mouse button):
   { "type": "click", "x": 100, "y": 200, "double": false }
2. Right-click:
   { "type": "right-click", "x": 100, "y": 200 }
3. Scroll:
   { "type": "scroll", "x": 100, "y": 200, "amount": 3 }   // positive = down, negative = up
4. Drag (mouse drag from one point to another):
   { "type": "drag", "fromX": 100, "fromY": 100, "toX": 400, "toY": 400 }
5. Type text (literal characters; the field is UTF-8):
   { "type": "type", "text": "Hello World", "interval": 30 }
6. Key / hotkey (modifier keys are: ctrl, alt, shift, win):
   { "type": "key", "keys": ["enter"] }
   { "type": "key", "keys": ["ctrl", "c"] }
   Single-key names allowed: enter, escape, esc, tab, backspace, delete, insert, space,
   up, down, left, right, home, end, pageup, pagedown, f1..f12, capslock, prtscn.
   Single printable chars (a-z, 0-9, punctuation) are also allowed.
7. Wait:
   { "type": "wait", "ms": 1000 }
8. Shell command (PowerShell or cmd — use sparingly, only for tasks that clicks/keys cannot do):
   { "type": "shell", "command": "notepad.exe", "kind": "powershell" }
   ⚠ DANGEROUS patterns are blocked (rm -rf, format, shutdown, reg delete, etc.).
9. Open application by name (uses Windows Start Menu search internally):
   { "type": "open_app", "name": "notepad" }
   ⚠ Prefer this over shell for launching apps — it survives path differences.
10. Window control:
    { "type": "window", "action": "focus" | "minimize" | "maximize" | "restore" | "close", "titleContains": "Notepad" }
11. Just take a fresh screenshot (e.g. to wait for an animation to finish):
    { "type": "screenshot" }
12. Task complete:
    { "type": "done", "result": "Short natural-language summary of what you accomplished." }

# Coordinate system
The screenshot's top-left pixel is (0, 0). The bottom-right is (image_width - 1, image_height - 1).
Coordinates you emit are in SCREEN pixels of the screenshot you're looking at — NOT virtual-screen
or normalized coordinates. If the screenshot is 1600×900, a click at the centre is (800, 450).

# Strategy
- Start with a screenshot-only action ONLY if you need to verify state before doing anything.
- Otherwise, act. The loop takes a new screenshot after every action automatically.
- After every action, you'll receive the new screenshot + a brief action-result line in the history.
- If an action failed (ok:false), DO NOT retry it the same way — try a different approach.
- After at most ~10 actions, verify by reading the screenshot and either continue or call done.
- Be efficient: prefer keyboard shortcuts (e.g. Win key → type app name → Enter) over clicking
  through menus.
- NEVER emit coordinates outside the visible screenshot. If a button is off-screen, scroll first.
- NEVER assume a window is in a particular position — verify with the screenshot.
- For typing into a specific field, click the field FIRST, then type.
- The result field of "done" should be a clear, plain-English summary that the user can read.

# Safety
- You cannot delete files outside the user's home directory.
- You cannot run destructive shell commands (the system blocks them and returns an error).
- You cannot kill system processes (lsass, svchost, wininit, etc.).
- If a task requires destructive actions you can't perform, emit "done" with result explaining
  the limitation.

Remember: output ONE JSON object only. No prose. No code fences.`;

// ---------------------------------------------------------------------------
// User message builder
// ---------------------------------------------------------------------------

/**
 * Build the user message for one VLM iteration. The message contains:
 *   - The task description (always first, as a text part).
 *   - The action history (last N steps, as a text part).
 *   - The current screenshot (as an image_url part).
 *
 * We cap the history at the last 8 steps to keep the token budget reasonable
 * (a long task with 50 steps × 200 tokens each = 10K tokens just for history).
 */
export function buildUserMessage(params: {
  task: string;
  history: AgentStep[];
  recentError?: string;
  screenshotDataUrl: string;
  stepNumber: number;
  maxSteps: number;
}): {
  role: "user";
  content: Array<
    | { type: "text"; text: string }
    | { type: "image_url"; image_url: { url: string } }
  >;
} {
  const { task, history, recentError, screenshotDataUrl, stepNumber, maxSteps } =
    params;

  const recent = history.slice(-8);
  const historyText = recent.length
    ? recent
        .map((s, i) => {
          const idx = s.index;
          const actionStr = stringifyAction(s.action);
          const status = s.result.ok ? "OK" : `FAILED: ${s.result.error ?? "unknown"}`;
          return `Step ${idx}: thought="${s.thought}" → ${actionStr} → ${status}`;
        })
        .join("\n")
    : "(no prior actions — this is the first step)";

  const errorText = recentError
    ? `\n\n⚠ The previous action ERRORED: ${recentError}\nConsider a different approach.`
    : "";

  const text = `TASK: ${task}

STEP: ${stepNumber} of ${maxSteps} (you will be force-stopped at step ${maxSteps})

ACTION HISTORY (most recent 8):
${historyText}
${errorText}

CURRENT SCREENSHOT: (attached)

What is your next action? Emit one JSON object.`;

  return {
    role: "user",
    content: [
      { type: "text", text },
      { type: "image_url", image_url: { url: screenshotDataUrl } },
    ],
  };
}

/** Compact one-line representation of an AgentAction for the history log. */
export function stringifyAction(action: AgentAction): string {
  switch (action.type) {
    case "screenshot":
      return "screenshot()";
    case "click":
      return `click(${action.x}, ${action.y}${action.double ? ", double" : ""})`;
    case "right-click":
      return `right-click(${action.x}, ${action.y})`;
    case "drag":
      return `drag(${action.fromX}, ${action.fromY} → ${action.toX}, ${action.toY})`;
    case "scroll":
      return `scroll(${action.x}, ${action.y}, ${action.amount})`;
    case "type":
      return `type(${truncate(action.text, 60)})`;
    case "key":
      return `key(${action.keys.join("+")})`;
    case "wait":
      return `wait(${action.ms}ms)`;
    case "shell":
      return `shell(${truncate(action.command, 80)})`;
    case "open_app":
      return `open_app(${action.name}${action.args ? ` ${truncate(action.args, 40)}` : ""})`;
    case "window":
      return `window.${action.action}(${action.titleContains ?? ""})`;
    case "done":
      return `done(${truncate(action.result, 80)})`;
    default: {
      const _exhaustive: never = action;
      void _exhaustive;
      return "unknown";
    }
  }
}

function truncate(s: string, max: number): string {
  const clean = s.replace(/\s+/g, " ").trim();
  return clean.length > max ? `"${clean.slice(0, max)}…"` : `"${clean}"`;
}

// ---------------------------------------------------------------------------
// VLM response parser
// ---------------------------------------------------------------------------

/**
 * Parse the VLM's response into a `VlmAction`. Tolerates:
 *   - Markdown fences (```json … ```)
 *   - Leading/trailing prose (we extract the outermost `{` … `}` substring)
 *   - Trailing commas (stripped before JSON.parse)
 *
 * Throws `VlmParseError` if no JSON object can be extracted or the schema
 * doesn't match.
 */
export function parseVlmResponse(raw: string): VlmActionParsed {
  const cleaned = raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/i, "")
    .trim();

  if (!cleaned) {
    throw new VlmParseError("Empty response from VLM.");
  }

  // Extract outermost { … }.
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new VlmParseError(
      `No JSON object found in VLM response. First 200 chars: ${cleaned.slice(0, 200)}`,
    );
  }
  const jsonStr = cleaned.slice(start, end + 1).replace(/,\s*([}\]])/g, "$1");

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonStr);
  } catch (err) {
    throw new VlmParseError(
      `JSON.parse failed: ${err instanceof Error ? err.message : String(err)}. JSON: ${jsonStr.slice(0, 300)}`,
    );
  }

  return validateVlmAction(parsed);
}

export interface VlmActionParsed {
  thought: string;
  action: AgentAction;
  done: boolean;
  status: "in_progress" | "verifying" | "stuck" | "complete";
}

class VlmParseError extends Error {
  code = "VLM_PARSE_FAILED" as const;
  constructor(message: string) {
    super(message);
    this.name = "VlmParseError";
  }
}
export { VlmParseError };

function validateVlmAction(value: unknown): VlmActionParsed {
  if (typeof value !== "object" || value === null) {
    throw new VlmParseError("VLM response is not an object.");
  }
  const obj = value as Record<string, unknown>;
  const thought = typeof obj.thought === "string" ? obj.thought : "";
  const done = obj.done === true;
  const status =
    obj.status === "in_progress" ||
    obj.status === "verifying" ||
    obj.status === "stuck" ||
    obj.status === "complete"
      ? obj.status
      : "in_progress";
  const action = validateAgentAction(obj.action);
  return { thought, action, done, status };
}

function validateAgentAction(value: unknown): AgentAction {
  if (typeof value !== "object" || value === null) {
    throw new VlmParseError("VLM action is not an object.");
  }
  const obj = value as Record<string, unknown>;
  const type = obj.type;
  switch (type) {
    case "screenshot":
      return { type: "screenshot" };
    case "click": {
      if (!isFiniteNumber(obj.x) || !isFiniteNumber(obj.y)) {
        throw new VlmParseError("click requires numeric x, y");
      }
      return {
        type: "click",
        x: Math.round(obj.x),
        y: Math.round(obj.y),
        double: obj.double === true,
        button: typeof obj.button === "string" ? (obj.button as "left" | "right" | "middle") : "left",
      };
    }
    case "right-click": {
      if (!isFiniteNumber(obj.x) || !isFiniteNumber(obj.y)) {
        throw new VlmParseError("right-click requires numeric x, y");
      }
      return { type: "right-click", x: Math.round(obj.x), y: Math.round(obj.y) };
    }
    case "drag": {
      if (
        !isFiniteNumber(obj.fromX) ||
        !isFiniteNumber(obj.fromY) ||
        !isFiniteNumber(obj.toX) ||
        !isFiniteNumber(obj.toY)
      ) {
        throw new VlmParseError("drag requires numeric fromX, fromY, toX, toY");
      }
      return {
        type: "drag",
        fromX: Math.round(obj.fromX),
        fromY: Math.round(obj.fromY),
        toX: Math.round(obj.toX),
        toY: Math.round(obj.toY),
      };
    }
    case "scroll": {
      if (!isFiniteNumber(obj.x) || !isFiniteNumber(obj.y) || !isFiniteNumber(obj.amount)) {
        throw new VlmParseError("scroll requires numeric x, y, amount");
      }
      return {
        type: "scroll",
        x: Math.round(obj.x),
        y: Math.round(obj.y),
        amount: Math.round(obj.amount),
      };
    }
    case "type": {
      if (typeof obj.text !== "string") {
        throw new VlmParseError("type requires string text");
      }
      return {
        type: "type",
        text: obj.text,
        interval: isFiniteNumber(obj.interval) ? Math.round(obj.interval) : undefined,
      };
    }
    case "key": {
      if (!Array.isArray(obj.keys) || !obj.keys.every((k) => typeof k === "string")) {
        throw new VlmParseError("key requires string[] keys");
      }
      return { type: "key", keys: obj.keys as string[] };
    }
    case "wait": {
      if (!isFiniteNumber(obj.ms)) {
        throw new VlmParseError("wait requires numeric ms");
      }
      return { type: "wait", ms: Math.min(10_000, Math.max(100, Math.round(obj.ms))) };
    }
    case "shell": {
      if (typeof obj.command !== "string") {
        throw new VlmParseError("shell requires string command");
      }
      return {
        type: "shell",
        command: obj.command,
        kind: obj.kind === "cmd" ? "cmd" : "powershell",
      };
    }
    case "open_app": {
      if (typeof obj.name !== "string") {
        throw new VlmParseError("open_app requires string name");
      }
      return {
        type: "open_app",
        name: obj.name,
        args: typeof obj.args === "string" ? obj.args : undefined,
      };
    }
    case "window": {
      if (
        typeof obj.action !== "string" ||
        !["focus", "minimize", "maximize", "restore", "close", "move", "resize"].includes(obj.action)
      ) {
        throw new VlmParseError("window requires valid action");
      }
      return {
        type: "window",
        action: obj.action as "focus" | "minimize" | "maximize" | "restore" | "close" | "move" | "resize",
        titleContains: typeof obj.titleContains === "string" ? obj.titleContains : undefined,
      };
    }
    case "done": {
      if (typeof obj.result !== "string") {
        throw new VlmParseError("done requires string result");
      }
      return { type: "done", result: obj.result };
    }
    default:
      throw new VlmParseError(`Unknown action type: ${String(type)}`);
  }
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}
