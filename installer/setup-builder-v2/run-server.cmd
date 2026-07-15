@echo off
REM ============================================================================
REM  DevForge AI - Hidden Server Wrapper  (run-server.cmd)
REM
REM  Called by start-devforge.vbs with window style 0 (SW_HIDE).
REM  Starts TWO hidden services:
REM    1. Main Next.js server (port 3000) -> devforge-server.log
REM    2. Task Board service  (port 3003) -> devforge-task-service.log
REM
REM  Both run under the bundled bun.exe and inherit the hidden window from
REM  the .vbs launcher, so nothing is ever visible to the user.
REM
REM  The task-service is OPTIONAL: if it crashes, the main app keeps working
REM  and the Task Board UI just shows "offline".
REM
REM  This script returns immediately - both bun.exe processes keep running in
REM  the background. start-devforge.vbs polls ports 3000 + 3003 and then
REM  terminates both bun.exe processes (matched by command line) when the
REM  user closes the browser window.
REM
REM  QUOTING NOTE: We use `pushd` to set the working directory, then use
REM  RELATIVE paths (..\runtime\bun.exe, mini-services\...) inside the
REM  cmd /c commands. This avoids inner quotes (which would break cmd /c
REM  parsing - cmd.exe's /c rule strips the first and last quote of the
REM  argument, so inner quotes get mangled) and works even if the install
REM  path contains spaces (e.g. C:\Users\John Doe\AppData\Local\DevForge_AI).
REM ============================================================================
setlocal
set "APP_DIR=%~dp0"
set "APP_DIR=%APP_DIR:~0,-1%"

REM Set working directory to %APP_DIR%\app. The spawned cmd.exe processes
REM inherit this CWD, so relative paths (..\runtime\bun.exe, mini-services\..)
REM resolve correctly. server.js is also found here by bun.exe.
pushd "%APP_DIR%\app"

set PORT=3000
set HOSTNAME=127.0.0.1

REM --- 1. Main Next.js server (port 3000, hidden, non-blocking) --------------
REM  - start /B            = no new window (inherits hidden parent console)
REM  - cmd /c "command"    = wrapper so output redirection applies to bun.exe
REM  - ..\runtime\bun.exe  = relative path from %APP_DIR%\app (no inner quotes)
REM  - > log 2>&1          = capture stdout+stderr to devforge-server.log
start "DevForge Main Server" /B cmd /c "..\runtime\bun.exe server.js > ..\devforge-server.log 2>&1"

REM --- 2. Task Board service (Socket.io, port 3003, hidden, non-blocking) ----
REM  Runs in the same CWD (%APP_DIR%\app) so the relative path
REM  mini-services\task-service\index.ts resolves correctly. The task-service
REM  uses in-memory storage (no DB) and gracefully handles SIGTERM/SIGINT.
start "DevForge Task Service" /B cmd /c "..\runtime\bun.exe mini-services\task-service\index.ts > ..\devforge-task-service.log 2>&1"

REM Restore working directory (cleanup only - both bun.exe processes already
REM inherited the previous CWD at the time of the `start` calls above).
popd

endlocal
exit /b 0
