"use client";

import * as React from "react";
import {
  Settings,
  Image as ImageIcon,
  AudioLines,
  Palette,
  X,
  Check,
  Loader2,
  AlertCircle,
  Bot,
  Cpu,
  Sparkles,
  Wifi,
  Eye,
  EyeOff,
  Lock,
  ShieldCheck,
  KeyRound,
  Languages,
  MessageSquare,
  HardDrive,
  RefreshCw,
  ExternalLink,
  DownloadCloud,
  CheckCircle2,
  AlertTriangle,
  Puzzle,
  Mic,
  Brain,
  Activity,
} from "lucide-react";
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
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useTheme } from "next-themes";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/components/language-provider";
import { APP_VERSION, APP_GITHUB } from "@/lib/branding";
import {
  useUpdatePrefs,
  triggerUpdateCheck,
  formatLastChecked,
  type UpdateInfoClient,
} from "@/components/layout/update-notifier";
import { PluginManager } from "@/components/layout/plugin-manager";
import {
  usePluginRegistry,
  getEnabledPlugins,
} from "@/lib/plugin-registry";
import { MemoryManager } from "@/components/features/memory-manager";
import { useContextEngine } from "@/hooks/use-context";

const STORAGE_KEY = "devforge-settings-v2";

export interface VoiceAssistantSettings {
  /** Master switch for the "Hey DevForge" wake-word system. OFF by default. */
  enabled: boolean;
  /** Speak the AI reply aloud via TTS after a voice command. Default ON. */
  ttsReply: boolean;
  /** After each voice command, ask the LLM to mine new memories. Default ON. */
  autoExtractMemories: boolean;
  /** Inject long-term memories into every chat request. Default ON. */
  injectMemories: boolean;
}

export interface AppSettings {
  defaultImageSize: string;
  defaultTtsVoice: string;
  defaultTtsSpeed: number;
  defaultChatSlot: "agents" | "complex";
  /** Stream chat responses word-by-word via SSE (default: ON). */
  streamResponses: boolean;
  /** "Hey DevForge" wake-word + voice command system. OFF by default. */
  voiceAssistant: VoiceAssistantSettings;
}

const DEFAULT_SETTINGS: AppSettings = {
  defaultImageSize: "1024x1024",
  defaultTtsVoice: "tongtong",
  defaultTtsSpeed: 1.0,
  defaultChatSlot: "agents",
  streamResponses: true,
  voiceAssistant: {
    enabled: false,
    ttsReply: true,
    autoExtractMemories: true,
    injectMemories: true,
  },
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
  // OpenAI fallback voices
  { value: "alloy", label: "Alloy · OpenAI" },
  { value: "nova", label: "Nova · OpenAI" },
  { value: "shimmer", label: "Shimmer · OpenAI" },
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
        // Deep-merge the voiceAssistant sub-object so a partial stored value
        // (e.g. just `{ enabled: true }`) doesn't clobber the other defaults.
        const merged: AppSettings = {
          ...DEFAULT_SETTINGS,
          ...parsed,
          voiceAssistant: {
            ...DEFAULT_SETTINGS.voiceAssistant,
            ...(parsed.voiceAssistant ?? {}),
          },
        };
        setSettings(merged);
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
  const { t, locale, setLocale } = useLanguage();
  const [pluginManagerOpen, setPluginManagerOpen] = React.useState(false);
  // Subscribe to the plugin registry so the count badge stays in sync.
  usePluginRegistry();
  const enabledPluginCount = getEnabledPlugins().length;

  // Context awareness — consent flags live in the ContextProvider (separate
  // from AppSettings because they're read on every chat request).
  let ctxEngine: ReturnType<typeof useContextEngine> | null = null;
  try {
    ctxEngine = useContextEngine();
  } catch {
    // Settings dialog can render before the ContextProvider mounts (e.g.
    // during SSR) — fall back to null and skip the Context section.
    ctxEngine = null;
  }
  const va = settings.voiceAssistant;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto scrollbar-thin">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings className="h-4 w-4 text-primary" />
            {t("settings.title")}
          </DialogTitle>
          <DialogDescription>{t("settings.subtitle")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-2">
          {/* Complex tasks model */}
          <ProviderConfig slot="complex" />

          {/* Agents model */}
          <ProviderConfig slot="agents" />

          {/* Z.ai specialty services */}
          <SpecialtyServicesConfig />

          {/* Chat defaults */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <MessageSquare className="h-3.5 w-3.5" />
              {t("settings.chat")}
            </div>
            <div className="flex items-center justify-between rounded-md border border-border/50 px-3 py-2">
              <div className="min-w-0 pr-3">
                <Label className="text-xs">{t("settings.streamResponses")}</Label>
                <p className="mt-0.5 text-[10px] leading-relaxed text-muted-foreground">
                  {t("settings.streamResponsesDesc")}
                </p>
              </div>
              <Switch
                checked={settings.streamResponses}
                onCheckedChange={(v) => update({ streamResponses: v })}
                aria-label={t("settings.streamResponses")}
              />
            </div>
          </div>

          {/* Image defaults */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <ImageIcon className="h-3.5 w-3.5" />
              {t("settings.imageStudio")}
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">{t("settings.defaultOutputSize")}</Label>
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
              {t("settings.voiceLab")}
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">{t("settings.defaultTtsVoice")}</Label>
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

          {/* Voice Assistant (Hey DevForge) */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <Mic className="h-3.5 w-3.5" />
              {t("settings.voiceAssistant")}
            </div>
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              {t("settings.voiceAssistantDesc")}
            </p>
            <div className="space-y-2">
              {/* Master switch */}
              <div className="flex items-center justify-between rounded-md border border-border/50 px-3 py-2">
                <div className="min-w-0 pr-3">
                  <Label className="text-xs">{t("settings.vaEnable")}</Label>
                  <p className="mt-0.5 text-[10px] leading-relaxed text-muted-foreground">
                    {t("settings.vaEnableDesc")}
                  </p>
                </div>
                <Switch
                  checked={va.enabled}
                  onCheckedChange={(v) =>
                    update({
                      voiceAssistant: { ...va, enabled: v },
                    })
                  }
                  aria-label={t("settings.vaEnable")}
                />
              </div>
              {/* TTS reply */}
              <div className="flex items-center justify-between rounded-md border border-border/50 px-3 py-2">
                <div className="min-w-0 pr-3">
                  <Label className="text-xs">{t("settings.vaTtsReply")}</Label>
                  <p className="mt-0.5 text-[10px] leading-relaxed text-muted-foreground">
                    {t("settings.vaTtsReplyDesc")}
                  </p>
                </div>
                <Switch
                  checked={va.ttsReply}
                  onCheckedChange={(v) =>
                    update({
                      voiceAssistant: { ...va, ttsReply: v },
                    })
                  }
                  disabled={!va.enabled}
                  aria-label={t("settings.vaTtsReply")}
                />
              </div>
              {/* Auto extract memories */}
              <div className="flex items-center justify-between rounded-md border border-border/50 px-3 py-2">
                <div className="min-w-0 pr-3">
                  <Label className="text-xs">{t("settings.vaAutoExtract")}</Label>
                  <p className="mt-0.5 text-[10px] leading-relaxed text-muted-foreground">
                    {t("settings.vaAutoExtractDesc")}
                  </p>
                </div>
                <Switch
                  checked={va.autoExtractMemories}
                  onCheckedChange={(v) =>
                    update({
                      voiceAssistant: { ...va, autoExtractMemories: v },
                    })
                  }
                  disabled={!va.enabled}
                  aria-label={t("settings.vaAutoExtract")}
                />
              </div>
              {/* Inject memories into chat */}
              <div className="flex items-center justify-between rounded-md border border-border/50 px-3 py-2">
                <div className="min-w-0 pr-3">
                  <Label className="text-xs">{t("settings.vaInjectMemories")}</Label>
                  <p className="mt-0.5 text-[10px] leading-relaxed text-muted-foreground">
                    {t("settings.vaInjectMemoriesDesc")}
                  </p>
                </div>
                <Switch
                  checked={va.injectMemories}
                  onCheckedChange={(v) =>
                    update({
                      voiceAssistant: { ...va, injectMemories: v },
                    })
                  }
                  aria-label={t("settings.vaInjectMemories")}
                />
              </div>
            </div>
          </div>

          {/* Context Awareness (privacy-consented) */}
          {ctxEngine && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <Activity className="h-3.5 w-3.5" />
                {t("settings.contextAwareness")}
              </div>
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                {t("settings.contextDesc")}
              </p>
              <div className="space-y-2">
                <ConsentToggle
                  icon={Eye}
                  label={t("settings.ctxShareWindow")}
                  desc={t("settings.ctxShareWindowDesc")}
                  checked={ctxEngine.consent.shareActiveWindow}
                  onCheckedChange={(v) =>
                    ctxEngine!.setConsent({ shareActiveWindow: v })
                  }
                />
                <ConsentToggle
                  icon={MessageSquare}
                  label={t("settings.ctxShareSelection")}
                  desc={t("settings.ctxShareSelectionDesc")}
                  checked={ctxEngine.consent.shareSelection}
                  onCheckedChange={(v) =>
                    ctxEngine!.setConsent({ shareSelection: v })
                  }
                />
                <ConsentToggle
                  icon={Wifi}
                  label={t("settings.ctxShareUrl")}
                  desc={t("settings.ctxShareUrlDesc")}
                  checked={ctxEngine.consent.shareBrowserUrl}
                  onCheckedChange={(v) =>
                    ctxEngine!.setConsent({ shareBrowserUrl: v })
                  }
                />
                <ConsentToggle
                  icon={Sparkles}
                  label={t("settings.ctxShareView")}
                  desc={t("settings.ctxShareViewDesc")}
                  checked={ctxEngine.consent.shareDevforgeView}
                  onCheckedChange={(v) =>
                    ctxEngine!.setConsent({ shareDevforgeView: v })
                  }
                />
              </div>
              {ctxEngine.badge && (
                <div className="rounded-md border border-primary/30 bg-primary/5 px-3 py-1.5 text-[11px] text-primary">
                  <span className="font-medium">{t("settings.ctxCurrentBadge")}</span>{" "}
                  <span className="font-mono">{ctxEngine.badge}</span>
                </div>
              )}
              <p className="flex items-start gap-1.5 text-[10px] leading-relaxed text-muted-foreground">
                <ShieldCheck className="mt-0.5 h-3 w-3 shrink-0 text-emerald-500" />
                {t("settings.ctxPrivacyNote")}
              </p>
            </div>
          )}

          {/* AI Memory */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <Brain className="h-3.5 w-3.5" />
              {t("settings.aiMemory")}
            </div>
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              {t("settings.aiMemoryDesc")}
            </p>
            <MemoryManager />
          </div>

          {/* Language */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <Languages className="h-3.5 w-3.5" />
              {t("settings.language")}
            </div>
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              {t("settings.languageDesc")}
            </p>
            <div className="space-y-1.5">
              <Select
                value={locale}
                onValueChange={(v) => setLocale(v as "en" | "ar")}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="en">{t("settings.english")}</SelectItem>
                  <SelectItem value="ar">{t("settings.arabic")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Appearance */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <Palette className="h-3.5 w-3.5" />
              {t("settings.appearance")}
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">{t("settings.theme")}</Label>
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

          {/* Updates */}
          <UpdatesSection />

          {/* Plugins */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <Puzzle className="h-3.5 w-3.5" />
              {t("settings.plugins")}
            </div>
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              {t("settings.pluginsDesc")}
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPluginManagerOpen(true)}
              className="gap-1.5"
            >
              <Puzzle className="h-3.5 w-3.5" />
              {t("settings.managePlugins")}
              <Badge
                variant="outline"
                className="ml-1 border-primary/30 bg-primary/5 text-[10px] text-primary"
              >
                {enabledPluginCount}
              </Badge>
            </Button>
          </div>
        </div>

        <DialogFooter>
          <Button onClick={() => onOpenChange(false)}>
            <Check className="mr-1 h-4 w-4" /> {t("common.done")}
          </Button>
        </DialogFooter>
      </DialogContent>

      {/* Plugin Manager — opened from the Plugins section above. */}
      <PluginManager
        open={pluginManagerOpen}
        onOpenChange={setPluginManagerOpen}
      />
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Provider presets
// ---------------------------------------------------------------------------

type ChatSlot = "complex" | "agents";

interface ProviderPreset {
  label: string;
  providerType:
    | "openai"
    | "deepseek"
    | "zai"
    | "groq"
    | "together"
    | "ollama"
    | "custom";
  baseUrl: string;
  suggestedModels: { complex: string; agents: string };
}

const PROVIDER_PRESETS: ProviderPreset[] = [
  {
    label: "DeepSeek",
    providerType: "deepseek",
    baseUrl: "https://api.deepseek.com/v1",
    suggestedModels: { complex: "deepseek-reasoner", agents: "deepseek-chat" },
  },
  {
    label: "OpenAI",
    providerType: "openai",
    baseUrl: "https://api.openai.com/v1",
    suggestedModels: { complex: "gpt-4o", agents: "gpt-4o-mini" },
  },
  {
    label: "Z.ai (GLM-4.6)",
    providerType: "zai",
    baseUrl: "https://api.z.ai/api/paas/v4",
    suggestedModels: { complex: "glm-4.6", agents: "glm-4.5-air" },
  },
  {
    label: "Groq",
    providerType: "groq",
    baseUrl: "https://api.groq.com/openai/v1",
    suggestedModels: {
      complex: "llama-3.3-70b-versatile",
      agents: "llama-3.1-8b-instant",
    },
  },
  {
    label: "Together AI",
    providerType: "together",
    baseUrl: "https://api.together.xyz/v1",
    suggestedModels: {
      complex: "meta-llama/Llama-3.3-70B-Instruct-Turbo",
      agents: "meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo",
    },
  },
  {
    label: "Ollama (local)",
    providerType: "ollama",
    baseUrl: "http://localhost:11434/v1",
    suggestedModels: { complex: "llama3.1:8b", agents: "qwen2.5:7b" },
  },
  {
    label: "Anthropic — requires LiteLLM proxy",
    providerType: "custom",
    baseUrl: "http://localhost:4000/v1",
    suggestedModels: {
      complex: "claude-3-5-sonnet-20241022",
      agents: "claude-3-5-haiku-20241022",
    },
  },
];

// ---------------------------------------------------------------------------
// Chat slot configuration block (complex OR agents)
// ---------------------------------------------------------------------------

interface ProviderStatus {
  slot: ChatSlot;
  configured: boolean;
  enabled: boolean;
  source: "db" | "env" | "none";
  label?: string;
  providerType?: string;
  baseUrl?: string;
  model?: string;
  temperature?: number | null;
  maxTokens?: number | null;
  apiKeyMasked?: string;
}

interface FullProviderStatus {
  chat: {
    complex: ProviderStatus;
    agents: ProviderStatus;
  };
  specialty: Record<
    "image" | "tts" | "asr" | "web",
    {
      slot: string;
      enabled: boolean;
      source: "db" | "env" | "none";
      baseUrl?: string;
      apiKeyMasked?: string;
    }
  >;
}

// Shape returned by GET /api/provider/ollama-status. Mirrors the
// `OllamaDetectionResult` type in lib/ai-providers.ts (kept local so this
// file doesn't pull the whole ai-providers module into the client bundle).
interface OllamaModel {
  name: string;
  digest: string;
  size: number;
  modifiedAt: string | null;
  parameterSize?: string;
  quantizationLevel?: string;
}

interface OllamaDetection {
  running: boolean;
  models: OllamaModel[];
  endpoint: string;
  root: string;
  reason?: string;
}

function ProviderConfig({ slot }: { slot: ChatSlot }) {
  const { toast } = useToast();
  const [label, setLabel] = React.useState("");
  const [providerType, setProviderType] = React.useState<ProviderPreset["providerType"]>("custom");
  const [baseUrl, setBaseUrl] = React.useState("");
  const [apiKey, setApiKey] = React.useState("");
  const [model, setModel] = React.useState("");
  const [temperature, setTemperature] = React.useState<string>("");
  const [maxTokens, setMaxTokens] = React.useState<string>("");
  const [enabled, setEnabled] = React.useState(true);
  const [showKey, setShowKey] = React.useState(false);
  const [revealing, setRevealing] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [testing, setTesting] = React.useState(false);
  const [selectedPreset, setSelectedPreset] = React.useState<string>("__none__");
  const [testResult, setTestResult] = React.useState<
    { ok: true; latencyMs: number; reply?: string } | { ok: false; error: string } | null
  >(null);
  const [status, setStatus] = React.useState<ProviderStatus | null>(null);
  // Ollama detection state — only used when providerType === "ollama".
  // `null` means "not yet probed"; the user can re-probe via the Detect button.
  const [ollamaStatus, setOllamaStatus] = React.useState<OllamaDetection | null>(null);
  const [ollamaDetecting, setOllamaDetecting] = React.useState(false);

  const isComplex = slot === "complex";
  const slotIcon = isComplex ? Cpu : Bot;
  const SlotIcon = slotIcon;
  const slotTitle = isComplex ? "Complex tasks model" : "Agents model";
  const slotDescription = isComplex
    ? "Strong / reasoning model — used for vision, code review, complex planning."
    : "Fast / default chat model — used for everyday Q&A in the chat panel.";

  // Probe the local Ollama daemon via /api/provider/ollama-status. Non-throwing
  // — on any failure we set a `running: false` result so the UI shows the
  // "not detected" state instead of erroring.
  const detectOllama = React.useCallback(async () => {
    setOllamaDetecting(true);
    try {
      const res = await fetch("/api/provider/ollama-status", {
        cache: "no-store",
      });
      const data = (await res.json().catch(() => null)) as OllamaDetection | null;
      if (data) {
        setOllamaStatus(data);
      } else {
        setOllamaStatus({
          running: false,
          models: [],
          endpoint: "http://localhost:11434/v1",
          root: "http://localhost:11434",
          reason: "Server returned an unexpected response.",
        });
      }
    } catch {
      setOllamaStatus({
        running: false,
        models: [],
        endpoint: "http://localhost:11434/v1",
        root: "http://localhost:11434",
        reason: "Network error while probing Ollama.",
      });
    } finally {
      setOllamaDetecting(false);
    }
  }, []);

  // Load status for this slot from /api/provider
  const loadStatus = React.useCallback(async () => {
    try {
      const res = await fetch("/api/provider", { cache: "no-store" });
      const data = (await res.json()) as FullProviderStatus;
      const s = data?.chat?.[slot];
      if (s) {
        setStatus(s);
        if (s.baseUrl) setBaseUrl(s.baseUrl);
        if (s.model) setModel(s.model);
        if (typeof s.temperature === "number") setTemperature(String(s.temperature));
        if (typeof s.maxTokens === "number") setMaxTokens(String(s.maxTokens));
        if (s.label) setLabel(s.label);
        if (s.providerType) {
          // Map the stored providerType back to a preset value if it matches
          const matched = PROVIDER_PRESETS.find(
            (p) => p.providerType === s.providerType,
          );
          setProviderType(matched ? matched.providerType : "custom");
        }
        if (typeof s.enabled === "boolean") setEnabled(s.enabled);
        // Don't overwrite apiKey — the API returns masked only. Leave the
        // input empty so the user must re-enter to change.
      }
    } catch {
      setStatus(null);
    }
  }, [slot]);

  React.useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  // Auto-probe Ollama whenever this slot switches to the Ollama preset, so
  // the user sees the "running" / "not detected" badge without clicking
  // Detect first. Re-probes if the user manually changes providerType to
  // "ollama" too (e.g. by editing an existing saved config).
  React.useEffect(() => {
    if (providerType === "ollama" && ollamaStatus === null) {
      void detectOllama();
    }
  }, [providerType, ollamaStatus, detectOllama]);

  // Ollama doesn't validate the API key, but our save layer requires a non-
  // empty key. If the slot is configured for Ollama and the key field is
  // empty (e.g. we just loaded a saved Ollama config and didn't pull the
  // key from the server), auto-fill a no-op placeholder so the save / test
  // buttons enable without forcing the user to type anything.
  React.useEffect(() => {
    if (providerType === "ollama" && !apiKey.trim()) {
      setApiKey("ollama");
    }
    // We intentionally DON'T clear apiKey when switching AWAY from Ollama —
    // the user might have intentionally entered a real key for another provider.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [providerType]);

  const onPresetSelect = (presetLabel: string) => {
    const preset = PROVIDER_PRESETS.find((p) => p.label === presetLabel);
    if (!preset) return;
    setProviderType(preset.providerType);
    setBaseUrl(preset.baseUrl);
    setModel(preset.suggestedModels[slot]);
    setLabel(preset.label);
    setTestResult(null);
    // Ollama doesn't check the API key but our save layer requires one to be
    // present. Auto-populate a no-op key so the user doesn't have to type
    // anything to get started. They can still change it if they want.
    if (preset.providerType === "ollama") {
      setApiKey("ollama");
      setShowKey(false);
    }
  };

  const onTest = async () => {
    if (!apiKey.trim() || !baseUrl.trim() || !model.trim()) {
      toast({
        title: "Missing fields",
        description: "API key, base URL, and model are required to test.",
        variant: "destructive",
      });
      return;
    }
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/provider/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slot,
          baseUrl: baseUrl.trim(),
          apiKey: apiKey.trim(),
          model: model.trim(),
        }),
      });
      const data = (await res.json().catch(() => ({}))) as
        | { ok: true; latencyMs?: number; reply?: string }
        | { ok: false; error?: string };
      if (data.ok) {
        setTestResult({
          ok: true,
          latencyMs: data.latencyMs ?? 0,
          reply: data.reply,
        });
        toast({
          title: "Connection OK",
          description: `Model ${model} responded in ${data.latencyMs ?? 0}ms.`,
        });
      } else {
        const err = data.error ?? "Unknown error";
        setTestResult({ ok: false, error: err });
        toast({
          title: "Connection failed",
          description: err,
          variant: "destructive",
        });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Network error.";
      setTestResult({ ok: false, error: msg });
      toast({
        title: "Connection failed",
        description: msg,
        variant: "destructive",
      });
    } finally {
      setTesting(false);
    }
  };

  const onReveal = async () => {
    setRevealing(true);
    try {
      const res = await fetch("/api/provider", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slot, reveal: true, confirm: true }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        apiKey?: string;
        error?: string;
        warning?: string;
      };
      if (!res.ok || !data.ok || !data.apiKey) {
        throw new Error(data.error || "Failed to reveal key.");
      }
      // Populate the input with the real (decrypted) key so the user can
      // verify it. Saving from this state re-encrypts the same value — safe.
      setApiKey(data.apiKey);
      setShowKey(true);
      setTestResult(null);
      toast({
        title: "Key revealed",
        description: "Decrypted locally for this view — click Save to re-encrypt.",
      });
    } catch (err) {
      toast({
        title: "Reveal failed",
        description: err instanceof Error ? err.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setRevealing(false);
    }
  };

  const onSave = async () => {
    // apiKey may be empty if the user is only editing other fields. In that
    // case the server preserves the existing encrypted key. We only need to
    // validate the other required fields below.
    if (!baseUrl.trim() || !model.trim()) {
      toast({
        title: "Missing fields",
        description:
          "Base URL and model name are required. Leave the API key blank to keep the existing one.",
        variant: "destructive",
      });
      return;
    }
    // If there's no key entered AND no existing key configured, we can't save.
    if (!apiKey.trim() && !configured) {
      toast({
        title: "Missing API key",
        description: "Enter an API key to create this configuration.",
        variant: "destructive",
      });
      return;
    }
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        slot,
        providerType,
        label: label.trim() || slotTitle,
        baseUrl: baseUrl.trim(),
        model: model.trim(),
        temperature: temperature.trim() ? Number(temperature) : null,
        maxTokens: maxTokens.trim() ? Number(maxTokens) : null,
        enabled,
      };
      // Only send apiKey if the user entered or revealed one. Otherwise the
      // server preserves the existing key (see handleChatUpsert in route.ts).
      if (apiKey.trim()) {
        payload.apiKey = apiKey.trim();
      }
      const res = await fetch("/api/provider", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
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
        title: `${slotTitle} saved`,
        description: data.message || `Provider set to ${model}.`,
      });
      setApiKey("");
      setShowKey(false);
      setTestResult(null);
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

  const onDisable = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/provider?slot=${slot}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error || "Failed to disable slot.");
      }
      toast({
        title: `${slotTitle} disabled`,
        description: "Chat will fall back to the other slot.",
      });
      setEnabled(false);
      void loadStatus();
    } catch (err) {
      toast({
        title: "Failed to disable",
        description: err instanceof Error ? err.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const configured = status?.configured ?? false;

  return (
    <div className="space-y-3 rounded-lg border border-border/60 p-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <SlotIcon className="h-4 w-4 text-primary" />
          <div>
            <h3 className="text-sm font-semibold">{slotTitle}</h3>
            <p className="text-[11px] text-muted-foreground">
              {slotDescription}
            </p>
          </div>
        </div>
        <StatusBadge
          configured={configured}
          enabled={status?.enabled ?? enabled}
          source={status?.source}
          model={status?.model}
        />
      </div>

      {/* Preset dropdown */}
      <div className="space-y-1.5">
        <Label className="text-xs">Provider preset</Label>
        <Select
          value={selectedPreset}
          onValueChange={(v) => {
            if (v && v !== "__none__") onPresetSelect(v);
            setSelectedPreset("__none__");
          }}
        >
          <SelectTrigger>
            <SelectValue placeholder="Choose a provider to auto-fill…" />
          </SelectTrigger>
          <SelectContent>
            {/* Hidden option so the controlled value can return to placeholder after pick */}
            <SelectItem value="__none__" className="hidden">
              —
            </SelectItem>
            {PROVIDER_PRESETS.map((p) => (
              <SelectItem key={p.label} value={p.label}>
                {p.label} — {p.baseUrl}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Base URL */}
      <div className="space-y-1.5">
        <Label className="text-xs">Base URL (OpenAI-compatible endpoint)</Label>
        <Input
          value={baseUrl}
          onChange={(e) => setBaseUrl(e.target.value)}
          placeholder="https://api.deepseek.com/v1"
          className="font-mono text-xs"
        />
      </div>

      {/* API Key */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label className="text-xs">
            API Key{" "}
            {status?.apiKeyMasked && (
              <span className="text-muted-foreground">
                (current:{" "}
                <code className="rounded bg-muted px-1">{status.apiKeyMasked}</code>)
              </span>
            )}
          </Label>
          <Badge
            variant="outline"
            className="gap-1 border-emerald-500/30 bg-emerald-500/5 text-[10px] text-emerald-600 dark:text-emerald-400"
            title="AES-256-GCM, machine-bound"
          >
            <Lock className="h-3 w-3" />
            Encrypted at rest
          </Badge>
        </div>
        <div className="relative">
          <Input
            type={showKey ? "text" : "password"}
            value={apiKey}
            onChange={(e) => {
              setApiKey(e.target.value);
              setTestResult(null);
            }}
            placeholder={
              status?.apiKeyMasked
                ? "Leave blank to keep current key, or enter new to replace…"
                : "sk-..."
            }
            className="pr-24 font-mono text-xs"
          />
          <div className="absolute right-1 top-1/2 flex -translate-y-1/2 items-center gap-0.5">
            <button
              type="button"
              onClick={onReveal}
              disabled={revealing || !configured}
              className="rounded p-1 text-muted-foreground hover:text-foreground disabled:opacity-40"
              aria-label="Reveal decrypted key"
              title="Reveal decrypted key (admin)"
            >
              {revealing ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <KeyRound className="h-3.5 w-3.5" />
              )}
            </button>
            <button
              type="button"
              onClick={() => setShowKey((v) => !v)}
              className="rounded p-1 text-muted-foreground hover:text-foreground"
              aria-label={showKey ? "Hide key" : "Show key"}
              title={showKey ? "Hide key" : "Show key"}
            >
              {showKey ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            </button>
          </div>
        </div>
        <p className="flex items-center gap-1 text-[10px] text-muted-foreground">
          <ShieldCheck className="h-3 w-3 shrink-0 text-emerald-500" />
          Stored encrypted (AES-256-GCM) in the local SQLite DB. Keys are
          machine-bound — copying the DB to another machine won't expose them.
        </p>
      </div>

      {/* Model name (CRITICAL) */}
      <div className="space-y-1.5">
        <Label className="text-xs">
          Model name <span className="text-destructive">*</span>
        </Label>
        <Input
          value={model}
          onChange={(e) => {
            setModel(e.target.value);
            setTestResult(null);
          }}
          placeholder="e.g. deepseek-chat, gpt-4o-mini, glm-4.5-air"
          className="font-mono text-xs"
        />
        <p className="text-[10px] text-muted-foreground">
          This is sent as the <code className="rounded bg-muted px-1">model</code>{" "}
          field in the API request. The most common reason for "Model Not Exist"
          errors is leaving this blank.
        </p>
      </div>

      {/* Ollama detector — only shown when the slot is configured for Ollama.
          Renders a green "running" badge + dropdown of installed models, or
          a yellow "not detected" badge with an install link. Auto-populates
          the model field when the user picks from the dropdown. */}
      {providerType === "ollama" && (
        <OllamaDetector
          slot={slot}
          detected={ollamaStatus}
          detecting={ollamaDetecting}
          onDetect={detectOllama}
          onPickModel={(m) => {
            setModel(m);
            setTestResult(null);
          }}
        />
      )}

      {/* Temperature + max tokens */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs">Temperature (optional)</Label>
          <Input
            type="number"
            step="0.1"
            min="0"
            max="2"
            value={temperature}
            onChange={(e) => setTemperature(e.target.value)}
            placeholder="0.7"
            className="font-mono text-xs"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Max tokens (optional)</Label>
          <Input
            type="number"
            step="64"
            min="1"
            value={maxTokens}
            onChange={(e) => setMaxTokens(e.target.value)}
            placeholder="2048"
            className="font-mono text-xs"
          />
        </div>
      </div>

      {/* Enabled toggle */}
      <div className="flex items-center justify-between rounded-md border border-border/50 px-3 py-2">
        <Label className="text-xs">Enabled</Label>
        <Switch checked={enabled} onCheckedChange={setEnabled} />
      </div>

      {/* Test result */}
      {testResult && (
        <div
          className={`flex items-start gap-2 rounded-md border px-3 py-2 text-xs ${
            testResult.ok
              ? "border-emerald-500/30 bg-emerald-500/5 text-emerald-600 dark:text-emerald-400"
              : "border-destructive/30 bg-destructive/5 text-destructive"
          }`}
        >
          {testResult.ok ? (
            <>
              <Check className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <div>
                <div>Connection OK — {testResult.latencyMs}ms</div>
                {testResult.reply && (
                  <div className="mt-0.5 font-mono text-[10px] opacity-70">
                    Reply: {testResult.reply}
                  </div>
                )}
              </div>
            </>
          ) : (
            <>
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <div className="break-words">{testResult.error}</div>
            </>
          )}
        </div>
      )}

      {/* Action buttons */}
      <div className="flex flex-wrap gap-2 pt-1">
        <Button
          onClick={onTest}
          disabled={testing || !apiKey.trim() || !baseUrl.trim() || !model.trim()}
          size="sm"
          variant="outline"
          className="flex-1"
        >
          {testing ? (
            <>
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              Testing…
            </>
          ) : (
            <>
              <Wifi className="mr-1.5 h-3.5 w-3.5" />
              Test connection
            </>
          )}
        </Button>
        <Button
          onClick={onSave}
          disabled={saving || !baseUrl.trim() || !model.trim() || (!apiKey.trim() && !configured)}
          size="sm"
          className="flex-1"
        >
          {saving ? (
            <>
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              Saving…
            </>
          ) : (
            <>
              <Check className="mr-1.5 h-3.5 w-3.5" />
              Save
            </>
          )}
        </Button>
        <Button
          onClick={onDisable}
          disabled={saving || !configured}
          size="sm"
          variant="ghost"
        >
          Disable
        </Button>
      </div>

      <p className="text-[10px] leading-relaxed text-muted-foreground">
        Your key is encrypted at rest (AES-256-GCM, machine-bound) in the local
        SQLite database — server-side only, never exposed to the browser except
        when you click <em>Reveal</em>. Changes apply instantly to new requests —
        no restart needed.
      </p>
    </div>
  );
}

function StatusBadge({
  configured,
  enabled,
  source,
  model,
}: {
  configured: boolean;
  enabled: boolean;
  source?: string;
  model?: string;
}) {
  if (!configured) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/5 px-2 py-0.5 text-[10px] text-amber-600 dark:text-amber-400">
        <AlertCircle className="h-3 w-3" />
        Not configured
      </span>
    );
  }
  if (!enabled) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-zinc-500/30 bg-zinc-500/5 px-2 py-0.5 text-[10px] text-zinc-600 dark:text-zinc-400">
        <X className="h-3 w-3" />
        Disabled
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/5 px-2 py-0.5 text-[10px] text-emerald-600 dark:text-emerald-400">
      <Check className="h-3 w-3" />
      {model ? model : `via ${source ?? "env"}`}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Ollama detector block — shows running state + model dropdown
// ---------------------------------------------------------------------------

/** Format bytes as a short human-readable string ("2.0 GB", "447 MB", etc). */
function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return "—";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let n = bytes;
  let i = 0;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i++;
  }
  return `${n.toFixed(n < 10 && i > 0 ? 1 : 0)} ${units[i]}`;
}

/**
 * Inline Ollama detector — rendered inside ProviderConfig when the slot is
 * configured for Ollama. Shows a green "running" badge with a model dropdown
 * (each entry shows name, size, and quantization) when Ollama is detected,
 * or a yellow "not detected" badge with an install link when it isn't.
 *
 * Picking a model from the dropdown calls `onPickModel(name)` which feeds
 * the value into the parent's `model` state — so the rest of the save /
 * test flow works unchanged.
 */
function OllamaDetector({
  slot,
  detected,
  detecting,
  onDetect,
  onPickModel,
}: {
  slot: ChatSlot;
  detected: OllamaDetection | null;
  detecting: boolean;
  onDetect: () => void;
  onPickModel: (modelName: string) => void;
}) {
  const running = detected?.running === true;
  const models = detected?.models ?? [];
  const reason = detected?.reason;
  const endpoint = detected?.endpoint ?? "http://localhost:11434/v1";

  return (
    <div className="space-y-2 rounded-md border border-border/50 bg-muted/20 p-3">
      {/* Header: badge + detect button */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <HardDrive className="h-3.5 w-3.5 text-primary" />
          <span className="text-xs font-medium">Ollama status</span>
          {detected === null && !detecting ? (
            <span className="inline-flex items-center gap-1 rounded-full border border-zinc-500/30 bg-zinc-500/5 px-2 py-0.5 text-[10px] text-zinc-600 dark:text-zinc-400">
              <AlertCircle className="h-3 w-3" />
              Not probed
            </span>
          ) : detecting ? (
            <span className="inline-flex items-center gap-1 rounded-full border border-sky-500/30 bg-sky-500/5 px-2 py-0.5 text-[10px] text-sky-600 dark:text-sky-400">
              <Loader2 className="h-3 w-3 animate-spin" />
              Probing…
            </span>
          ) : running ? (
            <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/5 px-2 py-0.5 text-[10px] text-emerald-600 dark:text-emerald-400">
              <Check className="h-3 w-3" />
              Ollama running · {models.length} model{models.length === 1 ? "" : "s"}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/5 px-2 py-0.5 text-[10px] text-amber-600 dark:text-amber-400">
              <AlertCircle className="h-3 w-3" />
              Ollama not detected
            </span>
          )}
        </div>
        <Button
          type="button"
          onClick={onDetect}
          disabled={detecting}
          size="sm"
          variant="outline"
          className="h-7 px-2 text-[11px]"
        >
          {detecting ? (
            <Loader2 className="mr-1 h-3 w-3 animate-spin" />
          ) : (
            <RefreshCw className="mr-1 h-3 w-3" />
          )}
          {detected === null ? "Detect Ollama" : "Re-detect"}
        </Button>
      </div>

      {/* Body: model dropdown (when running) or install hint (when not). */}
      {running ? (
        <div className="space-y-1.5">
          <Label className="text-[11px] text-muted-foreground">
            Installed models — pick one to fill the model field for this slot ({slot}).
          </Label>
          {models.length === 0 ? (
            <div className="rounded-md border border-dashed border-border/60 bg-background/40 px-3 py-2 text-[11px] text-muted-foreground">
              Ollama is running but no models are installed yet. Run{" "}
              <code className="rounded bg-muted px-1">ollama pull llama3.2</code>{" "}
              in a terminal to install one, then click Re-detect.
            </div>
          ) : (
            <Select
              value=""
              onValueChange={(v) => {
                if (v) onPickModel(v);
              }}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="Pick an installed model…" />
              </SelectTrigger>
              <SelectContent>
                {models.map((m) => (
                  <SelectItem
                    key={m.digest || m.name}
                    value={m.name}
                    className="text-xs"
                  >
                    <span className="font-mono">{m.name}</span>
                    <span className="ml-2 text-[10px] text-muted-foreground">
                      {m.parameterSize ? `${m.parameterSize} · ` : ""}
                      {formatBytes(m.size)}
                      {m.quantizationLevel ? ` · ${m.quantizationLevel}` : ""}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <p className="text-[10px] text-muted-foreground">
            Endpoint:{" "}
            <code className="rounded bg-muted px-1 text-[10px]">{endpoint}</code>
          </p>
        </div>
      ) : (
        <div className="space-y-1.5">
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            Ollama wasn&apos;t found at{" "}
            <code className="rounded bg-muted px-1 text-[10px]">
              http://localhost:11434
            </code>
            . Install it from{" "}
            <a
              href="https://ollama.com"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-0.5 font-medium text-primary hover:underline"
            >
              ollama.com
              <ExternalLink className="h-3 w-3" />
            </a>
            , then run{" "}
            <code className="rounded bg-muted px-1 text-[10px]">
              ollama pull llama3.2
            </code>{" "}
            and click Re-detect.
          </p>
          {reason && (
            <p className="text-[10px] italic text-muted-foreground/80">
              {reason}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Z.ai specialty services block
// ---------------------------------------------------------------------------

type SpecialtySlot = "image" | "tts" | "asr" | "web";

interface SpecialtyStatus {
  slot: string;
  enabled: boolean;
  source: "db" | "env" | "none";
  baseUrl?: string;
  apiKeyMasked?: string;
}

function SpecialtyServicesConfig() {
  const { toast } = useToast();
  const [apiKey, setApiKey] = React.useState("");
  const [baseUrl, setBaseUrl] = React.useState(
    "https://api.z.ai/api/paas/v4",
  );
  const [statuses, setStatuses] = React.useState<Record<SpecialtySlot, SpecialtyStatus | null>>({
    image: null,
    tts: null,
    asr: null,
    web: null,
  });
  const [showKey, setShowKey] = React.useState(false);
  const [revealing, setRevealing] = React.useState(false);
  const [savingSlot, setSavingSlot] = React.useState<SpecialtySlot | null>(null);

  const loadStatus = React.useCallback(async () => {
    try {
      const res = await fetch("/api/provider", { cache: "no-store" });
      const data = (await res.json()) as FullProviderStatus;
      setStatuses({
        image: data.specialty.image,
        tts: data.specialty.tts,
        asr: data.specialty.asr,
        web: data.specialty.web,
      });
      // Auto-fill baseUrl from any configured specialty slot
      for (const k of ["image", "tts", "asr", "web"] as SpecialtySlot[]) {
        const s = data.specialty[k];
        if (s?.baseUrl) {
          setBaseUrl(s.baseUrl);
          break;
        }
      }
    } catch {
      /* ignore */
    }
  }, []);

  React.useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  const onRevealSpecialty = async () => {
    // Reveal the first specialty slot that has a key stored. Since users
    // typically share one Z.ai key across all 4 specialty slots, this is
    // usually what they want.
    const slotsInOrder: SpecialtySlot[] = ["image", "tts", "asr", "web"];
    const configuredSlot = slotsInOrder.find(
      (s) => statuses[s]?.apiKeyMasked,
    );
    if (!configuredSlot) {
      toast({
        title: "Nothing to reveal",
        description: "No Z.ai specialty service has a key stored yet.",
        variant: "destructive",
      });
      return;
    }
    setRevealing(true);
    try {
      const res = await fetch("/api/provider", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slot: configuredSlot, reveal: true, confirm: true }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        apiKey?: string;
        error?: string;
      };
      if (!res.ok || !data.ok || !data.apiKey) {
        throw new Error(data.error || "Failed to reveal key.");
      }
      setApiKey(data.apiKey);
      setShowKey(true);
      toast({
        title: "Key revealed",
        description: `Loaded the key stored for slot "${configuredSlot}". Save a slot to re-encrypt.`,
      });
    } catch (err) {
      toast({
        title: "Reveal failed",
        description: err instanceof Error ? err.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setRevealing(false);
    }
  };

  const saveSlot = async (slot: SpecialtySlot, enabled: boolean) => {
    const hasExisting = !!statuses[slot]?.apiKeyMasked;
    if (!apiKey.trim() && !hasExisting) {
      toast({
        title: "Missing key",
        description: "Enter your Z.ai API key first, or click Reveal to load an existing one.",
        variant: "destructive",
      });
      return;
    }
    setSavingSlot(slot);
    try {
      const payload: Record<string, unknown> = {
        slot,
        baseUrl: baseUrl.trim(),
        enabled,
      };
      // Only send apiKey if the user entered or revealed one. Otherwise the
      // server preserves the existing key for this slot.
      if (apiKey.trim()) {
        payload.apiKey = apiKey.trim();
      }
      const res = await fetch("/api/provider", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        message?: string;
      };
      if (!res.ok || !data.ok) {
        throw new Error(data.error || "Failed to save specialty config.");
      }
      toast({
        title: `${slot.toUpperCase()} ${enabled ? "enabled" : "saved"}`,
        description: data.message,
      });
      // Note: we DON'T clear apiKey here — the user may want to enable
      // multiple specialty slots with the same key in sequence.
      void loadStatus();
    } catch (err) {
      toast({
        title: "Failed to save",
        description: err instanceof Error ? err.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setSavingSlot(null);
    }
  };

  return (
    <div className="space-y-3 rounded-lg border border-border/60 p-4">
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-primary" />
        <div>
          <h3 className="text-sm font-semibold">Specialty services (Z.ai)</h3>
          <p className="text-[11px] text-muted-foreground">
            Optional Z.ai-only services (image gen, TTS, ASR, web search/read).
            A single API key covers all four.
          </p>
        </div>
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label className="text-xs">Z.ai API key</Label>
          <Badge
            variant="outline"
            className="gap-1 border-emerald-500/30 bg-emerald-500/5 text-[10px] text-emerald-600 dark:text-emerald-400"
            title="AES-256-GCM, machine-bound"
          >
            <Lock className="h-3 w-3" />
            Encrypted at rest
          </Badge>
        </div>
        <div className="relative">
          <Input
            type={showKey ? "text" : "password"}
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={
              statuses.image?.apiKeyMasked
                ? `Current: ${statuses.image.apiKeyMasked} — leave blank to keep, or enter new`
                : "sk-..."
            }
            className="pr-24 font-mono text-xs"
          />
          <div className="absolute right-1 top-1/2 flex -translate-y-1/2 items-center gap-0.5">
            <button
              type="button"
              onClick={onRevealSpecialty}
              disabled={revealing || !Object.values(statuses).some((s) => s?.apiKeyMasked)}
              className="rounded p-1 text-muted-foreground hover:text-foreground disabled:opacity-40"
              aria-label="Reveal decrypted key"
              title="Reveal decrypted key (admin)"
            >
              {revealing ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <KeyRound className="h-3.5 w-3.5" />
              )}
            </button>
            <button
              type="button"
              onClick={() => setShowKey((v) => !v)}
              className="rounded p-1 text-muted-foreground hover:text-foreground"
              aria-label={showKey ? "Hide key" : "Show key"}
              title={showKey ? "Hide key" : "Show key"}
            >
              {showKey ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            </button>
          </div>
        </div>
        <p className="flex items-center gap-1 text-[10px] text-muted-foreground">
          <ShieldCheck className="h-3 w-3 shrink-0 text-emerald-500" />
          Encrypted (AES-256-GCM) in the local SQLite DB. The same key is used
          for all four specialty services.
        </p>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">Z.ai base URL</Label>
        <Input
          value={baseUrl}
          onChange={(e) => setBaseUrl(e.target.value)}
          className="font-mono text-xs"
        />
      </div>

      <div className="space-y-2 pt-1">
        {(["image", "tts", "asr", "web"] as SpecialtySlot[]).map((slot) => {
          const s = statuses[slot];
          const enabled = s?.enabled ?? false;
          const sourceLabel = s?.source === "env" ? " (via env)" : "";
          return (
            <div
              key={slot}
              className="flex items-center justify-between rounded-md border border-border/50 px-3 py-2"
            >
              <div className="flex items-center gap-2">
                <Switch
                  checked={enabled}
                  disabled={savingSlot === slot}
                  onCheckedChange={(v) => void saveSlot(slot, v)}
                />
                <div>
                  <div className="text-xs font-medium capitalize">
                    {slot === "tts" ? "TTS" : slot === "asr" ? "ASR" : slot}
                    {sourceLabel && (
                      <span className="ml-1 text-[10px] text-muted-foreground">
                        {sourceLabel}
                      </span>
                    )}
                  </div>
                  <div className="text-[10px] text-muted-foreground">
                    {slot === "image" && "Image generation (Z.ai or DALL-E fallback)"}
                    {slot === "tts" && "Text-to-speech (Z.ai or OpenAI fallback)"}
                    {slot === "asr" && "Speech-to-text (Z.ai or Whisper fallback)"}
                    {slot === "web" && "Web search & page reader (Z.ai only)"}
                  </div>
                </div>
              </div>
              {s?.apiKeyMasked && (
                <code className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                  {s.apiKeyMasked}
                </code>
              )}
            </div>
          );
        })}
      </div>

      <p className="text-[10px] leading-relaxed text-muted-foreground">
        When a specialty service is OFF, the corresponding feature will try an
        OpenAI fallback (image/TTS/ASR only) via the Complex tasks model slot,
        or return 501 (web only).
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
//  Updates section
// ---------------------------------------------------------------------------
//
//  Shows the current app version, last-checked timestamp, an auto-check
//  toggle, and a manual "Check for updates" button. Listens to the
//  devforge-update-state events broadcast by <UpdateNotifier /> so the UI
//  stays in sync without prop-drilling.
// ---------------------------------------------------------------------------

type UpdateStatus =
  | "idle"
  | "checking"
  | "available"
  | "up-to-date"
  | "downloading"
  | "ready"
  | "installing"
  | "error";

function UpdatesSection() {
  const { prefs, update } = useUpdatePrefs();
  const { toast } = useToast();
  const [status, setStatus] = React.useState<UpdateStatus>("idle");
  const [info, setInfo] = React.useState<UpdateInfoClient | null>(null);

  // Listen for state broadcasts from <UpdateNotifier />.
  React.useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{
        status: UpdateStatus;
        info: UpdateInfoClient | null;
      }>).detail;
      if (!detail) return;
      setStatus(detail.status);
      setInfo(detail.info);
    };
    window.addEventListener("devforge-update-state", handler);
    return () => window.removeEventListener("devforge-update-state", handler);
  }, []);

  const handleCheck = () => {
    triggerUpdateCheck();
    toast({
      title: "Checking for updates…",
      description: "Contacting GitHub for the latest release.",
    });
  };

  const isChecking = status === "checking";
  const updateAvailable = status === "available" || status === "downloading" ||
    status === "ready" || status === "installing";

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        <DownloadCloud className="h-3.5 w-3.5" />
        Updates
      </div>

      {/* Current version + status badge */}
      <div className="flex items-center justify-between rounded-md border border-border/50 px-3 py-2">
        <div className="min-w-0 pr-3">
          <div className="text-xs font-medium">Current version</div>
          <div className="mt-0.5 font-mono text-[11px] text-muted-foreground">
            v{APP_VERSION}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {status === "checking" && (
            <Badge variant="secondary" className="gap-1">
              <RefreshCw className="h-3 w-3 animate-spin" />
              Checking
            </Badge>
          )}
          {status === "available" && (
            <Badge className="gap-1 bg-primary/15 text-primary hover:bg-primary/20">
              <DownloadCloud className="h-3 w-3" />
              v{info?.latestVersion} available
            </Badge>
          )}
          {status === "downloading" && (
            <Badge variant="secondary" className="gap-1">
              <RefreshCw className="h-3 w-3 animate-spin" />
              Downloading
            </Badge>
          )}
          {status === "ready" && (
            <Badge className="gap-1 bg-emerald-500/15 text-emerald-600 hover:bg-emerald-500/20">
              <CheckCircle2 className="h-3 w-3" />
              Ready to install
            </Badge>
          )}
          {status === "installing" && (
            <Badge variant="secondary" className="gap-1">
              <RefreshCw className="h-3 w-3 animate-spin" />
              Installing
            </Badge>
          )}
          {status === "error" && (
            <Badge variant="destructive" className="gap-1">
              <AlertTriangle className="h-3 w-3" />
              Error
            </Badge>
          )}
          {(status === "idle" || status === "up-to-date") && (
            <Badge variant="outline" className="gap-1">
              <CheckCircle2 className="h-3 w-3 text-emerald-500" />
              Up to date
            </Badge>
          )}
        </div>
      </div>

      {/* Last checked + auto-check toggle */}
      <div className="flex items-center justify-between rounded-md border border-border/50 px-3 py-2">
        <div className="min-w-0 pr-3">
          <Label className="text-xs">Auto-check for updates</Label>
          <p className="mt-0.5 text-[10px] leading-relaxed text-muted-foreground">
            Last checked: {formatLastChecked(prefs.lastCheckedAt)}. When on,
            DevForge checks GitHub hourly in the background.
          </p>
        </div>
        <Switch
          checked={prefs.autoCheck}
          onCheckedChange={(v) => update({ autoCheck: v })}
          aria-label="Auto-check for updates"
        />
      </div>

      {/* Manual check button */}
      <div className="flex items-center justify-between gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={handleCheck}
          disabled={isChecking || updateAvailable}
        >
          {isChecking ? (
            <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
          ) : (
            <RefreshCw className="mr-1 h-3.5 w-3.5" />
          )}
          {isChecking ? "Checking…" : "Check for updates"}
        </Button>
        <a
          href={APP_GITHUB + "/releases"}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-primary hover:underline"
        >
          <ExternalLink className="h-3 w-3" />
          View releases on GitHub
        </a>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
//  Consent toggle — small labelled row with icon + switch (used by the
//  Context Awareness section in Settings).
// ---------------------------------------------------------------------------

function ConsentToggle({
  icon: Icon,
  label,
  desc,
  checked,
  onCheckedChange,
}: {
  icon: React.ElementType;
  label: string;
  desc: string;
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between rounded-md border border-border/50 px-3 py-2">
      <div className="flex min-w-0 items-start gap-2 pr-3">
        <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary/70" />
        <div className="min-w-0">
          <Label className="text-xs">{label}</Label>
          <p className="mt-0.5 text-[10px] leading-relaxed text-muted-foreground">
            {desc}
          </p>
        </div>
      </div>
      <Switch checked={checked} onCheckedChange={onCheckedChange} aria-label={label} />
    </div>
  );
}
