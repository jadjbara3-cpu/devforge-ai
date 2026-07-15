"use client";

import * as React from "react";
import { motion } from "framer-motion";
import {
  Sparkles,
  Bot,
  Image as ImageIcon,
  Eye,
  AudioLines,
  Globe,
  Code2,
  KanbanSquare,
  ArrowRight,
  Cpu,
  Database,
  Radio,
  Zap,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ActivityFeed } from "@/components/features/activity-feed";
import { APP_AUTHOR, getMailtoLink } from "@/lib/branding";
import type { FeatureKey } from "@/lib/features";
import { useLanguage } from "@/components/language-provider";

const cards: {
  key: FeatureKey;
  title: string;
  desc: string;
  icon: React.ElementType;
  accent: string;
  skills: string[];
}[] = [
  {
    key: "chat",
    title: "AI Chat",
    desc: "Multi-turn conversations powered by the Z.ai LLM, with persistent session history.",
    icon: Bot,
    accent: "from-emerald-500/20 to-emerald-500/5 text-emerald-500",
    skills: ["LLM", "Streaming"],
  },
  {
    key: "image",
    title: "Image Studio",
    desc: "Generate high-quality images from text prompts across 7 aspect ratios, saved to a gallery.",
    icon: ImageIcon,
    accent: "from-fuchsia-500/20 to-fuchsia-500/5 text-fuchsia-500",
    skills: ["Image Gen"],
  },
  {
    key: "vision",
    title: "Vision Lab",
    desc: "Upload images and ask the VLM to describe, analyze, compare, or extract text from them.",
    icon: Eye,
    accent: "from-amber-500/20 to-amber-500/5 text-amber-500",
    skills: ["VLM"],
  },
  {
    key: "voice",
    title: "Voice Lab",
    desc: "Synthesize natural speech (TTS) with 7 voices & variable speed, and transcribe audio (ASR).",
    icon: AudioLines,
    accent: "from-sky-500/20 to-sky-500/5 text-sky-500",
    skills: ["TTS", "ASR"],
  },
  {
    key: "web",
    title: "Web Intelligence",
    desc: "Search the live web and extract clean article content from any URL — all in one panel.",
    icon: Globe,
    accent: "from-violet-500/20 to-violet-500/5 text-violet-500",
    skills: ["Search", "Reader"],
  },
  {
    key: "snippets",
    title: "Snippet Vault",
    desc: "A personal code library with search, syntax highlighting, favorites & tagging — backed by SQLite.",
    icon: Code2,
    accent: "from-rose-500/20 to-rose-500/5 text-rose-500",
    skills: ["CRUD", "Prisma"],
  },
  {
    key: "board",
    title: "Task Board",
    desc: "A real-time collaborative Kanban board powered by Socket.io — changes sync instantly across clients.",
    icon: KanbanSquare,
    accent: "from-teal-500/20 to-teal-500/5 text-teal-500",
    skills: ["WebSocket"],
  },
];

const stack = [
  { label: "Next.js 16", icon: Zap },
  { label: "TypeScript 5", icon: Cpu },
  { label: "Prisma + SQLite", icon: Database },
  { label: "Socket.io", icon: Radio },
];

export function Overview({
  onNavigate,
}: {
  onNavigate: (k: FeatureKey) => void;
}) {
  const { t } = useLanguage();

  // Hero title template is e.g. "The all-in-one {accent} workspace." — we
  // split on the {accent} placeholder so the gradient span wraps just that
  // part of the sentence.
  const heroTemplate = t("overview.heroTitle");
  const heroAccent = t("overview.heroAccent");
  const [heroBefore, heroAfter] = heroTemplate.split("{accent}");

  return (
    <div className="space-y-8">
      {/* Hero */}
      <motion.section
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="relative overflow-hidden rounded-2xl border bg-card/50 glass p-8 md:p-10"
      >
        <div className="absolute inset-0 -z-10 bg-grid opacity-40" />
        <div className="absolute right-0 top-0 -z-10 h-full w-1/2 bg-gradient-to-l from-primary/10 to-transparent" />
        <Badge variant="secondary" className="mb-4 gap-1.5">
          <Sparkles className="h-3 w-3 text-primary" />
          {t("overview.badge")}
        </Badge>
        <h1 className="max-w-3xl text-3xl font-bold leading-tight tracking-tight md:text-5xl">
          {heroBefore}
          <span className="gradient-text">{heroAccent}</span>
          {heroAfter}
        </h1>
        <p className="mt-4 max-w-2xl text-sm text-muted-foreground md:text-base">
          {t("overview.heroBody")}
        </p>
        <p className="mt-1.5 text-xs text-muted-foreground/80">
          {t("common.by")}{" "}
          <a
            href={getMailtoLink("DevForge AI — Hello")}
            className="font-medium text-foreground/80 underline-offset-2 transition-colors hover:text-primary hover:underline"
            title={`Email ${APP_AUTHOR}`}
          >
            {t("common.author")}
          </a>
        </p>
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <Button onClick={() => onNavigate("chat")} size="lg" className="gap-2">
            <Bot className="h-4 w-4" /> {t("overview.ctaChat")}
          </Button>
          <Button
            onClick={() => onNavigate("image")}
            size="lg"
            variant="outline"
            className="gap-2"
          >
            <ImageIcon className="h-4 w-4" /> {t("overview.ctaImage")}
          </Button>
        </div>

        <div className="mt-8 flex flex-wrap gap-2">
          {stack.map((s) => {
            const Icon = s.icon;
            return (
              <span
                key={s.label}
                className="inline-flex items-center gap-1.5 rounded-full border bg-background/60 px-3 py-1 text-xs font-medium text-muted-foreground"
              >
                <Icon className="h-3 w-3 text-primary" />
                {s.label}
              </span>
            );
          })}
        </div>
      </motion.section>

      {/* Feature grid */}
      <section>
        <div className="mb-4 flex items-end justify-between">
          <div>
            <h2 className="text-xl font-semibold tracking-tight">
              {t("overview.modulesTitle")}
            </h2>
            <p className="text-sm text-muted-foreground">
              {t("overview.modulesSubtitle")}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {cards.map((c, i) => {
            const Icon = c.icon;
            return (
              <motion.button
                key={c.key}
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.35, delay: i * 0.05 }}
                whileHover={{ y: -4 }}
                onClick={() => onNavigate(c.key)}
                className="group text-left"
              >
                <Card className="relative h-full overflow-hidden p-5 transition-all hover:border-primary/40 hover:shadow-lg hover:shadow-primary/5">
                  <div
                    className={`mb-4 inline-flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br ${c.accent}`}
                  >
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-semibold tracking-tight">{c.title}</h3>
                    <ArrowRight className="h-4 w-4 -translate-x-1 text-muted-foreground opacity-0 transition-all group-hover:translate-x-0 group-hover:opacity-100" />
                  </div>
                  <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                    {c.desc}
                  </p>
                  <div className="mt-4 flex flex-wrap gap-1.5">
                    {c.skills.map((s) => (
                      <Badge key={s} variant="outline" className="text-[10px] font-medium">
                        {s}
                      </Badge>
                    ))}
                  </div>
                </Card>
              </motion.button>
            );
          })}
        </div>
      </section>

      {/* Live activity feed */}
      <ActivityFeed onNavigate={onNavigate} />

      {/* Stats strip */}
      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          { k: "8", v: t("overview.statsSkills") },
          { k: "7", v: t("overview.statsVoices") },
          { k: "∞", v: t("overview.statsTurns") },
          { k: "RT", v: t("overview.statsSync") },
        ].map((s) => (
          <Card key={s.v} className="p-4 text-center">
            <div className="text-2xl font-bold gradient-text">{s.k}</div>
            <div className="text-xs text-muted-foreground">{s.v}</div>
          </Card>
        ))}
      </section>
    </div>
  );
}
