# Task 3-c — Vision Lab (vision-builder)

## Scope
Build the Vision Lab feature for DevForge AI: a VLM image-understanding UI plus its backend API route.

## Files
- `src/app/api/vision/analyze/route.ts` — POST endpoint (multipart OR JSON) → ZAI `chat.completions.createVision` → `{ reply }`.
- `src/components/features/vision-lab.tsx` — full "use client" `VisionLab` component (dropzone + preview + preset chips + textarea + analyze button + markdown output + last-5 history).

## API contract
- Request:
  - `multipart/form-data`: `image` (File, image/*), `question` (string)
  - OR `application/json`: `{ image: <data:image/*;base64,...>, question }`
- Response 200: `{ reply: string }`
- Response 400: `{ error }` (missing image / invalid type / missing question)
- Response 415: unsupported content type
- Response 500: `{ error }` (VLM or unexpected failure)

## Implementation notes
- ZAI SDK used server-side only via `getZai()` singleton from `@/lib/zai`.
- VLM call: `zai.chat.completions.createVision({ messages: [{ role: "user", content: [ { type: "text", text }, { type: "image_url", image_url: { url: dataUrl } } ] }], thinking: { type: "disabled" } })`.
- Client uses `URL.createObjectURL` for previews; all URLs tracked in a ref and revoked on unmount. History items keep their thumbnails alive across image replacements (we never revoke a URL that's still referenced).
- Output rendered with `react-markdown`; loading state uses `Skeleton` + animated `.typing-dot` indicators (keyframes already in `globals.css`).
- Theme: emerald primary, dark mode, no indigo/blue. Responsive `lg:grid-cols-2` (stacks on mobile).

## Verification
- `bun run lint` → 0 errors, 0 warnings.
- Dev log shows `✓ Compiled` and `POST /api/vision/analyze 400` for validation tests; `GET /` returns 200.
- Smoke tests:
  - `POST /api/vision/analyze` JSON missing image → 400 `{"error":"A valid image is required (data:image/* URL or image file)."}`
  - `POST /api/vision/analyze` multipart no image → same 400.

## Coordination notes for downstream agents
- The Vision Lab is mounted when the sidebar's `vision` tab is active (already wired in `src/app/page.tsx`).
- No DB schema changes required (vision history is in-memory, session-scoped — by design, per task spec).
- No new dependencies installed; everything used is already in `package.json`.
