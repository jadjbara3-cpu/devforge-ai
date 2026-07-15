@echo off
chcp 65001 >nul 2>&1
REM ============================================================================
REM  build-tauri.bat
REM  ----------------------------------------------------------------------------
REM  Builds the DevForge AI native shell (DevForgeAI.exe) using Tauri 2.
REM
REM  Prerequisites (install-rust.ps1 handles all of these):
REM    - Rust stable toolchain (rustup)
REM    - MSVC build tools + Windows 10/11 SDK
REM    - cargo tauri-cli (v2)
REM    - WebView2 runtime (only needed at RUNTIME, not build time)
REM
REM  Output:
REM    src-tauri\target\release\devforge-ai.exe       (~12 MB)
REM    src-tauri\target\release\bundle\nsis\*.exe     (NSIS installer — we don't
REM                                                    use this; Inno Setup is
REM                                                    our final wrapper.)
REM
REM  After this script finishes, copy devforge-ai.exe to the staging dir
REM  as DevForgeAI.exe and let Inno Setup bundle it with the rest of the
REM  app + runtime. See integrate-with-installer.md for the full pipeline.
REM ============================================================================

setlocal enabledelayedexpansion

set "WRAPPER_DIR=%~dp0.."
set "SRC_TAURI_DIR=%WRAPPER_DIR%\src-tauri"
set "LOG=%WRAPPER_DIR%\build\build-tauri.log"
set "OUTPUT_EXE=%SRC_TAURI_DIR%\target\release\devforge-ai.exe"

echo Build started: %DATE% %TIME% > "%LOG%"
echo. >> "%LOG%"

REM --- 1. Verify prerequisites ----------------------------------------------
echo [1/5] Verifying prerequisites... >> "%LOG%"

where cargo >nul 2>&1
if errorlevel 1 (
    echo [ERROR] cargo not found on PATH. >> "%LOG%"
    echo [ERROR] Run install-rust.ps1 first. >> "%LOG%"
    echo Run install-rust.ps1 first.
    exit /b 1
)

where rustc >nul 2>&1
if errorlevel 1 (
    echo [ERROR] rustc not found on PATH. >> "%LOG%"
    exit /b 1
)

echo [OK] Rust toolchain: >> "%LOG%"
rustc --version >> "%LOG%" 2>&1
cargo --version >> "%LOG%" 2>&1

REM --- 2. Verify tauri-cli is installed -------------------------------------
echo [2/5] Checking tauri-cli... >> "%LOG%"
cargo tauri --version >nul 2>&1
if errorlevel 1 (
    echo [WARN] tauri-cli not found. Installing... >> "%LOG%"
    cargo install tauri-cli --version "^2.0" --locked >> "%LOG%" 2>&1
    if errorlevel 1 (
        echo [ERROR] Failed to install tauri-cli. >> "%LOG%"
        exit /b 1
    )
)
echo [OK] turi-cli ready >> "%LOG%"

REM --- 3. Verify icons are present ------------------------------------------
REM  Tauri's build.rs requires the icons referenced in tauri.conf.json
REM  to exist. If they're missing, the build fails with a confusing error.
echo [3/5] Verifying icons... >> "%LOG%"
for %%F in (
    "%SRC_TAURI_DIR%\icons\icon.ico"
    "%SRC_TAURI_DIR%\icons\icon.png"
    "%SRC_TAURI_DIR%\icons\tray-icon.png"
) do (
    if not exist %%F (
        echo [ERROR] Missing icon: %%F >> "%LOG%"
        echo Missing icon: %%F
        echo Generate icons first — see icons\README.md
        exit /b 1
    )
)
echo [OK] Icons present >> "%LOG%"

REM --- 4. Build the Tauri app -----------------------------------------------
REM  `cargo tauri build` does:
REM    a. cargo build --release (compiles Rust)
REM    b. tauri-build (generates context, embeds icons, etc.)
REM    c. NSIS bundling (we don't use the NSIS output, but Tauri insists
REM       on creating it — it's harmless, just a few extra MB of build
REM       time. To skip it, edit tauri.conf.json: bundle.targets = [])
REM
REM  We pass --no-bundle to skip step (c) — we don't ship Tauri's NSIS
REM  installer, our final wrapper is Inno Setup (devforge-setup.iss).
echo [4/5] Building Tauri app (this takes 3-8 minutes on first build)... >> "%LOG%"
echo Building... (first build downloads ~500MB of crates; subsequent builds ~30s)
pushd "%SRC_TAURI_DIR%"
cargo tauri build --no-bundle >> "%LOG%" 2>&1
set "BUILD_EXIT=%errorlevel%"
popd
if not "%BUILD_EXIT%"=="0" (
    echo [ERROR] cargo tauri build failed (exit %BUILD_EXIT%). >> "%LOG%"
    echo Build failed. Check %LOG% for details.
    exit /b %BUILD_EXIT%
)
echo [OK] Build complete >> "%LOG%"

REM --- 5. Verify output + report size --------------------------------------
echo [5/5] Verifying output... >> "%LOG%"
if not exist "%OUTPUT_EXE%" (
    echo [ERROR] Expected output not found: %OUTPUT_EXE% >> "%LOG%"
    exit /b 1
)

for %%A in ("%OUTPUT_EXE%") do set EXE_SIZE=%%~zA
set /a EXE_MB=%EXE_SIZE% / 1048576

echo. >> "%LOG%"
echo ================================================================ >> "%LOG%"
echo [SUCCESS] DevForgeAI.exe built! >> "%LOG%"
echo Location: %OUTPUT_EXE% >> "%LOG%"
echo Size:     %EXE_SIZE% bytes (%EXE_MB% MB) >> "%LOG%"
echo ================================================================ >> "%LOG%"
echo.
echo ================================================================
echo  DevForgeAI.exe built successfully!
echo  Location: %OUTPUT_EXE%
echo  Size:     %EXE_MB% MB
echo ================================================================
echo.
echo Next step: integrate with the existing Inno Setup installer.
echo See: build\integrate-with-installer.md
echo.

exit /b 0
