"use client";

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Workflow as WorkflowIcon,
  Play,
  Square,
  Trash2,
  Save,
  Clock,
  ListOrdered,
  Sparkles,
  Inbox,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/components/language-provider";
import {
  useWorkflowRecorder,
  useWorkflowPlayer,
  type Workflow,
  type WorkflowStep,
  type WorkflowStepDraft,
} from "@/lib/workflow-engine";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatRelative(iso: string | null): string {
  if (!iso) return "—";
  try {
    const diff = Date.now() - new Date(iso).getTime();
    if (diff < 60_000) return "just now";
    if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
    if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
    return new Date(iso).toLocaleDateString();
  } catch {
    return iso;
  }
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function WorkflowStudio() {
  const { t } = useLanguage();
  const { toast } = useToast();

  const [workflows, setWorkflows] = React.useState<Workflow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);

  const recorder = useWorkflowRecorder({
    ignoreSelector: "[data-workflow-ignore]",
  });
  const player = useWorkflowPlayer();

  const [saveDialog, setSaveDialog] = React.useState<{
    open: boolean;
    name: string;
    description: string;
  }>({ open: false, name: "", description: "" });

  // ---------------------------------------------------------------
  // Fetch
  // ---------------------------------------------------------------

  const fetchWorkflows = React.useCallback(async () => {
    try {
      const res = await fetch("/api/workflow", { cache: "no-store" });
      if (!res.ok) throw new Error("Failed");
      const data = (await res.json()) as { workflows: Workflow[] };
      setWorkflows(data.workflows);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    fetchWorkflows();
  }, [fetchWorkflows]);

  // ---------------------------------------------------------------
  // Recorder actions
  // ---------------------------------------------------------------

  const startRecording = () => {
    recorder.start();
    toast({ title: t("assistant.workflow.recording") });
  };

  const stopRecording = () => {
    const steps = recorder.stop();
    if (steps.length === 0) {
      toast({
        title: t("assistant.workflow.empty"),
        variant: "destructive",
      });
      return;
    }
    setSaveDialog({
      open: true,
      name: `Workflow ${new Date().toLocaleString()}`,
      description: `${steps.length} steps`,
    });
  };

  const cancelRecording = () => {
    recorder.cancel();
  };

  const saveRecording = async () => {
    const steps = recorder.steps;
    if (!saveDialog.name.trim()) {
      toast({
        title: t("assistant.workflow.nameRequired"),
        variant: "destructive",
      });
      return;
    }
    try {
      const res = await fetch("/api/workflow", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: saveDialog.name,
          description: saveDialog.description,
          steps,
        }),
      });
      if (!res.ok) throw new Error("Save failed");
      toast({ title: t("assistant.workflow.saved") });
      setSaveDialog({ open: false, name: "", description: "" });
      fetchWorkflows();
    } catch (err) {
      toast({
        title: t("assistant.workflow.saveFailed"),
        description: err instanceof Error ? err.message : "",
        variant: "destructive",
      });
    }
  };

  // ---------------------------------------------------------------
  // Player actions
  // ---------------------------------------------------------------

  const playWorkflow = async (wf: Workflow, aiAssisted: boolean = false) => {
    if (player.playing) {
      player.cancel();
      return;
    }
    if (aiAssisted) {
      toast({
        title: t("assistant.workflow.aiPlayTitle"),
        description: t("assistant.workflow.aiPlayDesc"),
      });
    }
    await player.play(wf.steps, 1.2);
    // After play, bump run count on the server.
    fetch(`/api/workflow/${wf.id}/play`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ aiAssisted }),
    }).then(fetchWorkflows).catch(() => null);
  };

  const deleteWorkflow = async (wf: Workflow) => {
    await fetch(`/api/workflow/${wf.id}`, { method: "DELETE" });
    setWorkflows((prev) => prev.filter((w) => w.id !== wf.id));
    if (selectedId === wf.id) setSelectedId(null);
  };

  // ---------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------

  const selected = workflows.find((w) => w.id === selectedId);

  return (
    <div className="space-y-4" data-workflow-ignore>
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
            <WorkflowIcon className="h-5 w-5 text-primary" />
            {t("assistant.workflow.title")}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("assistant.workflow.subtitle")}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {recorder.active ? (
            <>
              <Button variant="destructive" size="sm" onClick={stopRecording}>
                <Square className="mr-1.5 h-3.5 w-3.5" />
                {t("assistant.workflow.stop")}
              </Button>
              <Button variant="ghost" size="sm" onClick={cancelRecording}>
                {t("common.cancel")}
              </Button>
            </>
          ) : (
            <Button size="sm" onClick={startRecording}>
              <span className="mr-1.5 flex h-2 w-2 rounded-full bg-red-500" />
              {t("assistant.workflow.record")}
            </Button>
          )}
        </div>
      </div>

      {/* Recorder status banner */}
      <AnimatePresence>
        {recorder.active && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
          >
            <Card className="border-red-500/40 bg-red-500/[0.03]">
              <CardContent className="flex items-center gap-3 p-3">
                <span className="relative flex h-3 w-3">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-60" />
                  <span className="relative inline-flex h-3 w-3 rounded-full bg-red-500" />
                </span>
                <div className="flex-1">
                  <p className="text-sm font-medium">
                    {t("assistant.workflow.recording")}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {recorder.steps.length} {t("assistant.workflow.stepsCaptured")}
                  </p>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Playback progress */}
      <AnimatePresence>
        {player.playing && player.progress && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
          >
            <Card className="border-primary/40 bg-primary/[0.03]">
              <CardContent className="space-y-2 p-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="flex items-center gap-1.5">
                    <Play className="h-3 w-3 text-primary" />
                    {t("assistant.workflow.playing")}
                  </span>
                  <span className="font-mono">
                    {player.progress.index} / {player.progress.total}
                  </span>
                </div>
                <Progress
                  value={
                    player.progress.total > 0
                      ? (player.progress.index / player.progress.total) * 100
                      : 0
                  }
                />
                {player.lastEvent?.description && (
                  <p className="truncate text-[10px] text-muted-foreground">
                    {player.lastEvent.description}
                  </p>
                )}
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Two-column layout */}
      <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
        {/* Workflow list */}
        <div className="space-y-2">
          <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            {t("assistant.workflow.library")} · {workflows.length}
          </h3>
          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : workflows.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="flex flex-col items-center gap-2 py-8 text-center">
                <Inbox className="h-8 w-8 text-muted-foreground/50" />
                <p className="text-xs text-muted-foreground">
                  {t("assistant.workflow.emptyLibrary")}
                </p>
              </CardContent>
            </Card>
          ) : (
            <ScrollArea className="h-[60vh] pr-2">
              <div className="space-y-1.5">
                {workflows.map((wf) => (
                  <button
                    key={wf.id}
                    onClick={() => setSelectedId(wf.id)}
                    className={cn(
                      "w-full rounded-lg border bg-card p-3 text-left transition-all hover:border-primary/40",
                      selectedId === wf.id && "border-primary bg-primary/5",
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="truncate text-sm font-medium">{wf.name}</p>
                      <Badge variant="outline" className="shrink-0 text-[9px]">
                        {wf.steps.length}
                      </Badge>
                    </div>
                    {wf.description && (
                      <p className="mt-0.5 line-clamp-1 text-[11px] text-muted-foreground">
                        {wf.description}
                      </p>
                    )}
                    <div className="mt-1.5 flex items-center gap-2 text-[10px] text-muted-foreground">
                      <Clock className="h-2.5 w-2.5" />
                      {formatRelative(wf.lastRunAt)}
                      <span>·</span>
                      <span>
                        {wf.runCount} {t("assistant.workflow.runs")}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            </ScrollArea>
          )}
        </div>

        {/* Detail view */}
        <div className="min-w-0">
          {!selected ? (
            <Card className="border-dashed">
              <CardContent className="flex flex-col items-center justify-center gap-3 py-20 text-center">
                <WorkflowIcon className="h-10 w-10 text-muted-foreground/40" />
                <div>
                  <p className="text-sm font-medium">
                    {t("assistant.workflow.selectPrompt")}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t("assistant.workflow.selectHint")}
                  </p>
                </div>
              </CardContent>
            </Card>
          ) : (
            <WorkflowDetail
              workflow={selected}
              onPlay={(ai) => playWorkflow(selected, ai)}
              onDelete={() => deleteWorkflow(selected)}
              playing={player.playing}
              t={t}
            />
          )}
        </div>
      </div>

      {/* Live captured steps (when recording) */}
      <AnimatePresence>
        {recorder.active && recorder.steps.length > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
          >
            <Card className="border-red-500/30">
              <CardContent className="p-3">
                <h3 className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  <ListOrdered className="h-3 w-3" />
                  {t("assistant.workflow.captured")} · {recorder.steps.length}
                </h3>
                <div className="max-h-40 overflow-y-auto space-y-1">
                  {recorder.steps.map((s, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-2 rounded border bg-background/40 px-2 py-1 text-[11px]"
                    >
                      <span className="font-mono text-muted-foreground">
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      <Badge variant="outline" className="text-[9px]">
                        {s.type}
                      </Badge>
                      <span className="flex-1 truncate">{s.description}</span>
                      <span className="text-muted-foreground">
                        +{s.durationMs}ms
                      </span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Save dialog */}
      <Dialog
        open={saveDialog.open}
        onOpenChange={(v) => setSaveDialog((s) => ({ ...s, open: v }))}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Save className="h-4 w-4 text-primary" />
              {t("assistant.workflow.saveTitle")}
            </DialogTitle>
            <DialogDescription>
              {t("assistant.workflow.saveDesc")}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label htmlFor="wf-name">{t("assistant.workflow.name")}</Label>
              <Input
                id="wf-name"
                value={saveDialog.name}
                onChange={(e) =>
                  setSaveDialog((s) => ({ ...s, name: e.target.value }))
                }
              />
            </div>
            <div>
              <Label htmlFor="wf-desc">{t("assistant.workflow.description")}</Label>
              <Textarea
                id="wf-desc"
                value={saveDialog.description}
                onChange={(e) =>
                  setSaveDialog((s) => ({ ...s, description: e.target.value }))
                }
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setSaveDialog({ open: false, name: "", description: "" })}
            >
              {t("common.cancel")}
            </Button>
            <Button onClick={saveRecording} className="gap-1.5">
              <Save className="h-3.5 w-3.5" />
              {t("common.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ---------------------------------------------------------------------------
// WorkflowDetail — shows the selected workflow's steps + play controls
// ---------------------------------------------------------------------------

function WorkflowDetail({
  workflow,
  onPlay,
  onDelete,
  playing,
  t,
}: {
  workflow: Workflow;
  onPlay: (aiAssisted: boolean) => void;
  onDelete: () => void;
  playing: boolean;
  t: (key: string, vars?: Record<string, string | number>) => string;
}) {
  const [confirmDelete, setConfirmDelete] = React.useState(false);

  return (
    <Card>
      <CardContent className="space-y-4 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-base font-semibold">{workflow.name}</h3>
            {workflow.description && (
              <p className="mt-0.5 text-xs text-muted-foreground">
                {workflow.description}
              </p>
            )}
            <div className="mt-2 flex flex-wrap items-center gap-2 text-[10px] text-muted-foreground">
              <Badge variant="outline" className="text-[9px]">
                {workflow.steps.length} {t("assistant.workflow.steps")}
              </Badge>
              <span>·</span>
              <Clock className="h-2.5 w-2.5" />
              {t("assistant.workflow.lastRun")}: {formatRelative(workflow.lastRunAt)}
              <span>·</span>
              <span>
                {workflow.runCount} {t("assistant.workflow.runs")}
              </span>
            </div>
          </div>
          <div className="flex shrink-0 gap-1">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="sm"
                    variant={playing ? "destructive" : "default"}
                    onClick={() => onPlay(false)}
                  >
                    {playing ? (
                      <>
                        <Square className="mr-1.5 h-3.5 w-3.5" />
                        {t("assistant.workflow.stop")}
                      </>
                    ) : (
                      <>
                        <Play className="mr-1.5 h-3.5 w-3.5" />
                        {t("assistant.workflow.play")}
                      </>
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{t("assistant.workflow.play")}</TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => onPlay(true)}
                    disabled={playing}
                  >
                    <Sparkles className="mr-1.5 h-3.5 w-3.5 text-primary" />
                    {t("assistant.workflow.aiPlay")}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{t("assistant.workflow.aiPlayTip")}</TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="hover:text-destructive"
                    onClick={() => setConfirmDelete(true)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{t("common.delete")}</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </div>

        {/* Steps list */}
        <div>
          <h4 className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            {t("assistant.workflow.stepsList")}
          </h4>
          <div className="space-y-1.5">
            {workflow.steps.map((step, i) => (
              <StepRow key={step.id} step={step} index={i} />
            ))}
          </div>
        </div>

        {/* Confirm delete */}
        {confirmDelete && (
          <div className="flex items-center gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3">
            <p className="flex-1 text-xs">{t("assistant.workflow.confirmDelete")}</p>
            <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(false)}>
              {t("common.cancel")}
            </Button>
            <Button size="sm" variant="destructive" onClick={onDelete}>
              {t("common.delete")}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function StepRow({ step, index }: { step: WorkflowStep; index: number }) {
  return (
    <div className="flex items-start gap-3 rounded-lg border bg-background/40 p-2.5">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 font-mono text-[10px] font-bold text-primary">
        {String(index + 1).padStart(2, "0")}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-[9px] uppercase">
            {step.type}
          </Badge>
          {step.durationMs > 0 && (
            <span className="text-[10px] text-muted-foreground">
              +{step.durationMs}ms
            </span>
          )}
        </div>
        <p className="mt-0.5 text-xs">{step.description}</p>
        {step.selector && (
          <p className="mt-0.5 truncate font-mono text-[10px] text-muted-foreground/70">
            {step.selector}
          </p>
        )}
        {step.text && (
          <p className="mt-0.5 truncate font-mono text-[10px] text-muted-foreground/70">
            → &quot;{step.text}&quot;
          </p>
        )}
      </div>
    </div>
  );
}
