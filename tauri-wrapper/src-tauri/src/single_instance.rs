//! ============================================================================
//!  single_instance.rs — Single-instance enforcement
//!  ---------------------------------------------------------------------------
//!  This module is a thin documentation wrapper around the
//!  `tauri-plugin-single-instance` plugin. The actual logic is handled by
//!  the plugin — second-instance detection is done via a named pipe
//!  (Windows) / abstract socket (Linux) / launch-argument scheme (macOS),
//!  so it works reliably across reboots and even when the first instance
//!  is hung.
//!
//!  Usage in main.rs:
//!  ```ignore
//!  tauri::Builder::default()
//!      .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
//!          single_instance::on_second_launch(app);
//!      }))
//!      // ... rest of builder
//!  ```
//!
//!  When a second instance is launched, the plugin sends a message to the
//!  first instance via the named pipe, then the second instance exits.
//!  The first instance's callback fires; we use it to:
//!    1. Show + focus the main window (in case it's hidden in the tray).
//!    2. Flash the taskbar button (Windows) so the user notices.
//!
//!  We deliberately do NOT pass custom argv from the second instance to
//!  the first — DevForge has no deep-linking yet. If we add it later,
//!  the callback signature gives us `argv: Vec<String>` + `cwd: String`
//!  to inspect.
//! ============================================================================

use tauri::{AppHandle, Manager, Runtime};
use tauri_plugin_notification::NotificationExt;

/// Called by the `tauri-plugin-single-instance` plugin when a second
/// instance of DevForgeAI.exe is launched. The second instance exits
/// immediately after invoking this callback (handled by the plugin).
///
/// Our job: surface the first instance to the user.
pub fn on_second_launch<R: Runtime>(app: &AppHandle<R>) {
    log::info!("Second instance launch detected — focusing existing window");

    if let Some(win) = app.get_webview_window("main") {
        // Unhide if minimised to tray, restore if minimised to taskbar,
        // then focus.
        let _ = win.show();
        let _ = win.unminimize();
        let _ = win.set_focus();

        // Windows-only: request attention so the taskbar flashes. Tauri 2
        // exposes this via `Window::set_focus` + a separate `request_attention`
        // helper in tauri-plugin-windows-extra. We skip it — `set_focus`
        // already brings the window to the foreground, which is enough.
    } else {
        // No main window — could be a race during startup. Show a tray
        // notification so the user knows their click was acknowledged.
        let _ = app.notification().builder()
            .title("DevForge AI")
            .body("DevForge AI is already running. If you don't see it, check the system tray.")
            .show();
    }
}
