"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
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
  Github,
  Zap,
} from "lucide-react";
import type { FeatureKey } from "@/lib/features";

const navItems: {
  key: FeatureKey;
  label: string;
  icon: React.ElementType;
  desc: string;
}[] = [
  { key: "overview", label: "Overview", icon: Sparkles, desc: "Dashboard home" },
  { key: "chat", label: "AI Chat", icon: Bot, desc: "LLM conversation" },
  { key: "image", label: "Image Studio", icon: ImageIcon, desc: "AI image generation" },
  { key: "vision", label: "Vision Lab", icon: Eye, desc: "Image understanding" },
  { key: "voice", label: "Voice Lab", icon: AudioLines, desc: "TTS & ASR" },
  { key: "web", label: "Web Intel", icon: Globe, desc: "Search & reader" },
  { key: "snippets", label: "Snippets", icon: Code2, desc: "Code vault" },
  { key: "board", label: "Task Board", icon: KanbanSquare, desc: "Real-time board" },
];

export function Sidebar({
  active,
  onSelect,
}: {
  active: FeatureKey;
  onSelect: (k: FeatureKey) => void;
}) {
  return (
    <aside className="hidden md:flex md:w-[248px] md:flex-col md:shrink-0 border-r bg-sidebar/60 glass">
      <div className="flex h-16 items-center gap-2.5 px-5 border-b">
        <div className="relative flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-lg shadow-primary/30">
          <Zap className="h-5 w-5" />
        </div>
        <div className="flex flex-col leading-tight">
          <span className="text-sm font-bold tracking-tight">DevForge</span>
          <span className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            AI Hub
          </span>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto scrollbar-thin px-3 py-4">
        <p className="px-2 pb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Workspace
        </p>
        <TooltipProvider delayDuration={200}>
          <ul className="space-y-1">
            {navItems.map((item) => {
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
                        {isActive && (
                          <span className="h-1.5 w-1.5 rounded-full bg-primary" />
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
      </nav>

      <div className="border-t p-3">
        <div className="flex items-center justify-between rounded-lg bg-muted/40 px-3 py-2">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/15 text-primary text-xs font-bold">
              Z
            </div>
            <div className="flex flex-col leading-tight">
              <span className="text-xs font-semibold">Z.ai Engine</span>
              <span className="text-[10px] text-muted-foreground">online</span>
            </div>
          </div>
          <ThemeToggle />
        </div>
        <Button
          asChild
          variant="ghost"
          size="sm"
          className="mt-2 w-full justify-start text-xs text-muted-foreground"
        >
          <Link href="#" onClick={(e) => e.preventDefault()}>
            <Github className="mr-2 h-3.5 w-3.5" /> v1.0 · Built with Next.js 16
          </Link>
        </Button>
      </div>
    </aside>
  );
}

export function MobileNav({
  active,
  onSelect,
}: {
  active: FeatureKey;
  onSelect: (k: FeatureKey) => void;
}) {
  return (
    <div className="md:hidden sticky top-0 z-40 glass border-b">
      <div className="flex h-14 items-center gap-2 px-3">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <Zap className="h-4 w-4" />
        </div>
        <span className="text-sm font-bold">DevForge AI</span>
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
      </div>
    </div>
  );
}
