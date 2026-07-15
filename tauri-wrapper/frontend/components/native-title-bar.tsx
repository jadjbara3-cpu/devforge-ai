// ============================================================================
//  components/native-title-bar.tsx
//  ----------------------------------------------------------------------------
//  Custom title bar for the DevForge AI native window.
//
//  When the Next.js app runs INSIDE the Tauri shell (window.__TAURI__ is
//  defined), this component renders:
//
//   ┌────────────────────────────────────────────────────────────────────┐
//   │ [drag region, full width]              [-] [□] [×]                 │
//   └────────────────────────────────────────────────────────────────────┘
//
//  - The entire bar is a DRAG REGION (mousedown → start_window_drag →
//    Win32 WM_NCLBUTTONDOWN/HTCAPTION). This lets the user move the
//    frameless window by grabbing anywhere on the bar.
//  - The right cluster has three buttons:
//      [-]  minimize  → invoke('minimize_window')
//      [□]  maximize  → invoke('toggle_maximize') + local icon swap
//      [×]  close     → invoke('hide_to_tray')  ← NOT quit (per spec)
//  - The buttons STOP event propagation so clicking them doesn't start
//    a window drag.
//
//  When NOT in Tauri (browser / Edge --app mode), this component renders
//  NOTHING — the browser/Edge provides its own title bar. This keeps the
//  same Next.js bundle working in both contexts.
//
//  Mount point: <NativeTitleBar /> is rendered once at the top of
//  app/page.tsx (above the sidebar + main content). It's `position: fixed`
//  so the rest of the app's layout is unaffected.
// ============================================================================

"use client";

import { useEffect, useState, useCallback, type MouseEvent } from "react";
import { Minus, Square, X, Copy } from "lucide-react";
import {
  isTauri,
  minimizeWindow,
  toggleMaximize,
  hideToTray,
  isMaximized,
  startWindowDrag,
} from "@/lib/tauri-bridge";

// Re-export so `import { NativeTitleBar } from "@/lib/tauri-bridge"` works
// (the tauri-bridge module has `export { NativeTitleBar } from "..."`).
export function NativeTitleBar() {
  const [inTauri, setInTauri] = useState(false);
  const [maximized, setMaximized] = useState(false);

  // Detect Tauri once on mount (client-only — SSR renders nothing).
  useEffect(() => {
    setInTauri(isTauri());
    if (isTauri()) {
      isMaximized().then(setMaximized).catch(() => {});
    }
  }, []);

  // Listen for window resize / state changes so the maximize icon swaps
  // back to "square" when the user restores the window via Windows+
  // arrow keys or by dragging the window away from the screen edge.
  useEffect(() => {
    if (!inTauri) return;
    const handler = () => isMaximized().then(setMaximized).catch(() => {});
    window.addEventListener("resize", handler);
    const interval = setInterval(handler, 500); // cheap polling fallback
    return () => {
      window.removeEventListener("resize", handler);
      clearInterval(interval);
    };
  }, [inTauri]);

  // --- Event handlers ------------------------------------------------------

  const onDragAreaMouseDown = useCallback(
    (e: MouseEvent<HTMLDivElement>) => {
      // Only start a drag on PRIMARY mouse button (left). Right-click
      // should let the user get the system menu (Alt+Space, etc.).
      if (e.button !== 0) return;
      // Ignore drags that start on a button (those have stopPropagation).
      startWindowDrag();
    },
    []
  );

  const onMinimizeClick = useCallback(() => {
    void minimizeWindow();
  }, []);

  const onMaximizeClick = useCallback(async () => {
    const newMax = await toggleMaximize();
    setMaximized(newMax);
  }, []);

  const onCloseClick = useCallback(() => {
    // Per spec: close → minimize to tray (NOT quit). The only way to
    // truly quit is via the tray menu's Quit entry.
    void hideToTray();
  }, []);

  // --- Render --------------------------------------------------------------

  // SSR + browser + Edge --app mode: render nothing (no Tauri detected).
  if (!inTauri) return null;

  return (
    <div
      role="titlebar"
      aria-label="DevForge AI title bar"
      className="devforge-titlebar"
      onMouseDown={onDragAreaMouseDown}
      onDoubleClick={onMaximizeClick}
    >
      {/* Left: app icon + name (purely cosmetic, the drag region covers it) */}
      <div className="devforge-titlebar__left">
        <img
          src="/icon-192.png"
          alt=""
          className="devforge-titlebar__icon"
          draggable={false}
        />
        <span className="devforge-titlebar__title">DevForge AI</span>
      </div>

      {/* Center: spacer — kept empty for future tab/search placement */}
      <div className="devforge-titlebar__center" />

      {/* Right: window control buttons */}
      <div className="devforge-titlebar__buttons">
        <button
          type="button"
          aria-label="Minimize"
          className="devforge-titlebar__btn devforge-titlebar__btn--min"
          onClick={onMinimizeClick}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <Minus size={14} strokeWidth={2.5} />
        </button>
        <button
          type="button"
          aria-label={maximized ? "Restore" : "Maximize"}
          className="devforge-titlebar__btn devforge-titlebar__btn--max"
          onClick={onMaximizeClick}
          onMouseDown={(e) => e.stopPropagation()}
        >
          {maximized ? <Copy size={12} strokeWidth={2.5} /> : <Square size={12} strokeWidth={2.5} />}
        </button>
        <button
          type="button"
          aria-label="Close"
          className="devforge-titlebar__btn devforge-titlebar__btn--close"
          onClick={onCloseClick}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <X size={14} strokeWidth={2.5} />
        </button>
      </div>
    </div>
  );
}

export default NativeTitleBar;
