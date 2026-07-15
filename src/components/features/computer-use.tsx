"use client";

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Monitor,
  Play,
  Square,
  Loader2,
  ShieldCheck,
  ShieldAlert,
  MousePointerClick,
  Keyboard,
  Camera,
  History,
  Eye,
  Hand,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Clock,
  ChevronRight,
  Sparkles,
  Terminal,
  FileText,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  ScrollArea,
} from "@/components/ui/scroll-area";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type {
  AgentAction,
  AgentSseEvent,
  AgentStep,
} from "@/lib/computer-use/types";

// ---------------------------------------------------------------------------
// Local UI types
// ---------------------------------------------------------------------------

interface LogEntry {
  id: string;
  step: number;
  kind: "thought" | "action" | "result" | "screenshot" | "warning" | "approval" | "info";
  text: string;
  ok?: boolean;
  durationMs?: number;
  at: number;
}

interface RecentTask {
  id: string;
  task: string;
  status: string;
  result: string | null;
  error: string | null;
  createdAt: string;
  finishedAt: string | null;
}

const SUGGESTED_TASKS = [
  "Open notepad and type 'Hello World'",
  "Open Chrome and navigate to github.com",
  "Take a screenshot and describe what you see",
  "Open Calculator and compute 25 * 18",
];

const MAX_LOG_ENTRIES = 200;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ComputerUse() {
  const { toast } = useToast();

  const [task, setTask] = React.useState("");
  const [running, setRunning] = React.useState(false);
  const [taskId, setTaskId] = React.useState<string | null>(null);
  const [screenshot, setScreenshot] = React.useState<string | null>(null);
  const [log, setLog] = React.useState<LogEntry[]>([]);
  const [step, setStep] = React.useState(0);
  const [maxSteps, setMaxSteps] = React.useState(50);
  const [pendingApproval, setPendingApproval] = React.useState<{
    step: number;
    reason: string;
    action: AgentAction;
  } | null>(null);
  const [result, setResult] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [recentTasks, setRecentTasks] = React.useState<RecentTask[]>([]);

  // Options
  const [requireApproval, setRequireApproval] = React.useState(false);
  const [sandboxMode, setSandboxMode] = React.useState(false);
  const [blockDestructive, setBlockDestructive] = React.useState(true);

  // Manual control mode
  const [manualMode, setManualMode] = React.useState(false);
  const [manualCoords, setManualCoords] = React.useState<{ x: number; y: number } | null>(null);

  const abortRef = React.useRef<AbortController | null>(null);
  const screenshotRef = React.useRef<HTMLImageElement | null>(null);
  const logRef = React.useRef<HTMLDivElement | null>(null);

  // --- Helpers -----------------------------------------------------------

  const pushLog = React.useCallback((entry: Omit<LogEntry, "id" | "at">) => {
    setLog((prev) =>
      [
        ...prev,
        {
          ...entry,
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          at: Date.now(),
        },
      ].slice(-MAX_LOG_ENTRIES),
    );
  }, []);

  const reset = React.useCallback(() => {
    setTaskId(null);
    setScreenshot(null);
    setLog([]);
    setStep(0);
    setMaxSteps(50);
    setPendingApproval(null);
    setResult(null);
    setError(null);
  }, []);

  const loadRecent = React.useCallback(async () => {
    try {
      const res = await fetch("/api/computer/tasks?limit=10", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as { tasks?: RecentTask[] };
      setRecentTasks(data.tasks ?? []);
    } catch {
      /* ignore */
    }
  }, []);

  React.useEffect(() => {
    void loadRecent();
  }, [loadRecent]);

  // Auto-scroll the log when new entries arrive.
  React.useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [log]);

  // --- SSE consumer ------------------------------------------------------

  const consumeStream = React.useCallback(
    async (res: Response): Promise<void> => {
      if (!res.body) throw new Error("Stream not available.");
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split("\n\n");
        buffer = events.pop() || "";
        for (const evt of events) {
          const lines = evt.split("\n").filter((l) => l.startsWith("data: "));
          if (!lines.length) continue;
          const data = lines.map((l) => l.slice(6)).join("\n");
          if (data === "[DONE]") continue;

          let parsed: AgentSseEvent;
          try {
            parsed = JSON.parse(data) as AgentSseEvent;
          } catch {
            continue;
          }
          handleEvent(parsed);
        }
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const handleEvent = React.useCallback(
    (event: AgentSseEvent) => {
      switch (event.type) {
        case "start":
          setTaskId(event.taskId);
          setMaxSteps(event.maxSteps);
          setStep(0);
          setResult(null);
          setError(null);
          pushLog({ step: 0, kind: "info", text: `Task started: "${event.task}"` });
          break;
        case "screenshot":
          setScreenshot(event.base64);
          pushLog({
            step: event.step,
            kind: "screenshot",
            text: `Screenshot captured (step ${event.step})`,
          });
          break;
        case "thought":
          setStep(event.step);
          pushLog({
            step: event.step,
            kind: "thought",
            text: event.text,
          });
          break;
        case "action":
          pushLog({
            step: event.step,
            kind: "action",
            text: stringifyAction(event.action),
          });
          break;
        case "approval_required":
          setPendingApproval({
            step: event.step,
            reason: event.reason,
            action: event.action,
          });
          pushLog({
            step: event.step,
            kind: "approval",
            text: `Approval required (${event.reason}): ${stringifyAction(event.action)}`,
          });
          break;
        case "action_result":
          if (!event.ok) {
            pushLog({
              step: event.step,
              kind: "result",
              ok: false,
              text: `Failed: ${event.error ?? "unknown error"}`,
              durationMs: event.durationMs,
            });
          } else {
            pushLog({
              step: event.step,
              kind: "result",
              ok: true,
              text: "OK",
              durationMs: event.durationMs,
            });
          }
          setPendingApproval(null);
          break;
        case "step":
          setStep(event.step);
          break;
        case "warning":
          pushLog({ step: event.step, kind: "warning", text: event.text });
          break;
        case "done":
          setResult(event.result);
          setRunning(false);
          pushLog({
            step: event.steps,
            kind: "info",
            text: `Task completed in ${event.steps} steps.`,
          });
          void loadRecent();
          break;
        case "stopped":
          setResult(event.partialResult ?? null);
          setRunning(false);
          pushLog({
            step: 0,
            kind: "warning",
            text: `Task stopped: ${event.reason}`,
          });
          void loadRecent();
          break;
        case "error":
          setError(event.error);
          setRunning(false);
          pushLog({ step: 0, kind: "warning", text: `Error: ${event.error}` });
          void loadRecent();
          break;
      }
    },
    [pushLog, loadRecent],
  );

  // --- Actions -----------------------------------------------------------

  const startTask = React.useCallback(async () => {
    if (!task.trim() || running) return;
    reset();
    setRunning(true);

    const ac = new AbortController();
    abortRef.current = ac;

    try {
      const res = await fetch("/api/computer/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          task: task.trim(),
          maxSteps: 50,
          timeoutMs: 5 * 60 * 1000,
          requireApproval,
          blockDestructive,
          sandboxMode,
          vlmSlot: "complex",
        }),
        signal: ac.signal,
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(
          (data as { error?: string }).error || `Request failed (${res.status})`,
        );
      }

      // The server returns a SSE stream OR (on early error) JSON.
      const ct = res.headers.get("content-type") || "";
      if (!ct.includes("text/event-stream")) {
        const data = await res.json().catch(() => ({}));
        throw new Error(
          (data as { error?: string }).error || "Server did not return a stream.",
        );
      }

      // Use the request URL's response — taskId arrives via the first SSE event.
      await consumeStream(res);
    } catch (err) {
      const isAbort =
        err instanceof Error &&
        (err.name === "AbortError" || /abort/i.test(err.message));
      if (!isAbort) {
        toast({
          title: "Agent failed to start",
          description: err instanceof Error ? err.message : "Unexpected error.",
          variant: "destructive",
        });
        setError(err instanceof Error ? err.message : "Unexpected error.");
      }
      setRunning(false);
    } finally {
      abortRef.current = null;
    }
  }, [task, running, reset, requireApproval, blockDestructive, sandboxMode, toast, consumeStream]);

  const stopTask = React.useCallback(async () => {
    if (abortRef.current) {
      abortRef.current.abort();
    }
    if (taskId) {
      try {
        await fetch("/api/computer/agent/approve", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ taskId, op: "stop" }),
        });
      } catch {
        /* ignore — the abort already broke the stream */
      }
    }
    setRunning(false);
  }, [taskId]);

  const approveAction = React.useCallback(
    async (decision: "approve" | "deny") => {
      if (!taskId || !pendingApproval) return;
      try {
        await fetch("/api/computer/agent/approve", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ taskId, op: decision === "approve" ? "approve" : "deny" }),
        });
      } catch (err) {
        toast({
          title: "Approval failed",
          description: err instanceof Error ? err.message : "Unexpected error.",
          variant: "destructive",
        });
      }
      setPendingApproval(null);
    },
    [taskId, pendingApproval, toast],
  );

  // --- Manual control ----------------------------------------------------

  const onScreenshotClick = React.useCallback(
    async (e: React.MouseEvent<HTMLImageElement>) => {
      if (!manualMode || !screenshot) return;
      const img = e.currentTarget;
      const rect = img.getBoundingClientRect();
      const scaleX = img.naturalWidth / rect.width;
      const scaleY = img.naturalHeight / rect.height;
      const x = Math.round((e.clientX - rect.left) * scaleX);
      const y = Math.round((e.clientY - rect.top) * scaleY);
      setManualCoords({ x, y });
      try {
        const res = await fetch("/api/computer/mouse", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "click", x, y }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(
            (data as { error?: string }).error || `Click failed (${res.status})`,
          );
        }
        // Refresh the screenshot.
        const shotRes = await fetch("/api/computer/screenshot?quality=60&maxWidth=1600");
        if (shotRes.ok) {
          const shot = (await shotRes.json()) as { base64: string };
          setScreenshot(shot.base64);
        }
      } catch (err) {
        toast({
          title: "Manual click failed",
          description: err instanceof Error ? err.message : "Unexpected error.",
          variant: "destructive",
        });
      }
    },
    [manualMode, screenshot, toast],
  );

  // --- Render ------------------------------------------------------------

  const progressPct = maxSteps > 0 ? Math.min(100, (step / maxSteps) * 100) : 0;

  return (
    <section className="flex flex-col gap-6">
      {/* Header */}
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/15 text-primary">
              <Monitor className="h-5 w-5" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight">Computer Use</h1>
            <Badge variant="secondary" className="ml-1 gap-1">
              <Sparkles className="h-3 w-3" /> VLM Agent
            </Badge>
            {sandboxMode && (
              <Badge variant="outline" className="gap-1 text-amber-500 border-amber-500/40">
                <ShieldAlert className="h-3 w-3" /> Sandbox
              </Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground">
            An autonomous AI agent that sees your screen, plans actions, and controls
            the mouse, keyboard, windows, and shell to accomplish Windows tasks.
          </p>
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        {/* LEFT: Live screenshot + log */}
        <div className="flex flex-col gap-4">
          {/* Screenshot preview */}
          <Card className="glass overflow-hidden">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Camera className="h-4 w-4 text-primary" />
                  Live Screen
                </CardTitle>
                <div className="flex items-center gap-2">
                  <TooltipProvider delayDuration={200}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant={manualMode ? "default" : "outline"}
                          size="sm"
                          onClick={() => setManualMode((v) => !v)}
                          disabled={running}
                        >
                          <Hand className="h-3.5 w-3.5" />
                          {manualMode ? "Manual ON" : "Manual"}
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="bottom" className="text-xs">
                        {manualMode
                          ? "Click on the screenshot to control the mouse"
                          : "Toggle manual control — click on the screenshot to send a mouse click"}
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={async () => {
                      try {
                        const res = await fetch(
                          "/api/computer/screenshot?quality=60&maxWidth=1600",
                        );
                        if (res.ok) {
                          const data = (await res.json()) as { base64: string };
                          setScreenshot(data.base64);
                        }
                      } catch {
                        /* ignore */
                      }
                    }}
                  >
                    <Camera className="h-3.5 w-3.5" />
                    Capture
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div
                className={cn(
                  "relative aspect-video w-full overflow-hidden rounded-lg border bg-black/80",
                  manualMode && "cursor-crosshair",
                )}
              >
                {screenshot ? (
                  <img
                    ref={screenshotRef}
                    src={`data:image/jpeg;base64,${screenshot}`}
                    alt="Screen capture"
                    onClick={onScreenshotClick}
                    className="h-full w-full object-contain"
                    draggable={false}
                  />
                ) : (
                  <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-muted-foreground">
                    <Monitor className="h-10 w-10 opacity-40" />
                    <p className="text-xs">
                      {running
                        ? "Waiting for first screenshot…"
                        : "No screenshot yet. Run a task or click Capture."}
                    </p>
                  </div>
                )}
                {manualMode && manualCoords && (
                  <div className="pointer-events-none absolute left-2 top-2 rounded bg-black/60 px-2 py-1 text-[10px] font-mono text-white">
                    Last click: ({manualCoords.x}, {manualCoords.y})
                  </div>
                )}
                {running && (
                  <div className="pointer-events-none absolute right-2 top-2 flex items-center gap-1 rounded bg-black/60 px-2 py-1 text-[10px] font-medium text-emerald-400">
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
                    LIVE
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Action log */}
          <Card className="glass">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2 text-base">
                  <History className="h-4 w-4 text-primary" />
                  Action Log
                </CardTitle>
                <Badge variant="outline" className="text-[10px]">
                  Step {step} / {maxSteps}
                </Badge>
              </div>
              {running && (
                <Progress value={progressPct} className="h-1" />
              )}
            </CardHeader>
            <CardContent>
              <div
                ref={logRef}
                className="max-h-72 overflow-y-auto rounded-lg border bg-card/40 pr-1"
              >
                {log.length === 0 ? (
                  <div className="flex h-24 items-center justify-center text-xs text-muted-foreground">
                    No actions yet. Describe a task and hit Run.
                  </div>
                ) : (
                  <ul className="divide-y">
                    <AnimatePresence initial={false}>
                      {log.map((entry) => (
                        <motion.li
                          key={entry.id}
                          initial={{ opacity: 0, y: -4 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0 }}
                          transition={{ duration: 0.15 }}
                          className="flex items-start gap-2 px-3 py-1.5 text-xs"
                        >
                          <LogIcon kind={entry.kind} ok={entry.ok} />
                          <div className="min-w-0 flex-1">
                            <p
                              className={cn(
                                "leading-relaxed",
                                entry.kind === "thought" && "text-muted-foreground italic",
                                entry.kind === "result" && entry.ok === false && "text-rose-500",
                                entry.kind === "warning" && "text-amber-500",
                                entry.kind === "approval" && "text-amber-500 font-medium",
                                entry.kind === "action" && "font-mono text-foreground",
                              )}
                            >
                              {entry.text}
                            </p>
                            {entry.durationMs !== undefined && (
                              <span className="text-[10px] text-muted-foreground">
                                {entry.durationMs}ms
                              </span>
                            )}
                          </div>
                          <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">
                            {formatTime(entry.at)}
                          </span>
                        </motion.li>
                      ))}
                    </AnimatePresence>
                  </ul>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* RIGHT: Task input + options + recent */}
        <div className="flex flex-col gap-4">
          <Card className="glass">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Sparkles className="h-4 w-4 text-primary" />
                Task
              </CardTitle>
              <CardDescription className="text-xs">
                Describe what you want the AI to do on this machine.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Textarea
                value={task}
                onChange={(e) => setTask(e.target.value)}
                placeholder="e.g. Open Chrome and navigate to github.com"
                className="min-h-20 resize-y"
                disabled={running}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                    void startTask();
                  }
                }}
              />
              <div className="flex flex-wrap gap-1.5">
                {SUGGESTED_TASKS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    disabled={running}
                    onClick={() => setTask(s)}
                    className="rounded-full border border-border bg-background px-2.5 py-1 text-[11px] text-muted-foreground transition-colors hover:border-primary/50 hover:bg-accent/40 hover:text-foreground"
                  >
                    {s}
                  </button>
                ))}
              </div>

              <Separator />

              {/* Options */}
              <div className="space-y-2">
                <OptionRow
                  icon={<ShieldCheck className="h-3.5 w-3.5" />}
                  label="Block destructive actions"
                  description="Refuse rm -rf, format, shutdown, etc."
                  checked={blockDestructive}
                  onCheckedChange={setBlockDestructive}
                  disabled={running}
                />
                <OptionRow
                  icon={<Hand className="h-3.5 w-3.5" />}
                  label="Require approval per action"
                  description="Pause before every action for your OK."
                  checked={requireApproval}
                  onCheckedChange={setRequireApproval}
                  disabled={running}
                />
                <OptionRow
                  icon={<ShieldAlert className="h-3.5 w-3.5" />}
                  label="Sandbox mode"
                  description="Plan + log only — no real actions execute."
                  checked={sandboxMode}
                  onCheckedChange={setSandboxMode}
                  disabled={running}
                />
              </div>

              <Separator />

              {/* Run / Stop */}
              {running ? (
                <Button
                  variant="destructive"
                  className="w-full"
                  size="lg"
                  onClick={stopTask}
                >
                  <Square className="h-4 w-4" />
                  Stop Agent
                </Button>
              ) : (
                <Button
                  className="w-full"
                  size="lg"
                  onClick={startTask}
                  disabled={!task.trim()}
                >
                  <Play className="h-4 w-4" />
                  Run Agent
                </Button>
              )}

              {/* Pending approval */}
              {pendingApproval && (
                <motion.div
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs"
                >
                  <div className="flex items-center gap-1.5 font-medium text-amber-600 dark:text-amber-400">
                    <ShieldAlert className="h-3.5 w-3.5" />
                    Approval required ({pendingApproval.reason})
                  </div>
                  <p className="mt-1 font-mono text-[11px] text-foreground">
                    {stringifyAction(pendingApproval.action)}
                  </p>
                  <div className="mt-2 flex gap-2">
                    <Button
                      size="sm"
                      variant="default"
                      className="flex-1"
                      onClick={() => approveAction("approve")}
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1"
                      onClick={() => approveAction("deny")}
                    >
                      <XCircle className="h-3.5 w-3.5" />
                      Deny
                    </Button>
                  </div>
                </motion.div>
              )}

              {/* Result */}
              {result && (
                <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-3 text-xs">
                  <div className="flex items-center gap-1.5 font-medium text-emerald-600 dark:text-emerald-400">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Result
                  </div>
                  <p className="mt-1 leading-relaxed text-foreground">{result}</p>
                </div>
              )}

              {/* Error */}
              {error && (
                <div className="rounded-lg border border-rose-500/40 bg-rose-500/10 p-3 text-xs">
                  <div className="flex items-center gap-1.5 font-medium text-rose-600 dark:text-rose-400">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    Error
                  </div>
                  <p className="mt-1 leading-relaxed">{error}</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Recent tasks */}
          <Card className="glass">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2 text-base">
                  <History className="h-4 w-4 text-primary" />
                  Recent Tasks
                </CardTitle>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={loadRecent}
                  disabled={running}
                  className="h-7 px-2 text-xs"
                >
                  Refresh
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {recentTasks.length === 0 ? (
                <p className="py-4 text-center text-xs text-muted-foreground">
                  No tasks yet.
                </p>
              ) : (
                <ScrollArea className="max-h-64">
                  <ul className="space-y-1.5">
                    {recentTasks.map((t) => (
                      <li
                        key={t.id}
                        className="rounded-md border bg-card/40 px-2.5 py-1.5 text-xs"
                      >
                        <div className="flex items-start gap-1.5">
                          <StatusIcon status={t.status} />
                          <p className="line-clamp-2 flex-1 font-medium">{t.task}</p>
                        </div>
                        {t.result && (
                          <p className="mt-1 line-clamp-2 text-[11px] text-muted-foreground">
                            {t.result}
                          </p>
                        )}
                        <div className="mt-1 flex items-center gap-1 text-[10px] text-muted-foreground">
                          <Clock className="h-2.5 w-2.5" />
                          {new Date(t.createdAt).toLocaleString()}
                        </div>
                      </li>
                    ))}
                  </ul>
                </ScrollArea>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Capabilities footer */}
      <Card className="glass">
        <CardContent className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-3 lg:grid-cols-6">
          {[
            { icon: Camera, label: "Screenshot" },
            { icon: MousePointerClick, label: "Mouse" },
            { icon: Keyboard, label: "Keyboard" },
            { icon: Monitor, label: "Windows" },
            { icon: Terminal, label: "Shell" },
            { icon: FileText, label: "Files" },
          ].map((c) => {
            const Icon = c.icon;
            return (
              <div
                key={c.label}
                className="flex items-center gap-2 rounded-lg border bg-card/40 px-3 py-2"
              >
                <Icon className="h-4 w-4 text-primary" />
                <span className="text-xs font-medium">{c.label}</span>
                <ChevronRight className="ml-auto h-3 w-3 text-muted-foreground/50" />
              </div>
            );
          })}
        </CardContent>
      </Card>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function OptionRow({
  icon,
  label,
  description,
  checked,
  onCheckedChange,
  disabled,
}: {
  icon: React.ReactNode;
  label: string;
  description: string;
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-start gap-2 rounded-md border bg-card/40 px-2.5 py-1.5">
      <div className="mt-0.5 text-muted-foreground">{icon}</div>
      <div className="flex-1 space-y-0.5">
        <p className="text-xs font-medium">{label}</p>
        <p className="text-[11px] leading-tight text-muted-foreground">{description}</p>
      </div>
      <Switch
        checked={checked}
        onCheckedChange={onCheckedChange}
        disabled={disabled}
        className="scale-90"
      />
    </div>
  );
}

function LogIcon({ kind, ok }: { kind: LogEntry["kind"]; ok?: boolean }) {
  const className = "mt-0.5 h-3.5 w-3.5 shrink-0";
  switch (kind) {
    case "thought":
      return <Sparkles className={cn(className, "text-violet-400")} />;
    case "action":
      return <ChevronRight className={cn(className, "text-primary")} />;
    case "result":
      return ok === false ? (
        <XCircle className={cn(className, "text-rose-500")} />
      ) : (
        <CheckCircle2 className={cn(className, "text-emerald-500")} />
      );
    case "screenshot":
      return <Camera className={cn(className, "text-sky-400")} />;
    case "warning":
      return <AlertTriangle className={cn(className, "text-amber-500")} />;
    case "approval":
      return <ShieldAlert className={cn(className, "text-amber-500")} />;
    case "info":
    default:
      return <div className={cn(className, "rounded-full bg-muted-foreground/30")} />;
  }
}

function StatusIcon({ status }: { status: string }) {
  const className = "mt-0.5 h-3.5 w-3.5 shrink-0";
  switch (status) {
    case "completed":
      return <CheckCircle2 className={cn(className, "text-emerald-500")} />;
    case "failed":
      return <XCircle className={cn(className, "text-rose-500")} />;
    case "stopped":
      return <Square className={cn(className, "text-amber-500")} />;
    case "running":
      return <Loader2 className={cn(className, "animate-spin text-primary")} />;
    default:
      return <Clock className={cn(className, "text-muted-foreground")} />;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function stringifyAction(action: AgentAction): string {
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

function formatTime(ts: number): string {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}`;
}

