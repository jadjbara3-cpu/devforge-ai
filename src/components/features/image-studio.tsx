"use client";

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ImagePlus,
  Loader2,
  Sparkles,
  Download,
  Trash2,
  Wand2,
  ImageIcon,
  AlertCircle,
  Square,
  RectangleVertical,
  RectangleHorizontal,
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
import { Skeleton } from "@/components/ui/skeleton";
import { Lightbox, type LightboxItem } from "@/components/ui/lightbox";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface GeneratedImage {
  id: string;
  url: string;
  prompt: string;
  size: string;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Size presets
// ---------------------------------------------------------------------------

type Orientation = "Square" | "Portrait" | "Landscape" | "Widescreen";

const SIZE_OPTIONS: {
  value: string;
  label: string;
  orientation: Orientation;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  { value: "1024x1024", orientation: "Square", icon: Square, label: "1024×1024 · Square" },
  { value: "768x1344", orientation: "Portrait", icon: RectangleVertical, label: "768×1344 · Portrait" },
  { value: "864x1152", orientation: "Portrait", icon: RectangleVertical, label: "864×1152 · Portrait" },
  { value: "1344x768", orientation: "Landscape", icon: RectangleHorizontal, label: "1344×768 · Landscape" },
  { value: "1152x864", orientation: "Landscape", icon: RectangleHorizontal, label: "1152×864 · Landscape" },
  { value: "1440x720", orientation: "Widescreen", icon: RectangleHorizontal, label: "1440×720 · Widescreen" },
  { value: "720x1440", orientation: "Portrait", icon: RectangleVertical, label: "720×1440 · Tall Portrait" },
];

const PROMPT_SUGGESTIONS: { label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { label: "A futuristic neon city skyline at dusk, cyberpunk aesthetic, ultra detailed", icon: ImageIcon },
  { label: "Cozy mountain cabin in autumn, warm light glowing from windows, painterly", icon: Wand2 },
  { label: "Abstract 3D render of iridescent liquid metal shapes, studio lighting", icon: Sparkles },
  { label: "Cute robot barista making latte art, soft pastel colors, isometric", icon: ImagePlus },
];

const MAX_PROMPT = 1000;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ImageStudio() {
  const { toast } = useToast();

  const [prompt, setPrompt] = React.useState("");
  const [size, setSize] = React.useState<string>("1024x1024");
  const [images, setImages] = React.useState<GeneratedImage[]>([]);
  const [loadingGallery, setLoadingGallery] = React.useState(true);
  const [generating, setGenerating] = React.useState(false);
  const [deletingId, setDeletingId] = React.useState<string | null>(null);
  const [lightboxIndex, setLightboxIndex] = React.useState<number | null>(null);

  // Load the existing gallery on mount.
  const loadGallery = React.useCallback(async () => {
    setLoadingGallery(true);
    try {
      const res = await fetch("/api/images", { cache: "no-store" });
      if (!res.ok) {
        throw new Error(`Request failed with status ${res.status}`);
      }
      const data = (await res.json()) as { images?: GeneratedImage[] };
      setImages(data.images ?? []);
    } catch (err) {
      console.error("[image-studio] failed to load gallery:", err);
      toast({
        variant: "destructive",
        title: "Couldn't load gallery",
        description:
          err instanceof Error
            ? err.message
            : "Failed to fetch generated images.",
      });
    } finally {
      setLoadingGallery(false);
    }
  }, [toast]);

  React.useEffect(() => {
    void loadGallery();
  }, [loadGallery]);

  // Generation handler.
  const handleGenerate = React.useCallback(async () => {
    const trimmed = prompt.trim();
    if (!trimmed) {
      toast({
        variant: "destructive",
        title: "Prompt required",
        description: "Describe what you'd like to create before generating.",
      });
      return;
    }
    if (generating) return;

    setGenerating(true);
    try {
      const res = await fetch("/api/images/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: trimmed, size }),
      });

      const data = (await res.json().catch(() => null)) as
        | (GeneratedImage & { error?: string })
        | { error: string }
        | null;

      if (!res.ok || !data || !("url" in data) || !data.url) {
        const message =
          (data && "error" in data && data.error) ||
          "Generation failed. Please try again.";
        throw new Error(message);
      }

      const created: GeneratedImage = {
        id: data.id,
        url: data.url,
        prompt: data.prompt,
        size: data.size,
        createdAt:
          typeof data.createdAt === "string"
            ? data.createdAt
            : new Date().toISOString(),
      };

      setImages((prev) => [created, ...prev].slice(0, 24));
      toast({
        title: "Image generated",
        description: "Your creation has been added to the gallery.",
      });
    } catch (err) {
      console.error("[image-studio] generation error:", err);
      toast({
        variant: "destructive",
        title: "Generation failed",
        description:
          err instanceof Error ? err.message : "Please try again in a moment.",
      });
    } finally {
      setGenerating(false);
    }
  }, [prompt, size, generating, toast]);

  // Delete handler.
  const handleDelete = React.useCallback(
    async (id: string) => {
      setDeletingId(id);
      try {
        const res = await fetch(`/api/images/${id}`, { method: "DELETE" });
        if (!res.ok) {
          const data = (await res.json().catch(() => null)) as
            | { error?: string }
            | null;
          throw new Error(
            data?.error || `Request failed with status ${res.status}`,
          );
        }
        setImages((prev) => prev.filter((img) => img.id !== id));
        toast({
          title: "Image deleted",
          description: "Removed from your gallery.",
        });
      } catch (err) {
        console.error("[image-studio] delete error:", err);
        toast({
          variant: "destructive",
          title: "Delete failed",
          description:
            err instanceof Error ? err.message : "Please try again.",
        });
      } finally {
        setDeletingId(null);
      }
    },
    [toast],
  );

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      void handleGenerate();
    }
  };

  const activeOrientation =
    SIZE_OPTIONS.find((opt) => opt.value === size)?.orientation ?? "Square";

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <Card className="overflow-hidden border-none bg-gradient-to-br from-primary/15 via-primary/5 to-transparent shadow-lg">
        <CardHeader className="gap-2">
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="flex size-11 items-center justify-center rounded-xl bg-primary/15 text-primary ring-1 ring-primary/30">
                <ImagePlus className="size-6" />
              </div>
              <span className="absolute -right-0.5 -top-0.5 flex size-3">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-60" />
                <span className="relative inline-flex size-3 rounded-full bg-primary" />
              </span>
            </div>
            <div className="flex-1">
              <CardTitle className="flex items-center gap-2 text-xl">
                Image Studio
                <Sparkles className="size-4 text-primary" />
              </CardTitle>
              <CardDescription className="mt-1">
                Generate visuals from text prompts. Powered by the DevForge AI
                image model.
              </CardDescription>
            </div>
            <Badge variant="secondary" className="hidden sm:inline-flex">
              {images.length} / 24
            </Badge>
          </div>
        </CardHeader>
      </Card>

      {/* Two-column layout */}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,360px)_minmax(0,1fr)]">
        {/* Form column */}
        <Card className="h-fit lg:sticky lg:top-6">
          <CardHeader className="gap-1.5">
            <CardTitle className="text-base">Create</CardTitle>
            <CardDescription>
              Write a prompt, pick a size, and generate.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-5">
            {/* Prompt */}
            <div className="flex flex-col gap-2">
              <label htmlFor="image-prompt" className="text-sm font-medium">
                Prompt
              </label>
              <Textarea
                id="image-prompt"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value.slice(0, MAX_PROMPT))}
                onKeyDown={onKeyDown}
                placeholder="A serene Japanese garden with cherry blossoms, koi pond, golden hour, ultra detailed…"
                className="min-h-32 resize-y"
                aria-describedby="image-prompt-help"
                disabled={generating}
              />
              <div
                id="image-prompt-help"
                className="flex items-center justify-between text-xs text-muted-foreground"
              >
                <span>Press ⌘/Ctrl + Enter to generate</span>
                <span>
                  {prompt.length} / {MAX_PROMPT}
                </span>
              </div>
            </div>

            {/* Size selector */}
            <div className="flex flex-col gap-2">
              <label htmlFor="image-size" className="text-sm font-medium">
                Output size
              </label>
              <Select value={size} onValueChange={setSize} disabled={generating}>
                <SelectTrigger
                  id="image-size"
                  className="w-full"
                  aria-label="Output size"
                >
                  <SelectValue placeholder="Choose a size" />
                </SelectTrigger>
                <SelectContent>
                  {SIZE_OPTIONS.map((opt) => {
                    const Icon = opt.icon;
                    return (
                      <SelectItem key={opt.value} value={opt.value}>
                        <Icon className="text-muted-foreground" />
                        <span className="flex-1">{opt.label}</span>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Orientation:{" "}
                <span className="text-foreground/80">{activeOrientation}</span>
              </p>
            </div>

            {/* Suggestions */}
            <div className="flex flex-col gap-2">
              <span className="text-sm font-medium">Prompt ideas</span>
              <div className="flex flex-wrap gap-2">
                {PROMPT_SUGGESTIONS.map((s, idx) => {
                  const Icon = s.icon;
                  return (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setPrompt(s.label)}
                      disabled={generating}
                      className={cn(
                        "group inline-flex max-w-full items-center gap-1.5 rounded-full border border-border bg-background/60 px-3 py-1.5 text-xs text-muted-foreground transition-colors",
                        "hover:border-primary/40 hover:bg-primary/5 hover:text-foreground",
                        "disabled:cursor-not-allowed disabled:opacity-50",
                      )}
                    >
                      <Icon className="size-3.5 text-primary/80 transition-transform group-hover:scale-110" />
                      <span className="truncate max-w-[180px] sm:max-w-[220px]">
                        {s.label}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Action */}
            <Button
              type="button"
              size="lg"
              onClick={() => void handleGenerate()}
              disabled={generating || !prompt.trim()}
              className="w-full"
            >
              {generating ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Generating…
                </>
              ) : (
                <>
                  <Sparkles className="size-4" />
                  Generate
                </>
              )}
            </Button>
          </CardContent>
        </Card>

        {/* Gallery column */}
        <Card className="flex flex-col">
          <CardHeader className="gap-1.5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <CardTitle className="text-base">Gallery</CardTitle>
                <CardDescription>
                  Your most recent generations appear here.
                </CardDescription>
              </div>
              {loadingGallery && (
                <Badge variant="outline" className="gap-1.5">
                  <Loader2 className="size-3 animate-spin" />
                  Loading
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <GalleryGrid
              images={images}
              loading={loadingGallery}
              generating={generating}
              deletingId={deletingId}
              onDelete={handleDelete}
              onOpenLightbox={(idx) => setLightboxIndex(idx)}
            />
          </CardContent>
        </Card>
      </div>

      {/* Lightbox */}
      <Lightbox
        items={images.map((img) => ({
          id: img.id,
          url: img.url,
          prompt: img.prompt,
          size: img.size,
          meta: new Date(img.createdAt).toLocaleString(),
        }))}
        index={lightboxIndex}
        onClose={() => setLightboxIndex(null)}
        onNavigate={setLightboxIndex}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Gallery grid sub-component
// ---------------------------------------------------------------------------

interface GalleryGridProps {
  images: GeneratedImage[];
  loading: boolean;
  generating: boolean;
  deletingId: string | null;
  onDelete: (id: string) => void;
  onOpenLightbox: (index: number) => void;
}

function GalleryGrid({
  images,
  loading,
  generating,
  deletingId,
  onDelete,
  onOpenLightbox,
}: GalleryGridProps) {
  // Initial skeleton state (no images yet, still loading).
  if (loading && images.length === 0) {
    return (
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-2 md:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="aspect-square w-full rounded-xl" />
        ))}
      </div>
    );
  }

  // Empty state (no generating placeholder either).
  if (images.length === 0 && !generating) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-muted/20 px-6 py-16 text-center">
        <div className="flex size-14 items-center justify-center rounded-full bg-primary/10 text-primary">
          <ImageIcon className="size-7" />
        </div>
        <div className="space-y-1">
          <p className="text-sm font-medium">No images yet</p>
          <p className="mx-auto max-w-sm text-xs text-muted-foreground">
            Write a prompt and hit Generate to bring your first image to life.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-2 md:grid-cols-3">
      <AnimatePresence mode="popLayout">
        {generating && (
          <motion.div
            key="generating-placeholder"
            layout
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.25 }}
            className="relative aspect-square w-full"
          >
            <div className="flex h-full w-full flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-primary/40 bg-primary/5">
              <Loader2 className="size-7 animate-spin text-primary" />
              <span className="text-xs font-medium text-primary/80">
                Generating…
              </span>
            </div>
          </motion.div>
        )}

        {images.map((img, idx) => (
          <motion.div
            key={img.id}
            layout
            initial={{ opacity: 0, scale: 0.95, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ duration: 0.3, ease: "easeOut" }}
            className="group relative aspect-square w-full cursor-zoom-in overflow-hidden rounded-xl border border-border bg-muted/30"
            onClick={() => onOpenLightbox(idx)}
          >
            <img
              src={img.url}
              alt={img.prompt}
              loading="lazy"
              className="absolute inset-0 h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
            />

            {/* Hover overlay */}
            <div className="absolute inset-0 flex flex-col justify-between bg-gradient-to-t from-black/80 via-black/10 to-transparent opacity-0 transition-opacity duration-200 group-hover:opacity-100">
              {/* Top-right actions */}
              <div className="flex items-center justify-end gap-1.5 p-2">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <a
                      href={img.url}
                      download={`devforge-${img.id}.png`}
                      onClick={(e) => e.stopPropagation()}
                      className="inline-flex size-8 items-center justify-center rounded-md bg-background/80 text-foreground backdrop-blur transition-colors hover:bg-background hover:text-primary"
                      aria-label="Download image"
                    >
                      <Download className="size-4" />
                    </a>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">Download</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); onDelete(img.id); }}
                      disabled={deletingId === img.id}
                      className="inline-flex size-8 items-center justify-center rounded-md bg-background/80 text-foreground backdrop-blur transition-colors hover:bg-destructive hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
                      aria-label="Delete image"
                    >
                      {deletingId === img.id ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <Trash2 className="size-4" />
                      )}
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">Delete</TooltipContent>
                </Tooltip>
              </div>

              {/* Caption */}
              <div className="space-y-1.5 p-3">
                <div className="flex items-center gap-1.5">
                  <Badge
                    variant="secondary"
                    className="bg-background/80 text-foreground backdrop-blur"
                  >
                    {img.size}
                  </Badge>
                </div>
                <p className="line-clamp-3 text-xs leading-relaxed text-white/90">
                  {img.prompt}
                </p>
              </div>
            </div>

            {/* Always-visible size badge (top-left) */}
            <Badge
              variant="secondary"
              className="absolute left-2 top-2 bg-background/70 text-foreground opacity-100 backdrop-blur transition-opacity duration-200 group-hover:opacity-0"
            >
              {img.size}
            </Badge>
          </motion.div>
        ))}
      </AnimatePresence>

      {/* Fallback empty message inside a non-empty state when the list is exhausted but still generating */}
      {images.length === 0 && generating && (
        <div className="col-span-full flex items-center justify-center gap-2 py-6 text-xs text-muted-foreground">
          <AlertCircle className="size-3.5" />
          Your generated image will appear here.
        </div>
      )}
    </div>
  );
}
