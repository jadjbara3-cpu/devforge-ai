/**
 * Screen Manager - Multi-monitor management for DevForge AI
 *
 * Uses the Window Management API (browser) for screen enumeration, with a
 * graceful fallback to the primary screen only when the API is unavailable
 * or the user denies the permission prompt.
 *
 * The hook also persists per-screen feature assignments (which DevForge
 * feature should run on each monitor) in localStorage so the user's choices
 * survive a page reload.
 */

"use client";

import { useState, useEffect, useCallback, useRef } from "react";

export interface ScreenInfo {
  id: string;
  label: string;
  width: number;
  height: number;
  availWidth: number;
  availHeight: number;
  left: number;
  top: number;
  isPrimary: boolean;
  /** True if this is the screen the browser window is currently on. */
  isCurrent: boolean;
  /** OS-reported device pixel ratio (1, 1.25, 1.5, 2, …). */
  scale: number;
  /** True when this entry is a synthetic fallback (Window Management API unavailable). */
  fallback: boolean;
  colorDepth: number;
}

/** localStorage key for per-screen feature assignments. */
const ASSIGNMENTS_KEY = "devforge:screen-assignments:v1";

function loadAssignments(): Record<string, string> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(ASSIGNMENTS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, string>;
    }
  } catch {
    /* ignore corrupt storage */
  }
  return {};
}

function saveAssignments(map: Record<string, string>): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(ASSIGNMENTS_KEY, JSON.stringify(map));
  } catch {
    /* storage might be full or disabled (private mode) — non-fatal */
  }
}

/**
 * Build a synthetic ScreenInfo for the primary screen, used as a fallback
 * when the Window Management API is unavailable or permission is denied.
 */
function buildPrimaryFallback(includeCurrent = true): ScreenInfo {
  const screen = window.screen;
  return {
    id: "primary",
    label: "Primary Screen",
    width: screen.width,
    height: screen.height,
    availWidth: screen.availWidth,
    availHeight: screen.availHeight,
    left: 0,
    top: 0,
    isPrimary: true,
    isCurrent: includeCurrent,
    scale: typeof window.devicePixelRatio === "number" ? window.devicePixelRatio : 1,
    fallback: true,
    colorDepth: screen.colorDepth,
  };
}

/**
 * Get all available screens using the Window Management API (if supported).
 * Falls back to the primary screen if the API is not available.
 *
 * NOTE: synchronous — does not request permission. Prefer `useScreens()`
 * in React components; this helper is for one-shot reads.
 */
export function getScreens(): ScreenInfo[] {
  if (typeof window === "undefined") {
    return [];
  }

  // Check if the Window Management API is supported
  if (!("getScreenDetails" in window)) {
    return [buildPrimaryFallback()];
  }

  try {
    // @ts-expect-error - getScreenDetails is not in standard TypeScript types yet
    const screenDetails = window.getScreenDetails();
    const screens: ScreenInfo[] = [];
    const currentId = screenDetails.currentScreen?.id;
    const primaryId = currentId; // The Window Management API treats currentScreen as primary for our purposes

    for (const screen of screenDetails.screens) {
      screens.push({
        id: screen.id || `screen-${screens.length}`,
        label: screen.label || `Screen ${screens.length + 1}`,
        width: screen.width,
        height: screen.height,
        availWidth: screen.availWidth,
        availHeight: screen.availHeight,
        left: screen.left,
        top: screen.top,
        isPrimary: screen.id === primaryId,
        isCurrent: screen.id === currentId,
        scale: typeof window.devicePixelRatio === "number" ? window.devicePixelRatio : 1,
        fallback: false,
        colorDepth: screen.colorDepth,
      });
    }

    return screens.length > 0 ? screens : [buildPrimaryFallback()];
  } catch {
    return [buildPrimaryFallback()];
  }
}

/**
 * React hook for accessing screens + per-screen feature assignments.
 *
 * Returns:
 *  - `screens`: ScreenInfo[] (always non-empty on the client after first load)
 *  - `loading`: true while the initial detection is running
 *  - `permissionGranted`: true if we have multi-screen access (or no API needed)
 *  - `supported`: true if the browser exposes the Window Management API
 *  - `refresh`: re-detect screens on demand
 *  - `requestPermission`: trigger the browser permission prompt
 *  - `assignments`: per-screen-id → feature key (persisted in localStorage)
 *  - `assignFeature`: update an assignment
 */
export function useScreens() {
  const [screens, setScreens] = useState<ScreenInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [permissionGranted, setPermissionGranted] = useState(false);
  const [supported] = useState<boolean>(() =>
    typeof window !== "undefined" && "getScreenDetails" in window,
  );
  const [assignments, setAssignments] = useState<Record<string, string>>({});
  const refreshingRef = useRef(false);

  const refresh = useCallback(async () => {
    if (typeof window === "undefined") return;
    // Avoid overlapping refreshes (resize events can fire rapidly).
    if (refreshingRef.current) return;
    refreshingRef.current = true;

    setLoading(true);
    try {
      // No Window Management API → just use the primary screen fallback.
      if (!("getScreenDetails" in window)) {
        setScreens([buildPrimaryFallback()]);
        setPermissionGranted(true); // No permission needed for the fallback.
        return;
      }

      try {
        // @ts-expect-error - getScreenDetails is experimental
        const screenDetails = await window.getScreenDetails();
        setPermissionGranted(true);

        const screenList: ScreenInfo[] = [];
        const currentId = screenDetails.currentScreen?.id;
        const primaryId = currentId;

        for (const screen of screenDetails.screens) {
          screenList.push({
            id: screen.id || `screen-${screenList.length}`,
            label: screen.label || `Screen ${screenList.length + 1}`,
            width: screen.width,
            height: screen.height,
            availWidth: screen.availWidth,
            availHeight: screen.availHeight,
            left: screen.left,
            top: screen.top,
            isPrimary: screen.id === primaryId,
            isCurrent: screen.id === currentId,
            scale:
              typeof window.devicePixelRatio === "number"
                ? window.devicePixelRatio
                : 1,
            fallback: false,
            colorDepth: screen.colorDepth,
          });
        }

        setScreens(
          screenList.length > 0 ? screenList : [buildPrimaryFallback()],
        );
      } catch {
        // Permission denied or API error — fall back to primary screen.
        setScreens([buildPrimaryFallback()]);
        setPermissionGranted(false);
      }
    } finally {
      setLoading(false);
      refreshingRef.current = false;
    }
  }, []);

  const requestPermission = useCallback(async (): Promise<boolean> => {
    if (typeof window === "undefined") return false;
    if (!("getScreenDetails" in window)) {
      // No API to request permission from — the fallback already works.
      setPermissionGranted(true);
      return true;
    }

    try {
      // @ts-expect-error - getScreenDetails is experimental
      await window.getScreenDetails();
      setPermissionGranted(true);
      await refresh();
      return true;
    } catch {
      setPermissionGranted(false);
      return false;
    }
  }, [refresh]);

  const assignFeature = useCallback(
    (screenId: string, feature: string) => {
      setAssignments((prev) => {
        const next = { ...prev, [screenId]: feature };
        saveAssignments(next);
        return next;
      });
    },
    [],
  );

  useEffect(() => {
    // Load persisted assignments on mount.
    setAssignments(loadAssignments());

    refresh();

    // Listen for screen changes (window resize covers most cases; the
    // Window Management API also exposes a `screenschange` event when
    // available).
    const handleChange = () => refresh();
    window.addEventListener("resize", handleChange);

    let screenDetails: { addEventListener?: (k: string, cb: () => void) => void } | null = null;
    if ("getScreenDetails" in window) {
      try {
        // @ts-expect-error - getScreenDetails is experimental
        screenDetails = window.getScreenDetails();
        screenDetails?.addEventListener?.("screenschange", handleChange);
        screenDetails?.addEventListener?.("currentscreenchange", handleChange);
      } catch {
        /* permission not granted yet — non-fatal */
      }
    }

    return () => {
      window.removeEventListener("resize", handleChange);
      // The Window Management API event listeners are auto-cleaned when
      // the ScreenDetails object is garbage-collected.
    };
  }, [refresh]);

  return {
    screens,
    loading,
    permissionGranted,
    supported,
    refresh,
    requestPermission,
    assignments,
    assignFeature,
  };
}

/**
 * Open a popout window on a specific screen
 */
export function openPopout(
  url: string,
  screen: ScreenInfo,
  options?: { width?: number; height?: number },
): Window | null {
  if (typeof window === "undefined") return null;

  const width = options?.width || Math.min(screen.availWidth || screen.width, 800);
  const height = options?.height || Math.min(screen.availHeight || screen.height, 600);

  // Calculate position to center on the target screen
  const left = screen.left + Math.round(((screen.availWidth || screen.width) - width) / 2);
  const top = screen.top + Math.round(((screen.availHeight || screen.height) - height) / 2);

  const features = [
    `width=${width}`,
    `height=${height}`,
    `left=${left}`,
    `top=${top}`,
    "menubar=no",
    "toolbar=no",
    "location=no",
    "status=no",
    "resizable=yes",
  ].join(",");

  return window.open(url, `_blank_${screen.id}`, features);
}

/**
 * Request permission for the Window Management API
 */
export async function requestScreenPermission(): Promise<boolean> {
  if (typeof window === "undefined") return false;
  if (!("getScreenDetails" in window)) return true; // No API, no permission needed

  try {
    // @ts-expect-error - getScreenDetails is experimental
    await window.getScreenDetails();
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if the Window Management API is supported
 */
export function isMultiScreenSupported(): boolean {
  if (typeof window === "undefined") return false;
  return "getScreenDetails" in window;
}
