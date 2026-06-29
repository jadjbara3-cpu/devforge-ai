"use client";

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  AlertCircle,
  BookOpen,
  Check,
  ChevronRight,
  Clock,
  Copy,
  ExternalLink,
  Globe,
  History,
  Loader2,
  Newspaper,
  Search,
  Sparkles,
  X,
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SearchResult {
  url: string;
  name: string;
  snippet: string;
  host_name: string;
  rank: number;
  date: string;
  favicon: string;
}

interface ReadResult {
  title: string;
  text: string;
  html: string;
  publishedTime: string;
  url: string;
}

type TabKey = "search" | "read";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const EXAMPLE_QUERIES = [
  "Next.js 16 new features",
  "How does RAG improve LLM accuracy",
  "TypeScript 5 type narrowing tips",
];

const MAX_TEXT_PREVIEW = 4000;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatPublishedTime(value: string): string {
  if (!value) return "";
  try {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return value;
    return d.toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return value;
  }
}

function getHost(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

function stripHtml(html: string): string {
  // Lightweight tag strip; we prefer the `text` field when available.
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

// ---------------------------------------------------------------------------
// Favicon with graceful fallback
// ---------------------------------------------------------------------------

function Favicon({ src, host, name }: { src: string; host: string; name: string }) {
  const [errored, setErrored] = React.useState(false);
  const show = src && !errored;

  return (
    <div className="bg-muted/60 ring-border/60 flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-md ring-1">
      {show ? (
        <img
          src={src}
          alt=""
          width={16}
          height={16}
          className="size-4 object-contain"
          onError={() => setErrored(true)}
          loading="lazy"
        />
      ) : (
        <Globe className="text-muted-foreground size-4" aria-hidden />
      )}
      <span className="sr-only">{host || name || "source"} favicon</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Search Tab
// ---------------------------------------------------------------------------

function SearchTab({
  onReadPage,
}: {
  onReadPage: (url: string) => void;
}) {
  const { toast } = useToast();
  const [query, setQuery] = React.useState("");
  const [submitted, setSubmitted] = React.useState("");
  const [results, setResults] = React.useState<SearchResult[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [hasSearched, setHasSearched] = React.useState(false);

  // Search history (localStorage)
  const HISTORY_KEY = "devforge-web-search-history-v1";
  const [history, setHistory] = React.useState<string[]>([]);

  React.useEffect(() => {
    try {
      const raw = localStorage.getItem(HISTORY_KEY);
      if (raw) setHistory(JSON.parse(raw));
    } catch {
      /* ignore */
    }
  }, []);

  const saveToHistory = React.useCallback((q: string) => {
    setHistory((prev) => {
      const next = [q, ...prev.filter((h) => h !== q)].slice(0, 8);
      try {
        localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  const removeFromHistory = React.useCallback((q: string) => {
    setHistory((prev) => {
      const next = prev.filter((h) => h !== q);
      try {
        localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  const clearHistory = React.useCallback(() => {
    setHistory([]);
    try {
      localStorage.removeItem(HISTORY_KEY);
    } catch {
      /* ignore */
    }
  }, []);

  const runSearch = React.useCallback(
    async (q: string) => {
      const trimmed = q.trim();
      if (!trimmed) return;
      setLoading(true);
      setHasSearched(true);
      setSubmitted(trimmed);
      saveToHistory(trimmed);
      try {
        const res = await fetch("/api/web/search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: trimmed, num: 10 }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(
            (data && typeof data.error === "string" && data.error) ||
              `Search failed (HTTP ${res.status}).`,
          );
        }
        const list = Array.isArray(data?.results) ? data.results : [];
        setResults(list);
        if (list.length === 0) {
          toast({
            title: "No results",
            description: `No web results for "${trimmed}".`,
          });
        }
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Search failed. Please try again.";
        toast({
          variant: "destructive",
          title: "Search error",
          description: message,
        });
        setResults([]);
      } finally {
        setLoading(false);
      }
    },
    [toast, saveToHistory],
  );

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void runSearch(query);
  };

  const onExample = (q: string) => {
    setQuery(q);
    void runSearch(q);
  };

  return (
    <Card className="border-border/60">
      <CardHeader className="gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="bg-primary/15 text-primary flex size-10 items-center justify-center rounded-lg ring-1 ring-primary/20">
              <Search className="size-5" />
            </div>
            <div>
              <CardTitle className="text-base sm:text-lg">Web Search</CardTitle>
              <CardDescription className="text-xs">
                Search the live web for up-to-date answers.
              </CardDescription>
            </div>
          </div>
          {hasSearched && !loading && (
            <Badge variant="secondary" className="gap-1">
              <Sparkles className="size-3" />
              {results.length} result{results.length === 1 ? "" : "s"}
            </Badge>
          )}
        </div>

        <form onSubmit={onSubmit} className="flex flex-col gap-2 sm:flex-row">
          <Input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search the web…"
            aria-label="Search query"
            className="h-11 flex-1"
            autoFocus
          />
          <Button
            type="submit"
            disabled={loading || !query.trim()}
            className="h-11 shrink-0 sm:px-6"
          >
            {loading ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Search className="size-4" />
            )}
            <span>{loading ? "Searching…" : "Search"}</span>
          </Button>
        </form>

        {/* Search history */}
        {history.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              <History className="size-3" />
              Recent:
            </span>
            {history.map((h) => (
              <div
                key={h}
                className="group/hist flex items-center gap-1 rounded-full border border-border bg-background/50 pl-2.5 pr-1 text-[11px] text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
              >
                <button
                  onClick={() => {
                    setQuery(h);
                    void runSearch(h);
                  }}
                  className="truncate max-w-[160px] py-0.5"
                >
                  {h}
                </button>
                <button
                  onClick={() => removeFromHistory(h)}
                  className="flex h-4 w-4 items-center justify-center rounded-full text-muted-foreground/60 hover:bg-destructive/10 hover:text-destructive"
                  aria-label={`Remove "${h}" from history`}
                >
                  <X className="size-2.5" />
                </button>
              </div>
            ))}
            <button
              onClick={clearHistory}
              className="rounded-full px-2 py-0.5 text-[11px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
            >
              Clear all
            </button>
          </div>
        )}
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Loading skeletons */}
        {loading && <SearchSkeleton />}

        {/* Empty state — never searched */}
        {!loading && !hasSearched && (
          <div className="flex flex-col items-center justify-center gap-4 px-4 py-12 text-center">
            <div className="bg-primary/10 text-primary flex size-14 items-center justify-center rounded-full ring-1 ring-primary/20">
              <Globe className="size-7" />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium">Start a search</p>
              <p className="text-muted-foreground max-w-sm text-xs">
                Try one of these examples or type your own query above.
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-2">
              {EXAMPLE_QUERIES.map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => onExample(q)}
                  className="bg-muted/60 hover:bg-muted text-foreground/80 hover:text-foreground inline-flex items-center gap-1.5 rounded-full border border-transparent px-3 py-1.5 text-xs font-medium transition-colors"
                >
                  <Sparkles className="text-primary size-3" />
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* No results */}
        {!loading && hasSearched && results.length === 0 && (
          <div className="flex flex-col items-center justify-center gap-3 px-4 py-12 text-center">
            <div className="bg-muted text-muted-foreground flex size-12 items-center justify-center rounded-full">
              <Search className="size-6" />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium">No results found</p>
              <p className="text-muted-foreground text-xs">
                Try a different or more specific query.
              </p>
            </div>
          </div>
        )}

        {/* Results */}
        {!loading && results.length > 0 && (
          <motion.div
            className="space-y-3"
            initial="hidden"
            animate="show"
            variants={{
              hidden: { opacity: 1 },
              show: {
                opacity: 1,
                transition: { staggerChildren: 0.06, delayChildren: 0.02 },
              },
            }}
          >
            <AnimatePresence mode="popLayout">
              {results.map((r, i) => (
                <motion.div
                  key={`${r.url}-${i}`}
                  layout
                  variants={{
                    hidden: { opacity: 0, y: 12 },
                    show: {
                      opacity: 1,
                      y: 0,
                      transition: { duration: 0.28, ease: "easeOut" },
                    },
                  }}
                >
                  <SearchResultCard result={r} onReadPage={onReadPage} />
                </motion.div>
              ))}
            </AnimatePresence>
          </motion.div>
        )}
      </CardContent>
    </Card>
  );
}

function SearchResultCard({
  result,
  onReadPage,
}: {
  result: SearchResult;
  onReadPage: (url: string) => void;
}) {
  const host = result.host_name || getHost(result.url);
  const dateLabel = formatPublishedTime(result.date);
  const title = result.name || result.url || host || "Untitled";

  return (
    <div className="bg-card/60 hover:bg-card border-border/60 hover:border-border/80 group relative flex gap-3 rounded-lg border p-3 transition-colors sm:gap-4 sm:p-4">
      <Favicon src={result.favicon} host={host} name={result.name} />

      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <Badge
            variant="outline"
            className="text-muted-foreground max-w-[60%] truncate font-normal"
          >
            {host}
          </Badge>
          {dateLabel && (
            <Badge variant="secondary" className="gap-1 font-normal">
              <Clock className="size-3" />
              {dateLabel}
            </Badge>
          )}
          {result.rank > 0 && (
            <span className="text-muted-foreground/70 ml-auto text-[10px] tabular-nums">
              #{result.rank}
            </span>
          )}
        </div>

        <a
          href={result.url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-foreground hover:text-primary block truncate text-sm font-semibold leading-snug transition-colors sm:text-base"
          title={title}
        >
          {title}
        </a>

        {result.snippet && (
          <p className="text-muted-foreground line-clamp-3 text-xs leading-relaxed sm:text-sm">
            {result.snippet}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-2 pt-1">
          <Button
            type="button"
            size="sm"
            variant="secondary"
            className="h-8 gap-1.5"
            onClick={() => onReadPage(result.url)}
          >
            <BookOpen className="size-3.5" />
            Read page
            <ChevronRight className="size-3" />
          </Button>
          <a
            href={result.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-xs font-medium transition-colors"
          >
            <ExternalLink className="size-3" />
            Open original
          </a>
        </div>
      </div>
    </div>
  );
}

function SearchSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 4 }).map((_, i) => (
        <div
          key={i}
          className="border-border/60 flex gap-3 rounded-lg border p-3 sm:gap-4 sm:p-4"
        >
          <Skeleton className="size-8 shrink-0 rounded-md" />
          <div className="flex-1 space-y-2">
            <div className="flex gap-2">
              <Skeleton className="h-5 w-32 rounded-full" />
              <Skeleton className="h-5 w-20 rounded-full" />
            </div>
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-5/6" />
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page Reader Tab
// ---------------------------------------------------------------------------

function ReaderTab({
  presetUrl,
  onConsumePreset,
}: {
  presetUrl: string;
  onConsumePreset: () => void;
}) {
  const { toast } = useToast();
  const [url, setUrl] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [result, setResult] = React.useState<ReadResult | null>(null);
  const [copied, setCopied] = React.useState(false);

  const readPage = React.useCallback(
    async (target: string) => {
      const trimmed = target.trim();
      if (!trimmed) return;
      setLoading(true);
      setResult(null);
      setCopied(false);
      try {
        const res = await fetch("/api/web/read", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: trimmed }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(
            (data && typeof data.error === "string" && data.error) ||
              `Reader failed (HTTP ${res.status}).`,
          );
        }
        const payload = data as ReadResult;
        // Prefer the `text` field; fall back to a stripped version of html.
        const cleanedText =
          (payload.text && payload.text.trim()) ||
          (payload.html ? stripHtml(payload.html) : "");
        setResult({
          title: payload.title || "",
          text: cleanedText,
          html: payload.html || "",
          publishedTime: payload.publishedTime || "",
          url: payload.url || trimmed,
        });
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to read page.";
        toast({
          variant: "destructive",
          title: "Reader error",
          description: message,
        });
        setResult(null);
      } finally {
        setLoading(false);
      }
    },
    [toast],
  );

  // Accept a URL pre-filled from the search tab.
  React.useEffect(() => {
    if (presetUrl) {
      setUrl(presetUrl);
      void readPage(presetUrl);
      onConsumePreset();
    }
  }, [presetUrl, readPage, onConsumePreset]);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void readPage(url);
  };

  const onCopy = async () => {
    if (!result?.text) return;
    try {
      await navigator.clipboard.writeText(result.text);
      setCopied(true);
      toast({ title: "Copied", description: "Article text copied to clipboard." });
      setTimeout(() => setCopied(false), 1800);
    } catch {
      toast({
        variant: "destructive",
        title: "Copy failed",
        description: "Clipboard access was denied.",
      });
    }
  };

  const paragraphs = React.useMemo(() => {
    if (!result?.text) return [];
    return result.text
      .split(/\n{2,}|\r\n\r\n/)
      .map((p) => p.replace(/\s+/g, " ").trim())
      .filter(Boolean);
  }, [result]);

  return (
    <Card className="border-border/60">
      <CardHeader className="gap-4">
        <div className="flex items-center gap-3">
          <div className="bg-primary/15 text-primary flex size-10 items-center justify-center rounded-lg ring-1 ring-primary/20">
            <Newspaper className="size-5" />
          </div>
          <div>
            <CardTitle className="text-base sm:text-lg">Page Reader</CardTitle>
            <CardDescription className="text-xs">
              Extract the readable content of any web article.
            </CardDescription>
          </div>
        </div>

        <form onSubmit={onSubmit} className="flex flex-col gap-2 sm:flex-row">
          <Input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://example.com/article"
            aria-label="Article URL"
            className="h-11 flex-1"
            inputMode="url"
          />
          <Button
            type="submit"
            disabled={loading || !url.trim()}
            className="h-11 shrink-0 sm:px-6"
          >
            {loading ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <BookOpen className="size-4" />
            )}
            <span>{loading ? "Reading…" : "Read"}</span>
          </Button>
        </form>
      </CardHeader>

      <CardContent>
        {/* Loading */}
        {loading && <ReaderSkeleton />}

        {/* Empty state */}
        {!loading && !result && (
          <div className="flex flex-col items-center justify-center gap-3 px-4 py-12 text-center">
            <div className="bg-primary/10 text-primary flex size-14 items-center justify-center rounded-full ring-1 ring-primary/20">
              <BookOpen className="size-7" />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium">Paste an article URL</p>
              <p className="text-muted-foreground max-w-sm text-xs">
                Or hit “Read page” on a search result to load it here
                automatically.
              </p>
            </div>
          </div>
        )}

        {/* Result */}
        {!loading && result && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            className="space-y-4"
          >
            <div className="space-y-2">
              <h2 className="text-foreground text-lg font-semibold leading-snug sm:text-xl">
                {result.title || getHost(result.url)}
              </h2>
              <div className="text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                <span className="inline-flex items-center gap-1">
                  <Globe className="size-3" />
                  {getHost(result.url)}
                </span>
                {result.publishedTime && (
                  <span className="inline-flex items-center gap-1">
                    <Clock className="size-3" />
                    {formatPublishedTime(result.publishedTime)}
                  </span>
                )}
              </div>
            </div>

            <div className="bg-muted/40 flex flex-wrap items-center gap-2 rounded-md border border-dashed p-2">
              <Button
                type="button"
                size="sm"
                variant="secondary"
                className="h-8 gap-1.5"
                onClick={onCopy}
                disabled={!result.text}
              >
                {copied ? (
                  <>
                    <Check className="size-3.5" />
                    Copied
                  </>
                ) : (
                  <>
                    <Copy className="size-3.5" />
                    Copy text
                  </>
                )}
              </Button>
              <a
                href={result.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 px-2 text-xs font-medium transition-colors"
              >
                <ExternalLink className="size-3" />
                Open original
              </a>
              {result.text && (
                <Badge variant="outline" className="ml-auto font-normal">
                  {result.text.length.toLocaleString()} chars
                </Badge>
              )}
            </div>

            <ScrollArea
              className="bg-muted/20 max-h-[60vh] w-full rounded-md border p-4"
              type="auto"
            >
              {paragraphs.length > 0 ? (
                <article className="text-foreground/90 space-y-3 text-sm leading-relaxed">
                  {paragraphs
                    .slice(0, MAX_TEXT_PREVIEW)
                    .map((p, i) => (
                      <p key={i} className="whitespace-pre-wrap break-words">
                        {p}
                      </p>
                    ))}
                  {paragraphs.length > MAX_TEXT_PREVIEW && (
                    <p className="text-muted-foreground italic">
                      …({paragraphs.length - MAX_TEXT_PREVIEW} more paragraphs
                      truncated — use “Copy text” for the full content.)
                    </p>
                  )}
                </article>
              ) : (
                <p className="text-muted-foreground text-sm italic">
                  No readable text could be extracted from this page.
                </p>
              )}
            </ScrollArea>
          </motion.div>
        )}
      </CardContent>
    </Card>
  );
}

function ReaderSkeleton() {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Skeleton className="h-6 w-3/4" />
        <Skeleton className="h-3 w-1/3" />
      </div>
      <div className="flex gap-2">
        <Skeleton className="h-8 w-24 rounded-md" />
        <Skeleton className="h-8 w-28 rounded-md" />
      </div>
      <div className="max-h-[60vh] space-y-3 overflow-hidden rounded-md border p-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <React.Fragment key={i}>
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-[95%]" />
            <Skeleton className="h-3 w-[88%]" />
            <Skeleton className="h-3 w-[97%]" />
            <div className="h-2" />
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// WebIntel (root)
// ---------------------------------------------------------------------------

export function WebIntel() {
  const [tab, setTab] = React.useState<TabKey>("search");
  const [presetUrl, setPresetUrl] = React.useState("");

  const handleReadPage = React.useCallback((url: string) => {
    setPresetUrl(url);
    setTab("read");
  }, []);

  const consumePreset = React.useCallback(() => setPresetUrl(""), []);

  return (
    <section className="space-y-4">
      {/* Header */}
      <Card className="border-border/60 overflow-hidden">
        <div className="from-primary/15 via-primary/5 to-transparent relative bg-gradient-to-br">
          <CardHeader className="gap-2">
            <div className="flex items-center gap-3">
              <div className="bg-primary/20 text-primary relative flex size-11 items-center justify-center rounded-xl ring-1 ring-primary/30">
                <Globe className="size-5" />
                <span className="bg-primary absolute -right-0.5 -top-0.5 flex size-2.5">
                  <span className="bg-primary/70 absolute inline-flex size-full animate-ping rounded-full opacity-75" />
                  <span className="bg-primary relative inline-flex size-2.5 rounded-full" />
                </span>
              </div>
              <div className="space-y-0.5">
                <CardTitle className="flex items-center gap-2 text-lg sm:text-xl">
                  Web Intelligence
                  <Badge variant="secondary" className="gap-1 font-normal">
                    <Sparkles className="size-3" />
                    Live web
                  </Badge>
                </CardTitle>
                <CardDescription className="text-xs sm:text-sm">
                  Search the live web and read full article content in one
                  place.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
        </div>
      </Card>

      <Tabs
        value={tab}
        onValueChange={(v) => setTab(v as TabKey)}
        className="w-full"
      >
        <TabsList className="w-full sm:w-auto">
          <TabsTrigger value="search" className="flex-1 sm:flex-none gap-1.5">
            <Search className="size-4" />
            Web Search
          </TabsTrigger>
          <TabsTrigger value="read" className="flex-1 sm:flex-none gap-1.5">
            <BookOpen className="size-4" />
            Page Reader
          </TabsTrigger>
        </TabsList>

        <TabsContent value="search" className="mt-4">
          <SearchTab onReadPage={handleReadPage} />
        </TabsContent>
        <TabsContent value="read" className="mt-4">
          <ReaderTab presetUrl={presetUrl} onConsumePreset={consumePreset} />
        </TabsContent>
      </Tabs>

      <p className="text-muted-foreground/70 flex items-center gap-1.5 px-1 text-[11px]">
        <AlertCircle className="size-3" />
        Results are returned by an external search provider and may be cached
        or rate-limited.
      </p>
    </section>
  );
}

export default WebIntel;
