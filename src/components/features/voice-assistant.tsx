"use client";

/**
 * VoiceAssistant — the global "Hey DevForge" overlay.
 *
 * Mounted once in app/layout.tsx so it works across every view. The
 * overlay has three jobs:
 *
 *   1. Pulsing mic icon — visual indicator that wake-word listening is on.
 *   2. Status banner — when the user is armed / capturing, show their
 *      interim transcript and a Cancel button.
 *   3. Reply playback — when the AI replies, TTS the response and show
 *      a collapsible transcript card.
 *
 * The overlay is OFF by default. The user enables it in Settings →
 * Voice Assistant. When disabled, this component renders null.
 *
 * NOTE: this component must NOT break the existing Voice Lab feature.
 * Voice Lab is a full-page studio for TTS/ASR experimentation; the
 * VoiceAssistant overlay is a global shortcut layer. They share the
 * /api/tts and /api/asr endpoints but are otherwise independent.
 */

import * as React from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Mic,
  MicOff,
  Square,
  Volume2,
  VolumeX,
  Sparkles,
  X,
  AlertCircle,
  Loader2,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/components/language-provider";
import { useSettings } from "@/components/layout/settings";
import { useWakeWord, type WakeWordState } from "@/hooks/use-wake-word";
import { useContextEngine } from "@/hooks/use-context";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function stateLabel(state: WakeWordState, t: (k: string) => string): string {
  switch (state) {
    case "listening":
      return t("voiceAssistant.listening");
    case "armed":
      return t("voiceAssistant.armed");
    case "capturing":
      return t("voiceAssistant.capturing");
    default:
      return t("voiceAssistant.idle");
  }
}

function stateColor(state: WakeWordState): string {
  switch (state) {
    case "listening":
      return "bg-primary";
    case "armed":
      return "bg-amber-500";
    case "capturing":
      return "bg-emerald-500";
    default:
      return "bg-muted-foreground";
  }
}

interface VoiceReply {
  id: string;
  text: string;
  audioUrl: string | null;
  playing: boolean;
}

export function VoiceAssistant() {
  const { t } = useLanguage();
  const { toast } = useToast();
  const { settings } = useSettings();
  const ctxEngine = useContextEngine();

  // Voice assistant is OFF by default — the user must enable it in Settings.
  const enabled = Boolean(settings.voiceAssistant?.enabled);
  const ttsReply = settings.voiceAssistant?.ttsReply !== false;
  const autoExtract = Boolean(settings.voiceAssistant?.autoExtractMemories);

  const [replies, setReplies] = React.useState<VoiceReply[]>([]);
  const [activeReplyId, setActiveReplyId] = React.useState<string | null>(null);
  const audioRef = React.useRef<HTMLAudioElement | null>(null);

  // -------------------------------------------------------------------------
  // Command handler — called by useWakeWord when the user finishes speaking.
  // -------------------------------------------------------------------------

  const handleCommand = React.useCallback(
    async (transcript: string) => {
      try {
        const context = await ctxEngine.gatherForChat("voice");
        const res = await fetch("/api/voice/command", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            transcript,
            session: "voice",
            slot: settings.defaultChatSlot,
            consent: ctxEngine.consent,
            selection: context.selection,
            devforgeView: context.devforgeView,
            extractMemories: autoExtract,
          }),
        });
        const data = (await res.json().catch(() => ({}))) as {
          reply?: string;
          id?: string;
          error?: string;
        };
        if (!res.ok || !data.reply) {
          throw new Error(data.error || "Voice command failed.");
        }

        const replyId = data.id || `v-${Date.now()}`;
        let audioUrl: string | null = null;

        // TTS the reply (best-effort — non-fatal if it fails).
        if (ttsReply) {
          try {
            const ttsRes = await fetch("/api/tts", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                text: data.reply.slice(0, 1000),
                voice: settings.defaultTtsVoice,
                speed: settings.defaultTtsSpeed,
              }),
            });
            if (ttsRes.ok) {
              const blob = await ttsRes.blob();
              audioUrl = URL.createObjectURL(blob);
            }
          } catch (ttsErr) {
            console.warn("[voice-assistant] TTS failed:", ttsErr);
          }
        }

        const newReply: VoiceReply = {
          id: replyId,
          text: data.reply,
          audioUrl,
          playing: false,
        };
        setReplies((prev) => [newReply, ...prev].slice(0, 5));

        // Auto-play the TTS audio if we got it.
        if (audioUrl) {
          setActiveReplyId(replyId);
          // Defer to next tick so the <audio> element renders.
          setTimeout(() => playReply(replyId, audioUrl!), 0);
        }
      } catch (err) {
        toast({
          variant: "destructive",
          title: t("voiceAssistant.commandFailed"),
          description:
            err instanceof Error ? err.message : t("voiceAssistant.tryAgain"),
        });
      }
    },
    [autoExtract, ctxEngine, settings.defaultChatSlot, settings.defaultTtsVoice, settings.defaultTtsSpeed, ttsReply, toast, t],
  );

  // -------------------------------------------------------------------------
  // Wake-word hook
  // -------------------------------------------------------------------------

  const wake = useWakeWord({
    enabled,
    onCommand: handleCommand,
    lang: "en-US",
  });

  // Surface wake-word errors as toasts (throttled — the hook can fire the
  // same error repeatedly during auto-restart).
  const lastErrorRef = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (!wake.error) return;
    if (lastErrorRef.current === wake.error) return;
    lastErrorRef.current = wake.error;
    toast({
      variant: "destructive",
      title: t("voiceAssistant.error"),
      description: wake.error,
    });
  }, [wake.error, toast, t]);

  // -------------------------------------------------------------------------
  // Audio playback
  // -------------------------------------------------------------------------

  const playReply = React.useCallback((id: string, url: string) => {
    if (audioRef.current) {
      try {
        audioRef.current.pause();
      } catch {
        /* noop */
      }
    }
    const audio = new Audio(url);
    audioRef.current = audio;
    audio.onplay = () => {
      setReplies((prev) =>
        prev.map((r) => ({ ...r, playing: r.id === id })),
      );
    };
    audio.onended = () => {
      setReplies((prev) =>
        prev.map((r) => ({ ...r, playing: false })),
      );
    };
    audio.onpause = () => {
      setReplies((prev) =>
        prev.map((r) => ({ ...r, playing: false })),
      );
    };
    void audio.play().catch(() => {
      /* autoplay blocked — user can press play manually */
    });
  }, []);

  const stopPlayback = React.useCallback(() => {
    if (audioRef.current) {
      try {
        audioRef.current.pause();
      } catch {
        /* noop */
      }
      audioRef.current = null;
    }
    setReplies((prev) => prev.map((r) => ({ ...r, playing: false })));
  }, []);

  const dismissReply = React.useCallback((id: string) => {
    setReplies((prev) => {
      const target = prev.find((r) => r.id === id);
      if (target?.audioUrl) {
        try {
          URL.revokeObjectURL(target.audioUrl);
        } catch {
          /* noop */
        }
      }
      return prev.filter((r) => r.id !== id);
    });
    setActiveReplyId((cur) => (cur === id ? null : cur));
  }, []);

  // Cleanup audio on unmount.
  React.useEffect(() => {
    return () => {
      if (audioRef.current) {
        try {
          audioRef.current.pause();
        } catch {
          /* noop */
        }
      }
      replies.forEach((r) => {
        if (r.audioUrl) {
          try {
            URL.revokeObjectURL(r.audioUrl);
          } catch {
            /* noop */
          }
        }
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!enabled) return null;

  return (
    <>
      {/* Floating mic button */}
      <div className="pointer-events-none fixed bottom-5 right-5 z-40 flex flex-col items-end gap-3">
        <AnimatePresence>
          {replies.map((r) => (
            <ReplyCard
              key={r.id}
              reply={r}
              onPlay={() => r.audioUrl && playReply(r.id, r.audioUrl)}
              onStop={stopPlayback}
              onDismiss={() => dismissReply(r.id)}
            />
          ))}
        </AnimatePresence>

        <AnimatePresence>
          {wake.state !== "idle" && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              transition={{ duration: 0.18 }}
              className="pointer-events-auto flex items-center gap-2 rounded-full border bg-card/90 px-3 py-1.5 shadow-lg backdrop-blur"
            >
              <span
                className={cn(
                  "h-2 w-2 rounded-full",
                  stateColor(wake.state),
                  wake.state === "listening" && "animate-pulse",
                )}
              />
              <span className="text-xs font-medium">
                {stateLabel(wake.state, t)}
              </span>
              {wake.interimTranscript && (
                <span className="max-w-[160px] truncate text-xs text-muted-foreground">
                  {wake.interimTranscript}
                </span>
              )}
              <Button
                size="sm"
                variant="ghost"
                className="h-6 w-6 p-0"
                onClick={wake.abort}
                aria-label={t("voiceAssistant.cancel")}
              >
                <X className="h-3 w-3" />
              </Button>
            </motion.div>
          )}
        </AnimatePresence>

        <button
          type="button"
          onClick={() => {
            if (wake.state === "idle") {
              wake.start();
            } else {
              wake.abort();
            }
          }}
          className="pointer-events-auto relative flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-xl shadow-primary/30 transition-transform hover:scale-105 active:scale-95"
          aria-label={t("voiceAssistant.toggle")}
          title={t("voiceAssistant.toggle")}
        >
          {/* Pulsing rings while listening */}
          {wake.state === "listening" && (
            <>
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-60" />
              <span className="absolute inline-flex h-[120%] w-[120%] animate-ping rounded-full bg-primary opacity-30" style={{ animationDelay: "0.4s" }} />
            </>
          )}
          {wake.state === "armed" || wake.state === "capturing" ? (
            <Square className="h-5 w-5 fill-current" />
          ) : (
            <Mic className="h-6 w-6" />
          )}
          {!wake.supported && (
            <MicOff className="absolute -bottom-1 -right-1 h-4 w-4 rounded-full bg-destructive p-0.5 text-destructive-foreground" />
          )}
        </button>
      </div>

      {/* Unsupported / no-mic warning banner */}
      {enabled && !wake.supported && (
        <div className="fixed bottom-24 right-5 z-40 max-w-xs rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-400">
          <div className="flex items-start gap-2">
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <div>
              <p className="font-medium">{t("voiceAssistant.unsupportedTitle")}</p>
              <p className="mt-0.5 text-amber-600 dark:text-amber-500">
                {t("voiceAssistant.unsupportedBody")}
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// ReplyCard — shows one AI reply (text + audio playback controls)
// ---------------------------------------------------------------------------

function ReplyCard({
  reply,
  onPlay,
  onStop,
  onDismiss,
}: {
  reply: VoiceReply;
  onPlay: () => void;
  onStop: () => void;
  onDismiss: () => void;
}) {
  const { t } = useLanguage();
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 8, scale: 0.95 }}
      transition={{ duration: 0.2 }}
      className="pointer-events-auto w-72 overflow-hidden rounded-xl border bg-card/95 shadow-xl backdrop-blur"
    >
      <div className="flex items-center justify-between gap-2 border-b bg-gradient-to-r from-primary/10 to-transparent px-3 py-2">
        <div className="flex items-center gap-1.5 text-xs font-semibold">
          <Sparkles className="h-3.5 w-3.5 text-primary" />
          DevForge AI
          <Badge variant="outline" className="px-1.5 py-0 text-[9px] font-normal">
            voice
          </Badge>
        </div>
        <Button
          size="sm"
          variant="ghost"
          className="h-6 w-6 p-0"
          onClick={onDismiss}
          aria-label={t("common.close")}
        >
          <X className="h-3 w-3" />
        </Button>
      </div>
      <div className="px-3 py-2.5 text-xs leading-relaxed text-foreground/90">
        {reply.text}
      </div>
      {reply.audioUrl && (
        <div className="flex items-center gap-2 border-t bg-muted/30 px-3 py-1.5">
          {reply.playing ? (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 gap-1.5 px-2 text-xs"
              onClick={onStop}
            >
              <VolumeX className="h-3 w-3" />
              {t("voiceAssistant.stop")}
            </Button>
          ) : (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 gap-1.5 px-2 text-xs"
              onClick={onPlay}
            >
              <Volume2 className="h-3 w-3" />
              {t("voiceAssistant.play")}
            </Button>
          )}
          {reply.playing && (
            <Loader2 className="h-3 w-3 animate-spin text-primary" />
          )}
        </div>
      )}
    </motion.div>
  );
}
