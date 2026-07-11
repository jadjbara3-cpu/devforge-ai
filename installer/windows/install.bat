@echo off
chcp 65001 >nul 2>&1
title DevForge AI - Setup Installer
color 0A

REM ============================================================================
REM  DevForge AI - Windows Setup Installer
REM  This script guides you through installing DevForge AI on Windows.
REM  Run as Administrator for best results.
REM ============================================================================

:MENU
cls
echo.
echo  ╔══════════════════════════════════════════════════════════════════════╗
echo  ║                    DevForge AI - Setup Installer                     ║
echo  ╠══════════════════════════════════════════════════════════════════════╣
echo  ║                                                                      ║
echo  ║  1. Check prerequisites (Node.js, Bun, Git)                         ║
echo  ║  2. Install Bun runtime                                             ║
echo  ║  3. Clone DevForge AI from GitHub                                   ║
echo  ║  4. Install dependencies                                            ║
echo  ║  5. Configure database                                              ║
echo  ║  6. Configure AI provider (API key)                                 ║
echo  ║  7. Start DevForge AI                                               ║
echo  ║  8. Run full setup (steps 1-7 automatically)                       ║
echo  ║  9. Exit                                                            ║
echo  ║                                                                      ║
echo  ╚══════════════════════════════════════════════════════════════════════╝
echo.
set /p choice="  Select option [1-9]: "

if "%choice%"=="1" goto CHECK_PREREQS
if "%choice%"=="2" goto INSTALL_BUN
if "%choice%"=="3" goto CLONE_REPO
if "%choice%"=="4" goto INSTALL_DEPS
if "%choice%"=="5" goto SETUP_DB
if "%choice%"=="6" goto CONFIG_AI
if "%choice%"=="7" goto START_APP
if "%choice%"=="8" goto FULL_SETUP
if "%choice%"=="9" goto EXIT
goto MENU

REM ---------------------------------------------------------------------------

:CHECK_PREREQS
cls
echo.
echo  [1/4] Checking Git...
where git >nul 2>&1
if %errorlevel%==0 (
    echo       ✓ Git found: 
    git --version
) else (
    echo       ✗ Git NOT found. Install from https://git-scm.com/download/win
    echo         Or run: winget install Git.Git
)
echo.
echo  [2/4] Checking Node.js...
where node >nul 2>&1
if %errorlevel%==0 (
    echo       ✓ Node.js found:
    node --version
) else (
    echo       ✗ Node.js NOT found. Install from https://nodejs.org/
    echo         Or run: winget install OpenJS.NodeJS.LTS
)
echo.
echo  [3/4] Checking Bun...
where bun >nul 2>&1
if %errorlevel%==0 (
    echo       ✓ Bun found:
    bun --version
) else (
    echo       ✗ Bun NOT found. Install with option 2 from the menu.
)
echo.
echo  [4/4] Checking npm...
where npm >nul 2>&1
if %errorlevel%==0 (
    echo       ✓ npm found:
    npm --version
) else (
    echo       ✗ npm NOT found (comes with Node.js)
)
echo.
echo  ──────────────────────────────────────────────
echo  Prerequisites check complete.
echo.
pause
goto MENU

REM ---------------------------------------------------------------------------

:INSTALL_BUN
cls
echo.
echo  Installing Bun runtime...
echo.
echo  Option A: Using PowerShell (recommended)
echo    powershell -c "irm bun.sh/install.ps1 ^| iex"
echo.
echo  Option B: Using npm
echo    npm install -g bun
echo.
echo  Installing via npm...
call npm install -g bun 2>nul
if %errorlevel%==0 (
    echo.
    echo  ✓ Bun installed successfully!
    bun --version
) else (
    echo.
    echo  ✗ npm install failed. Try manually:
    echo    powershell -c "irm bun.sh/install.ps1 ^| iex"
)
echo.
pause
goto MENU

REM ---------------------------------------------------------------------------

:CLONE_REPO
cls
echo.
echo  Cloning DevForge AI from GitHub...
echo.
set /p targetDir="  Enter target directory [D:\DevForge_AI]: "
if "%targetDir%"=="" set targetDir=D:\DevForge_AI

if exist "%targetDir%" (
    echo  Directory %targetDir% already exists.
    set /p overwrite="  Overwrite? [y/N]: "
    if /i not "%overwrite%"=="y" (
        echo  Clone cancelled.
        pause
        goto MENU
    )
    rmdir /s /q "%targetDir%"
)

echo.
echo  Cloning to %targetDir% ...
git clone https://github.com/jadjbara3-cpu/devforge-ai.git "%targetDir%"
if %errorlevel%==0 (
    echo.
    echo  ✓ Project cloned to %targetDir%
    echo.
    echo  Next steps:
    echo    cd "%targetDir%"
    echo    bun install
    echo    bun run db:push
    echo    bun run dev
) else (
    echo.
    echo  ✗ Clone failed. Check your internet connection and Git installation.
)
echo.
pause
goto MENU

REM ---------------------------------------------------------------------------

:INSTALL_DEPS
cls
echo.
set /p projectDir="  Enter project directory [D:\DevForge_AI]: "
if "%projectDir%"=="" set projectDir=D:\DevForge_AI

if not exist "%projectDir%\package.json" (
    echo  ✗ package.json not found in %projectDir%
    echo  Did you clone the repo first? (Option 3)
    pause
    goto MENU
)

echo.
echo  Installing dependencies in %projectDir% ...
cd /d "%projectDir%"

where bun >nul 2>&1
if %errorlevel%==0 (
    echo  Using Bun...
    call bun install
) else (
    echo  Bun not found, using npm...
    call npm install
)

if %errorlevel%==0 (
    echo.
    echo  ✓ Dependencies installed successfully!
) else (
    echo.
    echo  ✗ Installation failed. Try manually: bun install or npm install
)
echo.
pause
goto MENU

REM ---------------------------------------------------------------------------

:SETUP_DB
cls
echo.
set /p projectDir="  Enter project directory [D:\DevForge_AI]: "
if "%projectDir%"=="" set projectDir=D:\DevForge_AI

if not exist "%projectDir%\package.json" (
    echo  ✗ package.json not found in %projectDir%
    pause
    goto MENU
)

cd /d "%projectDir%"
echo.
echo  Setting up database schema...
where bun >nul 2>&1
if %errorlevel%==0 (
    call bun run db:push
) else (
    call npx prisma db push
)

if %errorlevel%==0 (
    echo.
    echo  ✓ Database schema created successfully!
) else (
    echo.
    echo  ✗ Database setup failed. Try manually: bun run db:push
)
echo.
pause
goto MENU

REM ---------------------------------------------------------------------------

:CONFIG_AI
cls
echo.
echo  ══════════════════════════════════════════════════════════
echo   AI Provider Configuration
echo  ══════════════════════════════════════════════════════════
echo.
echo  You can configure your AI provider in TWO ways:
echo.
echo  ─── Method 1: Via the app UI (recommended) ───────────────
echo    1. Start the app (option 7)
echo    2. Open Settings (gear icon in sidebar, or Ctrl+,)
echo    3. Enter your API key and Base URL
echo    4. Click "Save ^& Configure"
echo    5. Restart the dev server
echo.
echo  ─── Method 2: Manually edit .env ─────────────────────────
echo    1. Open the .env file in your project root
echo    2. Add these lines:
echo.
echo       AI_API_KEY=your-api-key-here
echo       AI_BASE_URL=https://api.z.ai/api/paas/v4
echo.
echo  ─── Supported providers ──────────────────────────────────
echo    • Z.ai        : https://api.z.ai/api/paas/v4
echo    • OpenAI      : https://api.openai.com/v1
echo    • Anthropic   : https://api.anthropic.com/v1
echo    • Google AI   : https://generativelanguage.googleapis.com/v1
echo    • Groq        : https://api.groq.com/openai/v1
echo    • Together AI : https://api.together.xyz/v1
echo    • Ollama      : http://localhost:11434/v1
echo.
pause
goto MENU

REM ---------------------------------------------------------------------------

:START_APP
cls
echo.
set /p projectDir="  Enter project directory [D:\DevForge_AI]: "
if "%projectDir%"=="" set projectDir=D:\DevForge_AI

if not exist "%projectDir%\package.json" (
    echo  ✗ package.json not found in %projectDir%
    pause
    goto MENU
)

cd /d "%projectDir%"
echo.
echo  ══════════════════════════════════════════════════════════
echo   Starting DevForge AI...
echo  ══════════════════════════════════════════════════════════
echo.
echo  The app will be available at: http://localhost:3000
echo  Press Ctrl+C to stop the server.
echo.
echo  Also start the Task Board service (optional):
echo    Open another terminal:
echo    cd "%projectDir%\mini-services\task-service"
echo    bun install ^&^& bun run dev
echo.
echo  ──────────────────────────────────────────────────────────
echo.

where bun >nul 2>&1
if %errorlevel%==0 (
    call bun run dev
) else (
    call npm run dev
)

pause
goto MENU

REM ---------------------------------------------------------------------------

:FULL_SETUP
cls
echo.
echo  ══════════════════════════════════════════════════════════
echo   Full Automated Setup
echo  ══════════════════════════════════════════════════════════
echo.
set /p targetDir="  Enter target directory [D:\DevForge_AI]: "
if "%targetDir%"=="" set targetDir=D:\DevForge_AI

echo.
echo  [1/6] Checking prerequisites...
where git >nul 2>&1
if %errorlevel% neq 0 (
    echo  ✗ Git not found. Installing via winget...
    winget install Git.Git --accept-source-agreements --accept-package-agreements
)

where node >nul 2>&1
if %errorlevel% neq 0 (
    echo  ✗ Node.js not found. Installing via winget...
    winget install OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements
)

where bun >nul 2>&1
if %errorlevel% neq 0 (
    echo  ✗ Bun not found. Installing via npm...
    call npm install -g bun 2>nul
)

echo  [2/6] Cloning repository...
if exist "%targetDir%" rmdir /s /q "%targetDir%"
git clone https://github.com/jadjbara3-cpu/devforge-ai.git "%targetDir%"
if %errorlevel% neq 0 (
    echo  ✗ Clone failed!
    pause
    goto MENU
)

echo  [3/6] Installing dependencies...
cd /d "%targetDir%"
where bun >nul 2>&1
if %errorlevel%==0 (
    call bun install
) else (
    call npm install
)

echo  [4/6] Setting up database...
where bun >nul 2>&1
if %errorlevel%==0 (
    call bun run db:push
) else (
    call npx prisma db push
)

echo  [5/6] Creating .env file...
if not exist ".env" (
    echo DATABASE_URL="file:./db/custom.db" > .env
    echo  ✓ .env created with default DATABASE_URL
    echo.
    echo  ──────────────────────────────────────────────────────
    echo  IMPORTANT: Configure your AI API key!
    echo  ──────────────────────────────────────────────────────
    echo  Open the app and go to Settings (Ctrl+,) to set your
    echo  AI_API_KEY and AI_BASE_URL, or edit .env manually.
    echo  ──────────────────────────────────────────────────────
) else (
    echo  .env already exists, skipping.
)

echo.
echo  [6/6] Setup complete!
echo.
echo  ══════════════════════════════════════════════════════════
echo   ✓ DevForge AI is ready!
echo  ══════════════════════════════════════════════════════════
echo.
echo  Project location: %targetDir%
echo.
echo  To start the app:
echo    cd "%targetDir%"
echo    bun run dev
echo.
echo  Then open: http://localhost:3000
echo.
echo  To configure your AI provider:
echo    Open Settings in the app (gear icon or Ctrl+,)
echo.
pause
goto MENU

REM ---------------------------------------------------------------------------

:EXIT
cls
echo.
echo  Thank you for using DevForge AI Setup!
echo.
echo  Repository: https://github.com/jadjbara3-cpu/devforge-ai
echo.
exit /b 0
