/**
 * The plugin template source as a string constant. Shown in the Plugin
 * Manager's "Create new plugin" dialog so users can copy/paste it.
 *
 * Kept in a separate module so it doesn't bloat the Plugin Manager's main
 * bundle chunk (this string is only loaded when the user opens the dialog).
 */

export const PLUGIN_TEMPLATE_SOURCE = `"use client";

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
 * My Plugin — replace this comment with what your plugin does.
 *
 * Save this file as: src/plugins/user/<your-id>/plugin.tsx
 * Then register it in src/plugins/index.ts:
 *
 *   {
 *     id: "my-plugin",
 *     name: "My Plugin",
 *     description: "What it does.",
 *     icon: "Wrench",       // any name in PLUGIN_ICONS (lib/plugin-registry.ts)
 *     category: "tool",      // "tool" | "ai" | "utility" | "game"
 *     enabled: true,
 *     position: "sidebar",   // or "command-palette-only"
 *     component: lazy(() => import("./user/my-plugin/plugin")),
 *   }
 *
 * Then run: bun run build
 */
export default function MyPlugin() {
  const { toast } = useToast();
  const [name, setName] = React.useState("");

  const onSave = () => {
    toast({
      title: "Hello",
      description: \`Hello, \${name || "world"}!\`,
    });
  };

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 py-2">
      <Card>
        <CardHeader>
          <CardTitle>My Plugin</CardTitle>
          <CardDescription>
            Replace this UI with your own.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="my-name">Your name</Label>
            <Input
              id="my-name"
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
`;
