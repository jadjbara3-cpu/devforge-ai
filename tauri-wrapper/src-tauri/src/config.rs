//! ============================================================================
//!  config.rs — path resolution + runtime config for the DevForge Tauri shell
//!  ---------------------------------------------------------------------------
//!  All paths are resolved RELATIVE TO THE EXECUTABLE, not the working
//!  directory. Windows does NOT guarantee a CWD for GUI apps launched from
//!  the Start Menu / shell:startup / Inno Setup [Run] entry, so we MUST use
//!  `std::env::current_exe()` to find our own location and walk up to the
//!  install root.
//!
//!  Install layout (created by the Inno Setup installer at
//!  %LOCALAPPDATA%\DevForge_AI):
//!
//!  ```text
//!  DevForge_AI/
//!  ├── DevForgeAI.exe          ← this binary
//!  ├── devforge-icon.ico       ← taskbar / shortcut icon
//!  ├── version.txt             ← auto-updater authoritative version marker
//!  ├── run-server.cmd          ← (legacy, kept for debug launcher)
//!  ├── start-devforge.vbs      ← (legacy, kept for debug launcher)
//!  ├── app/
//!  │   ├── server.js           ← Next.js standalone entrypoint
//!  │   ├── .next/              ← compiled Next.js (static + standalone)
//!  │   ├── public/             ← static assets
//!  │   ├── prisma/             ← schema + migrations
//!  │   ├── package.json
//!  │   ├── node_modules/
//!  │   └── mini-services/
//!  │       └── task-service/   ← Socket.io task board (port 3003)
//!  └── runtime/
//!      └── bun.exe             ← portable Bun runtime
//!  ```
//!
//!  User data (logs, window-state.json) lives in
//!  `%LOCALAPPDATA%\DevForge_AI\user-data\` so it survives reinstalls /
//!  updates (the Inno Setup installer only wipes `{app}`, never user-data).
//! ============================================================================

use std::path::{Path, PathBuf};

/// Cached install root (parent dir of DevForgeAI.exe).
/// Computed once on first call, reused thereafter.
fn install_root() -> PathBuf {
    use std::sync::OnceLock;
    static ROOT: OnceLock<PathBuf> = OnceLock::new();
    ROOT.get_or_init(|| {
        let exe = std::env::current_exe()
            .expect("FATAL: cannot resolve DevForgeAI.exe path");
        // exe = <install_root>\DevForgeAI.exe  →  parent = install_root
        exe.parent()
            .expect("FATAL: DevForgeAI.exe has no parent dir")
            .to_path_buf()
    })
    .clone()
}

/// `<install_root>\app` — the Next.js standalone working directory.
/// Bun is spawned with this as CWD so `server.js` + relative paths resolve.
pub fn app_dir() -> PathBuf {
    install_root().join("app")
}

/// `<install_root>\runtime\bun.exe` — the portable Bun binary.
pub fn bun_path() -> PathBuf {
    install_root().join("runtime").join("bun.exe")
}

/// `<install_root>\app\server.js` — the Next.js standalone entrypoint.
pub fn server_js_path() -> PathBuf {
    app_dir().join("server.js")
}

/// `<install_root>\app\mini-services\task-service\index.ts` — Socket.io task
/// board. Optional — spawned as a second hidden child process.
pub fn task_service_path() -> PathBuf {
    app_dir()
        .join("mini-services")
        .join("task-service")
        .join("index.ts")
}

/// `<install_root>\devforge-icon.ico` — used for the tray icon if no PNG is
/// available, and as the fallback window icon.
pub fn app_icon_path() -> PathBuf {
    install_root().join("devforge-icon.ico")
}

/// User-writable data dir: `%LOCALAPPDATA%\DevForge_AI\user-data\`.
/// Created on first call. Survives reinstalls (Inno Setup only wipes `{app}`).
pub fn user_data_dir() -> PathBuf {
    let base = dirs::data_local_dir()
        .unwrap_or_else(|| install_root().to_path_buf())
        .join("DevForge_AI")
        .join("user-data");
    let _ = std::fs::create_dir_all(&base);
    base
}

/// `<user_data>\window-state.json` — last window size/position/maximized.
/// Read by window.rs on startup, written on every move/resize.
pub fn window_state_path() -> PathBuf {
    user_data_dir().join("window-state.json")
}

/// `<user_data>\devforge-shell.log` — rolling log of the Tauri shell
/// (spawn / kill / health-check / tray events). Useful for debugging.
pub fn shell_log_path() -> PathBuf {
    user_data_dir().join("devforge-shell.log")
}

/// `<user_data>\devforge-server.log` — stdout + stderr of the spawned
/// `bun.exe server.js` child. Mirrors the existing log filename so jad's
/// existing debug instructions (README.txt) still apply.
pub fn server_log_path() -> PathBuf {
    user_data_dir().join("devforge-server.log")
}

/// `<user_data>\devforge-task-service.log` — same as above for the optional
/// port-3003 Socket.io task service.
pub fn task_log_path() -> PathBuf {
    user_data_dir().join("devforge-task-service.log")
}

/// `<user_data>\shell-config.json` — user preferences (auto-start, minimize-
/// to-tray behaviour, etc.). Read by config.rs, written by tray menu toggles.
pub fn shell_config_path() -> PathBuf {
    user_data_dir().join("shell-config.json")
}

/// URL of the Next.js server. Hardcoded to localhost:3000 because that's
/// what the existing run-server.cmd sets; the env override is for dev.
pub fn server_url() -> String {
    std::env::var("DEVFORGE_SERVER_URL").unwrap_or_else(|_| {
        let port = std::env::var("PORT").unwrap_or_else(|_| "3000".into());
        format!("http://127.0.0.1:{}", port)
    })
}

/// URL of the optional task-service. Same env-override convention.
pub fn task_url() -> String {
    std::env::var("DEVFORGE_TASK_URL").unwrap_or_else(|_| {
        format!("http://127.0.0.1:{}", std::env::var("TASK_PORT").unwrap_or_else(|_| "3003".into()))
    })
}

/// User-facing runtime config — persisted to shell-config.json.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct ShellConfig {
    /// When true, the close button hides the window instead of quitting.
    /// Default: true (minimize-to-tray is the headline feature).
    pub minimize_to_tray: bool,

    /// When true, the app launches automatically when the user logs in.
    /// Default: false (opt-in via Settings or tray menu).
    pub autostart_enabled: bool,

    /// When true, show a tray balloon each time the window is minimised.
    /// Default: true for the first 3 minimises, then auto-disables (the
    /// user has learned by then). Tracked via `minimize_notif_count`.
    pub show_minimize_notification: bool,
    pub minimize_notif_count: u32,

    /// When true, the Tauri shell automatically restarts `bun.exe` if it
    /// crashes (health-check fails 3 times in a row). Default: true.
    pub auto_restart_server: bool,
}

impl Default for ShellConfig {
    fn default() -> Self {
        Self {
            minimize_to_tray: true,
            autostart_enabled: false,
            show_minimize_notification: true,
            minimize_notif_count: 0,
            auto_restart_server: true,
        }
    }
}

impl ShellConfig {
    /// Load from disk, falling back to defaults if missing/corrupt.
    pub fn load() -> Self {
        let path = shell_config_path();
        match std::fs::read_to_string(&path) {
            Ok(s) => serde_json::from_str(&s).unwrap_or_default(),
            Err(_) => Self::default(),
        }
    }

    /// Persist to disk atomically (write to .tmp then rename). Best-effort
    /// — silently ignores I/O errors (the user can always re-toggle).
    pub fn save(&self) {
        let path = shell_config_path();
        if let Ok(json) = serde_json::to_string_pretty(self) {
            let tmp = path.with_extension("json.tmp");
            if std::fs::write(&tmp, json).is_ok() {
                let _ = std::fs::rename(&tmp, &path);
            }
        }
    }
}

/// Convenience: returns true if `path` exists and is a non-empty file.
/// Used by server.rs to skip spawning the task-service when not installed.
pub fn file_exists_nonempty<P: AsRef<Path>>(path: P) -> bool {
    path.as_ref()
        .metadata()
        .map(|m| m.is_file() && m.len() > 0)
        .unwrap_or(false)
}
