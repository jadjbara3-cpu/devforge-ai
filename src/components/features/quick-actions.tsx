"use client";

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search,
  Globe,
  Bot,
  Languages,
  Code2,
  FolderOpen,
  Calculator,
  Palette,
  Sparkles,
  Loader2,
  X,
  ArrowRight,
  ExternalLink,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { useLanguage } from "@/components/language-provider";
import { useToast } from "@/hooks/use-toast";
import {
  QUICK_ACTIONS,
  parseAction,
  evaluateMath,
  parseColor,
  findApp,
  type ActionResult,
  type QuickActionId,
} from "@/lib/quick-actions";
import { Badge } from "@/components/ui/badge";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";

// ---------------------------------------------------------------------------
// Icon mapping
// ---------------------------------------------------------------------------

const ACTION_ICONS: Record<QuickActionId, React.ElementType> = {
  search: Globe,
  chat: Bot,
  translate: Languages,
  code: Code2,
  open: FolderOpen,
  calc: Calculator,
  color: Palette,
  ai: Sparkles,
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface QuickActionsProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function QuickActions({ open, onOpenChange }: QuickActionsProps) {
  const { t } = useLanguage();
  const { toast } = useToast();

  const [input, setInput] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [result, setResult] = React.useState<ActionResult | null>(null);
  const [history, setHistory] = React.useState<string[]>([]);
  const inputRef = React.useRef<HTMLInputElement>(null);

  // Focus the input when the overlay opens.
  React.useEffect(() => {
    if (open) {
      setInput("");
      setResult(null);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  // Close on Escape.
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onOpenChange(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onOpenChange]);

  // ---------------------------------------------------------------
  // Submit
  // ---------------------------------------------------------------

  const submit = React.useCallback(
    async (value?: string) => {
      const text = (value ?? input).trim();
      if (!text) return;
      setInput(text);
      setHistory((h) => [text, ...h.filter((x) => x !== text)].slice(0, 8));
      setLoading(true);
      setResult(null);

      const parsed = parseAction(text);

      try {
        // Client-side actions first.
        if (parsed.action === "calc") {
          const r = evaluateMath(parsed.query);
          if (Number.isNaN(r)) {
            setResult({
              kind: "error",
              title: "Invalid expression",
              body: `"${parsed.query}" is not a valid math expression.`,
            });
          } else {
            setResult({
              kind: "calc",
              title: "Result",
              expression: parsed.query,
              result: r,
            });
          }
          setLoading(false);
          return;
        }

        if (parsed.action === "color") {
          const c = parseColor(parsed.query);
          if (!c) {
            setResult({
              kind: "error",
              title: "Invalid color",
              body: `"${parsed.query}" is not a valid hex or rgb color.`,
            });
          } else {
            setResult({
              kind: "color",
              title: "Color preview",
              color: c,
            });
          }
          setLoading(false);
          return;
        }

        if (parsed.action === "open") {
          const app = findApp(parsed.query);
          if (!app) {
            setResult({
              kind: "error",
              title: "App not found",
              body: `No Windows app matches "${parsed.query}".`,
            });
          } else {
            setResult({
              kind: "open",
              title: `Open ${app.description}`,
              app,
            });
          }
          setLoading(false);
          return;
        }

        // Everything else → server.
        const res = await fetch("/api/quick-action", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ input: text }),
        });
        const data = (await res.json()) as {
          result?: ActionResult;
          error?: string;
        };
        if (!res.ok || !data.result) {
          throw new Error(data.error || "Action failed");
        }
        setResult(data.result);
      } catch (err) {
        setResult({
          kind: "error",
          title: "Action failed",
          body: err instanceof Error ? err.message : "Unknown error",
        });
        toast({
          title: t("assistant.quickActions.failed"),
          variant: "destructive",
        });
      } finally {
        setLoading(false);
      }
    },
    [input, toast, t],
  );

  // ---------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------

  const parsed = parseAction(input);
  const detectedIcon = ACTION_ICONS[parsed.action];

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 z-[100] flex items-start justify-center bg-background/70 backdrop-blur-sm"
          onClick={() => onOpenChange(false)}
        >
          <motion.div
            initial={{ opacity: 0, y: -20, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.98 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            onClick={(e) => e.stopPropagation()}
            className="relative mt-[12vh] w-full max-w-2xl px-4"
          >
            {/* Input row */}
            <div className="overflow-hidden rounded-2xl border bg-card shadow-2xl shadow-black/30">
              <div className="flex items-center gap-3 border-b px-4 py-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  {loading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    React.createElement(detectedIcon, { className: "h-4 w-4" })
                  )}
                </div>
                <input
                  ref={inputRef}
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      submit();
                    }
                  }}
                  placeholder={t("assistant.quickActions.placeholder")}
                  className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                />
                <kbd className="rounded border bg-muted px-1.5 py-0.5 font-mono text-[9px] text-muted-foreground">
                  ESC
                </kbd>
                <button
                  onClick={() => onOpenChange(false)}
                  className="rounded-md p-1 text-muted-foreground hover:bg-accent"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>

              {/* Detected action tag */}
              {input.trim() && (
                <div className="px-4 pt-2">
                  <Badge variant="outline" className="text-[10px] uppercase">
                    {parsed.action === "ai"
                      ? t("assistant.quickActions.aiDetect")
                      : t(`assistant.quickActions.actions.${parsed.action}`)}
                  </Badge>
                </div>
              )}

              {/* Body: result or hints */}
              <div className="max-h-[60vh] overflow-y-auto p-4">
                {loading ? (
                  <div className="flex flex-col items-center gap-3 py-10 text-muted-foreground">
                    <Loader2 className="h-6 w-6 animate-spin text-primary" />
                    <p className="text-xs">
                      {t("assistant.quickActions.working")}
                    </p>
                  </div>
                ) : result ? (
                  <ResultView result={result} onCopy={async (text) => {
                    try {
                      await navigator.clipboard.writeText(text);
                      toast({ title: t("assistant.clipboard.copied") });
                    } catch {
                      /* ignore */
                    }
                  }} />
                ) : !input.trim() ? (
                  <EmptyState onPick={(s) => submit(s)} history={history} t={t} />
                ) : null}
              </div>
            </div>

            {/* Footer hint */}
            <div className="mt-2 flex items-center justify-between px-2 text-[10px] text-muted-foreground">
              <span>
                {t("assistant.quickActions.footer", { kbd: "Ctrl+Space" })}
              </span>
              <span>
                {t("assistant.quickActions.enterHint")}
              </span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ---------------------------------------------------------------------------
// Empty state — shows action chips + recent history
// ---------------------------------------------------------------------------

function EmptyState({
  onPick,
  history,
  t,
}: {
  onPick: (text: string) => void;
  history: string[];
  t: (key: string, vars?: Record<string, string | number>) => string;
}) {
  return (
    <div className="space-y-4">
      <div>
        <p className="mb-2 text-[10px] uppercase tracking-wider text-muted-foreground">
          {t("assistant.quickActions.actions.title")}
        </p>
        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
          {QUICK_ACTIONS.map((a) => {
            const Icon = ACTION_ICONS[a.id];
            return (
              <button
                key={a.id}
                onClick={() => onPick(`${a.keyword} `)}
                className="flex flex-col items-start gap-1 rounded-lg border bg-background/40 p-2 text-left transition-colors hover:border-primary/40 hover:bg-accent"
              >
                <Icon className="h-3.5 w-3.5 text-primary" />
                <span className="text-xs font-medium">{a.label}</span>
                <span className="line-clamp-1 text-[10px] text-muted-foreground">
                  {a.example}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {history.length > 0 && (
        <div>
          <p className="mb-2 text-[10px] uppercase tracking-wider text-muted-foreground">
            {t("assistant.quickActions.recent")}
          </p>
          <div className="space-y-1">
            {history.map((h, i) => (
              <button
                key={i}
                onClick={() => onPick(h)}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs hover:bg-accent"
              >
                <Search className="h-3 w-3 shrink-0 text-muted-foreground" />
                <span className="flex-1 truncate">{h}</span>
                <ArrowRight className="h-3 w-3 shrink-0 text-muted-foreground" />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Result renderer — switches on the discriminated union
// ---------------------------------------------------------------------------

function ResultView({
  result,
  onCopy,
}: {
  result: ActionResult;
  onCopy: (text: string) => void;
}) {
  switch (result.kind) {
    case "text":
      return (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold">{result.title}</h3>
          <pre className="whitespace-pre-wrap break-words rounded-lg bg-muted/40 p-3 text-xs">
            {result.body}
          </pre>
          <button
            onClick={() => onCopy(result.body)}
            className="text-[10px] text-primary hover:underline"
          >
            Copy
          </button>
        </div>
      );

    case "markdown":
      return (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold">{result.title}</h3>
          <MarkdownResult body={result.body} />
          <button
            onClick={() => onCopy(result.body)}
            className="text-[10px] text-primary hover:underline"
          >
            Copy
          </button>
        </div>
      );

    case "list":
      return (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold">{result.title}</h3>
          <ul className="space-y-1.5">
            {result.items.map((item, i) => (
              <li key={i}>
                <a
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group flex items-start gap-2 rounded-md border bg-background/40 p-2 transition-colors hover:border-primary/40 hover:bg-accent"
                >
                  <ExternalLink className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground group-hover:text-primary" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-medium">{item.title}</p>
                    {item.subtitle && (
                      <p className="line-clamp-2 text-[11px] text-muted-foreground">
                        {item.subtitle}
                      </p>
                    )}
                    {item.url && (
                      <p className="mt-0.5 truncate text-[10px] text-primary/70">
                        {item.url}
                      </p>
                    )}
                  </div>
                </a>
              </li>
            ))}
            {result.items.length === 0 && (
              <li className="text-xs text-muted-foreground">No results.</li>
            )}
          </ul>
        </div>
      );

    case "calc":
      return (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold">{result.title}</h3>
          <div className="rounded-lg border bg-muted/40 p-4">
            <p className="font-mono text-xs text-muted-foreground">
              {result.expression}
            </p>
            <p className="mt-1 font-mono text-2xl font-bold gradient-text">
              = {Number.isInteger(result.result)
                ? result.result
                : result.result.toFixed(6).replace(/\.?0+$/, "")}
            </p>
          </div>
        </div>
      );

    case "color":
      return (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold">{result.title}</h3>
          <div className="flex items-stretch gap-3">
            <div
              className="h-24 w-24 shrink-0 rounded-lg border shadow-inner"
              style={{ backgroundColor: result.color.css }}
            />
            <div className="flex-1 space-y-1 font-mono text-xs">
              <Row label="HEX" value={result.color.hex} onCopy={onCopy} />
              <Row
                label="RGB"
                value={`rgb(${result.color.rgb.r}, ${result.color.rgb.g}, ${result.color.rgb.b})`}
                onCopy={onCopy}
              />
              <Row
                label="HSL"
                value={`hsl(${result.color.hsl.h}, ${result.color.hsl.s}%, ${result.color.hsl.l}%)`}
                onCopy={onCopy}
              />
            </div>
          </div>
        </div>
      );

    case "open":
      return (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold">{result.title}</h3>
          <div className="rounded-lg border bg-muted/40 p-3">
            <p className="text-xs text-muted-foreground">
              DevForge AI runs in a browser, so it can&apos;t launch Windows apps
              directly. Run this in a terminal:
            </p>
            <pre className="mt-2 overflow-x-auto rounded bg-background/60 p-2 font-mono text-xs">
              {result.app.command}
            </pre>
          </div>
        </div>
      );

    case "ai":
      return (
        <div className="space-y-2">
          <div className="flex items-center gap-1.5">
            <Sparkles className="h-3.5 w-3.5 text-primary" />
            <h3 className="text-sm font-semibold">{result.title}</h3>
          </div>
          <MarkdownResult body={result.body} />
        </div>
      );

    case "error":
      return (
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3">
          <p className="text-sm font-semibold text-destructive">{result.title}</p>
          <p className="mt-1 text-xs text-muted-foreground">{result.body}</p>
        </div>
      );
  }
}

function Row({
  label,
  value,
  onCopy,
}: {
  label: string;
  value: string;
  onCopy: (text: string) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-8 text-muted-foreground">{label}</span>
      <span className="flex-1">{value}</span>
      <button
        onClick={() => onCopy(value)}
        className="text-[10px] text-primary hover:underline"
      >
        copy
      </button>
    </div>
  );
}

// Minimal markdown renderer — extracts the first ```fenced code block```.
function MarkdownResult({ body }: { body: string }) {
  const fenceMatch = /^```(\w+)?\n([\s\S]*?)```/m.exec(body);
  if (fenceMatch) {
    const lang = fenceMatch[1] || "text";
    const code = fenceMatch[2];
    const prose = body.replace(fenceMatch[0], "").trim();
    return (
      <div className="space-y-2">
        {prose && <p className="text-xs text-muted-foreground">{prose}</p>}
        <div className="overflow-hidden rounded-lg border border-border/60 bg-[#282c34]">
          <div className="border-b border-white/5 bg-black/20 px-3 py-1.5">
            <span className="font-mono text-[10px] uppercase tracking-wide text-zinc-400">
              {lang}
            </span>
          </div>
          <SyntaxHighlighter
            language={lang}
            style={oneDark}
            customStyle={{
              margin: 0,
              background: "transparent",
              padding: "0.75rem 1rem",
              fontSize: "0.75rem",
            }}
          >
            {code}
          </SyntaxHighlighter>
        </div>
      </div>
    );
  }
  return (
    <pre className="whitespace-pre-wrap break-words rounded-lg bg-muted/40 p-3 text-xs">
      {body}
    </pre>
  );
}
