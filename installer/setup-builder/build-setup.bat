@echo off
chcp 65001 >nul 2>&1
title DevForge AI - Setup.exe Builder
color 0A

REM ============================================================================
REM  DevForge AI - Setup.exe Builder
REM
REM  This script creates a single setup.exe file using iexpress
REM  (built into Windows, no additional software needed).
REM
REM  Usage:  Double-click this file (build-setup.bat)
REM  Output: setup.exe (in the same folder)
REM ============================================================================

echo.
echo   ========================================================================
echo              DevForge AI - Setup.exe Builder
echo   ========================================================================
echo.

REM Set paths
set "BUILDER_DIR=%~dp0"
set "OUTPUT_DIR=%BUILDER_DIR%output"
set "WORK_DIR=%TEMP%\devforge-installer-build"

REM Create output directory
if not exist "%OUTPUT_DIR%" mkdir "%OUTPUT_DIR%"

REM Clean work directory
if exist "%WORK_DIR%" rmdir /s /q "%WORK_DIR%"
mkdir "%WORK_DIR%"

echo   [1/4] Copying installer files...
copy /y "%BUILDER_DIR%install-logic.bat" "%WORK_DIR%\install-logic.bat" >nul
if not exist "%WORK_DIR%\install-logic.bat" (
    echo   [!!] ERROR: install-logic.bat not found!
    echo       Make sure this file is in the same folder as build-setup.bat
    pause
    exit /b 1
)
echo         OK

echo   [2/4] Building setup.exe with iexpress...

REM Create the SED config dynamically (to use correct paths)
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
echo FinishMessage=DevForge AI installation complete! Double-click the desktop shortcut to start.
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

REM Run iexpress (built into Windows)
iexpress /N "%SED_FILE%" 2>nul

if exist "%OUTPUT_DIR%\setup.exe" (
    echo         OK - setup.exe created
) else (
    echo   [!!] ERROR: iexpress failed to create setup.exe
    echo       Trying alternative method...
    goto ALT_METHOD
)

echo   [3/4] Verifying setup.exe...
for %%A in ("%OUTPUT_DIR%\setup.exe") do set "FILE_SIZE=%%~zA"
echo         Size: %FILE_SIZE% bytes

echo   [4/4] Done!
echo.
echo   ========================================================================
echo   setup.exe has been created at:
echo     %OUTPUT_DIR%\setup.exe
echo.
echo   You can now distribute this file to any Windows computer.
echo   Users just double-click setup.exe to install DevForge AI.
echo   ========================================================================
echo.
echo   Press any key to open the output folder...
pause >nul
explorer "%OUTPUT_DIR%"
exit /b 0

:ALT_METHOD
echo.
echo   Alternative: Using PowerShell to create the installer...
echo.

powershell -NoProfile -Command ^
  "Write-Host 'Creating self-extracting exe...';" ^
  "$batContent = Get-Content '%BUILDER_DIR%install-logic.bat' -Raw;" ^
  "$wrapper = @'" & echo.
echo   @echo off
echo   chcp 65001 ^>nul 2^>^&1
echo   set "TEMP_EXTRACT=%%TEMP%%\devforge_install_%%RANDOM%%"
echo   mkdir "%%TEMP_EXTRACT%%" 2^>nul
echo   cd /d "%%TEMP_EXTRACT%%"
echo   ^(
echo   %BAT_CONTENT%
echo   ^) > install-logic.bat
echo   cmd /c install-logic.bat
echo   cd /d "%%TEMP%%"
echo   rmdir /s /q "%%TEMP_EXTRACT%%"
echo   "'@;" ^
  "$wrapper | Out-File -FilePath '%OUTPUT_DIR%\setup.exe' -Encoding ASCII"

echo   [!!] Could not build setup.exe automatically.
echo.
echo   MANUAL METHOD:
echo   1. Copy install-logic.bat and rename it to setup.bat
echo   2. Use any BAT-to-EXE converter (free tools available online)
echo   3. Or run: iexpress (search in Start Menu) with the .sed file
echo.
pause
exit /b 1
