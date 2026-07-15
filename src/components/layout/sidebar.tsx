"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { APP_AUTHOR, APP_VERSION, getMailtoLink } from "@/lib/branding";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Sparkles,
  Bot,
  Image as ImageIcon,
  Eye,
  AudioLines,
  Globe,
  Code2,
  KanbanSquare,
  Info,
  Mail,
  Zap,
  Search,
  Command,
  Keyboard,
  Settings,
  Puzzle,
} from "lucide-react";
import type { FeatureKey, ViewKey } from "@/lib/features";
import { useLanguage } from "@/components/language-provider";
import {
  useSidebarPlugins,
  resolvePluginIcon,
} from "@/lib/plugin-registry";

// Map each feature key to its icon and the translation-key prefix used in
// `messages/{locale}.json` under `sidebar.*` and `sidebar.desc.*`.
const NAV_META: {
  key: FeatureKey;
  labelKey: string;
  descKey: string;
  icon: React.ElementType;
}[] = [
  { key: "overview", labelKey: "sidebar.overview", descKey: "sidebar.desc.overview", icon: Sparkles },
  { key: "chat", labelKey: "sidebar.chat", descKey: "sidebar.desc.chat", icon: Bot },
  { key: "image", labelKey: "sidebar.images", descKey: "sidebar.desc.images", icon: ImageIcon },
  { key: "vision", labelKey: "sidebar.vision", descKey: "sidebar.desc.vision", icon: Eye },
  { key: "voice", labelKey: "sidebar.voice", descKey: "sidebar.desc.voice", icon: AudioLines },
  { key: "web", labelKey: "sidebar.web", descKey: "sidebar.desc.web", icon: Globe },
  { key: "snippets", labelKey: "sidebar.snippets", descKey: "sidebar.desc.snippets", icon: Code2 },
  { key: "board", labelKey: "sidebar.tasks", descKey: "sidebar.desc.tasks", icon: KanbanSquare },
];

export function Sidebar({
  active,
  onSelect,
  onOpenSearch,
  onOpenShortcuts,
  onOpenSettings,
  onOpenAbout,
}: {
  active: ViewKey;
  onSelect: (k: ViewKey) => void;
  onOpenSearch?: () => void;
  onOpenShortcuts?: () => void;
  onOpenSettings?: () => void;
  onOpenAbout?: () => void;
}) {
  const { t } = useLanguage();
  // Resolve the localized nav items on each render so a language switch
  // is reflected immediately.
  const navItems = NAV_META.map((m) => ({
    key: m.key,
    label: t(m.labelKey),
    desc: t(m.descKey),
    icon: m.icon,
  }));

  // Live list of enabled plugins (sidebar-positioned).
  const plugins = useSidebarPlugins();

  return (
    <aside className="hidden md:flex md:w-[248px] md:flex-col md:shrink-0 border-r bg-sidebar/60 glass">
      <div className="flex h-16 items-center gap-2.5 px-5 border-b">
        <div className="relative flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-lg shadow-primary/30">
          <Zap className="h-5 w-5" />
        </div>
        <div className="flex flex-col leading-tight">
          <span className="text-sm font-bold tracking-tight">DevForge</span>
          <span className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            {t("sidebar.brandTag")}
          </span>
        </div>
      </div>

      {/* Search trigger */}
      <div className="px-3 pt-3">
        <button
          onClick={onOpenSearch}
          className="group flex w-full items-center gap-2 rounded-lg border bg-background/50 px-3 py-2 text-sm text-muted-foreground transition-colors hover:border-primary/40 hover:bg-accent hover:text-foreground"
        >
          <Search className="h-3.5 w-3.5" />
          <span className="flex-1 text-left">{t("common.searchPlaceholder")}</span>
          <kbd className="flex items-center gap-0.5 rounded border bg-muted px-1 py-0.5 font-mono text-[9px] font-medium text-muted-foreground">
            <Command className="h-2.5 w-2.5" />K
          </kbd>
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto scrollbar-thin px-3 py-3">
        <p className="px-2 pb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          {t("sidebar.workspace")}
        </p>
        <TooltipProvider delayDuration={200}>
          <ul className="space-y-1">
            {navItems.map((item, idx) => {
              const isActive = active === item.key;
              const Icon = item.icon;
              return (
                <li key={item.key}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        onClick={() => onSelect(item.key)}
                        className={cn(
                          "group relative flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all",
                          isActive
                            ? "bg-primary/10 text-primary"
                            : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                        )}
                      >
                        {isActive && (
                          <span className="absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-primary" />
                        )}
                        <Icon
                          className={cn(
                            "h-4 w-4 shrink-0 transition-transform group-hover:scale-110",
                            isActive && "text-primary"
                          )}
                        />
                        <span className="flex-1 text-left">{item.label}</span>
                        {isActive ? (
                          <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                        ) : (
                          <span className="text-[10px] font-medium tabular-nums text-muted-foreground/50 opacity-0 transition-opacity group-hover:opacity-100">
                            {idx + 1}
                          </span>
                        )}
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="right" className="text-xs">
                      {item.desc}
                    </TooltipContent>
                  </Tooltip>
                </li>
              );
            })}
          </ul>
        </TooltipProvider>

        {/* Plugins section */}
        {plugins.length > 0 && (
          <>
            <p className="mt-4 flex items-center gap-1.5 px-2 pb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              <Puzzle className="h-3 w-3" />
              {t("sidebar.plugins")}
            </p>
            <TooltipProvider delayDuration={200}>
              <ul className="space-y-1">
                {plugins.map((plugin) => {
                  const isActive = active === plugin.id;
                  const Icon = resolvePluginIcon(plugin.icon);
                  return (
                    <li key={plugin.id}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            onClick={() => onSelect(plugin.id)}
                            className={cn(
                              "group relative flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all",
                              isActive
                                ? "bg-primary/10 text-primary"
                                : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                            )}
                          >
                            {isActive && (
                              <span className="absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-primary" />
                            )}
                            <Icon
                              className={cn(
                                "h-4 w-4 shrink-0 transition-transform group-hover:scale-110",
                                isActive && "text-primary"
                              )}
                            />
                            <span className="flex-1 text-left">{plugin.name}</span>
                            {isActive && (
                              <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                            )}
                          </button>
                        </TooltipTrigger>
                        <TooltipContent side="right" className="text-xs">
                          {plugin.description}
                        </TooltipContent>
                      </Tooltip>
                    </li>
                  );
                })}
              </ul>
            </TooltipProvider>
          </>
        )}
      </nav>

      <div className="border-t p-3">
        <div className="flex items-center justify-between rounded-lg bg-muted/40 px-3 py-2">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/15 text-primary text-xs font-bold">
              Z
            </div>
            <div className="flex flex-col leading-tight">
              <span className="text-xs font-semibold">Z.ai Engine</span>
              <span className="text-[10px] text-muted-foreground">{t("common.online")}</span>
            </div>
          </div>
          <ThemeToggle />
        </div>
        <a
          href={getMailtoLink("DevForge AI — Hello")}
          className="mt-2 flex items-center justify-center gap-1.5 rounded-md border bg-background/40 px-3 py-1.5 text-[11px] text-muted-foreground transition-colors hover:border-primary/40 hover:bg-accent hover:text-foreground"
          title={`Contact ${APP_AUTHOR}`}
        >
          <Mail className="h-3 w-3 text-primary/70" />
          <span>
            {t("common.by")}{" "}
            <span className="font-medium text-foreground/90">{t("common.author")}</span>
          </span>
        </a>
        <div className="mt-2 flex items-center gap-2">
          {onOpenShortcuts && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onOpenShortcuts}
              className="flex-1 justify-start text-xs text-muted-foreground"
            >
              <Keyboard className="mr-1.5 h-3.5 w-3.5" />
              {t("common.shortcuts")}
              <kbd className="ml-auto rounded border bg-muted px-1 py-0.5 font-mono text-[9px]">
                ?
              </kbd>
            </Button>
          )}
          {onOpenSettings && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onOpenSettings}
              className="shrink-0 text-xs text-muted-foreground"
              aria-label={t("common.settings")}
            >
              <Settings className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
        {onOpenAbout && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onOpenAbout}
            className="mt-1 w-full justify-start text-xs text-muted-foreground"
          >
            <Info className="mr-2 h-3.5 w-3.5" /> {t("common.about")} · v{APP_VERSION}
          </Button>
        )}
      </div>
    </aside>
  );
}

export function MobileNav({
  active,
  onSelect,
}: {
  active: ViewKey;
  onSelect: (k: ViewKey) => void;
}) {
  const { t } = useLanguage();
  const navItems = NAV_META.map((m) => ({
    key: m.key,
    label: t(m.labelKey),
    icon: m.icon,
  }));
  const plugins = useSidebarPlugins();

  return (
    <div className="md:hidden sticky top-0 z-40 glass border-b">
      <div className="flex h-14 items-center gap-2 px-3">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <Zap className="h-4 w-4" />
        </div>
        <span className="text-sm font-bold">{t("common.appName")}</span>
        <div className="ml-auto">
          <ThemeToggle />
        </div>
      </div>
      <div className="flex gap-1 overflow-x-auto scrollbar-thin px-2 pb-2">
        {navItems.map((item) => {
          const isActive = active === item.key;
          const Icon = item.icon;
          return (
            <button
              key={item.key}
              onClick={() => onSelect(item.key)}
              className={cn(
                "flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
                isActive
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground"
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {item.label}
            </button>
          );
        })}
        {plugins.map((plugin) => {
          const isActive = active === plugin.id;
          const Icon = resolvePluginIcon(plugin.icon);
          return (
            <button
              key={plugin.id}
              onClick={() => onSelect(plugin.id)}
              className={cn(
                "flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
                isActive
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground"
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {plugin.name}
            </button>
          );
        })}
      </div>
    </div>
  );
}
