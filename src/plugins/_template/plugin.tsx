/**
 * DevForge Plugin Template
 * =========================
 *
 * Copy this folder to `src/plugins/<your-plugin-id>/` to create a new plugin.
 *
 * Minimal steps:
 *   1. Copy `src/plugins/_template/` → `src/plugins/<your-id>/`
 *   2. Rename the default export to your component name
 *   3. Edit `src/plugins/index.ts`:
 *        - Add a metadata entry (id, name, icon, category, ...)
 *        - Add a `dynamic(() => import("./<your-id>/plugin"), { ssr: false })` line
 *   4. (Optional) Add an entry to `src/plugins/registry.json` to disable by default
 *   5. Run `bun run dev` — your plugin appears in the sidebar + Cmd+K palette
 *
 * Plugin authors only need to know two contracts:
 *   • The default export is a React component (must be a Client Component).
 *   • The metadata for the plugin lives in `src/plugins/index.ts` (so that
 *     importing the registry doesn't pull in the component's heavy deps).
 *
 * The DevForge AI provider infrastructure is available at:
 *   • `POST /api/chat`  — OpenAI-compatible chat (slot: "agents" | "complex")
 *   • `POST /api/images/generate` — image generation
 *   • `POST /api/tts` / `POST /api/asr` — speech
 *   • `POST /api/vision/analyze` — VLM
 *   • `GET  /api/web/search` / `POST /api/web/read` — web tools
 *
 * See `src/plugins/translator/plugin.tsx` for a worked AI example, and
 * `src/plugins/quick-notes/plugin.tsx` for a non-AI localStorage example.
 */

"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";

/**
 * The plugin's main component. The default export is what gets rendered in
 * the main area when the user selects your plugin in the sidebar.
 *
 * Always include `"use client"` at the top — DevForge is a Next.js App
 * Router app and the main area is rendered from a Client Component tree.
 */
export default function TemplatePlugin() {
  const { toast } = useToast();
  const [name, setName] = React.useState("");

  const onSave = () => {
    toast({
      title: "Saved",
      description: `Hello, ${name || "world"}!`,
    });
  };

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 py-2">
      <Card>
        <CardHeader>
          <CardTitle>Template Plugin</CardTitle>
          <CardDescription>
            A minimal starter. Replace this UI with your own.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="tpl-name">Your name</Label>
            <Input
              id="tpl-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="World"
            />
          </div>
          <Button onClick={onSave}>Say hello</Button>
        </CardContent>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// OPTIONAL: registering API routes
// ---------------------------------------------------------------------------
//
// If your plugin needs server-side endpoints, do NOT define them here —
// Next.js route handlers must live under `app/api/...`. Instead, create:
//
//   src/app/api/plugin/<your-id>/route.ts
//
// and export `GET` / `POST` functions. The Plugin Manager can list them by
// reading the `apiRoutes` field of your plugin metadata in `index.ts`.
