@echo off
chcp 65001 >nul 2>&1
title DevForge AI - Auto Build Setup.exe
color 0A

REM ============================================================================
REM  DevForge AI - Automatic Setup.exe Builder
REM
REM  This script automatically creates setup.exe using the best available
REM  method on your Windows machine:
REM
REM  Priority 1: Inno Setup (professional GUI installer with uninstaller)
REM  Priority 2: iexpress (built into Windows, no extra software needed)
REM
REM  Just double-click this file and you'll get setup.exe
REM ============================================================================

echo.
echo   ========================================================================
echo           DevForge AI - Auto Build Setup.exe
echo   ========================================================================
echo.

set "BUILDER_DIR=%~dp0"
set "OUTPUT_DIR=%BUILDER_DIR%output"

echo   Checking available build methods...
echo.

REM Try Inno Setup first (professional)
where iscc >nul 2>&1
if %errorlevel%==0 (
    echo   [OK] Inno Setup found - building professional installer...
    goto BUILD_INNO
)

if exist "C:\Program Files (x86)\Inno Setup 6\ISCC.exe" (
    echo   [OK] Inno Setup found - building professional installer...
    goto BUILD_INNO
)

if exist "C:\Program Files\Inno Setup 6\ISCC.exe" (
    echo   [OK] Inno Setup found - building professional installer...
    goto BUILD_INNO
)

echo   [..] Inno Setup not found.
echo   Would you like to install it? (recommended - creates a better installer)
set /p installInno="    Install Inno Setup? [Y/N]: "

if /i "%installInno%"=="Y" (
    echo   Installing Inno Setup 6 (free, one-time)...
    winget install JRSoftware.InnoSetup --accept-source-agreements --accept-package-agreements
    if %errorlevel%==0 (
        echo   [OK] Inno Setup installed
        set "PATH=%PATH%;C:\Program Files (x86)\Inno Setup 6"
        goto BUILD_INNO
    ) else (
        echo   [!!] Installation failed - falling back to iexpress
        goto BUILD_IEXPRESS
    )
) else (
    echo   Using iexpress (built into Windows)...
    goto BUILD_IEXPRESS
)

:BUILD_INNO
echo.
echo   Building with Inno Setup...
echo   ────────────────────────────────────────────────────────────────────────

set "ISCC=iscc"
if exist "C:\Program Files (x86)\Inno Setup 6\ISCC.exe" (
    set "ISCC=C:\Program Files (x86)\Inno Setup 6\ISCC.exe"
)
if exist "C:\Program Files\Inno Setup 6\ISCC.exe" (
    set "ISCC=C:\Program Files\Inno Setup 6\ISCC.exe"
)

cd /d "%BUILDER_DIR%"
"%ISCC%" devforge-setup.iss
if %errorlevel%==0 (
    echo.
    echo   ========================================================================
    echo   [SUCCESS] Professional setup.exe created!
    echo   ========================================================================
    echo.
    echo   Location: %BUILDER_DIR%Output\setup.exe
    echo.
    echo   Features: GUI wizard, desktop shortcut, Start Menu, uninstaller
    echo.
    if exist "%BUILDER_DIR%Output\setup.exe" (
        for %%A in ("%BUILDER_DIR%Output\setup.exe") do echo   Size: %%~zA bytes
    )
    echo.
    echo   Press any key to open the output folder...
    pause >nul
    explorer "%BUILDER_DIR%Output"
    exit /b 0
) else (
    echo   [!!] Inno Setup compilation failed
    echo   Falling back to iexpress...
    goto BUILD_IEXPRESS
)

:BUILD_IEXPRESS
echo.
echo   Building with iexpress (built into Windows)...
echo   ────────────────────────────────────────────────────────────────────────

if not exist "%OUTPUT_DIR%" mkdir "%OUTPUT_DIR%"

set "WORK_DIR=%TEMP%\devforge-build"
if exist "%WORK_DIR%" rmdir /s /q "%WORK_DIR%"
mkdir "%WORK_DIR%"

copy /y "%BUILDER_DIR%install-logic.bat" "%WORK_DIR%\install-logic.bat" >nul

set "SED_FILE=%WORK_DIR%\build.sed"
(
echo [Version]
echo Class=IEXPRESS
echo SEDVersion=3
echo.
echo [Options]
echo PackagePurpose=InstallApp
echo ShowInstallProgramWindow=0
echo HideExtractAnimation=0
echo UseLongFileName=1
echo InsideCompressed=1
echo CAB_FixedSize=0
echo CAB_ResvCodeSigning=0
echo RebootMode=N
echo InstallPrompt=Do you want to install DevForge AI?
echo DisplayLicense=
echo FinishMessage=DevForge AI installed! Double-click the desktop shortcut to start.
echo TargetName=%OUTPUT_DIR%\setup.exe
echo FriendlyName=DevForge AI Setup
echo AppLaunched=cmd /c install-logic.bat
echo PostInstallCmd=
echo AdminQuietInstCmd=
echo UserQuietInstCmd=
echo SourceFiles=SourceFiles
echo.
echo [SourceFiles]
echo SourceFiles0=%WORK_DIR%\
echo.
echo [SourceFiles0]
echo %%FILE0%%=install-logic.bat
) > "%SED_FILE%"

iexpress /N "%SED_FILE%" 2>nul

if exist "%OUTPUT_DIR%\setup.exe" (
    echo.
    echo   ========================================================================
    echo   [SUCCESS] setup.exe created!
    echo   ========================================================================
    echo.
    echo   Location: %OUTPUT_DIR%\setup.exe
    for %%A in ("%OUTPUT_DIR%\setup.exe") do echo   Size: %%~zA bytes
    echo.
    echo   Press any key to open the output folder...
    pause >nul
    explorer "%OUTPUT_DIR%"
    exit /b 0
) else (
    echo.
    echo   [!!] ERROR: Could not create setup.exe
    echo.
    echo   Manual fallback:
    echo   1. Copy install-logic.bat to any Windows PC
    echo   2. Rename to setup.bat
    echo   3. Use any free BAT-to-EXE converter
    echo.
    pause
    exit /b 1
)
