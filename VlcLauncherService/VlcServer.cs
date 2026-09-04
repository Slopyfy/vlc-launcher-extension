using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Text.Json;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.DependencyInjection;

public static class VlcServer
{
    public static Action<string>? LogCallback;

    private static Process? currentVlcProcess = null;
    private static readonly object processLock = new();
    private static WebApplication? _webApp;

    private static readonly ConcurrentDictionary<string, (string, string?)> ResCache = new();
    private static readonly ConcurrentDictionary<string, List<FormatInfo>> FmtCache = new();
    private static readonly ConcurrentDictionary<string, Lazy<Task<List<FormatInfo>>>> FmtTasks = new();
    private static readonly ConcurrentDictionary<string, byte> Probing = new();
    private static bool _ffmpegOk;

    // Browser-like UA so protected CDN/HLS links accept VLC's requests.
    private const string DefaultUserAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

    public static async Task StartAsync(int port = 8765)
    {
        var builder = WebApplication.CreateBuilder();

        builder.Services.AddCors(options =>
        {
            options.AddDefaultPolicy(p => p.AllowAnyOrigin().AllowAnyHeader().AllowAnyMethod());
        });

        _webApp = builder.Build();

        // Check ffmpeg availability on startup
        try
        {
            var p = Process.Start(new ProcessStartInfo(GetYtDlpPath().Replace("yt-dlp", "ffmpeg"), "-version")
            {
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                UseShellExecute = false,
                CreateNoWindow = true
            });
            if (p != null) { p.WaitForExit(2000); _ffmpegOk = p.ExitCode == 0; }
        }
        catch { }
        if (!_ffmpegOk && File.Exists(Path.Combine(AppContext.BaseDirectory, "ffmpeg.exe"))) _ffmpegOk = true;

        // ── Request Logging Middleware ──────────────────────────────────
        _webApp.Use(async (context, next) =>
        {
            if (context.Request.Method != "OPTIONS") // Ignore pre-flight spam
                LogCallback?.Invoke($"[HTTP] {context.Request.Method} {context.Request.Path}");

            try
            {
                await next();
            }
            catch (Exception ex)
            {
                LogCallback?.Invoke($"[HTTP ERROR] {context.Request.Path}: {ex.Message}");
                throw;
            }
        });

        _webApp.UseCors();

        // ── GET /formats ────────────────────────────────────────────────
        _webApp.MapGet("/formats", async (HttpContext ctx) =>
        {
            var url = ctx.Request.Query["url"].FirstOrDefault();
            if (string.IsNullOrEmpty(url)) return Results.BadRequest(new { error = "Missing ?url=" });

            if (FmtCache.TryGetValue(url, out var cachedFormats))
            {
                LogCallback?.Invoke($"[Formats] Returned {cachedFormats.Count} cached formats for {url}");
                return Results.Ok(cachedFormats);
            }

            // Deduplicate in-flight requests: the popup polls every few seconds,
            // so without this each poll would spawn another yt-dlp process.
            LogCallback?.Invoke($"[Formats] Asking yt-dlp to extract qualities for: {url}");
            var lazy = FmtTasks.GetOrAdd(url, _ => new Lazy<Task<List<FormatInfo>>>(() => GetYtDlpFormatsAsync(url)));
            var formats = await lazy.Value;
            FmtCache[url] = formats;
            FmtTasks.TryRemove(url, out _);

            LogCallback?.Invoke($"[Formats] Extracted {formats.Count} qualities.");
            return Results.Ok(formats);
        });

        // ── POST /probe (Works for both extensions) ─────────────────────
        _webApp.MapPost("/probe", async (HttpContext ctx) =>
        {
            using var r = new StreamReader(ctx.Request.Body);
            var body = await r.ReadToEndAsync();
            var j = JsonSerializer.Deserialize<LaunchReqModel>(body, new JsonSerializerOptions { PropertyNameCaseInsensitive = true });

            if (string.IsNullOrEmpty(j?.Url)) return Results.BadRequest(new { error = "Missing url" });

            if (!ResCache.ContainsKey(j.Url) && Probing.TryAdd(j.Url, 0))
            {
                LogCallback?.Invoke($"[Probe] New URL detected, caching streams in background: {j.Url}");
                _ = Task.Run(async () =>
                {
                    try { await ResolveUrlAsync(j.Url); }
                    finally { Probing.TryRemove(j.Url, out _); }
                });
            }
            return Results.Ok(new { probing = true });
        });

        // ── POST /launch ────────────────────────────────────────────────
        _webApp.MapPost("/launch", async (HttpContext ctx) =>
        {
            using var reader = new StreamReader(ctx.Request.Body);
            var body = await reader.ReadToEndAsync();
            LogCallback?.Invoke($"[Launch] Received Request Payload: {body}");

            var j = JsonSerializer.Deserialize<LaunchReqModel>(body, new JsonSerializerOptions { PropertyNameCaseInsensitive = true });

            string? rawUrl = j?.Url;
            string? formatId = j?.Format ?? j?.FormatId; // Supports both extensions
            bool alwaysOnTop = j?.AlwaysOnTop ?? false;
            bool fullscreen = j?.Fullscreen ?? false;
            bool loop = j?.Loop ?? false;
            string? speed = j?.Speed;
            string? referer = j?.Referer;
            string? userAgent = j?.UserAgent;

            if (string.IsNullOrWhiteSpace(rawUrl))
                return Results.BadRequest(new { error = "No URL provided." });

            string videoUrl = rawUrl;
            string? audioUrl = null;

            if (IsVideoPlatformUrl(rawUrl))
            {
                var urls = await ResolveDirectStreamUrlsAsync(rawUrl, formatId);
                if (urls.Length == 0)
                {
                    LogCallback?.Invoke("[ERROR] yt-dlp failed to return any stream URLs.");
                    return Results.BadRequest(new { error = "Failed to extract stream URL via yt-dlp." });
                }

                videoUrl = urls[0];
                if (urls.Length > 1)
                {
                    audioUrl = urls[1];
                }
            }

            KillExistingVlcProcesses();

            var argsList = new List<string> { $"\"{videoUrl}\"" };

            if (!string.IsNullOrWhiteSpace(audioUrl))
            {
                argsList.Add($"--input-slave=\"{audioUrl}\"");
            }

            argsList.Add("--no-video-title-show");
            argsList.Add("--one-instance");
            argsList.Add("--play-and-exit");

            // Replay the browser's headers so protected HLS/CDN links don't
            // reject VLC. IDM works on the same URL because it sends a browser
            // User-Agent (and usually a Referer) — VLC's defaults are blocked.
            string effectiveUserAgent = !string.IsNullOrWhiteSpace(userAgent) ? userAgent : DefaultUserAgent;
            argsList.Add($"--http-user-agent=\"{effectiveUserAgent}\"");

            if (!string.IsNullOrWhiteSpace(referer))
                argsList.Add($"--http-referrer=\"{referer}\"");

            if (alwaysOnTop) argsList.Add("--video-on-top");
            if (fullscreen) argsList.Add("--fullscreen");
            if (loop) argsList.Add("--loop");

            if (!string.IsNullOrWhiteSpace(speed) && double.TryParse(speed, out double spd))
                argsList.Add($"--rate={spd}");

            string arguments = string.Join(" ", argsList);
            LogCallback?.Invoke($"[VLC] Executing: {arguments}");

            try
            {
                lock (processLock)
                {
                    var psi = new ProcessStartInfo
                    {
                        FileName = GetVlcPath(),
                        Arguments = arguments,
                        UseShellExecute = false,
                        CreateNoWindow = false
                    };
                    currentVlcProcess = Process.Start(psi);
                }
                LogCallback?.Invoke("[VLC] Successfully launched!");
                return Results.Ok(new { message = "VLC launched successfully." });
            }
            catch (Exception ex)
            {
                LogCallback?.Invoke($"[ERROR] Failed to launch VLC: {ex.Message}");
                return Results.Problem($"Failed to start VLC: {ex.Message}");
            }
        });

        await _webApp.RunAsync($"http://localhost:{port}");
    }

    public static async Task StopAsync()
    {
        if (_webApp != null)
        {
            await _webApp.StopAsync();
        }
    }

    private static string GetYtDlpPath()
    {
        var localPath = Path.Combine(AppContext.BaseDirectory, "yt-dlp.exe");
        return File.Exists(localPath) ? localPath : "yt-dlp";
    }

    private static bool IsVideoPlatformUrl(string url)
    {
        string lower = url.ToLower();
        return lower.Contains("youtube.com") || lower.Contains("youtu.be") ||
               lower.Contains("vimeo.com") || lower.Contains("twitch.tv");
    }

    private static string GetVlcPath()
    {
        // Check standard 64-bit and 32-bit installation folders
        string[] paths = {
            @"C:\Program Files\VideoLAN\VLC\vlc.exe",
            @"C:\Program Files (x86)\VideoLAN\VLC\vlc.exe"
        };
        foreach (var p in paths)
        {
            if (File.Exists(p)) return p;
        }
        return "vlc"; // Fallback to system environment variable
    }

    private static void KillExistingVlcProcesses()
    {
        try
        {
            var processes = Process.GetProcessesByName("vlc");
            if (processes.Length > 0) LogCallback?.Invoke($"[VLC] Closing {processes.Length} existing instance(s)...");

            foreach (var proc in processes)
            {
                if (!proc.HasExited)
                {
                    proc.Kill(); // Do not use WaitForExit here, it blocks the launch if VLC hangs
                }
            }
        }
        catch (Exception ex)
        {
            LogCallback?.Invoke($"[VLC] Warning: Could not cleanly close existing VLC: {ex.Message}");
        }
    }

    private static async Task<(string, string?)> ResolveUrlAsync(string url)
    {
        try
        {
            var psi = new ProcessStartInfo
            {
                FileName = GetYtDlpPath(),
                Arguments = "--no-playlist --js-runtimes node -g --get-title \"" + url + "\"",
                RedirectStandardOutput = true,
                RedirectStandardError = true, // Prevent deadlocks
                UseShellExecute = false,
                CreateNoWindow = true
            };
            using var p = Process.Start(psi);
            if (p == null) return (url, null);

            var outTask = p.StandardOutput.ReadToEndAsync();
            var errTask = p.StandardError.ReadToEndAsync();
            try
            {
                await Task.WhenAll(outTask, errTask, p.WaitForExitAsync()).WaitAsync(TimeSpan.FromSeconds(45));
            }
            catch (TimeoutException)
            {
                try { p.Kill(entireProcessTree: true); } catch { }
                LogCallback?.Invoke("[yt-dlp Background] Timed out after 45s.");
                return (url, null);
            }

            var stdout = outTask.Result;
            var stderr = errTask.Result;

            if (!string.IsNullOrWhiteSpace(stderr)) LogCallback?.Invoke($"[yt-dlp Background Warning] {stderr.Trim()}");

            var lines = stdout.Split('\n', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
            string? stream = null, t = null;
            foreach (var l in lines)
            {
                if (Uri.IsWellFormedUriString(l, UriKind.Absolute)) stream ??= l;
                else if (!l.StartsWith("ERROR")) t ??= l;
            }
            if (stream != null)
            {
                ResCache[url] = (stream, t);
                return (stream, t);
            }
        }
        catch (Exception ex)
        {
            LogCallback?.Invoke($"[yt-dlp Background Error] {ex.Message}");
        }
        return (url, null);
    }

    //private static async Task<string[]> ResolveDirectStreamUrlsAsync(string url, string? formatId)
    //{
    //    string formatArg = !string.IsNullOrWhiteSpace(formatId)
    //        ? $"-f \"{formatId}+bestaudio[ext=m4a]/{formatId}+bestaudio/best\""
    //        : "-f \"bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best\"";

    //    LogCallback?.Invoke($"[yt-dlp] Extracting direct URLs with args: {formatArg}");

    //    var psi = new ProcessStartInfo
    //    {
    //        FileName = GetYtDlpPath(),
    //        Arguments = $"-g {formatArg} \"{url}\"",
    //        RedirectStandardOutput = true,
    //        RedirectStandardError = true, // Critical for preventing deadlocks
    //        UseShellExecute = false,
    //        CreateNoWindow = true
    //    };

    //    using var proc = Process.Start(psi);
    //    if (proc == null) return new[] { url };

    //    // Read output and error asynchronously to prevent buffer deadlocks
    //    var outTask = proc.StandardOutput.ReadToEndAsync();
    //    var errTask = proc.StandardError.ReadToEndAsync();
    //    await Task.WhenAll(outTask, errTask, proc.WaitForExitAsync());

    //    string output = outTask.Result;
    //    string error = errTask.Result;

    //    if (!string.IsNullOrWhiteSpace(error))
    //    {
    //        LogCallback?.Invoke($"[yt-dlp Error/Warning]: {error.Trim()}");
    //    }

    //    return output.Split('\n', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
    //}


    private static async Task<string[]> ResolveDirectStreamUrlsAsync(string url, string? formatId)
    {
        // For video-only formats: <id>+bestaudio (gets separate video + audio URLs).
        // For combined/audio formats (e.g. 18, 140): fall back to <id> alone,
        // otherwise "18+bestaudio" is invalid and yt-dlp returns nothing.
        string formatArg = !string.IsNullOrWhiteSpace(formatId)
            ? $"-f \"{formatId}+bestaudio[ext=m4a]/{formatId}+bestaudio/{formatId}/best\""
            : "-f \"bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best\"";

        LogCallback?.Invoke($"[yt-dlp] Extracting direct URLs with args: {formatArg}");

        var psi = new ProcessStartInfo
        {
            FileName = GetYtDlpPath(),
            // THE FIX: Added --no-playlist so it doesn't try to parse 50 videos at once
            // --js-runtimes node lets yt-dlp solve YouTube's JS challenges (no deno needed)
            Arguments = $"--no-playlist --js-runtimes node -g {formatArg} \"{url}\"",
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            UseShellExecute = false,
            CreateNoWindow = true
        };

        using var proc = Process.Start(psi);
        if (proc == null) return new[] { url };

        // Read output and error asynchronously to prevent buffer deadlocks
        var outTask = proc.StandardOutput.ReadToEndAsync();
        var errTask = proc.StandardError.ReadToEndAsync();
        try
        {
            await Task.WhenAll(outTask, errTask, proc.WaitForExitAsync()).WaitAsync(TimeSpan.FromSeconds(45));
        }
        catch (TimeoutException)
        {
            try { proc.Kill(entireProcessTree: true); } catch { }
            LogCallback?.Invoke("[yt-dlp] Timed out after 45s resolving stream URLs.");
            return Array.Empty<string>();
        }

        string output = outTask.Result;
        string error = errTask.Result;

        if (!string.IsNullOrWhiteSpace(error))
        {
            LogCallback?.Invoke($"[yt-dlp Error/Warning]: {error.Trim()}");
        }

        return output.Split('\n', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
    }
    private static async Task<List<FormatInfo>> GetYtDlpFormatsAsync(string url)
    {
        try
        {
            var psi = new ProcessStartInfo
            {
                FileName = GetYtDlpPath(),
                Arguments = "--no-playlist --js-runtimes node -j \"" + url + "\"",
                RedirectStandardOutput = true,
                RedirectStandardError = true, // Critical for preventing deadlocks
                UseShellExecute = false,
                CreateNoWindow = true
            };

            using var p = Process.Start(psi);
            if (p == null) return new();

            var outTask = p.StandardOutput.ReadToEndAsync();
            var errTask = p.StandardError.ReadToEndAsync();
            try
            {
                await Task.WhenAll(outTask, errTask, p.WaitForExitAsync()).WaitAsync(TimeSpan.FromSeconds(45));
            }
            catch (TimeoutException)
            {
                try { p.Kill(entireProcessTree: true); } catch { }
                LogCallback?.Invoke("[yt-dlp Formats] Timed out after 45s.");
                return new();
            }

            string stdout = outTask.Result;
            string stderr = errTask.Result;

            if (!string.IsNullOrWhiteSpace(stderr)) LogCallback?.Invoke($"[yt-dlp Formats Warning] {stderr.Trim()}");
            if (string.IsNullOrWhiteSpace(stdout)) return new();

            using var doc = JsonDocument.Parse(stdout.Trim());
            var fmts = new List<FormatInfo>();
            if (doc.RootElement.TryGetProperty("formats", out var arr))
            {
                foreach (var f in arr.EnumerateArray())
                {
                    var vc = f.TryGetProperty("vcodec", out var v) ? v.GetString() ?? "" : "";
                    var ac = f.TryGetProperty("acodec", out var a) ? a.GetString() ?? "" : "";
                    var hv = !string.IsNullOrEmpty(vc) && vc != "none";
                    var ha = !string.IsNullOrEmpty(ac) && ac != "none";
                    if (!hv && !ha) continue;

                    var ext = f.TryGetProperty("ext", out var e) ? e.GetString() ?? "" : "";
                    var fid = f.TryGetProperty("format_id", out var fidProp) ? fidProp.GetString() ?? "" : "";

                    if (ext == "mhtml" || fid.Contains("storyboard", StringComparison.OrdinalIgnoreCase)) continue;

                    fmts.Add(new FormatInfo
                    {
                        Id = fid,
                        Ext = ext,
                        Height = f.TryGetProperty("height", out var h) && h.ValueKind == JsonValueKind.Number ? h.GetInt32() : 0,
                        Tbr = (f.TryGetProperty("tbr", out var tb) && tb.ValueKind == JsonValueKind.Number ? tb.GetDouble() : 0) is > 0 and var tv ? tv : f.TryGetProperty("abr", out var ab) && ab.ValueKind == JsonValueKind.Number ? ab.GetDouble() : 0,
                        HasAudio = ha,
                        HasVideo = hv,
                        Type = hv && ha ? "combined" : (hv ? "video" : "audio")
                    });
                }
            }

            fmts.Sort((a, b) =>
            {
                bool iv(string t) => t is "combined" or "video";
                if (iv(a.Type) && iv(b.Type))
                {
                    var hc = b.Height.CompareTo(a.Height);
                    if (hc != 0) return hc;
                    if (a.Type == "combined" && b.Type != "combined") return -1;
                    if (a.Type != "combined" && b.Type == "combined") return 1;
                    return b.Tbr.CompareTo(a.Tbr);
                }
                if (iv(a.Type)) return -1;
                if (iv(b.Type)) return 1;
                return b.Tbr.CompareTo(a.Tbr);
            });

            var dedup = new List<FormatInfo>();
            var seen = new HashSet<int>();
            foreach (var f in fmts) { if (f.Type == "audio" || seen.Add(f.Height)) dedup.Add(f); }
            return dedup;
        }
        catch (Exception ex)
        {
            LogCallback?.Invoke($"[yt-dlp JSON parsing Error] {ex.Message}");
            return new();
        }
    }
}

public class LaunchReqModel
{
    public string? Url { get; set; }
    public bool AlwaysOnTop { get; set; }
    public bool Fullscreen { get; set; }
    public bool Loop { get; set; }
    public int Volume { get; set; } = 100;
    public string? Speed { get; set; }
    public string? Format { get; set; }
    public string? FormatId { get; set; }
    public string? Referer { get; set; }
    public string? UserAgent { get; set; }
}

public class FormatInfo
{
    public string Id { get; set; } = "";
    public string Ext { get; set; } = "";
    public int Height { get; set; }
    public double Tbr { get; set; }
    public bool HasAudio { get; set; }
    public bool HasVideo { get; set; }
    public string Type { get; set; } = "";
}