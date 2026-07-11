# ============================================================================
#  DevForge AI - PowerShell Setup Script
#  Run: powershell -ExecutionPolicy Bypass -File setup.ps1
# ============================================================================

param(
    [string]$InstallDir = "D:\DevForge_AI",
    [switch]$SkipClone,
    [switch]$Help
)

$ErrorActionPreference = "Stop"

if ($Help) {
    Write-Host "DevForge AI Setup Script" -ForegroundColor Green
    Write-Host ""
    Write-Host "Usage:"
    Write-Host "  .\setup.ps1                           # Full setup to D:\DevForge_AI"
    Write-Host "  .\setup.ps1 -InstallDir C:\Projects\DF  # Custom directory"
    Write-Host "  .\setup.ps1 -SkipClone                  # Skip git clone (use existing)"
    Write-Host ""
    exit 0
}

function Write-Step($msg) { Write-Host "[SETUP] $msg" -ForegroundColor Cyan }
function Write-OK($msg)   { Write-Host "  [OK] $msg" -ForegroundColor Green }
function Write-Err($msg)  { Write-Host "  [ERR] $msg" -ForegroundColor Red }
function Write-Warn($msg) { Write-Host "  [WARN] $msg" -ForegroundColor Yellow }

# Banner
Write-Host ""
Write-Host "  ============================================" -ForegroundColor Green
Write-Host "   DevForge AI - Automated Setup (PowerShell)" -ForegroundColor Green
Write-Host "  ============================================" -ForegroundColor Green
Write-Host ""

# ── Step 1: Check prerequisites ──────────────────────────────────────────────
Write-Step "Step 1/6: Checking prerequisites..."

$prereqsOk = $true

if (Get-Command git -ErrorAction SilentlyContinue) {
    $gitVer = git --version
    Write-OK "Git: $gitVer"
} else {
    Write-Warn "Git not found. Installing via winget..."
    winget install Git.Git --accept-source-agreements --accept-package-agreements
    $prereqsOk = $false
}

if (Get-Command node -ErrorAction SilentlyContinue) {
    $nodeVer = node --version
    Write-OK "Node.js: $nodeVer"
} else {
    Write-Warn "Node.js not found. Installing via winget..."
    winget install OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements
    $prereqsOk = $false
}

if (Get-Command bun -ErrorAction SilentlyContinue) {
    $bunVer = bun --version
    Write-OK "Bun: $bunVer"
} else {
    Write-Warn "Bun not found. Installing..."
    powershell -c "irm bun.sh/install.ps1 | iex" 2>$null
    if (-not (Get-Command bun -ErrorAction SilentlyContinue)) {
        npm install -g bun 2>$null
    }
}

# Refresh PATH
$env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path", "User")

# ── Step 2: Clone repository ─────────────────────────────────────────────────
if (-not $SkipClone) {
    Write-Step "Step 2/6: Cloning DevForge AI to $InstallDir..."

    if (Test-Path $InstallDir) {
        Write-Warn "Directory exists. Overwriting..."
        Remove-Item -Recurse -Force $InstallDir
    }

    git clone https://github.com/jadjbara3-cpu/devforge-ai.git $InstallDir
    if ($LASTEXITCODE -ne 0) {
        Write-Err "Git clone failed!"
        exit 1
    }
    Write-OK "Repository cloned."
} else {
    Write-Step "Step 2/6: Skipping clone (using existing directory)"
}

# ── Step 3: Install dependencies ─────────────────────────────────────────────
Write-Step "Step 3/6: Installing dependencies..."
Set-Location $InstallDir

if (Get-Command bun -ErrorAction SilentlyContinue) {
    bun install
    if ($LASTEXITCODE -ne 0) { Write-Err "bun install failed"; exit 1 }
    Write-OK "Dependencies installed (Bun)."
} else {
    npm install
    if ($LASTEXITCODE -ne 0) { Write-Err "npm install failed"; exit 1 }
    Write-OK "Dependencies installed (npm)."
}

# ── Step 4: Database setup ───────────────────────────────────────────────────
Write-Step "Step 4/6: Setting up database..."

# Ensure db directory exists
$dbDir = Join-Path $InstallDir "db"
if (-not (Test-Path $dbDir)) {
    New-Item -ItemType Directory -Path $dbDir | Out-Null
}

# Create .env if it doesn't exist
$envFile = Join-Path $InstallDir ".env"
if (-not (Test-Path $envFile)) {
    'DATABASE_URL="file:./db/custom.db"' | Out-File -FilePath $envFile -Encoding utf8
    Write-OK ".env file created."
} else {
    Write-OK ".env file already exists."
}

if (Get-Command bun -ErrorAction SilentlyContinue) {
    bun run db:push
} else {
    npx prisma db push
}
if ($LASTEXITCODE -eq 0) {
    Write-OK "Database schema created."
} else {
    Write-Err "Database setup failed."
}

# ── Step 5: Mini-service setup ───────────────────────────────────────────────
Write-Step "Step 5/6: Setting up Task Board service..."
$taskServiceDir = Join-Path $InstallDir "mini-services\task-service"
if (Test-Path $taskServiceDir) {
    Set-Location $taskServiceDir
    if (Get-Command bun -ErrorAction SilentlyContinue) {
        bun install 2>$null
    } else {
        npm install 2>$null
    }
    Write-OK "Task Board service dependencies installed."
    Set-Location $InstallDir
}

# ── Step 6: Done ─────────────────────────────────────────────────────────────
Write-Step "Step 6/6: Setup complete!"
Write-Host ""
Write-Host "  ============================================" -ForegroundColor Green
Write-Host "   DevForge AI is ready!" -ForegroundColor Green
Write-Host "  ============================================" -ForegroundColor Green
Write-Host ""
Write-Host "  Location: $InstallDir" -ForegroundColor White
Write-Host ""
Write-Host "  Next steps:" -ForegroundColor Yellow
Write-Host "    1. Start the app:" -ForegroundColor White
Write-Host "       cd $InstallDir" -ForegroundColor Gray
Write-Host "       bun run dev" -ForegroundColor Gray
Write-Host ""
Write-Host "    2. Open http://localhost:3000 in your browser" -ForegroundColor White
Write-Host ""
Write-Host "    3. Configure your AI provider:" -ForegroundColor White
Write-Host "       Open Settings (gear icon or Ctrl+,)" -ForegroundColor Gray
Write-Host "       Enter your API key and Base URL" -ForegroundColor Gray
Write-Host ""
Write-Host "    4. (Optional) Start the Task Board service:" -ForegroundColor White
Write-Host "       cd $InstallDir\mini-services\task-service" -ForegroundColor Gray
Write-Host "       bun run dev" -ForegroundColor Gray
Write-Host ""
Write-Host "  Repository: https://github.com/jadjbara3-cpu/devforge-ai" -ForegroundColor DarkGray
Write-Host ""
