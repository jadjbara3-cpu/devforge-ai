"use client";

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Keyboard, Command, ArrowLeft, ArrowRight } from "lucide-react";
import { useHotkey } from "@/hooks/use-hotkey";

interface ShortcutRow {
  keys: React.ReactNode;
  description: string;
}

const SHORTCUTS: { group: string; rows: ShortcutRow[] }[] = [
  {
    group: "Global",
    rows: [
      {
        keys: (
          <>
            <Kbd>
              <Command className="h-2.5 w-2.5" />K
            </Kbd>
          </>
        ),
        description: "Open command palette",
      },
      {
        keys: <Kbd>?</Kbd>,
        description: "Show this shortcuts dialog",
      },
      {
        keys: (
          <>
            <Kbd>Ctrl</Kbd>
            <Kbd>,</Kbd>
          </>
        ),
        description: "Open Settings",
      },
      {
        keys: <Kbd>1</Kbd>,
        description: "Jump to Overview",
      },
      {
        keys: <Kbd>2</Kbd>,
        description: "Jump to AI Chat",
      },
      {
        keys: <Kbd>3</Kbd>,
        description: "Jump to Image Studio",
      },
      {
        keys: <Kbd>4</Kbd>,
        description: "Jump to Vision Lab",
      },
      {
        keys: <Kbd>5</Kbd>,
        description: "Jump to Voice Lab",
      },
      {
        keys: <Kbd>6</Kbd>,
        description: "Jump to Web Intelligence",
      },
      {
        keys: <Kbd>7</Kbd>,
        description: "Jump to Snippet Vault",
      },
      {
        keys: <Kbd>8</Kbd>,
        description: "Jump to Task Board",
      },
    ],
  },
  {
    group: "Image Studio",
    rows: [
      {
        keys: (
          <>
            <Kbd>
              <Command className="h-2.5 w-2.5" />↵
            </Kbd>
          </>
        ),
        description: "Generate image from prompt",
      },
      {
        keys: (
          <>
            <Kbd>
              <ArrowLeft className="h-2.5 w-2.5" />
            </Kbd>{" "}
            <Kbd>
              <ArrowRight className="h-2.5 w-2.5" />
            </Kbd>
          </>
        ),
        description: "Navigate images in lightbox",
      },
      {
        keys: (
          <Kbd>
            <X className="h-2.5 w-2.5" />
          </Kbd>
        ),
        description: "Close lightbox",
      },
    ],
  },
  {
    group: "AI Chat",
    rows: [
      {
        keys: <Kbd>↵</Kbd>,
        description: "Send message",
      },
      {
        keys: (
          <>
            <Kbd>⇧</Kbd> <Kbd>↵</Kbd>
          </>
        ),
        description: "Insert newline",
      },
    ],
  },
];

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex min-w-[1.5rem] items-center justify-center gap-0.5 rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px] font-medium text-foreground shadow-sm">
      {children}
    </kbd>
  );
}

export function ShortcutsHelp({
  open: controlledOpen,
  onOpenChange,
}: {
  open?: boolean;
  onOpenChange?: (v: boolean) => void;
} = {}) {
  const [internalOpen, setInternalOpen] = React.useState(false);
  const open = controlledOpen ?? internalOpen;
  const setOpen = onOpenChange ?? setInternalOpen;

  // Press "?" to toggle (only when not typing in a field)
  React.useEffect(() => {
    const onDown = (e: KeyboardEvent) => {
      if (e.key !== "?") return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if ((e.target as HTMLElement)?.isContentEditable) return;
      e.preventDefault();
      setOpen(!open);
    };
    window.addEventListener("keydown", onDown);
    return () => window.removeEventListener("keydown", onDown);
  }, [open, setOpen]);

  useHotkey(["Escape"], () => setOpen(false), {
    enabled: open,
    preventDefault: false,
  });

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
          onClick={() => setOpen(false)}
        >
          <motion.div
            initial={{ scale: 0.95, y: 12, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0.95, y: 12, opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="relative w-full max-w-lg max-h-[85vh] overflow-hidden rounded-2xl border bg-card shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b bg-gradient-to-r from-primary/10 to-transparent px-5 py-4">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/15 text-primary">
                  <Keyboard className="h-4.5 w-4.5" />
                </div>
                <div>
                  <h2 className="text-base font-semibold">Keyboard Shortcuts</h2>
                  <p className="text-xs text-muted-foreground">
                    Work faster with these shortcuts
                  </p>
                </div>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Body */}
            <div className="max-h-[60vh] overflow-y-auto scrollbar-thin p-5">
              <div className="space-y-6">
                {SHORTCUTS.map((section) => (
                  <div key={section.group}>
                    <h3 className="mb-2.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      {section.group}
                    </h3>
                    <div className="space-y-1">
                      {section.rows.map((row, i) => (
                        <div
                          key={i}
                          className="flex items-center justify-between gap-3 rounded-lg px-2 py-1.5 transition-colors hover:bg-accent/50"
                        >
                          <span className="text-sm text-foreground/90">
                            {row.description}
                          </span>
                          <span className="flex shrink-0 items-center gap-1">
                            {row.keys}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Footer */}
            <div className="border-t bg-muted/30 px-5 py-3 text-center text-[11px] text-muted-foreground">
              Press{" "}
              <Kbd>
                <X className="h-2.5 w-2.5" />
              </Kbd>{" "}
              or click outside to close
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
