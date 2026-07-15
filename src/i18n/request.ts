/**
 * next-intl request config (non-routing mode)
 * -------------------------------------------
 * DevForge AI is a single-route app — there is no `[locale]` segment.
 * Translations are instead driven client-side via `<LanguageProvider>` in
 * `components/language-provider.tsx`, which loads both message bundles at
 * build time and switches between them based on a `localStorage` value.
 *
 * This file exists so that any *server* component or route handler that
 * later wants to use `next-intl`'s `getTranslations()` can do so without
 * further setup. It defaults to English because the server doesn't know
 * the per-user locale (it lives only in the browser).
 *
 * If you later want true routing-based i18n (`/en/...`, `/ar/...`), wire
 * this file up via the `CreateNextIntlPlugin` plugin in `next.config.ts`
 * and add `[locale]` middleware — see https://next-intl-docs.vercel.app/.
 */

import { getRequestConfig } from "next-intl/server";

export type AppLocale = "en" | "ar";

export const locales = ["en", "ar"] as const;
export const defaultLocale: AppLocale = "en";

export default getRequestConfig(async () => {
  // Server-side default. The client `<LanguageProvider>` is the source of
  // truth for the *user's* chosen locale.
  const locale: AppLocale = defaultLocale;

  const messages = (await import(`../../messages/${locale}.json`)).default;

  return {
    locale,
    messages,
  };
});
