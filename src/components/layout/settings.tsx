"use client";

import * as React from "react";
import { Settings, Image as ImageIcon, AudioLines, Palette, X, Check, Key, Loader2, AlertCircle, Bot } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useTheme } from "next-themes";
import { useToast } from "@/hooks/use-toast";

const STORAGE_KEY = "devforge-settings-v1";

export interface AppSettings {
  defaultImageSize: string;
  defaultTtsVoice: string;
  defaultTtsSpeed: number;
}

const DEFAULT_SETTINGS: AppSettings = {
  defaultImageSize: "1024x1024",
  defaultTtsVoice: "tongtong",
  defaultTtsSpeed: 1.0,
};

const IMAGE_SIZES = [
  { value: "1024x1024", label: "1024×1024 · Square" },
  { value: "768x1344", label: "768×1344 · Portrait" },
  { value: "864x1152", label: "864×1152 · Portrait" },
  { value: "1344x768", label: "1344×768 · Landscape" },
  { value: "1152x864", label: "1152×864 · Landscape" },
  { value: "1440x720", label: "1440×720 · Widescreen" },
  { value: "720x1440", label: "720×1440 · Tall Portrait" },
];

const TTS_VOICES = [
  { value: "tongtong", label: "Tongtong · Warm" },
  { value: "chuichui", label: "Chuichui · Lively" },
  { value: "xiaochen", label: "Xiaochen · Calm" },
  { value: "jam", label: "Jam · British" },
  { value: "kazi", label: "Kazi · Clear" },
  { value: "douji", label: "Douji · Natural" },
  { value: "luodo", label: "Luodo · Expressive" },
];

const SettingsContext = React.createContext<{
  settings: AppSettings;
  update: (patch: Partial<AppSettings>) => void;
}>({
  settings: DEFAULT_SETTINGS,
  update: () => {},
});

export function useSettings() {
  return React.useContext(SettingsContext);
}

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = React.useState<AppSettings>(DEFAULT_SETTINGS);

  React.useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<AppSettings>;
        setSettings({ ...DEFAULT_SETTINGS, ...parsed });
      }
    } catch {
      /* ignore */
    }
  }, []);

  const update = React.useCallback((patch: Partial<AppSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  const value = React.useMemo(() => ({ settings, update }), [settings, update]);

  return (
    <SettingsContext.Provider value={value}>
      {children}
    </SettingsContext.Provider>
  );
}

export function SettingsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { settings, update } = useSettings();
  const { resolvedTheme, setTheme } = useTheme();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto scrollbar-thin">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings className="h-4 w-4 text-primary" />
            Settings
          </DialogTitle>
          <DialogDescription>
            Configure your AI provider and app defaults.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* AI Provider */}
          <ProviderConfig />

          {/* Image defaults */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <ImageIcon className="h-3.5 w-3.5" />
              Image Studio
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Default output size</Label>
              <Select
                value={settings.defaultImageSize}
                onValueChange={(v) => update({ defaultImageSize: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {IMAGE_SIZES.map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Voice defaults */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <AudioLines className="h-3.5 w-3.5" />
              Voice Lab
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Default TTS voice</Label>
              <Select
                value={settings.defaultTtsVoice}
                onValueChange={(v) => update({ defaultTtsVoice: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TTS_VOICES.map((v) => (
                    <SelectItem key={v.value} value={v.value}>
                      {v.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Appearance */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <Palette className="h-3.5 w-3.5" />
              Appearance
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Theme</Label>
              <Select
                value={resolvedTheme || "dark"}
                onValueChange={(v) => setTheme(v)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="light">Light</SelectItem>
                  <SelectItem value="dark">Dark</SelectItem>
                  <SelectItem value="system">System</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button onClick={() => onOpenChange(false)}>
            <Check className="mr-1 h-4 w-4" /> Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// AI Provider configuration
// ---------------------------------------------------------------------------

const PROVIDER_PRESETS: { label: string; baseUrl: string }[] = [
  { label: "Z.ai (default)", baseUrl: "https://api.z.ai/api/paas/v4" },
  { label: "OpenAI", baseUrl: "https://api.openai.com/v1" },
  { label: "Anthropic (Claude)", baseUrl: "https://api.anthropic.com/v1" },
  { label: "Google (Gemini)", baseUrl: "https://generativelanguage.googleapis.com/v1" },
  { label: "Groq", baseUrl: "https://api.groq.com/openai/v1" },
  { label: "Together AI", baseUrl: "https://api.together.xyz/v1" },
  { label: "Ollama (local)", baseUrl: "http://localhost:11434/v1" },
];

function ProviderConfig() {
  const { toast } = useToast();
  const [apiKey, setApiKey] = React.useState("");
  const [baseUrl, setBaseUrl] = React.useState("");
  const [status, setStatus] = React.useState<{
    configured: boolean;
    source: string;
    baseUrl?: string;
  } | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [showKey, setShowKey] = React.useState(false);

  // Load current provider status
  const loadStatus = React.useCallback(async () => {
    try {
      const res = await fetch("/api/provider", { cache: "no-store" });
      const data = (await res.json()) as typeof status;
      setStatus(data);
      if (data?.baseUrl) setBaseUrl(data.baseUrl);
    } catch {
      setStatus({ configured: false, source: "none" });
    }
  }, []);

  React.useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  const onSave = async () => {
    if (!apiKey.trim() || !baseUrl.trim()) {
      toast({
        title: "Missing fields",
        description: "Both API key and Base URL are required.",
        variant: "destructive",
      });
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/provider", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: apiKey.trim(), baseUrl: baseUrl.trim() }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        message?: string;
      };
      if (!res.ok || !data.ok) {
        throw new Error(data.error || "Failed to save configuration.");
      }
      toast({
        title: "Provider configured",
        description: data.message || "Restart the dev server to apply.",
      });
      setApiKey("");
      void loadStatus();
    } catch (err) {
      toast({
        title: "Configuration failed",
        description: err instanceof Error ? err.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        <Key className="h-3.5 w-3.5" />
        AI Provider
      </div>

      {/* Status badge */}
      {status && (
        <div
          className={`flex items-center gap-2 rounded-md border px-3 py-2 text-xs ${
            status.configured
              ? "border-emerald-500/30 bg-emerald-500/5 text-emerald-600 dark:text-emerald-400"
              : "border-amber-500/30 bg-amber-500/5 text-amber-600 dark:text-amber-400"
          }`}
        >
          {status.configured ? (
            <Check className="h-3.5 w-3.5" />
          ) : (
            <AlertCircle className="h-3.5 w-3.5" />
          )}
          <span>
            {status.configured
              ? `Configured via ${status.source === "env" ? ".env" : "config file"}`
              : "Not configured — AI features will fail"}
            {status.baseUrl && (
              <span className="ml-1 text-muted-foreground">
                ({status.baseUrl.replace(/^https?:\/\//, "").split("/")[0]})
              </span>
            )}
          </span>
        </div>
      )}

      {/* API Key */}
      <div className="space-y-1.5">
        <Label className="text-xs">API Key</Label>
        <div className="relative">
          <Input
            type={showKey ? "text" : "password"}
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="sk-..."
            className="pr-16 font-mono text-xs"
          />
          <button
            type="button"
            onClick={() => setShowKey((v) => !v)}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground hover:text-foreground"
          >
            {showKey ? "Hide" : "Show"}
          </button>
        </div>
      </div>

      {/* Base URL */}
      <div className="space-y-1.5">
        <Label className="text-xs">Base URL (API endpoint)</Label>
        <Input
          value={baseUrl}
          onChange={(e) => setBaseUrl(e.target.value)}
          placeholder="https://api.example.com/v1"
          className="font-mono text-xs"
        />
        {/* Quick presets */}
        <div className="flex flex-wrap gap-1 pt-1">
          {PROVIDER_PRESETS.map((p) => (
            <button
              key={p.baseUrl}
              onClick={() => setBaseUrl(p.baseUrl)}
              className="rounded-full border border-border px-2 py-0.5 text-[10px] text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Save button */}
      <Button
        onClick={onSave}
        disabled={saving || !apiKey.trim() || !baseUrl.trim()}
        size="sm"
        className="w-full"
      >
        {saving ? (
          <>
            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            Saving…
          </>
        ) : (
          <>
            <Bot className="mr-1.5 h-3.5 w-3.5" />
            Save & Configure
          </>
        )}
      </Button>

      <p className="text-[10px] leading-relaxed text-muted-foreground">
        Your key is stored in the local <code className="rounded bg-muted px-1">.env</code> file
        (server-side only, never exposed to the browser). After saving, restart the dev
        server (<code className="rounded bg-muted px-1">Ctrl+C</code> then{" "}
        <code className="rounded bg-muted px-1">bun run dev</code>) for changes to take effect.
      </p>
    </div>
  );
}
