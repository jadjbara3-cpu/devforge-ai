"use client";

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  AudioLines,
  Copy,
  Download,
  Loader2,
  Mic,
  Sparkles,
  Square,
  Trash2,
  Upload,
  Volume2,
  Check,
  RefreshCw,
  History,
  AlertCircle,
  AudioWaveform,
  Globe,
  Play,
  StopCircle,
  Palette,
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
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { useSettings } from "@/components/layout/settings";
import { cn } from "@/lib/utils";
import {
  VOICES,
  LANGUAGES,
  VOICE_STYLES,
  getVoiceById,
  getVoicesByLanguage,
  groupVoicesByLanguage,
  isArabicText,
  type Voice,
  type VoiceStyle,
} from "@/lib/voices";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_TEXT = 1024;
const HISTORY_LIMIT = 5;

const SAMPLE_PROMPTS = [
  "Welcome to DevForge AI — where ideas compile into reality.",
  "The quick brown fox jumps over the lazy dog.",
  "Build, ship, and scale with confidence today.",
  "مرحبا بك في DevForge AI، حيث تتحول الأفكار إلى واقع.",
  "Bonjour et bienvenue dans DevForge AI.",
];

/** Shorthand for the voice's gender badge color. */
function genderColor(gender: Voice["gender"]): string {
  switch (gender) {
    case "female":
      return "text-pink-500";
    case "male":
      return "text-blue-500";
    default:
      return "text-muted-foreground";
  }
}

function genderLabel(gender: Voice["gender"]): string {
  switch (gender) {
    case "female":
      return "Female";
    case "male":
      return "Male";
    default:
      return "Neutral";
  }
}

/** Provider badge — short label shown next to each voice in the dropdown. */
function providerLabel(provider: Voice["provider"]): string {
  return provider === "zai" ? "Z.ai" : "OpenAI";
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TtsClip {
  id: string;
  text: string;
  voice: string;
  language: string;
  style: VoiceStyle;
  speed: number;
  url: string;
  provider: "zai" | "openai" | "unknown";
  fellBack?: boolean;
  rtl: boolean;
  createdAt: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatTime(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m.toString().padStart(2, "0")}:${r.toString().padStart(2, "0")}`;
}

// Pick a MediaRecorder mime type the current browser supports.
function pickSupportedMimeType(): string {
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/ogg;codecs=opus",
    "audio/mp4",
  ];
  if (typeof MediaRecorder === "undefined") return "";
  for (const type of candidates) {
    try {
      if (MediaRecorder.isTypeSupported(type)) return type;
    } catch {
      // ignore and continue
    }
  }
  return "";
}

// ---------------------------------------------------------------------------
// TTS Tab
// ---------------------------------------------------------------------------

function TtsTab() {
  const { toast } = useToast();
  const { settings } = useSettings();

  const [text, setText] = React.useState("");
  const [voice, setVoice] = React.useState<string>(settings.defaultTtsVoice);
  const [speed, setSpeed] = React.useState<number>(settings.defaultTtsSpeed);
  const [style, setStyle] = React.useState<VoiceStyle>("neutral");
  const [languageFilter, setLanguageFilter] = React.useState<string>("all");
  const [synthesizing, setSynthesizing] = React.useState(false);
  const [previewingVoiceId, setPreviewingVoiceId] = React.useState<string | null>(
    null,
  );
  const [clips, setClips] = React.useState<TtsClip[]>([]);

  // Revoke object URLs on unmount / when clips change.
  const urlsRef = React.useRef<Set<string>>(new Set());
  const registerUrl = React.useCallback((url: string) => {
    urlsRef.current.add(url);
  }, []);
  const revokeAll = React.useCallback(() => {
    urlsRef.current.forEach((url) => {
      try {
        URL.revokeObjectURL(url);
      } catch {
        /* noop */
      }
    });
    urlsRef.current.clear();
  }, []);
  React.useEffect(() => () => revokeAll(), [revokeAll]);

  // Filtered + grouped voice list, recomputed when the language filter changes.
  const filteredVoices = React.useMemo(
    () => getVoicesByLanguage(languageFilter),
    [languageFilter],
  );
  const groupedVoices = React.useMemo(
    () => groupVoicesByLanguage(filteredVoices),
    [filteredVoices],
  );

  // If the user's selected voice isn't in the filtered list, snap to the
  // first available voice so the Select always shows a valid value.
  React.useEffect(() => {
    if (filteredVoices.length === 0) return;
    const stillValid = filteredVoices.some((v) => v.id === voice);
    if (!stillValid) {
      setVoice(filteredVoices[0].id);
    }
  }, [filteredVoices, voice]);

  const voiceMeta = React.useMemo(
    () => getVoiceById(voice),
    [voice],
  );

  const trimmed = text.trim();
  const overLimit = text.length > MAX_TEXT;
  const canSynthesize = trimmed.length > 0 && !overLimit && !synthesizing;
  const textIsArabic = isArabicText(text);

  // Core synthesis helper — used by both the main "Synthesize" button and
  // the per-voice "preview" button.
  const synthesize = React.useCallback(
    async (opts: {
      text: string;
      voiceId: string;
      styleId: VoiceStyle;
      speedValue: number;
    }): Promise<TtsClip | null> => {
      const { text: synthText, voiceId, styleId, speedValue } = opts;
      const meta = getVoiceById(voiceId);
      const language =
        meta?.languageCode ?? (isArabicText(synthText) ? "ar" : "en");

      const res = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: synthText,
          voice: voiceId,
          language,
          style: styleId,
          speed: speedValue,
        }),
      });

      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as
          | { error?: string }
          | null;
        throw new Error(
          data?.error || `Synthesis failed (HTTP ${res.status}).`,
        );
      }

      const blob = await res.blob();
      if (!blob || blob.size === 0) {
        throw new Error("Received an empty audio buffer.");
      }
      const url = URL.createObjectURL(blob);
      registerUrl(url);

      const providerHeader = res.headers.get("X-TTS-Provider");
      const fellBack = res.headers.get("X-TTS-Fallback") === "zai-unavailable";
      const rtl =
        res.headers.get("X-TTS-RTL") === "1" || isArabicText(synthText);

      const provider: TtsClip["provider"] =
        providerHeader === "zai" || providerHeader === "openai"
          ? providerHeader
          : "unknown";

      const clip: TtsClip = {
        id:
          typeof crypto !== "undefined" && "randomUUID" in crypto
            ? crypto.randomUUID()
            : `clip-${Date.now()}`,
        text: synthText,
        voice: voiceId,
        language,
        style: styleId,
        speed: speedValue,
        url,
        provider,
        fellBack,
        rtl,
        createdAt: Date.now(),
      };
      return clip;
    },
    [registerUrl],
  );

  const handleSynthesize = React.useCallback(async () => {
    if (!canSynthesize) return;
    setSynthesizing(true);
    try {
      const clip = await synthesize({
        text: trimmed,
        voiceId: voice,
        styleId: style,
        speedValue: speed,
      });
      if (clip) {
        setClips((prev) => [clip, ...prev].slice(0, HISTORY_LIMIT));
        const meta = getVoiceById(clip.voice);
        toast({
          title: "Audio synthesized",
          description: `${meta?.name ?? clip.voice} · ${clip.style} · ${clip.speed.toFixed(1)}×${
            clip.fellBack ? " · (OpenAI fallback)" : ""
          }`,
        });
      }
    } catch (err) {
      console.error("[voice-lab/tts] error:", err);
      toast({
        variant: "destructive",
        title: "Synthesis failed",
        description:
          err instanceof Error ? err.message : "Please try again in a moment.",
      });
    } finally {
      setSynthesizing(false);
    }
  }, [canSynthesize, trimmed, voice, style, speed, synthesize, toast]);

  // Per-voice preview — synthesizes a short sample phrase in the voice's
  // native language, plays it once, and discards the clip (no history entry).
  const previewAudioRef = React.useRef<HTMLAudioElement | null>(null);
  const handlePreview = React.useCallback(
    async (voiceId: string) => {
      const meta = getVoiceById(voiceId);
      if (!meta) return;
      const sample =
        meta.preview ??
        "Hello! This is a voice preview from DevForge AI.";

      // Stop any in-flight preview playback.
      if (previewAudioRef.current) {
        previewAudioRef.current.pause();
        previewAudioRef.current = null;
      }

      setPreviewingVoiceId(voiceId);
      try {
        const clip = await synthesize({
          text: sample,
          voiceId,
          styleId: "neutral",
          speedValue: 1.0,
        });
        if (clip) {
          const audio = new Audio(clip.url);
          previewAudioRef.current = audio;
          audio.onended = () => {
            setPreviewingVoiceId(null);
            try {
              URL.revokeObjectURL(clip.url);
            } catch {
              /* noop */
            }
          };
          audio.onerror = () => {
            setPreviewingVoiceId(null);
            try {
              URL.revokeObjectURL(clip.url);
            } catch {
              /* noop */
            }
          };
          await audio.play().catch(() => {
            // Autoplay can be blocked — surface a toast so the user knows.
            toast({
              variant: "destructive",
              title: "Preview blocked",
              description: "Click the play button to hear the sample.",
            });
            setPreviewingVoiceId(null);
          });
        }
      } catch (err) {
        console.error("[voice-lab/preview] error:", err);
        toast({
          variant: "destructive",
          title: "Preview failed",
          description:
            err instanceof Error ? err.message : "Please try another voice.",
        });
        setPreviewingVoiceId(null);
      }
    },
    [synthesize, toast],
  );

  const handleStopPreview = React.useCallback(() => {
    if (previewAudioRef.current) {
      previewAudioRef.current.pause();
      previewAudioRef.current = null;
    }
    setPreviewingVoiceId(null);
  }, []);

  React.useEffect(
    () => () => {
      if (previewAudioRef.current) {
        previewAudioRef.current.pause();
        previewAudioRef.current = null;
      }
    },
    [],
  );

  const handleRemoveClip = React.useCallback(
    (id: string) => {
      setClips((prev) => {
        const target = prev.find((c) => c.id === id);
        if (target) {
          try {
            URL.revokeObjectURL(target.url);
          } catch {
            /* noop */
          }
          urlsRef.current.delete(target.url);
        }
        return prev.filter((c) => c.id !== id);
      });
    },
    [urlsRef],
  );

  const charCount = text.length;
  const counterClass = cn(
    "text-xs tabular-nums",
    overLimit
      ? "text-destructive font-medium"
      : charCount > MAX_TEXT * 0.9
        ? "text-amber-500"
        : "text-muted-foreground",
  );

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      {/* ----------------------------- Form ----------------------------- */}
      <Card className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-primary/15 via-primary/5 to-transparent" />
        <CardHeader className="relative">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="relative flex size-10 items-center justify-center rounded-full bg-primary/15 text-primary">
                <AudioWaveform className="size-5" />
                <span className="absolute -right-0.5 -top-0.5 flex size-2.5">
                  <span className="absolute inline-flex size-full animate-ping rounded-full bg-primary opacity-60" />
                  <span className="relative inline-flex size-2.5 rounded-full bg-primary" />
                </span>
              </div>
              <div>
                <CardTitle className="flex items-center gap-2 text-lg">
                  Text → Speech
                  <Sparkles className="size-4 text-primary" />
                </CardTitle>
                <CardDescription>
                  Type up to {MAX_TEXT} characters and pick a voice to
                  synthesize.
                </CardDescription>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="relative space-y-5">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label
                htmlFor="tts-text"
                className="text-sm font-medium text-foreground"
              >
                Input text
              </label>
              <span className={counterClass}>
                {charCount}/{MAX_TEXT}
              </span>
            </div>
            <Textarea
              id="tts-text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Type the text you want to hear…"
              rows={6}
              dir={textIsArabic ? "rtl" : "ltr"}
              className={cn(
                "resize-none bg-background/60",
                overLimit &&
                  "border-destructive/60 focus-visible:ring-destructive/30",
              )}
              aria-invalid={overLimit}
            />
            <div className="flex flex-wrap gap-1.5">
              {SAMPLE_PROMPTS.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setText(p)}
                  className="rounded-full border border-border/70 bg-muted/40 px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:bg-primary/10 hover:text-foreground"
                >
                  {p.length > 36 ? `${p.slice(0, 36)}…` : p}
                </button>
              ))}
            </div>
          </div>

          {/* Language filter */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label
                htmlFor="tts-lang"
                className="text-sm font-medium text-foreground"
              >
                Language
              </label>
              <span className="text-[10px] text-muted-foreground">
                {filteredVoices.length} voice{filteredVoices.length === 1 ? "" : "s"}
              </span>
            </div>
            <Select
              value={languageFilter}
              onValueChange={setLanguageFilter}
            >
              <SelectTrigger
                id="tts-lang"
                className="w-full"
                aria-label="Filter voices by language"
              >
                <SelectValue placeholder="All languages" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">
                  <span className="flex items-center gap-2">
                    <Globe className="size-3.5 text-primary" />
                    <span>All languages</span>
                  </span>
                </SelectItem>
                {LANGUAGES.map((lang) => {
                  const count = VOICES.filter(
                    (v) =>
                      v.languageCode.split("-")[0].toLowerCase() ===
                      lang.code.toLowerCase(),
                  ).length;
                  if (count === 0) return null;
                  return (
                    <SelectItem key={lang.code} value={lang.code}>
                      <span className="flex items-center gap-2">
                        <Globe className="size-3.5 text-muted-foreground" />
                        <span>{lang.name}</span>
                        <span className="text-[11px] text-muted-foreground" dir={lang.rtl ? "rtl" : "ltr"}>
                          {lang.nativeName}
                        </span>
                        <Badge
                          variant="secondary"
                          className="ml-auto px-1.5 py-0 text-[10px] font-normal"
                        >
                          {count}
                        </Badge>
                      </span>
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>

          {/* Voice + Preview */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label
                htmlFor="tts-voice"
                className="text-sm font-medium text-foreground"
              >
                Voice
              </label>
              {voiceMeta && (
                <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                  <Badge
                    variant="outline"
                    className="px-1.5 py-0 text-[10px] font-normal"
                  >
                    {providerLabel(voiceMeta.provider)}
                  </Badge>
                  <Badge
                    variant="outline"
                    className={cn(
                      "px-1.5 py-0 text-[10px] font-normal capitalize",
                      genderColor(voiceMeta.gender),
                    )}
                  >
                    {genderLabel(voiceMeta.gender)}
                  </Badge>
                  {voiceMeta.dialect && (
                    <Badge
                      variant="outline"
                      className="px-1.5 py-0 text-[10px] font-normal"
                    >
                      {voiceMeta.dialect}
                    </Badge>
                  )}
                </span>
              )}
            </div>
            <div className="flex gap-2">
              <Select value={voice} onValueChange={setVoice}>
                <SelectTrigger
                  id="tts-voice"
                  className="min-w-0 flex-1"
                  aria-label="Voice"
                >
                  <SelectValue placeholder="Choose a voice" />
                </SelectTrigger>
                <SelectContent>
                  {groupedVoices.length === 0 ? (
                    <SelectItem value="__empty__" disabled>
                      No voices for this language
                    </SelectItem>
                  ) : (
                    groupedVoices.map((group) => (
                      <SelectGroup key={group.language}>
                        <SelectLabel className="flex items-center justify-between gap-2">
                          <span>{group.language}</span>
                          <span className="text-[10px] text-muted-foreground">
                            {group.voices.length}
                          </span>
                        </SelectLabel>
                        {group.voices.map((v) => (
                          <SelectItem key={v.id} value={v.id}>
                            <span className="flex items-center gap-2">
                              <Volume2 className="size-3.5 text-primary" />
                              <span>{v.name}</span>
                              <Badge
                                variant="secondary"
                                className="px-1.5 py-0 text-[10px] font-normal"
                              >
                                {providerLabel(v.provider)}
                              </Badge>
                              {v.dialect && (
                                <Badge
                                  variant="secondary"
                                  className="px-1.5 py-0 text-[10px] font-normal"
                                >
                                  {v.dialect}
                                </Badge>
                              )}
                              <span
                                className={cn(
                                  "ml-auto text-[10px] uppercase",
                                  genderColor(v.gender),
                                )}
                                aria-label={genderLabel(v.gender)}
                              >
                                {v.gender === "female"
                                  ? "F"
                                  : v.gender === "male"
                                    ? "M"
                                    : "N"}
                              </span>
                            </span>
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    ))
                  )}
                </SelectContent>
              </Select>
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() =>
                  previewingVoiceId === voice
                    ? handleStopPreview()
                    : handlePreview(voice)
                }
                disabled={!voiceMeta}
                aria-label={
                  previewingVoiceId === voice
                    ? "Stop preview"
                    : "Preview voice"
                }
                title={
                  previewingVoiceId === voice
                    ? "Stop preview"
                    : "Preview voice"
                }
                className="shrink-0"
              >
                {previewingVoiceId === voice ? (
                  <StopCircle className="size-4" />
                ) : (
                  <Play className="size-4" />
                )}
              </Button>
            </div>
          </div>

          {/* Style + Speed */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <label
                htmlFor="tts-style"
                className="text-sm font-medium text-foreground"
              >
                Style
              </label>
              <Select
                value={style}
                onValueChange={(v) => setStyle(v as VoiceStyle)}
              >
                <SelectTrigger
                  id="tts-style"
                  className="w-full"
                  aria-label="Voice style"
                >
                  <SelectValue placeholder="Neutral" />
                </SelectTrigger>
                <SelectContent>
                  {VOICE_STYLES.map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      <span className="flex items-center gap-2">
                        <Palette className="size-3.5 text-muted-foreground" />
                        <span className="capitalize">{s.label}</span>
                        <Badge
                          variant="secondary"
                          className="ml-auto px-1.5 py-0 text-[10px] font-normal tabular-nums"
                        >
                          {s.speedMultiplier.toFixed(2)}×
                        </Badge>
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label
                  htmlFor="tts-speed"
                  className="text-sm font-medium text-foreground"
                >
                  Speed
                </label>
                <Badge variant="outline" className="tabular-nums">
                  {speed.toFixed(1)}×
                </Badge>
              </div>
              <div className="flex h-9 items-center px-1">
                <Slider
                  id="tts-speed"
                  value={[speed]}
                  min={0.5}
                  max={2.0}
                  step={0.1}
                  onValueChange={(values) => {
                    const v = values[0];
                    if (typeof v === "number") {
                      setSpeed(Math.round(v * 10) / 10);
                    }
                  }}
                  aria-label="Speech speed"
                />
              </div>
              <div className="flex justify-between text-[10px] text-muted-foreground tabular-nums">
                <span>0.5×</span>
                <span>1.0×</span>
                <span>2.0×</span>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              onClick={handleSynthesize}
              disabled={!canSynthesize}
              className="gap-2"
            >
              {synthesizing ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <AudioLines className="size-4" />
              )}
              {synthesizing ? "Synthesizing…" : "Synthesize"}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setText("");
              }}
              disabled={synthesizing || text.length === 0}
              className="gap-2"
            >
              <RefreshCw className="size-4" />
              Clear
            </Button>
            {overLimit && (
              <span className="flex items-center gap-1.5 text-xs text-destructive">
                <AlertCircle className="size-3.5" />
                Trim the text below {MAX_TEXT} characters.
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      {/* --------------------------- Output ---------------------------- */}
      <Card className="flex flex-col">
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-full bg-primary/10 text-primary">
                <History className="size-5" />
              </div>
              <div>
                <CardTitle className="text-lg">Recent clips</CardTitle>
                <CardDescription>
                  Last {HISTORY_LIMIT} synthesized audio clips.
                </CardDescription>
              </div>
            </div>
            <Badge variant="secondary">{clips.length}/{HISTORY_LIMIT}</Badge>
          </div>
        </CardHeader>
        <CardContent className="flex-1">
          {clips.length === 0 ? (
            <div className="flex h-full min-h-[260px] flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border/70 bg-muted/20 p-6 text-center">
              <div className="flex size-12 items-center justify-center rounded-full bg-muted/60 text-muted-foreground">
                <AudioLines className="size-6" />
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">
                  No clips yet
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Synthesize some text and your audio will appear here.
                </p>
              </div>
            </div>
          ) : (
            <ScrollArea className="h-[420px] pr-3">
              <div className="space-y-3">
                <AnimatePresence initial={false}>
                  {clips.map((clip) => {
                    const clipVoiceMeta = getVoiceById(clip.voice);
                    const clipLangCode =
                      clipVoiceMeta?.languageCode ?? clip.language ?? "";
                    const clipLangBase = clipLangCode.split("-")[0].toLowerCase();
                    const clipLangRecord = LANGUAGES.find(
                      (l) => l.code.toLowerCase() === clipLangBase,
                    );
                    return (
                      <motion.div
                        key={clip.id}
                        layout
                        initial={{ opacity: 0, y: 8, scale: 0.98 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        transition={{ duration: 0.2 }}
                        className="rounded-lg border border-border/70 bg-card/60 p-3 shadow-sm"
                      >
                        <div className="mb-2 flex items-start justify-between gap-2">
                          <p
                            className="line-clamp-2 flex-1 text-sm text-foreground"
                            dir={clip.rtl ? "rtl" : "ltr"}
                          >
                            {clip.text}
                          </p>
                          <button
                            type="button"
                            onClick={() => handleRemoveClip(clip.id)}
                            className="shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                            aria-label="Remove clip"
                          >
                            <Trash2 className="size-4" />
                          </button>
                        </div>
                        <div className="mb-2 flex flex-wrap items-center gap-1.5">
                          <Badge variant="secondary" className="gap-1">
                            <Volume2 className="size-3" />
                            {clipVoiceMeta?.name ?? clip.voice}
                          </Badge>
                          {clipLangRecord && (
                            <Badge variant="secondary" className="gap-1">
                              <Globe className="size-3" />
                              {clipLangRecord.name}
                            </Badge>
                          )}
                          <Badge
                            variant="outline"
                            className="gap-1 capitalize"
                          >
                            {clip.style}
                          </Badge>
                          <Badge variant="outline" className="tabular-nums">
                            {clip.speed.toFixed(1)}×
                          </Badge>
                          {clip.fellBack && (
                            <Badge
                              variant="outline"
                              className="gap-1 border-amber-500/40 text-amber-600 dark:text-amber-400"
                            >
                              <AlertCircle className="size-3" />
                              Fallback
                            </Badge>
                          )}
                          <span className="ml-auto text-[10px] text-muted-foreground">
                            {new Date(clip.createdAt).toLocaleTimeString()}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <audio
                            controls
                            src={clip.url}
                            className="h-9 min-w-0 flex-1"
                            preload="metadata"
                          />
                          <Button
                            asChild
                            size="sm"
                            variant="outline"
                            className="gap-1.5"
                          >
                            <a
                              href={clip.url}
                              download={`tts-${clip.id}.${
                                clip.provider === "zai" ? "wav" : "mp3"
                              }`}
                            >
                              <Download className="size-3.5" />
                              <span className="sr-only sm:not-sr-only">
                                Download
                              </span>
                            </a>
                          </Button>
                        </div>
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ASR Tab
// ---------------------------------------------------------------------------

type AsrStatus = "idle" | "recording" | "stopped" | "processing" | "done";

function AsrTab() {
  const { toast } = useToast();

  const [status, setStatus] = React.useState<AsrStatus>("idle");
  const [elapsed, setElapsed] = React.useState(0);
  const [transcript, setTranscript] = React.useState<string>("");
  const [copied, setCopied] = React.useState(false);

  const mediaRecorderRef = React.useRef<MediaRecorder | null>(null);
  const chunksRef = React.useRef<BlobPart[]>([]);
  const streamRef = React.useRef<MediaStream | null>(null);
  const timerRef = React.useRef<ReturnType<typeof setInterval> | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);

  const cleanupDevices = React.useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    mediaRecorderRef.current = null;
    chunksRef.current = [];
  }, []);

  React.useEffect(() => () => cleanupDevices(), [cleanupDevices]);

  const startTimer = React.useCallback(() => {
    setElapsed(0);
    timerRef.current = setInterval(() => {
      setElapsed((e) => e + 1);
    }, 1000);
  }, []);

  const stopTimer = React.useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const transcribe = React.useCallback(
    async (blob: Blob, suggestedName = "recording.webm") => {
      if (!blob || blob.size === 0) {
        toast({
          variant: "destructive",
          title: "Empty recording",
          description: "No audio was captured. Try again.",
        });
        return;
      }
      setStatus("processing");
      setTranscript("");
      try {
        const file = new File([blob], suggestedName, { type: blob.type });
        const fd = new FormData();
        fd.append("audio", file);

        const res = await fetch("/api/asr", { method: "POST", body: fd });
        const data = (await res.json().catch(() => null)) as
          | { text?: string; error?: string }
          | null;

        if (!res.ok) {
          throw new Error(
            data?.error || `Transcription failed (HTTP ${res.status}).`,
          );
        }
        if (!data || typeof data.text !== "string") {
          throw new Error("Malformed response from transcription service.");
        }

        setTranscript(data.text);
        setStatus("done");
        toast({
          title: "Transcription ready",
          description: `${data.text.length} characters recognized.`,
        });
      } catch (err) {
        console.error("[voice-lab/asr] error:", err);
        setStatus("idle");
        toast({
          variant: "destructive",
          title: "Transcription failed",
          description:
            err instanceof Error ? err.message : "Please try again later.",
        });
      }
    },
    [toast],
  );

  const handleStartRecording = React.useCallback(async () => {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      toast({
        variant: "destructive",
        title: "Microphone unavailable",
        description: "Your browser does not support microphone access.",
      });
      return;
    }
    if (mediaRecorderRef.current?.state === "recording") return;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const mimeType = pickSupportedMimeType();
      let recorder: MediaRecorder;
      try {
        recorder = mimeType
          ? new MediaRecorder(stream, { mimeType })
          : new MediaRecorder(stream);
      } catch {
        recorder = new MediaRecorder(stream);
      }
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      recorder.onstop = () => {
        const mimeType = recorder.mimeType || "audio/webm";
        const blob = new Blob(chunksRef.current, { type: mimeType });
        const ext = mimeType.includes("mp4")
          ? "m4a"
          : mimeType.includes("ogg")
            ? "ogg"
            : "webm";
        cleanupDevices();
        void transcribe(blob, `recording.${ext}`);
      };

      recorder.onerror = () => {
        cleanupDevices();
        setStatus("idle");
        toast({
          variant: "destructive",
          title: "Recording error",
          description: "Microphone capture was interrupted.",
        });
      };

      recorder.start();
      setStatus("recording");
      startTimer();
    } catch (err) {
      console.error("[voice-lab/asr] mic error:", err);
      cleanupDevices();
      setStatus("idle");
      const message =
        err instanceof Error ? err.message : "Microphone access failed.";
      const isPermission =
        err instanceof DOMException &&
        (err.name === "NotAllowedError" || err.name === "SecurityError");
      toast({
        variant: "destructive",
        title: isPermission ? "Microphone blocked" : "Recording failed",
        description: isPermission
          ? "Allow microphone access in your browser settings and try again."
          : message,
      });
    }
  }, [cleanupDevices, startTimer, toast, transcribe]);

  const handleStopRecording = React.useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      recorder.stop();
    }
    stopTimer();
    setStatus("stopped");
  }, [stopTimer]);

  const handleFileChange = React.useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      // Reset input value so picking the same file twice still fires change.
      e.target.value = "";
      if (!file) return;

      const baseType = (file.type || "").split(";")[0].toLowerCase();
      const ok =
        baseType.startsWith("audio/") ||
        /\.(webm|wav|mp3|m4a|ogg|mp4)$/i.test(file.name);
      if (!ok) {
        toast({
          variant: "destructive",
          title: "Unsupported file",
          description: "Please pick an audio file (webm, wav, mp3, m4a, ogg).",
        });
        return;
      }
      void transcribe(file, file.name);
    },
    [toast, transcribe],
  );

  const handleCopy = React.useCallback(async () => {
    if (!transcript) return;
    try {
      await navigator.clipboard.writeText(transcript);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast({
        variant: "destructive",
        title: "Copy failed",
        description: "Clipboard access was denied.",
      });
    }
  }, [transcript, toast]);

  const handleReset = React.useCallback(() => {
    setTranscript("");
    setStatus("idle");
    setElapsed(0);
  }, []);

  const isRecording = status === "recording";
  const isProcessing = status === "processing";

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      {/* --------------------------- Capture --------------------------- */}
      <Card className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-primary/15 via-primary/5 to-transparent" />
        <CardHeader className="relative">
          <div className="flex items-center gap-3">
            <div className="relative flex size-10 items-center justify-center rounded-full bg-primary/15 text-primary">
              <Mic className="size-5" />
              {isRecording && (
                <span className="absolute -right-0.5 -top-0.5 flex size-2.5">
                  <span className="absolute inline-flex size-full animate-ping rounded-full bg-red-500 opacity-70" />
                  <span className="relative inline-flex size-2.5 rounded-full bg-red-500" />
                </span>
              )}
            </div>
            <div>
              <CardTitle className="text-lg">Speech → Text</CardTitle>
              <CardDescription>
                Record from your microphone or upload an audio file.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="relative space-y-6">
          {/* Recording studio card */}
          <div className="rounded-xl border border-border/70 bg-muted/20 p-6">
            <div className="flex flex-col items-center gap-4 text-center">
              <div className="relative flex size-24 items-center justify-center">
                <div
                  className={cn(
                    "absolute inset-0 rounded-full border-2 transition-colors",
                    isRecording
                      ? "border-red-500/40"
                      : "border-border/60",
                  )}
                />
                {isRecording && (
                  <>
                    <div className="absolute inset-0 animate-ping rounded-full bg-red-500/15" />
                    <div className="absolute inset-2 animate-pulse rounded-full bg-red-500/15" />
                  </>
                )}
                <button
                  type="button"
                  onClick={isRecording ? handleStopRecording : handleStartRecording}
                  disabled={isProcessing}
                  aria-label={isRecording ? "Stop recording" : "Start recording"}
                  className={cn(
                    "relative flex size-16 items-center justify-center rounded-full text-white shadow-lg transition-all hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50",
                    isRecording
                      ? "bg-red-500 hover:bg-red-600"
                      : "bg-primary hover:bg-primary/90",
                  )}
                >
                  {isRecording ? (
                    <Square className="size-6" fill="currentColor" />
                  ) : (
                    <Mic className="size-7" />
                  )}
                </button>
              </div>

              <div>
                <p className="text-sm font-medium text-foreground">
                  {isRecording
                    ? "Recording…"
                    : isProcessing
                      ? "Processing audio…"
                      : status === "done"
                        ? "Ready to record again"
                        : "Tap the mic to start"}
                </p>
                <p className="mt-1 font-mono text-2xl tabular-nums text-foreground">
                  {formatTime(elapsed)}
                </p>
              </div>

              <div className="flex flex-wrap items-center justify-center gap-2">
                {isRecording ? (
                  <Button
                    type="button"
                    variant="destructive"
                    onClick={handleStopRecording}
                    className="gap-2"
                  >
                    <Square className="size-4" fill="currentColor" />
                    Stop &amp; Transcribe
                  </Button>
                ) : (
                  <Button
                    type="button"
                    onClick={handleStartRecording}
                    disabled={isProcessing}
                    className="gap-2"
                  >
                    {isProcessing ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Mic className="size-4" />
                    )}
                    {isProcessing ? "Transcribing…" : "Start recording"}
                  </Button>
                )}
              </div>
            </div>
          </div>

          {/* Upload alternative */}
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <span className="h-px flex-1 bg-border/70" />
              <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                or upload a file
              </span>
              <span className="h-px flex-1 bg-border/70" />
            </div>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isProcessing || isRecording}
              className={cn(
                "group flex w-full flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border/70 bg-background/40 px-4 py-6 text-center transition-colors",
                "hover:border-primary/40 hover:bg-primary/5",
                "disabled:cursor-not-allowed disabled:opacity-50",
              )}
            >
              <Upload className="size-5 text-muted-foreground transition-colors group-hover:text-primary" />
              <div>
                <p className="text-sm font-medium text-foreground">
                  Click to upload audio
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  webm · wav · mp3 · m4a · ogg (max 25MB)
                </p>
              </div>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="audio/*"
              onChange={handleFileChange}
              className="sr-only"
              aria-label="Upload an audio file"
            />
          </div>
        </CardContent>
      </Card>

      {/* --------------------------- Transcript ------------------------ */}
      <Card className="flex flex-col">
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-full bg-primary/10 text-primary">
                <AudioLines className="size-5" />
              </div>
              <div>
                <CardTitle className="text-lg">Transcript</CardTitle>
                <CardDescription>
                  Recognized speech appears here — copy or clear it.
                </CardDescription>
              </div>
            </div>
            {transcript && (
              <Badge variant="secondary">{transcript.length} chars</Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="flex-1">
          {isProcessing ? (
            <div className="space-y-3" aria-busy="true" aria-live="polite">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin text-primary" />
                Listening carefully…
              </div>
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-[92%]" />
              <Skeleton className="h-4 w-[78%]" />
              <Skeleton className="h-4 w-[95%]" />
              <Skeleton className="h-4 w-[60%]" />
              <div className="flex items-center gap-1.5 pt-2">
                <span className="size-1.5 animate-bounce rounded-full bg-primary/70 [animation-delay:-0.3s]" />
                <span className="size-1.5 animate-bounce rounded-full bg-primary/70 [animation-delay:-0.15s]" />
                <span className="size-1.5 animate-bounce rounded-full bg-primary/70" />
              </div>
            </div>
          ) : transcript ? (
            <div className="flex h-full flex-col gap-3">
              <ScrollArea className="h-[360px] rounded-md border border-border/60 bg-background/40 p-4">
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
                  {transcript}
                </p>
              </ScrollArea>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={handleCopy}
                  className="gap-1.5"
                >
                  {copied ? (
                    <>
                      <Check className="size-3.5 text-emerald-500" />
                      Copied
                    </>
                  ) : (
                    <>
                      <Copy className="size-3.5" />
                      Copy
                    </>
                  )}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={handleReset}
                  className="gap-1.5"
                >
                  <RefreshCw className="size-3.5" />
                  Clear
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex h-full min-h-[260px] flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border/70 bg-muted/20 p-6 text-center">
              <div className="flex size-12 items-center justify-center rounded-full bg-muted/60 text-muted-foreground">
                <Volume2 className="size-6" />
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">
                  No transcript yet
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Record or upload audio and the recognized text will show up
                  here.
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Voice Lab (entrypoint)
// ---------------------------------------------------------------------------

export function VoiceLab() {
  const [tab, setTab] = React.useState<string>("tts");

  return (
    <div className="space-y-6">
      <Card className="relative overflow-hidden border-border/60">
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-transparent" />
        <CardHeader className="relative">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <div className="flex size-11 items-center justify-center rounded-xl bg-primary/15 text-primary ring-1 ring-primary/20">
                <AudioWaveform className="size-5" />
              </div>
              <div>
                <CardTitle className="flex items-center gap-2 text-xl">
                  Voice Lab
                  <Badge variant="secondary" className="gap-1">
                    <Sparkles className="size-3" />
                    TTS + ASR
                  </Badge>
                </CardTitle>
                <CardDescription>
                  Synthesize speech from text and transcribe audio back to text
                  — powered by ZAI.
                </CardDescription>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="relative">
          <Tabs value={tab} onValueChange={setTab} className="w-full">
            <TabsList className="grid w-full max-w-md grid-cols-2">
              <TabsTrigger value="tts" className="gap-1.5">
                <AudioLines className="size-4" />
                Text → Speech
              </TabsTrigger>
              <TabsTrigger value="asr" className="gap-1.5">
                <Mic className="size-4" />
                Speech → Text
              </TabsTrigger>
            </TabsList>
            <TabsContent value="tts" className="mt-6 focus-visible:outline-none">
              <TtsTab />
            </TabsContent>
            <TabsContent value="asr" className="mt-6 focus-visible:outline-none">
              <AsrTab />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
