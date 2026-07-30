using System;
using System.Drawing;
using System.Threading.Tasks;
using System.Windows.Forms;

namespace VlcLauncherService
{
    public class VlcTrayContext : ApplicationContext
    {
        private readonly NotifyIcon _tray;
        private readonly MainForm _form;
        private bool _running;

        public VlcTrayContext()
        {
            _tray = new NotifyIcon
            {
                Icon = Icon.ExtractAssociatedIcon(Application.ExecutablePath)!,
                Visible = true,
                Text = "VLC Launcher"
            };

            _tray.DoubleClick += (_, _) => ShowForm();
            _tray.ContextMenuStrip = new ContextMenuStrip();
            _tray.ContextMenuStrip.Items.Add("Open VLC Launcher", null, (_, _) => ShowForm());
            _tray.ContextMenuStrip.Items.Add(new ToolStripSeparator());
            _tray.ContextMenuStrip.Items.Add("Exit", null, (_, _) => Exit());

            _form = new MainForm(this);
            _form.FormClosing += (_, e) => { e.Cancel = true; _form.Hide(); };

            StartServer();
        }

        public void StartServer()
        {
            if (_running) return;
            _running = true;
            _form.UpdateStatus(true);

            // WIRING UP THE LOGS - This connects the server engine to your UI log box
            VlcServer.LogCallback = _form.Log;

            _form.Log("Server starting on http://localhost:8765");

            Task.Run(async () =>
            {
                try
                {
                    await VlcServer.StartAsync(8765);
                }
                catch (Exception ex)
                {
                    _form.Log("Server error: " + ex.Message);
                }
                finally
                {
                    _running = false;
                    _form.UpdateStatus(false);
                    _tray.Text = "VLC Launcher";
                    _form.Log("Server stopped.");
                }
            });

            _tray.Text = "VLC Launcher - Running";
        }

        public async void StopServer()
        {
            if (!_running) return;
            _running = false;
            _form.UpdateStatus(false);

            await VlcServer.StopAsync();
            _tray.Text = "VLC Launcher";
            _form.Log("Server stopped.");
        }

        private void Exit()
        {
            StopServer();
            _tray.Visible = false;
            _tray.Dispose();
            Application.Exit();
        }

        public void ShowForm()
        {
            _form.Show();
            _form.BringToFront();
        }
    }

    public class MainForm : Form
    {
        private readonly VlcTrayContext _ctx;
        private readonly TextBox _logBox;
        private readonly Label _statusLabel;
        private readonly Button _startBtn, _stopBtn;

        public MainForm(VlcTrayContext ctx)
        {
            _ctx = ctx;

            Text = "VLC Launcher";
            Size = new Size(700, 450);
            MinimumSize = new Size(500, 350);
            Icon = Icon.ExtractAssociatedIcon(Application.ExecutablePath)!;
            StartPosition = FormStartPosition.CenterScreen;
            BackColor = Color.FromArgb(245, 245, 245);

            var title = new Label
            {
                Text = "VLC Launcher Service",
                Font = new Font("Segoe UI", 14, FontStyle.Bold),
                Location = new Point(18, 15),
                AutoSize = true
            };

            _statusLabel = new Label
            {
                Text = "Starting...",
                Font = new Font("Segoe UI", 10),
                Location = new Point(20, 60),
                AutoSize = true,
                ForeColor = Color.Gray
            };

            Controls.AddRange(new Control[] { title, _statusLabel });

            _startBtn = new Button { Text = "Start", Size = new Size(110, 45), Font = new Font("Segoe UI", 10), Location = new Point(18, 95), FlatStyle = FlatStyle.Flat, Cursor = Cursors.Hand };
            _stopBtn = new Button { Text = "Stop", Size = new Size(110, 45), Font = new Font("Segoe UI", 10), Location = new Point(138, 95), FlatStyle = FlatStyle.Flat, Cursor = Cursors.Hand };

            _startBtn.FlatAppearance.BorderSize = 0;
            _stopBtn.FlatAppearance.BorderSize = 0;

            _startBtn.Click += (_, _) => _ctx.StartServer();
            _stopBtn.Click += (_, _) => _ctx.StopServer();
            Controls.AddRange(new Control[] { _startBtn, _stopBtn });

            _logBox = new TextBox
            {
                Multiline = true,
                ReadOnly = true,
                ScrollBars = ScrollBars.Vertical,
                Font = new Font("Consolas", 10),
                BackColor = Color.FromArgb(25, 25, 25),
                ForeColor = Color.LightGreen,
                BorderStyle = BorderStyle.None
            };

            _logBox.SetBounds(18, 155, ClientSize.Width - 36, ClientSize.Height - 173);
            _logBox.Anchor = AnchorStyles.Top | AnchorStyles.Bottom | AnchorStyles.Left | AnchorStyles.Right;
            Controls.Add(_logBox);

            UpdateStatus(false);
        }

        public void Log(string msg)
        {
            if (_logBox.InvokeRequired) _logBox.BeginInvoke(() => Append(msg));
            else Append(msg);
        }

        private void Append(string msg)
        {
            _logBox.AppendText($"{DateTime.Now:HH:mm:ss}  {msg}{Environment.NewLine}");
            _logBox.SelectionStart = _logBox.TextLength;
            _logBox.ScrollToCaret();
        }

        public void UpdateStatus(bool running)
        {
            if (InvokeRequired) { BeginInvoke(() => UpdateStatus(running)); return; }

            _statusLabel.Text = running ? "Server Online - http://localhost:8765" : "Server Offline";
            _statusLabel.ForeColor = running ? Color.MediumSeaGreen : Color.Gray;

            _startBtn.Enabled = !running;
            _startBtn.BackColor = !running ? Color.FromArgb(220, 245, 220) : Color.FromArgb(225, 225, 225);

            _stopBtn.Enabled = running;
            _stopBtn.BackColor = running ? Color.FromArgb(250, 220, 220) : Color.FromArgb(225, 225, 225);
        }

        protected override void OnFormClosing(FormClosingEventArgs e)
        {
            if (e.CloseReason == CloseReason.UserClosing) { e.Cancel = true; Hide(); }
            base.OnFormClosing(e);
        }
    }
}