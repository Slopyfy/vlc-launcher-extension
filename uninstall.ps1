# VLC Launcher Service — Uninstaller
# Run as Administrator

$ErrorActionPreference = "Stop"
$taskName = "VLC Launcher Service"

if (-NOT ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole] "Administrator")) {
    Write-Host "ERROR: Run this script as Administrator." -ForegroundColor Red
    exit 1
}

Write-Host "Uninstalling VLC Launcher Service..." -ForegroundColor Yellow

# Remove scheduled task
$existingTask = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
if ($existingTask) {
    Stop-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
    Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
    Write-Host "  Scheduled task removed." -ForegroundColor Green
}

# Remove old Windows Service (if upgrading from older version)
$existingSvc = Get-Service -Name $taskName -ErrorAction SilentlyContinue
if ($existingSvc) {
    Stop-Service -Name $taskName -Force -ErrorAction SilentlyContinue
    sc.exe delete $taskName | Out-Null
    Write-Host "  Old Windows Service removed." -ForegroundColor Green
}

$serviceDir = "$env:ProgramFiles\VlcLauncherService"
if (Test-Path $serviceDir) {
    Remove-Item -Recurse -Force $serviceDir
    Write-Host "  Files removed: $serviceDir" -ForegroundColor Green
}

Write-Host "Uninstall complete. A reboot is not required." -ForegroundColor Green
