"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { Bot, User, Code2, Image as ImageIcon, Clock, Activity } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import type { FeatureKey } from "@/lib/features";

interface ActivityItem {
  id: string;
  type: "chat" | "snippet" | "image";
  title: string;
  detail: string;
  href: FeatureKey;
  createdAt: string;
  icon: string;
  url?: string;
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}

const ICON_MAP: Record<string, { icon: React.ElementType; color: string }> = {
  user: { icon: User, color: "text-emerald-500 bg-emerald-500/10" },
  bot: { icon: Bot, color: "text-sky-500 bg-sky-500/10" },
  code: { icon: Code2, color: "text-rose-500 bg-rose-500/10" },
  image: { icon: ImageIcon, color: "text-fuchsia-500 bg-fuchsia-500/10" },
};

export function ActivityFeed({
  onNavigate,
}: {
  onNavigate: (k: FeatureKey) => void;
}) {
  const [items, setItems] = React.useState<ActivityItem[]>([]);
  const [loading, setLoading] = React.useState(true);

  const load = React.useCallback(async () => {
    try {
      const res = await fetch("/api/activity", { cache: "no-store" });
      const data = (await res.json()) as { items?: ActivityItem[] };
      setItems(data.items ?? []);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  return (
    <section>
      <div className="mb-4 flex items-end justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
            <Activity className="h-5 w-5 text-primary" />
            Recent Activity
          </h2>
          <p className="text-sm text-muted-foreground">
            Live feed of your latest actions across modules.
          </p>
        </div>
        <Badge variant="outline" className="gap-1.5">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
          {items.length} events
        </Badge>
      </div>

      <Card className="overflow-hidden">
        {loading ? (
          <div className="divide-y">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 p-4">
                <Skeleton className="h-9 w-9 rounded-full" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-3.5 w-1/3" />
                  <Skeleton className="h-3 w-2/3" />
                </div>
                <Skeleton className="h-3 w-12" />
              </div>
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 p-10 text-center">
            <Activity className="h-8 w-8 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">
              No activity yet. Start a chat or generate an image!
            </p>
          </div>
        ) : (
          <div className="divide-y">
            {items.map((item, idx) => {
              const meta = ICON_MAP[item.icon] ?? ICON_MAP.bot;
              const Icon = meta.icon;
              return (
                <motion.button
                  key={item.id}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: idx * 0.03 }}
                  onClick={() => onNavigate(item.href)}
                  className="group flex w-full items-center gap-3 p-4 text-left transition-colors hover:bg-accent/50"
                >
                  {item.url ? (
                    <img
                      src={item.url}
                      alt=""
                      className="h-10 w-10 shrink-0 rounded-lg object-cover ring-1 ring-border"
                    />
                  ) : (
                    <div
                      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${meta.color}`}
                    >
                      <Icon className="h-4 w-4" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{item.title}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {item.detail}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1 text-[10px] text-muted-foreground">
                    <Clock className="h-3 w-3" />
                    {timeAgo(item.createdAt)}
                  </div>
                </motion.button>
              );
            })}
          </div>
        )}
      </Card>
    </section>
  );
}
