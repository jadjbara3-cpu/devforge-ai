# Integrating the Tauri shell with the existing Inno Setup installer

This document describes how to merge the new `DevForgeAI.exe` (Tauri shell)
into the existing **devforge-setup.iss** pipeline so the final
`DevForgeAI-Setup.exe` ships the native app instead of the Edge `--app`
launcher.

## 0. Prerequisites

1. Rust toolchain installed (`build/install-rust.ps1`).
2. Tauri shell built (`build/build-tauri.bat`) → produces
   `src-tauri/target/release/devforge-ai.exe` (~12 MB).
3. Existing installer-v2 tree at
   `D:\DevForge_AI\devforge-ai\installer\setup-builder-v2\` with:
   - `devforge-setup.iss`
   - `build-silent.bat`
   - `run-server.cmd`, `start-devforge.vbs`, etc.
   - `devforge-icon.ico`

## 1. What changes conceptually

| Before (v2 installer)              | After (v3 installer with Tauri)                     |
|------------------------------------|------------------------------------------------------|
| `wscript start-devforge.vbs` launches Edge `--app` | `DevForgeAI.exe` launches WebView2 directly       |
| Edge icon in taskbar               | DevForge icon in taskbar (true native)              |
| No tray icon                       | Tray icon with Show/Restart/Quit menu               |
| Close button kills bun + exits     | Close button minimises to tray (configurable)       |
| No window-state persistence        | Remembers size + position via window-state plugin   |
| Multiple instances possible        | Single-instance enforced                             |
| `~45 MB` installer (no shell)      | `~57 MB` installer (`+12 MB` Tauri shell)           |

The Next.js app (`app/`) + portable Bun runtime (`runtime/`) + SQLite DB
are **unchanged**. Only the launcher changes: `DevForgeAI.exe` replaces
`wscript start-devforge.vbs` as the entrypoint.

## 2. New install layout

```text
DevForge_AI/                       ← {app} in Inno Setup terms
├── DevForgeAI.exe                 ← NEW: Tauri shell (was: wscript .vbs)
├── devforge-icon.ico              ← unchanged (used by shortcuts + Tauri fallback)
├── version.txt                    ← unchanged (auto-updater reads this)
├── run-server.cmd                 ← KEPT (used by the debug launcher)
├── start-devforge.bat             ← KEPT (debug launcher: visible bun.exe console)
├── start-devforge.vbs             ← KEPT (legacy launcher — user can fall back if Tauri breaks)
├── stop-devforge.vbs              ← KEPT (manual kill helper)
├── install-logic.bat              ← unchanged
├── install-logic-aumid.ps1        ← KEPT (still registers the AUMID for the .lnk)
├── README.txt                     ← updated to mention the native shell
├── app/                           ← Next.js standalone (unchanged)
│   ├── server.js
│   ├── .next/
│   ├── public/
│   ├── prisma/
│   └── mini-services/task-service/
└── runtime/
    └── bun.exe                    ← unchanged
```

The Tauri shell's `config.rs` resolves all paths relative to
`DevForgeAI.exe`'s location, so it'll find `app/server.js` and
`runtime/bun.exe` automatically.

## 3. Edits to `devforge-setup.iss`

### 3a. Add the Tauri exe to `[Files]`

Add this entry near the top of the `[Files]` section (after the Bun
runtime entry):

```inno
; --- Native Tauri shell ----------------------------------------------------
; Built by bridge-work/tauri-wrapper/build/build-tauri.bat
; ~12 MB. Replaces wscript .vbs as the primary launcher.
Source: "DevForgeAI.exe"; DestDir: "{app}"; Flags: ignoreversion
```

### 3b. Update `[Icons]` — point at the Tauri exe, not wscript

Change the primary launcher icon entry from:

```inno
Name: "{group}\DevForge AI"; Filename: "{sys}\wscript.exe"; Parameters: """{app}\start-devforge.vbs"""; WorkingDir: "{app}"; Comment: "Launch DevForge AI"; IconFilename: "{app}\devforge-icon.ico"
```

to:

```inno
Name: "{group}\DevForge AI"; Filename: "{app}\DevForgeAI.exe"; WorkingDir: "{app}"; Comment: "Launch DevForge AI (native)"; IconFilename: "{app}\devforge-icon.ico"
```

The Desktop icon entry changes the same way. The Debug Mode entry stays
pointed at `start-devforge.bat` (we keep it for troubleshooting — it shows
the bun.exe console, useful when the server won't start).

### 3c. Update `[Run]` — launch the Tauri exe on install finish

Change the two launcher entries:

```inno
; Interactive install: optionally launch the app (only if user checked the
; "Launch DevForge AI now" task).
Filename: "{app}\DevForgeAI.exe"; WorkingDir: "{app}"; Tasks: launchnow; Flags: nowait postinstall skipifsilent

; Silent install (auto-update): ALWAYS relaunch the app after install.
Filename: "{app}\DevForgeAI.exe"; WorkingDir: "{app}"; Flags: nowait postinstall; Check: IsSilentInstall
```

### 3d. Update `[UninstallRun]` — kill DevForgeAI.exe too

Add a line to kill the Tauri shell (and any orphan bun.exe) before
uninstall:

```inno
; Kill the Tauri shell + bundled bun.exe before uninstall.
Filename: "{cmd}"; Parameters: "/c taskkill /f /im DevForgeAI.exe 2>nul"; Flags: runhidden
Filename: "{cmd}"; Parameters: "/c taskkill /f /im bun.exe 2>nul"; Flags: runhidden
```

### 3e. Update `PrepareToInstall` — kill the Tauri shell too

In the `[Code]` section, the `PrepareToInstall` function already kills
`bun.exe`. Add a `taskkill` for `DevForgeAI.exe` too:

```pascal
function PrepareToInstall(var NeedsRestart: Boolean): String;
var
  ResultCode: Integer;
begin
  NeedsRestart := False;

  // 1. Kill the Tauri shell (it spawns + owns the bun.exe processes).
  Exec(ExpandConstant('{cmd}'), '/c taskkill /f /im DevForgeAI.exe 2>nul', '',
       SW_HIDE, ewWaitUntilTerminated, ResultCode);

  // 2. Kill any orphaned bun.exe (defensive — Tauri's Job Object should
  //    have already reaped them when DevForgeAI.exe died, but if the user
  //    hard-killed the shell via taskkill /F the children may survive).
  Exec(ExpandConstant('{cmd}'), '/c taskkill /f /im bun.exe 2>nul', '',
       SW_HIDE, ewWaitUntilTerminated, ResultCode);

  // 3. Brief pause so Windows releases file handles before extraction.
  Sleep(800);

  Result := '';
end;
```

### 3f. Auto-start entry (optional)

The Tauri shell's tray menu exposes an "Auto-start with Windows: On/Off"
toggle. The autostart plugin uses `tauri-plugin-autostart`, which writes
a `HKCU\Software\Microsoft\Windows\CurrentVersion\Run` entry
automatically. No Inno Setup changes needed for this — it's purely a
runtime toggle.

If you want the installer to default-enable auto-start, add an `[Icons]`
entry in the Startup folder instead:

```inno
Name: "{userstartup}\DevForge AI"; Filename: "{app}\DevForgeAI.exe"; WorkingDir: "{app}"; IconFilename: "{app}\devforge-icon.ico"; Tasks: autostart
```

…and a `[Tasks]` entry:

```inno
Name: "autostart"; Description: "Start DevForge AI automatically when I log in"; GroupDescription: "{cm:AdditionalIcons}"; Flags: unchecked
```

(This is independent of the in-app toggle — either one is sufficient.)

## 4. Edits to `build-silent.bat`

Add a step before "Staging standalone build" to copy the Tauri exe into
the staging dir:

```bat
REM --- Stage the Tauri shell ---
echo [0/5] Staging DevForgeAI.exe (Tauri shell)... >> "%LOG%"
set "TAURI_EXE=%WRAPPER_DIR%\..\bridge-work\tauri-wrapper\src-tauri\target\release\devforge-ai.exe"
if not exist "%TAURI_EXE%" (
    echo [ERROR] Tauri shell not built. Run tauri-wrapper\build\build-tauri.bat first. >> "%LOG%"
    exit /b 1
)
copy /y "%TAURI_EXE%" "%STAGING%\DevForgeAI.exe" >nul
echo [OK] Tauri shell staged >> "%LOG%"
```

Adjust the `%WRAPPER_DIR%` reference to point at wherever you've cloned
the bridge-work tree relative to the installer-v2 dir.

## 5. What to do with the legacy launcher files

**Keep them.** The `start-devforge.vbs` + `run-server.cmd` chain is a
useful fallback if the Tauri shell ever breaks (e.g. WebView2 runtime
missing on an exotic Win10 build, or a Rust panic). The Debug Mode
shortcut in the Start Menu keeps using `start-devforge.bat` so jad can
always see the bun.exe console.

The README.txt should mention both paths:

> **Normal use**: Start Menu → DevForge AI (runs the native Tauri shell).
>
> **Troubleshooting**: Start Menu → DevForge AI (Debug Mode) — opens a
> visible bun.exe console so you can see server errors. This bypasses
> the native shell entirely.

## 6. Auto-updater compatibility

The existing auto-updater (Task 2-A) downloads a new
`DevForgeAI-Setup.exe` from GitHub Releases + runs it silently. With the
Tauri integration:

1. The updater's `installUpdate()` spawns `setup.exe /SILENT /NORESTART`.
2. Inno Setup's `PrepareToInstall` runs `taskkill /f /im DevForgeAI.exe`
   + `taskkill /f /im bun.exe` — this kills the running Tauri shell,
   which (via its Job Object) also reaps the bun.exe children.
3. Files are extracted (including the new `DevForgeAI.exe` + new
   `app/` tree).
4. `[Run]` entry gated on `IsSilentInstall` launches the new
   `DevForgeAI.exe`.
5. The new shell spawns the new bun.exe + shows the window.

No changes needed to `lib/updater.ts` — the version-comparison +
download + install flow is unchanged. The only thing the Next.js app
needs to know is that it's running inside Tauri (the `isTauri()` check
in `lib/tauri-bridge.ts` handles that).

## 7. Size budget

| Component                   | Size (compressed in installer) |
|-----------------------------|-------------------------------|
| Next.js standalone          | ~30 MB                        |
| Bun runtime (bun.exe)       | ~50 MB → ~32 MB compressed    |
| Tauri shell (DevForgeAI.exe)| ~12 MB → ~5 MB compressed     |
| SQLite DB + prisma          | ~1 MB                         |
| Misc (scripts, icons, etc.) | ~1 MB                         |
| **Total installer size**    | **~58 MB** (was ~45 MB)       |

Still well under the 100 MB threshold for a smooth download on a
residential connection, and GitHub Releases allows up to 2 GB per asset.

## 8. Rollback plan

If the Tauri shell turns out to have a critical bug after release, jad
can:

1. Edit `devforge-setup.iss` → revert the `[Icons]` + `[Run]` entries
   to point at `wscript start-devforge.vbs`.
2. Rebuild the installer.
3. Push a new GitHub release.

Users who auto-update will get the vbs-based launcher back. The Tauri
exe can stay in the install (it's only ~12 MB) — it just won't be the
default entrypoint anymore.

This is why we deliberately KEPT all the legacy launcher files in the
install layout (§2). The two paths can coexist indefinitely.
