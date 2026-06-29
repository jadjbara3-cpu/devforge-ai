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
} from "lucide-react";
import type { FeatureKey } from "@/lib/features";
import { useHotkey } from "@/hooks/use-hotkey";
import { useTheme } from "next-themes";

const NAV_ITEMS: {
  key: FeatureKey;
  label: string;
  icon: React.ElementType;
  num: number;
}[] = [
  { key: "overview", label: "Overview", icon: Sparkles, num: 1 },
  { key: "chat", label: "AI Chat", icon: Bot, num: 2 },
  { key: "image", label: "Image Studio", icon: ImageIcon, num: 3 },
  { key: "vision", label: "Vision Lab", icon: Eye, num: 4 },
  { key: "voice", label: "Voice Lab", icon: AudioLines, num: 5 },
  { key: "web", label: "Web Intelligence", icon: Globe, num: 6 },
  { key: "snippets", label: "Snippet Vault", icon: Code2, num: 7 },
  { key: "board", label: "Task Board", icon: KanbanSquare, num: 8 },
];

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onNavigate: (k: FeatureKey) => void;
  actions?: { label: string; run: () => void; icon?: React.ElementType }[];
}

export function CommandPalette({
  open,
  onOpenChange,
  onNavigate,
  actions = [],
}: CommandPaletteProps) {
  const { resolvedTheme, setTheme } = useTheme();

  const go = React.useCallback(
    (k: FeatureKey) => {
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
      <CommandInput placeholder="Type a command or search…" />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>

        <CommandGroup heading="Navigate">
          {NAV_ITEMS.map((item) => {
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

        {quickActions.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Quick Actions">
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
        <CommandGroup heading="Appearance">
          <CommandItem
            value="switch to light theme dark mode toggle"
            onSelect={() => {
              setTheme("light");
              onOpenChange(false);
            }}
          >
            <Sun className="text-muted-foreground" />
            <span>Light theme</span>
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
            <span>Dark theme</span>
            {resolvedTheme === "dark" && (
              <CornerDownLeft className="ml-auto h-3.5 w-3.5 text-primary" />
            )}
          </CommandItem>
        </CommandGroup>

        <CommandSeparator />
        <div className="flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground">
          <Search className="h-3.5 w-3.5" />
          <span>
            Press{" "}
            <kbd className="rounded border bg-muted px-1 font-mono text-[10px]">
              ⌘K
            </kbd>{" "}
            to open ·{" "}
            <kbd className="rounded border bg-muted px-1 font-mono text-[10px]">
              1–8
            </kbd>{" "}
            to jump
          </span>
        </div>
      </CommandList>
    </CommandDialog>
  );
}

/** Hook: manages palette open state + Cmd+K + number-key navigation. */
export function useCommandPalette(
  onNavigate: (k: FeatureKey) => void,
  actions?: CommandPaletteProps["actions"]
) {
  const [open, setOpen] = React.useState(false);
  useHotkey(["mod", "k"], () => setOpen((v) => !v));

  // Number-key navigation (1-8) — only when not typing in a field
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
        onNavigate(NAV_ITEMS[n - 1].key);
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
      />
    ),
  };
}
