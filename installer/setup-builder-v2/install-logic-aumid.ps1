<#
.SYNOPSIS
    DevForge AI - AppUserModelID (AUMID) registration + branded shortcuts.

.DESCRIPTION
    Windows uses the AppUserModelID (AUMID) to decide which icon + display name
    to show in the taskbar, Start menu, and window-grouping for a process.

    DevForge AI launches as msedge.exe in --app mode, so by default the taskbar
    shows Edge's icon and groups the window with the user's other Edge windows.

    To get our OWN icon on the taskbar + a separate window group ("DevForge AI"
    instead of "Microsoft Edge"), we do two things:

      1. REGISTER the AUMID `DevForge.AI.JadJbara` under
         HKCU\Software\Classes\AppUserModelId\DevForge.AI.JadJbara
         with DisplayName + IconUri. Windows reads these values when an
         application window claims this AUMID.

      2. Pass `--app-user-model-id=DevForge.AI.JadJbara` to msedge.exe in
         start-devforge.vbs. Chromium honours this flag and sets the AUMID on
         the resulting window — which Windows then resolves against the
         registry entry above to draw the right icon + display name.

      3. (Bonus, optional) Stamp the .lnk shortcut itself with the same AUMID
         via the IPropertyStore COM interface. This is what makes the Start
         Menu tile pin correctly and lets the taskbar "remember" the AUMID
         even on relaunch. Done via inline C# Add-Type so we don't depend on
         any external modules.

.PARAMETER InstallDir
    Root install directory (the {app} folder from Inno Setup).
    Defaults to the parent of this script's folder.

.PARAMETER SkipDesktop
    Skip creating the desktop shortcut. (Used when Inno Setup already created
    one via its [Icons] section and we don't want to duplicate.)

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File .\install-logic-aumid.ps1 -InstallDir "C:\Users\jad\AppData\Local\DevForge_AI"

.NOTES
    Works on Windows 10 (1809+) and Windows 11. No admin rights required —
    everything writes to HKCU and %LOCALAPPDATA%.
#>

[CmdletBinding()]
param(
    [string]$InstallDir = "",
    [switch]$SkipDesktop
)

$ErrorActionPreference = "Stop"

# --- 0. Resolve paths -------------------------------------------------------
if (-not $InstallDir) {
    $InstallDir = Split-Path -Parent $MyInvocation.MyCommand.Path
}
$InstallDir = [System.IO.Path]::GetFullPath($InstallDir.TrimEnd('\'))

$AppDir         = Join-Path $InstallDir "app"
$VbsPath        = Join-Path $InstallDir "start-devforge.vbs"
$IconPath       = Join-Path $InstallDir "devforge-icon.ico"

# The AUMID — keep in sync with the --app-user-model-id flag in start-devforge.vbs.
$Aumid          = "DevForge.AI.JadJbara"
$DisplayName    = "DevForge AI"
$AppPublisher   = "Jad Jbara"

# Folders
$LocalAppData   = [Environment]::GetFolderPath("LocalApplicationData")
$BrandDir       = Join-Path $LocalAppData "DevForge_AI"
$StartMenuDir   = Join-Path ([Environment]::GetFolderPath("Programs")) "DevForge AI"
$DesktopDir     = [Environment]::GetFolderPath("Desktop")

$StartMenuLnk   = Join-Path $StartMenuDir "DevForge AI.lnk"
$DesktopLnk     = Join-Path $DesktopDir   "DevForge AI.lnk"
$BrandLnk       = Join-Path $BrandDir     "DevForge AI.lnk"

Write-Host "=== DevForge AI - AUMID + Shortcut Setup ===" -ForegroundColor Cyan
Write-Host "InstallDir : $InstallDir"
Write-Host "VBS path   : $VbsPath"
Write-Host "Icon path  : $IconPath"
Write-Host "AUMID      : $Aumid"
Write-Host ""

# --- 1. Pre-flight checks ---------------------------------------------------
if (-not (Test-Path $VbsPath)) {
    Write-Error "start-devforge.vbs not found at: $VbsPath"
    exit 1
}
if (-not (Test-Path $IconPath)) {
    Write-Warning "devforge-icon.ico not found at: $IconPath — shortcuts will use the default wscript icon."
}

# Ensure brand dir exists (we stash a copy of the .lnk here too, useful for
# "open file location" + as a stable path that doesn't move with user profile).
if (-not (Test-Path $BrandDir)) {
    New-Item -ItemType Directory -Path $BrandDir -Force | Out-Null
}

# --- 2. Register AUMID in HKCU ---------------------------------------------
#  HKCU\Software\Classes\AppUserModelId\<AUMID>
#    (Default)        = Display name shown in taskbar tooltip + jump list
#    DisplayName      = Display name (preferred over Default)
#    IconUri          = absolute path or URL to the icon
#
# Windows reads these when a window claims this AUMID. Without this entry,
# the taskbar will still group the window separately (because Edge sets the
# AUMID) but will fall back to a generic icon.
$AumidKey = "HKCU:\Software\Classes\AppUserModelId\$Aumid"
Write-Host "[1/4] Registering AUMID in registry..." -ForegroundColor Yellow
try {
    if (-not (Test-Path $AumidKey)) {
        New-Item -Path $AumidKey -Force | Out-Null
    }
    Set-ItemProperty -Path $AumidKey -Name "(Default)"  -Value $DisplayName  -Type String
    Set-ItemProperty -Path $AumidKey -Name "DisplayName" -Value $DisplayName  -Type String
    if (Test-Path $IconPath) {
        Set-ItemProperty -Path $AumidKey -Name "IconUri" -Value $IconPath    -Type String
    }
    Write-Host "  -> OK: $AumidKey" -ForegroundColor Green
} catch {
    Write-Warning "  -> Registry write failed: $($_.Exception.Message)"
    Write-Warning "     Taskbar icon will fall back to Edge's. App will still work."
}

# --- 3. Define the IPropertyStore helper (set System.AppUserModel.ID on .lnk) ---
#  Property keys (FMTID + PID):
#    System.AppUserModel.ID           = {9F4C2855-9F79-4B39-A8D0-E1D42DE1D5F3}, PID 5
#    System.AppUserModel.RelaunchName = {9F4C2855-9F79-4B39-A8D0-E1D42DE1D5F3}, PID 15
#    System.AppUserModel.RelaunchIcon = {9F4C2855-9F79-4B39-A8D0-E1D42DE1D5F3}, PID 2
#
#  We use Add-Type with inline C# to call the COM interface — this is the
#  cleanest way without depending on the Windows API CodePack or any external
#  PowerShell module. PSCustomObject is loaded once per script invocation.
try {
    if (-not ("DevForge.Aumid.Stamper" -as [type])) {
        Add-Type -TypeDefinition @"
using System;
using System.IO;
using System.Runtime.InteropServices;
using System.Runtime.InteropServices.ComTypes;

namespace DevForge.Aumid
{
    // Minimal IPersistFile — we only need Load + Save but the COM contract
    // requires the full interface shape.
    [ComImport]
    [Guid("0000010B-0000-0000-C000-000000000046")]
    [InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    public interface IPersistFile
    {
        void GetClassID(out Guid pClassID);
        [PreserveSig] int IsDirty();
        void Load([MarshalAs(UnmanagedType.LPWStr)] string pszFileName, uint dwMode);
        void Save([MarshalAs(UnmanagedType.LPWStr)] string pszFileName, bool fRemember);
        void SaveCompleted([MarshalAs(UnmanagedType.LPWStr)] string pszFileName);
        void GetCurFile([MarshalAs(UnmanagedType.LPWStr)] out string ppszFileName);
    }

    [ComImport]
    [Guid("886D8EEB-8CF2-4446-8D02-CDBA1DBDCF99")]
    [InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    public interface IPropertyStore
    {
        uint GetCount([Out] out uint cProps);
        uint GetAt([In] uint iProp, [Out] out PropertyKey pkey);
        uint GetValue([In] ref PropertyKey key, [Out] PropVariant pv);
        uint SetValue([In] ref PropertyKey key, [In] PropVariant pv);
        uint Commit();
    }

    [StructLayout(LayoutKind.Sequential, Pack = 4)]
    public struct PropertyKey
    {
        public Guid fmtid;
        public int pid;
        public PropertyKey(Guid fmtid, int pid) { this.fmtid = fmtid; this.pid = pid; }
    }

    // Minimal PropVariant that supports VT_LPWSTR (string). We only ever set
    // string values, so this stripped-down implementation is enough. The .vt
    // field MUST be the first thing in the union so the COM marshaler reads
    // the variant tag correctly.
    [StructLayout(LayoutKind.Sequential)]
    public class PropVariant
    {
        public ushort vt;
        public ushort wReserved1;
        public ushort wReserved2;
        public ushort wReserved3;
        public IntPtr pwszVal;

        public static PropVariant FromString(string s)
        {
            var pv = new PropVariant
            {
                vt = 31, // VT_LPWSTR
                pwszVal = Marshal.StringToCoTaskMemUni(s)
            };
            return pv;
        }
    }

    public static class Stamper
    {
        private static readonly Guid AumidFmtid = new Guid("9F4C2855-9F79-4B39-A8D0-E1D42DE1D5F3");

        public static void SetAppUserModelId(string lnkPath, string aumid)
        {
            if (!File.Exists(lnkPath))
                throw new FileNotFoundException(".lnk not found: " + lnkPath, lnkPath);

            // Bind to the ShellLink CLSID (this is what WScript.Shell creates)
            // and ask for IPersistFile so we can load the existing .lnk, then
            // ask for IPropertyStore to mutate System.AppUserModel.ID.
            var clsid = new Guid("00021401-0000-0000-C000-000000000046"); // ShellLink
            var shellLink = (IPersistFile)Activator.CreateInstance(Type.GetTypeFromCLSID(clsid));
            shellLink.Load(lnkPath, 0); // STGM_READ = 0

            var pstore = (IPropertyStore)shellLink;

            var idKey = new PropertyKey(AumidFmtid, 5);  // System.AppUserModel.ID
            var relaunchNameKey = new PropertyKey(AumidFmtid, 15); // System.AppUserModel.RelaunchDisplayName
            var relaunchIconKey = new PropertyKey(AumidFmtid, 2);  // System.AppUserModel.RelaunchIconResource

            var idVal = PropVariant.FromString(aumid);
            uint hr = pstore.SetValue(ref idKey, idVal);
            Marshal.FreeCoTaskMem(idVal.pwszVal);
            if (hr != 0)
                throw new InvalidOperationException("SetValue(ID) returned 0x" + hr.ToString("X"));

            try
            {
                var nameVal = PropVariant.FromString("DevForge AI");
                pstore.SetValue(ref relaunchNameKey, nameVal);
                Marshal.FreeCoTaskMem(nameVal.pwszVal);
            }
            catch { /* non-fatal */ }

            pstore.Commit();
            shellLink.Save(lnkPath, true);
            Marshal.ReleaseComObject(pstore);
            Marshal.ReleaseComObject(shellLink);
        }
    }
}
"@ -ErrorAction Stop
    }
    $aumidHelperReady = $true
} catch {
    Write-Warning "  -> IPropertyStore helper unavailable: $($_.Exception.Message)"
    Write-Warning "     .lnk AUMID stamping will be skipped (registry AUMID still works)."
    $aumidHelperReady = $false
}

# --- 4. Build a .lnk that launches wscript.exe with our VBS -----------------
function New-DevForgeShortcut {
    param(
        [string]$LnkPath,
        [string]$IconLoc
    )
    $parent = Split-Path -Parent $LnkPath
    if (-not (Test-Path $parent)) {
        New-Item -ItemType Directory -Path $parent -Force | Out-Null
    }

    $ws = New-Object -ComObject WScript.Shell
    $sc = $ws.CreateShortcut($LnkPath)
    $sc.TargetPath       = "$env:WINDIR\System32\wscript.exe"
    $sc.Arguments        = "`"$VbsPath`""
    $sc.WorkingDirectory = $InstallDir
    $sc.Description      = "Launch DevForge AI"
    $sc.WindowStyle      = 1
    if ($IconLoc -and (Test-Path $IconLoc)) {
        $sc.IconLocation = "$IconLoc,0"
    }
    $sc.Save()

    # Release COM object so the file is flushed + unlocked before we stamp it.
    [System.Runtime.InteropServices.Marshal]::ReleaseComObject($sc) | Out-Null
    [System.Runtime.InteropServices.Marshal]::ReleaseComObject($ws) | Out-Null
}

# --- 5. Create the shortcuts (Start Menu + Brand dir + Desktop) ------------
Write-Host "[2/4] Creating Start Menu shortcut..." -ForegroundColor Yellow
try {
    New-DevForgeShortcut -LnkPath $StartMenuLnk -IconLoc $IconPath
    Write-Host "  -> OK: $StartMenuLnk" -ForegroundColor Green
} catch {
    Write-Warning "  -> Failed: $($_.Exception.Message)"
}

Write-Host "[3/4] Creating brand-folder shortcut (stable path)..." -ForegroundColor Yellow
try {
    New-DevForgeShortcut -LnkPath $BrandLnk -IconLoc $IconPath
    Write-Host "  -> OK: $BrandLnk" -ForegroundColor Green
} catch {
    Write-Warning "  -> Failed: $($_.Exception.Message)"
}

if (-not $SkipDesktop) {
    Write-Host "[3b/4] Creating Desktop shortcut..." -ForegroundColor Yellow
    try {
        New-DevForgeShortcut -LnkPath $DesktopLnk -IconLoc $IconPath
        Write-Host "  -> OK: $DesktopLnk" -ForegroundColor Green
    } catch {
        Write-Warning "  -> Failed: $($_.Exception.Message)"
    }
}

# --- 6. Stamp the AUMID onto each .lnk via IPropertyStore ------------------
Write-Host "[4/4] Stamping AUMID on shortcuts..." -ForegroundColor Yellow
if ($aumidHelperReady) {
    $targets = @($StartMenuLnk, $BrandLnk)
    if (-not $SkipDesktop) { $targets += $DesktopLnk }
    foreach ($lnk in $targets) {
        if (-not (Test-Path $lnk)) { continue }
        try {
            [DevForge.Aumid.Stamper]::SetAppUserModelId($lnk, $Aumid) | Out-Null
            Write-Host "  -> OK: $lnk" -ForegroundColor Green
        } catch {
            Write-Warning "  -> Stamp failed for $lnk : $($_.Exception.Message)"
        }
    }
} else {
    Write-Warning "  -> Skipped (IPropertyStore helper unavailable)."
}

# --- 7. Done ----------------------------------------------------------------
Write-Host ""
Write-Host "=== Done ===" -ForegroundColor Cyan
Write-Host "AUMID       : $Aumid"
Write-Host "DisplayName : $DisplayName"
Write-Host ""
Write-Host "Note: the AUMID is also passed via --app-user-model-id in start-devforge.vbs"
Write-Host "so the running Edge process advertises it to Windows. Combined with the"
Write-Host "registry entry above, the taskbar will show the DevForge icon for the app window."
Write-Host ""
exit 0
