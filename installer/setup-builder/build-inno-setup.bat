@echo off
chcp 65001 >nul 2>&1
title DevForge AI - Professional Setup.exe Builder (Inno Setup)
color 0A

REM ============================================================================
REM  DevForge AI - Professional Setup Builder (Inno Setup)
REM
REM  This script:
REM  1. Installs Inno Setup (free, one-time)
REM  2. Compiles devforge-setup.iss into a professional setup.exe
REM  3. Output: Output\setup.exe
REM
REM  The resulting setup.exe has:
REM  - Professional GUI wizard
REM  - Desktop shortcut option
REM  - Start Menu entries
REM  - Full uninstaller
REM  - Custom install directory
REM ============================================================================

echo.
echo   ========================================================================
echo       DevForge AI - Professional Setup.exe Builder (Inno Setup)
echo   ========================================================================
echo.

set "BUILDER_DIR=%~dp0"

echo   [1/3] Checking for Inno Setup...
where iscc >nul 2>&1
if %errorlevel%==0 (
    echo         OK - Inno Setup found
) else (
    echo         [..] Inno Setup not found - installing...
    echo         Installing Inno Setup 6 (free)...
    winget install JRSoftware.InnoSetup --accept-source-agreements --accept-package-agreements
    if %errorlevel% neq 0 (
        echo         [!!] Could not install Inno Setup via winget
        echo             Please install manually from https://jrsoftware.org/isdl.php
        pause
        exit /b 1
    )
    echo         OK - Inno Setup installed
    REM Refresh PATH
    set "PATH=%PATH%;C:\Program Files (x86)\Inno Setup 6"
)

echo.
echo   [2/3] Compiling setup.exe...
echo.

REM Try common Inno Setup paths
set "ISCC="
where iscc >nul 2>&1 && set "ISCC=iscc"
if not defined ISCC (
    if exist "C:\Program Files (x86)\Inno Setup 6\ISCC.exe" (
        set "ISCC=C:\Program Files (x86)\Inno Setup 6\ISCC.exe"
    )
)
if not defined ISCC (
    if exist "C:\Program Files\Inno Setup 6\ISCC.exe" (
        set "ISCC=C:\Program Files\Inno Setup 6\ISCC.exe"
    )
)

if not defined ISCC (
    echo   [!!] ERROR: Could not find Inno Setup compiler (ISCC.exe)
    echo       Please install Inno Setup and try again.
    pause
    exit /b 1
)

cd /d "%BUILDER_DIR%"
"%ISCC%" devforge-setup.iss
if %errorlevel% neq 0 (
    echo.
    echo   [!!] Compilation failed!
    pause
    exit /b 1
)

echo.
echo   [3/3] Done!
echo.
echo   ========================================================================
echo.
echo   Professional setup.exe created at:
echo     %BUILDER_DIR%Output\setup.exe
echo.
echo   Features:
echo     - GUI wizard interface
echo     - Desktop shortcut option
echo     - Start Menu entries
echo     - Full uninstaller
echo     - Custom install directory
echo.
echo   Distribute setup.exe to any Windows computer.
echo   Users just double-click to install.
echo.
echo   ========================================================================
echo.
echo   Press any key to open the output folder...
pause >nul
explorer "%BUILDER_DIR%Output"
exit /b 0
