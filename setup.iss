
; VLC Launcher Service — Inno Setup Installer
; Download Inno Setup 6: https://jrsoftware.org/isinfo.php
; Run: iscc setup.iss

#define MyAppName "VLC Launcher Service"
#define MyAppVersion "0.1"
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
; ffmpeg
Source: "publish\ffmpeg.exe"; DestDir: "{app}"; Flags: ignoreversion
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
; Starts the application immediately after the installer finishes
Filename: "{app}\{#MyAppExeName}"; Description: "Launch {#MyAppName}"; Flags: nowait postinstall skipifsilent

[UninstallRun]
; Clean up old Windows Service if upgrading from v0.1
Filename: "{sys}\sc.exe"; Parameters: "stop ""VLC Launcher Service"""; Flags: runhidden skipifdoesntexist
Filename: "{sys}\sc.exe"; Parameters: "delete ""VLC Launcher Service"""; Flags: runhidden skipifdoesntexist
; Clean up any leftover scheduled tasks from your previous setup attempts
Filename: "{sys}\schtasks.exe"; Parameters: "/End /TN ""VLC Launcher Service"""; Flags: runhidden skipifdoesntexist
Filename: "{sys}\schtasks.exe"; Parameters: "/Delete /TN ""VLC Launcher Service"" /F"; Flags: runhidden skipifdoesntexist