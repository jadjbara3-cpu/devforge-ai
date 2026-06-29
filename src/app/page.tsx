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
import type { FeatureKey } from "@/lib/features";

export default function Home() {
  const [active, setActive] = React.useState<FeatureKey>("overview");

  const select = React.useCallback((k: FeatureKey) => setActive(k), []);

  const { palette, openPalette } = useCommandPalette(select);
  const [shortcutsOpen, setShortcutsOpen] = React.useState(false);
  const [settingsOpen, setSettingsOpen] = React.useState(false);

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

      <MobileNav active={active} onSelect={select} />

      <div className="flex flex-1">
        <Sidebar
          active={active}
          onSelect={select}
          onOpenSearch={openPalette}
          onOpenShortcuts={() => setShortcutsOpen(true)}
          onOpenSettings={() => setSettingsOpen(true)}
        />
        <main className="flex min-w-0 flex-1 flex-col">
          <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col px-4 py-6 md:px-8 md:py-8">
            {active === "overview" && <Overview onNavigate={select} />}
            {active === "chat" && <ChatPanel />}
            {active === "image" && <ImageStudio />}
            {active === "vision" && <VisionLab />}
            {active === "voice" && <VoiceLab />}
            {active === "web" && <WebIntel />}
            {active === "snippets" && <SnippetVault />}
            {active === "board" && <TaskBoard />}
          </div>
          <SiteFooter />
        </main>
      </div>
    </div>
  );
}
