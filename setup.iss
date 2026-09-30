
; VLC Launcher Service — Inno Setup Installer
; Download Inno Setup 6: https://jrsoftware.org/isinfo.php
; Run: iscc setup.iss

#define MyAppName "VLC Launcher Service"
#define MyAppVersion "0.4"
#define MyAppPublisher "Binarique Ltd"
#define MyAppExeName "VlcLauncherService.exe"

[Setup]
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppCopyright=Copyright © 2026 {#MyAppPublisher}
DefaultDirName={autopf}\VlcLauncherService
DefaultGroupName=VLC Launcher
OutputDir=.\dist
OutputBaseFilename=VlcLauncherService-Setup-v{#MyAppVersion}
SetupIconFile=icons\icon128.ico
UninstallDisplayIcon={app}\icon128.ico
UninstallDisplayName={#MyAppName}
Compression=lzma2
SolidCompression=yes
PrivilegesRequired=admin
ArchitecturesInstallIn64BitMode=x64compatible
VersionInfoVersion={#MyAppVersion}
VersionInfoCompany={#MyAppPublisher}
VersionInfoDescription=HTTP API service for launching streaming media in VLC
VersionInfoProductName={#MyAppName}

[Tasks]
; Creates checkboxes on the setup screen so the user can choose
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"; Flags: unchecked
Name: "startup"; Description: "Start automatically when Windows starts"; GroupDescription: "Auto-Start:"

[Files]
; .NET published files
Source: "publish\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs
; yt-dlp
Source: "publish\yt-dlp.exe"; DestDir: "{app}"; Flags: ignoreversion
; ffmpeg (optional at runtime — skip silently if not present so the build never breaks)
Source: "publish\ffmpeg.exe"; DestDir: "{app}"; Flags: ignoreversion skipifsourcedoesntexist
; Bundled .NET 10 runtime installers — staged to {tmp} and run only if missing
Source: "redist\windowsdesktop-runtime-10.0.11-win-x64.exe"; DestDir: "{tmp}"; Flags: ignoreversion deleteafterinstall; Check: NeedWindowsDesktopRuntime
Source: "redist\aspnetcore-runtime-10.0.11-win-x64.exe"; DestDir: "{tmp}"; Flags: ignoreversion deleteafterinstall; Check: NeedAspNetCoreRuntime
; Icon for Control Panel / uninstall entry
Source: "icons\icon128.ico"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
; 1. Start Menu Shortcut
Name: "{group}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"
; 2. Start Menu Uninstall Shortcut
Name: "{group}\Uninstall {#MyAppName}"; Filename: "{uninstallexe}"
; 3. Desktop Shortcut (Tied to the Tasks checkbox)
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; Tasks: desktopicon

[Registry]
; Standard Windows method for launching tray apps on boot (Tied to the Tasks checkbox)
Root: HKCU; Subkey: "Software\Microsoft\Windows\CurrentVersion\Run"; ValueType: string; ValueName: "{#MyAppName}"; ValueData: """{app}\{#MyAppExeName}"""; Tasks: startup; Flags: uninsdeletevalue

[Run]
; Install bundled .NET runtimes silently (only if missing), then launch the app
Filename: "{tmp}\windowsdesktop-runtime-10.0.11-win-x64.exe"; Parameters: "/install /quiet /norestart"; StatusMsg: "Installing .NET 10 Desktop Runtime..."; Check: NeedWindowsDesktopRuntime; Flags: waituntilterminated runhidden
Filename: "{tmp}\aspnetcore-runtime-10.0.11-win-x64.exe"; Parameters: "/install /quiet /norestart"; StatusMsg: "Installing .NET 10 ASP.NET Core Runtime..."; Check: NeedAspNetCoreRuntime; Flags: waituntilterminated runhidden
; Starts the application immediately after the installer finishes
Filename: "{app}\{#MyAppExeName}"; Description: "Launch {#MyAppName}"; Flags: nowait postinstall skipifsilent

[UninstallRun]
; Clean up old Windows Service if upgrading from v0.1
Filename: "{sys}\sc.exe"; Parameters: "stop ""VLC Launcher Service"""; Flags: runhidden skipifdoesntexist
Filename: "{sys}\sc.exe"; Parameters: "delete ""VLC Launcher Service"""; Flags: runhidden skipifdoesntexist
; Clean up any leftover scheduled tasks from your previous setup attempts
Filename: "{sys}\schtasks.exe"; Parameters: "/End /TN ""VLC Launcher Service"""; Flags: runhidden skipifdoesntexist
Filename: "{sys}\schtasks.exe"; Parameters: "/Delete /TN ""VLC Launcher Service"" /F"; Flags: runhidden skipifdoesntexist

[Code]
const
  DotNetChannel = '10.0';

{ True if the given .NET shared framework (e.g. Microsoft.AspNetCore.App) 10.x is present. }
function SharedFrameworkInstalled(const Name: string): Boolean;
var
  SubKeys: TArrayOfString;
  i: Integer;
  FindRec: TFindRec;
begin
  Result := False;
  if RegGetSubkeyNames(HKLM64, 'SOFTWARE\dotnet\Setup\InstalledVersions\x64\sharedfx\' + Name, SubKeys) then
  begin
    for i := 0 to GetArrayLength(SubKeys) - 1 do
    begin
      if Pos(DotNetChannel + '.', SubKeys[i]) = 1 then
      begin
        Result := True;
        Exit;
      end;
    end;
  end;
  { Fallback for installs that skip the registry. }
  if FindFirst(ExpandConstant('{commonpf64}\dotnet\shared\' + Name + '\' + DotNetChannel + '.*'), FindRec) then
  begin
    Result := True;
    FindClose(FindRec);
  end;
end;

function NeedWindowsDesktopRuntime: Boolean;
begin
  Result := not SharedFrameworkInstalled('Microsoft.WindowsDesktop.App');
end;

function NeedAspNetCoreRuntime: Boolean;
begin
  Result := not SharedFrameworkInstalled('Microsoft.AspNetCore.App');
end;