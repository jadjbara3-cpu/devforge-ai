/**
 * Plugin: Code Formatter
 * =======================
 *
 * Uses DevForge's "complex" chat slot (via the plugin-owned endpoint
 * `POST /api/plugin/code-formatter/format`) to reformat source code.
 *
 * Demonstrates:
 *   • A plugin with a syntax-highlighted code view.
 *   • Plugin-owned API route mounted at `/api/plugin/<id>/...`.
 *   • The "complex" chat slot (stronger model for code tasks).
 */

"use client";

import * as React from "react";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import {
  Braces,
  Loader2,
  Sparkles,
  Copy,
  Check,
  AlertCircle,
  Wand2,
  ArrowDown,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

const LANGUAGES = [
  "javascript",
  "typescript",
  "jsx",
  "tsx",
  "python",
  "go",
  "rust",
  "java",
  "c",
  "cpp",
  "csharp",
  "php",
  "ruby",
  "swift",
  "kotlin",
  "sql",
  "json",
  "html",
  "css",
  "scss",
  "bash",
  "yaml",
  "markdown",
  "text",
] as const;

type Lang = (typeof LANGUAGES)[number];

const STYLES = [
  { value: "clean", label: "Clean (Prettier-like)" },
  { value: "compact", label: "Compact" },
  { value: "verbose", label: "Verbose (with comments)" },
] as const;

interface FormatResponse {
  formatted?: string;
  model?: string;
  error?: string;
  code?: string;
}

export default function CodeFormatterPlugin() {
  const { toast } = useToast();
  const [language, setLanguage] = React.useState<Lang>("typescript");
  const [style, setStyle] = React.useState<(typeof STYLES)[number]["value"]>(
    "clean",
  );
  const [input, setInput] = React.useState<string>(EXAMPLE_CODE);
  const [output, setOutput] = React.useState<string>("");
  const [model, setModel] = React.useState<string>("");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [copied, setCopied] = React.useState(false);

  const onFormat = async () => {
    if (!input.trim()) {
      toast({
        title: "Nothing to format",
        description: "Paste some code first.",
        variant: "destructive",
      });
      return;
    }
    setLoading(true);
    setError(null);
    setOutput("");
    try {
      const res = await fetch("/api/plugin/code-formatter/format", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: input, language, style }),
      });
      const data = (await res.json().catch(() => ({}))) as FormatResponse;
      if (!res.ok || typeof data.formatted !== "string") {
        const msg = data.error || "Formatting failed.";
        setError(msg);
        if (data.code === "PROVIDER_NOT_CONFIGURED") {
          toast({
            title: "No AI provider configured",
            description:
              "Open Settings → Complex tasks model to add an API key.",
            variant: "destructive",
          });
        }
        return;
      }
      setOutput(data.formatted);
      if (data.model) setModel(data.model);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Network error.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const onCopy = async () => {
    if (!output) return;
    try {
      await navigator.clipboard.writeText(output);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* ignore */
    }
  };

  const onApplyToInput = () => {
    if (!output) return;
    setInput(output);
    setOutput("");
    toast({ title: "Applied", description: "Output copied to input." });
  };

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 py-2">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Braces className="h-5 w-5 text-primary" />
            Code Formatter
          </CardTitle>
          <CardDescription>
            Reformat source code with your configured AI provider. Uses the
            &ldquo;Complex tasks&rdquo; slot for best results. Behaviour is
            preserved — only style changes.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Language + style selectors */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                Language
              </label>
              <Select
                value={language}
                onValueChange={(v) => setLanguage(v as Lang)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LANGUAGES.map((l) => (
                    <SelectItem key={l} value={l}>
                      {l}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                Style
              </label>
              <Select
                value={style}
                onValueChange={(v) =>
                  setStyle(v as (typeof STYLES)[number]["value"])
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STYLES.map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Input / Output grid */}
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                Input
              </label>
              <Textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Paste your code here…"
                className="min-h-[320px] resize-y font-mono text-xs leading-relaxed"
                spellCheck={false}
                onKeyDown={(e) => {
                  if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                    e.preventDefault();
                    void onFormat();
                  }
                }}
              />
              <p className="text-[10px] text-muted-foreground">
                Tip: press{" "}
                <kbd className="rounded border bg-muted px-1 font-mono text-[9px]">
                  ⌘/Ctrl + Enter
                </kbd>{" "}
                to format.
              </p>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-muted-foreground">
                  Output
                </label>
                {output && (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={onApplyToInput}
                      className="flex items-center gap-1 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
                      title="Use output as next input"
                    >
                      <ArrowDown className="h-3 w-3" />
                      Apply to input
                    </button>
                    <button
                      onClick={onCopy}
                      className="flex items-center gap-1 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
                    >
                      {copied ? (
                        <>
                          <Check className="h-3 w-3 text-emerald-500" />
                          <span className="text-emerald-500">Copied</span>
                        </>
                      ) : (
                        <>
                          <Copy className="h-3 w-3" />
                          Copy
                        </>
                      )}
                    </button>
                  </div>
                )}
              </div>
              <div
                className={cn(
                  "relative min-h-[320px] overflow-auto rounded-md border bg-[#282c34]",
                  !output && "flex items-center justify-center",
                )}
              >
                {loading ? (
                  <div className="flex h-full min-h-[300px] items-center justify-center text-sm text-muted-foreground">
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Formatting…
                  </div>
                ) : error ? (
                  <div className="flex h-full min-h-[300px] items-start gap-2 p-3 text-sm text-destructive">
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                    <div className="break-words">{error}</div>
                  </div>
                ) : output ? (
                  <SyntaxHighlighter
                    language={language}
                    style={oneDark}
                    customStyle={{
                      margin: 0,
                      background: "transparent",
                      padding: "0.75rem",
                      fontSize: "0.75rem",
                      lineHeight: "1.5",
                    }}
                    wrapLongLines
                  >
                    {output}
                  </SyntaxHighlighter>
                ) : (
                  <div className="text-sm text-muted-foreground/60">
                    Formatted code will appear here.
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <Button
              onClick={onFormat}
              disabled={loading || !input.trim()}
              className="gap-1.5"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Formatting…
                </>
              ) : (
                <>
                  <Wand2 className="h-4 w-4" />
                  Format code
                </>
              )}
            </Button>
            {model && (
              <Badge
                variant="outline"
                className="border-primary/30 bg-primary/5 text-[10px] text-primary"
              >
                <Sparkles className="mr-1 h-3 w-3" />
                via {model}
              </Badge>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Example starter code so the panel isn't empty on first open
// ---------------------------------------------------------------------------

const EXAMPLE_CODE = `// Paste code here, or try this messy example:
function   fibonacci(n){if(n<=1){return n}
     const result=[0,1];
for(let i=2;i<=n;i++){result.push(result[i-1]+result[i-2])}
return result}

console.log(fibonacci(10));`;
