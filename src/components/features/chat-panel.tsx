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
} from "lucide-react";

import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";

type Role = "user" | "assistant" | "system";

type ChatMessage = {
  id: string;
  role: Role;
  content: string;
  createdAt: string;
};

const SESSION = "default";

const SUGGESTIONS: { icon: React.ElementType; label: string }[] = [
  { icon: Code2, label: "Explain async/await in TypeScript with an example." },
  { icon: Zap, label: "How do I optimize unnecessary React re-renders?" },
  { icon: HelpCircle, label: "What's new in Next.js 16 App Router?" },
];

export function ChatPanel() {
  const { toast } = useToast();
  const [messages, setMessages] = React.useState<ChatMessage[]>([]);
  const [input, setInput] = React.useState("");
  const [sending, setSending] = React.useState(false);
  const [historyLoading, setHistoryLoading] = React.useState(true);
  const [clearing, setClearing] = React.useState(false);

  const scrollRef = React.useRef<HTMLDivElement>(null);
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);

  // Load conversation history on mount.
  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/chat/history?session=${encodeURIComponent(SESSION)}`,
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
  }, [toast]);

  // Auto-scroll to the latest message whenever the list or sending state changes.
  React.useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [messages, sending]);

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

      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: content, session: SESSION }),
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
      } catch (err) {
        // Roll back the optimistic user bubble so the user can retry cleanly.
        setMessages((prev) => prev.filter((m) => m.id !== optimistic.id));
        toast({
          title: "Chat error",
          description:
            err instanceof Error ? err.message : "Something went wrong.",
          variant: "destructive",
        });
      } finally {
        setSending(false);
        requestAnimationFrame(() => textareaRef.current?.focus());
      }
    },
    [input, sending, toast]
  );

  const clearChat = async () => {
    if (clearing || messages.length === 0) return;
    setClearing(true);
    try {
      const res = await fetch(
        `/api/chat/clear?session=${encodeURIComponent(SESSION)}`,
        { method: "DELETE" }
      );
      if (!res.ok) throw new Error("Failed to clear chat");
      setMessages([]);
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
                {messages.map((m) => (
                  <MessageBubble key={m.id} message={m} />
                ))}
              </AnimatePresence>
              {sending && <TypingBubble />}
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
    </div>
  );
}

function MessageBubble({ message }: { message: ChatMessage }) {
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
      <div
        className={cn(
          "max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed md:max-w-[78%]",
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
          pre: ({ children }) => (
            <pre className="scrollbar-thin my-2 overflow-x-auto rounded-lg border border-border/60 bg-background/80 p-3 text-xs">
              {children}
            </pre>
          ),
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
