using System;
using System.Threading;
using System.Windows.Forms;

namespace VlcLauncherService
{
    internal static class Program
    {
        // This must stay declared at the class level so the Garbage Collector doesn't destroy it
        private static Mutex? _mutex;

        [STAThread]
        static void Main()
        {
            // Create a uniquely named Mutex for your application
            _mutex = new Mutex(true, "VlcLauncherService_SingleInstanceMutex", out bool isNewInstance);

            if (!isNewInstance)
            {
                // An instance is already running! Alert the user and exit cleanly.
                MessageBox.Show(
                    "VLC Launcher Service is already running in the background.\n\nPlease check your System Tray (near the clock on your taskbar) for the icon.",
                    "Already Running",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Information);

                return; // Stop execution here
            }

            ApplicationConfiguration.Initialize();
            var appCtx = new VlcTrayContext();
            Application.Run(appCtx);
        }
    }
}