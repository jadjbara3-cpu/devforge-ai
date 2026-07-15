"use client";

/**
 * useWakeWord — continuous wake-word detection using the Web Speech API.
 *
 * --------------------------------------------------------------------
 * Why Web Speech API (and not a custom model)?
 * --------------------------------------------------------------------
 * The browser's built-in SpeechRecognition (Chromium / WebKit) is free,
 * has no extra deps, and runs entirely on-device in supporting browsers.
 * It's accurate enough for a wake phrase like "Hey DevForge" and lets us
 * ship the feature with zero model downloads.
 *
 * --------------------------------------------------------------------
 * State machine
 * --------------------------------------------------------------------
 *   idle  →  listening  →  armed  →  capturing  →  idle
 *
 *   idle       : mic off, recognition off
 *   listening  : recognition running, watching for the wake phrase
 *   armed      : wake phrase detected, waiting for command (timeout: 6s)
 *   capturing  : recording the actual command via MediaRecorder (max 12s)
 *
 * After capturing, the hook POSTs the audio to /api/asr to get the text,
 * then calls the `onCommand` callback with the transcript. The caller is
 * responsible for sending it to /api/voice/command and TTSing the reply.
 *
 * --------------------------------------------------------------------
 * Tauri / background notes
 * --------------------------------------------------------------------
 * When DevForge ships as a Tauri app, the Web Speech API keeps working as
 * long as the WebView has mic permission. Background wake-word detection
 * requires the OS to keep the WebView alive — the Tauri config can opt
 * into this with `tauri.conf.json → windows → hidden` plus a tray icon.
 * The hook itself is unaware of Tauri; it just keeps the SpeechRecognition
 * loop alive until `enabled` is set to false.
 */

import * as React from "react";

// ---------------------------------------------------------------------------
// Minimal Web Speech API typings (the lib.dom.d.ts in some TS versions
// doesn't include these). We declare just enough to type-check.
// ---------------------------------------------------------------------------

interface SpeechRecognitionAlternativeLike {
  transcript: string;
  confidence: number;
}
interface SpeechRecognitionResultLike {
  isFinal: boolean;
  length: number;
  0: SpeechRecognitionAlternativeLike;
  [index: number]: SpeechRecognitionAlternativeLike;
}
interface SpeechRecognitionResultListLike {
  length: number;
  [index: number]: SpeechRecognitionResultLike;
}
interface SpeechRecognitionEventLike extends Event {
  resultIndex: number;
  results: SpeechRecognitionResultListLike;
}
interface SpeechRecognitionErrorEventLike extends Event {
  error: string;
  message?: string;
}
interface SpeechRecognitionLike extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: SpeechRecognitionEventLike) => void) | null;
  onerror: ((e: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
}
type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function getSpeechRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

// ---------------------------------------------------------------------------
// Wake-word matching
// ---------------------------------------------------------------------------

/**
 * Normalise a transcript for matching: lowercase, strip punctuation,
 * collapse whitespace. We match generously — "hey dev forge", "he devforge",
 * "ok dev forge" all count.
 */
function normalise(s: string): string {
  return s
    .toLowerCase()
    .replace(/[\u2018\u2019\u201c\u201d]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const WAKE_PATTERNS: RegExp[] = [
  /^hey devforge\b/,
  /^hey dev forge\b/,
  /^ok devforge\b/,
  /^ok dev forge\b/,
  /^he devforge\b/,
  /^hi devforge\b/,
  /^devforge\b/, // bare invocation
];

export function isWakePhrase(transcript: string): boolean {
  const n = normalise(transcript);
  if (!n) return false;
  return WAKE_PATTERNS.some((re) => re.test(n));
}

/**
 * Strip the wake phrase from a transcript so the AI doesn't see it.
 * "Hey DevForge, what's the weather?" → "what's the weather?"
 */
export function stripWakePhrase(transcript: string): string {
  const n = normalise(transcript);
  for (const re of WAKE_PATTERNS) {
    const m = re.exec(n);
    if (m) {
      const stripped = n.slice(m[0].length).trim();
      // The normalised version isn't a perfect substring of the original
      // (punctuation was stripped), so return the original minus the
      // matched length as a best-effort. Most of the time the wake word
      // is the leading word(s) so this works fine.
      return stripped || transcript;
    }
  }
  return transcript;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export type WakeWordState = "idle" | "listening" | "armed" | "capturing";

export interface UseWakeWordOptions {
  /** Master switch — when false, the hook stays in `idle`. */
  enabled: boolean;
  /** Called when the user has spoken a full command (transcribed). */
  onCommand: (transcript: string) => void;
  /** Called whenever the state changes. */
  onStateChange?: (state: WakeWordState) => void;
  /** ISO language code for recognition. Default "en-US". */
  lang?: string;
  /** Seconds to wait for a command after the wake word. Default 6. */
  armedTimeoutMs?: number;
  /** Max seconds to record the command. Default 12. */
  captureTimeoutMs?: number;
}

export interface UseWakeWordResult {
  state: WakeWordState;
  /** True when the browser supports SpeechRecognition. */
  supported: boolean;
  /** True when the user has granted mic permission. */
  hasMicPermission: boolean | null;
  /** Latest interim transcript (for the UI). */
  interimTranscript: string;
  /** Latest captured transcript (set when armed/capturing finishes). */
  lastCommand: string | null;
  /** Manually start the loop (also starts automatically when enabled). */
  start: () => void;
  /** Manually stop and reset to idle. */
  stop: () => void;
  /** Manually abort a capture (treated as "cancel"). */
  abort: () => void;
  /** Error message if the recognition failed (cleared on start). */
  error: string | null;
}

export function useWakeWord(opts: UseWakeWordOptions): UseWakeWordResult {
  const {
    enabled,
    onCommand,
    onStateChange,
    lang = "en-US",
    armedTimeoutMs = 6_000,
    captureTimeoutMs = 12_000,
  } = opts;

  const [state, setState] = React.useState<WakeWordState>("idle");
  const [supported, setSupported] = React.useState<boolean>(false);
  const [hasMicPermission, setHasMicPermission] = React.useState<boolean | null>(null);
  const [interimTranscript, setInterimTranscript] = React.useState<string>("");
  const [lastCommand, setLastCommand] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const recognitionRef = React.useRef<SpeechRecognitionLike | null>(null);
  const mediaRecorderRef = React.useRef<MediaRecorder | null>(null);
  const streamRef = React.useRef<MediaStream | null>(null);
  const chunksRef = React.useRef<BlobPart[]>([]);
  const armedTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const captureTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const manualStopRef = React.useRef<boolean>(false);
  const onCommandRef = React.useRef(onCommand);
  const onStateChangeRef = React.useRef(onStateChange);

  // Keep the latest callback without re-subscribing recognition events.
  React.useEffect(() => {
    onCommandRef.current = onCommand;
  }, [onCommand]);
  React.useEffect(() => {
    onStateChangeRef.current = onStateChange;
  }, [onStateChange]);

  // Detect support on mount.
  React.useEffect(() => {
    setSupported(getSpeechRecognitionCtor() !== null);
  }, []);

  const setSafeState = React.useCallback((next: WakeWordState) => {
    setState((prev) => {
      if (prev === next) return prev;
      onStateChangeRef.current?.(next);
      return next;
    });
  }, []);

  // -------------------------------------------------------------------------
  // Recognition lifecycle
  // -------------------------------------------------------------------------

  const stopRecognition = React.useCallback(() => {
    const r = recognitionRef.current;
    if (r) {
      try {
        r.onresult = null;
        r.onerror = null;
        r.onend = null;
        r.onstart = null;
        r.abort();
      } catch {
        /* noop */
      }
      recognitionRef.current = null;
    }
  }, []);

  const startRecognition = React.useCallback(
    (mode: "wake" | "command") => {
      const Ctor = getSpeechRecognitionCtor();
      if (!Ctor) {
        setError("Speech recognition is not supported in this browser.");
        return;
      }
      stopRecognition();

      const r = new Ctor();
      r.lang = lang;
      r.continuous = mode === "command";
      r.interimResults = true;
      r.maxAlternatives = 1;

      r.onstart = () => {
        setError(null);
      };

      r.onresult = (event: SpeechRecognitionEventLike) => {
        let finalText = "";
        let interim = "";
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const res = event.results[i];
          if (!res) continue;
          const alt = res[0];
          if (!alt) continue;
          if (res.isFinal) finalText += alt.transcript;
          else interim += alt.transcript;
        }

        if (mode === "wake") {
          const candidate = finalText || interim;
          setInterimTranscript(candidate);
          if (finalText && isWakePhrase(finalText)) {
            // Wake word detected — stop wake listener, start MediaRecorder.
            stopRecognition();
            setInterimTranscript("");
            setSafeState("armed");
            startCapture();
          }
        } else {
          // command mode — show interim, fire on final
          setInterimTranscript(interim || finalText);
          if (finalText.trim()) {
            const cleaned = stripWakePhrase(finalText).trim();
            stopRecognition();
            setLastCommand(cleaned);
            setInterimTranscript("");
            setSafeState("idle");
            if (cleaned) onCommandRef.current(cleaned);
          }
        }
      };

      r.onerror = (e: SpeechRecognitionErrorEventLike) => {
        if (e.error === "not-allowed" || e.error === "service-not-allowed") {
          setHasMicPermission(false);
          setError("Microphone permission denied.");
          setSafeState("idle");
        } else if (e.error === "no-speech") {
          // benign — onend will restart us
        } else if (e.error === "aborted") {
          // manual stop — do nothing
        } else {
          setError(e.error || "Speech recognition error.");
        }
      };

      r.onend = () => {
        // Auto-restart unless we manually stopped or moved into capture.
        if (manualStopRef.current) {
          manualStopRef.current = false;
          return;
        }
        if (mode === "wake" && enabled) {
          try {
            r.start();
          } catch {
            /* already started */
          }
        }
      };

      recognitionRef.current = r;
      try {
        r.start();
      } catch {
        /* can throw if start() is called twice — ignore */
      }
    },
    // startCapture is defined below; we use a ref to dodge the cycle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [enabled, lang, setSafeState, stopRecognition],
  );

  // -------------------------------------------------------------------------
  // MediaRecorder lifecycle — used to capture the actual command audio.
  // We DON'T transcribe it client-side; we POST the blob to /api/asr for
  // transcription (more reliable across browsers and languages).
  // -------------------------------------------------------------------------

  const startCapture = React.useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setError("Microphone capture is not supported in this browser.");
      setSafeState("idle");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      setHasMicPermission(true);

      const mimeCandidates = [
        "audio/webm;codecs=opus",
        "audio/webm",
        "audio/ogg;codecs=opus",
        "audio/mp4",
      ];
      let mimeType = "";
      for (const t of mimeCandidates) {
        try {
          if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(t)) {
            mimeType = t;
            break;
          }
        } catch {
          /* ignore */
        }
      }

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
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        const blob = new Blob(chunksRef.current, {
          type: recorder.mimeType || "audio/webm",
        });
        cleanupDevices();

        if (blob.size === 0) {
          setSafeState("idle");
          return;
        }

        setSafeState("capturing");
        try {
          const fd = new FormData();
          const ext = (recorder.mimeType || "").includes("mp4") ? "m4a" : "webm";
          fd.append("audio", blob, `command.${ext}`);
          const res = await fetch("/api/asr", { method: "POST", body: fd });
          const data = (await res.json().catch(() => ({}))) as {
            text?: string;
            error?: string;
          };
          if (!res.ok || !data.text) {
            throw new Error(data.error || "Transcription failed.");
          }
          const cleaned = stripWakePhrase(data.text).trim();
          setLastCommand(cleaned);
          if (cleaned) onCommandRef.current(cleaned);
        } catch (err) {
          setError(err instanceof Error ? err.message : "Transcription failed.");
        } finally {
          setInterimTranscript("");
          setSafeState("idle");
        }
      };

      recorder.onerror = () => {
        cleanupDevices();
        setSafeState("idle");
      };

      recorder.start();

      // Auto-stop after the capture window.
      if (captureTimerRef.current) clearTimeout(captureTimerRef.current);
      captureTimerRef.current = setTimeout(() => {
        try {
          if (recorder.state !== "inactive") recorder.stop();
        } catch {
          /* noop */
        }
      }, captureTimeoutMs);
    } catch (err) {
      setHasMicPermission(false);
      setError(err instanceof Error ? err.message : "Microphone access failed.");
      setSafeState("idle");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [captureTimeoutMs, setSafeState]);

  // -------------------------------------------------------------------------
  // Armed window — give the user a few seconds to start speaking.
  // -------------------------------------------------------------------------

  React.useEffect(() => {
    if (state !== "armed") return;
    if (armedTimerRef.current) clearTimeout(armedTimerRef.current);
    armedTimerRef.current = setTimeout(() => {
      // Time out — restart wake listener.
      setSafeState("idle");
    }, armedTimeoutMs);
    return () => {
      if (armedTimerRef.current) {
        clearTimeout(armedTimerRef.current);
        armedTimerRef.current = null;
      }
    };
  }, [state, armedTimeoutMs, setSafeState]);

  // -------------------------------------------------------------------------
  // Start / stop based on `enabled`.
  // -------------------------------------------------------------------------

  React.useEffect(() => {
    if (!enabled) {
      // Tear everything down.
      manualStopRef.current = true;
      stopRecognition();
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
        try {
          mediaRecorderRef.current.stop();
        } catch {
          /* noop */
        }
      }
      cleanupDevices();
      setSafeState("idle");
      return;
    }

    if (!getSpeechRecognitionCtor()) {
      setError("Speech recognition is not supported in this browser.");
      return;
    }

    // Start in wake mode.
    setSafeState("listening");
    startRecognition("wake");

    return () => {
      manualStopRef.current = true;
      stopRecognition();
      cleanupDevices();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  // -------------------------------------------------------------------------
  // Restart the wake listener when we drop back to idle (e.g. after a
  // capture completes or the armed window times out) — but only if we're
  // still enabled and not in the middle of a capture.
  // -------------------------------------------------------------------------

  React.useEffect(() => {
    if (!enabled) return;
    if (state === "idle" && !recognitionRef.current && !mediaRecorderRef.current) {
      setSafeState("listening");
      startRecognition("wake");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, enabled]);

  // -------------------------------------------------------------------------
  // Cleanup on unmount.
  // -------------------------------------------------------------------------

  React.useEffect(() => {
    return () => {
      manualStopRef.current = true;
      stopRecognition();
      cleanupDevices();
      if (armedTimerRef.current) clearTimeout(armedTimerRef.current);
      if (captureTimerRef.current) clearTimeout(captureTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function cleanupDevices() {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => {
        try {
          t.stop();
        } catch {
          /* noop */
        }
      });
      streamRef.current = null;
    }
    if (captureTimerRef.current) {
      clearTimeout(captureTimerRef.current);
      captureTimerRef.current = null;
    }
  }

  // -------------------------------------------------------------------------
  // Imperative API
  // -------------------------------------------------------------------------

  const start = React.useCallback(() => {
    if (!enabled || !getSpeechRecognitionCtor()) return;
    if (state === "idle" || state === "listening") {
      setSafeState("listening");
      startRecognition("wake");
    }
  }, [enabled, state, setSafeState, startRecognition]);

  const stop = React.useCallback(() => {
    manualStopRef.current = true;
    stopRecognition();
    cleanupDevices();
    setSafeState("idle");
  }, [stopRecognition, setSafeState]);

  const abort = React.useCallback(() => {
    manualStopRef.current = true;
    stopRecognition();
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      try {
        mediaRecorderRef.current.stop();
      } catch {
        /* noop */
      }
    }
    cleanupDevices();
    setSafeState("idle");
  }, [stopRecognition, setSafeState]);

  return {
    state,
    supported,
    hasMicPermission,
    interimTranscript,
    lastCommand,
    start,
    stop,
    abort,
    error,
  };
}
