@echo off
chcp 65001 >nul 2>&1
REM ============================================================================
REM  DevForge AI - Silent Build (no user interaction)
REM  Runs the full build pipeline and logs to build_log.txt
REM ============================================================================
set "BUILDER_DIR=%~dp0"
set "PROJECT_DIR=D:\DevForge_AI\devforge-ai"
set "STAGING=%BUILDER_DIR%staging"
set "OUTPUT_DIR=%BUILDER_DIR%Output"
set "LOG=%BUILDER_DIR%build_log.txt"

echo Build started: %DATE% %TIME% > "%LOG%"
echo. >> "%LOG%"

REM Find Inno Setup
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
    echo [ERROR] Inno Setup not found >> "%LOG%"
    exit /b 1
)
echo [OK] Inno Setup: %ISCC% >> "%LOG%"

REM Verify standalone build
if not exist "%PROJECT_DIR%\.next\standalone\server.js" (
    echo [ERROR] Standalone build not found >> "%LOG%"
    exit /b 1
)
echo [OK] Standalone build found >> "%LOG%"

REM Find Bun
set "BUN_SRC=%USERPROFILE%\.bun\bin\bun.exe"
if not exist "%BUN_SRC%" (
    where bun >nul 2>&1 && for /f "delims=" %%I in ('where bun') do set "BUN_SRC=%%I"
)
if not exist "%BUN_SRC%" (
    echo [ERROR] bun.exe not found >> "%LOG%"
    exit /b 1
)
echo [OK] Bun: %BUN_SRC% >> "%LOG%"

REM Clean staging
echo [1/5] Cleaning staging... >> "%LOG%"
if exist "%STAGING%" rmdir /s /q "%STAGING%"
mkdir "%STAGING%"
mkdir "%STAGING%\app"
mkdir "%STAGING%\runtime"
echo [OK] Staging ready >> "%LOG%"

REM Stage standalone build
echo [2/5] Staging standalone build... >> "%LOG%"
xcopy "%PROJECT_DIR%\.next\standalone\*" "%STAGING%\app\" /E /I /Q /Y >> "%LOG%" 2>&1
if errorlevel 1 (
    echo [ERROR] Failed to stage standalone >> "%LOG%"
    exit /b 1
)
echo [OK] App staged >> "%LOG%"

REM Stage task-service (Socket.io mini-service on port 3003)
echo [3/5] Staging task-service... >> "%LOG%"
set "TASK_SRC=%PROJECT_DIR%\mini-services\task-service"
if not exist "%TASK_SRC%\index.ts" (
    echo [ERROR] task-service source not found at %TASK_SRC% >> "%LOG%"
    exit /b 1
)

REM Ensure task-service dependencies are installed before staging.
REM If node_modules is missing, run `bun install` in the source folder.
if not exist "%TASK_SRC%\node_modules" (
    echo [INFO] task-service node_modules missing - running bun install... >> "%LOG%"
    pushd "%TASK_SRC%"
    "%BUN_SRC%" install >> "%LOG%" 2>&1
    popd
    if not exist "%TASK_SRC%\node_modules" (
        echo [ERROR] bun install failed for task-service >> "%LOG%"
        exit /b 1
    )
    echo [OK] task-service dependencies installed >> "%LOG%"
)

REM Stage the entire task-service folder (index.ts + package.json + node_modules)
xcopy "%TASK_SRC%\*" "%STAGING%\app\mini-services\task-service\" /E /I /Q /Y >> "%LOG%" 2>&1
if errorlevel 1 (
    echo [ERROR] Failed to stage task-service >> "%LOG%"
    exit /b 1
)
echo [OK] task-service staged >> "%LOG%"

REM Stage runtime + scripts
echo [4/5] Staging runtime + scripts... >> "%LOG%"
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
echo [OK] Scripts staged >> "%LOG%"

REM Measure staging size
for /f %%S in ('powershell -NoProfile -Command "(Get-ChildItem '%STAGING%' -Recurse -File | Measure-Object -Property Length -Sum).Sum"') do set STAGING_SIZE=%%S
echo [INFO] Staging size: %STAGING_SIZE% bytes >> "%LOG%"

REM Compile with Inno Setup
echo [5/5] Compiling with Inno Setup (LZMA2 Ultra)... >> "%LOG%"
echo       This may take several minutes... >> "%LOG%"
cd /d "%STAGING%"
"%ISCC%" devforge-setup.iss >> "%LOG%" 2>&1
if errorlevel 1 (
    echo [ERROR] Inno Setup compilation FAILED >> "%LOG%"
    exit /b 1
)

REM Check output
if exist "%OUTPUT_DIR%\DevForgeAI-Setup.exe" (
    for %%A in ("%OUTPUT_DIR%\DevForgeAI-Setup.exe") do set SETUP_SIZE=%%~zA
    echo. >> "%LOG%"
    echo ================================================================ >> "%LOG%"
    echo [SUCCESS] setup.exe created! >> "%LOG%"
    echo Location: %OUTPUT_DIR%\DevForgeAI-Setup.exe >> "%LOG%"
    echo Size: %SETUP_SIZE% bytes >> "%LOG%"
    echo ================================================================ >> "%LOG%"
    exit /b 0
) else (
    echo [ERROR] Output file not found >> "%LOG%"
    exit /b 1
)
