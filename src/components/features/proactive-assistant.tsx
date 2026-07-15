"use client";

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Bell,
  BellOff,
  Sparkles,
  X,
  Clock,
  Camera,
  Upload,
  Loader2,
  Calendar,
  Lightbulb,
  Coffee,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/components/language-provider";
import {
  readSettings,
  writeSettings,
  DEFAULT_SETTINGS,
  type ProactiveSettings,
} from "@/lib/proactive-engine";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Suggestion {
  id: string;
  kind: string;
  title: string;
  body: string;
  action: string | null;
  dismissed: boolean;
  snoozedUntil: string | null;
  createdAt: string;
}

interface AnalyzeResult {
  analysis: string;
  parsed: { app: string; doing: string; help: string };
  suggestion: Suggestion;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ProactiveAssistant() {
  const { t } = useLanguage();
  const { toast } = useToast();

  const [settings, setSettings] = React.useState<ProactiveSettings>(DEFAULT_SETTINGS);
  const [suggestions, setSuggestions] = React.useState<Suggestion[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [analyzing, setAnalyzing] = React.useState(false);
  const [analyzeResult, setAnalyzeResult] = React.useState<AnalyzeResult | null>(null);
  const [hint, setHint] = React.useState("");

  // Hydrate settings from localStorage.
  React.useEffect(() => {
    setSettings(readSettings());
  }, []);

  // Fetch active suggestions.
  const fetchSuggestions = React.useCallback(async () => {
    try {
      const res = await fetch("/api/proactive", { cache: "no-store" });
      if (!res.ok) throw new Error("Failed");
      const data = (await res.json()) as { suggestions: Suggestion[] };
      setSuggestions(data.suggestions);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    fetchSuggestions();
  }, [fetchSuggestions]);

  // Poll for new suggestions every `intervalMs` if enabled.
  React.useEffect(() => {
    if (!settings.enabled || settings.focusMode) return;
    const id = setInterval(fetchSuggestions, settings.intervalMs);
    return () => clearInterval(id);
  }, [settings.enabled, settings.focusMode, settings.intervalMs, fetchSuggestions]);

  // ---------------------------------------------------------------
  // Settings update
  // ---------------------------------------------------------------

  const updateSettings = (patch: Partial<ProactiveSettings>) => {
    const next = { ...settings, ...patch };
    setSettings(next);
    writeSettings(next);
  };

  const toggleFocusMode = (minutes: number = 25) => {
    if (settings.focusMode) {
      updateSettings({ focusMode: false, focusModeUntil: null });
      toast({ title: t("assistant.proactive.focusOff") });
    } else {
      updateSettings({
        focusMode: true,
        focusModeUntil: Date.now() + minutes * 60_000,
      });
      toast({
        title: t("assistant.proactive.focusOn"),
        description: `${minutes} ${t("assistant.proactive.minutes")}`,
      });
    }
  };

  // ---------------------------------------------------------------
  // Screenshot analysis
  // ---------------------------------------------------------------

  const handleFile = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast({
        title: t("assistant.proactive.notImage"),
        variant: "destructive",
      });
      return;
    }
    setAnalyzing(true);
    setAnalyzeResult(null);
    try {
      const buf = await file.arrayBuffer();
      const dataUrl = `data:${file.type};base64,${btoa(
        new Uint8Array(buf).reduce((s, b) => s + String.fromCharCode(b), ""),
      )}`;
      await analyzeScreenshot(dataUrl);
    } catch (err) {
      toast({
        title: t("assistant.proactive.analyzeFailed"),
        description: err instanceof Error ? err.message : "",
        variant: "destructive",
      });
    } finally {
      setAnalyzing(false);
    }
  };

  const handlePaste = async (e: React.ClipboardEvent) => {
    const items = e.clipboardData.items;
    for (const item of items) {
      if (item.type.startsWith("image/")) {
        const file = item.getAsFile();
        if (file) {
          e.preventDefault();
          await handleFile(file);
          return;
        }
      }
    }
  };

  const analyzeScreenshot = async (dataUrl: string) => {
    const res = await fetch("/api/proactive/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image: dataUrl, hint }),
    });
    const data = (await res.json()) as AnalyzeResult & { error?: string };
    if (!res.ok) {
      throw new Error(data.error || "Analysis failed");
    }
    setAnalyzeResult(data);
    fetchSuggestions();
    toast({ title: t("assistant.proactive.analyzed") });
  };

  // ---------------------------------------------------------------
  // Suggestion actions
  // ---------------------------------------------------------------

  const dismiss = async (id: string) => {
    setSuggestions((prev) => prev.filter((s) => s.id !== id));
    await fetch("/api/proactive", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "dismiss", id }),
    });
  };

  const snooze = async (id: string, minutes: number = 15) => {
    setSuggestions((prev) => prev.filter((s) => s.id !== id));
    await fetch("/api/proactive", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "snooze", id, minutes }),
    });
    toast({ title: t("assistant.proactive.snoozed") });
  };

  // ---------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------

  return (
    <div className="space-y-4" onPaste={handlePaste}>
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
            <Bell className="h-5 w-5 text-primary" />
            {t("assistant.proactive.title")}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("assistant.proactive.subtitle")}
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant={settings.focusMode ? "default" : "outline"}
            size="sm"
            onClick={() => toggleFocusMode(25)}
          >
            {settings.focusMode ? (
              <>
                <BellOff className="mr-1.5 h-3.5 w-3.5" />
                {t("assistant.proactive.endFocus")}
              </>
            ) : (
              <>
                <Coffee className="mr-1.5 h-3.5 w-3.5" />
                {t("assistant.proactive.startFocus")}
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Settings card */}
      <Card>
        <CardContent className="space-y-4 p-4">
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            <Sparkles className="h-3 w-3" />
            {t("assistant.proactive.settings")}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {/* Enabled toggle */}
            <div className="flex items-center justify-between rounded-lg border bg-background/40 p-3">
              <div>
                <p className="text-sm font-medium">
                  {t("assistant.proactive.enabled")}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  {t("assistant.proactive.enabledDesc")}
                </p>
              </div>
              <Switch
                checked={settings.enabled}
                onCheckedChange={(v) => updateSettings({ enabled: v })}
              />
            </div>

            {/* Daily summary */}
            <div className="flex items-center justify-between rounded-lg border bg-background/40 p-3">
              <div>
                <p className="text-sm font-medium">
                  {t("assistant.proactive.dailySummary")}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  {t("assistant.proactive.dailySummaryDesc")}
                </p>
              </div>
              <Switch
                checked={settings.dailySummary}
                onCheckedChange={(v) => updateSettings({ dailySummary: v })}
              />
            </div>

            {/* Interval */}
            <div className="rounded-lg border bg-background/40 p-3">
              <Label className="text-sm font-medium">
                {t("assistant.proactive.interval")}
              </Label>
              <Select
                value={String(settings.intervalMs)}
                onValueChange={(v) => updateSettings({ intervalMs: parseInt(v, 10) })}
              >
                <SelectTrigger className="mt-1.5 h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="60000">1 min</SelectItem>
                  <SelectItem value="120000">2 min</SelectItem>
                  <SelectItem value="300000">5 min</SelectItem>
                  <SelectItem value="900000">15 min</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Summary hour */}
            <div className="rounded-lg border bg-background/40 p-3">
              <Label className="text-sm font-medium">
                {t("assistant.proactive.summaryHour")}
              </Label>
              <Select
                value={String(settings.dailySummaryHour)}
                onValueChange={(v) =>
                  updateSettings({ dailySummaryHour: parseInt(v, 10) })
                }
              >
                <SelectTrigger className="mt-1.5 h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 24 }).map((_, h) => (
                    <SelectItem key={h} value={String(h)}>
                      {String(h).padStart(2, "0")}:00
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Screenshot analyzer */}
      <Card className={cn("border-primary/30", analyzing && "border-primary/60")}>
        <CardContent className="space-y-3 p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              <Camera className="h-3 w-3" />
              {t("assistant.proactive.analyzer")}
            </div>
            {analyzing && (
              <Badge variant="outline" className="gap-1 text-[10px]">
                <Loader2 className="h-3 w-3 animate-spin" />
                {t("assistant.proactive.analyzing")}
              </Badge>
            )}
          </div>

          <p className="text-xs text-muted-foreground">
            {t("assistant.proactive.analyzerDesc")}
          </p>

          <div className="flex gap-2">
            <Input
              value={hint}
              onChange={(e) => setHint(e.target.value)}
              placeholder={t("assistant.proactive.hintPlaceholder")}
              className="flex-1"
            />
            <label>
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFile(f);
                }}
              />
              <Button
                variant="outline"
                size="sm"
                className="cursor-pointer gap-1.5"
                asChild
              >
                <span>
                  <Upload className="h-3.5 w-3.5" />
                  {t("assistant.proactive.upload")}
                </span>
              </Button>
            </label>
          </div>

          {/* Analysis result */}
          <AnimatePresence>
            {analyzeResult && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="rounded-lg border bg-muted/30 p-3"
              >
                <div className="space-y-1.5 text-xs">
                  <div className="flex gap-2">
                    <Badge variant="outline" className="text-[9px]">APP</Badge>
                    <span>{analyzeResult.parsed.app}</span>
                  </div>
                  <div className="flex gap-2">
                    <Badge variant="outline" className="text-[9px]">DOING</Badge>
                    <span>{analyzeResult.parsed.doing}</span>
                  </div>
                  <div className="flex gap-2">
                    <Badge variant="outline" className="text-[9px]">HELP</Badge>
                    <span className="text-primary">{analyzeResult.parsed.help}</span>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="mt-2 h-6 gap-1 text-[10px]"
                  onClick={() => setAnalyzeResult(null)}
                >
                  <X className="h-3 w-3" />
                  {t("common.close")}
                </Button>
              </motion.div>
            )}
          </AnimatePresence>
        </CardContent>
      </Card>

      {/* Active suggestions */}
      <div>
        <h3 className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          <Lightbulb className="h-3 w-3" />
          {t("assistant.proactive.active")} · {suggestions.length}
        </h3>

        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 2 }).map((_, i) => (
              <Skeleton key={i} className="h-20 w-full" />
            ))}
          </div>
        ) : suggestions.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
              <Bell className="h-8 w-8 text-muted-foreground/40" />
              <p className="text-xs text-muted-foreground">
                {t("assistant.proactive.none")}
              </p>
            </CardContent>
          </Card>
        ) : (
          <ScrollArea className="max-h-[40vh]">
            <div className="space-y-2 pr-2">
              <AnimatePresence mode="popLayout">
                {suggestions.map((sug) => (
                  <SuggestionCard
                    key={sug.id}
                    suggestion={sug}
                    onDismiss={() => dismiss(sug.id)}
                    onSnooze={(m) => snooze(sug.id, m)}
                    t={t}
                  />
                ))}
              </AnimatePresence>
            </div>
          </ScrollArea>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Single suggestion card
// ---------------------------------------------------------------------------

function SuggestionCard({
  suggestion,
  onDismiss,
  onSnooze,
  t,
}: {
  suggestion: Suggestion;
  onDismiss: () => void;
  onSnooze: (minutes: number) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
}) {
  const kindMeta: Record<
    string,
    { icon: React.ElementType; color: string; label: string }
  > = {
    tip: { icon: Lightbulb, color: "text-amber-500", label: "Tip" },
    offer: { icon: Sparkles, color: "text-primary", label: "Offer" },
    summary: { icon: Calendar, color: "text-sky-500", label: "Summary" },
    reminder: { icon: Clock, color: "text-violet-500", label: "Reminder" },
  };
  const meta = kindMeta[suggestion.kind] ?? kindMeta.tip;
  const Icon = meta.icon;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
    >
      <Card className="p-3">
        <div className="flex items-start gap-3">
          <div
            className={cn(
              "flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted",
              meta.color,
            )}
          >
            <Icon className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className="truncate text-sm font-medium">{suggestion.title}</p>
              <Badge variant="outline" className="shrink-0 text-[9px] uppercase">
                {meta.label}
              </Badge>
            </div>
            <p className="mt-1 whitespace-pre-wrap break-words text-xs text-muted-foreground">
              {suggestion.body}
            </p>
            <div className="mt-2 flex items-center gap-1">
              <Button
                size="sm"
                variant="ghost"
                className="h-6 text-[10px]"
                onClick={() => onSnooze(15)}
              >
                <Clock className="mr-1 h-3 w-3" />
                {t("assistant.proactive.snoozeBtn")}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-6 text-[10px] hover:text-destructive"
                onClick={onDismiss}
              >
                <X className="mr-1 h-3 w-3" />
                {t("assistant.proactive.dismiss")}
              </Button>
            </div>
          </div>
        </div>
      </Card>
    </motion.div>
  );
}
