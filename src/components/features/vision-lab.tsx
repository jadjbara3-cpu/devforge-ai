"use client";

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import ReactMarkdown from "react-markdown";
import {
  Eye,
  UploadCloud,
  X,
  Sparkles,
  Loader2,
  ImageIcon,
  ScanText,
  FileText,
  Wand2,
  RotateCcw,
  History,
  CircleAlert,
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
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

const PRESETS: { label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { label: "Describe this image in detail", icon: FileText },
  { label: "What objects are in this photo?", icon: ImageIcon },
  { label: "Extract all text (OCR)", icon: ScanText },
];

interface HistoryItem {
  id: string;
  thumb: string;
  fileName: string;
  question: string;
  reply: string;
  at: number;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function truncate(text: string, max = 140): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max)}…` : clean;
}

export function VisionLab() {
  const { toast } = useToast();

  const [file, setFile] = React.useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = React.useState<string | null>(null);
  const [question, setQuestion] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [result, setResult] = React.useState<string | null>(null);
  const [history, setHistory] = React.useState<HistoryItem[]>([]);
  const [dragActive, setDragActive] = React.useState(false);

  const inputRef = React.useRef<HTMLInputElement>(null);
  // Track every object URL we create so we can revoke them on unmount
  // (history items keep their thumbnails alive across replacements).
  const urlsRef = React.useRef<string[]>([]);

  React.useEffect(() => {
    return () => {
      urlsRef.current.forEach((u) => URL.revokeObjectURL(u));
    };
  }, []);

  const selectFile = React.useCallback(
    (f: File) => {
      if (!f.type.startsWith("image/")) {
        toast({
          title: "Invalid file type",
          description: "Please upload an image (PNG, JPG, WEBP, GIF, etc.).",
          variant: "destructive",
        });
        return;
      }
      const url = URL.createObjectURL(f);
      urlsRef.current.push(url);
      setFile(f);
      setPreviewUrl(url);
      setResult(null);
    },
    [toast],
  );

  const handleFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    selectFile(files[0]);
  };

  const onDrop = (e: React.DragEvent<HTMLButtonElement>) => {
    e.preventDefault();
    setDragActive(false);
    handleFiles(e.dataTransfer.files);
  };

  const onAnalyze = async () => {
    if (!file || !question.trim() || loading) return;
    setLoading(true);
    setResult(null);
    try {
      const fd = new FormData();
      fd.append("image", file);
      fd.append("question", question.trim());

      const res = await fetch("/api/vision/analyze", {
        method: "POST",
        body: fd,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error || `Request failed with status ${res.status}`);
      }
      const reply: string = data?.reply ?? "";
      setResult(reply);
      setHistory((prev) =>
        [
          {
            id:
              typeof crypto !== "undefined" && "randomUUID" in crypto
                ? crypto.randomUUID()
                : `${Date.now()}-${Math.random().toString(36).slice(2)}`,
            thumb: previewUrl ?? "",
            fileName: file.name,
            question: question.trim(),
            reply,
            at: Date.now(),
          },
          ...prev,
        ].slice(0, 5),
      );
    } catch (err) {
      toast({
        title: "Analysis failed",
        description:
          err instanceof Error ? err.message : "Unexpected error. Please retry.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const onReset = () => {
    setFile(null);
    setPreviewUrl(null);
    setQuestion("");
    setResult(null);
    if (inputRef.current) inputRef.current.value = "";
  };

  const canAnalyze = Boolean(file) && question.trim().length > 0 && !loading;

  return (
    <section className="flex flex-col gap-6">
      {/* Header */}
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/15 text-primary">
              <Eye className="h-5 w-5" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight">Vision Lab</h1>
            <Badge variant="secondary" className="ml-1 gap-1">
              <Sparkles className="h-3 w-3" /> VLM
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            Upload an image, ask any question, and let the vision model understand it for you.
          </p>
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* LEFT: Upload + question */}
        <Card className="glass">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <UploadCloud className="h-4 w-4 text-primary" />
              Image & Prompt
            </CardTitle>
            <CardDescription>
              Drop an image or browse, then choose or write your question.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <input
              ref={inputRef}
              type="file"
              accept="image/*"
              className="sr-only"
              onChange={(e) => handleFiles(e.target.files)}
            />

            {previewUrl ? (
              <motion.div
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.2 }}
                className="group relative overflow-hidden rounded-xl border bg-muted/30"
              >
                <img
                  src={previewUrl}
                  alt={file?.name ?? "Selected preview"}
                  className="max-h-72 w-full object-contain"
                />
                <div className="flex items-center justify-between gap-3 border-t bg-card/70 px-3 py-2 backdrop-blur">
                  <div className="min-w-0">
                    <p className="truncate text-xs font-medium">
                      {file?.name ?? "image"}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      {file ? formatSize(file.size) : ""}
                      {file?.type ? ` · ${file.type}` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => inputRef.current?.click()}
                    >
                      <RotateCcw className="h-3.5 w-3.5" /> Replace
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8"
                      onClick={onReset}
                      aria-label="Remove image"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </motion.div>
            ) : (
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragActive(true);
                }}
                onDragLeave={(e) => {
                  e.preventDefault();
                  setDragActive(false);
                }}
                onDrop={onDrop}
                className={cn(
                  "relative flex h-52 w-full flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed text-center transition-colors",
                  dragActive
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border text-muted-foreground hover:border-primary/50 hover:bg-accent/30 hover:text-foreground",
                )}
              >
                <span
                  className={cn(
                    "flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary transition-transform",
                    dragActive && "scale-110",
                  )}
                >
                  <UploadCloud className="h-6 w-6" />
                </span>
                <span className="space-y-0.5">
                  <span className="block text-sm font-medium">
                    Click to browse or drag & drop
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    PNG, JPG, WEBP, GIF — up to a few MB
                  </span>
                </span>
              </button>
            )}

            {/* Preset chips */}
            <div className="space-y-2">
              <div className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                <Wand2 className="h-3.5 w-3.5" /> Quick prompts
              </div>
              <div className="flex flex-wrap gap-2">
                {PRESETS.map((p) => {
                  const Icon = p.icon;
                  const active = question.trim() === p.label;
                  return (
                    <button
                      key={p.label}
                      type="button"
                      onClick={() => setQuestion(p.label)}
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                        active
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border bg-background hover:border-primary/50 hover:bg-accent/40 hover:text-foreground",
                      )}
                    >
                      <Icon className="h-3.5 w-3.5" />
                      {p.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Question textarea */}
            <div className="space-y-2">
              <label
                htmlFor="vision-question"
                className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground"
              >
                <FileText className="h-3.5 w-3.5" /> Question
              </label>
              <Textarea
                id="vision-question"
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder="e.g. What is happening in this image? Are there any safety hazards?"
                className="min-h-24 resize-y"
                disabled={loading}
              />
            </div>

            <div className="flex items-center gap-2">
              <Button
                onClick={onAnalyze}
                disabled={!canAnalyze}
                className="flex-1"
                size="lg"
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Analyzing…
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4" />
                    Analyze Image
                  </>
                )}
              </Button>
              <Button
                variant="outline"
                size="lg"
                onClick={onReset}
                disabled={loading || (!file && !question)}
              >
                Clear
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* RIGHT: Output */}
        <Card className="glass flex flex-col">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Eye className="h-4 w-4 text-primary" />
              Analysis Output
            </CardTitle>
            <CardDescription>
              Live result plus the last 5 analyses from this session.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex min-h-[28rem] flex-col gap-4">
            {/* History */}
            {history.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  <History className="h-3.5 w-3.5" /> Recent
                  <Badge variant="outline" className="ml-1 px-1.5 py-0 text-[10px]">
                    {history.length}
                  </Badge>
                </div>
                <ScrollArea className="max-h-44 rounded-lg">
                  <ul className="flex flex-col gap-2 pr-2">
                    <AnimatePresence initial={false}>
                      {history.map((item) => (
                        <motion.li
                          key={item.id}
                          initial={{ opacity: 0, y: -6 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0 }}
                          transition={{ duration: 0.18 }}
                          className="flex gap-3 rounded-lg border bg-card/60 p-2.5"
                        >
                          {item.thumb ? (
                            <img
                              src={item.thumb}
                              alt={item.fileName}
                              className="h-12 w-12 shrink-0 rounded-md border object-cover"
                            />
                          ) : (
                            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md border bg-muted">
                              <ImageIcon className="h-5 w-5 text-muted-foreground" />
                            </div>
                          )}
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-xs font-semibold text-foreground">
                              {item.question}
                            </p>
                            <p className="mt-0.5 line-clamp-2 text-[11px] leading-relaxed text-muted-foreground">
                              {truncate(item.reply, 160)}
                            </p>
                          </div>
                        </motion.li>
                      ))}
                    </AnimatePresence>
                  </ul>
                </ScrollArea>
              </div>
            )}

            {/* Current result */}
            <div className="flex flex-1 flex-col">
              {loading ? (
                <div className="flex flex-1 flex-col gap-3 rounded-lg border bg-card/40 p-4">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin text-primary" />
                    The model is looking at your image
                    <span className="ml-1 inline-flex items-center gap-0.5">
                      <span className="typing-dot h-1.5 w-1.5 rounded-full bg-primary" />
                      <span className="typing-dot h-1.5 w-1.5 rounded-full bg-primary" />
                      <span className="typing-dot h-1.5 w-1.5 rounded-full bg-primary" />
                    </span>
                  </div>
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-5/6" />
                  <Skeleton className="h-20 w-full" />
                  <Skeleton className="h-4 w-2/3" />
                </div>
              ) : result ? (
                <motion.div
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.25 }}
                  className="flex-1 overflow-hidden rounded-lg border bg-card/60"
                >
                  <ScrollArea className="h-[26rem]">
                    <div className="prose prose-sm dark:prose-invert max-w-none px-4 py-3.5 prose-headings:mt-3 prose-headings:font-semibold prose-p:leading-relaxed prose-li:my-0.5 prose-pre:rounded-md prose-pre:bg-muted/60">
                      <ReactMarkdown>{result}</ReactMarkdown>
                    </div>
                  </ScrollArea>
                </motion.div>
              ) : (
                <div className="flex flex-1 flex-col items-center justify-center gap-3 rounded-lg border border-dashed bg-muted/20 p-8 text-center">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <Eye className="h-6 w-6" />
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm font-medium">No analysis yet</p>
                    <p className="max-w-xs text-xs text-muted-foreground">
                      Upload an image and ask a question — your results will appear here.
                    </p>
                  </div>
                  {!file && (
                    <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
                      <CircleAlert className="h-3.5 w-3.5" />
                      Add an image to get started
                    </p>
                  )}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
