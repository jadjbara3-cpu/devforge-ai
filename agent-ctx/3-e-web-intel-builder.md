# Task 3-e — Web Intelligence Builder

**Agent:** web-intel-builder
**Task:** Build Web Intelligence (search + web reader) feature for DevForge AI.

## Files Delivered

1. `src/app/api/web/search/route.ts` — POST `/api/web/search`
   - Body: `{ query: string, num?: number }` (default 10, clamped to [1, 20]).
   - Validates non-empty `query`. Calls `zai.functions.invoke("web_search", { query, num })`.
   - Defensive normalization of the result array (unwraps `{ results }` / `{ data }` wrappers; type-checks each item to `{ url, name, snippet, host_name, rank, date, favicon }`).
   - Returns `{ results: [...] }`; 500 with `{ error }` on failure.

2. `src/app/api/web/read/route.ts` — POST `/api/web/read`
   - Body: `{ url: string }`. Validates via `new URL()`; rejects non-http(s).
   - Calls `zai.functions.invoke("page_reader", { url })`.
   - Handles BOTH result shapes (`{ data: {...} }` OR plain object).
   - Returns `{ title, text, html, publishedTime, url }`; 502 when no usable content; 500 with `{ error }`.
   - `export const maxDuration = 60`.

3. `src/components/features/web-intel.tsx` — full UI replacing the stub
   - shadcn Tabs with two tabs: "Web Search" and "Page Reader".
   - Search: input + button (Enter-to-search), results-count badge, staggered framer-motion list, favicon-with-fallback, clickable title (new tab), host_name badge, date badge, snippet, "Read page" button (switches tab + pre-fills URL), 4-card shimmer skeleton, empty state with 3 example chips, no-results state.
   - Reader: URL input + Read button, large title, meta row (host + publishedTime), scrollable article (max-h-[60vh] ScrollArea) rendered as paragraphs, "Copy text" + "Open original" actions, shimmer skeleton, empty state.
   - `useToast` for errors; controlled Tabs so the search tab can route a URL into the reader tab; copy feedback with Check icon; `stripHtml()` fallback when `text` is empty but `html` is available.

## Verification

- `bun run lint` → 0 errors, 0 warnings.
- Smoke tests (curl, dev server on :3000):
  - `POST /api/web/search {}` → 400 `{"error":"A non-empty 'query' string is required."}`
  - `POST /api/web/read {"url":"not a url"}` → 400 `{"error":"The provided URL is not valid. Include the scheme (https://)."}`
  - `POST /api/web/read {}` → 400 `{"error":"A non-empty 'url' string is required."}`
  - `POST /api/web/search {"query":"Next.js 16 App Router features","num":5}` → 200 in 3.3s, 5 normalized results.
  - `POST /api/web/read {"url":"https://nextjs.org/blog/next-16"}` → 200 in 7.2s, returns title/text/html/publishedTime/url.
- `dev.log`: clean compiles (`✓ Compiled in 137ms`), all request lines logged, no runtime errors, `GET / 200` throughout.

## Notes for Downstream Agents

- The `WebIntel` component is already mounted on the `/` route (`active === "web"`) — no page changes needed.
- `getZai()` singleton in `src/lib/zai.ts` is the canonical entry to the SDK.
- Both API routes use `runtime = "nodejs"`, `dynamic = "force-dynamic"`, `maxDuration = 60` to mirror the vision / TTS / ASR conventions.
- No test files written.
EOF
echo "agent-ctx written"