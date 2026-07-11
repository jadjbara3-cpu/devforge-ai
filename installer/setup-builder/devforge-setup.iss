; ============================================================================
;  DevForge AI - Inno Setup Script
;
;  This creates a professional setup.exe with:
;  - GUI wizard interface
;  - Desktop shortcuts
;  - Start Menu entries
;  - Uninstaller
;  - Custom install directory selection
;
;  To compile:
;    1. Install Inno Setup:  winget install JRSoftware.InnoSetup
;    2. Run:  iscc devforge-setup.iss
;    3. Output: setup.exe in the Output/ folder
;
;  OR double-click build-inno-setup.bat (does both steps automatically)
; ============================================================================

#define MyAppName "DevForge AI"
#define MyAppVersion "1.0.0"
#define MyAppPublisher "DevForge"
#define MyAppURL "https://github.com/jadjbara3-cpu/devforge-ai"
#define MyAppExeName "start-devforge.bat"

[Setup]
AppId={{DevForge-AI-2024}
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
OutputBaseFilename=setup
SetupIconFile=
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
PrivilegesRequired=lowest
ArchitecturesAllowed=x64
ArchitecturesInstallIn64BitMode=x64
UninstallDisplayIcon={app}\node_modules\next\dist\bin\next

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"
Name: "arabic"; MessagesFile: "compiler:Languages\Arabic.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"; Flags: unchecked

[Files]
; The installer logic batch file
Source: "install-logic.bat"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
Name: "{group}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"
Name: "{group}\Uninstall {#MyAppName}"; Filename: "{uninstallexe}"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; Tasks: desktopicon

[Run]
; Run the installer logic after extraction
Filename: "cmd.exe"; Parameters: "/c install-logic.bat"; WorkingDir: "{app}"; Flags: postinstall nowait runhidden; Description: "Installing DevForge AI..."

[UninstallDelete]
Type: filesandordirs; Name: "{app}"

[Code]
function InitializeSetup(): Boolean;
begin
  Result := True;
end;
