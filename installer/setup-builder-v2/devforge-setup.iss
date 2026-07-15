; ============================================================================
;  DevForge AI - Professional Single-EXE Installer (v2)
;
;  Bundles:
;    - Pre-built Next.js standalone app (~119 MB)
;    - Portable Bun runtime (~94 MB)
;    - Task Board mini-service (Socket.io on port 3003, with node_modules)
;    - Launcher + config scripts
;
;  Output: DevForgeAI-Setup.exe (fully self-contained, works offline)
;
;  Build:  build.bat  (or: ISCC devforge-setup.iss)
; ============================================================================
#define MyAppName "DevForge AI"
#define MyAppVersion "1.0.0"
#define MyAppPublisher "Jad Jbara"
#define MyAppURL "https://github.com/jadjbara3-cpu/devforge-ai"

[Setup]
AppId={{DevForge-AI-2026}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppPublisherURL={#MyAppURL}
AppSupportURL={#MyAppURL}
AppUpdatesURL={#MyAppURL}
DefaultDirName={localappdata}\DevForge_AI
DefaultGroupName={#MyAppName}
DisableProgramGroupPage=yes
OutputDir=Output
OutputBaseFilename=DevForgeAI-Setup
Compression=lzma2/ultra64
SolidCompression=yes
LZMAUseSeparateProcess=yes
WizardStyle=modern
PrivilegesRequired=lowest
ArchitecturesAllowed=x64
ArchitecturesInstallIn64BitMode=x64
UninstallDisplayIcon={app}\devforge-icon.ico
SetupLogging=yes
DisableWelcomePage=no
DisableReadyPage=no

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"; Flags: unchecked
Name: "launchnow"; Description: "Launch DevForge AI now"; GroupDescription: "{cm:AdditionalIcons}"

[Files]
; Portable Bun runtime (single binary, ~94 MB)
Source: "runtime\bun.exe"; DestDir: "{app}\runtime"; Flags: ignoreversion

; Pre-built Next.js standalone application
; NOTE: Excludes only ".env" - the mini-services\task-service\ folder (staged
; inside app\ by build-silent.bat) WILL be bundled here along with its
; node_modules. install-logic.bat creates the .env at install time.
Source: "app\*"; DestDir: "{app}\app"; Flags: ignoreversion recursesubdirs createallsubdirs; Excludes: ".env"

; Launcher scripts
;   start-devforge.vbs  - primary launcher (hidden servers + frameless browser window)
;   start-devforge.bat  - debug launcher (visible console, for troubleshooting)
;   run-server.cmd      - hidden server wrapper, starts BOTH main + task-service
;   stop-devforge.vbs   - manual stop helper
Source: "start-devforge.vbs"; DestDir: "{app}"; Flags: ignoreversion
Source: "start-devforge.bat"; DestDir: "{app}"; Flags: ignoreversion
Source: "run-server.cmd"; DestDir: "{app}"; Flags: ignoreversion
Source: "stop-devforge.vbs"; DestDir: "{app}"; Flags: ignoreversion
Source: "install-logic.bat"; DestDir: "{app}"; Flags: ignoreversion
Source: "install-logic-aumid.ps1"; DestDir: "{app}"; Flags: ignoreversion
Source: "devforge-icon.ico"; DestDir: "{app}"; Flags: ignoreversion
Source: "README.txt"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
; Primary launcher: hidden servers + frameless app-like browser window.
; Use wscript.exe explicitly so .vbs always runs in the GUI host (no console),
; regardless of the user's file associations.
; IconFilename points at our bundled devforge-icon.ico so the START MENU entry
; shows the DevForge icon. (The runtime taskbar icon is handled separately via
; the AUMID registered by install-logic-aumid.ps1 + the --app-user-model-id
; flag in start-devforge.vbs.)
Name: "{group}\DevForge AI"; Filename: "{sys}\wscript.exe"; Parameters: """{app}\start-devforge.vbs"""; WorkingDir: "{app}"; Comment: "Launch DevForge AI"; IconFilename: "{app}\devforge-icon.ico"
; Debug launcher: shows a visible console window with server logs.
Name: "{group}\DevForge AI (Debug Mode)"; Filename: "{app}\start-devforge.bat"; WorkingDir: "{app}"; Comment: "Launch DevForge AI with visible console (for troubleshooting)"; IconFilename: "{app}\devforge-icon.ico"
; Manual stop helper: terminates both hidden bun.exe processes.
Name: "{group}\Stop DevForge AI"; Filename: "{sys}\wscript.exe"; Parameters: """{app}\stop-devforge.vbs"""; WorkingDir: "{app}"; Comment: "Stop the hidden DevForge AI servers"; IconFilename: "{app}\devforge-icon.ico"
Name: "{group}\Uninstall DevForge AI"; Filename: "{uninstallexe}"
Name: "{autodesktop}\DevForge AI"; Filename: "{sys}\wscript.exe"; Parameters: """{app}\start-devforge.vbs"""; WorkingDir: "{app}"; Comment: "Launch DevForge AI"; IconFilename: "{app}\devforge-icon.ico"; Tasks: desktopicon

; ============================================================================
;  [Registry] - record installed version + path so the app (and future
;  updaters) can read them as a fallback to version.txt.
;  HKCU (not HKLM) because we install with PrivilegesRequired=lowest.
; ============================================================================
[Registry]
Root: HKCU; Subkey: "Software\DevForge_AI"; Flags: uninsdeletekeyifempty
Root: HKCU; Subkey: "Software\DevForge_AI"; ValueType: string; ValueName: "Version"; ValueData: "{#MyAppVersion}"; Flags: uninsdeletevalue
Root: HKCU; Subkey: "Software\DevForge_AI"; ValueType: string; ValueName: "InstallPath"; ValueData: "{app}"; Flags: uninsdeletevalue
Root: HKCU; Subkey: "Software\DevForge_AI"; ValueType: string; ValueName: "Publisher"; ValueData: "{#MyAppPublisher}"; Flags: uninsdeletevalue

[Run]
; Post-install configuration: creates .env with absolute DB path + writes
; version.txt (the auto-updater's authoritative current-version marker).
; The version is passed as the 2nd arg so install-logic.bat doesn't have to
; read the registry (though it falls back to that if the arg is missing).
Filename: "{cmd}"; Parameters: "/c """"{app}\install-logic.bat"" ""{app}"" ""{#MyAppVersion}"" """; WorkingDir: "{app}"; Flags: runhidden; Description: "Configuring DevForge AI..."

; Register the AppUserModelID + create branded shortcuts. This runs AFTER
; install-logic.bat (which also invokes the same script defensively, so the
; PS executes idempotently twice on install but only once on manual install-
; logic.bat runs). The PS is harmless to run multiple times — it just over-
; writes the same .lnk files + HKCU registry entries. Doing it here too lets
; the Inno Setup progress dialog show "Registering DevForge AppUserModelID…"
; as a distinct step, which is nicer UX than burying it inside the .bat.
Filename: "powershell.exe"; Parameters: "-NoProfile -NonInteractive -ExecutionPolicy Bypass -File ""{app}\install-logic-aumid.ps1"" -InstallDir ""{app}"" -SkipDesktop"; WorkingDir: "{app}"; Flags: runhidden; Description: "Registering DevForge taskbar identity…"

; Optional: add Windows Firewall exception for the Task Board service (port 3003).
; Only runs if the installer was launched with admin rights - on non-admin
; installs this step is skipped silently. The task-service still works on
; localhost without any firewall rule (loopback is always allowed).
Filename: "{cmd}"; Parameters: "/c netsh advfirewall firewall add rule name=""DevForge Task Service"" dir=in action=allow protocol=TCP localport=3003"; Flags: runhidden; Check: IsAdminInstallMode; Description: "Adding firewall exception for Task Board service..."

; Interactive install: optionally launch the app (only if the user checked
; the "Launch DevForge AI now" task). skipifsilent ensures this is NOT run
; during a silent auto-update - the dedicated silent-relaunch entry below
; handles that case.
Filename: "{sys}\wscript.exe"; Parameters: """{app}\start-devforge.vbs"""; WorkingDir: "{app}"; Tasks: launchnow; Flags: nowait postinstall skipifsilent

; Silent install (auto-update): ALWAYS relaunch the app after install so the
; user gets the new version running without manual intervention. Gated on
; IsSilentInstall so interactive installs are unaffected.
Filename: "{sys}\wscript.exe"; Parameters: """{app}\start-devforge.vbs"""; WorkingDir: "{app}"; Flags: nowait postinstall; Check: IsSilentInstall

[UninstallRun]
; Remove the firewall rule we may have added (silently ignored if not present)
Filename: "{cmd}"; Parameters: "/c netsh advfirewall firewall delete rule name=""DevForge Task Service"""; Flags: runhidden
; Kill any running bun process before uninstall
Filename: "{cmd}"; Parameters: "/c taskkill /f /im bun.exe 2>nul"; Flags: runhidden
; Remove the AUMID registry entry created by install-logic-aumid.ps1 so the
; taskbar fully forgets DevForge AI after uninstall (no orphan icon cache).
Filename: "{cmd}"; Parameters: "/c reg delete ""HKCU\Software\Classes\AppUserModelId\DevForge.AI.JadJbara"" /f 2>nul"; Flags: runhidden

[UninstallDelete]
Type: filesandordirs; Name: "{app}"

[Code]
// ---------------------------------------------------------------------------
//  IsSilentInstall: True when Setup is running with /SILENT or /VERYSILENT.
//  Used to gate the silent-mode relaunch entry in [Run].
// ---------------------------------------------------------------------------
function IsSilentInstall(): Boolean;
begin
  Result := WizardSilent();
end;

// ---------------------------------------------------------------------------
//  PrepareToInstall: runs BEFORE file extraction. We taskkill any running
//  bun.exe (the DevForge server + task-service) so the installer can
//  overwrite the files. Without this, Windows holds exclusive locks on
//  server.js / bun.exe and the silent auto-update fails with "file in use".
//
//  We also give the OS a brief moment to release file handles after the
//  kill before extraction begins.
// ---------------------------------------------------------------------------
function PrepareToInstall(var NeedsRestart: Boolean): String;
var
  ResultCode: Integer;
begin
  NeedsRestart := False;

  // 1. Kill the bundled bun.exe processes (main Next.js server + task-service).
  //    taskkill /f /im bun.exe matches the [UninstallRun] entry. Safe here
  //    because we only run this during a DevForge install/upgrade.
  Exec(ExpandConstant('{cmd}'), '/c taskkill /f /im bun.exe 2>nul', '',
       SW_HIDE, ewWaitUntilTerminated, ResultCode);

  // 2. Brief pause so Windows releases file handles before extraction.
  Sleep(800);

  Result := '';
end;

function InitializeSetup(): Boolean;
begin
  Result := True;
end;

function NeedRestart(): Boolean;
begin
  Result := False;
end;
