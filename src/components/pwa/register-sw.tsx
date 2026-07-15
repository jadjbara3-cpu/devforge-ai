"use client";

/**
 * ServiceWorkerRegistrar — client-only SW registration for DevForge AI.
 *
 * Renders nothing visible. Mounts inside the app shell and registers
 * `/sw.js` once the window has loaded, so it never blocks first paint.
 *
 * In development (`NODE_ENV=development`) registration is skipped to avoid
 * caching live-edited assets.
 */

import * as React from "react";

export function ServiceWorkerRegistrar() {
  React.useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;
    if (process.env.NODE_ENV === "development") return;

    const register = () => {
      navigator.serviceWorker
        .register("/sw.js", { scope: "/" })
        .then((reg) => {
          // Periodically check for updates (every 60 min) so users get the
          // newest shell without a manual reload.
          setInterval(
            () => {
              void reg.update();
            },
            60 * 60 * 1000
          );
        })
        .catch((err: unknown) => {
          // Swallow — SW failure is non-fatal, app still works online.
          console.warn("[DevForge] SW registration failed:", err);
        });
    };

    if (document.readyState === "complete") {
      register();
    } else {
      window.addEventListener("load", register, { once: true });
      return () => window.removeEventListener("load", register);
    }
  }, []);

  return null;
}
