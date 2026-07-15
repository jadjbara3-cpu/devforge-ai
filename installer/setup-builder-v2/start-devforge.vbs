' ============================================================================
'  DevForge AI - Desktop Launcher  (start-devforge.vbs)
'  ---------------------------------------------------------------------------
'  Spawns the bundled Bun servers HIDDEN (no console window at all), then opens
'  a frameless app-like window via Edge/Chrome --app mode (no URL bar, no tabs,
'  no bookmarks bar). When the user closes that window, the hidden Bun servers
'  are terminated automatically.
'
'  This script is run by wscript.exe (the default .vbs association), which is
'  a GUI host - so no console is ever shown.
'
'  This launcher starts TWO hidden services via run-server.cmd:
'    1. Main Next.js server  - http://localhost:3000  (required)
'    2. Task Board service   - http://localhost:3003  (Socket.io, optional)
'
'  The task-service is OPTIONAL: if it fails to start, the main app still
'  works and the Task Board UI just shows "offline".
' ============================================================================
Option Explicit

Dim fso, shell
Dim appDir, bunPath, port, url, taskPort, taskUrl, profileDir, logPath, taskLogPath
Dim edgePath, chromePath, browserPath, browserName, browserCmd
Dim http, ready, taskReady, attempts

Set fso    = WScript.CreateObject("Scripting.FileSystemObject")
Set shell  = WScript.CreateObject("WScript.Shell")

' --- 1. Resolve paths -------------------------------------------------------
appDir      = fso.GetParentFolderName(WScript.ScriptFullName)
bunPath     = appDir & "\runtime\bun.exe"
port        = "3000"
url         = "http://localhost:" & port
taskPort    = "3003"
taskUrl     = "http://localhost:" & taskPort
profileDir  = shell.ExpandEnvironmentStrings("%LOCALAPPDATA%") & "\DevForge_AI\edge-profile"
logPath     = appDir & "\devforge-server.log"
taskLogPath = appDir & "\devforge-task-service.log"

If Not fso.FileExists(bunPath) Then
    MsgBox "DevForge runtime not found:" & vbCrLf & bunPath & vbCrLf & vbCrLf & _
           "Please reinstall DevForge AI.", vbCritical, "DevForge AI"
    WScript.Quit 1
End If

' --- 2. Is the server already up? ------------------------------------------
ready = False
On Error Resume Next
Set http = WScript.CreateObject("MSXML2.XMLHTTP")
http.Open "GET", url, False
http.Send
If Err.Number = 0 And http.Status < 500 Then ready = True
On Error Goto 0

' --- 3. If not, start BOTH servers HIDDEN via run-server.cmd ----------------
'  run-server.cmd launches:
'    - bun.exe server.js                        (main Next.js, port 3000)
'    - bun.exe mini-services\task-service\index.ts  (Socket.io, port 3003)
'  Both inherit the hidden window from this launcher.
If Not ready Then
    If Not fso.FileExists(appDir & "\run-server.cmd") Then
        MsgBox "Helper script missing:" & vbCrLf & appDir & "\run-server.cmd", _
               vbCritical, "DevForge AI"
        WScript.Quit 1
    End If

    ' Window style 0 = SW_HIDE  -> no console visible at all.
    ' bWaitOnReturn = False     -> don't block the launcher.
    ' run-server.cmd returns immediately - both bun.exe processes keep running.
    shell.Run """" & appDir & "\run-server.cmd""", 0, False

    ' Poll http://localhost:3000 until the MAIN server responds (max ~20s).
    ' This is REQUIRED - if the main server doesn't come up, we abort.
    ready = False
    For attempts = 1 To 40
        On Error Resume Next
        Set http = WScript.CreateObject("MSXML2.XMLHTTP")
        http.Open "GET", url, False
        http.Send
        If Err.Number = 0 And http.Status < 500 Then
            ready = True
            On Error Goto 0
            Exit For
        End If
        On Error Goto 0
        WScript.Sleep 500
    Next

    If Not ready Then
        MsgBox "DevForge server failed to start within 20 seconds." & vbCrLf & vbCrLf & _
               "Troubleshooting:" & vbCrLf & _
               "  - Use 'DevForge AI (Debug Mode)' in the Start Menu to see errors." & vbCrLf & _
               "  - Check the log: " & logPath & vbCrLf & _
               "  - Make sure port " & port & " is not already in use.", _
               vbExclamation, "DevForge AI"
        WScript.Quit 1
    End If

    ' Poll http://localhost:3003 for the task-service (max ~10s, OPTIONAL).
    ' If it fails to start, we still open the browser - the Task Board UI
    ' will just show "offline". Non-fatal.
    taskReady = False
    For attempts = 1 To 20
        On Error Resume Next
        Set http = WScript.CreateObject("MSXML2.XMLHTTP")
        http.Open "GET", taskUrl, False
        http.Send
        If Err.Number = 0 And http.Status < 500 Then
            taskReady = True
            On Error Goto 0
            Exit For
        End If
        On Error Goto 0
        WScript.Sleep 500
    Next
    ' Silently ignore task-service failures - it's optional. Log file at
    ' taskLogPath will contain any error details for troubleshooting.
End If

' --- 4. Choose browser: Edge > Chrome > default ----------------------------
edgePath = "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
If Not fso.FileExists(edgePath) Then _
    edgePath = "C:\Program Files\Microsoft\Edge\Application\msedge.exe"

chromePath = "C:\Program Files\Google\Chrome\Application\chrome.exe"
If Not fso.FileExists(chromePath) Then _
    chromePath = "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"

If fso.FileExists(edgePath) Then
    browserPath = edgePath
    browserName = "msedge.exe"
ElseIf fso.FileExists(chromePath) Then
    browserPath = chromePath
    browserName = "chrome.exe"
Else
    ' Last-resort fallback: system default browser (loses --app window).
    shell.Run url
    MsgBox "DevForge is open in your default browser." & vbCrLf & _
           "Install Microsoft Edge or Google Chrome for a true desktop-app experience.", _
           vbInformation, "DevForge AI"
    ' Do NOT kill bun - the user still has the page open in their browser.
    WScript.Quit 0
End If

' --- 5. Launch the browser in --app mode -----------------------------------
'  --app=URL              : kiosk-like window: no tabs, no URL bar, no bookmarks
'  --user-data-dir        : isolated profile so DevForge never touches the user's
'                            browser session, history, or extensions
'  --window-size / -pos   : initial geometry (window is still resizable)
'  --no-first-run         : skip first-run / welcome tour
'  --no-default-browser-check
'  --disable-extensions   : cleaner, faster startup; avoids extension popups
'  --disable-background-mode : process exits when the app window closes
'  --disable-features=... : silence various Edge promo/welcome popups
'  --app-auto-launched    : hides the "open in browser" hint
'  --app-user-model-id    : tells Windows this window belongs to "DevForge AI"
'                            (NOT Edge). Combined with the matching registry
'                            entry at HKCU\Software\Classes\AppUserModelId\
'                            DevForge.AI.JadJbara (created by install-logic-
'                            aumid.ps1), this makes the taskbar show the
'                            DevForge icon + group the window separately from
'                            any other Edge windows. Supported by both Edge
'                            and Chrome (Chromium >= 88).
Const AUMID = "DevForge.AI.JadJbara"
browserCmd = """" & browserPath & """" _
    & " --app=" & url _
    & " --user-data-dir=""" & profileDir & """" _
    & " --window-size=1440,900" _
    & " --window-position=120,80" _
    & " --no-first-run" _
    & " --no-default-browser-check" _
    & " --disable-extensions" _
    & " --disable-background-mode" _
    & " --disable-features=msEdgeWelcomeFLX,msEdgeEDU,TranslateUI,EdgeSidebar" _
    & " --app-auto-launched" _
    & " --app-user-model-id=" & AUMID

shell.Run browserCmd, 1, False     ' 1 = normal window, False = don't block

' --- 6. Wait until the --app window is closed ------------------------------
'  We poll WMI for any browser process whose command line contains our
'  --app=URL flag. With --disable-background-mode, that process exits as soon
'  as the user closes the window.
WScript.Sleep 1500                 ' let Edge register its process
Do While IsAppRunning(browserName)
    WScript.Sleep 1000
Loop

' --- 7. Cleanup: kill both bun.exe processes (main + task-service) ---------
KillBun
WScript.Quit 0


' ============================================================================
'  Helpers
' ============================================================================

' True if a browser process with our --app URL is still alive.
Function IsAppRunning(procName)
    Dim wmi, procs, p, cmd
    IsAppRunning = False
    On Error Resume Next
    Set wmi = GetObject("winmgmts:\\.\root\cimv2")
    Set procs = wmi.ExecQuery( _
        "SELECT * FROM Win32_Process WHERE Name='" & procName & "'")
    For Each p In procs
        cmd = ""
        cmd = p.CommandLine
        If InStr(1, cmd, "--app=" & url, 1) > 0 Then
            IsAppRunning = True
            Exit Function
        End If
    Next
    On Error Goto 0
End Function

' Terminate the bun.exe processes that live in OUR runtime folder AND are
' running either:
'   - server.js (the main Next.js server), OR
'   - task-service\index.ts (the Task Board Socket.io service)
' Both run under the same bun.exe binary, so we match by command line.
' Safe even if the user has another bun.exe elsewhere or runs our bun for
' other unrelated tasks.
Sub KillBun()
    On Error Resume Next
    Dim wmi, procs, p, ourExe, cmd
    ourExe = LCase(appDir & "\runtime\bun.exe")
    Set wmi = GetObject("winmgmts:\\.\root\cimv2")
    Set procs = wmi.ExecQuery( _
        "SELECT * FROM Win32_Process WHERE Name='bun.exe'")
    For Each p In procs
        If LCase(p.ExecutablePath) = ourExe Then
            cmd = LCase(p.CommandLine & "")
            ' Match either the main Next.js server (server.js) or the
            ' task-service (task-service\index.ts). Both run under bun.exe.
            If InStr(cmd, "server.js") > 0 _
               Or InStr(cmd, "task-service") > 0 Then
                p.Terminate
            End If
        End If
    Next
    On Error Goto 0
End Sub
