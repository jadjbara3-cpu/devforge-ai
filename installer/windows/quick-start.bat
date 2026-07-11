@echo off
REM ============================================================================
REM  DevForge AI - Quick Start (One-Click)
REM  Just run this file and follow the prompts.
REM ============================================================================
chcp 65001 >nul 2>&1
title DevForge AI - Quick Start
color 0A

echo.
echo  ╔══════════════════════════════════════════════════════════════╗
echo  ║              DevForge AI - Quick Start (1-Click)              ║
echo  ╚══════════════════════════════════════════════════════════════╝
echo.
echo  This will:
echo    1. Clone the project to D:\DevForge_AI
echo    2. Install all dependencies
echo    3. Set up the database
echo    4. Start the development server
echo.
echo  Press any key to continue, or Ctrl+C to cancel...
pause >nul

REM Run the full setup via PowerShell
powershell -ExecutionPolicy Bypass -File "%~dp0setup.ps1" -InstallDir "D:\DevForge_AI"

echo.
echo  ──────────────────────────────────────────────
echo  Setup complete! Starting DevForge AI...
echo  ──────────────────────────────────────────────
echo.

cd /d "D:\DevForge_AI"
where bun >nul 2>&1
if %errorlevel%==0 (
    bun run dev
) else (
    npm run dev
)

pause
