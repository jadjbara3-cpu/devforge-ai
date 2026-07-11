@echo off
chcp 65001 >nul 2>&1
title DevForge AI - Setup
color 0A

REM ============================================================================
REM  DevForge AI - Installer Logic (packaged inside setup.exe)
REM  This script runs when the user opens setup.exe
REM ============================================================================

set "INSTALL_DIR=%LOCALAPPDATA%\DevForge_AI"
set "REPO_URL=https://github.com/jadjbara3-cpu/devforge-ai.git"

:WELCOME
cls
echo.
echo   ========================================================================
echo.
echo                    DevForge AI - Setup Wizard
echo.
echo         An all-in-one AI developer workspace
echo.
echo   ========================================================================
echo.
echo   This installer will:
echo     1. Check prerequisites (Git, Node.js, Bun)
echo     2. Install any missing prerequisites
echo     3. Download DevForge AI from GitHub
echo     4. Install all dependencies
echo     5. Set up the database
echo     6. Create desktop shortcuts
echo.
echo   Install location: %INSTALL_DIR%
echo.
echo   Press any key to continue, or close this window to cancel...
pause >nul

:CHECK_ADMIN
echo.
echo   [1/7] Checking prerequisites...
echo   ────────────────────────────────────────────────────────────────────────

REM Check Git
where git >nul 2>&1
if %errorlevel%==0 (
    echo         [OK] Git found
) else (
    echo         [..] Git not found - installing...
    winget install Git.Git --accept-source-agreements --accept-package-agreements >nul 2>&1
    if %errorlevel%==0 (
        echo         [OK] Git installed
    ) else (
        echo         [!!] Could not install Git automatically
        echo             Please install manually from https://git-scm.com
        echo             Then run setup.exe again.
        pause
        exit /b 1
    )
)

REM Check Node.js
where node >nul 2>&1
if %errorlevel%==0 (
    echo         [OK] Node.js found
) else (
    echo         [..] Node.js not found - installing...
    winget install OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements >nul 2>&1
    if %errorlevel%==0 (
        echo         [OK] Node.js installed
    ) else (
        echo         [!!] Could not install Node.js automatically
        echo             Please install manually from https://nodejs.org
        echo             Then run setup.exe again.
        pause
        exit /b 1
    )
)

REM Check Bun
where bun >nul 2>&1
if %errorlevel%==0 (
    echo         [OK] Bun found
) else (
    echo         [..] Bun not found - installing...
    call npm install -g bun >nul 2>&1
    if %errorlevel%==0 (
        echo         [OK] Bun installed
    ) else (
        echo         [!!] Could not install Bun - will use npm instead
    )
)

REM Refresh PATH
set "PATH=%PATH%;%ProgramFiles%\Git\cmd;%ProgramFiles%\nodejs;%APPDATA%\npm"

echo.
echo   [2/7] Preparing install directory...
echo   ────────────────────────────────────────────────────────────────────────

if exist "%INSTALL_DIR%" (
    echo         [..] Existing installation found at %INSTALL_DIR%
    set /p overwrite="        Overwrite? [Y/N]: "
    if /i not "%overwrite%"=="Y" (
        echo         [!!] Installation cancelled.
        pause
        exit /b 0
    )
    rmdir /s /q "%INSTALL_DIR%"
)

mkdir "%INSTALL_DIR%" 2>nul
cd /d "%INSTALL_DIR%"

echo.
echo   [3/7] Downloading DevForge AI...
echo   ────────────────────────────────────────────────────────────────────────

git clone "%REPO_URL%" "%INSTALL_DIR%" 2>&1
if %errorlevel% neq 0 (
    echo         [!!] Download failed!
    echo             Check your internet connection and try again.
    pause
    exit /b 1
)
echo         [OK] Downloaded successfully

echo.
echo   [4/7] Installing dependencies...
echo   ────────────────────────────────────────────────────────────────────────

cd /d "%INSTALL_DIR%"
where bun >nul 2>&1
if %errorlevel%==0 (
    call bun install >nul 2>&1
    if %errorlevel%==0 (
        echo         [OK] Dependencies installed (Bun)
    ) else (
        echo         [..] Bun install failed, trying npm...
        call npm install >nul 2>&1
    )
) else (
    call npm install >nul 2>&1
)

if exist "%INSTALL_DIR%\node_modules" (
    echo         [OK] Dependencies ready
) else (
    echo         [!!] Dependency installation failed
    echo             Run manually: cd "%INSTALL_DIR%" ^&^& npm install
)

echo.
echo   [5/7] Setting up database...
echo   ────────────────────────────────────────────────────────────────────────

if not exist "%INSTALL_DIR%\db" mkdir "%INSTALL_DIR%\db"

REM Create .env if it doesn't exist
if not exist "%INSTALL_DIR%\.env" (
    echo DATABASE_URL="file:./db/custom.db" > "%INSTALL_DIR%\.env"
)

where bun >nul 2>&1
if %errorlevel%==0 (
    cd /d "%INSTALL_DIR%" && call bun run db:push >nul 2>&1
) else (
    cd /d "%INSTALL_DIR%" && call npx prisma db push >nul 2>&1
)

if exist "%INSTALL_DIR%\db\custom.db" (
    echo         [OK] Database created
) else (
    echo         [!!] Database setup failed - will be created on first run
)

echo.
echo   [6/7] Setting up Task Board service...
echo   ────────────────────────────────────────────────────────────────────────

if exist "%INSTALL_DIR%\mini-services\task-service" (
    cd /d "%INSTALL_DIR%\mini-services\task-service"
    where bun >nul 2>&1
    if %errorlevel%==0 (
        call bun install >nul 2>&1
    ) else (
        call npm install >nul 2>&1
    )
    echo         [OK] Task Board service ready
)

echo.
echo   [7/7] Creating shortcuts...
echo   ────────────────────────────────────────────────────────────────────────

REM Create launcher batch file
(
echo @echo off
echo cd /d "%INSTALL_DIR%"
echo echo Starting DevForge AI...
echo start "" cmd /c "bun run dev"
echo timeout /t 5 >nul
echo start http://localhost:3000
) > "%INSTALL_DIR%\start-devforge.bat"

REM Create desktop shortcut
set "DESKTOP=%USERPROFILE%\Desktop"
set "SHORTCUT=%DESKTOP%\DevForge AI.lnk"

powershell -NoProfile -Command ^
  "$ws = New-Object -ComObject WScript.Shell; " ^
  "$sc = $ws.CreateShortcut('%SHORTCUT%'); " ^
  "$sc.TargetPath = '%INSTALL_DIR%\start-devforge.bat'; " ^
  "$sc.IconLocation = 'shell32.dll,13'; " ^
  "$sc.Description = 'Launch DevForge AI'; " ^
  "$sc.WorkingDirectory = '%INSTALL_DIR%'; " ^
  "$sc.Save()"

if exist "%SHORTCUT%" (
    echo         [OK] Desktop shortcut created
) else (
    echo         [..] Could not create desktop shortcut
)

REM Create Start Menu shortcut
set "STARTMENU=%APPDATA%\Microsoft\Windows\Start Menu\Programs\DevForge AI"
mkdir "%STARTMENU%" 2>nul
copy /y "%INSTALL_DIR%\start-devforge.bat" "%STARTMENU%\DevForge AI.bat" >nul 2>&1
echo         [OK] Start Menu entry created

echo.
echo   ========================================================================
echo.
echo                    Installation Complete!
echo.
echo   ========================================================================
echo.
echo   DevForge AI has been installed to:
echo     %INSTALL_DIR%
echo.
echo   To start the app:
echo     Double-click "DevForge AI" on your Desktop
echo   Or:
echo     Run: start-devforge.bat in the install folder
echo.
echo   The app will open at: http://localhost:3000
echo.
echo   IMPORTANT - Configure your AI provider:
echo     1. Open the app in your browser
echo     2. Press Ctrl+, (or click the gear icon)
echo     3. Enter your API key and Base URL
echo     4. Click "Save ^& Configure"
echo     5. Restart the app
echo.
echo   ────────────────────────────────────────────────────────────────────────
echo.
echo   Press any key to finish...
pause >nul
exit /b 0
