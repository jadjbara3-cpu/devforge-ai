# Task 3-f — Snippet Vault Builder

**Agent:** snippet-builder
**Task:** Build the Snippet Vault (code snippets CRUD) feature for DevForge AI.

## Files Delivered

1. `src/app/api/snippets/route.ts` — collection endpoint
   - `export const dynamic = "force-dynamic"`.
   - **GET** → returns `{ snippets: [...] }`, all rows newest-first (`createdAt desc, id desc`), dates serialized to ISO strings.
   - **POST** → body `{ title, language?, code, description?, tags?, favorite? }`. Validates `title` + `code` non-empty (400). Normalizes `language` (default `"text"`), `description`/`tags` (trim or `null`), `favorite` (boolean or `false`). Creates + returns `{ snippet }` with 201.
   - Defensive JSON parsing (400 on bad body), centralized error handling (500).

2. `src/app/api/snippets/[id]/route.ts` — item endpoint (Next 15+ async params)
   - `export async function PUT(req, { params }: { params: Promise<{ id: string }> })` and `DELETE` likewise — `await params` to read `id`.
   - **PUT** → 404 if not found; partial update (only provided fields applied); validates `title`/`code` non-empty when present; returns `{ snippet }`.
   - **DELETE** → 404 if not found; deletes; returns `{ ok: true }`.

3. `src/components/features/snippet-vault.tsx` — full UI (replaced the stub)
   - `"use client"` `SnippetVault` component.
   - **Header**: emerald code icon + "Snippet Vault" title + subtitle + count badge (total · favorites ★) + "New snippet" button (opens Dialog).
   - **Toolbar**: live search Input (filters title/code/description/tags/language), language `Select` ("All languages" + the 14 required languages), favorites toggle Button (pressed/default variants + `aria-pressed`).
   - **Grid**: responsive 1/2/3 columns; each `Card` shows title, language + tag `Badge`s, favorite star (optimistic toggle with revert-on-error), line-clamped description, a syntax-highlighted code preview (first 6 lines via `react-syntax-highlighter` Prism + `oneDark`, with a fade gradient when truncated), line count, and hover-revealed Edit/Copy/Delete actions (`md:opacity-0 md:group-hover:opacity-100`, always visible on mobile).
   - **Create/Edit Dialog** (shared): title input, language select, tags input, description input, mono `Textarea` (min-h-[200px]) with a live syntax-highlighted preview, favorite `Checkbox`, Save button with `Loader2` spinner. Form resets via `useEffect` on open.
   - **Delete confirmation** via `AlertDialog` with destructive action + loading state.
   - **framer-motion**: `AnimatePresence mode="popLayout"` + `layout` on each card for smooth add/remove/reorder.
   - `useToast` feedback for load/save/copy/delete/favorite; copy via `navigator.clipboard.writeText`.
   - 6-card `Skeleton` grid while loading; `EmptyState` differentiates "vault empty" vs "no matches" (Clear filters / New snippet).
   - `CodeBlock` helper used in BOTH the card preview and the dialog preview for consistent syntax highlighting.

## Verification

- `bun run lint` → 0 errors, 0 warnings.
- Smoke tests (curl, dev server on :3000):
  - `GET /api/snippets` → 200 `{"snippets":[]}`
  - `POST /api/snippets {}` → 400 `{"error":"Both 'title' and 'code' are required and must be non-empty."}`
  - `POST /api/snippets {valid}` → 201 `{"snippet":{...}}` (id, ISO timestamps, favorite:true)
  - `PUT /api/snippets/{id} {favorite:false,title:"..."}` → 200 `{"snippet":{...}}` (updatedAt changed, createdAt preserved)
  - `PUT /api/snippets/nonexistent-xyz` → 404
  - `DELETE /api/snippets/nonexistent-xyz` → 404
  - `DELETE /api/snippets/{id}` → 200 `{"ok":true}`
  - `GET /api/snippets` after delete → 200 `{"snippets":[]}`
- `dev.log`: clean compiles (`✓ Compiled in 859ms`, `175ms`, `143ms`), Prisma queries logged, all request lines show correct statuses, no runtime errors, `GET / 200` throughout.

## Notes for Downstream Agents

- The `SnippetVault` component is already mounted on the `/` route (`active === "snippets"`) — no page changes needed.
- `react-syntax-highlighter` (Prism + `oneDark`) is imported statically in `snippet-vault.tsx`; the deep style import path is exactly as specified in the task. The project's `noImplicitAny: false` keeps the untyped module import clean.
- The `Snippet` Prisma model (id, title, language, code, description, tags, favorite, createdAt, updatedAt) was already pushed by Task 1 — no schema/migration work required here.
- Optimistic update pattern is used for the favorite star (revert on PUT failure); create/update/delete mutate local state directly (no full refetch needed, though `loadSnippets()` is available if re-sync is ever required).
