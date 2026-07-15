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
import { ClipboardManager } from "@/components/features/clipboard-manager";
import { WorkflowStudio } from "@/components/features/workflow-studio";
import { ProactiveAssistant } from "@/components/features/proactive-assistant";
import { MultiScreenDashboard } from "@/components/features/multi-screen-dashboard";
import { ComputerUse } from "@/components/features/computer-use";
import { MemoryManager } from "@/components/features/memory-manager";
import { QuickActions } from "@/components/features/quick-actions";
import { SiteFooter } from "@/components/layout/footer";
import { useCommandPalette } from "@/components/layout/command-palette";
import { ShortcutsHelp } from "@/components/layout/shortcuts-help";
import { SettingsDialog } from "@/components/layout/settings";
import { AboutDialog } from "@/components/layout/about-dialog";
import { useHotkey } from "@/hooks/use-hotkey";
import { useQuickActions } from "@/hooks/use-quick-actions";
import { isFeatureKey, isAssistantKey, type ViewKey } from "@/lib/features";
import { getPlugin } from "@/lib/plugin-registry";

export default function Home() {
  // `active` is either a built-in feature key (Workspace or Assistant) OR a plugin id.
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

  // Global Quick Actions overlay — Ctrl+Space toggles it.
  const { open: quickActionsOpen, setOpen: setQuickActionsOpen } =
    useQuickActions(["ctrl", " "]);

  // Resolve the active plugin (if any) — null when `active` is a built-in.
  const activePlugin = isFeatureKey(active) || isAssistantKey(active) ? null : getPlugin(active);

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

      {/* Global Quick Actions overlay (Ctrl+Space) — floats above all features. */}
      <QuickActions open={quickActionsOpen} onOpenChange={setQuickActionsOpen} />

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
            {/* Built-in Workspace features */}
            {active === "overview" && <Overview onNavigate={select} />}
            {active === "chat" && <ChatPanel />}
            {active === "image" && <ImageStudio />}
            {active === "vision" && <VisionLab />}
            {active === "voice" && <VoiceLab />}
            {active === "web" && <WebIntel />}
            {active === "snippets" && <SnippetVault />}
            {active === "board" && <TaskBoard />}

            {/* Assistant features (Task 1-C + Computer Use + AI Memory) */}
            {active === "clipboard" && <ClipboardManager />}
            {active === "quickactions" && (
              <QuickActionsInfo
                onOpenOverlay={() => setQuickActionsOpen(true)}
              />
            )}
            {active === "workflow" && <WorkflowStudio />}
            {active === "proactive" && <ProactiveAssistant />}
            {active === "screens" && <MultiScreenDashboard />}
            {active === "computer" && <ComputerUse />}
            {active === "memory" && <MemoryManager />}

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
 * The Quick Actions panel itself is a global overlay (mounted once at the app
 * root, toggled by Ctrl+Space). When the user navigates to the "Quick Actions"
 * sidebar entry, we show this informational card explaining the feature and
 * offering a button to open the overlay.
 */
function QuickActionsInfo({ onOpenOverlay }: { onOpenOverlay: () => void }) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">
          Quick Actions
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          A Raycast-style command overlay. Press <kbd className="rounded border bg-muted px-1.5 py-0.5 font-mono text-[10px]">Ctrl</kbd>
          +<kbd className="rounded border bg-muted px-1.5 py-0.5 font-mono text-[10px]">Space</kbd> anywhere in DevForge to summon it.
        </p>
      </div>

      <div className="rounded-2xl border bg-card/50 glass p-8 text-center">
        <p className="text-sm text-muted-foreground">
          The overlay floats above everything. Type a command:
        </p>
        <ul className="mx-auto mt-4 inline-block space-y-1 text-left text-xs font-mono">
          <li><span className="text-primary">search</span> &lt;query&gt; — web search</li>
          <li><span className="text-primary">chat</span> &lt;message&gt; — quick AI chat</li>
          <li><span className="text-primary">translate</span> &lt;text&gt; — translate to English</li>
          <li><span className="text-primary">translate to</span> ar &lt;text&gt; — target language</li>
          <li><span className="text-primary">code</span> &lt;description&gt; — generate code</li>
          <li><span className="text-primary">calc</span> &lt;expr&gt; — calculator</li>
          <li><span className="text-primary">color</span> &lt;hex&gt; — color preview</li>
          <li><span className="text-primary">open</span> &lt;app&gt; — launch Windows app</li>
          <li className="text-muted-foreground">or just type anything → AI auto-detects</li>
        </ul>
        <div className="mt-6">
          <button
            onClick={onOpenOverlay}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
          >
            Open Quick Actions
          </button>
        </div>
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
