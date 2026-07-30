# VLC Launcher Service — Installer
# Run as Administrator:  PowerShell -ExecutionPolicy Bypass -File .\install.ps1

$ErrorActionPreference = "Stop"
$serviceName = "VLC Launcher Service"
$serviceDir = "$env:ProgramFiles\VlcLauncherService"
$projectDir = "$PSScriptRoot\VlcLauncherService"

Write-Host "==================================" -ForegroundColor Cyan
Write-Host " VLC Launcher Service Installer" -ForegroundColor Cyan
Write-Host "==================================" -ForegroundColor Cyan
Write-Host ""

# ── Check admin ──
if (-NOT ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole] "Administrator")) {
    Write-Host "ERROR: Run this script as Administrator." -ForegroundColor Red
    Write-Host "  PowerShell -ExecutionPolicy Bypass -File .\install.ps1" -ForegroundColor Yellow
    exit 1
}

# ── Remove existing Windows Service (if any) ──
$existing = Get-Service -Name $serviceName -ErrorAction SilentlyContinue
if ($existing) {
    Write-Host "Removing old Windows Service..." -ForegroundColor Yellow
    Stop-Service -Name $serviceName -Force -ErrorAction SilentlyContinue
    sc.exe delete $serviceName | Out-Null
    Start-Sleep -Seconds 2
}

# ── Create Scheduled Task (runs in user session, can show VLC UI) ──
Write-Host "Creating startup task..." -ForegroundColor Green
$taskName = "VLC Launcher Service"
$existingTask = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
if ($existingTask) { Unregister-ScheduledTask -TaskName $taskName -Confirm:$false }

$action = New-ScheduledTaskAction -Execute "$serviceDir\VlcLauncherService.exe"
$trigger = New-ScheduledTaskTrigger -AtLogon
$principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive -RunLevel Highest
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)

Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Description "HTTP API for VLC Stream Launcher browser extension" | Out-Null

# ── Start the task ──
Start-ScheduledTask -TaskName $taskName
Start-Sleep -Seconds 3

$status = (Get-ScheduledTask -TaskName $taskName).State
if ($status -eq "Ready" -or $status -eq "Running") {
    Write-Host ""
    Write-Host "SUCCESS! Installed and running." -ForegroundColor Green
    Write-Host "  Path:     $serviceDir" -ForegroundColor White
    Write-Host "  URL:      http://localhost:8765" -ForegroundColor White
    Write-Host ""
    Write-Host "Test: Invoke-RestMethod http://localhost:8765/health" -ForegroundColor Gray
    Write-Host ""
    Write-Host "To uninstall: .\uninstall.ps1" -ForegroundColor Yellow
} else {
    Write-Host "WARNING: Task created but not running (state: $status)." -ForegroundColor Yellow
}
