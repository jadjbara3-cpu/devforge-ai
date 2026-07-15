@echo off
chcp 65001 >nul 2>&1
title DevForge AI - Release Helper
color 0B

REM ============================================================================
REM  DevForge AI - Release Helper  (release.bat)
REM
REM  Bumps the version, rebuilds setup.exe, and (optionally) creates a
REM  GitHub release with the new installer as an asset.
REM
REM  Usage:
REM    release.bat <version>           Bump + build (interactive prompts)
REM    release.bat <version> /nogit    Skip the GitHub release step
REM    release.bat <version> /nobuild  Skip rebuilding setup.exe (version bump only)
REM
REM  Example:
REM    release 1.1.0
REM
REM  What it does:
REM    1. Validates the version (X.Y.Z format)
REM    2. Updates #define MyAppVersion in devforge-setup.iss
REM    3. Updates APP_VERSION in lib\branding.ts (the source mirror)
REM    4. Runs build.bat to produce Output\DevForgeAI-Setup.exe
REM    5. (Optional) creates a Git tag + GitHub release via `gh` CLI
REM
REM  Requirements:
REM    - Inno Setup (ISCC.exe)  -> for step 4
REM    - GitHub CLI (gh.exe)    -> for step 5 (optional, skipped if absent)
REM ============================================================================

setlocal enabledelayedexpansion
set "BUILDER_DIR=%~dp0"
set "PROJECT_DIR=D:\DevForge_AI\devforge-ai"
set "ISS_FILE=%BUILDER_DIR%devforge-setup.iss"
set "BRANDING_FILE=%PROJECT_DIR%\lib\branding.ts"
set "VERSION=%~1"
set "NOGIT=0"
set "NOBUILD=0"

REM --- Parse flags ---
:parse_args
if "%~2"=="" goto args_done
if /i "%~2"=="/nogit" set "NOGIT=1"
if /i "%~2"=="/nobuild" set "NOBUILD=1"
shift
goto parse_args
:args_done

REM --- Validate version ---
if "%VERSION%"=="" (
    echo.
    echo   [!!] Usage: release.bat ^<version^> [/nogit] [/nobuild]
    echo       Example: release.bat 1.1.0
    echo.
    echo   Current versions:
    call :show_current_versions
    pause
    exit /b 1
)

REM Basic X.Y.Z validation (3 dot-separated numbers, no leading 'v')
echo %VERSION%| findstr /r "^[0-9][0-9]*\.[0-9][0-9]*\.[0-9][0-9]*$" >nul
if errorlevel 1 (
    echo.
    echo   [!!] Invalid version format: "%VERSION%"
    echo       Expected: X.Y.Z  (e.g. 1.1.0)
    echo       Don't include a leading 'v' - it's added for the git tag.
    pause
    exit /b 1
)

echo.
echo   ========================================================================
echo           DevForge AI - Release Helper
echo   ========================================================================
echo.
call :show_current_versions
echo   Target version:  v%VERSION%
echo   NoGit:           %NOGIT%
echo   NoBuild:         %NOBUILD%
echo.
echo   This will:
echo     1. Update devforge-setup.iss  ^(#define MyAppVersion^)
echo     2. Update lib\branding.ts     ^(APP_VERSION^)
if "%NOBUILD%"=="0" echo     3. Rebuild setup.exe via build.bat
if "%NOGIT%"=="0"   echo     4. Create git tag v%VERSION% + GitHub release
echo.
set /p CONFIRM="  Proceed? [y/N] "
if /i not "%CONFIRM%"=="y" (
    echo   Aborted.
    exit /b 1
)

echo.
echo   [1/4] Updating devforge-setup.iss ...
if not exist "%ISS_FILE%" (
    echo   [!!] Not found: %ISS_FILE%
    pause
    exit /b 1
)
REM Inno Setup #define line: #define MyAppVersion "1.0.0"
REM We use PowerShell for a reliable regex replacement (batch sed is painful).
powershell -NoProfile -Command ^
  "$f='%ISS_FILE%'; $c=Get-Content $f -Raw -Encoding UTF8; $n=$c -replace '#define MyAppVersion \"[0-9.]+\"', '#define MyAppVersion \"%VERSION%\"'; if($c -eq $n){Write-Host '  [!!] MyAppVersion line not found in .iss - aborting.'; exit 1}; [System.IO.File]::WriteAllText($f, $n, (New-Object System.Text.UTF8Encoding $false)); Write-Host '  [OK] devforge-setup.iss -> v%VERSION%'"
if errorlevel 1 (
    pause
    exit /b 1
)

echo.
echo   [2/4] Updating lib\branding.ts ...
if not exist "%BRANDING_FILE%" (
    echo   [!!] Not found: %BRANDING_FILE%
    echo        The source mirror may be in a different location. Edit APP_VERSION
    echo        manually in lib\branding.ts to "%VERSION%".
    echo        Continuing anyway...
) else (
    powershell -NoProfile -Command ^
      "$f='%BRANDING_FILE%'; $c=Get-Content $f -Raw -Encoding UTF8; $n=$c -replace 'export const APP_VERSION = \"[0-9.]+\";', 'export const APP_VERSION = \"%VERSION%\";'; if($c -eq $n){Write-Host '  [!!] APP_VERSION line not found in branding.ts'; exit 1}; [System.IO.File]::WriteAllText($f, $n, (New-Object System.Text.UTF8Encoding $false)); Write-Host '  [OK] lib\branding.ts -> v%VERSION%'"
    if errorlevel 1 (
        echo   [!!] Failed to update branding.ts. Edit it manually.
        pause
        exit /b 1
    )
)

if "%NOBUILD%"=="1" (
    echo.
    echo   [3/4] Skipped ^(\/nobuild^).
    goto after_build
)

echo.
echo   [3/4] Building setup.exe via build.bat ...
echo         ^(This runs bun run build + Inno Setup compilation.^)
echo.
pushd "%BUILDER_DIR%"
call build.bat
set "BUILD_RC=%ERRORLEVEL%"
popd
if not "%BUILD_RC%"=="0" (
    echo.
    echo   [!!] build.bat failed ^(exit %BUILD_RC%^).
    echo        Fix the build errors, then re-run release.bat %VERSION% /nobuild
    echo        to skip the rebuild and go straight to the GitHub step.
    pause
    exit /b %BUILD_RC%
)

set "SETUP_EXE=%BUILDER_DIR%Output\DevForgeAI-Setup.exe"
if not exist "%SETUP_EXE%" (
    echo   [!!] setup.exe not found at %SETUP_EXE%
    echo        build.bat reported success but the output is missing.
    pause
    exit /b 1
)
echo.
echo   [OK] setup.exe built: %SETUP_EXE%
for %%A in ("%SETUP_EXE%") do echo        Size: %%~zA bytes ^(~%%~zA / 1048576 MB^)

:after_build

if "%NOGIT%"=="1" (
    echo.
    echo   [4/4] Skipped ^(/nogit^).
    goto done
)

echo.
echo   [4/4] Creating GitHub release ...

REM --- Check gh CLI is available ---
set "GH_CMD="
where gh >nul 2>&1 && for /f "delims=" %%I in ('where gh') do set "GH_CMD=%%I"
if not defined GH_CMD (
    echo   [!!] GitHub CLI ^(gh^) not found on PATH.
    echo        Install it from https://cli.github.com/ then run:
    echo            gh auth login
    echo            gh release create v%VERSION% "%SETUP_EXE%" --title "v%VERSION%" --notes "..."
    echo        Or skip this step with /nogit next time.
    pause
    goto done
)

REM --- Check auth ---
"%GH_CMD%" auth status >nul 2>&1
if errorlevel 1 (
    echo   [!!] Not logged in to GitHub. Run:  gh auth login
    pause
    goto done
)

REM --- Commit the version bump ---
pushd "%PROJECT_DIR%"
git add -A 2>nul
git commit -m "chore: bump version to v%VERSION%" 2>nul
git tag -a "v%VERSION%" -m "DevForge AI v%VERSION%" 2>nul
git push origin HEAD --tags 2>nul
set "GIT_RC=%ERRORLEVEL%"
popd

if not "%GIT_RC%"=="0" (
    echo   [!!] Git push/tag failed ^(exit %GIT_RC%^). You may need to push manually:
    echo        cd /d "%PROJECT_DIR%"
    echo        git tag -a v%VERSION% -m "DevForge AI v%VERSION%"
    echo        git push origin HEAD --tags
)

REM --- Create the GitHub release with the setup.exe as an asset ---
echo.
echo   Creating GitHub release v%VERSION% with setup.exe as an asset...
echo.
set /p RELEASE_NOTES="  Release notes (one line, or Enter for default): "
if "%RELEASE_NOTES%"=="" set "RELEASE_NOTES=DevForge AI v%VERSION% - see release notes below."

if exist "%SETUP_EXE%" (
    "%GH_CMD%" release create "v%VERSION%" "%SETUP_EXE%" --title "v%VERSION%" --notes "%RELEASE_NOTES%"
) else (
    "%GH_CMD%" release create "v%VERSION%" --title "v%VERSION%" --notes "%RELEASE_NOTES%"
)
set "GH_RC=%ERRORLEVEL%"
if not "%GH_RC%"=="0" (
    echo   [!!] gh release create failed ^(exit %GH_RC%^).
    echo        You can create the release manually:
    echo            "%GH_CMD%" release create v%VERSION% "%SETUP_EXE%" --title "v%VERSION%" --notes "%RELEASE_NOTES%"
    pause
    goto done
)

echo.
echo   [OK] GitHub release v%VERSION% created with setup.exe attached.
echo        Users will see the update within ~1 hour ^(auto-check interval^).

:done
echo.
echo   ========================================================================
echo   [SUCCESS] Release v%VERSION% complete!
echo   ========================================================================
echo.
echo   Summary:
echo     - devforge-setup.iss  -> MyAppVersion = "%VERSION%"
echo     - lib\branding.ts     -> APP_VERSION  = "%VERSION%"
if "%NOBUILD%"=="0" echo     - setup.exe           -> %SETUP_EXE%
if "%NOGIT%"=="0"   echo     - GitHub release      -> v%VERSION%
echo.
echo   The installed app's auto-updater will detect this release on its next
echo   hourly check ^(or when the user clicks "Check for updates" in Settings^).
echo.
pause
exit /b 0

REM ============================================================================
REM  Subroutine: show current versions from both files
REM  Uses PowerShell for reliable regex extraction (batch string parsing of
REM  quoted values is error-prone).
REM ============================================================================
:show_current_versions
set "CUR_ISS=?"
set "CUR_BRANDING=?"
if exist "%ISS_FILE%" (
    for /f "delims=" %%v in ('powershell -NoProfile -Command "if(Test-Path '%ISS_FILE%'){$l=Get-Content '%ISS_FILE%' | Select-String '#define MyAppVersion'; if($l){$m=[regex]::Match($l,'\"([0-9.]+)\"'); if($m.Success){$m.Groups[1].Value}}}"') do set "CUR_ISS=%%v"
)
if exist "%BRANDING_FILE%" (
    for /f "delims=" %%v in ('powershell -NoProfile -Command "if(Test-Path '%BRANDING_FILE%'){$l=Get-Content '%BRANDING_FILE%' | Select-String 'export const APP_VERSION'; if($l){$m=[regex]::Match($l,'\"([0-9.]+)\"'); if($m.Success){$m.Groups[1].Value}}}"') do set "CUR_BRANDING=%%v"
)
echo   Current .iss version:     !CUR_ISS!
echo   Current branding.ts ver:  !CUR_BRANDING!
goto :eof

endlocal
exit /b 0
