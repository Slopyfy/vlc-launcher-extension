# One-click build → Inno Setup installer
# Prerequisites: dotnet SDK, Inno Setup 6 (iscc in PATH)
# Run: .\package.ps1

$ErrorActionPreference = "Stop"
$root = $PSScriptRoot

Write-Host "==================================" -ForegroundColor Cyan
Write-Host " VLC Launcher — Full Build" -ForegroundColor Cyan
Write-Host "==================================" -ForegroundColor Cyan

# ── Step 1: Publish .NET ──
Write-Host "[1/3] Publishing .NET service..." -ForegroundColor Green
Push-Location "$root\VlcLauncherService"
dotnet publish -c Release -o "$root\publish" --self-contained false -f net10.0-windows
Pop-Location

# ── Step 2: Download tools ──
Write-Host "[2/3] Downloading yt-dlp + ffmpeg..." -ForegroundColor Green

$ytDlp = "$root\publish\yt-dlp.exe"
if (-not (Test-Path $ytDlp)) {
    Invoke-WebRequest -Uri "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe" -OutFile $ytDlp
    Write-Host "  yt-dlp downloaded" -ForegroundColor Gray
}

$ffmpeg = "$root\publish\ffmpeg.exe"
if (-not (Test-Path $ffmpeg)) {
    $zip = "$env:TEMP\ffmpeg.zip"
    Invoke-WebRequest -Uri "https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip" -OutFile $zip
    Expand-Archive $zip -DestinationPath "$env:TEMP\ffmpeg_extract" -Force
    $exe = Get-ChildItem "$env:TEMP\ffmpeg_extract" -Recurse -Filter "ffmpeg.exe" | Select-Object -First 1
    if ($exe) { Copy-Item $exe.FullName $ffmpeg -Force }
    Remove-Item $zip, "$env:TEMP\ffmpeg_extract" -Recurse -Force -ErrorAction SilentlyContinue
    Write-Host "  ffmpeg downloaded" -ForegroundColor Gray
}

# Copy icon for the installer to embed
Copy-Item "$root\icons\icon128.ico" "$root\publish\icon128.ico" -Force

# ── Step 3: Compile Inno Setup ──
Write-Host "[3/3] Compiling installer..." -ForegroundColor Green

$iscc = Get-Command iscc -ErrorAction SilentlyContinue
if (-not $iscc) {
    Write-Host "ERROR: Inno Setup not found. Install from https://jrsoftware.org/isinfo.php" -ForegroundColor Red
    Write-Host "The publish\ folder is ready — you can compile setup.iss manually." -ForegroundColor Yellow
    exit 1
}

Push-Location $root
& iscc setup.iss
Pop-Location

$setupExe = "$root\dist\VlcLauncherService-Setup.exe"
if (Test-Path $setupExe) {
    Write-Host ""
    Write-Host "DONE!" -ForegroundColor Green
    Write-Host "  Installer: $setupExe" -ForegroundColor White
    Write-Host "  Size:      $([math]::Round((Get-Item $setupExe).Length / 1MB, 1)) MB" -ForegroundColor White
} else {
    Write-Host "ERROR: Installer not created. Check Inno Setup output above." -ForegroundColor Red
}
