# ============================================================================
#  install-rust.ps1
#  ----------------------------------------------------------------------------
#  Installs the Rust toolchain on jad's Windows machine if it's not already
#  present, then installs the Tauri 2 CLI as a cargo subcommand.
#
#  Run from an elevated PowerShell (or just user PowerShell — rustup installs
#  to %USERPROFILE%\.cargo by default, no admin needed):
#
#      powershell -ExecutionPolicy Bypass -File install-rust.ps1
#
#  Idempotent: safe to re-run. If Rust is already installed, it just
#  updates to the latest stable + re-checks the Tauri CLI.
# ============================================================================

#Requires -Version 5.1
$ErrorActionPreference = "Stop"

function Write-Step  { param([string]$msg) Write-Host "[step] $msg" -ForegroundColor Cyan }
function Write-OK    { param([string]$msg) Write-Host "[ok]   $msg" -ForegroundColor Green }
function Write-Warn  { param([string]$msg) Write-Host "[warn] $msg" -ForegroundColor Yellow }
function Write-Err   { param([string]$msg) Write-Host "[err]  $msg" -ForegroundColor Red }

# --- 1. Check for existing rustc / cargo ----------------------------------
Write-Step "Checking for existing Rust toolchain..."
$rustc = Get-Command rustc -ErrorAction SilentlyContinue
$cargo = Get-Command cargo -ErrorAction SilentlyContinue

if ($rustc -and $cargo) {
    $version = (rustc --version) -replace "^rustc ", ""
    Write-OK "Rust $version already installed at $($rustc.Source)"
} else {
    Write-Step "Rust not found. Installing via winget (Rustlang.Rustup)..."

    # Preferred: winget (built into Windows 10 1809+ / Windows 11)
    $winget = Get-Command winget -ErrorAction SilentlyContinue
    if ($winget) {
        & winget install --id Rustlang.Rustup --source winget --accept-source-agreements --accept-package-agreements --silent
        if ($LASTEXITCODE -ne 0) {
            Write-Err "winget install Rustlang.Rustup failed (exit $LASTEXITCODE)."
            Write-Err "Fallback: download https://win.rustup.com/x86_64 and run it manually."
            exit 1
        }
        # Refresh PATH for this session so rustup / cargo work immediately.
        $env:Path = [System.Environment]::GetEnvironmentVariable("Path", "User") + ";" + [System.Environment]::GetEnvironmentVariable("Path", "Machine")
    } else {
        # Fallback: direct rustup-init.exe download (works on Win10 1809 without winget)
        Write-Warn "winget not available. Falling back to direct rustup-init.exe download."
        $installer = Join-Path $env:TEMP "rustup-init.exe"
        Write-Step "Downloading rustup-init.exe..."
        try {
            Invoke-WebRequest -Uri "https://win.rustup.com/x86_64" -OutFile $installer -UseBasicParsing
        } catch {
            Write-Err "Download failed: $_"
            Write-Err "Please download https://win.rustup.com/x86_64 manually and run it."
            exit 1
        }
        Write-Step "Running rustup-init.exe (default profile, no MSVC prompt)..."
        & $installer -y --default-toolchain stable --profile default
        if ($LASTEXITCODE -ne 0) {
            Write-Err "rustup-init failed (exit $LASTEXITCODE)."
            exit 1
        }
        # Refresh PATH
        $cargoPath = "$env:USERPROFILE\.cargo\bin"
        if ($env:Path -notlike "*$cargoPath*") {
            $env:Path += ";$cargoPath"
        }
    }

    # Verify install
    $cargo = Get-Command cargo -ErrorAction SilentlyContinue
    if (-not $cargo) {
        Write-Err "cargo still not on PATH after install. Open a NEW terminal and re-run this script."
        exit 1
    }
    $version = (rustc --version) -replace "^rustc ", ""
    Write-OK "Rust $version installed."
}

# --- 2. Ensure MSVC build tools are present -------------------------------
#  Tauri on Windows requires the MSVC ABI (link.exe + Windows SDK). The
#  VS Build Tools come with Visual Studio; rustup auto-detects them.
Write-Step "Checking for MSVC linker (link.exe)..."
$link = Get-Command link.exe -ErrorAction SilentlyContinue
if (-not $link) {
    Write-Warn "MSVC linker not found on PATH."
    Write-Warn "Tauri requires the MSVC build tools + Windows 10/11 SDK."
    Write-Warn "Install via: winget install Microsoft.VisualStudio.2022.BuildTools --override '--add Microsoft.VisualStudio.Workload.VCTools --includeRecommended'"
    Write-Warn "Or download from https://visualstudio.microsoft.com/visual-cpp-build-tools/"
    $vcInstall = Read-Host "Install VS 2022 Build Tools now via winget? (y/N)"
    if ($vcInstall -eq "y" -or $vcInstall -eq "Y") {
        & winget install --id Microsoft.VisualStudio.2022.BuildTools --source winget --accept-source-agreements --accept-package-agreements --override "--add Microsoft.VisualStudio.Workload.VCTools --includeRecommended --quiet --norestart"
        if ($LASTEXITCODE -ne 0) {
            Write-Warn "VS Build Tools install exit $LASTEXITCODE. Please install manually."
        } else {
            Write-OK "VS Build Tools installed. Restart this script after the installer finishes."
        }
    } else {
        Write-Warn "Skipping. Build will fail without MSVC."
    }
} else {
    Write-OK "MSVC linker found at $($link.Source)"
}

# --- 3. Install WebView2 preprocessor (already on Win11, optional on Win10) -
Write-Step "Checking for WebView2 runtime..."
$wv2Key = "HKLM:\SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}"
if (Test-Path $wv2Key) {
    Write-OK "WebView2 runtime installed (system-wide)."
} else {
    $wv2KeyUser = "HKCU:\Software\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}"
    if (Test-Path $wv2KeyUser) {
        Write-OK "WebView2 runtime installed (per-user)."
    } else {
        Write-Warn "WebView2 runtime not detected. Win11 has it built-in; Win10 may need it."
        Write-Warn "Tauri's NSIS bundle can auto-download the bootstrapper at install time."
        Write-Warn "Or install now: winget install Microsoft.EdgeWebView2Runtime"
    }
}

# --- 4. Install Tauri 2 CLI -----------------------------------------------
Write-Step "Installing/updating tauri-cli (cargo install)..."
& cargo install tauri-cli --version "^2.0" --locked
if ($LASTEXITCODE -ne 0) {
    Write-Err "cargo install tauri-cli failed (exit $LASTEXITCODE)."
    exit 1
}
Write-OK "tauri-cli installed."

# --- 5. Sanity check -------------------------------------------------------
Write-Step "Verifying..."
& cargo tauri --version
if ($LASTEXITCODE -ne 0) {
    Write-Err "cargo tauri --version failed. Check your PATH."
    exit 1
}

Write-OK "All set. Next step: run build-tauri.bat to compile DevForgeAI.exe."
Write-Host ""
Write-Host "  build\build-tauri.bat" -ForegroundColor White
