# DevForge AI — Tauri 2.0 Native Desktop Wrapper

This directory contains the complete design for a Tauri 2.0 wrapper that
turns the DevForge AI Next.js app into a true native Windows desktop
application. It replaces the current Edge `--app` launcher (which shows
Edge's icon in the taskbar) with a real native shell that has its own
icon, system-tray presence, custom title bar, and minimises to tray.

## Why Tauri (not Electron)?

| | Tauri 2.0 | Electron |
|---|---|---|
| Binary size | ~12 MB | ~80-150 MB |
| Memory footprint | ~80 MB | ~200-400 MB |
| Uses system WebView | Yes (WebView2 on Win) | No (bundles Chromium) |
| Rust backend | Yes | Node.js |
| Build time (release) | ~3 min | ~30 s |
| Auto-update support | via plugin | built-in |

Tauri is the right choice here because:

1. We already have a Next.js + Bun backend — Tauri just wraps it.
2. The 12 MB shell + WebView2 keeps the installer under 60 MB.
3. Rust gives us a real `Child` handle + Job Object for the bun.exe
   process (Electron's `child_process` is more fragile on Windows).
4. The single-instance + window-state + autostart + tray features are
   all official Tauri plugins — no reinventing wheels.

## Architecture overview

```
┌─────────────────────────────────────────────────────────────────┐
│                    DevForgeAI.exe (Tauri shell)                  │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  main.rs                                                  │   │
│  │  - registers plugins (single-instance, window-state,      │   │
│  │    autostart, notification, shell, os, process, dialog)   │   │
│  │  - setup hook: build tray + spawn bun.exe + start watchdog│   │
│  │  - on_window_event: close → hide to tray                  │   │
│  │  - on_menu_event: tray menu routing                       │   │
│  │  - invoke_handler: exposes 9 commands to the frontend     │   │
│  └──────────────────────────────────────────────────────────┘   │
│           │                                                      │
│           ├─→ server.rs  ── spawns ──→ bun.exe server.js (3000)  │
│           │                 ── spawns ──→ bun.exe task-svc (3003)│
│           │                 ── health-check ─→ http://127.0.0.1:3000
│           │                 ── watchdog ──→ auto-restart on crash│
│           │                                                      │
│           ├─→ tray.rs    ── TrayIconBuilder + MenuBuilder        │
│           │                 left-click → toggle window           │
│           │                 right-click → Show/Restart/Quit menu │
│           │                                                      │
│           ├─→ window.rs   ── close-button interception           │
│           │                 #[tauri::command] API surface        │
│           │                                                      │
│           ├─→ single_instance.rs ── on_second_launch → focus win │
│           │                                                      │
│           └─→ config.rs   ── path resolution (current_exe based) │
│                              ShellConfig (persisted JSON)        │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  WebView2 window (frameless, decorations:false)           │   │
│  │  ┌────────────────────────────────────────────────────┐  │   │
│  │  │  Next.js app @ http://localhost:3000                │  │   │
│  │  │  ┌──────────────────────────────────────────────┐  │  │   │
│  │  │  │  <NativeTitleBar /> (React)                  │  │  │   │
│  │  │  │  [icon] DevForge AI            [-] [□] [×]   │  │  │   │
│  │  │  └──────────────────────────────────────────────┘  │  │   │
│  │  │  <Sidebar /> <ChatPanel /> <ImageStudio /> ...     │  │   │
│  │  └────────────────────────────────────────────────────┘  │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
│  System tray:  [DevForge icon]  →  right-click menu              │
│                                       Show DevForge AI           │
│                                       Restart Server            │
│                                       Auto-start with Windows:… │
│                                       Quit DevForge AI          │
└─────────────────────────────────────────────────────────────────┘
        │
        └── (alongside, NOT inside the .exe)
            app/         ← Next.js standalone
            runtime/     ← bun.exe
            devforge-icon.ico
            version.txt
```

## File structure

```
tauri-wrapper/
├── README.md                         ← this file
├── src-tauri/
│   ├── Cargo.toml                    ← Rust deps + release profile
│   ├── tauri.conf.json               ← window config, tray config, bundle settings
│   ├── build.rs                      ← tauri-build entry point
│   ├── icons/
│   │   └── README.md                 ← how to generate the 3 required icon files
│   ├── capabilities/
│   │   └── default.json              ← Tauri 2 permission system (allows invoke from localhost:3000)
│   └── src/
│       ├── main.rs                   ← entry point: plugin registration + setup hook
│       ├── config.rs                 ← path resolution + ShellConfig (persisted)
│       ├── server.rs                 ← Bun server spawn/kill/health-check/watchdog
│       ├── tray.rs                   ← system tray + menu + autostart toggle
│       ├── window.rs                 ← close-button interception + 9 #[tauri::command]s
│       └── single_instance.rs        ← second-launch → focus existing window
├── frontend/
│   ├── components/
│   │   └── native-title-bar.tsx      ← React component (drag region + 3 buttons)
│   ├── lib/
│   │   └── tauri-bridge.ts           ← isTauri() + typed wrappers around invoke()
│   └── styles/
│       └── native-title-bar.css      ← title-bar styling (brand dark, red close hover)
└── build/
    ├── install-rust.ps1              ← installs rustup + tauri-cli (idempotent)
    ├── build-tauri.bat               ← builds DevForgeAI.exe (~12 MB)
    └── integrate-with-installer.md   ← how to merge into devforge-setup.iss
```

## Headline features

1. **True native window** — frameless WebView2 with a custom React title
   bar. No Edge/Chrome chrome. The taskbar shows the DevForge icon, not
   Edge's.

2. **System tray** — left-click toggles window visibility, right-click
   opens Show/Restart/Auto-start/Quit menu.

3. **Minimise to tray** — clicking the × button HIDES the window
   instead of quitting. The only way to quit is via the tray menu's
   Quit entry (or Alt+F4 when `minimize_to_tray` is disabled in
   Settings).

4. **Single instance** — second launch focuses the first window + exits.
   No more "two bun.exe processes fighting over port 3000".

5. **Bun server lifecycle** — the Tauri shell spawns `bun.exe server.js`
   as a hidden child process assigned to a Windows Job Object. If
   DevForgeAI.exe dies (Task Manager, system shutdown, blue-screen),
   the OS automatically reaps the bun.exe children. No orphans.

6. **Auto-restart watchdog** — a background thread health-checks
   `http://127.0.0.1:3000` every 5 seconds. If it fails 3 times in a
   row (and we're not intentionally shutting down), the server is
   respawned. Cooldown: 1 restart per 30s to avoid crash loops.

7. **Window-state persistence** — `tauri-plugin-window-state` saves
   size + position + maximised state to `%LOCALAPPDATA%\DevForge_AI\
   user-data\.window-state`. The next launch restores them.

8. **Auto-start with Windows** (opt-in) — the tray menu's "Auto-start
   with Windows" toggle uses `tauri-plugin-autostart` to register a
   `HKCU\Software\Microsoft\Windows\CurrentVersion\Run` entry. Pure
   user-scope — no admin rights needed.

9. **Custom title bar** — the React `<NativeTitleBar />` component
   renders a 36px bar with the DevForge icon + name on the left and
   Windows-style min/max/close buttons on the right. The whole bar is
   a drag region (mousedown → `invoke('start_window_drag')` → Win32
   `WM_NCLBUTTONDOWN/HTCAPTION`). The close button is red on hover
   (Windows convention since Win95).

10. **Graceful degradation** — the same Next.js bundle runs in three
    contexts:
    - Inside the Tauri shell (full native experience)
    - Inside Edge `--app` mode (legacy launcher, fallback)
    - Inside a regular browser tab (web preview)
    
    The `<NativeTitleBar />` component renders `null` when `isTauri()`
    is false, and `lib/tauri-bridge.ts` falls back to no-ops / browser
    equivalents for every native call.

## Tauri command API (Rust → frontend)

The Next.js frontend calls these via `@tauri-apps/api/core::invoke`:

| Command               | Args                  | Returns | Purpose                            |
|-----------------------|-----------------------|---------|------------------------------------|
| `minimize_window`     | —                     | void    | Title bar [-] button               |
| `toggle_maximize`     | —                     | void    | Title bar [□] button               |
| `hide_to_tray`        | —                     | void    | Title bar [×] button (no quit!)    |
| `quit_app`            | —                     | void    | Optional title-bar Quit menu item  |
| `is_maximized`        | —                     | bool    | Toggle [□] icon (maximize vs restore)|
| `start_window_drag`   | —                     | Result  | Title bar drag region mousedown    |
| `get_app_version`     | —                     | String  | About dialog (matches APP_VERSION) |
| `set_minimize_to_tray`| `enabled: bool`       | bool    | Settings dialog toggle             |
| `restart_server`      | —                     | bool    | Settings "Restart server" button   |

All commands are `#[tauri::command]`s in `src-tauri/src/window.rs`. The
`capabilities/default.json` file grants `http://localhost:3000` the
right to invoke them (Tauri 2's permission system — without this, every
invoke would be denied).

## Build pipeline

```
[One-time setup]
  build/install-rust.ps1     → installs rustup + tauri-cli (5 min)

[Per-release build]
  build/build-tauri.bat      → cargo tauri build --no-bundle (3-8 min first time)
                                → src-tauri/target/release/devforge-ai.exe (~12 MB)

[Final installer packaging]
  installer-v2/build-silent.bat
    ├─ stages app/ + runtime/bun.exe (existing, unchanged)
    ├─ stages DevForgeAI.exe (NEW — copied from src-tauri/target/release/)
    └─ ISCC devforge-setup.iss → Output\DevForgeAI-Setup.exe (~58 MB)
```

See `build/integrate-with-installer.md` for the exact `devforge-setup.iss`
edits needed.

## What's NOT in this design (deliberate scope cuts)

1. **No Tauri-side auto-updater.** The existing Next.js-side updater
   (Task 2-A) handles updates by downloading + running the Inno Setup
   installer. We don't add `tauri-plugin-updater` because it would
   require a separate signing key + update server, and the existing
   flow already works.

2. **No custom window frame effects** (acrylic, mica, vibrancy). The
   frameless window with `shadow: true` gives us the standard Win11
   drop shadow. Acrylic/mica would require an extra crate + per-OS
   tuning. Easy to add later if jad wants the fancy look.

3. **No deep-linking** (`devforge://...` URL scheme). Not in scope;
   can be added with `tauri-plugin-deep-link` if needed.

4. **No macOS / Linux builds.** The Rust code compiles on all platforms
   (we use `#[cfg(windows)]` for the Job Object), but the spawn logic,
   tray icon, and installer are Windows-only. Adding macOS later
   requires: (a) bundling a macOS Bun binary, (b) a `.dmg` instead of
   NSIS, (c) using the system WebKit instead of WebView2.

5. **No Tauri-side persistence of user data.** All user data (settings,
   chat history, etc.) lives in the Next.js app's SQLite DB. The Tauri
   shell only persists its own `shell-config.json` (window + autostart
   prefs) + `window-state.json` (size/position).

## Risk assessment

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| WebView2 missing on Win10 | Low (Win11 has it built-in; Win10 2004+ too) | Tauri's NSIS bundle auto-downloads the bootstrapper; the existing Inno Setup installer can pre-install it |
| Rust build fails on jad's machine | Medium (first build is finicky) | `install-rust.ps1` handles MSVC detection + helpful error messages; build-tauri.bat logs every step |
| Tauri 2 API changes | Low (2.0 is stable as of 2024-10) | Pin all plugin versions in Cargo.toml; the `--locked` flag in build-tauri.bat uses the committed Cargo.lock |
| Tray icon not visible | Low | `tray.rs` falls back to a 1×1 transparent pixel + still shows the tooltip; the user can still right-click the empty slot |
| Bun server takes >30s to start | Low (current cold start ~2-3s) | `wait_for_server` has a 30s timeout + shows a tray balloon if it fails; the watchdog auto-restarts |
| Job Object doesn't reap orphans | Very Low | We also `taskkill /f /im bun.exe` in Inno Setup's `PrepareToInstall` + the watchdog kills before re-spawn |

## Next steps (for jad)

1. **Install Rust**: `powershell -ExecutionPolicy Bypass -File build/install-rust.ps1`
2. **Generate icons**: follow `src-tauri/icons/README.md` (3 files needed)
3. **Build the shell**: `build\build-tauri.bat` (produces `devforge-ai.exe`, ~12 MB)
4. **Wire into Inno Setup**: follow `build/integrate-with-installer.md`
5. **Test**: Run the new installer → DevForgeAI.exe should launch with:
   - DevForge icon in taskbar (not Edge's)
   - Tray icon with Show/Restart/Quit menu
   - Custom title bar (drag region + 3 buttons)
   - Close button hides to tray (showing a balloon first 3 times)
   - Second launch focuses the first window
6. **Roll back if needed**: revert the `[Icons]` + `[Run]` entries in
   `devforge-setup.iss` to point at `wscript start-devforge.vbs` again.
   The legacy launcher files are all still in the install.
