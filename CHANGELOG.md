# Changelog

## VLC Launcher Extension v1.2 — Chrome & Firefox

### Fixed
- **HLS/DASH links with query strings** — URLs like `…/index.m3u8?token=…` (VidSrc/Vidify) are now detected; previously only path-token links were caught.
- **Detection stopping after tab switches** — switching away and back no longer breaks detection.
- **Detection after the browser idles** — the background listener is now woken from the page, so new streams are detected without reloading the tab (e.g. after watching in VLC for a while).
- **Dynamically-loaded / iframe players** — now picked up without a full page refresh.
- **Firefox lint warnings** — replaced `innerHTML` assignments with safe DOM APIs.

## VLC Launcher Extension v1.1 — Chrome & Firefox

### New
- **Newest streams first** — freshly detected links always appear at the top of the list.
- **Old vs new is now obvious** — a `NEW` badge marks links detected in the last 15 seconds, and every entry shows its age (`30s`, `5m`, `2h`, …).
- **Token-revealing labels** — URLs now show the signed token (`…/vd/S204QW05LUoz…/index-1080p.m3u8`), so links that only differ by token no longer look identical.
- **Master playlists** are labeled `Master — auto quality` with a short token snippet.
- **Missing service detection** — if the VLC Launcher Service isn't running, the popup shows a banner linking to the GitHub releases page so users can install it.

### Fixed
- **YouTube** — VLC no longer exits immediately: yt-dlp is updated and runs with a JavaScript runtime (`--js-runtimes node`).
- **YouTube quality selection** — picking a specific quality now works for combined (`18`, `22`) and audio formats, not just video-only ones.
- **Endless "Loading…"** — format requests are deduplicated and time out after 30s; the Launch button always enables (falls back to "Best quality").
- **Process pile-up** — probing and format requests no longer spawn a new yt-dlp process on every poll.
- **HLS/CDN links** — VLC now sends the browser's `User-Agent` and `Referer`, so protected streams that IDM could download are now accepted.

## VLC Launcher Service v0.3

### New
- `/health` endpoint for status checks.
- In-flight request deduplication + 45s timeouts for all yt-dlp calls.
- Installer bundles the **.NET 10 runtimes** (Windows Desktop + ASP.NET Core) and installs them silently if missing.

### Fixed
- YouTube direct-stream URLs no longer return 403 (yt-dlp updated; JS challenges solved via Node.js).
- Format selection handles video-only, combined, and audio formats.

## Packaging

`VlcLauncherService-Setup-v0.3.exe` now bundles:
- The VLC Launcher Service app
- yt-dlp
- ffmpeg
- .NET 10 runtimes (Windows Desktop + ASP.NET Core)
