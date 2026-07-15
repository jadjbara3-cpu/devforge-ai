@echo off
chcp 65001 >nul 2>&1
title DevForge AI - Build Setup.exe (v2)
color 0A

REM ============================================================================
REM  DevForge AI - Single-EXE Installer Builder (v2)
REM
REM  Produces: DevForgeAI-Setup.exe (fully self-contained, works offline)
REM
REM  This script:
REM    1. Stages the standalone build + portable Bun + scripts
REM    2. Runs Inno Setup to compile everything into one setup.exe
REM    3. Outputs: Output\DevForgeAI-Setup.exe
REM ============================================================================

set "BUILDER_DIR=%~dp0"
set "PROJECT_DIR=D:\DevForge_AI\devforge-ai"
set "STAGING=%BUILDER_DIR%staging"
set "OUTPUT_DIR=%BUILDER_DIR%Output"

echo.
echo   ========================================================================
echo           DevForge AI - Single-EXE Installer Builder (v2)
echo   ========================================================================
echo.

REM --- Find Inno Setup ---
set "ISCC="
for %%P in (
    "C:\Users\jadjb\AppData\Local\Programs\Inno Setup 6\ISCC.exe"
    "C:\Program Files (x86)\Inno Setup 6\ISCC.exe"
    "C:\Program Files\Inno Setup 6\ISCC.exe"
) do (
    if exist %%P set "ISCC=%%~P"
)
if not defined ISCC (
    where iscc >nul 2>&1 && for /f "delims=" %%I in ('where iscc') do set "ISCC=%%I"
)
if not defined ISCC (
    echo   [!!] ERROR: Inno Setup (ISCC.exe) not found!
    echo       Install it from: https://jrsoftware.org/isdl.php
    pause
    exit /b 1
)
echo   [OK] Inno Setup: %ISCC%

REM --- Verify source build exists ---
if not exist "%PROJECT_DIR%\.next\standalone\server.js" (
    echo   [!!] ERROR: Standalone build not found at:
    echo       %PROJECT_DIR%\.next\standalone\server.js
    echo       Run 'bun run build' first.
    pause
    exit /b 1
)
echo   [OK] Standalone build found

if not exist "%PROJECT_DIR%\.next\standalone\.next\static" (
    echo   [!!] ERROR: Static assets not copied to standalone.
    echo       Run the copy step first.
    pause
    exit /b 1
)
echo   [OK] Static assets present

REM --- Find portable Bun ---
set "BUN_SRC="
for %%P in (
    "%USERPROFILE%\.bun\bin\bun.exe"
    "C:\Users\jadjb\.bun\bin\bun.exe"
) do (
    if exist %%P set "BUN_SRC=%%~P"
)
if not defined BUN_SRC (
    where bun >nul 2>&1 && for /f "delims=" %%I in ('where bun') do set "BUN_SRC=%%I"
)
if not defined BUN_SRC (
    echo   [!!] ERROR: bun.exe not found!
    pause
    exit /b 1
)
echo   [OK] Bun runtime: %BUN_SRC%

REM --- Clean + create staging ---
echo.
echo   [1/4] Preparing staging directory...
if exist "%STAGING%" rmdir /s /q "%STAGING%"
mkdir "%STAGING%"
mkdir "%STAGING%\app"
mkdir "%STAGING%\runtime"

REM --- Stage app (standalone build) ---
echo   [2/4] Staging standalone build (this may take a minute)...
xcopy "%PROJECT_DIR%\.next\standalone\*" "%STAGING%\app\" /E /I /Q /Y >nul
if errorlevel 1 (
    echo   [!!] Failed to stage standalone build
    pause
    exit /b 1
)
echo   [OK] App staged

REM --- Stage runtime + scripts ---
echo   [3/4] Staging runtime + scripts...
copy /y "%BUN_SRC%" "%STAGING%\runtime\bun.exe" >nul
copy /y "%BUILDER_DIR%start-devforge.bat" "%STAGING%\start-devforge.bat" >nul
copy /y "%BUILDER_DIR%start-devforge.vbs" "%STAGING%\start-devforge.vbs" >nul
copy /y "%BUILDER_DIR%run-server.cmd" "%STAGING%\run-server.cmd" >nul
copy /y "%BUILDER_DIR%stop-devforge.vbs" "%STAGING%\stop-devforge.vbs" >nul
copy /y "%BUILDER_DIR%install-logic.bat" "%STAGING%\install-logic.bat" >nul
copy /y "%BUILDER_DIR%install-logic-aumid.ps1" "%STAGING%\install-logic-aumid.ps1" >nul
copy /y "%BUILDER_DIR%devforge-icon.ico" "%STAGING%\devforge-icon.ico" >nul
copy /y "%BUILDER_DIR%README.txt" "%STAGING%\README.txt" >nul
copy /y "%BUILDER_DIR%devforge-setup.iss" "%STAGING%\devforge-setup.iss" >nul
echo   [OK] Runtime + scripts staged

REM --- Compile with Inno Setup ---
echo.
echo   [4/4] Compiling setup.exe with Inno Setup (LZMA2 Ultra)...
echo         This may take 2-5 minutes due to compression...
echo.

cd /d "%STAGING%"
"%ISCC%" devforge-setup.iss
if errorlevel 1 (
    echo.
    echo   [!!] Inno Setup compilation FAILED!
    echo       Check the output above for errors.
    pause
    exit /b 1
)

REM --- Done ---
if exist "%OUTPUT_DIR%\DevForgeAI-Setup.exe" (
    echo.
    echo   ========================================================================
    echo   [SUCCESS] setup.exe created!
    echo   ========================================================================
    echo.
    echo   Location: %OUTPUT_DIR%\DevForgeAI-Setup.exe
    for %%A in ("%OUTPUT_DIR%\DevForgeAI-Setup.exe") do echo   Size:     %%~zA bytes
    echo.
    echo   This is a SINGLE self-contained .exe that installs DevForge AI
    echo   on any Windows 10/11 x64 machine - no internet or prerequisites needed.
    echo.
    echo   Press any key to open the output folder...
    pause >nul
    explorer "%OUTPUT_DIR%"
    exit /b 0
) else (
    echo   [!!] Output file not found - check Inno Setup output
    pause
    exit /b 1
)
