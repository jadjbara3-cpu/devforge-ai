"use client";

import * as React from "react";
import { Settings, Image as ImageIcon, AudioLines, Palette, X, Check } from "lucide-react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useTheme } from "next-themes";

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
  const [loaded, setLoaded] = React.useState(false);

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
    setLoaded(true);
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
      {loaded ? children : null}
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
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings className="h-4 w-4 text-primary" />
            Settings
          </DialogTitle>
          <DialogDescription>
            Customize your DevForge AI defaults. Saved to your browser.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
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
