"use client";

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, ChevronLeft, ChevronRight, Download, Maximize2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { useHotkey } from "@/hooks/use-hotkey";

export interface LightboxItem {
  id: string;
  url: string;
  prompt: string;
  size?: string;
  meta?: string;
}

interface LightboxProps {
  items: LightboxItem[];
  index: number | null;
  onClose: () => void;
  onNavigate: (index: number) => void;
}

export function Lightbox({ items, index, onClose, onNavigate }: LightboxProps) {
  const open = index !== null && index >= 0 && index < items.length;

  const goPrev = React.useCallback(() => {
    if (!open) return;
    onNavigate((index! - 1 + items.length) % items.length);
  }, [open, index, items.length, onNavigate]);

  const goNext = React.useCallback(() => {
    if (!open) return;
    onNavigate((index! + 1) % items.length);
  }, [open, index, items.length, onNavigate]);

  useHotkey(["Escape"], onClose, { enabled: open, preventDefault: false });
  useHotkey(["ArrowLeft"], goPrev, { enabled: open, preventDefault: false });
  useHotkey(["ArrowRight"], goNext, { enabled: open, preventDefault: false });

  const current = open ? items[index!] : null;

  return (
    <AnimatePresence>
      {open && current && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-md"
          onClick={onClose}
        >
          {/* Top bar */}
          <div
            className="absolute left-0 right-0 top-0 flex items-center justify-between gap-3 p-4 text-white"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2">
              {current.size && (
                <Badge
                  variant="secondary"
                  className="bg-white/15 text-white backdrop-blur"
                >
                  {current.size}
                </Badge>
              )}
              <span className="text-xs text-white/60">
                {index! + 1} / {items.length}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <a
                href={current.url}
                download={`devforge-${current.id}.png`}
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-white/10 text-white backdrop-blur transition-colors hover:bg-white/20"
                aria-label="Download"
                onClick={(e) => e.stopPropagation()}
              >
                <Download className="h-4 w-4" />
              </a>
              <button
                onClick={onClose}
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-white/10 text-white backdrop-blur transition-colors hover:bg-white/20"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Navigation arrows */}
          {items.length > 1 && (
            <>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  goPrev();
                }}
                className="absolute left-4 top-1/2 z-10 inline-flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur transition-all hover:scale-110 hover:bg-white/20"
                aria-label="Previous"
              >
                <ChevronLeft className="h-6 w-6" />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  goNext();
                }}
                className="absolute right-4 top-1/2 z-10 inline-flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur transition-all hover:scale-110 hover:bg-white/20"
                aria-label="Next"
              >
                <ChevronRight className="h-6 w-6" />
              </button>
            </>
          )}

          {/* Image */}
          <motion.div
            key={current.id}
            initial={{ scale: 0.92, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            className="relative flex max-h-[80vh] max-w-[90vw] flex-col items-center"
            onClick={(e) => e.stopPropagation()}
          >
            <img
              src={current.url}
              alt={current.prompt}
              className="max-h-[72vh] max-w-full rounded-lg object-contain shadow-2xl"
            />
            {/* Prompt caption */}
            <div className="mt-4 max-w-2xl px-4 text-center">
              <p className="line-clamp-3 text-sm leading-relaxed text-white/80">
                {current.prompt}
              </p>
              {current.meta && (
                <p className="mt-1 text-[10px] uppercase tracking-wider text-white/40">
                  {current.meta}
                </p>
              )}
            </div>
          </motion.div>

          {/* Keyboard hints */}
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-[10px] text-white/40">
            <kbd className="mx-1 rounded border border-white/20 px-1.5 py-0.5">←</kbd>
            <kbd className="mx-1 rounded border border-white/20 px-1.5 py-0.5">→</kbd>
            navigate
            <span className="mx-2">·</span>
            <kbd className="mx-1 rounded border border-white/20 px-1.5 py-0.5">Esc</kbd>
            close
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** A small trigger badge that can be embedded on a thumbnail. */
export function LightboxHint({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md bg-black/50 px-1.5 py-0.5 text-[9px] font-medium text-white backdrop-blur",
        className
      )}
    >
      <Maximize2 className="h-2.5 w-2.5" /> Click to zoom
    </span>
  );
}
