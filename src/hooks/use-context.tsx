"use client";

/**
 * useContext — React context provider + hook for the Context Awareness
 * Engine.
 *
 * Exposes:
 *   • consent         — the user's privacy flags (persisted to localStorage)
 *   • setConsent      — update a single flag
 *   • currentContext  — the latest UserContext snapshot (refreshed every 5s)
 *   • gatherForChat   — async fn that returns the context to attach to a
 *                       /api/chat or /api/voice/command request
 *   • badge           — a short human-readable summary ("VS Code · App.tsx")
 *
 * Privacy is enforced CLIENT-SIDE: if a consent flag is off, the
 * corresponding field is set to null BEFORE the request is sent. The
 * server is never trusted to "forget" — we just don't send it.
 */

import * as React from "react";

// ---------------------------------------------------------------------------
// Types — mirror lib/context-engine.ts (kept local to avoid pulling server
// code into the client bundle).
// ---------------------------------------------------------------------------

export interface UserConsent {
  shareActiveWindow: boolean;
  shareSelection: boolean;
  shareBrowserUrl: boolean;
  shareDevforgeView: boolean;
}

export interface ActiveWindow {
  title: string;
  process: string;
  isBrowser: boolean;
}

export interface UserContext {
  capturedAt: string;
  activeWindow: ActiveWindow | null;
  selection: string | null;
  browserUrl: string | null;
  devforgeView: string | null;
}

const DEFAULT_CONSENT: UserConsent = {
  shareActiveWindow: false,
  shareSelection: false,
  shareBrowserUrl: false,
  shareDevforgeView: true,
};

const STORAGE_KEY = "devforge-context-consent-v1";
const POLL_INTERVAL_MS = 5_000;

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

interface ContextContextValue {
  consent: UserConsent;
  setConsent: (patch: Partial<UserConsent>) => void;
  resetConsent: () => void;
  currentContext: UserContext | null;
  /** Latest clipboard/selection snapshot the user explicitly captured. */
  selection: string | null;
  setSelection: (s: string | null) => void;
  /**
   * Build the context object to attach to a chat/voice request.
   * Pass the current DevForge view (e.g. "chat", "voice") so the server
   * can include it in the system prompt.
   */
  gatherForChat: (devforgeView?: string) => Promise<UserContext>;
  /** Short human-readable summary, or null when no context is available. */
  badge: string | null;
  /** True while the first context fetch is in flight. */
  loading: boolean;
}

const ContextContext = React.createContext<ContextContextValue | null>(null);

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function ContextProvider({ children }: { children: React.ReactNode }) {
  const [consent, setConsentState] = React.useState<UserConsent>(DEFAULT_CONSENT);
  const [currentContext, setCurrentContext] = React.useState<UserContext | null>(null);
  const [selection, setSelection] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState<boolean>(true);

  // Restore consent from localStorage.
  React.useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<UserConsent>;
        setConsentState({ ...DEFAULT_CONSENT, ...parsed });
      }
    } catch {
      /* ignore */
    }
  }, []);

  const setConsent = React.useCallback((patch: Partial<UserConsent>) => {
    setConsentState((prev) => {
      const next = { ...prev, ...patch };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  const resetConsent = React.useCallback(() => {
    setConsentState(DEFAULT_CONSENT);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }, []);

  // Poll the server for the active window when shareActiveWindow is on.
  React.useEffect(() => {
    if (!consent.shareActiveWindow) {
      setCurrentContext(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const poll = async () => {
      try {
        const res = await fetch("/api/context?shareActiveWindow=1", {
          cache: "no-store",
        });
        const data = (await res.json().catch(() => ({}))) as {
          context?: UserContext;
        };
        if (!cancelled && data.context) {
          setCurrentContext(data.context);
        }
      } catch {
        /* network blip — try again next tick */
      } finally {
        if (!cancelled) {
          setLoading(false);
          timer = setTimeout(poll, POLL_INTERVAL_MS);
        }
      }
    };

    void poll();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [consent.shareActiveWindow]);

  // -------------------------------------------------------------------------
  // gatherForChat — called by the chat panel right before sending a message.
  // Always returns a UserContext; null fields are filled in client-side
  // based on consent (so we don't even send them to the server when the
  // user has opted out).
  // -------------------------------------------------------------------------

  const gatherForChat = React.useCallback(
    async (devforgeView?: string): Promise<UserContext> => {
      const view = devforgeView ?? null;

      // Fast path — if everything is off except (maybe) devforgeView, skip
      // the network round-trip entirely.
      if (
        !consent.shareActiveWindow &&
        !consent.shareSelection &&
        !consent.shareBrowserUrl
      ) {
        return {
          capturedAt: new Date().toISOString(),
          activeWindow: null,
          selection: null,
          browserUrl: null,
          devforgeView: consent.shareDevforgeView ? view : null,
        };
      }

      try {
        const res = await fetch("/api/context", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            consent,
            selection: consent.shareSelection ? selection : null,
            devforgeView: consent.shareDevforgeView ? view : null,
          }),
          cache: "no-store",
        });
        const data = (await res.json().catch(() => ({}))) as {
          context?: UserContext;
        };
        if (data.context) return data.context;
      } catch {
        /* fall through to local fallback */
      }

      return {
        capturedAt: new Date().toISOString(),
        activeWindow: currentContext?.activeWindow ?? null,
        selection: consent.shareSelection ? selection : null,
        browserUrl: null,
        devforgeView: consent.shareDevforgeView ? view : null,
      };
    },
    [consent, selection, currentContext],
  );

  // -------------------------------------------------------------------------
  // badge — short summary for the chat UI
  // -------------------------------------------------------------------------

  const badge = React.useMemo<string | null>(() => {
    const ctx = currentContext;
    if (ctx?.activeWindow) {
      const proc = ctx.activeWindow.process || "app";
      const title = ctx.activeWindow.title || "";
      const cleanTitle = title
        .replace(/\s*-\s*[^-]+$/, "")
        .replace(/\s*-\s*Visual Studio Code$/, "")
        .trim();
      if (cleanTitle) return `${proc} · ${cleanTitle}`;
      return proc;
    }
    if (ctx?.devforgeView) return `DevForge · ${ctx.devforgeView}`;
    return null;
  }, [currentContext]);

  const value = React.useMemo<ContextContextValue>(
    () => ({
      consent,
      setConsent,
      resetConsent,
      currentContext,
      selection,
      setSelection,
      gatherForChat,
      badge,
      loading,
    }),
    [consent, setConsent, resetConsent, currentContext, selection, gatherForChat, badge, loading],
  );

  return (
    <ContextContext.Provider value={value}>{children}</ContextContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useContextEngine(): ContextContextValue {
  const ctx = React.useContext(ContextContext);
  if (!ctx) {
    throw new Error("useContextEngine must be used inside <ContextProvider>");
  }
  return ctx;
}
