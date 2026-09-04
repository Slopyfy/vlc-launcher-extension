# Deploy the freshly built VlcLauncherService into Program Files and restart it.
# Run as Administrator:  PowerShell -ExecutionPolicy Bypass -File .\update-service.ps1

$ErrorActionPreference = "Stop"
$root = $PSScriptRoot
$publishDir = "$root\publish"
$serviceDir = "$env:ProgramFiles\VlcLauncherService"
$taskName = "VLC Launcher Service"

if (-NOT ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole] "Administrator")) {
    Write-Host "ERROR: Run this script as Administrator." -ForegroundColor Red
    Write-Host "  PowerShell -ExecutionPolicy Bypass -File .\update-service.ps1" -ForegroundColor Yellow
    exit 1
}

if (-not (Test-Path "$publishDir\VlcLauncherService.exe")) {
    Write-Host "ERROR: publish\VlcLauncherService.exe not found. Run .\package.ps1 or dotnet publish first." -ForegroundColor Red
    exit 1
}

Write-Host "Stopping existing service..." -ForegroundColor Yellow
Get-Process VlcLauncherService -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
schtasks.exe /End /TN $taskName 2>$null | Out-Null
Start-Sleep -Seconds 1

Write-Host "Copying updated files to $serviceDir ..." -ForegroundColor Green
Copy-Item "$publishDir\*" "$serviceDir\" -Recurse -Force

Write-Host "Starting service..." -ForegroundColor Green
$task = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
if ($task) {
    Start-ScheduledTask -TaskName $taskName
} else {
    Write-Host "Scheduled task not found; launching exe directly." -ForegroundColor Yellow
    Start-Process "$serviceDir\VlcLauncherService.exe"
}

Write-Host ""
Write-Host "Done. Service updated and running." -ForegroundColor Green
Write-Host "Test: Invoke-RestMethod http://localhost:8765/health" -ForegroundColor Gray
