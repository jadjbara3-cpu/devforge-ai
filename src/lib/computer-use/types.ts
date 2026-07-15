/**
 * Shared TypeScript types for the Computer Use module.
 *
 * These are the contracts that flow between the API routes, the agent loop,
 * and the React UI. Everything is plain JSON-serialisable so it can travel
 * over SSE, fetch(), and Prisma string columns without custom marshalling.
 *
 * Convention: every discriminated union uses a literal `type` field so the
 * agent loop's `switch (action.type)` exhaustiveness check produces a
 * compile-time error if a new action variant is added without a handler.
 */

// ---------------------------------------------------------------------------
// Screenshot
// ---------------------------------------------------------------------------

export interface ScreenshotRequest {
  /** Monitor index (0 = primary). Ignored if `region` or `windowTitle` is set. */
  monitor?: number;
  /** Capture only this rectangle (virtual screen coordinates). */
  region?: { x: number; y: number; w: number; h: number };
  /** Capture only the window whose title contains this string (case-insensitive). */
  windowTitle?: string;
  /** JPEG quality 1-100. Default 60 (≈8-15 KB per 1080p frame). */
  quality?: number;
  /** Cap the longest edge of the output (px). The VLM sees a smaller image which saves bandwidth. */
  maxWidth?: number;
}

export interface ScreenshotResponse {
  /** base64-encoded JPEG (no data: prefix). */
  base64: string;
  width: number;
  height: number;
  bytes: number;
  monitor: number;
  capturedAt: string; // ISO timestamp
}

// ---------------------------------------------------------------------------
// Mouse
// ---------------------------------------------------------------------------

export type MouseButton = "left" | "right" | "middle";

export type MouseActionType =
  | "move"
  | "click"
  | "double-click"
  | "right-click"
  | "middle-click"
  | "drag"
  | "scroll"
  | "scroll-down"
  | "scroll-up";

export interface MouseRequest {
  action: MouseActionType;
  x?: number;
  y?: number;
  /** Drag start point (for `drag`). */
  fromX?: number;
  fromY?: number;
  button?: MouseButton;
  /** Scroll delta in "notches" — positive = down, negative = up. */
  scrollAmount?: number;
  /** Optional human-style delay (ms) between sub-actions for stability. */
  delayMs?: number;
}

// ---------------------------------------------------------------------------
// Keyboard
// ---------------------------------------------------------------------------

export type KeyboardActionType =
  | "type"
  | "press"
  | "hotkey"
  | "key-down"
  | "key-up";

export interface KeyboardRequest {
  action: KeyboardActionType;
  /** For `type`: the literal text to type. For `press`/`key-down`/`key-up`: a single key name. */
  text?: string;
  /** A single key name (e.g. "enter", "escape", "f5"). */
  key?: string;
  /** For `hotkey`: array of keys held simultaneously (e.g. ["ctrl","c"]). */
  keys?: string[];
  /** Per-keystroke delay for `type` (ms). */
  interval?: number;
}

// ---------------------------------------------------------------------------
// Windows
// ---------------------------------------------------------------------------

export interface WindowInfo {
  handle: number;
  title: string;
  processName: string;
  processId: number;
  x: number;
  y: number;
  width: number;
  height: number;
  isMinimized: boolean;
  isMaximized: boolean;
  isVisible: boolean;
}

export type WindowActionType =
  | "focus"
  | "minimize"
  | "maximize"
  | "restore"
  | "close"
  | "move"
  | "resize";

export interface WindowsRequest {
  /** Filter by title substring (case-insensitive). */
  titleContains?: string;
  /** Filter by process name substring (case-insensitive). */
  processContains?: string;
  action?: WindowActionType;
  /** Target window title (for action). Falls back to first match of `titleContains`. */
  targetTitle?: string;
  /** For move/resize. */
  x?: number;
  y?: number;
  width?: number;
  height?: number;
}

export interface WindowsResponse {
  windows: WindowInfo[];
  action?: {
    type: WindowActionType;
    target: string;
    ok: boolean;
    error?: string;
  };
}

// ---------------------------------------------------------------------------
// Shell
// ---------------------------------------------------------------------------

export type ShellKind = "cmd" | "powershell";

export interface ShellRequest {
  command: string;
  kind?: ShellKind; // default: powershell
  /** Per-command timeout in ms. Default 15_000; max 60_000. */
  timeoutMs?: number;
  /** Working directory. Default: %USERPROFILE%. */
  cwd?: string;
  /** When true, the route refuses anything matching the dangerous-pattern list. */
  allowDangerous?: boolean;
}

export interface ShellResponse {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  durationMs: number;
  timedOut: boolean;
  command: string;
  kind: ShellKind;
}

// ---------------------------------------------------------------------------
// Files
// ---------------------------------------------------------------------------

export type FileActionType =
  | "list"
  | "read"
  | "write"
  | "mkdir"
  | "delete"
  | "stat"
  | "search";

export interface FilesRequest {
  action: FileActionType;
  /** Absolute path (must be inside the user root, e.g. %USERPROFILE%). */
  path: string;
  /** For `write`: file contents. For `search`: glob pattern. */
  content?: string;
  /** For `write`: create parent dirs if missing. */
  recursive?: boolean;
  /** For `list`: include hidden files. */
  includeHidden?: boolean;
  /** For `search`: max results. */
  limit?: number;
}

export interface FileEntry {
  name: string;
  path: string;
  isDirectory: boolean;
  size: number;
  modifiedAt: string;
}

export interface FilesResponse {
  action: FileActionType;
  path: string;
  entries?: FileEntry[];
  content?: string;
  stat?: {
    exists: boolean;
    isDirectory: boolean;
    size: number;
    modifiedAt: string;
  };
  matches?: string[];
  /** Optional structured payload (e.g. the backup path on a delete). */
  data?: unknown;
  ok: boolean;
  error?: string;
}

// ---------------------------------------------------------------------------
// Clipboard
// ---------------------------------------------------------------------------

export type ClipboardActionType = "get-text" | "set-text" | "get-image" | "clear";

export interface ClipboardRequest {
  action: ClipboardActionType;
  text?: string;
}

export interface ClipboardResponse {
  action: ClipboardActionType;
  ok: boolean;
  text?: string;
  /** base64 PNG if clipboard holds an image and action = get-image. */
  imageBase64?: string;
  hasImage?: boolean;
  error?: string;
}

// ---------------------------------------------------------------------------
// Process
// ---------------------------------------------------------------------------

export type ProcessActionType = "list" | "start" | "kill";

export interface ProcessRequest {
  action: ProcessActionType;
  /** For `start`: executable path or name. For `kill`: process name or PID. */
  target?: string;
  /** For `start`: arguments. */
  args?: string;
  /** For `kill`: by PID instead of name. */
  pid?: number;
  /** For `list`: filter by name substring. */
  nameContains?: string;
  /** For `list`: include background Windows services (default false). */
  includeServices?: boolean;
}

export interface ProcessInfo {
  pid: number;
  name: string;
  memoryMB: number;
  cpuPercent?: number;
  mainWindowTitle?: string;
}

export interface ProcessResponse {
  action: ProcessActionType;
  processes?: ProcessInfo[];
  started?: { pid: number | null };
  killed?: { target: string; count: number };
  ok: boolean;
  error?: string;
}

// ---------------------------------------------------------------------------
// Agent loop — VLM action envelope + SSE events
// ---------------------------------------------------------------------------

/**
 * The structured action the VLM must return on each iteration. Parsed from
 * the model's JSON-formatted response (we ask the model to emit ONLY a JSON
 * object matching this schema — no surrounding prose).
 */
export interface VlmAction {
  /** Short reasoning shown to the user in the action log. */
  thought: string;
  action: AgentAction;
  /** True when the AI considers the task complete. */
  done?: boolean;
  /** Optional natural-language status used for the progress pill. */
  status?: "in_progress" | "verifying" | "stuck" | "complete";
}

export type AgentAction =
  | { type: "screenshot" }
  | { type: "click"; x: number; y: number; button?: MouseButton; double?: boolean }
  | { type: "right-click"; x: number; y: number }
  | { type: "drag"; fromX: number; fromY: number; toX: number; toY: number }
  | { type: "scroll"; x: number; y: number; amount: number }
  | { type: "type"; text: string; interval?: number }
  | { type: "key"; keys: string[] }
  | { type: "wait"; ms: number }
  | { type: "shell"; command: string; kind?: ShellKind }
  | { type: "open_app"; name: string; args?: string }
  | { type: "window"; action: WindowActionType; titleContains?: string }
  | { type: "done"; result: string };

/** Per-step record persisted in ComputerTask.steps (JSON-encoded). */
export interface AgentStep {
  index: number;
  thought: string;
  action: AgentAction;
  /** Outcome of executing the action — `ok:false` means the AI must adapt. */
  result: {
    ok: boolean;
    error?: string;
    data?: unknown;
    durationMs: number;
  };
  /** Was the action destructive + needed explicit user approval? */
  approval: "auto" | "approved" | "denied" | "skipped";
  /** Base64 JPEG (compressed) taken BEFORE the action — for replay/debugging. */
  screenshot?: string;
  at: string; // ISO timestamp
}

/**
 * SSE event union emitted by `POST /api/computer/agent`.
 *
 * Protocol (one JSON event per `data:` line, terminated by `\n\n`, ending
 * with the literal `data: [DONE]\n\n` — same convention as /api/chat):
 *
 *   data: {"type":"start","taskId":"...","task":"...","maxSteps":50}
 *   data: {"type":"screenshot","base64":"...","step":0}
 *   data: {"type":"thought","step":1,"text":"I see the Start button..."}
 *   data: {"type":"action","step":1,"action":{...}}
 *   data: {"type":"approval_required","step":1,"reason":"destructive","action":{...}}
 *   data: {"type":"action_result","step":1,"ok":true,"durationMs":42}
 *   data: {"type":"step","step":1}
 *   ...
 *   data: {"type":"done","result":"Notepad opened with text...","steps":12}
 *   data: [DONE]
 */
export type AgentSseEvent =
  | { type: "start"; taskId: string; task: string; maxSteps: number }
  | { type: "screenshot"; base64: string; step: number; reason: "initial" | "verify" | "planning" }
  | { type: "thought"; step: number; text: string }
  | { type: "action"; step: number; action: AgentAction }
  | { type: "approval_required"; step: number; reason: string; action: AgentAction }
  | { type: "action_result"; step: number; ok: boolean; durationMs: number; error?: string; data?: unknown }
  | { type: "step"; step: number; total: number }
  | { type: "warning"; step: number; text: string }
  | { type: "done"; taskId: string; result: string; steps: number }
  | { type: "stopped"; taskId: string; reason: string; partialResult?: string }
  | { type: "error"; taskId: string; error: string; code: string };

// ---------------------------------------------------------------------------
// Agent run options (POST body for /api/computer/agent)
// ---------------------------------------------------------------------------

export interface AgentRunRequest {
  /** Natural-language goal, e.g. "Open notepad and type 'Hello World'". */
  task: string;
  /** Hard cap on iterations. Default 50, max 50. */
  maxSteps?: number;
  /** Wall-clock budget (ms). Default 300_000 (5 min), max 600_000. */
  timeoutMs?: number;
  /** When true, every action requires explicit approval via /api/computer/agent/approve. */
  requireApproval?: boolean;
  /** When true, destructive actions are blocked entirely (returns an error). */
  blockDestructive?: boolean;
  /** When true, no real actions are executed — the loop just simulates + logs. */
  sandboxMode?: boolean;
  /** Which monitor to capture (default 0). */
  monitor?: number;
  /** Slot to use for the VLM. Default "complex". */
  vlmSlot?: "complex" | "agents";
}

export interface AgentRunResponse {
  taskId: string;
  ok: boolean;
  error?: string;
}

// ---------------------------------------------------------------------------
// Stop / Approve (out-of-band control)
// ---------------------------------------------------------------------------

export interface AgentControlRequest {
  taskId: string;
  /** "stop" | "approve" | "deny" */
  op: "stop" | "approve" | "deny";
}

export interface AgentControlResponse {
  ok: boolean;
  taskId: string;
  op: string;
  error?: string;
}
