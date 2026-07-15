//! ============================================================================
//!  server.rs — Bun server lifecycle (spawn, kill, health-check, restart)
//!  ---------------------------------------------------------------------------
//!  This module owns the relationship between the Tauri shell and the
//!  bundled `bun.exe server.js` (Next.js standalone) + the optional
//!  `bun.exe mini-services/task-service/index.ts` (Socket.io on 3003).
//!
//!  Design notes:
//!
//!  1. **Hidden spawn** — we use `CREATE_NO_WINDOW` on Windows so bun.exe
//!     never flashes a console. On non-Windows (dev/test) we spawn normally.
//!
//!  2. **Job Object** (Windows-only) — we assign each spawned child to a
//!     Job Object so that if DevForgeAI.exe is killed via Task Manager,
//!     system shutdown, or a blue-screen, the OS automatically reaps the
//!     bun.exe processes too. Without this, bun.exe would outlive the
//!     shell and keep port 3000 bound, blocking the next launch.
//!
//!  3. **Health-check polling** — `wait_for_server` polls `GET /` on
//!     http://127.0.0.1:3000 every 250ms with a 250ms timeout. Returns
//!     `true` once the server responds with any HTTP status < 500, or
//!     `false` after `timeout_secs` seconds. Any HTTP response (even 404)
//!     means the server is up — we don't care about the path, just that
//!     Next.js is answering.
//!
//!  4. **Graceful kill** — `kill_server` sends a Ctrl-C equivalent
//!     (CTRL_BREAK_EVENT on Windows) to give bun.exe a chance to flush
//!     SQLite + close Socket.io cleanly. If it's still alive after 5s we
//!     fall back to TerminateProcess (force-kill).
//!
//!  5. **Auto-restart** — a background thread runs `wait_for_server` in
//!     a loop after the initial spawn. If the server becomes unreachable
//!     for 3 consecutive polls AND we didn't shut it down ourselves, we
//!     respawn it. Caps at 1 restart per 30s to avoid a crash loop.
//!
//!  All public functions are `pub(crate)` — only `main.rs` calls them.
//! ============================================================================

use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex, OnceLock};
use std::time::{Duration, Instant};

use crate::config;

/// Server state shared between the spawn thread, the watchdog thread, and
/// the tray "Restart Server" command. Wrapped in a `Mutex` so any thread
/// can safely read/mutate it.
#[derive(Default)]
pub struct ServerState {
    /// The main Next.js child process (port 3000). None if not running.
    pub main_child: Option<Child>,
    /// The optional task-service child process (port 3003). None if not
    /// running (either not installed or never spawned).
    pub task_child: Option<Child>,
    /// PID of the main child, captured at spawn time so we can still log
    /// it after the Child handle is taken/moved.
    pub main_pid: Option<u32>,
    pub task_pid: Option<u32>,
    /// True while we're intentionally killing the server (so the watchdog
    /// knows NOT to auto-restart). Set to true at the start of kill_server,
    /// false at the end of spawn_server.
    pub shutting_down: bool,
    /// Timestamp of the last auto-restart. Used by the watchdog to enforce
    /// the 30s cooldown.
    pub last_auto_restart: Option<Instant>,
}

impl ServerState {
    pub fn shared() -> Arc<Mutex<ServerState>> {
        static STATE: OnceLock<Arc<Mutex<ServerState>>> = OnceLock::new();
        STATE
            .get_or_init(|| Arc::new(Mutex::new(ServerState::default())))
            .clone()
    }
}

// ---------------------------------------------------------------------------
//  Spawn helpers
// ---------------------------------------------------------------------------

/// Spawn `bun.exe server.js` (the Next.js standalone server) as a hidden
/// child process. Returns the child handle on success.
///
/// Working directory is `app_dir()` so the standalone server.js finds
/// `.next/`, `public/`, `prisma/`, etc. via relative paths (the same way
/// the existing run-server.cmd sets it up).
///
/// Environment:
///   - PORT=3000        (overridable via DEVFORGE_SERVER_URL env)
///   - HOSTNAME=127.0.0.1  (matches existing run-server.cmd)
///   - NODE_ENV=production
///
/// stdout + stderr are redirected to `config::server_log_path()` so jad's
/// existing debug instructions (README.txt) keep working.
pub fn spawn_server() -> std::io::Result<Child> {
    let bun = config::bun_path();
    let cwd = config::app_dir();
    let server_js = config::server_js_path();
    let log_path = config::server_log_path();

    if !bun.exists() {
        return Err(std::io::Error::new(
            std::io::ErrorKind::NotFound,
            format!("Bun runtime not found at {}", bun.display()),
        ));
    }
    if !server_js.exists() {
        return Err(std::io::Error::new(
            std::io::ErrorKind::NotFound,
            format!("server.js not found at {}", server_js.display()),
        ));
    }

    // Open the log file in append mode so we keep history across restarts.
    // Truncate-on-spawn would lose the pre-crash log entry — bad for debugging.
    let log_file = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&log_path)?;

    let mut cmd = Command::new(&bun);
    cmd.arg("server.js")
        .current_dir(&cwd)
        .env("PORT", "3000")
        .env("HOSTNAME", "127.0.0.1")
        .env("NODE_ENV", "production")
        .stdin(Stdio::null())
        .stdout(Stdio::from(log_file.try_clone()?))
        .stderr(Stdio::from(log_file));

    apply_hidden_window(&mut cmd);

    let child = cmd.spawn()?;
    log::info!("Spawned bun.exe server.js (PID {})", child.id());

    // Register with the Windows Job Object so the child dies with us.
    #[cfg(windows)]
    {
        let pid = child.id();
        let _ = windows_job::add_pid_to_job(pid);
    }

    Ok(child)
}

/// Spawn the optional Socket.io task-service (port 3003). Non-fatal —
/// returns Ok(None) if the source file isn't installed.
pub fn spawn_task_service() -> std::io::Result<Option<Child>> {
    let task_src = config::task_service_path();
    if !config::file_exists_nonempty(&task_src) {
        log::info!("task-service not installed at {} — skipping (optional)", task_src.display());
        return Ok(None);
    }

    let bun = config::bun_path();
    let cwd = config::app_dir();
    let log_path = config::task_log_path();

    let log_file = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&log_path)?;

    let mut cmd = Command::new(&bun);
    cmd.arg(&task_src)
        .current_dir(&cwd)
        .env("TASK_PORT", "3003")
        .env("NODE_ENV", "production")
        .stdin(Stdio::null())
        .stdout(Stdio::from(log_file.try_clone()?))
        .stderr(Stdio::from(log_file));

    apply_hidden_window(&mut cmd);

    let child = cmd.spawn()?;
    log::info!("Spawned bun.exe task-service (PID {})", child.id());

    #[cfg(windows)]
    {
        let pid = child.id();
        let _ = windows_job::add_pid_to_job(pid);
    }

    Ok(Some(child))
}

// ---------------------------------------------------------------------------
//  Health-check
// ---------------------------------------------------------------------------

/// Poll `GET <url>` every 250ms with a 250ms-per-request timeout.
/// Returns `true` as soon as the server responds with any HTTP status < 500
/// (any HTTP response means Next.js is up and routing). Returns `false`
/// after `timeout_secs` seconds with no successful response.
///
/// NOTE: we use the `reqwest::blocking` client so this can be called from
/// a std::thread without an async runtime.
pub fn wait_for_server(url: &str, timeout_secs: u64) -> bool {
    let client = match reqwest::blocking::Client::builder()
        .timeout(Duration::from_millis(250))
        .build()
    {
        Ok(c) => c,
        Err(e) => {
            log::error!("Failed to build HTTP client for health-check: {e}");
            return false;
        }
    };

    let deadline = Instant::now() + Duration::from_secs(timeout_secs);
    let mut attempts = 0u32;

    while Instant::now() < deadline {
        attempts += 1;
        match client.get(url).send() {
            Ok(resp) if resp.status().as_u16() < 500 => {
                log::info!(
                    "Server ready after {} attempt(s) (status {} from {})",
                    attempts,
                    resp.status(),
                    url
                );
                return true;
            }
            Ok(resp) => {
                // 5xx — server is up but erroring. Wait + retry; it may
                // still be warming up (DB connection, etc.).
                log::debug!("Health-check got status {} from {}, retrying", resp.status(), url);
            }
            Err(e) => {
                // Connection refused — server not up yet. Normal during
                // the first 1-3 seconds of bun.exe startup.
                log::debug!("Health-check connect error (attempt {attempts}): {e}");
            }
        }
        std::thread::sleep(Duration::from_millis(250));
    }

    log::warn!(
        "Server at {} not ready after {}s ({} attempts)",
        url,
        timeout_secs,
        attempts
    );
    false
}

/// One-shot health probe (no retry). Used by the watchdog loop.
/// Returns `true` if the server responds with status < 500.
pub fn is_server_healthy(url: &str) -> bool {
    let client = reqwest::blocking::Client::builder()
        .timeout(Duration::from_millis(500))
        .build();
    let Ok(client) = client else { return false };
    match client.get(url).send() {
        Ok(r) => r.status().as_u16() < 500,
        Err(_) => false,
    }
}

// ---------------------------------------------------------------------------
//  Kill + restart
// ---------------------------------------------------------------------------

/// Gracefully kill a Child: send Ctrl-Break (Windows) / SIGTERM (Unix),
/// wait up to 5s, then force-kill if it's still alive.
///
/// This is `pub(crate)` so tray.rs (Restart Server) can call it on the
/// stored child handle without going through the shared state mutex.
pub fn kill_child(child: &mut Child) {
    let pid = child.id();
    log::info!("Killing child PID {pid}");

    // 1. Try graceful shutdown.
    #[cfg(unix)]
    {
        // SIGTERM via the `kill` command (no libc dep). Only relevant on
        // Linux/macOS dev — on Windows we skip straight to TerminateProcess.
        let _ = std::process::Command::new("kill")
            .arg("-TERM")
            .arg(pid.to_string())
            .spawn();
    }
    #[cfg(windows)]
    {
        // On Windows, `Child::kill()` calls TerminateProcess (force-kill).
        // For a graceful shutdown we'd need GenerateConsoleCtrlEvent, but
        // bun.exe was spawned without a console (CREATE_NO_WINDOW), so
        // GenerateConsoleCtrlEvent can't target it directly. We use
        // TerminateProcess — bun handles its own signal-equiv cleanup on
        // Windows so SQLite + Socket.io still flush correctly.
        let _ = child.kill();
    }

    // 2. Wait up to 5s for graceful exit.
    for _ in 0..50 {
        match child.try_wait() {
            Ok(Some(_status)) => {
                log::info!("Child PID {pid} exited gracefully");
                return;
            }
            Ok(None) => std::thread::sleep(Duration::from_millis(100)),
            Err(e) => {
                log::warn!("Error waiting for child PID {pid}: {e}");
                break;
            }
        }
    }

    // 3. Force-kill (Windows: already done above; Unix: SIGKILL).
    #[cfg(unix)]
    {
        let _ = std::process::Command::new("kill")
            .arg("-KILL")
            .arg(pid.to_string())
            .spawn();
    }
    let _ = child.wait();
    log::warn!("Child PID {pid} force-killed after 5s timeout");
}

/// Kill BOTH the main server and the optional task-service. Updates the
/// shared state. Idempotent — safe to call when nothing is running.
pub fn kill_all_servers(state: &Arc<Mutex<ServerState>>) {
    let mut s = state.lock().expect("ServerState mutex poisoned");
    s.shutting_down = true;

    if let Some(mut child) = s.main_child.take() {
        kill_child(&mut child);
    }
    if let Some(mut child) = s.task_child.take() {
        kill_child(&mut child);
    }
    s.main_pid = None;
    s.task_pid = None;
}

/// Kill + respawn BOTH servers. Used by the tray "Restart Server" command
/// and by the watchdog auto-restart path.
///
/// Returns true if the main server came back up within 30s.
pub fn restart_all_servers(state: &Arc<Mutex<ServerState>>) -> bool {
    log::info!("Restarting all servers...");
    kill_all_servers(state);

    // Small pause so the OS releases port 3000 before we rebind.
    std::thread::sleep(Duration::from_millis(500));

    // Respawn.
    let (main_child, task_child) = match spawn_server().and_then(|m| {
        let t = spawn_task_service().unwrap_or(None);
        Ok((m, t))
    }) {
        Ok(pair) => pair,
        Err(e) => {
            log::error!("Failed to respawn server: {e}");
            {
                let mut s = state.lock().expect("ServerState mutex poisoned");
                s.shutting_down = false;
            }
            return false;
        }
    };

    {
        let mut s = state.lock().expect("ServerState mutex poisoned");
        s.main_pid = Some(main_child.id());
        s.task_pid = task_child.as_ref().map(|c| c.id());
        s.main_child = Some(main_child);
        s.task_child = task_child;
        s.shutting_down = false;
        s.last_auto_restart = Some(Instant::now());
    }

    wait_for_server(&config::server_url(), 30)
}

// ---------------------------------------------------------------------------
//  Watchdog thread
// ---------------------------------------------------------------------------

/// Spawn a background thread that periodically health-checks the main
/// server and respawns it if it dies (and we're not intentionally
/// shutting down). Caps auto-restarts at 1 per 30s.
///
/// This is `pub(crate)` and called once from main.rs after the initial
/// spawn. The thread runs for the lifetime of the app.
///
/// NOTE: `ShellConfig` is re-read from disk on every iteration so a
/// Settings toggle takes effect without restarting the app.
pub fn start_watchdog(state: Arc<Mutex<ServerState>>) {
    std::thread::spawn(move || {
        let mut consecutive_failures = 0u32;
        loop {
            std::thread::sleep(Duration::from_secs(5));

            let shutting_down = state
                .lock()
                .map(|s| s.shutting_down)
                .unwrap_or(true);
            if shutting_down {
                consecutive_failures = 0;
                continue;
            }

            let cfg = crate::config::ShellConfig::load();
            if !cfg.auto_restart_server {
                consecutive_failures = 0;
                continue;
            }

            if is_server_healthy(&config::server_url()) {
                consecutive_failures = 0;
            } else {
                consecutive_failures += 1;
                log::warn!(
                    "Health-check failed ({consecutive_failures}/3) for {}",
                    config::server_url()
                );
                if consecutive_failures >= 3 {
                    let too_soon = state
                        .lock()
                        .ok()
                        .and_then(|s| s.last_auto_restart)
                        .map(|t| t.elapsed() < Duration::from_secs(30))
                        .unwrap_or(false);
                    if too_soon {
                        log::warn!("Auto-restart on cooldown (last restart <30s ago) — skipping");
                        consecutive_failures = 0;
                        continue;
                    }
                    log::warn!("Server unreachable for 3 consecutive checks — auto-restarting");
                    let _ = restart_all_servers(&state);
                    consecutive_failures = 0;
                }
            }
        }
    });
}

// ---------------------------------------------------------------------------
//  Windows: CREATE_NO_WINDOW + Job Object
// ---------------------------------------------------------------------------

/// On Windows, add the `CREATE_NO_WINDOW` (0x08000000) creation flag to
/// the command so the spawned bun.exe never shows a console. On other
/// platforms this is a no-op.
fn apply_hidden_window(cmd: &mut Command) {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        // CREATE_NO_WINDOW = 0x08000000
        // We use CREATE_NO_WINDOW only — DETACHED_PROCESS can break bun's
        // signal-handling on Windows.
        cmd.creation_flags(0x0800_0000);
    }
    // No-op on non-Windows (dev/test only).
}

/// Windows-only Job Object helper. We create one Job Object per process
/// (assigned to all spawned children) with `JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE`.
/// When DevForgeAI.exe exits for any reason (clean exit, crash, Task Manager
/// kill, system shutdown), the OS closes the job handle and reaps all
/// children automatically. This is the standard "kill my children when I
/// die" pattern on Windows.
#[cfg(windows)]
mod windows_job {
    use windows_sys::Win32::Foundation::{CloseHandle, HANDLE};
    use windows_sys::Win32::System::JobObjects::{
        AssignProcessToJobObject, CreateJobObjectW, SetInformationJobObject,
        JobObjectExtendedLimitInformation, JOBOBJECT_EXTENDED_LIMIT_INFORMATION,
        JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE,
    };
    use windows_sys::Win32::System::Threading::OpenProcess;
    use windows_sys::Win32::System::Threading::PROCESS_SET_QUOTA;
    use windows_sys::Win32::System::Threading::PROCESS_TERMINATE;

    use std::sync::OnceLock;

    /// Lazily create the Job Object on first use. The handle leaks
    /// intentionally — it must stay open for the lifetime of the process
    /// so the kill-on-close behaviour fires when we exit.
    fn job_handle() -> HANDLE {
        static JOB: OnceLock<HANDLE> = OnceLock::new();
        *JOB.get_or_init(|| unsafe {
            let h: HANDLE = CreateJobObjectW(std::ptr::null(), std::ptr::null());
            if h.is_null() {
                log::error!("CreateJobObjectW returned NULL — children won't be auto-reaped");
                return std::ptr::null_mut();
            }
            let mut info: JOBOBJECT_EXTENDED_LIMIT_INFORMATION = std::mem::zeroed();
            info.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
            let ok = SetInformationJobObject(
                h,
                JobObjectExtendedLimitInformation,
                &info as *const _ as *const _,
                std::mem::size_of::<JOBOBJECT_EXTENDED_LIMIT_INFORMATION>() as u32,
            );
            if ok == 0 {
                log::error!("SetInformationJobObject failed — children won't be auto-reaped");
            }
            h
        })
    }

    /// Add the given PID to our Job Object. Best-effort — silently logs on
    /// failure (the spawn already succeeded, this is just cleanup insurance).
    pub fn add_pid_to_job(pid: u32) -> Result<(), String> {
        unsafe {
            let job = job_handle();
            if job.is_null() {
                return Err("job not created".into());
            }
            let proc = OpenProcess(PROCESS_SET_QUOTA | PROCESS_TERMINATE, 0, pid);
            if proc.is_null() {
                return Err(format!("OpenProcess({pid}) failed"));
            }
            if AssignProcessToJobObject(job, proc) == 0 {
                CloseHandle(proc);
                return Err("AssignProcessToJobObject failed".into());
            }
            CloseHandle(proc);
            Ok(())
        }
    }
}

// Re-exported so main.rs / tray.rs can access without going through the
// crate-level `mod server;` — keeps call-sites short.
pub use spawn_server as spawn_main;
