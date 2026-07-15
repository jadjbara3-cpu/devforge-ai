"use client";

/**
 * LanguageProvider — client-side i18n for DevForge AI
 * ---------------------------------------------------
 * Drives a non-routing AR/EN language switch:
 *   • Holds the current locale ('en' | 'ar') in React state.
 *   • Persists it to localStorage so it survives reloads.
 *   • Sets <html lang="…" dir="ltr|rtl"> so Tailwind's RTL utilities work.
 *   • Exposes a `t(path, vars?)` helper that does dotted-key lookups into
 *     the loaded message bundle (en.json / ar.json).
 *
 * Both message bundles are imported statically so they end up in the
 * client bundle and there's no async lookup on locale switch.
 */

import * as React from "react";

import en from "../../messages/en.json";
import ar from "../../messages/ar.json";

export type Locale = "en" | "ar";

const STORAGE_KEY = "devforge-locale";
const SUPPORTED: Locale[] = ["en", "ar"];

type Messages = typeof en;

const BUNDLES: Record<Locale, Messages> = {
  en: en as Messages,
  ar: ar as Messages,
};

const isLocale = (v: unknown): v is Locale =>
  typeof v === "string" && (SUPPORTED as string[]).includes(v);

interface LanguageContextValue {
  /** Current locale. */
  locale: Locale;
  /** Switch to a new locale (persists to localStorage, updates <html> attrs). */
  setLocale: (l: Locale) => void;
  /** Convenience toggle — flips between 'en' and 'ar'. */
  toggleLocale: () => void;
  /** "ltr" for English, "rtl" for Arabic. */
  dir: "ltr" | "rtl";
  /**
   * Translation function. Accepts a dotted key path (e.g. "sidebar.chat")
   * and an optional map of `{var}` substitutions.
   * Falls back to the English string, then to the key itself.
   */
  t: (key: string, vars?: Record<string, string | number>) => string;
}

const LanguageContext = React.createContext<LanguageContextValue | null>(null);

/** Resolve a dotted key path against a nested object. */
function lookup(obj: unknown, path: string): unknown {
  return path
    .split(".")
    .reduce<unknown>((acc, key) => {
      if (acc && typeof acc === "object" && key in (acc as Record<string, unknown>)) {
        return (acc as Record<string, unknown>)[key];
      }
      return undefined;
    }, obj);
}

/** Interpolate {placeholders} in a translation string. */
function interpolate(
  template: string,
  vars?: Record<string, string | number>
): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (_, name: string) =>
    name in vars ? String(vars[name]) : `{${name}}`
  );
}

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  // Start with the default (English) on the server and the first paint to
  // avoid hydration mismatches; sync from localStorage in an effect.
  const [locale, setLocaleState] = React.useState<Locale>("en");

  // Restore persisted locale on mount.
  React.useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (isLocale(stored) && stored !== locale) {
        setLocaleState(stored);
      }
    } catch {
      /* localStorage unavailable */
    }
    // We intentionally only run on mount — `locale` is in deps below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep <html lang/dir> in sync with the active locale.
  React.useEffect(() => {
    if (typeof document === "undefined") return;
    const dir = locale === "ar" ? "rtl" : "ltr";
    document.documentElement.lang = locale;
    document.documentElement.dir = dir;
  }, [locale]);

  const setLocale = React.useCallback((l: Locale) => {
    setLocaleState(l);
    try {
      localStorage.setItem(STORAGE_KEY, l);
    } catch {
      /* ignore quota / privacy-mode errors */
    }
  }, []);

  const toggleLocale = React.useCallback(() => {
    setLocale(locale === "en" ? "ar" : "en");
  }, [locale, setLocale]);

  const t = React.useCallback(
    (key: string, vars?: Record<string, string | number>): string => {
      const primary = lookup(BUNDLES[locale], key);
      let value: unknown = primary;
      if (value === undefined && locale !== "en") {
        value = lookup(BUNDLES.en, key);
      }
      if (typeof value === "string") {
        return interpolate(value, vars);
      }
      // Last resort: return the key so missing strings are obvious.
      return key;
    },
    [locale]
  );

  const dir: "ltr" | "rtl" = locale === "ar" ? "rtl" : "ltr";

  const value = React.useMemo<LanguageContextValue>(
    () => ({ locale, setLocale, toggleLocale, dir, t }),
    [locale, setLocale, toggleLocale, dir, t]
  );

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
}

/** Hook used by every component that needs translations or the current locale. */
export function useLanguage(): LanguageContextValue {
  const ctx = React.useContext(LanguageContext);
  if (!ctx) {
    throw new Error("useLanguage must be used inside <LanguageProvider>");
  }
  return ctx;
}
