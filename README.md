# VLC Stream Launcher


## Disclaimer
 - All the wierdness is intended, that is how AI works


- Design and artitecture: Deepseek
- Coding: Deepseek + Gemini
- Graphics: Gemini
- README: Deepsek

## Requirements

- FFmpeg installed and yt-dlp



Browser extension + local Windows Service created by both Free Gemini and $1 in Deepseek credits that detects streaming media links on any webpage and launches them directly in VLC Media Player. Supports YouTube (via yt-dlp), HLS/DASH manifests, MP3/MP4 audio, and more.



## Architecture

```
Chrome Extension (MV3)          Windows Service (.NET 10)
┌─────────────────────┐         ┌──────────────────────┐
│  popup.js           │  HTTP   │  Program.cs          │
│  background.js      │◄───────►│  /launch  /formats   │
│  content.js         │ :8765   │  /probe   /health    │
└─────────────────────┘         └──────┬───────────────┘
                                       │
                              ┌────────▼──────────────┐
                              │  yt-dlp + ffmpeg      │
                              │  VLC Media Player     │
                              └───────────────────────┘
```

## Features

- **Auto-detect streams** — HLS (.m3u8), DASH (.mpd), MP3, MP4, and more
- **YouTube support** — Full quality picker via yt-dlp (144p → 4K, merged audio)
- **Quality picker** — Dropdown with all available formats, sorted by resolution
- **One-click launch** — Sends detected URLs to VLC
- **Right-click context menu** — "Play in VLC" on any link/video/audio on any page
- **Persistent state** — Streams, quality info, and format lists survive service worker restarts
- **Keyboard navigation** — ↑↓ to browse, Enter to launch, Esc to close
- **Stream history** — Last 20 launched URLs saved
- **VLC controls** — Always on Top, Fullscreen, Loop, Speed (0.5x–2x)
- **Dark mode** — Auto-detects system theme

## Prerequisites

| Tool | Required for |
|---|---|
| [VLC Media Player](https://www.videolan.org/vlc/) | Playing streams |
| [.NET 10 SDK](https://dotnet.microsoft.com/download) | Building the service |
| [yt-dlp](https://github.com/yt-dlp/yt-dlp) | YouTube/video platform support |
| [ffmpeg](https://ffmpeg.org) | High-quality video+audio merging (optional, for 1080p+) |

## Quick Start

### 1. Install the Windows Service

- Open in Visual Studio 2022 or 2026 and Compile
- or installed the already compiled binaries in the release section

 Or 

```powershell
# Clone or download this repository
cd vlc-launcher-extension

# Run the installer (PowerShell as Administrator)
.\install.ps1
```

This will:
- Build and publish the .NET service
- Register it as a Windows Service named "VLC Launcher Service"
- Start the service on `http://localhost:8765`

To uninstall:
```powershell
.\uninstall.ps1
```

### 2. Load the Chrome Extension

1. Open Chrome → `chrome://extensions`
2. Enable **Developer mode** (top right)
3. Click **Load unpacked**
4. Select the `vlc-launcher-extension` folder
5. The VLC Launcher icon appears in your toolbar

### 3. Verify

Open PowerShell and test:
```powershell
Invoke-RestMethod http://localhost:8765/health
# → {"status":"ok","timestamp":"..."}
```

## Manual Development Run

```powershell
cd VlcLauncherService
dotnet run
# → Now listening on: http://localhost:8765
```

## Files

```
vlc-launcher-extension/
├── VlcLauncherService/        # .NET 10 Web API + Windows Service
│   ├── Program.cs             # HTTP endpoints, yt-dlp integration, VLC launcher
│   ├── VlcLauncherService.csproj
│   └── bin/Debug/net10.0/     # Place yt-dlp.exe and ffmpeg.exe here
├── vlc-launcher-extension/    # Chrome MV3 Extension
│   ├── manifest.json
│   ├── background.js          # Service worker — webRequest, message routing, state
│   ├── content.js             # Injected script — detects <video>/<audio> elements
│   ├── popup.html             # Extension popup UI
│   ├── popup.js               # Popup logic — render, polling, keyboard nav
│   └── icons/                 # Extension icons (16/48/128 px)
├── install.ps1                # Windows Service installer
├── uninstall.ps1              # Windows Service remover
└── README.md
```

## API Endpoints

| Method | Path | Description |
|---|---|---|
| `POST` | `/launch` | Launch a URL in VLC. Body: `{"url":"...","alwaysOnTop":bool,"fullscreen":bool,"loop":bool,"speed":"1.5","format":"137"}` |
| `GET` | `/formats?url=...` | List available formats (quality options) for a YouTube/video URL |
| `POST` | `/probe` | Pre-resolve a YouTube URL (yt-dlp runs in background, caches result) |
| `GET` | `/health` | Health check |

## VLC Command-Line Flags Used

| UI Control | VLC Flag |
|---|---|
| Always on Top | `--video-on-top` |
| Fullscreen | `--fullscreen` |
| Loop | `--loop` |
| Speed | `--rate=1.5` |

## Troubleshooting

**"VLC executable not found"** — Set the `VLC_PATH` environment variable or install VLC to the default location.

**YouTube videos have no sound** — Install ffmpeg (`winget install ffmpeg`). Higher qualities (1080p+) are video-only and need merging.

**Quality dropdown empty** — Wait a few seconds after loading a YouTube page. Formats are pre-fetched in the background.

**Extension shows "context invalid"** — Reload the extension in `chrome://extensions`.

## License

Personal use. yt-dlp integration respects YouTube's ToS by streaming directly without downloading to disk.


### Enjoy you are slopped extension