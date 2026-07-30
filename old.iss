; VLC Launcher Service — Inno Setup Installer
; Download Inno Setup 6: https://jrsoftware.org/isinfo.php
; Run: iscc setup.iss

[Setup]
AppName=VLC Launcher Service
AppVersion=0.1
AppPublisher=Binarique Ltd
AppCopyright=Copyright © 2026 Binarique Ltd
DefaultDirName={autopf}\VlcLauncherService
DefaultGroupName=VLC Launcher
OutputDir=.\dist
OutputBaseFilename=VlcLauncherService-Setup
SetupIconFile=icons\icon128.ico
UninstallDisplayIcon={app}\icon128.ico
UninstallDisplayName=VLC Launcher Service
Compression=lzma2
SolidCompression=yes
PrivilegesRequired=admin
ArchitecturesInstallIn64BitMode=x64compatible
VersionInfoVersion=0.1
VersionInfoCompany=Binarique Ltd
VersionInfoDescription=HTTP API service for launching streaming media in VLC
VersionInfoProductName=VLC Launcher Service

[Files]
; .NET published files
Source: "publish\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs

; yt-dlp
Source: "publish\yt-dlp.exe"; DestDir: "{app}"; Flags: ignoreversion

; ffmpeg
Source: "publish\ffmpeg.exe"; DestDir: "{app}"; Flags: ignoreversion

; Icon for Control Panel / uninstall entry
Source: "icons\icon128.ico"; DestDir: "{app}"; Flags: ignoreversion

[Run]
; Create scheduled task running as the current user (not SYSTEM, so VLC shows UI)
Filename: "{sys}\schtasks.exe"; Parameters: "/Create /TN ""VLC Launcher Service"" /TR ""\""{app}\VlcLauncherService.exe\"""" /SC ONLOGON /RL HIGHEST /RU ""{username}"" /F"; Flags: runhidden
Filename: "{sys}\schtasks.exe"; Parameters: "/Run /TN ""VLC Launcher Service"""; Flags: runhidden

[UninstallRun]
Filename: "{sys}\schtasks.exe"; Parameters: "/End /TN ""VLC Launcher Service"""; Flags: runhidden
Filename: "{sys}\schtasks.exe"; Parameters: "/Delete /TN ""VLC Launcher Service"" /F"; Flags: runhidden
; Clean up old Windows Service if upgrading from v0.1
Filename: "{sys}\sc.exe"; Parameters: "stop ""VLC Launcher Service"""; Flags: runhidden skipifdoesntexist
Filename: "{sys}\sc.exe"; Parameters: "delete ""VLC Launcher Service"""; Flags: runhidden skipifdoesntexist

[Icons]
Name: "{group}\Uninstall VLC Launcher"; Filename: "{uninstallexe}"

[Code]
function InitializeSetup: Boolean;
begin
  Result := True;
end;