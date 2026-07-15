"use client";

/**
 * MemoryManager — Settings panel for the AI Memory + Learning feature.
 *
 * Lets the user:
 *   - View all memories (filterable by type, searchable)
 *   - Add a new memory manually (type, content, importance, pinned)
 *   - Edit / delete / pin existing memories
 *   - Trigger a manual extraction from the current chat session
 *   - See a small summary (counts per type)
 *
 * Mounted inside the SettingsDialog (Settings → Memory section).
 */

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Brain,
  Plus,
  Search,
  Trash2,
  Pencil,
  Pin,
  PinOff,
  Loader2,
  Sparkles,
  AlertCircle,
  Filter,
  Wand2,
  X,
  Check,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/components/language-provider";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type MemoryType = "fact" | "preference" | "pattern" | "skill" | "contact";

interface Memory {
  id: string;
  type: MemoryType;
  content: string;
  importance: number;
  source: "manual" | "extracted" | "observed";
  pinned: boolean;
  createdAt: string;
  updatedAt: string;
}

const TYPE_META: Record<MemoryType, { label: string; color: string; icon: string }> = {
  fact: { label: "Fact", color: "bg-sky-500/15 text-sky-600 dark:text-sky-400", icon: "F" },
  preference: { label: "Preference", color: "bg-violet-500/15 text-violet-600 dark:text-violet-400", icon: "P" },
  pattern: { label: "Pattern", color: "bg-amber-500/15 text-amber-600 dark:text-amber-400", icon: "↻" },
  skill: { label: "Skill", color: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400", icon: "★" },
  contact: { label: "Contact", color: "bg-rose-500/15 text-rose-600 dark:text-rose-400", icon: "@" },
};

const TYPE_OPTIONS: MemoryType[] = ["fact", "preference", "pattern", "skill", "contact"];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function MemoryManager() {
  const { t } = useLanguage();
  const { toast } = useToast();

  const [memories, setMemories] = React.useState<Memory[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [query, setQuery] = React.useState("");
  const [typeFilter, setTypeFilter] = React.useState<MemoryType | "all">("all");
  const [showPinnedOnly, setShowPinnedOnly] = React.useState(false);

  const [editing, setEditing] = React.useState<Memory | null>(null);
  const [deleteTarget, setDeleteTarget] = React.useState<Memory | null>(null);
  const [deleting, setDeleting] = React.useState(false);

  const [creating, setCreating] = React.useState(false);
  const [extracting, setExtracting] = React.useState(false);

  // -------------------------------------------------------------------------
  // Load
  // -------------------------------------------------------------------------

  const reload = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/memory", { cache: "no-store" });
      const data = (await res.json().catch(() => ({}))) as { memories?: Memory[] };
      setMemories(data.memories ?? []);
    } catch (err) {
      toast({
        variant: "destructive",
        title: t("memory.loadFailed"),
        description: err instanceof Error ? err.message : "",
      });
      setMemories([]);
    } finally {
      setLoading(false);
    }
  }, [toast, t]);

  React.useEffect(() => {
    void reload();
  }, [reload]);

  // -------------------------------------------------------------------------
  // Mutations
  // -------------------------------------------------------------------------

  const togglePin = React.useCallback(
    async (m: Memory) => {
      // Optimistic update.
      setMemories((prev) =>
        prev.map((x) => (x.id === m.id ? { ...x, pinned: !x.pinned } : x)),
      );
      try {
        const res = await fetch(`/api/memory/${m.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pinned: !m.pinned }),
        });
        if (!res.ok) throw new Error("Failed to update memory.");
      } catch (err) {
        // Revert on failure.
        setMemories((prev) =>
          prev.map((x) => (x.id === m.id ? { ...x, pinned: m.pinned } : x)),
        );
        toast({
          variant: "destructive",
          title: t("memory.updateFailed"),
          description: err instanceof Error ? err.message : "",
        });
      }
    },
    [toast, t],
  );

  const confirmDelete = React.useCallback(async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/memory/${deleteTarget.id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to delete memory.");
      setMemories((prev) => prev.filter((x) => x.id !== deleteTarget.id));
      toast({ title: t("memory.deleted") });
    } catch (err) {
      toast({
        variant: "destructive",
        title: t("memory.deleteFailed"),
        description: err instanceof Error ? err.message : "",
      });
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
    }
  }, [deleteTarget, toast, t]);

  const handleExtract = React.useCallback(async () => {
    setExtracting(true);
    try {
      const res = await fetch("/api/memory/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session: "default" }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        created?: number;
        facts?: { type: string; content: string }[];
        error?: string;
      };
      if (!res.ok) throw new Error(data.error || "Extraction failed.");
      const created = data.created ?? 0;
      toast({
        title: t("memory.extractDone"),
        description:
          created > 0
            ? t("memory.extractCreated").replace("{n}", String(created))
            : t("memory.extractNone"),
      });
      if (created > 0) void reload();
    } catch (err) {
      toast({
        variant: "destructive",
        title: t("memory.extractFailed"),
        description: err instanceof Error ? err.message : "",
      });
    } finally {
      setExtracting(false);
    }
  }, [toast, t, reload]);

  // -------------------------------------------------------------------------
  // Derived
  // -------------------------------------------------------------------------

  const counts = React.useMemo(() => {
    const c: Record<string, number> = {
      fact: 0,
      preference: 0,
      pattern: 0,
      skill: 0,
      contact: 0,
    };
    for (const m of memories) c[m.type] = (c[m.type] ?? 0) + 1;
    return c;
  }, [memories]);

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    return memories.filter((m) => {
      if (showPinnedOnly && !m.pinned) return false;
      if (typeFilter !== "all" && m.type !== typeFilter) return false;
      if (q && !m.content.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [memories, query, typeFilter, showPinnedOnly]);

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <div className="space-y-4">
      {/* Header + actions */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          <Brain className="h-3.5 w-3.5" />
          {t("memory.title")}
          <Badge variant="outline" className="ml-1 px-1.5 text-[10px] font-normal">
            {memories.length}
          </Badge>
        </div>
        <div className="flex items-center gap-1.5">
          <TooltipProvider delayDuration={200}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleExtract}
                  disabled={extracting}
                  className="gap-1.5"
                >
                  {extracting ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Wand2 className="h-3.5 w-3.5" />
                  )}
                  <span className="hidden sm:inline">
                    {t("memory.extract")}
                  </span>
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t("memory.extractTooltip")}</TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <Button
            size="sm"
            onClick={() => setCreating(true)}
            className="gap-1.5"
          >
            <Plus className="h-3.5 w-3.5" />
            {t("memory.add")}
          </Button>
        </div>
      </div>

      {/* Type counts */}
      <div className="flex flex-wrap gap-1.5">
        {TYPE_OPTIONS.map((type) => (
          <Badge
            key={type}
            variant="outline"
            className={cn("gap-1 px-2 py-0.5 text-[10px]", TYPE_META[type].color)}
          >
            <span className="font-mono">{TYPE_META[type].icon}</span>
            {t(`memory.types.${type}`)}
            <span className="ml-1 tabular-nums opacity-70">{counts[type] ?? 0}</span>
          </Badge>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("memory.searchPlaceholder")}
            className="h-8 pl-8 text-xs"
          />
        </div>
        <Select
          value={typeFilter}
          onValueChange={(v) => setTypeFilter(v as MemoryType | "all")}
        >
          <SelectTrigger className="h-8 w-[140px] text-xs">
            <Filter className="mr-1.5 h-3 w-3" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("memory.allTypes")}</SelectItem>
            {TYPE_OPTIONS.map((type) => (
              <SelectItem key={type} value={type}>
                {t(`memory.types.${type}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px]">
          <Pin className="h-3 w-3 text-primary" />
          <span className="text-muted-foreground">{t("memory.pinnedOnly")}</span>
          <Switch
            checked={showPinnedOnly}
            onCheckedChange={setShowPinnedOnly}
            className="scale-75"
            aria-label={t("memory.pinnedOnly")}
          />
        </div>
      </div>

      {/* List */}
      <div className="max-h-[320px] space-y-1.5 overflow-y-auto scrollbar-thin pr-1">
        {loading ? (
          <div className="flex h-24 items-center justify-center text-xs text-muted-foreground">
            <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
            {t("common.loading")}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex h-24 flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed text-center text-xs text-muted-foreground">
            <AlertCircle className="h-4 w-4" />
            <p>{memories.length === 0 ? t("memory.empty") : t("memory.noMatches")}</p>
          </div>
        ) : (
          <AnimatePresence initial={false}>
            {filtered.map((m) => (
              <MemoryRow
                key={m.id}
                memory={m}
                onTogglePin={() => togglePin(m)}
                onEdit={() => setEditing(m)}
                onDelete={() => setDeleteTarget(m)}
              />
            ))}
          </AnimatePresence>
        )}
      </div>

      {/* Privacy note */}
      <p className="flex items-start gap-1.5 text-[10px] leading-relaxed text-muted-foreground">
        <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" />
        {t("memory.privacyNote")}
      </p>

      {/* Create dialog */}
      <CreateMemoryDialog
        open={creating}
        onOpenChange={setCreating}
        onCreated={() => {
          setCreating(false);
          void reload();
        }}
      />

      {/* Edit dialog */}
      <EditMemoryDialog
        memory={editing}
        onOpenChange={(open) => !open && setEditing(null)}
        onSaved={() => {
          setEditing(null);
          void reload();
        }}
      />

      {/* Delete confirm */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("memory.deleteTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("memory.deleteBody")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {deleteTarget && (
            <div className="rounded-md border bg-muted/40 p-2.5 text-xs">
              <Badge
                variant="outline"
                className={cn("mr-2 px-1.5 py-0 text-[10px]", TYPE_META[deleteTarget.type].color)}
              >
                {t(`memory.types.${deleteTarget.type}`)}
              </Badge>
              {deleteTarget.content}
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void confirmDelete();
              }}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? (
                <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Trash2 className="mr-1 h-3.5 w-3.5" />
              )}
              {t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ---------------------------------------------------------------------------
// MemoryRow
// ---------------------------------------------------------------------------

function MemoryRow({
  memory,
  onTogglePin,
  onEdit,
  onDelete,
}: {
  memory: Memory;
  onTogglePin: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { t } = useLanguage();
  const meta = TYPE_META[memory.type];
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      transition={{ duration: 0.15 }}
      className={cn(
        "group flex items-start gap-2 rounded-md border bg-card/40 px-2.5 py-2 text-xs transition-colors hover:bg-accent/40",
        memory.pinned && "border-primary/40 bg-primary/5",
      )}
    >
      <span
        className={cn(
          "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded font-mono text-[10px] font-bold",
          meta.color,
        )}
        title={t(`memory.types.${memory.type}`)}
      >
        {meta.icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="break-words leading-snug">{memory.content}</p>
        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[10px] text-muted-foreground">
          <span>★ {memory.importance}/10</span>
          <span>·</span>
          <span>{t(`memory.sources.${memory.source}`)}</span>
          {memory.pinned && (
            <>
              <span>·</span>
              <span className="font-medium text-primary">{t("memory.pinned")}</span>
            </>
          )}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
        <TooltipProvider delayDuration={200}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="sm"
                variant="ghost"
                className="h-6 w-6 p-0"
                onClick={onTogglePin}
                aria-label={memory.pinned ? t("memory.unpin") : t("memory.pin")}
              >
                {memory.pinned ? (
                  <PinOff className="h-3 w-3" />
                ) : (
                  <Pin className="h-3 w-3" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent>{memory.pinned ? t("memory.unpin") : t("memory.pin")}</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="sm"
                variant="ghost"
                className="h-6 w-6 p-0"
                onClick={onEdit}
                aria-label={t("common.edit")}
              >
                <Pencil className="h-3 w-3" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t("common.edit")}</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="sm"
                variant="ghost"
                className="h-6 w-6 p-0 text-destructive hover:text-destructive"
                onClick={onDelete}
                aria-label={t("common.delete")}
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t("common.delete")}</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// CreateMemoryDialog
// ---------------------------------------------------------------------------

function CreateMemoryDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated: () => void;
}) {
  const { t } = useLanguage();
  const { toast } = useToast();
  const [type, setType] = React.useState<MemoryType>("fact");
  const [content, setContent] = React.useState("");
  const [importance, setImportance] = React.useState(5);
  const [pinned, setPinned] = React.useState(false);
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      setType("fact");
      setContent("");
      setImportance(5);
      setPinned(false);
    }
  }, [open]);

  const handleSubmit = async () => {
    const trimmed = content.trim();
    if (!trimmed) {
      toast({ variant: "destructive", title: t("memory.contentRequired") });
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/memory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, content: trimmed, importance, pinned }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Failed to create memory.");
      toast({ title: t("memory.created") });
      onCreated();
    } catch (err) {
      toast({
        variant: "destructive",
        title: t("memory.createFailed"),
        description: err instanceof Error ? err.message : "",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <MemoryDialogShell
      open={open}
      onOpenChange={onOpenChange}
      title={t("memory.addTitle")}
      description={t("memory.addDesc")}
      submitLabel={t("common.save")}
      onSubmit={handleSubmit}
      saving={saving}
    >
      <div className="space-y-3">
        <div className="space-y-1.5">
          <Label className="text-xs">{t("memory.typeLabel")}</Label>
          <Select value={type} onValueChange={(v) => setType(v as MemoryType)}>
            <SelectTrigger className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TYPE_OPTIONS.map((ty) => (
                <SelectItem key={ty} value={ty}>
                  <span className="flex items-center gap-2">
                    <span className={cn("font-mono text-[10px] font-bold", TYPE_META[ty].color)}>
                      {TYPE_META[ty].icon}
                    </span>
                    {t(`memory.types.${ty}`)}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">{t("memory.contentLabel")}</Label>
          <Textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder={t("memory.contentPlaceholder")}
            rows={3}
            maxLength={500}
            className="resize-none text-sm"
          />
          <p className="text-right text-[10px] text-muted-foreground tabular-nums">
            {content.length}/500
          </p>
        </div>
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label className="text-xs">{t("memory.importanceLabel")}</Label>
            <Badge variant="outline" className="tabular-nums text-[10px]">
              {importance}/10
            </Badge>
          </div>
          <Slider
            value={[importance]}
            min={0}
            max={10}
            step={1}
            onValueChange={(v) => {
              const n = v[0];
              if (typeof n === "number") setImportance(n);
            }}
          />
        </div>
        <div className="flex items-center justify-between rounded-md border px-3 py-2">
          <div>
            <Label className="text-xs">{t("memory.pinLabel")}</Label>
            <p className="text-[10px] text-muted-foreground">{t("memory.pinDesc")}</p>
          </div>
          <Switch checked={pinned} onCheckedChange={setPinned} />
        </div>
      </div>
    </MemoryDialogShell>
  );
}

// ---------------------------------------------------------------------------
// EditMemoryDialog
// ---------------------------------------------------------------------------

function EditMemoryDialog({
  memory,
  onOpenChange,
  onSaved,
}: {
  memory: Memory | null;
  onOpenChange: (v: boolean) => void;
  onSaved: () => void;
}) {
  const { t } = useLanguage();
  const { toast } = useToast();
  const [type, setType] = React.useState<MemoryType>("fact");
  const [content, setContent] = React.useState("");
  const [importance, setImportance] = React.useState(5);
  const [pinned, setPinned] = React.useState(false);
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (memory) {
      setType(memory.type);
      setContent(memory.content);
      setImportance(memory.importance);
      setPinned(memory.pinned);
    }
  }, [memory]);

  const handleSubmit = async () => {
    if (!memory) return;
    const trimmed = content.trim();
    if (!trimmed) {
      toast({ variant: "destructive", title: t("memory.contentRequired") });
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/memory/${memory.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, content: trimmed, importance, pinned }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Failed to update memory.");
      toast({ title: t("memory.updated") });
      onSaved();
    } catch (err) {
      toast({
        variant: "destructive",
        title: t("memory.updateFailed"),
        description: err instanceof Error ? err.message : "",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <MemoryDialogShell
      open={!!memory}
      onOpenChange={onOpenChange}
      title={t("memory.editTitle")}
      description={t("memory.editDesc")}
      submitLabel={t("common.save")}
      onSubmit={handleSubmit}
      saving={saving}
    >
      <div className="space-y-3">
        <div className="space-y-1.5">
          <Label className="text-xs">{t("memory.typeLabel")}</Label>
          <Select value={type} onValueChange={(v) => setType(v as MemoryType)}>
            <SelectTrigger className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TYPE_OPTIONS.map((ty) => (
                <SelectItem key={ty} value={ty}>
                  {t(`memory.types.${ty}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">{t("memory.contentLabel")}</Label>
          <Textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={3}
            maxLength={500}
            className="resize-none text-sm"
          />
          <p className="text-right text-[10px] text-muted-foreground tabular-nums">
            {content.length}/500
          </p>
        </div>
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label className="text-xs">{t("memory.importanceLabel")}</Label>
            <Badge variant="outline" className="tabular-nums text-[10px]">
              {importance}/10
            </Badge>
          </div>
          <Slider
            value={[importance]}
            min={0}
            max={10}
            step={1}
            onValueChange={(v) => {
              const n = v[0];
              if (typeof n === "number") setImportance(n);
            }}
          />
        </div>
        <div className="flex items-center justify-between rounded-md border px-3 py-2">
          <Label className="text-xs">{t("memory.pinLabel")}</Label>
          <Switch checked={pinned} onCheckedChange={setPinned} />
        </div>
      </div>
    </MemoryDialogShell>
  );
}

// ---------------------------------------------------------------------------
// Shared dialog shell
// ---------------------------------------------------------------------------

function MemoryDialogShell({
  open,
  onOpenChange,
  title,
  description,
  submitLabel,
  onSubmit,
  saving,
  children,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  description: string;
  submitLabel: string;
  onSubmit: () => void;
  saving: boolean;
  children: React.ReactNode;
}) {
  const { t } = useLanguage();
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="sm:max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            {title}
          </AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <div className="max-h-[60vh] overflow-y-auto scrollbar-thin pr-1">
          {children}
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={saving}>
            {t("common.cancel")}
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault();
              onSubmit();
            }}
            disabled={saving}
          >
            {saving ? (
              <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Check className="mr-1 h-3.5 w-3.5" />
            )}
            {submitLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
