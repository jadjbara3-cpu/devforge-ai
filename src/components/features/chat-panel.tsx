"use client";

import * as React from "react";
import { AnimatePresence, motion } from "framer-motion";
import ReactMarkdown from "react-markdown";
import {
  Bot,
  Code2,
  HelpCircle,
  Loader2,
  Send,
  Sparkles,
  Trash2,
  User as UserIcon,
  Zap,
  Plus,
  MessageSquare,
  ChevronLeft,
  History,
  Copy,
  Check,
  Pencil,
  X,
  Download,
  RotateCcw,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { useLoadingBar } from "@/components/layout/loading-bar";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
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

type Role = "user" | "assistant" | "system";

type ChatMessage = {
  id: string;
  role: Role;
  content: string;
  createdAt: string;
};

interface ChatSession {
  id: string;
  title: string;
  preview: string;
  messageCount: number;
  lastActivity: string;
}

const SESSIONS_STORAGE_KEY = "devforge-chat-sessions-v1";
const ACTIVE_SESSION_KEY = "devforge-chat-active-v1";

const SUGGESTIONS: { icon: React.ElementType; label: string }[] = [
  { icon: Code2, label: "Explain async/await in TypeScript with an example." },
  { icon: Zap, label: "How do I optimize unnecessary React re-renders?" },
  { icon: HelpCircle, label: "What's new in Next.js 16 App Router?" },
];

export function ChatPanel() {
  const { toast } = useToast();
  const { start: startLoading, done: stopLoading } = useLoadingBar();
  const [sessionId, setSessionId] = React.useState<string>("default");
  const [sessions, setSessions] = React.useState<ChatSession[]>([]);
  const [sessionsLoading, setSessionsLoading] = React.useState(true);
  const [showSessions, setShowSessions] = React.useState(false);
  const [deleteSessionTarget, setDeleteSessionTarget] =
    React.useState<string | null>(null);
  const [deletingSession, setDeletingSession] = React.useState(false);
  const [renamingId, setRenamingId] = React.useState<string | null>(null);
  const [renameValue, setRenameValue] = React.useState("");
  const [renaming, setRenaming] = React.useState(false);

  const [messages, setMessages] = React.useState<ChatMessage[]>([]);
  const [input, setInput] = React.useState("");
  const [sending, setSending] = React.useState(false);
  const [historyLoading, setHistoryLoading] = React.useState(true);
  const [clearing, setClearing] = React.useState(false);

  const scrollRef = React.useRef<HTMLDivElement>(null);
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);

  // Load the active session id from localStorage on mount.
  React.useEffect(() => {
    try {
      const saved = localStorage.getItem(ACTIVE_SESSION_KEY);
      if (saved) setSessionId(saved);
    } catch {
      /* ignore */
    }
  }, []);

  // Persist active session id.
  React.useEffect(() => {
    try {
      localStorage.setItem(ACTIVE_SESSION_KEY, sessionId);
    } catch {
      /* ignore */
    }
  }, [sessionId]);

  // Load session list.
  const loadSessions = React.useCallback(async () => {
    setSessionsLoading(true);
    try {
      const res = await fetch("/api/chat/sessions", { cache: "no-store" });
      const data = (await res.json()) as { sessions?: ChatSession[] };
      setSessions(data.sessions ?? []);
    } catch {
      setSessions([]);
    } finally {
      setSessionsLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void loadSessions();
  }, [loadSessions]);

  // Load conversation history when session changes.
  React.useEffect(() => {
    let cancelled = false;
    setHistoryLoading(true);
    setMessages([]);
    (async () => {
      try {
        const res = await fetch(
          `/api/chat/history?session=${encodeURIComponent(sessionId)}`,
          { cache: "no-store" }
        );
        if (!res.ok) throw new Error("Failed to load chat history");
        const data = (await res.json()) as { messages?: ChatMessage[] };
        if (!cancelled && Array.isArray(data.messages)) {
          setMessages(data.messages);
        }
      } catch (err) {
        if (!cancelled) {
          toast({
            title: "Couldn't load chat history",
            description:
              err instanceof Error ? err.message : "Please try again later.",
            variant: "destructive",
          });
        }
      } finally {
        if (!cancelled) setHistoryLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionId, toast]);

  // Auto-scroll to the latest message whenever the list or sending state changes.
  React.useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [messages, sending]);

  const newSession = React.useCallback(() => {
    const id = `s-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    setSessionId(id);
    setMessages([]);
    setHistoryLoading(false);
    setShowSessions(false);
  }, []);

  const switchSession = React.useCallback((id: string) => {
    setSessionId(id);
    setShowSessions(false);
  }, []);

  const deleteSession = React.useCallback(
    async (id: string) => {
      setDeletingSession(true);
      try {
        await fetch(`/api/chat/clear?session=${encodeURIComponent(id)}`, {
          method: "DELETE",
        });
        // Refresh session list
        await loadSessions();
        // If we deleted the active session, switch to default or create new
        if (id === sessionId) {
          setSessionId("default");
        }
        toast({
          title: "Conversation deleted",
          description: "The session has been removed.",
        });
      } catch (err) {
        toast({
          title: "Couldn't delete session",
          description:
            err instanceof Error ? err.message : "Please try again.",
          variant: "destructive",
        });
      } finally {
        setDeletingSession(false);
        setDeleteSessionTarget(null);
      }
    },
    [sessionId, loadSessions, toast]
  );

  const startRename = React.useCallback((s: ChatSession) => {
    setRenamingId(s.id);
    setRenameValue(s.title);
  }, []);

  const cancelRename = React.useCallback(() => {
    setRenamingId(null);
    setRenameValue("");
  }, []);

  const confirmRename = React.useCallback(
    async (oldId: string) => {
      const newName = renameValue.trim();
      if (!newName || newName === oldId) {
        cancelRename();
        return;
      }
      setRenaming(true);
      try {
        const res = await fetch("/api/chat/rename", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ from: oldId, to: newName }),
        });
        if (!res.ok) {
          const data = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(data.error || "Rename failed");
        }
        // If renaming the active session, switch to the new id
        if (oldId === sessionId) {
          setSessionId(newName);
        }
        await loadSessions();
        toast({
          title: "Conversation renamed",
          description: `Now "${newName}".`,
        });
      } catch (err) {
        toast({
          title: "Couldn't rename",
          description:
            err instanceof Error ? err.message : "Please try again.",
          variant: "destructive",
        });
      } finally {
        setRenaming(false);
        cancelRename();
      }
    },
    [renameValue, sessionId, loadSessions, toast, cancelRename]
  );

  const send = React.useCallback(
    async (override?: string) => {
      const content = (override ?? input).trim();
      if (!content || sending) return;

      setInput("");
      if (textareaRef.current) textareaRef.current.style.height = "auto";

      const optimistic: ChatMessage = {
        id: `u-${Date.now()}`,
        role: "user",
        content,
        createdAt: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, optimistic]);
      setSending(true);
      startLoading();

      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: content, session: sessionId }),
        });
        const data = (await res.json().catch(() => ({}))) as {
          reply?: string;
          id?: string;
          error?: string;
        };
        if (!res.ok || !data.reply) {
          throw new Error(data.error || "Failed to get a reply from the model.");
        }
        setMessages((prev) => [
          ...prev,
          {
            id: data.id || `a-${Date.now()}`,
            role: "assistant",
            content: data.reply,
            createdAt: new Date().toISOString(),
          },
        ]);
        // Refresh session list in background (new session may have been created)
        void loadSessions();
      } catch (err) {
        setMessages((prev) => prev.filter((m) => m.id !== optimistic.id));
        toast({
          title: "Chat error",
          description:
            err instanceof Error ? err.message : "Something went wrong.",
          variant: "destructive",
        });
      } finally {
        setSending(false);
        stopLoading();
        requestAnimationFrame(() => textareaRef.current?.focus());
      }
    },
    [input, sending, sessionId, toast, loadSessions, startLoading, stopLoading]
  );

  const clearChat = async () => {
    if (clearing || messages.length === 0) return;
    setClearing(true);
    try {
      const res = await fetch(
        `/api/chat/clear?session=${encodeURIComponent(sessionId)}`,
        { method: "DELETE" }
      );
      if (!res.ok) throw new Error("Failed to clear chat");
      setMessages([]);
      void loadSessions();
      toast({
        title: "Conversation cleared",
        description: "Ready for a fresh start.",
      });
    } catch (err) {
      toast({
        title: "Couldn't clear chat",
        description:
          err instanceof Error ? err.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setClearing(false);
    }
  };

  const exportChat = () => {
    if (messages.length === 0) {
      toast({
        title: "Nothing to export",
        description: "This conversation is empty.",
      });
      return;
    }
    const lines: string[] = [];
    lines.push(`# DevForge AI Conversation`);
    lines.push("");
    lines.push(`> Exported on ${new Date().toLocaleString()}`);
    lines.push(`> Session: \`${sessionId}\``);
    lines.push("");
    lines.push("---");
    lines.push("");
    for (const m of messages) {
      if (m.role === "user") {
        lines.push(`### 🧑 User`);
        lines.push("");
        lines.push(m.content);
        lines.push("");
      } else if (m.role === "assistant") {
        lines.push(`### 🤖 DevForge AI`);
        lines.push("");
        lines.push(m.content);
        lines.push("");
      }
      lines.push("---");
      lines.push("");
    }
    const blob = new Blob([lines.join("\n")], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `devforge-chat-${new Date().toISOString().slice(0, 10)}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast({
      title: "Conversation exported",
      description: `${messages.length} messages downloaded as Markdown.`,
    });
  };

  const [regenerating, setRegenerating] = React.useState(false);

  const regenerateLast = React.useCallback(async () => {
    if (sending || regenerating) return;
    // Find the last user message
    const lastUserIdx = [...messages].reverse().findIndex((m) => m.role === "user");
    if (lastUserIdx === -1) return;
    const lastUser = messages[messages.length - 1 - lastUserIdx];
    if (!lastUser) return;

    // Remove the last assistant message (if it exists after the last user msg)
    setMessages((prev) => {
      const slice = [...prev];
      // Find index of last user message
      const uIdx = slice.findLastIndex((m) => m.role === "user");
      // Remove any assistant messages after it
      while (slice.length - 1 > uIdx) {
        slice.pop();
      }
      return slice;
    });

    setRegenerating(true);
    startLoading();
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: lastUser.content, session: sessionId }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        reply?: string;
        id?: string;
        error?: string;
      };
      if (!res.ok || !data.reply) {
        throw new Error(data.error || "Failed to regenerate response.");
      }
      setMessages((prev) => [
        ...prev,
        {
          id: data.id || `a-${Date.now()}`,
          role: "assistant",
          content: data.reply,
          createdAt: new Date().toISOString(),
        },
      ]);
    } catch (err) {
      toast({
        title: "Regenerate failed",
        description:
          err instanceof Error ? err.message : "Something went wrong.",
        variant: "destructive",
      });
    } finally {
      setRegenerating(false);
      stopLoading();
    }
  }, [messages, sending, regenerating, sessionId, toast, startLoading, stopLoading]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void send();
    }
  };

  const onAutoGrow = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    const el = e.target;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  };

  const isEmpty = messages.length === 0 && !historyLoading;
  const messageCount = messages.length;

  return (
    <div className="flex flex-col gap-4">
      <Card className="overflow-hidden p-0 gap-0 shadow-lg shadow-primary/5">
        {/* Gradient header */}
        <div className="relative flex items-center justify-between gap-3 border-b px-4 py-4 md:px-6 bg-gradient-to-r from-primary/15 via-primary/5 to-transparent">
          <div className="flex min-w-0 items-center gap-3">
            <div className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-primary/15 text-primary ring-1 ring-primary/30">
              <Bot className="h-5 w-5" />
              <span className="absolute -right-0.5 -top-0.5 flex h-3 w-3">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-60" />
                <span className="relative inline-flex h-3 w-3 rounded-full bg-primary" />
              </span>
            </div>
            <div className="min-w-0">
              <h2 className="flex items-center gap-2 text-base font-semibold leading-tight">
                AI Chat
                <Sparkles className="h-3.5 w-3.5 text-primary" />
              </h2>
              <p className="truncate text-xs text-muted-foreground">
                DevForge AI · senior engineer assistant
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Badge variant="secondary" className="hidden sm:inline-flex">
              {messageCount} {messageCount === 1 ? "message" : "messages"}
            </Badge>
            <TooltipProvider delayDuration={200}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={newSession}
                    className="gap-1.5"
                    aria-label="New conversation"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">New</span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Start a new conversation</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      void loadSessions();
                      setShowSessions(true);
                    }}
                    className="gap-1.5"
                    aria-label="Conversation history"
                  >
                    <History className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">History</span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent>View past conversations</TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <TooltipProvider delayDuration={200}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={exportChat}
                    disabled={messageCount === 0}
                    className="gap-1.5"
                    aria-label="Export conversation"
                  >
                    <Download className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">Export</span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Export as Markdown</TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void clearChat()}
              disabled={clearing || messageCount === 0}
              className="gap-1.5"
              aria-label="Clear conversation"
            >
              {clearing ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Trash2 className="h-3.5 w-3.5" />
              )}
              <span className="hidden sm:inline">Clear</span>
            </Button>
          </div>
        </div>

        {/* Messages */}
        <div
          ref={scrollRef}
          className="max-h-[60vh] min-h-[320px] overflow-y-auto scrollbar-thin px-3 py-4 md:px-6"
        >
          {historyLoading ? (
            <div className="flex h-[320px] flex-col items-center justify-center gap-3 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
              <p className="text-sm">Loading conversation…</p>
            </div>
          ) : isEmpty ? (
            <EmptyState
              onPick={(q) => {
                setInput(q);
                requestAnimationFrame(() => textareaRef.current?.focus());
              }}
            />
          ) : (
            <div className="flex flex-col gap-4">
              <AnimatePresence initial={false}>
                {messages.map((m, idx) => {
                  const isLastAssistant =
                    m.role === "assistant" &&
                    idx === messages.length - 1 &&
                    !sending;
                  return (
                    <MessageBubble
                      key={m.id}
                      message={m}
                      isLastAssistant={isLastAssistant}
                      canRegenerate={isLastAssistant && !regenerating && !sending}
                      onRegenerate={() => void regenerateLast()}
                      regenerating={regenerating && isLastAssistant}
                    />
                  );
                })}
              </AnimatePresence>
              {sending && <TypingBubble />}
              {regenerating && !sending && <TypingBubble />}
            </div>
          )}
        </div>

        {/* Input area */}
        <div className="border-t bg-card/50 px-3 py-3 md:px-6 md:py-4">
          <div className="flex items-end gap-2">
            <Textarea
              ref={textareaRef}
              value={input}
              onChange={onAutoGrow}
              onKeyDown={onKeyDown}
              placeholder="Ask DevForge AI anything…  (Enter to send, Shift+Enter for newline)"
              rows={1}
              disabled={sending}
              aria-label="Message input"
              className="min-h-[44px] max-h-[160px] resize-none bg-background"
            />
            <Button
              onClick={() => void send()}
              disabled={!input.trim() || sending}
              size="icon"
              className="h-11 w-11 shrink-0 rounded-lg"
              aria-label="Send message"
            >
              {sending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground/70">
            Powered by Z.ai LLM. Conversations are saved to your local SQLite database.
          </p>
        </div>
      </Card>

      {/* Sessions history drawer */}
      <AnimatePresence>
        {showSessions && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm"
            onClick={() => setShowSessions(false)}
          >
            <motion.div
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", stiffness: 320, damping: 34 }}
              className="absolute right-0 top-0 flex h-full w-full max-w-sm flex-col border-l bg-card shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between border-b bg-gradient-to-r from-primary/10 to-transparent px-4 py-4">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/15 text-primary">
                    <History className="h-4.5 w-4.5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold">Conversations</h3>
                    <p className="text-[11px] text-muted-foreground">
                      {sessions.length} saved
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setShowSessions(false)}
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                  aria-label="Close"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto scrollbar-thin p-3">
                <Button
                  onClick={newSession}
                  variant="outline"
                  className="mb-3 w-full justify-center gap-1.5"
                >
                  <Plus className="h-4 w-4" /> New conversation
                </Button>

                {sessionsLoading ? (
                  <div className="flex flex-col items-center gap-2 py-10 text-muted-foreground">
                    <Loader2 className="h-5 w-5 animate-spin" />
                    <p className="text-xs">Loading…</p>
                  </div>
                ) : sessions.length === 0 ? (
                  <div className="flex flex-col items-center gap-2 py-10 text-center text-muted-foreground">
                    <MessageSquare className="h-8 w-8 opacity-40" />
                    <p className="text-xs">No conversations yet.</p>
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    {sessions.map((s) => {
                      const isActive = s.id === sessionId;
                      const isRenaming = renamingId === s.id;
                      return (
                        <div
                          key={s.id}
                          className={cn(
                            "group relative flex items-start gap-2.5 rounded-lg border p-2.5 transition-colors",
                            isRenaming
                              ? "border-primary/40 bg-primary/5"
                              : "cursor-pointer",
                            isActive && !isRenaming
                              ? "border-primary/40 bg-primary/5"
                              : !isRenaming && "border-border hover:bg-accent/50"
                          )}
                          onClick={() => !isRenaming && switchSession(s.id)}
                        >
                          <div
                            className={cn(
                              "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md",
                              isActive
                                ? "bg-primary/15 text-primary"
                                : "bg-muted text-muted-foreground"
                            )}
                          >
                            <MessageSquare className="h-3.5 w-3.5" />
                          </div>
                          <div className="min-w-0 flex-1">
                            {isRenaming ? (
                              <div className="flex items-center gap-1.5">
                                <input
                                  autoFocus
                                  value={renameValue}
                                  onChange={(e) => setRenameValue(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") {
                                      e.preventDefault();
                                      void confirmRename(s.id);
                                    } else if (e.key === "Escape") {
                                      e.preventDefault();
                                      cancelRename();
                                    }
                                  }}
                                  onClick={(e) => e.stopPropagation()}
                                  placeholder="Conversation name…"
                                  className="w-full rounded border border-primary/40 bg-background px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-primary/40"
                                />
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    void confirmRename(s.id);
                                  }}
                                  disabled={renaming}
                                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-emerald-500 hover:bg-emerald-500/10"
                                  aria-label="Confirm rename"
                                >
                                  {renaming ? (
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                  ) : (
                                    <Check className="h-3.5 w-3.5" />
                                  )}
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    cancelRename();
                                  }}
                                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-muted"
                                  aria-label="Cancel rename"
                                >
                                  <X className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            ) : (
                              <>
                                <p className="truncate text-xs font-medium">
                                  {s.title}
                                </p>
                                <p className="truncate text-[10px] text-muted-foreground">
                                  {s.preview || "No messages"}
                                </p>
                                <div className="mt-1 flex items-center gap-2 text-[9px] text-muted-foreground/70">
                                  <span>{s.messageCount} msgs</span>
                                  <span>·</span>
                                  <span>
                                    {new Date(s.lastActivity).toLocaleDateString()}
                                  </span>
                                </div>
                              </>
                            )}
                          </div>
                          {!isRenaming && (
                            <div className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  startRename(s);
                                }}
                                className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:text-primary"
                                aria-label="Rename conversation"
                              >
                                <Pencil className="h-3 w-3" />
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setDeleteSessionTarget(s.id);
                                }}
                                className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:text-destructive"
                                aria-label="Delete conversation"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Delete session confirmation */}
      <AlertDialog
        open={!!deleteSessionTarget}
        onOpenChange={(v) => !v && setDeleteSessionTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete conversation?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove all messages in this conversation.
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deletingSession}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                deleteSessionTarget && void deleteSession(deleteSessionTarget)
              }
              disabled={deletingSession}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deletingSession ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Trash2 className="mr-1.5 h-3.5 w-3.5" />
              )}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function MessageBubble({
  message,
  isLastAssistant,
  canRegenerate,
  onRegenerate,
  regenerating,
}: {
  message: ChatMessage;
  isLastAssistant?: boolean;
  canRegenerate?: boolean;
  onRegenerate?: () => void;
  regenerating?: boolean;
}) {
  const isUser = message.role === "user";
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.98 }}
      transition={{ duration: 0.22, ease: "easeOut" }}
      className={cn(
        "flex w-full items-end gap-2",
        isUser ? "justify-end" : "justify-start"
      )}
    >
      {!isUser && (
        <Avatar className="h-8 w-8 shrink-0 ring-1 ring-primary/20">
          <AvatarFallback className="bg-primary/15 text-primary">
            <Bot className="h-4 w-4" />
          </AvatarFallback>
        </Avatar>
      )}
      <div className="flex max-w-[85%] flex-col gap-1.5 md:max-w-[78%]">
        <div
          className={cn(
            "rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed",
            isUser
              ? "rounded-br-sm bg-primary text-primary-foreground shadow-sm"
              : "rounded-bl-sm border border-border/60 bg-muted/60 text-foreground"
          )}
        >
          {isUser ? (
            <p className="whitespace-pre-wrap break-words">{message.content}</p>
          ) : (
            <MarkdownContent content={message.content} />
          )}
        </div>
        {canRegenerate && (
          <button
            onClick={onRegenerate}
            disabled={regenerating}
            className="group/regen flex w-fit items-center gap-1.5 rounded-md px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-accent hover:text-primary"
            aria-label="Regenerate response"
          >
            <RotateCcw className="h-3 w-3 transition-transform group-hover/regen:-rotate-180" />
            {regenerating ? "Regenerating…" : "Regenerate"}
          </button>
        )}
      </div>
      {isUser && (
        <Avatar className="h-8 w-8 shrink-0 ring-1 ring-border">
          <AvatarFallback className="bg-muted text-muted-foreground">
            <UserIcon className="h-4 w-4" />
          </AvatarFallback>
        </Avatar>
      )}
    </motion.div>
  );
}

function TypingBubble() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      className="flex w-full items-end justify-start gap-2"
    >
      <Avatar className="h-8 w-8 shrink-0 ring-1 ring-primary/20">
        <AvatarFallback className="bg-primary/15 text-primary">
          <Bot className="h-4 w-4" />
        </AvatarFallback>
      </Avatar>
      <div className="rounded-2xl rounded-bl-sm border border-border/60 bg-muted/60 px-4 py-3">
        <div className="flex items-center gap-1">
          <span className="typing-dot h-1.5 w-1.5 rounded-full bg-muted-foreground" />
          <span className="typing-dot h-1.5 w-1.5 rounded-full bg-muted-foreground" />
          <span className="typing-dot h-1.5 w-1.5 rounded-full bg-muted-foreground" />
        </div>
      </div>
    </motion.div>
  );
}

function EmptyState({ onPick }: { onPick: (q: string) => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex h-[320px] flex-col items-center justify-center gap-5 px-4 text-center"
    >
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/15 text-primary ring-1 ring-primary/30">
        <Sparkles className="h-6 w-6" />
      </div>
      <div className="space-y-1">
        <h3 className="text-base font-semibold">Start a conversation</h3>
        <p className="mx-auto max-w-md text-sm text-muted-foreground">
          Ask about code, debugging, architecture, or framework features. Try
          one of these to get going:
        </p>
      </div>
      <div className="flex max-w-xl flex-wrap items-center justify-center gap-2">
        {SUGGESTIONS.map((s) => (
          <button
            key={s.label}
            type="button"
            onClick={() => onPick(s.label)}
            className="group inline-flex items-center gap-2 rounded-full border border-border/70 bg-background/60 px-3 py-1.5 text-xs font-medium text-foreground/90 transition-colors hover:border-primary/50 hover:bg-primary/10 hover:text-primary"
          >
            <s.icon className="h-3.5 w-3.5 text-primary/80 group-hover:text-primary" />
            {s.label}
          </button>
        ))}
      </div>
    </motion.div>
  );
}

/** Extracts raw text from React children (the <code> inside a <pre>). */
function extractText(children: React.ReactNode): string {
  if (typeof children === "string") return children;
  if (typeof children === "number") return String(children);
  if (Array.isArray(children)) return children.map(extractText).join("");
  if (React.isValidElement(children)) {
    const props = children.props as { children?: React.ReactNode };
    return extractText(props.children);
  }
  return "";
}

function PreWithCopy({ children }: { children: React.ReactNode }) {
  const [copied, setCopied] = React.useState(false);
  const text = React.useMemo(() => extractText(children).replace(/\n$/, ""), [children]);

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="group/pre relative my-2">
      <button
        onClick={onCopy}
        className="absolute right-2 top-2 z-10 inline-flex h-7 w-7 items-center justify-center rounded-md border border-border/60 bg-background/80 text-muted-foreground opacity-0 backdrop-blur transition-all hover:text-primary group-hover/pre:opacity-100"
        aria-label="Copy code"
      >
        {copied ? (
          <Check className="h-3.5 w-3.5 text-emerald-500" />
        ) : (
          <Copy className="h-3.5 w-3.5" />
        )}
      </button>
      <pre className="scrollbar-thin overflow-x-auto rounded-lg border border-border/60 bg-background/80 p-3 text-xs">
        {children}
      </pre>
    </div>
  );
}

function MarkdownContent({ content }: { content: string }) {
  return (
    <div className="text-sm">
      <ReactMarkdown
        components={{
          p: ({ children }) => (
            <p className="mb-2 leading-relaxed last:mb-0">{children}</p>
          ),
          h1: ({ children }) => (
            <h1 className="mb-2 mt-3 text-base font-bold first:mt-0">
              {children}
            </h1>
          ),
          h2: ({ children }) => (
            <h2 className="mb-2 mt-3 text-sm font-bold first:mt-0">{children}</h2>
          ),
          h3: ({ children }) => (
            <h3 className="mb-1.5 mt-2 text-sm font-semibold first:mt-0">
              {children}
            </h3>
          ),
          ul: ({ children }) => (
            <ul className="mb-2 list-disc space-y-1 pl-4 last:mb-0">{children}</ul>
          ),
          ol: ({ children }) => (
            <ol className="mb-2 list-decimal space-y-1 pl-4 last:mb-0">
              {children}
            </ol>
          ),
          li: ({ children }) => <li className="leading-relaxed">{children}</li>,
          a: ({ children, href }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary underline underline-offset-2 hover:opacity-80"
            >
              {children}
            </a>
          ),
          strong: ({ children }) => (
            <strong className="font-semibold">{children}</strong>
          ),
          em: ({ children }) => <em className="italic">{children}</em>,
          pre: ({ children }) => <PreWithCopy>{children}</PreWithCopy>,
          code: ({ className, children }) => {
            const isBlock = !!className?.includes("language-");
            if (isBlock) {
              return (
                <code className="font-mono text-xs leading-relaxed">
                  {children}
                </code>
              );
            }
            return (
              <code className="rounded border border-border/60 bg-background/80 px-1.5 py-0.5 font-mono text-[0.85em] text-primary">
                {children}
              </code>
            );
          },
          blockquote: ({ children }) => (
            <blockquote className="my-2 border-l-2 border-primary/40 pl-3 italic text-muted-foreground">
              {children}
            </blockquote>
          ),
          hr: () => <hr className="my-3 border-border/60" />,
          table: ({ children }) => (
            <div className="scrollbar-thin my-2 overflow-x-auto">
              <table className="w-full border-collapse text-xs">{children}</table>
            </div>
          ),
          th: ({ children }) => (
            <th className="border border-border/60 bg-muted/40 px-2 py-1 text-left font-semibold">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="border border-border/60 px-2 py-1">{children}</td>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
