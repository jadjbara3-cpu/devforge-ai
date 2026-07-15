/**
 * Plugin Manager
 * ===============
 *
 * Dialog accessible from Settings → Plugins → Manage. Shows every installed
 * plugin with:
 *   • an enable/disable toggle,
 *   • the plugin's metadata (icon, name, description, category, version),
 *   • any settings the plugin exposes (rendered from its `settings` array),
 *   • a "Create new plugin" button that opens a copy of the template source.
 *
 * All state is read from / written to `lib/plugin-registry.ts`, which
 * persists to localStorage and notifies subscribers.
 */

"use client";

import * as React from "react";
import {
  Puzzle,
  Check,
  Power,
  Settings2,
  Plus,
  Copy,
  FileCode2,
  ShieldCheck,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import type { PluginSetting } from "@/lib/plugin-types";
import {
  getAllPlugins,
  getPluginSettings,
  setPluginSetting,
  togglePlugin,
  isPluginEnabled,
  usePluginRegistry,
  resolvePluginIcon,
} from "@/lib/plugin-registry";
import { PLUGIN_TEMPLATE_SOURCE } from "@/lib/plugin-template-source";

interface PluginManagerProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

export function PluginManager({
  open,
  onOpenChange,
}: PluginManagerProps) {
  const { toast } = useToast();
  // Subscribe to registry so the list re-renders on every toggle.
  usePluginRegistry();
  const plugins = getAllPlugins();

  const [templateOpen, setTemplateOpen] = React.useState(false);
  const [confirmResetOpen, setConfirmResetOpen] = React.useState(false);
  const [copied, setCopied] = React.useState(false);

  const onCopyTemplate = async () => {
    try {
      await navigator.clipboard.writeText(PLUGIN_TEMPLATE_SOURCE);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
      toast({
        title: "Template copied",
        description:
          "Paste into src/plugins/user/<your-id>/plugin.tsx and rebuild.",
      });
    } catch {
      toast({
        title: "Copy failed",
        description: "Select the text manually and copy.",
        variant: "destructive",
      });
    }
  };

  const onReset = () => {
    // Reset = clear localStorage overrides so each plugin falls back to its
    // metadata default. We do this by removing the keys; the registry picks
    // up defaults on next read.
    try {
      window.localStorage.removeItem("devforge-plugins-enabled-v1");
      window.localStorage.removeItem("devforge-plugins-settings-v1");
    } catch {
      /* ignore */
    }
    // Force a reload so the registry re-hydrates from defaults.
    if (typeof window !== "undefined") {
      window.location.reload();
    }
    setConfirmResetOpen(false);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto scrollbar-thin">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Puzzle className="h-4 w-4 text-primary" />
              Plugin Manager
            </DialogTitle>
            <DialogDescription>
              {plugins.length} plugin{plugins.length === 1 ? "" : "s"}{" "}
              installed. Toggle a plugin to show or hide it in the sidebar and
              command palette.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-1">
            {plugins.map((p) => (
              <PluginRow key={p.id} id={p.id} />
            ))}

            {plugins.length === 0 && (
              <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
                No plugins installed. Copy the template below to create one.
              </div>
            )}
          </div>

          <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-between">
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setTemplateOpen(true)}
                className="gap-1.5"
              >
                <Plus className="h-3.5 w-3.5" />
                Create new plugin
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setConfirmResetOpen(true)}
                className="gap-1.5 text-muted-foreground"
              >
                <Power className="h-3.5 w-3.5" />
                Reset to defaults
              </Button>
            </div>
            <Button
              size="sm"
              onClick={() => onOpenChange(false)}
              className="gap-1.5"
            >
              <Check className="h-3.5 w-3.5" />
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Template viewer dialog */}
      <Dialog open={templateOpen} onOpenChange={setTemplateOpen}>
        <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto scrollbar-thin">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileCode2 className="h-4 w-4 text-primary" />
              Plugin Template
            </DialogTitle>
            <DialogDescription>
              Copy this into{" "}
              <code className="rounded bg-muted px-1 font-mono text-[11px]">
                src/plugins/user/&lt;your-id&gt;/plugin.tsx
              </code>{" "}
              and register it in{" "}
              <code className="rounded bg-muted px-1 font-mono text-[11px]">
                src/plugins/index.ts
              </code>
              . Then rebuild the app.
            </DialogDescription>
          </DialogHeader>
          <div className="relative">
            <Textarea
              readOnly
              value={PLUGIN_TEMPLATE_SOURCE}
              className="min-h-[400px] resize-y font-mono text-[11px] leading-relaxed"
              spellCheck={false}
            />
            <Button
              size="sm"
              onClick={onCopyTemplate}
              className="absolute right-2 top-2 gap-1.5"
              variant="secondary"
            >
              {copied ? (
                <>
                  <Check className="h-3.5 w-3.5 text-emerald-500" />
                  Copied
                </>
              ) : (
                <>
                  <Copy className="h-3.5 w-3.5" />
                  Copy
                </>
              )}
            </Button>
          </div>
          <DialogFooter>
            <p className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
              <ShieldCheck className="h-3 w-3 text-emerald-500" />
              User plugins are bundled at build time — they go through the same
              TypeScript checks and tree-shaking as core code.
            </p>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reset confirm */}
      <AlertDialog open={confirmResetOpen} onOpenChange={setConfirmResetOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reset plugin state?</AlertDialogTitle>
            <AlertDialogDescription>
              This clears your enable/disable and per-plugin settings
              overrides. Each plugin reverts to its built-in default. The page
              will reload to apply. Plugin data (e.g. Quick Notes) is NOT
              affected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={onReset}>Reset</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// ---------------------------------------------------------------------------
// Single plugin row
// ---------------------------------------------------------------------------

function PluginRow({ id }: { id: string }) {
  const { toast } = useToast();
  // Subscribe to registry so the toggle reflects the live state.
  usePluginRegistry();
  const plugin = getAllPlugins().find((p) => p.id === id);
  if (!plugin) return null;

  const Icon = resolvePluginIcon(plugin.icon);
  const enabled = isPluginEnabled(id);

  const onToggle = () => {
    const next = togglePlugin(id);
    toast({
      title: `${plugin.name} ${next ? "enabled" : "disabled"}`,
      description: next
        ? "Now appears in the sidebar."
        : "Removed from sidebar and command palette.",
    });
  };

  return (
    <div className="space-y-3 rounded-lg border border-border/60 p-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <div
            className={cn(
              "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
              enabled
                ? "bg-primary/10 text-primary"
                : "bg-muted text-muted-foreground",
            )}
          >
            <Icon className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h4 className="text-sm font-semibold">{plugin.name}</h4>
              <Badge
                variant="outline"
                className="text-[9px] uppercase tracking-wider text-muted-foreground"
              >
                {plugin.category}
              </Badge>
              {plugin.version && (
                <Badge
                  variant="outline"
                  className="text-[9px] text-muted-foreground"
                >
                  v{plugin.version}
                </Badge>
              )}
              {plugin.position === "command-palette-only" && (
                <Badge
                  variant="outline"
                  className="text-[9px] text-muted-foreground"
                >
                  palette-only
                </Badge>
              )}
            </div>
            <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
              {plugin.description}
            </p>
            <div className="mt-1 flex items-center gap-2 text-[10px] text-muted-foreground/70">
              <code className="rounded bg-muted px-1 font-mono">{plugin.id}</code>
              {plugin.author && <span>· by {plugin.author}</span>}
            </div>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Switch
            checked={enabled}
            onCheckedChange={onToggle}
            aria-label={`Toggle ${plugin.name}`}
          />
        </div>
      </div>

      {/* Settings (if any) — only shown when enabled */}
      {plugin.settings && plugin.settings.length > 0 && enabled && (
        <div className="space-y-2 rounded-md border border-border/40 bg-muted/20 p-3">
          <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            <Settings2 className="h-3 w-3" />
            Plugin settings
          </div>
          {plugin.settings.map((s) => (
            <PluginSettingField
              key={s.key}
              pluginId={plugin.id}
              setting={s}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Setting field renderer
// ---------------------------------------------------------------------------

function PluginSettingField({
  pluginId,
  setting,
}: {
  pluginId: string;
  setting: PluginSetting;
}) {
  usePluginRegistry();
  const values = getPluginSettings(pluginId);
  const value = values[setting.key] ?? setting.default;

  const onChange = (v: string | number | boolean) => {
    setPluginSetting(pluginId, setting.key, v);
  };

  if (setting.type === "boolean") {
    return (
      <div className="flex items-center justify-between">
        <div>
          <Label className="text-xs">{setting.label}</Label>
          {setting.description && (
            <p className="text-[10px] text-muted-foreground">
              {setting.description}
            </p>
          )}
        </div>
        <Switch
          checked={Boolean(value)}
          onCheckedChange={(v) => onChange(v)}
        />
      </div>
    );
  }

  if (setting.type === "select" && setting.options) {
    return (
      <div className="space-y-1">
        <Label className="text-xs">{setting.label}</Label>
        <Select value={String(value)} onValueChange={(v) => onChange(v)}>
          <SelectTrigger className="h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {setting.options.map((opt) => (
              <SelectItem
                key={String(opt.value)}
                value={String(opt.value)}
                className="text-xs"
              >
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {setting.description && (
          <p className="text-[10px] text-muted-foreground">
            {setting.description}
          </p>
        )}
      </div>
    );
  }

  if (setting.type === "number") {
    return (
      <div className="space-y-1">
        <Label className="text-xs">{setting.label}</Label>
        <Input
          type="number"
          value={Number(value)}
          onChange={(e) => onChange(Number(e.target.value))}
          className="h-8 text-xs"
        />
      </div>
    );
  }

  // string
  return (
    <div className="space-y-1">
      <Label className="text-xs">{setting.label}</Label>
      <Input
        type="text"
        value={String(value)}
        onChange={(e) => onChange(e.target.value)}
        className="h-8 text-xs"
      />
    </div>
  );
}
