
using System;
using System.Windows.Forms;

namespace VlcLauncherService
{
    internal static class Program
    {
        [STAThread]
        static void Main()
        {
            ApplicationConfiguration.Initialize();
            var appCtx = new VlcTrayContext();
            Application.Run(appCtx);
        }
    }
}