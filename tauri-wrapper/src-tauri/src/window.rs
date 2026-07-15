//! ============================================================================
//!  window.rs — Window management for the DevForge Tauri shell
//!  ---------------------------------------------------------------------------
//!  Responsibilities:
//!    1. **Close-button interception** — when the user clicks the titlebar
//!       close button (or presses Alt+F4), we DON'T quit. Instead we hide
//!       the window + show a tray notification. The only way to truly quit
//!       is via the tray menu "Quit" entry. This is the headline UX feature
//!       jad requested ("can be minimized to system tray").
//!
//!       Behaviour is configurable via `shell-config.json::minimize_to_tray`
//!       (default: true). When false, closing the window quits the app.
//!
//!    2. **Window-state persistence** — handled by the `window-state`
//!       plugin (registered in main.rs). This module exposes a small
//!       `DevForgeWindowState` struct that we use to record whether the
//!       window was hidden-on-last-exit (the plugin doesn't track that).
//!
//!    3. **Custom title-bar drag region** — the title bar is rendered in
//!       the Next.js app (see `frontend/components/native-title-bar.tsx`).
//!       The `start_window_drag` Tauri command below lets the React layer
//!       ask the OS to start a window move on mousedown (Windows convention
//!       for custom-drawn title bars).
//!
//!    4. **Tauri commands** — exported via `tauri::generate_handler!`
//!       in main.rs. These are the API the Next.js frontend calls via
//!       `@tauri-apps/api::invoke`.
//! ============================================================================

use tauri::{AppHandle, Manager, Runtime, WindowEvent};
use tauri_plugin_notification::NotificationExt;

use crate::config;
use crate::server::ServerState;
use std::sync::{Arc, Mutex};

// ---------------------------------------------------------------------------
//  Window-event handler (close-button interception)
// ---------------------------------------------------------------------------

/// Called from main.rs's `on_window_event` hook. Handles:
///   - `CloseRequested` → if `minimize_to_tray` is on, prevent the close +
///     hide the window + show tray notif. Otherwise let it close (which
///     will trigger app exit because main.rs has no other windows).
pub fn on_window_event<R: Runtime>(
    app: &AppHandle<R>,
    event: &WindowEvent,
    server_state: &Arc<Mutex<ServerState>>,
) {
    if let WindowEvent::CloseRequested { api, .. } = event {
        let cfg = config::ShellConfig::load();
        if cfg.minimize_to_tray {
            // Prevent the actual close. The window is hidden instead.
            api.prevent_close();

            if let Some(win) = app.get_webview_window("main") {
                let _ = win.hide();
            }

            // Tray balloon (throttled inside the helper).
            crate::tray::maybe_show_minimized_notification(app);
        } else {
            // User disabled minimize-to-tray — clean exit.
            log::info!("Window close requested (minimize_to_tray=false) — quitting");
            crate::server::kill_all_servers(server_state);
            // Let the close proceed; app.exit will fire when the last
            // window is gone.
        }
    }
}

// ---------------------------------------------------------------------------
//  Tauri commands callable from the Next.js frontend
// ---------------------------------------------------------------------------

/// Tauri command: `invoke('minimize_window')`.
/// Called by the title bar's minimize button.
#[tauri::command]
pub fn minimize_window<R: Runtime>(app: AppHandle<R>) {
    if let Some(win) = app.get_webview_window("main") {
        let _ = win.minimize();
    }
}

/// Tauri command: `invoke('toggle_maximize')`.
/// Called by the title bar's maximize/restore button.
#[tauri::command]
pub fn toggle_maximize<R: Runtime>(app: AppHandle<R>) {
    if let Some(win) = app.get_webview_window("main") {
        if win.is_maximized().unwrap_or(false) {
            let _ = win.unmaximize();
        } else {
            let _ = win.maximize();
        }
    }
}

/// Tauri command: `invoke('hide_to_tray')`.
/// Called by the title bar's close button. Does NOT quit — just hides.
#[tauri::command]
pub fn hide_to_tray<R: Runtime>(app: AppHandle<R>) {
    if let Some(win) = app.get_webview_window("main") {
        let _ = win.hide();
    }
    crate::tray::maybe_show_minimized_notification(&app);
}

/// Tauri command: `invoke('quit_app')`.
/// Called by an (optional) "Quit" item the title bar could expose, and
/// from the tray menu's Quit handler indirectly.
#[tauri::command]
pub fn quit_app<R: Runtime>(
    app: AppHandle<R>,
    server_state: tauri::State<'_, Arc<Mutex<ServerState>>>,
) {
    log::info!("quit_app command received — killing servers + exiting");
    crate::server::kill_all_servers(&server_state);
    app.exit(0);
}

/// Tauri command: `invoke('is_maximized')` → bool.
/// Lets the title bar show the correct icon (maximize vs restore).
#[tauri::command]
pub fn is_maximized<R: Runtime>(app: AppHandle<R>) -> bool {
    app.get_webview_window("main")
        .map(|w| w.is_maximized().unwrap_or(false))
        .unwrap_or(false)
}

/// Tauri command: `invoke('start_window_drag')`.
/// Called by the title bar's mousedown on the drag region. Delegates to
/// Tauri's `start_dragging` which calls Win32 `ReleaseCapture` +
/// `SendMessage(WM_NCLBUTTONDOWN, HTCAPTION, ...)` under the hood — the
/// standard Windows idiom for custom-drawn title bars.
#[tauri::command]
pub fn start_window_drag<R: Runtime>(app: AppHandle<R>) -> Result<(), String> {
    let win = app.get_webview_window("main").ok_or("main window not found")?;
    win.start_dragging().map_err(|e| e.to_string())
}

/// Tauri command: `invoke('get_app_version')` → String.
/// Reads from Cargo.toml via the `tauri::App` info — useful for the
/// Next.js About dialog (single source of truth).
#[tauri::command]
pub fn get_app_version<R: Runtime>(app: AppHandle<R>) -> String {
    app.package_info().version.to_string()
}

/// Tauri command: `invoke('set_minimize_to_tray', { enabled: bool })`.
/// Persists the user's preference + returns the new value.
#[tauri::command]
pub fn set_minimize_to_tray(enabled: bool) -> bool {
    let mut cfg = config::ShellConfig::load();
    cfg.minimize_to_tray = enabled;
    cfg.save();
    enabled
}

/// Tauri command: `invoke('restart_server')`.
/// Same as the tray Restart menu item, but callable from the Next.js
/// Settings dialog (e.g. a "Restart server" button when something's wrong).
#[tauri::command]
pub fn restart_server(
    server_state: tauri::State<'_, Arc<Mutex<ServerState>>>,
) -> bool {
    crate::server::restart_all_servers(&server_state)
}

// ---------------------------------------------------------------------------
//  Window-state persistence helpers
//  (the window-state plugin handles size/position/maximized. We track
//   only the was-hidden-on-last-exit flag here, in a separate file
//   so we don't fight with the plugin's own format.)
// ---------------------------------------------------------------------------

/// Plain JSON shape we write to `window-state.json` ourselves. The
/// `window-state` plugin has its own format + filename; we use a
/// different filename (`devforge-window.json`) to avoid any collision.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, Default)]
pub struct DevForgeWindowState {
    pub was_hidden_on_exit: bool,
    pub last_visible_at: Option<String>,
}

impl DevForgeWindowState {
    pub fn load() -> Self {
        match std::fs::read_to_string(config::window_state_path()) {
            Ok(s) => serde_json::from_str(&s).unwrap_or_default(),
            Err(_) => Self::default(),
        }
    }
    pub fn save(&self) {
        let path = config::window_state_path();
        if let Ok(json) = serde_json::to_string_pretty(self) {
            let _ = std::fs::write(path, json);
        }
    }
}

/// Called when the app is about to exit. Records whether the main window
/// was visible so the next launch can restore it to the same state.
pub fn record_exit_state<R: Runtime>(app: &AppHandle<R>) {
    let was_visible = app
        .get_webview_window("main")
        .map(|w| w.is_visible().unwrap_or(false))
        .unwrap_or(false);
    let mut state = DevForgeWindowState::load();
    state.was_hidden_on_exit = !was_visible;
    state.last_visible_at = Some(chrono::Local::now().to_rfc3339());
    state.save();
}
