//! ============================================================================
//!  tray.rs — System tray icon + menu
//!  ---------------------------------------------------------------------------
//!  Creates a system-tray icon that:
//!    - Left-click      → toggle window visibility (show if hidden, hide if
//!                        visible). Implemented via `on_tray_icon_event`.
//!    - Right-click     → show a context menu (built via `MenuBuilder`).
//!    - Double-click    → same as left-click (Windows convention).
//!
//!  Menu items:
//!    1. "Show DevForge AI"            → unhide + focus the main window.
//!    2. "Restart Server"              → kill + respawn `bun.exe server.js`.
//!    3. "Auto-start with Windows: …"  → toggle Windows startup registration.
//!    4. "Quit"                        → clean exit (kills servers + exits app).
//!
//!  Tray icon: we load `icons/tray-icon.png` (resolved relative to the
//!  crate root at build time). On Windows we could also use the .ico directly
//!  — Tauri's `image-png` + `image-ico` features auto-detect by extension.
//!
//!  The tray icon is created in `main.rs::setup` and lives for the lifetime
//!  of the app (Tauri holds the handle). Menu-item clicks emit events that
//!  Tauri routes to the global `on_menu_event` hook in main.rs, which
//!  delegates here to `on_menu_event`.
//! ============================================================================

use tauri::{
    image::Image,
    menu::{MenuBuilder, MenuEvent, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Manager, Runtime,
};
use tauri_plugin_notification::NotificationExt;

use crate::config;
use crate::server::{self, ServerState};
use std::sync::{Arc, Mutex};

/// Menu item IDs. Must be unique strings; Tauri uses them as the `id`
/// field on `MenuEvent` so we can match in `on_menu_event`.
pub const MENU_ID_SHOW:      &str = "devforge.menu.show";
pub const MENU_ID_RESTART:   &str = "devforge.menu.restart";
pub const MENU_ID_AUTOSTART: &str = "devforge.menu.autostart";
pub const MENU_ID_QUIT:      &str = "devforge.menu.quit";

/// Holds live references to menu items whose labels we want to update
/// (currently only the autostart toggle). Managed on the App so any
/// module can reach it via `app.state::<TrayMenuState>()`.
pub struct TrayMenuState<R: Runtime = tauri::Wry> {
    pub autostart_item: MenuItem<R>,
}

/// Build the tray icon + menu. Called once from `main.rs::setup`.
pub fn build_tray<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<()> {
    // --- Build the menu items ------------------------------------------------
    let show_item      = MenuItem::with_id(app, MENU_ID_SHOW,      "Show DevForge AI",         true, None::<&str>)?;
    let restart_item   = MenuItem::with_id(app, MENU_ID_RESTART,   "Restart Server",           true, None::<&str>)?;
    let autostart_item = MenuItem::with_id(app, MENU_ID_AUTOSTART, &autostart_menu_label(app), true, None::<&str>)?;
    let quit_item      = MenuItem::with_id(app, MENU_ID_QUIT,      "Quit DevForge AI",         true, None::<&str>)?;
    let sep            = PredefinedMenuItem::separator(app)?;

    // --- Build the menu itself (MenuBuilder accepts mixed item types) -------
    let menu = MenuBuilder::new(app)
        .item(&show_item)
        .item(&restart_item)
        .item(&autostart_item)
        .item(&sep)
        .item(&quit_item)
        .build()?;

    // --- Build the tray icon -------------------------------------------------
    // Image::from_path resolves relative to the crate root (src-tauri/).
    // We ship a PNG (not ICO) for the tray because Tauri's `image-png`
    // feature handles transparency + RGBA more reliably than `image-ico`
    // for the small 16×16 / 32×32 tray sizes on Windows.
    let icon = Image::from_path("icons/tray-icon.png")
        .or_else(|_| Image::from_path("icons/icon.png"))
        .or_else(|_| Image::from_path("icons/icon.ico"))
        .unwrap_or_else(|_| {
            log::warn!("No tray icon found — using built-in 1x1 transparent placeholder");
            Image::new(&[0, 0, 0, 0], 1, 1)
        });

    // The on_tray_icon_event handler is attached HERE (per-icon) rather
    // than globally on the Builder. This is the Tauri 2 idiom.
    TrayIconBuilder::with_id("main-tray")
        .menu(&menu)
        .show_menu_on_left_click(false) // we handle left-click ourselves
        .icon(icon)
        .tooltip("DevForge AI")
        .on_tray_icon_event(|tray, event| {
            let app = tray.app_handle().clone();
            on_tray_event(&app, &event);
        })
        .build(app)?;

    // Stash the autostart MenuItem so we can update its label live.
    app.manage(TrayMenuState { autostart_item });

    Ok(())
}

/// Handle a tray menu click. Routed from main.rs's `on_menu_event` hook.
pub fn on_menu_event<R: Runtime>(
    app: &AppHandle<R>,
    event: &MenuEvent,
    server_state: &Arc<Mutex<ServerState>>,
) {
    match event.id().as_ref() {
        MENU_ID_SHOW => {
            show_main_window(app);
        }
        MENU_ID_RESTART => {
            log::info!("Tray: Restart Server clicked");
            // Run on a separate thread so the menu callback returns
            // immediately (restart blocks for up to 30s on the health check).
            let state = server_state.clone();
            let app = app.clone();
            std::thread::spawn(move || {
                let ok = server::restart_all_servers(&state);
                let body = if ok {
                    "DevForge server restarted successfully."
                } else {
                    "Failed to restart the DevForge server. Check devforge-shell.log in %LOCALAPPDATA%\\DevForge_AI\\user-data\\"
                };
                let _ = app.notification().builder()
                    .title("DevForge AI")
                    .body(body)
                    .show();
            });
        }
        MENU_ID_AUTOSTART => {
            toggle_autostart(app);
        }
        MENU_ID_QUIT => {
            log::info!("Tray: Quit clicked — cleaning up + exiting");
            // Kill servers BEFORE exit so the Job Object close doesn't
            // race the OS handle cleanup (cleaner logs).
            server::kill_all_servers(server_state);
            app.exit(0);
        }
        _ => {}
    }
}

/// Handle a tray icon click (left/right/double). Attached per-tray-icon
/// in `build_tray`.
pub fn on_tray_event<R: Runtime>(app: &AppHandle<R>, event: &TrayIconEvent) {
    if let TrayIconEvent::Click { button, button_state, .. } = event {
        // Only react on button DOWN (not UP) to feel snappy.
        if button_state != &MouseButtonState::Down {
            return;
        }
        match button {
            MouseButton::Left | MouseButton::Double => {
                toggle_main_window_visibility(app);
            }
            // Right-click is handled by the OS (shows the menu).
            _ => {}
        }
    }
}

// ---------------------------------------------------------------------------
//  Window helpers
// ---------------------------------------------------------------------------

/// Show + focus the main window. No-op if it doesn't exist (defensive).
pub fn show_main_window<R: Runtime>(app: &AppHandle<R>) {
    if let Some(win) = app.get_webview_window("main") {
        let _ = win.show();
        let _ = win.unminimize();
        let _ = win.set_focus();
    }
}

/// Toggle: if visible → hide + show tray notif; if hidden → show + focus.
pub fn toggle_main_window_visibility<R: Runtime>(app: &AppHandle<R>) {
    if let Some(win) = app.get_webview_window("main") {
        match win.is_visible() {
            Ok(true) => {
                let _ = win.hide();
                maybe_show_minimized_notification(app);
            }
            _ => {
                let _ = win.show();
                let _ = win.unminimize();
                let _ = win.set_focus();
            }
        }
    }
}

/// Show the "minimised to tray" balloon — but only the first 3 times
/// (after that the user has learned the behaviour). Tracked in
/// `shell-config.json::minimize_notif_count`.
///
/// Made `pub` because `window.rs`'s close-button interception calls it too.
pub fn maybe_show_minimized_notification<R: Runtime>(app: &AppHandle<R>) {
    let mut cfg = config::ShellConfig::load();
    if !cfg.show_minimize_notification {
        return;
    }
    cfg.minimize_notif_count = cfg.minimize_notif_count.saturating_add(1);
    if cfg.minimize_notif_count >= 3 {
        cfg.show_minimize_notification = false;
    }
    cfg.save();

    let _ = app.notification().builder()
        .title("DevForge AI")
        .body("Minimised to tray. Click the tray icon to bring it back.")
        .show();
}

// ---------------------------------------------------------------------------
//  Auto-start toggle
// ---------------------------------------------------------------------------

/// Returns "Auto-start with Windows: On" or ": Off" based on the current
/// plugin state.
fn autostart_menu_label<R: Runtime>(app: &AppHandle<R>) -> String {
    let on = is_autostart_enabled(app);
    format!("Auto-start with Windows: {}", if on { "On" } else { "Off" })
}

/// True if the autostart plugin currently has a registered entry.
fn is_autostart_enabled<R: Runtime>(app: &AppHandle<R>) -> bool {
    use tauri_plugin_autostart::ManagerExt;
    match app.autolaunch() {
        Ok(m) => m.is_enabled().unwrap_or(false),
        Err(_) => false,
    }
}

/// Toggle the autostart registration + update the menu label + persist
/// the user's preference to shell-config.json.
fn toggle_autostart<R: Runtime>(app: &AppHandle<R>) {
    use tauri_plugin_autostart::ManagerExt;
    let mgr = match app.autolaunch() {
        Ok(m) => m,
        Err(e) => {
            log::error!("Autostart plugin not available: {e}");
            return;
        }
    };
    let currently_on = mgr.is_enabled().unwrap_or(false);
    let result = if currently_on {
        mgr.disable()
    } else {
        mgr.enable()
    };
    match result {
        Ok(_) => {
            let mut cfg = config::ShellConfig::load();
            cfg.autostart_enabled = !currently_on;
            cfg.save();
            log::info!(
                "Autostart {} (was {})",
                if !currently_on { "enabled" } else { "disabled" },
                currently_on
            );
            // Live-update the menu item label so the next time the user
            // opens the tray menu they see the new state.
            if let Some(state) = app.try_state::<TrayMenuState<R>>() {
                let _ = state.autostart_item.set_text(autostart_menu_label(app));
            }
        }
        Err(e) => {
            log::error!("Failed to toggle autostart: {e}");
            let _ = app.notification().builder()
                .title("DevForge AI")
                .body(format!("Could not change auto-start setting: {e}"))
                .show();
        }
    }
}
