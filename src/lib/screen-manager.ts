/**
 * Screen Manager - Multi-monitor management for DevForge AI
 * Uses the Window Management API (browser) + PowerShell (Windows) for screen enumeration
 */

"use client";

import { useState, useEffect, useCallback } from "react";

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
  colorDepth: number;
}

/**
 * Get all available screens using the Window Management API (if supported)
 * Falls back to the primary screen if the API is not available.
 */
export function getScreens(): ScreenInfo[] {
  if (typeof window === "undefined") {
    return [];
  }

  // Check if the Window Management API is supported
  if (!("getScreenDetails" in window)) {
    // Fallback: return primary screen only
    return [
      {
        id: "primary",
        label: "Primary Screen",
        width: window.screen.width,
        height: window.screen.height,
        availWidth: window.screen.availWidth,
        availHeight: window.screen.availHeight,
        left: 0,
        top: 0,
        isPrimary: true,
        colorDepth: window.screen.colorDepth,
      },
    ];
  }

  try {
    // @ts-expect-error - getScreenDetails is not in standard TypeScript types yet
    const screenDetails = window.getScreenDetails();
    const screens: ScreenInfo[] = [];
    let primaryId = screenDetails.currentScreen.id;

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
        colorDepth: screen.colorDepth,
      });
    }

    return screens;
  } catch {
    return [
      {
        id: "primary",
        label: "Primary Screen",
        width: window.screen.width,
        height: window.screen.height,
        availWidth: window.screen.availWidth,
        availHeight: window.screen.availHeight,
        left: 0,
        top: 0,
        isPrimary: true,
        colorDepth: window.screen.colorDepth,
      },
    ];
  }
}

/**
 * React hook for accessing screens
 */
export function useScreens() {
  const [screens, setScreens] = useState<ScreenInfo[]>([]);
  const [hasPermission, setHasPermission] = useState(false);

  const refresh = useCallback(async () => {
    if (typeof window === "undefined") return;

    // Check if Window Management API is supported
    if (!("getScreenDetails" in window)) {
      setScreens(getScreens());
      setHasPermission(true);
      return;
    }

    try {
      // @ts-expect-error - getScreenDetails is experimental
      const screenDetails = await window.getScreenDetails();
      setHasPermission(true);

      const screenList: ScreenInfo[] = [];
      const primaryId = screenDetails.currentScreen.id;

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
          colorDepth: screen.colorDepth,
        });
      }

      setScreens(screenList);
    } catch (err) {
      // Permission denied or API error — fall back to primary screen
      setScreens(getScreens());
      setHasPermission(false);
    }
  }, []);

  useEffect(() => {
    refresh();

    // Listen for screen changes
    const handleChange = () => refresh();
    window.addEventListener("resize", handleChange);

    return () => {
      window.removeEventListener("resize", handleChange);
    };
  }, [refresh]);

  return { screens, hasPermission, refresh };
}

/**
 * Open a popout window on a specific screen
 */
export function openPopout(
  url: string,
  screen: ScreenInfo,
  options?: { width?: number; height?: number }
): Window | null {
  if (typeof window === "undefined") return null;

  const width = options?.width || Math.min(screen.availWidth, 800);
  const height = options?.height || Math.min(screen.availHeight, 600);

  // Calculate position to center on the target screen
  const left = screen.left + Math.round((screen.availWidth - width) / 2);
  const top = screen.top + Math.round((screen.availHeight - height) / 2);

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
