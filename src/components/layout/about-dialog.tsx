"use client";

import {
  Hammer,
  Mail,
  Github,
  ScrollText,
  Cpu,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  APP_NAME,
  APP_VERSION,
  APP_AUTHOR,
  APP_GITHUB,
  APP_LICENSE,
  APP_TECH_STACK,
  getMailtoLink,
} from "@/lib/branding";
import { useLanguage } from "@/components/language-provider";

interface AboutDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

export function AboutDialog({ open, onOpenChange }: AboutDialogProps) {
  const { t } = useLanguage();
  const year = new Date().getFullYear();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto scrollbar-thin">
        <DialogHeader className="items-center text-center">
          {/* Logo / icon */}
          <div className="relative mx-auto mb-1 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 shadow-inner">
            <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-primary/15 to-transparent" />
            <Hammer className="relative h-8 w-8 text-primary" />
          </div>

          <DialogTitle className="text-2xl font-bold tracking-tight">
            <span className="gradient-text">{APP_NAME}</span>
          </DialogTitle>
          <DialogDescription className="text-xs font-medium uppercase tracking-[0.18em]">
            {t("about.version")} {APP_VERSION} · {APP_LICENSE} {t("about.license")}
          </DialogDescription>
        </DialogHeader>

        {/* Author + contact */}
        <div className="rounded-lg border bg-muted/30 px-4 py-3 text-center">
          <p className="text-sm text-muted-foreground">
            {t("about.craftedBy")}{" "}
            <a
              href={getMailtoLink(`About ${APP_NAME}`)}
              className="inline-flex items-center gap-1 font-medium text-foreground underline-offset-2 transition-colors hover:text-primary hover:underline"
              title={`Email ${APP_AUTHOR}`}
            >
              <Mail className="h-3.5 w-3.5 text-primary/80" />
              {t("common.author")}
            </a>
          </p>
        </div>

        {/* Tech stack */}
        <div className="space-y-2">
          <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            <Cpu className="h-3 w-3" />
            {t("about.techStack")}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {APP_TECH_STACK.map((tech) => (
              <Badge key={tech} variant="secondary" className="text-[10px] font-medium">
                {tech}
              </Badge>
            ))}
          </div>
        </div>

        {/* Links row */}
        <div className="grid grid-cols-2 gap-2">
          <Button asChild variant="outline" size="sm" className="gap-2 text-xs">
            <a href={APP_GITHUB} target="_blank" rel="noopener noreferrer">
              <Github className="h-3.5 w-3.5" />
              {t("common.source")}
            </a>
          </Button>
          <Button asChild variant="outline" size="sm" className="gap-2 text-xs">
            <a href={getMailtoLink(`About ${APP_NAME}`)}>
              <Mail className="h-3.5 w-3.5" />
              {t("about.contact")}
            </a>
          </Button>
        </div>

        {/* License footer */}
        <div className="flex items-center justify-center gap-1.5 rounded-md border bg-background/40 px-3 py-2 text-[11px] text-muted-foreground">
          <ScrollText className="h-3 w-3 text-primary/70" />
          <span>
            {t("common.licenseFooter", { license: APP_LICENSE })} ·{" "}
            {t("common.copyright", { year, author: t("common.author") })}
          </span>
        </div>

        <DialogFooter>
          <Button onClick={() => onOpenChange(false)} className="w-full sm:w-auto">
            {t("common.close")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
