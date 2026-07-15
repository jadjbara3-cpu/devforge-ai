@echo off
REM ============================================================================
REM  DevForge AI - Post-Install Configuration
REM
REM  Runs after Inno Setup extracts files. Creates the .env file with an
REM  ABSOLUTE database path so Prisma can find the SQLite DB reliably, and
REM  writes the installed version to version.txt (read by the app's auto-
REM  updater as the authoritative current-version source).
REM
REM  Usage: install-logic.bat <INSTALL_DIR> [VERSION]
REM
REM    VERSION  - the version string (e.g. "1.0.0"). When omitted, we try to
REM               read it from the HKCU\Software\DevForge_AI\Version registry
REM               value (written by Inno Setup's [Registry] section). If that
REM               also fails, version.txt is not written and the app falls
REM               back to the compiled-in APP_VERSION from lib/branding.ts.
REM ============================================================================
setlocal enabledelayedexpansion
chcp 65001 >nul 2>&1

set "INSTALL_DIR=%~1"
if "%INSTALL_DIR%"=="" set "INSTALL_DIR=%~dp0"
set "INSTALL_DIR=%INSTALL_DIR:~0,-1%"

set "APP_DIR=%INSTALL_DIR%\app"
set "DB_DIR=%APP_DIR%\prisma\db"

REM Ensure DB directory exists
if not exist "%DB_DIR%" mkdir "%DB_DIR%"

REM Build absolute path to the SQLite DB (forward-slash format for Prisma)
set "DB_PATH=%DB_DIR%\custom.db"
set "DB_PATH=%DB_PATH:\=/%"

REM Write .env file with absolute DATABASE_URL
> "%APP_DIR%\.env" echo DATABASE_URL="file:%DB_PATH%"

REM ============================================================================
REM  Write version.txt (authoritative current-version marker for the auto-
REM  updater). The version comes from %2 (passed by Inno Setup) or, as a
REM  fallback, from the registry value written by the [Registry] section.
REM ============================================================================
set "APP_VERSION=%~2"
if "%APP_VERSION%"=="" (
    REM Try the registry (set by Inno Setup [Registry] section).
    for /f "tokens=2,*" %%A in ('reg query "HKCU\Software\DevForge_AI" /v Version 2^>nul ^| findstr /i "Version"') do (
        set "APP_VERSION=%%B"
    )
)
if not "%APP_VERSION%"=="" (
    > "%INSTALL_DIR%\version.txt" echo %APP_VERSION%
    echo Installed version: %APP_VERSION%
) else (
    echo WARNING: Could not determine installed version. version.txt not written.
    echo          The app will fall back to the compiled-in APP_VERSION.
)

REM Ensure the DB file exists (copy from template if missing)
if not exist "%DB_DIR%\custom.db" (
    if exist "%APP_DIR%\prisma\db\custom.db" (
        copy /y "%APP_DIR%\prisma\db\custom.db" "%DB_DIR%\custom.db" >nul 2>&1
    )
)

REM Create a "stop" script for convenience
> "%INSTALL_DIR%\stop-devforge.bat" echo @echo off
>> "%INSTALL_DIR%\stop-devforge.bat" echo taskkill /f /im bun.exe 2^>nul
>> "%INSTALL_DIR%\stop-devforge.bat" echo echo DevForge AI stopped.
>> "%INSTALL_DIR%\stop-devforge.bat" echo timeout /t 2 ^>nul

REM ============================================================================
REM  Register the AppUserModelID (AUMID) + create branded shortcuts.
REM
REM  This makes the Windows taskbar show the DevForge icon (instead of Edge's)
REM  and groups the app window separately from any other Edge windows. The PS
REM  script:
REM    - Writes HKCU\Software\Classes\AppUserModelId\DevForge.AI.JadJbara
REM      (DisplayName + IconUri)
REM    - Creates Start Menu + Desktop + brand-folder .lnk shortcuts that launch
REM      wscript.exe with our VBS
REM    - Stamps System.AppUserModel.ID onto each .lnk via the IPropertyStore
REM      COM interface so the taskbar remembers the AUMID on relaunch
REM
REM  Combined with the `--app-user-model-id=DevForge.AI.JadJbara` flag passed
REM  to msedge.exe in start-devforge.vbs, this gives DevForge its own taskbar
REM  identity on Windows 10 (1809+) and Windows 11.
REM
REM  We pass -SkipDesktop because Inno Setup's [Icons] section already created
REM  the desktop shortcut (when the user opted in via the desktopicon task).
REM ============================================================================
set "PS_SCRIPT=%INSTALL_DIR%\install-logic-aumid.ps1"
if exist "%PS_SCRIPT%" (
    echo Registering DevForge AppUserModelID ^& shortcuts...
    powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "%PS_SCRIPT%" -InstallDir "%INSTALL_DIR%" -SkipDesktop
    if errorlevel 1 (
        echo WARNING: AUMID registration reported a non-zero exit code. ^(Non-fatal.^)
        echo          The app will still run; the taskbar may show Edge's icon.
    )
) else (
    echo WARNING: install-logic-aumid.ps1 not found at %PS_SCRIPT%
    echo          Skipping AUMID registration. Taskbar will show Edge's icon.
)

endlocal
exit /b 0
