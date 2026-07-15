"use client";

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ClipboardList,
  Copy,
  Trash2,
  Pin,
  PinOff,
  Search,
  Sparkles,
  Languages,
  FileText,
  AlignLeft,
  CheckCircle2,
  Loader2,
  Inbox,
  X,
  Play,
  Tag,
  Eraser,
  ScanLine,
  Plus,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/components/language-provider";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Kind = "text" | "image" | "url";
type Category =
  | "code"
  | "url"
  | "text"
  | "email"
  | "phone"
  | "address"
  | "json"
  | "snippet"
  | "image"
  | "other";

interface ClipboardItem {
  id: string;
  kind: Kind;
  content: string;
  preview: string;
  category: Category;
  pinned: boolean;
  source: string;
  sizeBytes: number;
  expiresAt: string | null;
  createdAt: string;
}

type AIOp = "translate" | "summarize" | "format" | "grammar";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CATEGORY_META: Record<
  Category,
  { label: string; color: string; icon: React.ElementType }
> = {
  code: { label: "Code", color: "text-emerald-500 bg-emerald-500/10 border-emerald-500/30", icon: Tag },
  url: { label: "URL", color: "text-sky-500 bg-sky-500/10 border-sky-500/30", icon: Tag },
  email: { label: "Email", color: "text-violet-500 bg-violet-500/10 border-violet-500/30", icon: Tag },
  phone: { label: "Phone", color: "text-amber-500 bg-amber-500/10 border-amber-500/30", icon: Tag },
  address: { label: "Address", color: "text-rose-500 bg-rose-500/10 border-rose-500/30", icon: Tag },
  json: { label: "JSON", color: "text-fuchsia-500 bg-fuchsia-500/10 border-fuchsia-500/30", icon: Tag },
  snippet: { label: "Snippet", color: "text-teal-500 bg-teal-500/10 border-teal-500/30", icon: Tag },
  text: { label: "Text", color: "text-muted-foreground bg-muted/40 border-border", icon: Tag },
  image: { label: "Image", color: "text-cyan-500 bg-cyan-500/10 border-cyan-500/30", icon: Tag },
  other: { label: "Other", color: "text-muted-foreground bg-muted/40 border-border", icon: Tag },
};

const POLL_INTERVAL_MS = 2000; // poll clipboard every 2s (browser-permitting)
const LAST_CLIP_KEY = "devforge-clipboard-last";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatRelativeTime(iso: string): string {
  try {
    const diff = Date.now() - new Date(iso).getTime();
    if (diff < 5_000) return "just now";
    if (diff < 60_000) return `${Math.floor(diff / 1000)}s ago`;
    if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
    if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
    return new Date(iso).toLocaleDateString();
  } catch {
    return iso;
  }
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function ClipboardManager() {
  const { t } = useLanguage();
  const { toast } = useToast();

  const [items, setItems] = React.useState<ClipboardItem[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [search, setSearch] = React.useState("");
  const [categoryFilter, setCategoryFilter] = React.useState<string>("all");
  const [monitoring, setMonitoring] = React.useState(false);
  const [aiDialog, setAiDialog] = React.useState<{
    open: boolean;
    item: ClipboardItem | null;
    op: AIOp;
    target: string;
    result: string;
    loading: boolean;
  }>({ open: false, item: null, op: "summarize", target: "en", result: "", loading: false });

  // ---------------------------------------------------------------
  // Data fetching
  // ---------------------------------------------------------------

  const fetchItems = React.useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (search.trim()) params.set("search", search.trim());
      if (categoryFilter !== "all") params.set("category", categoryFilter);
      const res = await fetch(`/api/clipboard?${params.toString()}`, {
        cache: "no-store",
      });
      if (!res.ok) throw new Error("Failed to load");
      const data = (await res.json()) as { items: ClipboardItem[] };
      setItems(data.items || []);
    } catch {
      /* swallow — UI keeps showing old data */
    } finally {
      setLoading(false);
    }
  }, [search, categoryFilter]);

  React.useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  // ---------------------------------------------------------------
  // Clipboard monitoring — poll navigator.clipboard every POLL_INTERVAL_MS
  // ---------------------------------------------------------------

  React.useEffect(() => {
    if (!monitoring) return;
    let cancelled = false;

    const poll = async () => {
      if (cancelled) return;
      try {
        if (!navigator.clipboard?.readText) return;
        const text = await navigator.clipboard.readText();
        if (!text || !text.trim()) return;
        const last = sessionStorage.getItem(LAST_CLIP_KEY);
        if (last === text) return;
        sessionStorage.setItem(LAST_CLIP_KEY, text);
        // Send to backend (it dedupes too).
        await fetch("/api/clipboard", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: text, source: "monitor" }),
        });
        fetchItems();
      } catch {
        // Clipboard read may be blocked (permissions). Silently ignore —
        // the user can still add items manually.
      }
    };

    poll();
    const id = setInterval(poll, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [monitoring, fetchItems]);

  // ---------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------

  const startMonitoring = async () => {
    // Try to request clipboard permission via a one-shot read.
    try {
      if (navigator.clipboard?.readText) {
        await navigator.clipboard.readText();
      }
      setMonitoring(true);
      toast({ title: t("assistant.clipboard.monitorOn") });
    } catch {
      toast({
        title: t("assistant.clipboard.monitorDenied"),
        description: t("assistant.clipboard.monitorDeniedDesc"),
        variant: "destructive",
      });
    }
  };

  const addItem = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (!text || !text.trim()) {
        toast({
          title: t("assistant.clipboard.empty"),
          variant: "destructive",
        });
        return;
      }
      await fetch("/api/clipboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: text, source: "manual" }),
      });
      fetchItems();
      toast({ title: t("assistant.clipboard.added") });
    } catch {
      toast({
        title: t("assistant.clipboard.readFailed"),
        variant: "destructive",
      });
    }
  };

  const togglePin = async (item: ClipboardItem) => {
    await fetch(`/api/clipboard/${item.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pinned: !item.pinned }),
    });
    fetchItems();
  };

  const deleteItem = async (item: ClipboardItem) => {
    await fetch(`/api/clipboard/${item.id}`, { method: "DELETE" });
    setItems((prev) => prev.filter((i) => i.id !== item.id));
  };

  const clearAll = async () => {
    const res = await fetch("/api/clipboard", { method: "DELETE" });
    if (res.ok) {
      fetchItems();
      toast({ title: t("assistant.clipboard.cleared") });
    }
  };

  const copyItem = async (item: ClipboardItem) => {
    const ok = await copyToClipboard(item.content);
    sessionStorage.setItem(LAST_CLIP_KEY, item.content);
    toast({
      title: ok ? t("assistant.clipboard.copied") : t("assistant.clipboard.copyFailed"),
      variant: ok ? "default" : "destructive",
    });
  };

  const openAIDialog = (item: ClipboardItem, op: AIOp) => {
    setAiDialog({
      open: true,
      item,
      op,
      target: "en",
      result: "",
      loading: false,
    });
  };

  const runAIProcess = async () => {
    if (!aiDialog.item) return;
    setAiDialog((s) => ({ ...s, loading: true, result: "" }));
    try {
      const res = await fetch("/api/clipboard/ai-process", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: aiDialog.item.id,
          op: aiDialog.op,
          target: aiDialog.target,
        }),
      });
      const data = (await res.json()) as { result?: string; error?: string };
      if (!res.ok) {
        throw new Error(data.error || "AI process failed");
      }
      setAiDialog((s) => ({ ...s, result: data.result || "" }));
    } catch (err) {
      toast({
        title: t("assistant.clipboard.aiFailed"),
        description: err instanceof Error ? err.message : "",
        variant: "destructive",
      });
    } finally {
      setAiDialog((s) => ({ ...s, loading: false }));
    }
  };

  // ---------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------

  const pinnedItems = items.filter((i) => i.pinned);
  const recentItems = items.filter((i) => !i.pinned);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
            <ClipboardList className="h-5 w-5 text-primary" />
            {t("assistant.clipboard.title")}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("assistant.clipboard.subtitle")}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant={monitoring ? "default" : "outline"}
                  size="sm"
                  onClick={() =>
                    monitoring ? setMonitoring(false) : startMonitoring()
                  }
                >
                  <ScanLine className="mr-1.5 h-3.5 w-3.5" />
                  {monitoring
                    ? t("assistant.clipboard.monitoring")
                    : t("assistant.clipboard.monitor")}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                {t("assistant.clipboard.monitorTip")}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <Button variant="outline" size="sm" onClick={addItem}>
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            {t("assistant.clipboard.capture")}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={clearAll}
            className="text-muted-foreground"
          >
            <Eraser className="mr-1.5 h-3.5 w-3.5" />
            {t("assistant.clipboard.clearAll")}
          </Button>
        </div>
      </div>

      {/* Search + filter */}
      <Card className="p-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("assistant.clipboard.searchPlaceholder")}
              className="pl-8"
            />
          </div>
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="h-9 w-[150px]">
              <SelectValue placeholder={t("assistant.clipboard.allCategories")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("assistant.clipboard.allCategories")}</SelectItem>
              {Object.entries(CATEGORY_META).map(([key, meta]) => (
                <SelectItem key={key} value={key}>
                  {meta.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </Card>

      {/* Loading skeleton */}
      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center gap-3 py-16 text-center">
            <Inbox className="h-10 w-10 text-muted-foreground/50" />
            <div>
              <p className="text-sm font-medium">
                {t("assistant.clipboard.emptyTitle")}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {t("assistant.clipboard.emptyDesc")}
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-5">
          {/* Pinned */}
          {pinnedItems.length > 0 && (
            <section>
              <h3 className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                <Pin className="h-3 w-3" />
                {t("assistant.clipboard.pinned")} · {pinnedItems.length}
              </h3>
              <div className="grid gap-2">
                <AnimatePresence mode="popLayout">
                  {pinnedItems.map((item) => (
                    <ClipboardRow
                      key={item.id}
                      item={item}
                      onCopy={() => copyItem(item)}
                      onPin={() => togglePin(item)}
                      onDelete={() => deleteItem(item)}
                      onAI={(op) => openAIDialog(item, op)}
                    />
                  ))}
                </AnimatePresence>
              </div>
            </section>
          )}

          {/* Recent */}
          {recentItems.length > 0 && (
            <section>
              <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                {t("assistant.clipboard.recent")} · {recentItems.length}
              </h3>
              <div className="grid gap-2">
                <AnimatePresence mode="popLayout">
                  {recentItems.map((item) => (
                    <ClipboardRow
                      key={item.id}
                      item={item}
                      onCopy={() => copyItem(item)}
                      onPin={() => togglePin(item)}
                      onDelete={() => deleteItem(item)}
                      onAI={(op) => openAIDialog(item, op)}
                    />
                  ))}
                </AnimatePresence>
              </div>
            </section>
          )}
        </div>
      )}

      {/* AI Process Dialog */}
      <Dialog
        open={aiDialog.open}
        onOpenChange={(v) => setAiDialog((s) => ({ ...s, open: v }))}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              {t("assistant.clipboard.aiTitle")}
            </DialogTitle>
            <DialogDescription>
              {t("assistant.clipboard.aiDesc")}
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-wrap gap-1.5">
            {([
              { op: "translate" as AIOp, icon: Languages, label: t("assistant.clipboard.opTranslate") },
              { op: "summarize" as AIOp, icon: AlignLeft, label: t("assistant.clipboard.opSummarize") },
              { op: "format" as AIOp, icon: FileText, label: t("assistant.clipboard.opFormat") },
              { op: "grammar" as AIOp, icon: CheckCircle2, label: t("assistant.clipboard.opGrammar") },
            ]).map((b) => {
              const Icon = b.icon;
              return (
                <Button
                  key={b.op}
                  size="sm"
                  variant={aiDialog.op === b.op ? "default" : "outline"}
                  onClick={() => setAiDialog((s) => ({ ...s, op: b.op }))}
                >
                  <Icon className="mr-1.5 h-3.5 w-3.5" />
                  {b.label}
                </Button>
              );
            })}
            {aiDialog.op === "translate" && (
              <Select
                value={aiDialog.target}
                onValueChange={(v) => setAiDialog((s) => ({ ...s, target: v }))}
              >
                <SelectTrigger className="h-8 w-[120px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="en">English</SelectItem>
                  <SelectItem value="ar">العربية</SelectItem>
                  <SelectItem value="fr">Français</SelectItem>
                  <SelectItem value="es">Español</SelectItem>
                  <SelectItem value="de">Deutsch</SelectItem>
                  <SelectItem value="zh">中文</SelectItem>
                  <SelectItem value="ja">日本語</SelectItem>
                </SelectContent>
              </Select>
            )}
          </div>

          {/* Source preview */}
          <div className="rounded-lg border bg-muted/30 p-3">
            <p className="mb-1 text-[10px] uppercase tracking-wider text-muted-foreground">
              {t("assistant.clipboard.source")}
            </p>
            <p className="max-h-24 overflow-auto whitespace-pre-wrap break-words text-xs">
              {aiDialog.item?.preview}
            </p>
          </div>

          {/* Action button */}
          <Button
            onClick={runAIProcess}
            disabled={aiDialog.loading}
            className="gap-2"
          >
            {aiDialog.loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Play className="h-4 w-4" />
            )}
            {aiDialog.loading
              ? t("assistant.clipboard.processing")
              : t("assistant.clipboard.run")}
          </Button>

          {/* Result */}
          {aiDialog.result && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  {t("assistant.clipboard.result")}
                </p>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 gap-1 text-xs"
                  onClick={async () => {
                    await copyToClipboard(aiDialog.result);
                    toast({ title: t("assistant.clipboard.copied") });
                  }}
                >
                  <Copy className="h-3 w-3" />
                  {t("assistant.clipboard.copy")}
                </Button>
              </div>
              <Textarea
                value={aiDialog.result}
                readOnly
                className="min-h-[120px] font-mono text-xs"
              />
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setAiDialog((s) => ({ ...s, open: false }))}>
              {t("common.close")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Single clipboard row
// ---------------------------------------------------------------------------

function ClipboardRow({
  item,
  onCopy,
  onPin,
  onDelete,
  onAI,
}: {
  item: ClipboardItem;
  onCopy: () => void;
  onPin: () => void;
  onDelete: () => void;
  onAI: (op: AIOp) => void;
}) {
  const { t } = useLanguage();
  const meta = CATEGORY_META[item.category] ?? CATEGORY_META.text;
  const Icon = meta.icon;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.97 }}
      transition={{ type: "spring", stiffness: 280, damping: 28 }}
    >
      <Card
        className={cn(
          "group relative overflow-hidden p-3 transition-colors hover:border-primary/40",
          item.pinned && "border-amber-500/40 bg-amber-500/[0.03]",
        )}
      >
        <div className="flex items-start gap-3">
          <div
            className={cn(
              "flex h-9 w-9 shrink-0 items-center justify-center rounded-md border text-[10px] font-semibold",
              meta.color,
            )}
          >
            <Icon className="h-4 w-4" />
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className={cn("border text-[9px] uppercase", meta.color)}>
                {meta.label}
              </Badge>
              {item.kind === "url" && (
                <Badge variant="outline" className="text-[9px]">URL</Badge>
              )}
              {item.kind === "image" && (
                <Badge variant="outline" className="text-[9px]">IMG</Badge>
              )}
              <span className="text-[10px] text-muted-foreground">
                {formatRelativeTime(item.createdAt)} · {formatSize(item.sizeBytes)}
              </span>
            </div>
            <p className="mt-1 line-clamp-2 break-words text-sm">
              {item.kind === "image" ? (
                <img
                  src={item.content}
                  alt="clipboard"
                  className="mt-1 max-h-32 rounded border"
                />
              ) : (
                item.preview
              )}
            </p>
          </div>

          <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
            <TooltipProvider delayDuration={200}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={onCopy}>
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{t("assistant.clipboard.copy")}</TooltipContent>
              </Tooltip>
            </TooltipProvider>

            <TooltipProvider delayDuration={200}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={onPin}>
                    {item.pinned ? (
                      <PinOff className="h-3.5 w-3.5" />
                    ) : (
                      <Pin className="h-3.5 w-3.5" />
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  {item.pinned ? t("assistant.clipboard.unpin") : t("assistant.clipboard.pin")}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>

            <TooltipProvider delayDuration={200}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7"
                    onClick={() => onAI("summarize")}
                  >
                    <Sparkles className="h-3.5 w-3.5 text-primary" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{t("assistant.clipboard.aiTitle")}</TooltipContent>
              </Tooltip>
            </TooltipProvider>

            <TooltipProvider delayDuration={200}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 hover:text-destructive"
                    onClick={onDelete}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{t("common.delete")}</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </div>
      </Card>
    </motion.div>
  );
}
