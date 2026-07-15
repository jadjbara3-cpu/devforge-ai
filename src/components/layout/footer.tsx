"use client";

import * as React from "react";
import { Zap, Clock } from "lucide-react";
import { APP_AUTHOR, getMailtoLink } from "@/lib/branding";
import { useLanguage } from "@/components/language-provider";

export function SiteFooter() {
  const { t } = useLanguage();
  const [now, setNow] = React.useState<string>("");

  React.useEffect(() => {
    const tick = () =>
      setNow(
        new Date().toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        })
      );
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <footer className="mt-auto border-t bg-card/40 glass">
      <div className="mx-auto flex w-full max-w-7xl flex-col items-center justify-between gap-2 px-4 py-4 text-xs text-muted-foreground md:flex-row md:px-8">
        <div className="flex items-center gap-2">
          <Zap className="h-3.5 w-3.5 text-primary" />
          <span>
            <span className="font-semibold text-foreground">{t("common.appName")}</span>{" "}
            · {t("common.poweredBy")} ·{" "}
            <a
              href={getMailtoLink("DevForge AI — Hello")}
              className="text-muted-foreground underline-offset-2 transition-colors hover:text-foreground hover:underline"
              title={`Email ${APP_AUTHOR}`}
            >
              {t("common.craftedBy")} {t("common.author")}
            </a>
          </span>
        </div>
        <div className="flex items-center gap-4">
          <span className="hidden sm:inline">Next.js 16 · TypeScript · Prisma · Socket.io</span>
          {now && (
            <span className="flex items-center gap-1.5 tabular-nums">
              <Clock className="h-3 w-3 text-primary" />
              {now}
            </span>
          )}
          <span className="hidden items-center gap-1.5 md:flex">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
            {t("common.allSystemsOperational")}
          </span>
        </div>
      </div>
    </footer>
  );
}
