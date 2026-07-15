/**
 * Plugin: Quick Notes
 * ====================
 *
 * A minimal, dependency-free notes plugin. Stores notes in localStorage only
 * (no AI, no server calls). Demonstrates how a non-AI plugin works and how a
 * plugin can persist its own data client-side.
 *
 * Demonstrates:
 *   • A plugin with zero server-side footprint.
 *   • localStorage persistence with a stable migration-friendly key.
 *   • Standard shadcn/ui controls (Input, Button, Card, ScrollArea).
 */

"use client";

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  StickyNote,
  Plus,
  Trash2,
  Pin,
  PinOff,
  Search,
  Inbox,
  Loader2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface Note {
  id: string;
  title: string;
  body: string;
  color: string;
  pinned: boolean;
  createdAt: number;
  updatedAt: number;
}

const STORAGE_KEY = "devforge-plugin-quick-notes-v1";

// NOTE: Tailwind purges dynamic class names at build time, so every colour
// class we use must appear here as a *literal* string. The `cls` (card) and
// `dotCls` (picker dot) fields together ensure all needed utilities survive
// the purge.
const NOTE_COLORS = [
  { value: "amber", label: "Amber", cls: "bg-amber-500/10 border-amber-500/30", dotCls: "bg-amber-500" },
  { value: "emerald", label: "Emerald", cls: "bg-emerald-500/10 border-emerald-500/30", dotCls: "bg-emerald-500" },
  { value: "sky", label: "Sky", cls: "bg-sky-500/10 border-sky-500/30", dotCls: "bg-sky-500" },
  { value: "fuchsia", label: "Fuchsia", cls: "bg-fuchsia-500/10 border-fuchsia-500/30", dotCls: "bg-fuchsia-500" },
  { value: "violet", label: "Violet", cls: "bg-violet-500/10 border-violet-500/30", dotCls: "bg-violet-500" },
  { value: "rose", label: "Rose", cls: "bg-rose-500/10 border-rose-500/30", dotCls: "bg-rose-500" },
  { value: "zinc", label: "Neutral", cls: "bg-zinc-500/10 border-zinc-500/30", dotCls: "bg-zinc-500" },
] as const;

const COLOR_CLS: Record<string, string> = Object.fromEntries(
  NOTE_COLORS.map((c) => [c.value, c.cls]),
);

function loadNotes(): Note[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Note[];
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch {
    return [];
  }
}

function saveNotes(notes: Note[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(notes));
  } catch {
    /* quota / privacy mode — ignore */
  }
}

function newId(): string {
  return `n_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  const today = new Date();
  if (d.toDateString() === today.toDateString()) {
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

export default function QuickNotesPlugin() {
  const { toast } = useToast();
  const [notes, setNotes] = React.useState<Note[]>([]);
  const [hydrated, setHydrated] = React.useState(false);
  const [search, setSearch] = React.useState("");
  const [draftTitle, setDraftTitle] = React.useState("");
  const [draftBody, setDraftBody] = React.useState("");
  const [draftColor, setDraftColor] = React.useState<string>("amber");

  // Hydrate from localStorage on mount.
  React.useEffect(() => {
    setNotes(loadNotes());
    setHydrated(true);
  }, []);

  // Persist on every change (after hydration to avoid wiping).
  React.useEffect(() => {
    if (!hydrated) return;
    saveNotes(notes);
  }, [notes, hydrated]);

  const onAdd = () => {
    const title = draftTitle.trim();
    const body = draftBody.trim();
    if (!title && !body) {
      toast({
        title: "Empty note",
        description: "Add a title or body first.",
        variant: "destructive",
      });
      return;
    }
    const now = Date.now();
    const note: Note = {
      id: newId(),
      title: title || "Untitled",
      body,
      color: draftColor,
      pinned: false,
      createdAt: now,
      updatedAt: now,
    };
    setNotes((prev) => [note, ...prev]);
    setDraftTitle("");
    setDraftBody("");
    setDraftColor("amber");
    toast({ title: "Note added", description: note.title });
  };

  const onDelete = (id: string) => {
    setNotes((prev) => prev.filter((n) => n.id !== id));
  };

  const onTogglePin = (id: string) => {
    setNotes((prev) =>
      prev.map((n) => (n.id === id ? { ...n, pinned: !n.pinned } : n)),
    );
  };

  const filtered = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    const matches = q
      ? notes.filter(
          (n) =>
            n.title.toLowerCase().includes(q) ||
            n.body.toLowerCase().includes(q),
        )
      : notes;
    // Pinned first, then by updatedAt desc.
    return [...matches].sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      return b.updatedAt - a.updatedAt;
    });
  }, [notes, search]);

  const stats = React.useMemo(() => {
    const pinned = notes.filter((n) => n.pinned).length;
    return { total: notes.length, pinned };
  }, [notes]);

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 py-2">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <StickyNote className="h-5 w-5 text-primary" />
            Quick Notes
            <Badge
              variant="outline"
              className="ml-1 border-primary/30 bg-primary/5 text-[10px] text-primary"
            >
              {stats.total} {stats.total === 1 ? "note" : "notes"}
              {stats.pinned > 0 && ` · ${stats.pinned} pinned`}
            </Badge>
          </CardTitle>
          <CardDescription>
            Lightweight notes saved to your browser. No AI, no server — fully
            private. Notes persist across sessions on this device.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* New note composer */}
          <div className="rounded-lg border bg-muted/20 p-3 space-y-2">
            <Input
              value={draftTitle}
              onChange={(e) => setDraftTitle(e.target.value)}
              placeholder="Note title…"
              className="font-medium"
            />
            <Textarea
              value={draftBody}
              onChange={(e) => setDraftBody(e.target.value)}
              placeholder="Write anything…"
              className="min-h-[80px] resize-y text-sm"
            />
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1">
                {NOTE_COLORS.map((c) => (
                  <button
                    key={c.value}
                    onClick={() => setDraftColor(c.value)}
                    className={cn(
                      "h-5 w-5 rounded-full border-2 transition-transform hover:scale-110",
                      c.dotCls,
                      draftColor === c.value
                        ? "ring-2 ring-primary ring-offset-1 ring-offset-background"
                        : "border-transparent",
                    )}
                    aria-label={c.label}
                    title={c.label}
                  />
                ))}
              </div>
              <Button onClick={onAdd} size="sm" className="ml-auto gap-1">
                <Plus className="h-3.5 w-3.5" />
                Add note
              </Button>
            </div>
          </div>

          {/* Search + Notes grid */}
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search notes…"
              className="pl-9"
            />
          </div>

          {hydrated ? (
            filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 py-12 text-center text-sm text-muted-foreground">
                <Inbox className="h-8 w-8 opacity-40" />
                {search
                  ? "No notes match your search."
                  : "No notes yet. Create your first one above."}
              </div>
            ) : (
              <ScrollArea className="h-[460px] rounded-md">
                <div className="grid grid-cols-1 gap-3 p-1 sm:grid-cols-2 lg:grid-cols-3">
                  <AnimatePresence initial={false}>
                    {filtered.map((note) => (
                      <motion.div
                        key={note.id}
                        layout
                        initial={{ opacity: 0, scale: 0.96 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.96 }}
                        transition={{ duration: 0.15 }}
                        className={cn(
                          "group relative flex flex-col gap-1.5 rounded-lg border p-3",
                          COLOR_CLS[note.color] ?? COLOR_CLS.zinc,
                        )}
                      >
                        <div className="flex items-start gap-2">
                          <h4 className="flex-1 text-sm font-semibold leading-tight">
                            {note.title}
                          </h4>
                          <button
                            onClick={() => onTogglePin(note.id)}
                            className="shrink-0 rounded p-0.5 text-muted-foreground transition-colors hover:text-primary"
                            aria-label={note.pinned ? "Unpin" : "Pin"}
                            title={note.pinned ? "Unpin" : "Pin to top"}
                          >
                            {note.pinned ? (
                              <Pin className="h-3.5 w-3.5 fill-current text-primary" />
                            ) : (
                              <PinOff className="h-3.5 w-3.5" />
                            )}
                          </button>
                        </div>
                        {note.body && (
                          <p className="whitespace-pre-wrap break-words text-xs leading-relaxed text-muted-foreground">
                            {note.body}
                          </p>
                        )}
                        <div className="mt-1 flex items-center justify-between text-[10px] text-muted-foreground/80">
                          <span>{formatTime(note.updatedAt)}</span>
                          <button
                            onClick={() => onDelete(note.id)}
                            className="rounded p-1 opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
                            aria-label="Delete note"
                            title="Delete"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              </ScrollArea>
            )
          ) : (
            <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading notes…
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
