"use client";

import * as React from "react";

/**
 * Subscribe to a keyboard shortcut.
 *
 * @example useHotkey(["mod", "k"], () => setOpen(true))
 */
export function useHotkey(
  keys: string[],
  handler: (e: KeyboardEvent) => void,
  options: { preventDefault?: boolean; enabled?: boolean } = {}
) {
  const { preventDefault = true, enabled = true } = options;
  const ref = React.useRef(handler);
  React.useEffect(() => {
    ref.current = handler;
  }, [handler]);

  React.useEffect(() => {
    if (!enabled) return;
    const listener = (e: KeyboardEvent) => {
      const mods = {
        mod: e.metaKey || e.ctrlKey,
        ctrl: e.ctrlKey,
        shift: e.shiftKey,
        alt: e.altKey,
        meta: e.metaKey,
      };
      const expected = keys.every((k) => {
        const key = k.toLowerCase();
        if (key === "mod") return mods.mod;
        if (key === "ctrl") return mods.ctrl;
        if (key === "shift") return mods.shift;
        if (key === "alt") return mods.alt;
        if (key === "meta") return mods.meta;
        return e.key.toLowerCase() === key;
      });
      if (expected) {
        if (preventDefault) e.preventDefault();
        ref.current(e);
      }
    };
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, [keys.join("+"), preventDefault, enabled]);
}
