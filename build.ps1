# Build script — creates a distributable package
# Prerequisites: dotnet SDK 10, optionally Inno Setup for .exe installer

param(
    [switch]$Installer,   # Also create Inno Setup .exe
    [switch]$ZipOnly      # Only create ZIP (no installer)
)

$ErrorActionPreference = "Stop"
$root = $PSScriptRoot
$publishDir = "$root\publish"
$distDir = "$root\dist"

Write-Host "=== VLC Launcher Service — Build ===" -ForegroundColor Cyan

# ── 1. Publish .NET ──
Write-Host "[1/4] Publishing .NET service..." -ForegroundColor Green
Push-Location "$root\VlcLauncherService"
dotnet publish -c Release -o "$publishDir" --self-contained false -f net10.0-windows
Pop-Location

# ── 2. Download yt-dlp ──
Write-Host "[2/4] Downloading yt-dlp..." -ForegroundColor Green
$ytDlp = "$publishDir\yt-dlp.exe"
if (-not (Test-Path $ytDlp)) {
    Invoke-WebRequest -Uri "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe" -OutFile $ytDlp
    Write-Host "  yt-dlp downloaded." -ForegroundColor Gray
} else { Write-Host "  yt-dlp already present." -ForegroundColor Gray }

# ── 3. Download ffmpeg ──
Write-Host "[3/4] Downloading ffmpeg..." -ForegroundColor Green
$ffmpeg = "$publishDir\ffmpeg.exe"
if (-not (Test-Path $ffmpeg)) {
    $zip = "$env:TEMP\ffmpeg_build.zip"
    Invoke-WebRequest -Uri "https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip" -OutFile $zip
    Expand-Archive $zip -DestinationPath "$env:TEMP\ffmpeg_build" -Force
    $exe = Get-ChildItem "$env:TEMP\ffmpeg_build" -Recurse -Filter "ffmpeg.exe" | Select-Object -First 1
    if ($exe) { Copy-Item $exe.FullName $ffmpeg -Force }
    Remove-Item $zip, "$env:TEMP\ffmpeg_build" -Recurse -Force -ErrorAction SilentlyContinue
    Write-Host "  ffmpeg downloaded." -ForegroundColor Gray
} else { Write-Host "  ffmpeg already present." -ForegroundColor Gray }

# ── 4. Package ──
Write-Host "[4/4] Packaging..." -ForegroundColor Green
New-Item -ItemType Directory -Path $distDir -Force | Out-Null

if (-not $Installer) {
    # Create ZIP
    $zipPath = "$distDir\VlcLauncherService.zip"
    Compress-Archive -Path "$publishDir\*" -DestinationPath $zipPath -Force
    Write-Host ""
    Write-Host "ZIP created: $zipPath" -ForegroundColor Green
    Write-Host "Size: $([math]::Round((Get-Item $zipPath).Length / 1MB, 1)) MB" -ForegroundColor White
}

if ($Installer) {
    # Copy install scripts
    Copy-Item "$root\install.ps1" "$distDir\" -Force
    Copy-Item "$root\uninstall.ps1" "$distDir\" -Force
    Copy-Item "$root\vlc-launcher-extension\icons\icon128.png" "$publishDir\" -Force

    # Check for Inno Setup
    $iscc = Get-Command iscc -ErrorAction SilentlyContinue
    if ($iscc) {
        Write-Host "  Building Inno Setup installer..." -ForegroundColor Gray
        Push-Location $root
        & iscc setup.iss
        Pop-Location
        Write-Host "  Installer created in dist\" -ForegroundColor Green
    } else {
        Write-Host "  Inno Setup not found. Install from https://jrsoftware.org/isinfo.php" -ForegroundColor Yellow
        Write-Host "  ZIP + install.ps1 available in dist\" -ForegroundColor Yellow
    }
}

Write-Host ""
Write-Host "Build complete!" -ForegroundColor Green
Write-Host "  Distribution: $distDir" -ForegroundColor White
