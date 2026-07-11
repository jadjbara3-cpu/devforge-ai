; ============================================================================
;  DevForge AI - iexpress Self-Extracting Installer Configuration
;
;  This .SED file configures iexpress (built into Windows) to create
;  a setup.exe from the install-logic.bat batch file.
;
;  To build setup.exe on Windows, run:
;    build-setup.bat
;
;  The output will be: setup.exe (a single self-extracting installer)
; ============================================================================

[Version]
Class=IEXPRESS
SEDVersion=3

[Options]
PackagePurpose=InstallApp
ShowInstallProgramWindow=0
HideExtractAnimation=0
UseLongFileName=1
InsideCompressed=0
CAB_FixedSize=0
CAB_ResvCodeSigning=0
RebootMode=N
InstallPrompt=%InstallPrompt%
DisplayLicense=%DisplayLicense%
FinishMessage=%FinishMessage%
TargetName=%TargetName%
FriendlyName=%FriendlyName%
AppLaunched=%AppLaunched%
PostInstallCmd=%PostInstallCmd%
AdminQuietInstCmd=%AdminQuietInstCmd%
UserQuietInstCmd=%UserQuietInstCmd%
SourceFiles=SourceFiles

[Strings]
InstallPrompt=Do you want to install DevForge AI?
DisplayLicense=
FinishMessage=DevForge AI has been installed. Double-click the desktop shortcut to start.
TargetName=setup.exe
FriendlyName=DevForge AI Setup
AppLaunched=cmd /c install-logic.bat
PostInstallCmd=
AdminQuietInstCmd=
UserQuietInstCmd=

[SourceFiles]
SourceFiles0=C:\DevForge_AI_installer\

[SourceFiles0]
%FILE0%=install-logic.bat
