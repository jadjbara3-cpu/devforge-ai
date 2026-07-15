"use client";

import * as React from "react";
import { useHotkey } from "@/hooks/use-hotkey";

/**
 * useQuickActions — manages the open state of the Quick Actions overlay
 * and registers a global hotkey (default: Ctrl+Space) to toggle it.
 *
 * The overlay is rendered by the QuickActions component itself; this hook
 * just exposes `[open, setOpen, toggle]` and wires the hotkey listener.
 *
 * The hotkey is configurable so future users can change it.
 */
export function useQuickActions(
  hotkey: string[] = ["ctrl", " "],
): {
  open: boolean;
  setOpen: React.Dispatch<React.SetStateAction<boolean>>;
  toggle: () => void;
} {
  const [open, setOpen] = React.useState(false);

  const toggle = React.useCallback(() => setOpen((v) => !v), []);

  // Register the hotkey via the existing useHotkey helper.
  useHotkey(hotkey, toggle);

  // Close on Escape — handled by the overlay itself, but we also expose
  // a programmatic close via setOpen(false).
  return { open, setOpen, toggle };
}
