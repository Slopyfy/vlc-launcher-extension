// Worker is unused — the HTTP server in Program.cs handles all functionality.
// Kept as a placeholder in case periodic background tasks are needed later.

namespace VlcLauncherService;

public class Worker(ILogger<Worker> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        // No-op: the HTTP server (Program.cs) is the active component.
        while (!stoppingToken.IsCancellationRequested)
        {
            await Task.Delay(Timeout.Infinite, stoppingToken);
        }
    }
}
