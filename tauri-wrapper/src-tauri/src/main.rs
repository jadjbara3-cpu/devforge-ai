//! ============================================================================
//!  main.rs — DevForge AI native desktop shell (Tauri 2.0)
//!  ---------------------------------------------------------------------------
//!  This binary is the native Windows shell that wraps the Next.js app.
//!  It:
//!    1. Enforces single-instance (second launch focuses the first window).
//!    2. Spawns `bun.exe server.js` (Next.js standalone, port 3000) +
//!       `bun.exe mini-services/task-service/index.ts` (port 3003) as
//!       HIDDEN child processes assigned to a Job Object so they die
//!       with us if we crash.
//!    3. Polls http://127.0.0.1:3000 until the server responds (max 30s)
//!       BEFORE showing the window. This avoids the WebView2 showing a
//!       "this site can't be reached" error page during cold starts.
//!    4. Creates a frameless WebView2 window loading the local URL.
//!    5. Builds a system-tray icon with a Show/Restart/Auto-start/Quit menu.
//!    6. Intercepts the window close button — hides to tray instead of
//!       quitting (configurable via Settings).
//!    7. Starts a background watchdog that auto-restarts the server if
//!       it dies (3 consecutive health-check failures, 30s cooldown).
//!    8. Persists window size/position via `tauri-plugin-window-state`.
//!
//!  Logging: `env_logger` writes to stdout (dev) — in production builds
//!  the Inno Setup installer redirects stdout to a log file via the
//!  [Run] entry's `runhidden` flag, so jad's existing devforge-server.log
//!  troubleshooting path still applies. We ALSO mirror to
//!  `%LOCALAPPDATA%\DevForge_AI\user-data\devforge-shell.log` via a
//!  custom logger (TODO: switch to `simplelog` or `fern` for file output).
//!
//!  Exit codes:
//!    0 — clean exit (tray Quit / window close with minimize_to_tray=false)
//!    1 — fatal error during startup (missing bun.exe / server.js, etc.)
//! ============================================================================

// --- Module declarations -------------------------------------------------
mod config;
mod server;
mod tray;
mod window;
mod single_instance;

// --- Imports -------------------------------------------------------------
use std::sync::{Arc, Mutex};

use tauri::{Manager, WindowEvent};
use tauri_plugin_autostart::MacosLauncher;

use server::ServerState;

// ---------------------------------------------------------------------------
//  main()
// ---------------------------------------------------------------------------

fn main() {
    // Initialise the logger BEFORE anything else so we capture panics
    // from the setup phase. Filter: RUST_LOG=info by default, override
    // via the env var.
    let _ = env_logger::Builder::from_env(
        env_logger::Env::default().default_filter_or("info")
    )
    .try_init();

    log::info!("DevForge AI shell starting up (v{})", env!("CARGO_PKG_VERSION"));

    // Shared server state — managed on the App so all Tauri commands +
    // the watchdog thread can reach it. Wrapped in Arc<Mutex> for thread
    // safety (spawn thread writes; menu commands read; watchdog reads).
    let server_state: Arc<Mutex<ServerState>> = ServerState::shared();

    // --- Tauri builder ----------------------------------------------------
    let mut builder = tauri::Builder::default();

    // 1. Single-instance — MUST be the first plugin so it can detect a
    //    running instance before any other plugin initialises. The closure
    //    fires IN THE FIRST (existing) instance when a second one tries to
    //    launch.
    builder = builder.plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
        single_instance::on_second_launch(app);
    }));

    // 2. Window-state persistence — saves size/position/maximised to
    //    %LOCALAPPDATA%\DevForge_AI\user-data\.window-state automatically
    //    on every move/resize.
    builder = builder.plugin(tauri_plugin_window_state::Builder::new().build());

    // 3. Auto-start — registers a Run-key entry so DevForge launches on
    //    login. The plugin reads the current executable path + app name
    //    from Tauri's package_info. MacosLauncher::ServiceAgent is unused
    //    on Windows but required by the API.
    builder = builder.plugin(tauri_plugin_autostart::init(
        MacosLauncher::LaunchAgent,
        Some(vec!["--autostarted"]), // CLI flag so the app knows it was launched by the OS
    ));

    // 4. Notification — tray balloons + the "Restart Server" result toast.
    builder = builder.plugin(tauri_plugin_notification::init());

    // 5. Shell — lets the Next.js frontend open external URLs in the
    //    default browser (e.g. GitHub link in About dialog). Without this
    //    plugin, target="_blank" links open inside the WebView2 window,
    //    which is awful UX.
    builder = builder.plugin(tauri_plugin_shell::init());

    // 6. OS info — used by the frontend's About dialog (optional, harmless).
    builder = builder.plugin(tauri_plugin_os::init());

    // 7. Process — used by the frontend to ask the shell to exit cleanly
    //    via `process.exit(0)` (alternative to the `quit_app` command).
    builder = builder.plugin(tauri_plugin_process::init());

    // 8. Dialog — "Are you sure you want to quit?" confirmations (future use).
    builder = builder.plugin(tauri_plugin_dialog::init());

    // --- Setup hook: spawn server + build tray + watchdog ----------------
    // Runs after plugins init, before the window is created. The window
    // starts hidden (`visible: false` in tauri.conf.json) — we show it
    // only after the server is healthy.
    let setup_state = server_state.clone();
    builder = builder.setup(move |app| {
        log::info!("Setup hook firing");

        // a. Build the tray icon (must happen early — if the window
        //    takes a while to show, the user has the tray to interact
        //    with + can Quit if they change their mind).
        tray::build_tray(app.handle())?;

        // b. Spawn the Bun server on a separate thread so the setup hook
        //    returns immediately (Tauri would otherwise time out the
        //    window-creation if we blocked for 30s on the health check).
        let app_handle = app.handle().clone();
        let state_for_spawn = setup_state.clone();
        std::thread::spawn(move || {
            spawn_and_wait_for_server(&app_handle, &state_for_spawn);
        });

        // c. Start the watchdog (auto-restart on crash).
        server::start_watchdog(setup_state.clone());

        Ok(())
    });

    // --- Window-event hook: close-button interception ---------------------
    let win_event_state = server_state.clone();
    builder = builder.on_window_event(move |window, event| {
        let app = window.app_handle().clone();
        window::on_window_event(&app, event, &win_event_state);
    });

    // --- Menu-event hook: tray menu clicks --------------------------------
    let menu_event_state = server_state.clone();
    builder = builder.on_menu_event(move |app, event| {
        tray::on_menu_event(app, event, &menu_event_state);
    });

    // --- Tauri commands exposed to the Next.js frontend -------------------
    // `tauri::generate_handler!` expands to a registration table the
    // frontend calls via `@tauri-apps/api::invoke('command_name', args)`.
    builder = builder.invoke_handler(tauri::generate_handler![
        window::minimize_window,
        window::toggle_maximize,
        window::hide_to_tray,
        window::quit_app,
        window::is_maximized,
        window::start_window_drag,
        window::get_app_version,
        window::set_minimize_to_tray,
        window::restart_server,
    ]);

    // --- Make the shared server state available to Tauri commands ---------
    // `app.manage(state)` lets `#[tauri::command]`s pull it out via
    // `tauri::State<'_, Arc<Mutex<ServerState>>>`. Must happen BEFORE
    // `run()`, so we use the `manage` builder method.
    builder = builder.manage(server_state.clone());

    // --- Run --------------------------------------------------------------
    if let Err(e) = builder.run(tauri::generate_context!()) {
        log::error!("FATAL: Tauri failed to start: {e}");
        std::process::exit(1);
    }

    log::info!("DevForge AI shell exited cleanly");
}

// ---------------------------------------------------------------------------
//  Spawn + wait-for-server helper
//  Runs on a dedicated thread spawned from setup().
// ---------------------------------------------------------------------------

fn spawn_and_wait_for_server<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    state: &Arc<Mutex<ServerState>>,
) {
    log::info!("Spawning Bun server + waiting for health...");

    // 1. Spawn the main Next.js server.
    let main_child = match server::spawn_server() {
        Ok(c) => c,
        Err(e) => {
            log::error!("Failed to spawn bun.exe server.js: {e}");
            let body = format!(
                "DevForge AI could not start its server.\n\n\
                 Troubleshooting:\n\
                 - Make sure the install folder is intact.\n\
                 - Check the log at %LOCALAPPDATA%\\DevForge_AI\\user-data\\devforge-server.log\n\n\
                 Technical detail: {e}"
            );
            show_startup_error(app, &body);
            return;
        }
    };

    // 2. Spawn the optional task-service. Non-fatal if it fails.
    let task_child = match server::spawn_task_service() {
        Ok(c) => c,
        Err(e) => {
            log::warn!("task-service spawn failed (optional, continuing): {e}");
            None
        }
    };

    // 3. Record PIDs + child handles in shared state.
    {
        let mut s = state.lock().expect("ServerState mutex poisoned");
        s.main_pid = Some(main_child.id());
        s.task_pid = task_child.as_ref().map(|c| c.id());
        s.main_child = Some(main_child);
        s.task_child = task_child;
        s.shutting_down = false;
    }

    // 4. Health-check — block up to 30s for http://127.0.0.1:3000 to answer.
    let url = config::server_url();
    let ready = server::wait_for_server(&url, 30);

    if !ready {
        log::error!("Server failed to come up within 30s");
        show_startup_error(
            app,
            "DevForge AI's server did not respond within 30 seconds.\n\n\
             The app will keep running so you can use the tray menu's \
             'Restart Server' option. Check the log at \
             %LOCALAPPDATA%\\DevForge_AI\\user-data\\devforge-server.log",
        );
        return;
    }

    // 5. Server is healthy — show the window.
    log::info!("Server ready, showing main window");
    if let Some(win) = app.get_webview_window("main") {
        let _ = win.show();
        let _ = win.set_focus();
    }
}

/// Show a fatal-looking notification + log the error. Does NOT exit —
/// the user may want to fix the issue + use the tray's Restart Server.
fn show_startup_error<R: tauri::Runtime>(app: &tauri::AppHandle<R>, body: &str) {
    use tauri_plugin_notification::NotificationExt;
    log::error!("Startup error: {body}");
    let _ = app.notification().builder()
        .title("DevForge AI — Startup Problem")
        .body(body)
        .show();
}

// ---------------------------------------------------------------------------
//  Run hook: cleanup on app exit
// ---------------------------------------------------------------------------

/// Tauri calls `RunEvent::ExitRequested` when the last window closes
/// (and we didn't prevent it). We use it to:
///   1. Kill the spawned bun.exe processes (defensive — the Job Object
///      already handles this, but explicit is better).
///   2. Record whether the window was visible (for next-launch restore).
///
/// NOTE: this hook is wired via `builder.run(|app, event| ...)` — but the
/// `tauri::Builder::run` shortcut we use above doesn't take a callback.
/// For the kill-on-exit behaviour we rely on the Job Object. If you need
/// a cleaner shutdown, switch to `builder.build(app)?.run(|_handle, event| ...)`.
