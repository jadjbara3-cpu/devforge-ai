"use client";

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Monitor,
  MonitorSmartphone,
  ExternalLink,
  RefreshCw,
  Sparkles,
  Shield,
  Info,
  Layers,
  X,
  Bot,
  Image as ImageIcon,
  Eye,
  Globe,
  AudioLines,
  Code2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/components/language-provider";
import {
  useScreens,
  openPopout,
} from "@/lib/screen-manager";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const FEATURE_OPTIONS = [
  { key: "chat", label: "AI Chat", icon: Bot },
  { key: "image", label: "Image Studio", icon: ImageIcon },
  { key: "vision", label: "Vision Lab", icon: Eye },
  { key: "voice", label: "Voice Lab", icon: AudioLines },
  { key: "web", label: "Web Intel", icon: Globe },
  { key: "snippets", label: "Snippet Vault", icon: Code2 },
] as const;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function MultiScreenDashboard() {
  const { t } = useLanguage();
  const { toast } = useToast();
  const {
    screens,
    loading,
    permissionGranted,
    refresh,
    requestPermission,
    assignments,
    assignFeature,
    supported,
  } = useScreens();

  const [popouts, setPopouts] = React.useState<Record<string, boolean>>({});

  // ---------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------

  const handleRequestPermission = async () => {
    const ok = await requestPermission();
    if (!ok) {
      toast({
        title: t("assistant.screens.permissionDenied"),
        description: t("assistant.screens.permissionDeniedDesc"),
        variant: "destructive",
      });
    } else {
      toast({ title: t("assistant.screens.permissionGranted") });
    }
  };

  const handleOpenPopout = (screenId: string) => {
    const screen = screens.find((s) => s.id === screenId);
    if (!screen) return;
    const feature = assignments[screenId] || "chat";
    const popup = openPopout(feature, screen);
    if (popup) {
      setPopouts((p) => ({ ...p, [screenId]: true }));
      toast({ title: t("assistant.screens.opened") });
    } else {
      toast({
        title: t("assistant.screens.popupBlocked"),
        description: t("assistant.screens.popupBlockedDesc"),
        variant: "destructive",
      });
    }
  };

  // ---------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
            <MonitorSmartphone className="h-5 w-5 text-primary" />
            {t("assistant.screens.title")}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("assistant.screens.subtitle")}
          </p>
        </div>
        <div className="flex gap-2">
          {supported && !permissionGranted && (
            <Button size="sm" onClick={handleRequestPermission}>
              <Shield className="mr-1.5 h-3.5 w-3.5" />
              {t("assistant.screens.grantPermission")}
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={refresh}>
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
            {t("assistant.screens.refresh")}
          </Button>
        </div>
      </div>

      {/* Permission notice */}
      {!supported && (
        <Card className="border-amber-500/40 bg-amber-500/[0.03]">
          <CardContent className="flex items-start gap-3 p-3">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
            <div className="flex-1">
              <p className="text-sm font-medium">
                {t("assistant.screens.unsupportedTitle")}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {t("assistant.screens.unsupportedDesc")}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {supported && !permissionGranted && (
        <Card className="border-sky-500/40 bg-sky-500/[0.03]">
          <CardContent className="flex items-start gap-3 p-3">
            <Shield className="mt-0.5 h-4 w-4 shrink-0 text-sky-500" />
            <div className="flex-1">
              <p className="text-sm font-medium">
                {t("assistant.screens.permissionTitle")}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {t("assistant.screens.permissionDesc")}
              </p>
            </div>
            <Button size="sm" onClick={handleRequestPermission}>
              {t("assistant.screens.grantPermission")}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Screens grid */}
      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 2 }).map((_, i) => (
            <Skeleton key={i} className="h-64 w-full" />
          ))}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <AnimatePresence mode="popLayout">
            {screens.map((screen, i) => (
              <motion.div
                key={screen.id}
                layout
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.96 }}
                transition={{ duration: 0.2, delay: i * 0.05 }}
              >
                <ScreenCard
                  screen={screen}
                  assignment={assignments[screen.id] || "chat"}
                  hasPopout={!!popouts[screen.id]}
                  onAssign={(f) => assignFeature(screen.id, f)}
                  onOpenPopout={() => handleOpenPopout(screen.id)}
                  t={t}
                />
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}

      {/* Info card */}
      <Card className="border-dashed">
        <CardContent className="flex items-start gap-3 p-4">
          <Layers className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <div className="flex-1 text-xs text-muted-foreground">
            <p className="font-medium text-foreground">
              {t("assistant.screens.howItWorks")}
            </p>
            <p className="mt-1">
              {t("assistant.screens.howItWorksDesc")}
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Single screen card
// ---------------------------------------------------------------------------

function ScreenCard({
  screen,
  assignment,
  hasPopout,
  onAssign,
  onOpenPopout,
  t,
}: {
  screen: {
    id: string;
    label: string;
    isPrimary: boolean;
    isCurrent: boolean;
    left: number;
    top: number;
    width: number;
    height: number;
    scale: number;
    fallback: boolean;
  };
  assignment: string;
  hasPopout: boolean;
  onAssign: (feature: string) => void;
  onOpenPopout: () => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
}) {
  const aspect = screen.width / screen.height;
  // Preview height — fixed at 120px so cards line up nicely.
  const previewH = 120;
  const previewW = Math.min(220, previewH * aspect);

  return (
    <Card
      className={cn(
        "overflow-hidden",
        screen.isCurrent && "border-primary/60 bg-primary/[0.03]",
      )}
    >
      <CardContent className="space-y-3 p-4">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-1.5">
              <Monitor className="h-4 w-4 text-primary" />
              <h3 className="text-sm font-semibold">{screen.label}</h3>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-1">
              {screen.isPrimary && (
                <Badge variant="outline" className="text-[9px]">
                  {t("assistant.screens.primary")}
                </Badge>
              )}
              {screen.isCurrent && (
                <Badge variant="outline" className="text-[9px] text-primary">
                  {t("assistant.screens.current")}
                </Badge>
              )}
              {screen.fallback && (
                <Badge variant="outline" className="text-[9px]">
                  {t("assistant.screens.fallback")}
                </Badge>
              )}
              {hasPopout && (
                <Badge variant="outline" className="text-[9px] text-emerald-500">
                  {t("assistant.screens.popout")}
                </Badge>
              )}
            </div>
          </div>
        </div>

        {/* Visual preview of the screen */}
        <div className="flex justify-center rounded-lg bg-muted/30 p-3">
          <div
            className="relative rounded border-2 border-primary/30 bg-background shadow-inner"
            style={{
              width: `${previewW}px`,
              height: `${previewH}px`,
            }}
          >
            <div className="absolute inset-0 flex items-center justify-center">
              <Sparkles className="h-6 w-6 text-primary/30" />
            </div>
            <div className="absolute bottom-1 left-1 right-1 flex items-center justify-between text-[8px] text-muted-foreground">
              <span>
                {screen.width}×{screen.height}
              </span>
              <span>{Math.round(screen.scale * 100)}%</span>
            </div>
          </div>
        </div>

        {/* Feature picker */}
        <div>
          <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            {t("assistant.screens.assignFeature")}
          </Label>
          <Select value={assignment} onValueChange={onAssign}>
            <SelectTrigger className="mt-1 h-8">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FEATURE_OPTIONS.map((opt) => {
                const Icon = opt.icon;
                return (
                  <SelectItem key={opt.key} value={opt.key}>
                    <span className="flex items-center gap-1.5">
                      <Icon className="h-3 w-3" />
                      {opt.label}
                    </span>
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
        </div>

        {/* Actions */}
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            className="flex-1 gap-1.5"
            onClick={onOpenPopout}
          >
            <ExternalLink className="h-3.5 w-3.5" />
            {t("assistant.screens.openHere")}
          </Button>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button size="icon" variant="ghost" className="h-8 w-8">
                  <Info className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                {t("assistant.screens.bounds", {
                  x: screen.left,
                  y: screen.top,
                  w: screen.width,
                  h: screen.height,
                })}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </CardContent>
    </Card>
  );
}
