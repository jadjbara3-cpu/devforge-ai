// ============================================================================
//  lib/tauri-bridge.ts
//  ----------------------------------------------------------------------------
//  Thin wrapper around `@tauri-apps/api` that:
//    1. Detects whether we're running inside the Tauri shell (vs. plain
//       browser / Edge --app mode). This lets the SAME Next.js bundle run
//       in both contexts — when not in Tauri, all native calls degrade
//       gracefully to no-ops (or browser equivalents like window.close()).
//    2. Lazily imports the Tauri APIs so the bundle stays small for the
//       browser-only build (the @tauri-apps/api package is ~30KB but we
//       don't want to pay that cost when not needed).
//    3. Exposes typed wrappers for the `#[tauri::command]`s defined in
//       src-tauri/src/window.rs.
//
//  Usage:
//    import { isTauri, minimizeWindow, toggleMaximize } from "@/lib/tauri-bridge";
//    if (isTauri()) await minimizeWindow();
//
//  Why a wrapper instead of calling @tauri-apps/api directly from the
//  components? Two reasons:
//    (a) Centralises the "am I in Tauri?" check so individual components
//        don't have to repeat the feature-detection dance.
//    (b) Lets us swap the underlying API (or add telemetry / logging)
//        in one place.
// ============================================================================

// --- Feature detection -----------------------------------------------------
//  Tauri 2 injects `window.__TAURI_INTERNALS__` (and `window.__TAURI__`
//  when `withGlobalTauri: true` in tauri.conf.json). We check both for
//  robustness — the internals one is always present, the global one only
//  if the app exposes it.
export function isTauri(): boolean {
  if (typeof window === "undefined") return false; // SSR safety
  return (
    // @ts-expect-error — Tauri internals are injected at runtime
    Boolean(window.__TAURI_INTERNALS__) ||
    // @ts-expect-error — Tauri globals are injected at runtime
    Boolean(window.__TAURI__)
  );
}

// --- Lazy API loader -------------------------------------------------------
//  We use dynamic import() so @tauri-apps/api isn't pulled into the
//  initial bundle. Tree-shaking then keeps only the modules we touch.
async function tauriCore() {
  if (!isTauri()) return null;
  return await import("@tauri-apps/api/core");
}

async function tauriWindow() {
  if (!isTauri()) return null;
  return await import("@tauri-apps/api/window");
}

// --- Window-control wrappers (mapped to #[tauri::command]s in window.rs) --

/** Minimise the main window to the taskbar. */
export async function minimizeWindow(): Promise<void> {
  const core = await tauriCore();
  if (!core) {
    // Browser fallback: do nothing (browser windows can't be minimised
    // programmatically without user gesture).
    return;
  }
  await core.invoke("minimize_window");
}

/**
 * Maximise or restore the main window. Returns the new maximised state
 * so the caller can swap its icon (maximise vs restore).
 */
export async function toggleMaximize(): Promise<boolean> {
  const core = await tauriCore();
  if (!core) return false;
  await core.invoke("toggle_maximize");
  // Read back the new state — Tauri's `currentWindow().isMaximized()` is
  // slightly cheaper than another IPC round-trip.
  try {
    const win = await tauriWindow();
    return await win?.getCurrentWindow().isMaximized() ?? false;
  } catch {
    return false;
  }
}

/**
 * Hide the window to the system tray. Differs from `minimizeWindow`:
 * - minimize → taskbar (Windows convention, user sees the button)
 * - hide     → tray only (no taskbar button, only tray icon visible)
 *
 * Bound to the title bar's "close" button (×) per jad's spec:
 * "closing the window minimizes to tray instead of quitting".
 */
export async function hideToTray(): Promise<void> {
  const core = await tauriCore();
  if (!core) return;
  await core.invoke("hide_to_tray");
}

/** Returns true if the main window is currently maximised. */
export async function isMaximized(): Promise<boolean> {
  const core = await tauriCore();
  if (!core) return false;
  return (await core.invoke<boolean>("is_maximized")) ?? false;
}

/**
 * Start a window drag operation. Called by the title bar's `onMouseDown`
 * on the drag region. Delegates to Win32 `ReleaseCapture` +
 * `SendMessage(WM_NCLBUTTONDOWN, HTCAPTION, ...)` — the standard Windows
 * idiom for custom-drawn title bars.
 */
export async function startWindowDrag(): Promise<void> {
  const core = await tauriCore();
  if (!core) return;
  try {
    await core.invoke("start_window_drag");
  } catch (e) {
    // Non-fatal: dragging just won't work, but the window is still usable.
    console.warn("[tauri-bridge] start_window_drag failed:", e);
  }
}

/**
 * Quit the app cleanly (kills servers + exits). Bound to an optional
 * "Quit" item in the title bar's overflow menu. The primary quit paths
 * remain the tray menu's Quit entry + Alt+F4 (when minimize_to_tray is
 * off).
 */
export async function quitApp(): Promise<void> {
  const core = await tauriCore();
  if (!core) {
    window.close();
    return;
  }
  await core.invoke("quit_app");
}

// --- App info + config -----------------------------------------------------

/** Returns the shell's version (from Cargo.toml). Matches `APP_VERSION` in branding.ts. */
export async function getAppVersion(): Promise<string> {
  const core = await tauriCore();
  if (!core) return "1.0.0";
  return await core.invoke<string>("get_app_version");
}

/**
 * Toggle the "minimize to tray" behaviour at runtime. Persisted to
 * shell-config.json by Rust — survives restarts.
 */
export async function setMinimizeToTray(enabled: boolean): Promise<boolean> {
  const core = await tauriCore();
  if (!core) return enabled;
  return await core.invoke<boolean>("set_minimize_to_tray", { enabled });
}

/**
 * Ask the shell to kill + respawn the Bun server. Used by the Settings
 * dialog's "Restart server" button (handy when an API key change didn't
 * propagate, or the server is wedged).
 *
 * Returns true if the server came back up within 30s.
 */
export async function restartServer(): Promise<boolean> {
  const core = await tauriCore();
  if (!core) return false;
  return await core.invoke<boolean>("restart_server");
}

// --- Shell open (external links) -------------------------------------------
//  The `tauri-plugin-shell` plugin's `open()` API launches the user's
//  default browser. We use it for target="_blank" links + the GitHub
//  link in About. In browser mode we fall back to `window.open`.
export async function openExternal(url: string): Promise<void> {
  if (!isTauri()) {
    window.open(url, "_blank", "noopener,noreferrer");
    return;
  }
  try {
    const shell = await import("@tauri-apps/plugin-shell");
    await shell.open(url);
  } catch {
    window.open(url, "_blank", "noopener,noreferrer");
  }
}

// --- Hook: re-export for convenience --------------------------------------
//  Lets components do `import { useNativeTitleBar } from "@/lib/tauri-bridge"`.
//  The hook itself lives in components/native-title-bar.tsx.
export { NativeTitleBar } from "@/components/native-title-bar";
