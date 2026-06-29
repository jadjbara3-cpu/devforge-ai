import { Zap } from "lucide-react";

export function SiteFooter() {
  return (
    <footer className="mt-auto border-t bg-card/40 glass">
      <div className="mx-auto flex w-full max-w-7xl flex-col items-center justify-between gap-2 px-4 py-4 text-xs text-muted-foreground md:flex-row md:px-8">
        <div className="flex items-center gap-2">
          <Zap className="h-3.5 w-3.5 text-primary" />
          <span>
            <span className="font-semibold text-foreground">DevForge AI</span>{" "}
            · Powered by Z.ai SDK
          </span>
        </div>
        <div className="flex items-center gap-4">
          <span>Next.js 16 · TypeScript · Prisma · Socket.io</span>
          <span className="hidden items-center gap-1.5 md:flex">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
            All systems operational
          </span>
        </div>
      </div>
    </footer>
  );
}
