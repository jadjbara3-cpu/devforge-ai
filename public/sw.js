/* eslint-disable no-restricted-globals */
/**
 * DevForge AI — Service Worker
 * ----------------------------------
 * Strategy:
 *   • App shell (HTML/JS/CSS/fonts)  → cache-first, with network fallback
 *   • Static assets (/icons, /_next/static, images) → cache-first
 *   • API calls (/api/*)              → network-first (always fresh, no cache)
 *   • Navigation (HTML pages)         → network-first, fall back to cached "/"
 *
 * Cache name is versioned so future deployments can bust it cleanly.
 */

const CACHE_VERSION = "devforge-v1";
const CORE_CACHE = `${CACHE_VERSION}-core`;
const RUNTIME_CACHE = `${CACHE_VERSION}-runtime`;

// Assets pre-cached on install. "/" is the app shell entry point.
const CORE_ASSETS = [
  "/",
  "/manifest.json",
  "/icon-192.png",
  "/icon-512.png",
];

// Anything matching these patterns is an API call — always hit the network.
const API_PATTERN = /^\/api\//;
// Same-origin only (we never intercept cross-origin requests).
const SAME_ORIGIN = (url) => url.origin === self.location.origin;

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CORE_CACHE);
      // Cache core assets individually so a single 404 doesn't abort the install.
      await Promise.all(
        CORE_ASSETS.map(async (url) => {
          try {
            await cache.add(new Request(url, { cache: "reload" }));
          } catch {
            /* ignore individual failures — e.g. icon PNGs not yet generated */
          }
        })
      );
      await self.skipWaiting();
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // Purge any cache entries from previous versions.
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => !k.startsWith(CACHE_VERSION))
          .map((k) => caches.delete(k))
      );
      await self.clients.claim();
    })()
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Only handle GET requests on same-origin.
  if (req.method !== "GET" || !SAME_ORIGIN(url)) return;

  // 1) API calls → network-first, never cache (fresh data always).
  if (API_PATTERN.test(url.pathname)) {
    event.respondWith(
      fetch(req).catch(() =>
        new Response(
          JSON.stringify({ error: "offline", message: "Network unavailable" }),
          { status: 503, headers: { "Content-Type": "application/json" } }
        )
      )
    );
    return;
  }

  // 2) Navigations (HTML pages) → network-first, fall back to cached shell.
  if (req.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(req);
          const cache = await caches.open(RUNTIME_CACHE);
          cache.put(req, fresh.clone());
          return fresh;
        } catch {
          const cached = await caches.match(req);
          return cached || (await caches.match("/")) || Response.error();
        }
      })()
    );
    return;
  }

  // 3) Static assets (JS/CSS/fonts/images/manifest) → cache-first.
  event.respondWith(
    (async () => {
      const cached = await caches.match(req);
      if (cached) return cached;
      try {
        const fresh = await fetch(req);
        // Only cache successful, same-origin, basic responses.
        if (
          fresh &&
          fresh.status === 200 &&
          fresh.type === "basic"
        ) {
          const cache = await caches.open(RUNTIME_CACHE);
          cache.put(req, fresh.clone());
        }
        return fresh;
      } catch {
        // No cache, no network — return an empty response so the page
        // doesn't crash on a missing image/font.
        return new Response("", { status: 504, statusText: "Gateway Timeout" });
      }
    })()
  );
});

// Allow the page to trigger an immediate update (skip waiting).
self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") {
    void self.skipWaiting();
  }
});
