@echo off
REM ============================================================================
REM  DevForge AI - Debug Launcher (start-devforge.bat)
REM
REM  Visible-console variant of start-devforge.vbs. Useful for troubleshooting
REM  startup errors. Both servers open in their own console windows so you
REM  can see real-time logs.
REM
REM  For the polished "no console" experience, use the main "DevForge AI"
REM  Start Menu shortcut (which runs start-devforge.vbs).
REM
REM  Starts TWO servers:
REM    1. Task Board service  (port 3003) - "DevForge Task Service" window
REM    2. Main Next.js server (port 3000) - "DevForge AI Server" window
REM ============================================================================
setlocal
set "APP_DIR=%~dp0"
cd /d "%APP_DIR%app"

REM Set environment (port + hostname)
set PORT=3000
set HOSTNAME=127.0.0.1

echo Starting DevForge AI (Debug Mode)...
echo.
echo   Main server:  http://%HOSTNAME%:%PORT%
echo   Task service: http://%HOSTNAME%:3003
echo   Folder:       %APP_DIR%
echo.
echo   Two console windows will open:
echo     - "DevForge AI Server"    (port 3000 - main Next.js)
echo     - "DevForge Task Service" (port 3003 - Task Board Socket.io)
echo.
echo   Close this launcher window to keep the servers running.
echo   To stop everything, close both server windows (or use Stop DevForge AI).
echo.

REM --- 1. Task Board service (separate console window) ----------------------
start "DevForge Task Service" /D "%APP_DIR%app" "%APP_DIR%runtime\bun.exe" "mini-services\task-service\index.ts"

REM --- 2. Wait 2s for task-service to boot first ----------------------------
timeout /t 2 >nul

REM --- 3. Main Next.js server (separate console window) ---------------------
start "DevForge AI Server" /D "%APP_DIR%app" "%APP_DIR%runtime\bun.exe" server.js

REM --- 4. Wait for servers to boot, then open browser -----------------------
echo Waiting 5s for servers to boot...
timeout /t 5 >nul
start "" http://localhost:%PORT%

endlocal
exit /b 0
