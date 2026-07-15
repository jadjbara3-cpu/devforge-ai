"use client";

import * as React from "react";
import { Sidebar, MobileNav } from "@/components/layout/sidebar";
import { Overview } from "@/components/features/overview";
import { ChatPanel } from "@/components/features/chat-panel";
import { ImageStudio } from "@/components/features/image-studio";
import { VisionLab } from "@/components/features/vision-lab";
import { VoiceLab } from "@/components/features/voice-lab";
import { WebIntel } from "@/components/features/web-intel";
import { SnippetVault } from "@/components/features/snippet-vault";
import { TaskBoard } from "@/components/features/task-board";
import { SiteFooter } from "@/components/layout/footer";
import { useCommandPalette } from "@/components/layout/command-palette";
import { ShortcutsHelp } from "@/components/layout/shortcuts-help";
import { SettingsDialog } from "@/components/layout/settings";
import { AboutDialog } from "@/components/layout/about-dialog";
import { useHotkey } from "@/hooks/use-hotkey";
import { isFeatureKey, type ViewKey } from "@/lib/features";
import { getPlugin } from "@/lib/plugin-registry";

export default function Home() {
  // `active` is either a built-in feature key OR a plugin id.
  const [active, setActive] = React.useState<ViewKey>("overview");
  const [shortcutsOpen, setShortcutsOpen] = React.useState(false);
  const [settingsOpen, setSettingsOpen] = React.useState(false);
  const [aboutOpen, setAboutOpen] = React.useState(false);

  const select = React.useCallback((k: ViewKey) => setActive(k), []);

  const { palette, openPalette } = useCommandPalette(
    select,
    undefined,
    () => setAboutOpen(true)
  );

  // Ctrl+, opens Settings
  useHotkey(["ctrl", ","], () => setSettingsOpen(true));

  // Resolve the active plugin (if any) — null when `active` is a built-in.
  const activePlugin = isFeatureKey(active) ? null : getPlugin(active);

  return (
    <div className="relative flex min-h-screen flex-col bg-background">
      {/* ambient background */}
      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute -left-40 -top-40 h-[28rem] w-[28rem] rounded-full bg-primary/10 blur-3xl aurora-blob" />
        <div
          className="absolute -right-40 top-1/3 h-[24rem] w-[24rem] rounded-full bg-chart-2/10 blur-3xl aurora-blob"
          style={{ animationDelay: "3s" }}
        />
        <div
          className="absolute bottom-0 left-1/3 h-[22rem] w-[22rem] rounded-full bg-chart-4/10 blur-3xl aurora-blob"
          style={{ animationDelay: "6s" }}
        />
      </div>

      {palette}
      <ShortcutsHelp open={shortcutsOpen} onOpenChange={setShortcutsOpen} />
      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
      <AboutDialog open={aboutOpen} onOpenChange={setAboutOpen} />

      <MobileNav active={active} onSelect={select} />

      <div className="flex flex-1">
        <Sidebar
          active={active}
          onSelect={select}
          onOpenSearch={openPalette}
          onOpenShortcuts={() => setShortcutsOpen(true)}
          onOpenSettings={() => setSettingsOpen(true)}
          onOpenAbout={() => setAboutOpen(true)}
        />
        <main className="flex min-w-0 flex-1 flex-col">
          <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col px-4 py-6 md:px-8 md:py-8">
            {/* Built-in features */}
            {active === "overview" && <Overview onNavigate={select} />}
            {active === "chat" && <ChatPanel />}
            {active === "image" && <ImageStudio />}
            {active === "vision" && <VisionLab />}
            {active === "voice" && <VoiceLab />}
            {active === "web" && <WebIntel />}
            {active === "snippets" && <SnippetVault />}
            {active === "board" && <TaskBoard />}

            {/* Plugin view — renders the plugin's lazy component, if any. */}
            {activePlugin && <PluginView plugin={activePlugin} />}
          </div>
          <SiteFooter />
        </main>
      </div>
    </div>
  );
}

/**
 * Renders a plugin's component. The `component` field on the plugin is a
 * `next/dynamic`-wrapped Client Component, so it auto-suspends and shows the
 * loading skeleton while its chunk is being fetched.
 */
function PluginView({
  plugin,
}: {
  plugin: NonNullable<ReturnType<typeof getPlugin>>;
}) {
  const Component = plugin.component;
  return (
    <div className="flex flex-1 flex-col">
      <Component />
    </div>
  );
}
