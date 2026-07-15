' ============================================================================
'  DevForge AI - Manual Stop  (stop-devforge.vbs)
'  ---------------------------------------------------------------------------
'  Use this if the app window has been closed but the hidden Bun servers are
'  still running in the background (rare edge case, e.g. browser crashed).
'
'  Terminates ONLY the bun.exe processes that:
'    1. Live in our install folder (matched by ExecutablePath), AND
'    2. Are running either:
'         - server.js                 (the main Next.js server on port 3000), OR
'         - task-service\index.ts     (the Task Board Socket.io service on 3003)
'
'  Both servers run under the same bundled bun.exe binary, so we filter by
'  command line. Safe even if the user has another Bun installed elsewhere
'  or runs our bun.exe for unrelated tasks.
' ============================================================================
Option Explicit

Dim fso, shell, appDir
Set fso   = WScript.CreateObject("Scripting.FileSystemObject")
Set shell = WScript.CreateObject("WScript.Shell")
appDir    = fso.GetParentFolderName(WScript.ScriptFullName)

Dim wmi, procs, p, ourExe, cmd, killed
ourExe = LCase(appDir & "\runtime\bun.exe")

On Error Resume Next
Set wmi = GetObject("winmgmts:\\.\root\cimv2")
Set procs = wmi.ExecQuery("SELECT * FROM Win32_Process WHERE Name='bun.exe'")
killed = 0
For Each p In procs
    If LCase(p.ExecutablePath) = ourExe Then
        cmd = LCase(p.CommandLine & "")
        ' Match either the main server (server.js) or the task-service.
        If InStr(cmd, "server.js") > 0 Or InStr(cmd, "task-service") > 0 Then
            p.Terminate
            killed = killed + 1
        End If
    End If
Next
On Error Goto 0

If killed > 0 Then
    MsgBox "DevForge AI stopped (" & killed & " process(es) terminated).", _
           vbInformation, "DevForge AI"
Else
    MsgBox "DevForge AI was not running.", vbInformation, "DevForge AI"
End If
