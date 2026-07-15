/**
 * Plugin: Translator
 * ===================
 *
 * A simple AI-powered translator. Uses DevForge's existing chat
 * infrastructure via the plugin-owned endpoint
 * `POST /api/plugin/translator/translate` (no chat history is persisted —
 * the call is a one-shot completion).
 *
 * Demonstrates:
 *   • How a plugin consumes DevForge's AI provider stack.
 *   • Plugin-owned API routes mounted at `/api/plugin/<id>/...`.
 *   • Standard shadcn/ui controls (Select, Textarea, Button, Card).
 */

"use client";

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Languages,
  ArrowRight,
  Loader2,
  Copy,
  Check,
  Sparkles,
  AlertCircle,
  RotateCcw,
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

const LANGUAGES = [
  { value: "auto", label: "Auto-detect" },
  { value: "en", label: "English" },
  { value: "ar", label: "Arabic" },
  { value: "fr", label: "French" },
  { value: "es", label: "Spanish" },
  { value: "de", label: "German" },
  { value: "it", label: "Italian" },
  { value: "pt", label: "Portuguese" },
  { value: "ru", label: "Russian" },
  { value: "zh", label: "Chinese" },
  { value: "ja", label: "Japanese" },
  { value: "ko", label: "Korean" },
  { value: "hi", label: "Hindi" },
  { value: "tr", label: "Turkish" },
  { value: "nl", label: "Dutch" },
  { value: "pl", label: "Polish" },
  { value: "sv", label: "Swedish" },
  { value: "he", label: "Hebrew" },
  { value: "fa", label: "Persian" },
  { value: "ur", label: "Urdu" },
] as const;

interface TranslateResponse {
  translation?: string;
  model?: string;
  error?: string;
  code?: string;
}

export default function TranslatorPlugin() {
  const { toast } = useToast();
  const [source, setSource] = React.useState<string>("auto");
  const [target, setTarget] = React.useState<string>("en");
  const [input, setInput] = React.useState<string>("");
  const [output, setOutput] = React.useState<string>("");
  const [model, setModel] = React.useState<string>("");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [copied, setCopied] = React.useState(false);

  const onTranslate = async () => {
    if (!input.trim()) {
      toast({
        title: "Nothing to translate",
        description: "Enter some text first.",
        variant: "destructive",
      });
      return;
    }
    if (source === target && source !== "auto") {
      toast({
        title: "Languages match",
        description: "Pick a different target language.",
        variant: "destructive",
      });
      return;
    }
    setLoading(true);
    setError(null);
    setOutput("");
    try {
      const res = await fetch("/api/plugin/translator/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: input, source, target }),
      });
      const data = (await res.json().catch(() => ({}))) as TranslateResponse;
      if (!res.ok || !data.translation) {
        const msg = data.error || "Translation failed.";
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
      setOutput(data.translation);
      if (data.model) setModel(data.model);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Network error.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const onSwap = () => {
    if (source === "auto") {
      toast({
        title: "Can't swap",
        description: "Pick a specific source language first.",
      });
      return;
    }
    const s = source;
    setSource(target);
    setTarget(s);
    if (output) {
      setInput(output);
      setOutput("");
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

  const onClear = () => {
    setInput("");
    setOutput("");
    setError(null);
  };

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 py-2">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Languages className="h-5 w-5 text-primary" />
            Translator
          </CardTitle>
          <CardDescription>
            Translate text between 20+ languages using your configured AI
            provider. One-shot — translations aren&apos;t saved to chat history.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Language selectors */}
          <div className="grid grid-cols-1 items-end gap-3 sm:grid-cols-[1fr_auto_1fr]">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                From
              </label>
              <Select value={source} onValueChange={setSource}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LANGUAGES.map((l) => (
                    <SelectItem key={l.value} value={l.value}>
                      {l.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Button
              variant="outline"
              size="icon"
              onClick={onSwap}
              className="mb-0.5 shrink-0"
              aria-label="Swap languages"
              title="Swap source and target"
            >
              <ArrowRight className="h-4 w-4" />
            </Button>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                To
              </label>
              <Select value={target} onValueChange={setTarget}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LANGUAGES.filter((l) => l.value !== "auto").map((l) => (
                    <SelectItem key={l.value} value={l.value}>
                      {l.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Input / Output grid */}
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-muted-foreground">
                  Input
                </label>
                <button
                  onClick={onClear}
                  className="flex items-center gap-1 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
                >
                  <RotateCcw className="h-3 w-3" />
                  Clear
                </button>
              </div>
              <Textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Type or paste text to translate…"
                className="min-h-[200px] resize-y font-mono text-sm"
                onKeyDown={(e) => {
                  if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                    e.preventDefault();
                    void onTranslate();
                  }
                }}
              />
              <p className="text-[10px] text-muted-foreground">
                Tip: press{" "}
                <kbd className="rounded border bg-muted px-1 font-mono text-[9px]">
                  ⌘/Ctrl + Enter
                </kbd>{" "}
                to translate.
              </p>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-muted-foreground">
                  Output
                </label>
                {output && (
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
                )}
              </div>
              <div className="relative min-h-[200px] rounded-md border bg-muted/30 p-3">
                <AnimatePresence mode="wait">
                  {loading ? (
                    <motion.div
                      key="loading"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="flex h-full min-h-[180px] items-center justify-center text-sm text-muted-foreground"
                    >
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Translating…
                    </motion.div>
                  ) : error ? (
                    <motion.div
                      key="error"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="flex h-full min-h-[180px] items-start gap-2 text-sm text-destructive"
                    >
                      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                      <div className="break-words">{error}</div>
                    </motion.div>
                  ) : output ? (
                    <motion.div
                      key="output"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="whitespace-pre-wrap break-words font-mono text-sm leading-relaxed"
                    >
                      {output}
                    </motion.div>
                  ) : (
                    <div className="flex h-full min-h-[180px] items-center justify-center text-sm text-muted-foreground/60">
                      Translation will appear here.
                    </div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <Button
              onClick={onTranslate}
              disabled={loading || !input.trim()}
              className="gap-1.5"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Translating…
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4" />
                  Translate
                </>
              )}
            </Button>
            {model && (
              <Badge
                variant="outline"
                className="border-primary/30 bg-primary/5 text-[10px] text-primary"
              >
                via {model}
              </Badge>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
