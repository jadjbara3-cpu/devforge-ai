"use client";

import * as React from "react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";
import {
  Sparkles,
  Bot,
  Image as ImageIcon,
  Eye,
  AudioLines,
  Globe,
  Code2,
  KanbanSquare,
  Sun,
  Moon,
  Search,
  Zap,
  CornerDownLeft,
  Info,
  Languages,
  Puzzle,
  ClipboardList,
  Command as CommandIcon,
  Workflow as WorkflowIcon,
  Bell,
  MonitorSmartphone,
} from "lucide-react";
import {
  type FeatureKey,
  type AssistantFeatureKey,
  type ViewKey,
} from "@/lib/features";
import { APP_AUTHOR } from "@/lib/branding";
import { useHotkey } from "@/hooks/use-hotkey";
import { useTheme } from "next-themes";
import { useLanguage } from "@/components/language-provider";
import {
  usePalettePlugins,
  resolvePluginIcon,
} from "@/lib/plugin-registry";

// Map each Workspace feature key to its icon, translation-key, and number shortcut.
const NAV_META: {
  key: FeatureKey;
  labelKey: string;
  icon: React.ElementType;
  num: number;
}[] = [
  { key: "overview", labelKey: "sidebar.overview", icon: Sparkles, num: 1 },
  { key: "chat", labelKey: "sidebar.chat", icon: Bot, num: 2 },
  { key: "image", labelKey: "sidebar.images", icon: ImageIcon, num: 3 },
  { key: "vision", labelKey: "sidebar.vision", icon: Eye, num: 4 },
  { key: "voice", labelKey: "sidebar.voice", icon: AudioLines, num: 5 },
  { key: "web", labelKey: "sidebar.web", icon: Globe, num: 6 },
  { key: "snippets", labelKey: "sidebar.snippets", icon: Code2, num: 7 },
  { key: "board", labelKey: "sidebar.tasks", icon: KanbanSquare, num: 8 },
];

// Assistant feature keys (Task 1-C) — no number shortcuts.
const ASSISTANT_NAV_META: {
  key: AssistantFeatureKey;
  labelKey: string;
  descKey: string;
  icon: React.ElementType;
}[] = [
  { key: "clipboard", labelKey: "assistant.clipboard.nav", descKey: "assistant.clipboard.navDesc", icon: ClipboardList },
  { key: "quickactions", labelKey: "assistant.quickActions.nav", descKey: "assistant.quickActions.navDesc", icon: CommandIcon },
  { key: "workflow", labelKey: "assistant.workflow.nav", descKey: "assistant.workflow.navDesc", icon: WorkflowIcon },
  { key: "proactive", labelKey: "assistant.proactive.nav", descKey: "assistant.proactive.navDesc", icon: Bell },
  { key: "screens", labelKey: "assistant.screens.nav", descKey: "assistant.screens.navDesc", icon: MonitorSmartphone },
];

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onNavigate: (k: ViewKey) => void;
  actions?: { label: string; run: () => void; icon?: React.ElementType }[];
  onOpenAbout?: () => void;
}

export function CommandPalette({
  open,
  onOpenChange,
  onNavigate,
  actions = [],
  onOpenAbout,
}: CommandPaletteProps) {
  const { resolvedTheme, setTheme } = useTheme();
  const { t, locale, setLocale } = useLanguage();
  const plugins = usePalettePlugins();

  const navItems = NAV_META.map((m) => ({
    key: m.key,
    label: t(m.labelKey),
    icon: m.icon,
    num: m.num,
  }));

  const assistantItems = ASSISTANT_NAV_META.map((m) => ({
    key: m.key,
    label: t(m.labelKey),
    desc: t(m.descKey),
    icon: m.icon,
  }));

  const go = React.useCallback(
    (k: ViewKey) => {
      onNavigate(k);
      onOpenChange(false);
    },
    [onNavigate, onOpenChange]
  );

  const quickActions = React.useMemo(
    () =>
      actions.map((a, i) => ({
        id: `act-${i}`,
        label: a.label,
        icon: a.icon ?? Zap,
        run: () => {
          a.run();
          onOpenChange(false);
        },
      })),
    [actions, onOpenChange]
  );

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput placeholder={t("command.placeholder")} />
      <CommandList>
        <CommandEmpty>{t("command.empty")}</CommandEmpty>

        <CommandGroup heading={t("command.navigate")}>
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <CommandItem
                key={item.key}
                value={`go to ${item.label} navigate`}
                onSelect={() => go(item.key)}
              >
                <Icon className="text-muted-foreground" />
                <span>{item.label}</span>
                <CommandShortcut>{item.num}</CommandShortcut>
              </CommandItem>
            );
          })}
        </CommandGroup>

        {/* Assistant features group */}
        <CommandSeparator />
        <CommandGroup heading={t("command.assistant")}>
          {assistantItems.map((item) => {
            const Icon = item.icon;
            return (
              <CommandItem
                key={item.key}
                value={`assistant ${item.label} ${item.desc} ai`}
                onSelect={() => go(item.key)}
              >
                <Icon className="text-primary" />
                <span>{item.label}</span>
                <span className="ml-2 truncate text-[10px] text-muted-foreground">
                  {item.desc}
                </span>
              </CommandItem>
            );
          })}
        </CommandGroup>

        {plugins.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading={t("command.plugins")}>
              {plugins.map((plugin) => {
                const Icon = resolvePluginIcon(plugin.icon);
                return (
                  <CommandItem
                    key={plugin.id}
                    value={`plugin ${plugin.name} ${plugin.description} ${plugin.category}`}
                    onSelect={() => go(plugin.id)}
                  >
                    <Icon className="text-muted-foreground" />
                    <span>{plugin.name}</span>
                    <span className="ml-2 truncate text-[10px] text-muted-foreground">
                      {plugin.description}
                    </span>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </>
        )}

        {quickActions.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading={t("command.quickActions")}>
              {quickActions.map((a) => {
                const Icon = a.icon;
                return (
                  <CommandItem key={a.id} value={a.label} onSelect={a.run}>
                    <Icon className="text-muted-foreground" />
                    <span>{a.label}</span>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </>
        )}

        <CommandSeparator />
        <CommandGroup heading={t("command.appearance")}>
          <CommandItem
            value="switch to light theme dark mode toggle"
            onSelect={() => {
              setTheme("light");
              onOpenChange(false);
            }}
          >
            <Sun className="text-muted-foreground" />
            <span>{t("command.lightTheme")}</span>
            {resolvedTheme === "light" && (
              <CornerDownLeft className="ml-auto h-3.5 w-3.5 text-primary" />
            )}
          </CommandItem>
          <CommandItem
            value="switch to dark theme light mode toggle"
            onSelect={() => {
              setTheme("dark");
              onOpenChange(false);
            }}
          >
            <Moon className="text-muted-foreground" />
            <span>{t("command.darkTheme")}</span>
            {resolvedTheme === "dark" && (
              <CornerDownLeft className="ml-auto h-3.5 w-3.5 text-primary" />
            )}
          </CommandItem>
        </CommandGroup>

        {/* Language switcher */}
        <CommandSeparator />
        <CommandGroup heading={t("command.switchLanguage")}>
          <CommandItem
            value="switch language english arabic translate i18n rtl ltr"
            onSelect={() => {
              setLocale("en");
              onOpenChange(false);
            }}
          >
            <Languages className="text-muted-foreground" />
            <span>{t("command.switchToEnglish")}</span>
            {locale === "en" && (
              <CornerDownLeft className="ml-auto h-3.5 w-3.5 text-primary" />
            )}
          </CommandItem>
          <CommandItem
            value="switch language arabic english translate i18n rtl ltr عربي"
            onSelect={() => {
              setLocale("ar");
              onOpenChange(false);
            }}
          >
            <Languages className="text-muted-foreground" />
            <span>{t("command.switchToArabic")}</span>
            {locale === "ar" && (
              <CornerDownLeft className="ml-auto h-3.5 w-3.5 text-primary" />
            )}
          </CommandItem>
        </CommandGroup>

        {onOpenAbout && (
          <>
            <CommandSeparator />
            <CommandGroup heading={t("command.about")}>
              <CommandItem
                value={`about devforge ai author ${APP_AUTHOR} jad jbara version license contact`}
                onSelect={() => {
                  onOpenAbout();
                  onOpenChange(false);
                }}
              >
                <Info className="text-muted-foreground" />
                <span>{t("command.aboutLine", { author: APP_AUTHOR })}</span>
              </CommandItem>
            </CommandGroup>
          </>
        )}

        <CommandSeparator />
        <div className="flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground">
          <Search className="h-3.5 w-3.5" />
          <span>
            {t("command.footerHint", { kbd: "⌘K" })}
          </span>
        </div>
      </CommandList>
    </CommandDialog>
  );
}

/** Hook: manages palette open state + Cmd+K + number-key navigation. */
export function useCommandPalette(
  onNavigate: (k: ViewKey) => void,
  actions?: CommandPaletteProps["actions"],
  onOpenAbout?: () => void
) {
  const [open, setOpen] = React.useState(false);
  useHotkey(["mod", "k"], () => setOpen((v) => !v));

  // Number-key navigation (1-8) — only when not typing in a field.
  // Number keys map to the 8 built-in Workspace features only.
  React.useEffect(() => {
    const onDown = (e: KeyboardEvent) => {
      if (open) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if ((e.target as HTMLElement)?.isContentEditable) return;
      const n = parseInt(e.key, 10);
      if (n >= 1 && n <= 8) {
        e.preventDefault();
        onNavigate(NAV_META[n - 1].key);
      }
    };
    window.addEventListener("keydown", onDown);
    return () => window.removeEventListener("keydown", onDown);
  }, [open, onNavigate]);

  const openPalette = React.useCallback(() => setOpen(true), []);

  return {
    open,
    setOpen,
    openPalette,
    palette: (
      <CommandPalette
        open={open}
        onOpenChange={setOpen}
        onNavigate={onNavigate}
        actions={actions}
        onOpenAbout={onOpenAbout}
      />
    ),
  };
}
