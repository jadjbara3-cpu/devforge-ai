"use client";

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import {
  Plus,
  Search,
  Star,
  Pencil,
  Copy,
  Trash2,
  Loader2,
  Code2,
  Check,
  FileCode2,
  Filter,
  Inbox,
  Download,
  Upload,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
} from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Types & constants
// ---------------------------------------------------------------------------

interface Snippet {
  id: string;
  title: string;
  language: string;
  code: string;
  description: string | null;
  tags: string | null;
  favorite: boolean;
  createdAt: string;
  updatedAt: string;
}

const LANGUAGES = [
  "text",
  "javascript",
  "typescript",
  "jsx",
  "tsx",
  "python",
  "bash",
  "sql",
  "json",
  "css",
  "html",
  "go",
  "rust",
  "java",
] as const;

const PREVIEW_LINES = 6;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseTags(tags: string | null): string[] {
  if (!tags) return [];
  return tags
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
}

function previewLines(code: string, max: number): string {
  const lines = code.split("\n");
  return lines.slice(0, max).join("\n");
}

// ---------------------------------------------------------------------------
// Shared code block (syntax highlighted)
// ---------------------------------------------------------------------------

interface CodeBlockProps {
  code: string;
  language: string;
  preview?: boolean;
  className?: string;
}

function CodeBlock({ code, language, preview, className }: CodeBlockProps) {
  const shown = preview ? previewLines(code, PREVIEW_LINES) : code;
  const truncated =
    preview && code.split("\n").length > PREVIEW_LINES;

  return (
    <div
      className={cn(
        "group/code overflow-hidden rounded-lg border border-border/60 bg-[#282c34]",
        className,
      )}
    >
      <div className="flex items-center justify-between border-b border-white/5 bg-black/20 px-3 py-1.5">
        <div className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-full bg-red-400/80" />
          <span className="size-2.5 rounded-full bg-amber-400/80" />
          <span className="size-2.5 rounded-full bg-emerald-400/80" />
        </div>
        <span className="font-mono text-[11px] uppercase tracking-wide text-zinc-400">
          {language}
        </span>
      </div>
      <div
        className={cn(
          "relative",
          preview ? "max-h-[10.5rem] overflow-hidden" : "max-h-[280px] overflow-auto",
        )}
      >
        <SyntaxHighlighter
          language={language}
          style={oneDark}
          customStyle={{
            margin: 0,
            background: "transparent",
            padding: "0.75rem 1rem",
            fontSize: "0.8125rem",
            lineHeight: 1.55,
          }}
          codeTagProps={{
            style: {
              fontFamily:
                "var(--font-geist-mono), ui-monospace, SFMono-Regular, monospace",
            },
          }}
          wrapLongLines={!preview}
        >
          {shown}
        </SyntaxHighlighter>
        {truncated && (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-[#282c34] via-[#282c34]/70 to-transparent" />
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Snippet card
// ---------------------------------------------------------------------------

interface SnippetCardProps {
  snippet: Snippet;
  onEdit: () => void;
  onCopy: () => void;
  onDelete: () => void;
  onToggleFavorite: () => void;
}

function SnippetCard({
  snippet,
  onEdit,
  onCopy,
  onDelete,
  onToggleFavorite,
}: SnippetCardProps) {
  const tags = parseTags(snippet.tags);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ type: "spring", stiffness: 280, damping: 28 }}
      className="h-full"
    >
      <Card className="group relative flex h-full flex-col gap-0 overflow-hidden py-0 transition-colors hover:border-primary/40">
        <CardHeader className="gap-2 px-4 pb-3 pt-4">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <h3 className="truncate text-base font-semibold leading-tight">
                {snippet.title}
              </h3>
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                <Badge
                  variant="secondary"
                  className="font-mono text-[11px] lowercase"
                >
                  {snippet.language}
                </Badge>
                {tags.map((t) => (
                  <Badge key={t} variant="outline" className="text-[11px]">
                    {t}
                  </Badge>
                ))}
              </div>
            </div>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8 shrink-0"
                  onClick={onToggleFavorite}
                  aria-label={
                    snippet.favorite ? "Remove from favorites" : "Add to favorites"
                  }
                >
                  <Star
                    className={cn(
                      "size-4 transition-colors",
                      snippet.favorite
                        ? "fill-amber-400 text-amber-400"
                        : "text-muted-foreground",
                    )}
                  />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                {snippet.favorite ? "Remove from favorites" : "Add to favorites"}
              </TooltipContent>
            </Tooltip>
          </div>
          {snippet.description && (
            <p className="line-clamp-2 text-sm text-muted-foreground">
              {snippet.description}
            </p>
          )}
        </CardHeader>

        <CardContent className="px-4 pb-3">
          <CodeBlock
            code={snippet.code}
            language={snippet.language}
            preview
          />
        </CardContent>

        <div className="mt-auto flex items-center justify-between gap-1 border-t border-border/60 bg-muted/20 px-4 py-2.5">
          <span className="text-[11px] text-muted-foreground">
            {snippet.code.split("\n").length}{" "}
            {snippet.code.split("\n").length === 1 ? "line" : "lines"}
          </span>
          <div className="flex items-center gap-1 opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100 md:focus-within:opacity-100">
            <Button variant="ghost" size="sm" onClick={onEdit} className="h-8 gap-1.5">
              <Pencil className="size-3.5" />
              Edit
            </Button>
            <Button variant="ghost" size="sm" onClick={onCopy} className="h-8 gap-1.5">
              <Copy className="size-3.5" />
              Copy
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={onDelete}
              className="h-8 gap-1.5 text-destructive hover:bg-destructive/10 hover:text-destructive"
            >
              <Trash2 className="size-3.5" />
              Delete
            </Button>
          </div>
        </div>
      </Card>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Create / edit dialog
// ---------------------------------------------------------------------------

interface SnippetFormDialogProps {
  open: boolean;
  initial: Snippet | null;
  onOpenChange: (open: boolean) => void;
  onSaved: (snippet: Snippet, mode: "create" | "update") => void;
}

function SnippetFormDialog({
  open,
  initial,
  onOpenChange,
  onSaved,
}: SnippetFormDialogProps) {
  const { toast } = useToast();
  const isEdit = initial !== null;

  const [title, setTitle] = React.useState("");
  const [language, setLanguage] = React.useState<string>("text");
  const [code, setCode] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [tags, setTags] = React.useState("");
  const [favorite, setFavorite] = React.useState(false);
  const [saving, setSaving] = React.useState(false);

  // Reset the form whenever the dialog opens.
  React.useEffect(() => {
    if (!open) return;
    setTitle(initial?.title ?? "");
    setLanguage(initial?.language ?? "text");
    setCode(initial?.code ?? "");
    setDescription(initial?.description ?? "");
    setTags(initial?.tags ?? "");
    setFavorite(initial?.favorite ?? false);
  }, [open, initial]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !code.trim()) {
      toast({
        title: "Missing fields",
        description: "Title and code are required.",
        variant: "destructive",
      });
      return;
    }
    setSaving(true);
    try {
      const payload = {
        title: title.trim(),
        language,
        code,
        description: description.trim() || undefined,
        tags: tags.trim() || undefined,
        favorite,
      };
      const url = isEdit ? `/api/snippets/${initial!.id}` : "/api/snippets";
      const method = isEdit ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as
          | { error?: string }
          | null;
        throw new Error(data?.error ?? `Request failed (${res.status})`);
      }
      const data = (await res.json()) as { snippet: Snippet };
      toast({
        title: isEdit ? "Snippet updated" : "Snippet created",
        description: `“${data.snippet.title}” saved successfully.`,
      });
      onSaved(data.snippet, isEdit ? "update" : "create");
      onOpenChange(false);
    } catch (err) {
      toast({
        title: "Save failed",
        description: err instanceof Error ? err.message : "Unexpected error.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Code2 className="size-5 text-primary" />
            {isEdit ? "Edit snippet" : "New snippet"}
          </DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Update the details of your snippet."
              : "Save a reusable code snippet to your vault."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="snip-title">Title</Label>
            <Input
              id="snip-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. useDebounce hook"
              maxLength={120}
              autoFocus
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="snip-lang">Language</Label>
              <Select value={language} onValueChange={setLanguage}>
                <SelectTrigger id="snip-lang" className="w-full">
                  <SelectValue placeholder="Select language" />
                </SelectTrigger>
                <SelectContent>
                  {LANGUAGES.map((l) => (
                    <SelectItem key={l} value={l} className="font-mono lowercase">
                      {l}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="snip-tags">Tags (comma separated)</Label>
              <Input
                id="snip-tags"
                value={tags}
                onChange={(e) => setTags(e.target.value)}
                placeholder="react, hooks, util"
              />
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="snip-desc">Description</Label>
            <Input
              id="snip-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Short summary of what this snippet does"
              maxLength={240}
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="snip-code">Code</Label>
            <Textarea
              id="snip-code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="Paste your code here…"
              spellCheck={false}
              className="min-h-[200px] resize-y font-mono text-[13px] leading-relaxed"
            />
            {code.trim().length > 0 && (
              <div className="grid gap-1">
                <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <FileCode2 className="size-3.5" />
                  Live preview
                </span>
                <CodeBlock code={code} language={language} />
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            <Checkbox
              id="snip-fav"
              checked={favorite}
              onCheckedChange={(v) => setFavorite(v === true)}
            />
            <Label htmlFor="snip-fav" className="cursor-pointer select-none">
              Mark as favorite
            </Label>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Saving…
                </>
              ) : (
                <>
                  <Check className="size-4" />
                  {isEdit ? "Save changes" : "Create snippet"}
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

function EmptyState({
  hasSnippets,
  onReset,
  onCreate,
}: {
  hasSnippets: boolean;
  onReset: () => void;
  onCreate: () => void;
}) {
  return (
    <Card className="flex flex-col items-center justify-center gap-3 border-dashed py-16 text-center">
      <div className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <Inbox className="size-6" />
      </div>
      <div className="space-y-1">
        <p className="font-medium">
          {hasSnippets ? "No snippets match your filters" : "Your vault is empty"}
        </p>
        <p className="text-sm text-muted-foreground">
          {hasSnippets
            ? "Try adjusting your search or filters."
            : "Create your first snippet to get started."}
        </p>
      </div>
      {hasSnippets ? (
        <Button variant="outline" size="sm" onClick={onReset}>
          Clear filters
        </Button>
      ) : (
        <Button size="sm" onClick={onCreate}>
          <Plus className="size-4" />
          New snippet
        </Button>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function SnippetVault() {
  const { toast } = useToast();

  const [snippets, setSnippets] = React.useState<Snippet[]>([]);
  const [loading, setLoading] = React.useState(true);

  const [search, setSearch] = React.useState("");
  const [languageFilter, setLanguageFilter] = React.useState<string>("all");
  const [favoritesOnly, setFavoritesOnly] = React.useState(false);

  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Snippet | null>(null);

  const [deleteTarget, setDeleteTarget] = React.useState<Snippet | null>(null);
  const [deleting, setDeleting] = React.useState(false);
  const [importing, setImporting] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const loadSnippets = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/snippets", { cache: "no-store" });
      if (!res.ok) throw new Error("Failed to load snippets");
      const data = (await res.json()) as { snippets?: Snippet[] };
      setSnippets(data.snippets ?? []);
    } catch (err) {
      toast({
        title: "Load failed",
        description: err instanceof Error ? err.message : "Unexpected error.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  React.useEffect(() => {
    void loadSnippets();
  }, [loadSnippets]);

  // Export all snippets as a JSON file.
  const handleExport = React.useCallback(() => {
    if (snippets.length === 0) {
      toast({
        title: "Nothing to export",
        description: "You don't have any snippets yet.",
      });
      return;
    }
    const payload = {
      exportedAt: new Date().toISOString(),
      app: "DevForge AI",
      count: snippets.length,
      snippets: snippets.map(({ id, createdAt, updatedAt, ...rest }) => ({
        ...rest,
        // strip internal fields
      })),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `devforge-snippets-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast({
      title: "Exported",
      description: `${snippets.length} snippet${snippets.length === 1 ? "" : "s"} downloaded.`,
    });
  }, [snippets, toast]);

  // Import snippets from a JSON file.
  const handleImport = React.useCallback(
    async (file: File) => {
      setImporting(true);
      try {
        const text = await file.text();
        const parsed = JSON.parse(text) as {
          snippets?: Array<{
            title?: string;
            language?: string;
            code?: string;
            description?: string;
            tags?: string;
            favorite?: boolean;
          }>;
        };
        const incoming = Array.isArray(parsed.snippets) ? parsed.snippets : [];
        if (incoming.length === 0) {
          throw new Error("No snippets found in the file.");
        }
        let ok = 0;
        let fail = 0;
        for (const s of incoming) {
          if (!s.title || !s.code) {
            fail++;
            continue;
          }
          try {
            const res = await fetch("/api/snippets", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                title: s.title,
                code: s.code,
                language: s.language || "text",
                description: s.description || "",
                tags: s.tags || "",
                favorite: !!s.favorite,
              }),
            });
            if (res.ok) ok++;
            else fail++;
          } catch {
            fail++;
          }
        }
        await loadSnippets();
        toast({
          title: "Import complete",
          description: `${ok} imported${fail > 0 ? `, ${fail} skipped` : ""}.`,
        });
      } catch (err) {
        toast({
          title: "Import failed",
          description:
            err instanceof Error
              ? err.message
              : "Invalid JSON file.",
          variant: "destructive",
        });
      } finally {
        setImporting(false);
      }
    },
    [loadSnippets, toast],
  );

  const onFileChange = React.useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const f = e.target.files?.[0];
      if (f) void handleImport(f);
      e.target.value = ""; // reset so same file can be re-imported
    },
    [handleImport],
  );

  const filtered = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    return snippets.filter((s) => {
      if (favoritesOnly && !s.favorite) return false;
      if (languageFilter !== "all" && s.language !== languageFilter) return false;
      if (!q) return true;
      const haystack = [
        s.title,
        s.code,
        s.description ?? "",
        s.tags ?? "",
        s.language,
      ]
        .join("\n")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [snippets, search, languageFilter, favoritesOnly]);

  const favoritesCount = React.useMemo(
    () => snippets.filter((s) => s.favorite).length,
    [snippets],
  );

  function openCreate() {
    setEditing(null);
    setDialogOpen(true);
  }

  function openEdit(snip: Snippet) {
    setEditing(snip);
    setDialogOpen(true);
  }

  function handleSaved(snip: Snippet, mode: "create" | "update") {
    setSnippets((prev) => {
      if (mode === "create") return [snip, ...prev];
      // Keep newest-first ordering intact (updatedAt changed but createdAt
      // did not), so just replace in place.
      return prev.map((p) => (p.id === snip.id ? snip : p));
    });
  }

  async function toggleFavorite(snip: Snippet) {
    const next: Snippet = { ...snip, favorite: !snip.favorite };
    setSnippets((prev) => prev.map((p) => (p.id === snip.id ? next : p)));
    try {
      const res = await fetch(`/api/snippets/${snip.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ favorite: next.favorite }),
      });
      if (!res.ok) throw new Error("Failed to update favorite");
      const data = (await res.json()) as { snippet: Snippet };
      setSnippets((prev) =>
        prev.map((p) => (p.id === snip.id ? data.snippet : p)),
      );
    } catch (err) {
      // Revert on failure.
      setSnippets((prev) => prev.map((p) => (p.id === snip.id ? snip : p)));
      toast({
        title: "Update failed",
        description: err instanceof Error ? err.message : "Unexpected error.",
        variant: "destructive",
      });
    }
  }

  async function copyCode(snip: Snippet) {
    try {
      await navigator.clipboard.writeText(snip.code);
      toast({
        title: "Copied to clipboard",
        description: snip.title,
      });
    } catch {
      toast({
        title: "Copy failed",
        description: "Clipboard is not available in this context.",
        variant: "destructive",
      });
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    const target = deleteTarget;
    setDeleting(true);
    try {
      const res = await fetch(`/api/snippets/${target.id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to delete snippet");
      setSnippets((prev) => prev.filter((p) => p.id !== target.id));
      toast({
        title: "Snippet deleted",
        description: target.title,
      });
      setDeleteTarget(null);
    } catch (err) {
      toast({
        title: "Delete failed",
        description: err instanceof Error ? err.message : "Unexpected error.",
        variant: "destructive",
      });
    } finally {
      setDeleting(false);
    }
  }

  function resetFilters() {
    setSearch("");
    setLanguageFilter("all");
    setFavoritesOnly(false);
  }

  return (
    <section className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Code2 className="size-5" />
          </div>
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">Snippet Vault</h2>
            <p className="text-sm text-muted-foreground">
              Store, search, and reuse your code snippets.
            </p>
          </div>
          <Badge variant="secondary" className="ml-1 self-start">
            {snippets.length} total
            {favoritesCount > 0 && (
              <span className="ml-1 text-amber-400">· {favoritesCount} ★</span>
            )}
          </Badge>
        </div>
        <div className="flex items-center gap-2 self-start sm:self-auto">
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            onChange={onFileChange}
            className="hidden"
          />
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                onClick={() => fileInputRef.current?.click()}
                disabled={importing}
                aria-label="Import snippets"
              >
                {importing ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Upload className="size-4" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent>Import from JSON</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                onClick={handleExport}
                disabled={snippets.length === 0}
                aria-label="Export snippets"
              >
                <Download className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Export all as JSON</TooltipContent>
          </Tooltip>
          <Button onClick={openCreate}>
            <Plus className="size-4" />
            New snippet
          </Button>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search title, code, description, or tags…"
            className="pl-9"
          />
        </div>
        <Select value={languageFilter} onValueChange={setLanguageFilter}>
          <SelectTrigger className="w-full sm:w-[190px]">
            <Filter className="size-4 text-muted-foreground" />
            <SelectValue placeholder="Language" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All languages</SelectItem>
            {LANGUAGES.map((l) => (
              <SelectItem key={l} value={l} className="font-mono lowercase">
                {l}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          variant={favoritesOnly ? "default" : "outline"}
          onClick={() => setFavoritesOnly((v) => !v)}
          className="w-full sm:w-auto"
          aria-pressed={favoritesOnly}
        >
          <Star className={cn("size-4", favoritesOnly && "fill-current")} />
          Favorites
        </Button>
      </div>

      {/* Content */}
      {loading ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-64 w-full rounded-xl" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          hasSnippets={snippets.length > 0}
          onReset={resetFilters}
          onCreate={openCreate}
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          <AnimatePresence mode="popLayout">
            {filtered.map((snip) => (
              <SnippetCard
                key={snip.id}
                snippet={snip}
                onEdit={() => openEdit(snip)}
                onCopy={() => copyCode(snip)}
                onDelete={() => setDeleteTarget(snip)}
                onToggleFavorite={() => toggleFavorite(snip)}
              />
            ))}
          </AnimatePresence>
        </div>
      )}

      <SnippetFormDialog
        open={dialogOpen}
        initial={editing}
        onOpenChange={setDialogOpen}
        onSaved={handleSaved}
      />

      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete snippet?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete{" "}
              <span className="font-medium text-foreground">
                “{deleteTarget?.title}”
              </span>
              . This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void confirmDelete();
              }}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Deleting…
                </>
              ) : (
                <>
                  <Trash2 className="size-4" />
                  Delete
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
