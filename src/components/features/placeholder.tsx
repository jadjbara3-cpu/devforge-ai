"use client";

import { Card } from "@/components/ui/card";

export function FeaturePlaceholder({ title }: { title: string }) {
  return (
    <Card className="flex min-h-[60vh] items-center justify-center p-10">
      <div className="flex flex-col items-center gap-3 text-center">
        <div className="h-10 w-10 animate-pulse rounded-full bg-primary/20" />
        <p className="text-sm text-muted-foreground">
          Loading <span className="font-semibold text-foreground">{title}</span>…
        </p>
      </div>
    </Card>
  );
}
