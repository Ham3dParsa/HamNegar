using System.IO;
using System.Runtime.InteropServices;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Interop;
using System.Windows.Threading;

namespace HamNegar.Native;

public partial class HistoryWindow : Window
{
    // DWMWA_USE_IMMERSIVE_DARK_MODE (Win10 20H1+). Local P/Invoke: NativeMethods.cs is another track's seam.
    private const int DwmwaUseImmersiveDarkMode = 20;

    [DllImport("dwmapi.dll", PreserveSig = true)]
    private static extern int DwmSetWindowAttribute(IntPtr hwnd, int attr, ref int value, int size);

    // Single-instance for modeless open (MainWindow track must call ShowModeless).
    private static HistoryWindow? _open;
    private FileSystemWatcher? _watcher;
    private DispatcherTimer? _debounce;

    public HistoryWindow()
    {
        InitializeComponent();
        ApplyTitle(Title);
        // Dark OS title bar (main pill is borderless-dark; this window has a real frame).
        // Reads the live `theme` key so a light session opens with a light frame.
        SourceInitialized += (_, _) => ApplyTitleBarTheme();
        Activated += (_, _) =>
        {
            try { Refresh(); } catch { /* best-effort only */ }
        };
        Closed += OnClosedCleanup;
        RefreshList();
        SetupWatcher();
    }

    // Language-system seam (full FA/EN switch is a later ticket — do not build it here).
    // All Title sets must go through this method.
    internal void ApplyTitle(string title)
    {
        try { Title = title; } catch { /* best-effort only */ }
    }

    // Modeless opener for the MainWindow track (they own HistoryButton_Click).
    // Sets Owner + Show() (never ShowDialog) so the pill stays interactive.
    // Single-instance: focuses the existing window if already open.
    public static void ShowModeless(Window? owner)
    {
        try
        {
            var d = owner?.Dispatcher ?? Application.Current?.Dispatcher;
            if (d is not null && !d.CheckAccess())
            {
                try { d.BeginInvoke(new Action(() => ShowModeless(owner))); } catch { /* best-effort */ }
                return;
            }
            if (_open is not null)
            {
                try
                {
                    if (!_open.IsVisible)
                        _open.Show();
                    if (_open.WindowState == WindowState.Minimized)
                        _open.WindowState = WindowState.Normal;
                    _open.Activate();
                }
                catch { /* best-effort only */ }
                return;
            }
            var w = new HistoryWindow();
            try
            {
                if (owner is not null)
                    w.Owner = owner;
            }
            catch { /* owner attach is best-effort (e.g. headless) */ }
            _open = w;
            try
            {
                w.Closed += (_, _) =>
                {
                    try { if (_open == w) _open = null; } catch { /* best-effort */ }
                };
            }
            catch { /* best-effort only */ }
            try { w.Show(); } catch { /* best-effort only */ }
            try { w.Activate(); } catch { /* best-effort only */ }
        }
        catch
        {
            // Prototype: best-effort only.
        }
    }

    // Public trigger for future callers (tray, hotkey, language switch).
    public void Refresh()
    {
        try { RefreshList(); } catch { /* best-effort only */ }
    }

    private void ScheduleRefreshDebounced()
    {
        try
        {
            var d = Dispatcher;
            if (!d.CheckAccess())
            {
                try { d.BeginInvoke(new Action(ScheduleRefreshDebounced)); } catch { /* best-effort */ }
                return;
            }
            try
            {
                _debounce?.Stop();
                _debounce?.Start();
            }
            catch { /* best-effort only */ }
        }
        catch
        {
            // Prototype: best-effort only.
        }
    }

    private void SetupWatcher()
    {
        try
        {
            string path = HistoryStore.HistoryPath;
            string? dir = Path.GetDirectoryName(path);
            string file = Path.GetFileName(path);
            if (string.IsNullOrEmpty(dir) || string.IsNullOrEmpty(file))
                return;
            try { Directory.CreateDirectory(dir); } catch { /* best-effort */ }
            _debounce = new DispatcherTimer { Interval = TimeSpan.FromMilliseconds(300) };
            _debounce.Tick += (_, _) =>
            {
                try
                {
                    _debounce?.Stop();
                    Refresh();
                }
                catch { /* best-effort only */ }
            };
            _watcher = new FileSystemWatcher(dir, file)
            {
                NotifyFilter = NotifyFilters.LastWrite | NotifyFilters.Size
                    | NotifyFilters.CreationTime | NotifyFilters.FileName,
            };
            _watcher.Changed += (_, _) => ScheduleRefreshDebounced();
            _watcher.Created += (_, _) => ScheduleRefreshDebounced();
            _watcher.Deleted += (_, _) => ScheduleRefreshDebounced();
            _watcher.Renamed += (_, _) => ScheduleRefreshDebounced();
            _watcher.EnableRaisingEvents = true;
        }
        catch
        {
            // Prototype: watcher is best-effort only (e.g. headless, locked profile).
        }
    }

    private void OnClosedCleanup(object? sender, EventArgs e)
    {
        try
        {
            try
            {
                if (_watcher is not null)
                {
                    _watcher.EnableRaisingEvents = false;
                    _watcher.Dispose();
                    _watcher = null;
                }
            }
            catch { /* best-effort only */ }
            try
            {
                if (_debounce is not null)
                {
                    _debounce.Stop();
                    _debounce = null;
                }
            }
            catch { /* best-effort only */ }
            try { if (_open == this) _open = null; } catch { /* best-effort */ }
        }
        catch
        {
            // Prototype: best-effort only.
        }
    }

    private void ApplyTitleBarTheme()
    {
        try
        {
            var hwnd = new WindowInteropHelper(this).Handle;
            if (hwnd == IntPtr.Zero)
                return;
            int useDark = ThemeManager.IsDark(ThemeManager.LoadTheme()) ? 1 : 0;
            DwmSetWindowAttribute(hwnd, DwmwaUseImmersiveDarkMode, ref useDark, sizeof(int));
        }
        catch
        {
            // Prototype: title-bar tint is best-effort only (e.g. old Windows, headless).
        }
    }

    private void RefreshList()
    {
        double offset = 0;
        bool hadOffset = false;
        try
        {
            offset = HistoryScroll.VerticalOffset;
            hadOffset = true;
        }
        catch { /* first layout — no offset yet */ }
        try
        {
            var rows = new List<HistoryRow>();
            try
            {
                foreach (var e in HistoryStore.List())
                    rows.Add(HistoryRow.From(e));
            }
            catch
            {
                // Prototype: corrupt history → show empty (HistoryStore already guards).
            }
            // Fresh rebuild per refresh → no duplicate rows by construction.
            // ItemsControl has no selection model; preserve scroll position instead.
            HistoryItems.ItemsSource = rows;
            EmptyHint.Visibility = rows.Count == 0 ? Visibility.Visible : Visibility.Collapsed;
        }
        catch
        {
            // Prototype: best-effort only.
        }
        if (hadOffset)
        {
            try { HistoryScroll.ScrollToVerticalOffset(offset); } catch { /* best-effort */ }
        }
    }

    // Re-inject: same inject path as a fresh transcription (MainWindow restores
    // the previous window, then NativeMethods.SendUnicodeText). Lengths only.
    private void ReinjectButton_Click(object sender, RoutedEventArgs e)
    {
        try
        {
            var id = (sender as Button)?.Tag as string;
            var entry = Find(id);
            if (entry is null || string.IsNullOrEmpty(entry.Text))
            {
                StatusText.Text = "موردی یافت نشد.";
                return;
            }
            if (Owner is MainWindow main)
            {
                main.InjectIntoPrevious(entry.Text, entry.Engine);
                StatusText.Text = "ارسال شد — نتیجه را در خط وضعیت پنجره اصلی ببینید.";
            }
            else
            {
                try { Clipboard.SetText(entry.Text); } catch { /* backup best-effort only */ }
                StatusText.Text = "در حافظه کپی شد (clipboard) — با Ctrl+V بچسبانید.";
            }
        }
        catch
        {
            // Prototype: best-effort only.
        }
    }

    private void CopyButton_Click(object sender, RoutedEventArgs e)
    {
        try
        {
            var id = (sender as Button)?.Tag as string;
            var entry = Find(id);
            if (entry is null || string.IsNullOrEmpty(entry.Text))
            {
                StatusText.Text = "موردی یافت نشد.";
                return;
            }
            try { Clipboard.SetText(entry.Text); } catch { /* best-effort only */ }
            StatusText.Text = "در حافظه کپی شد (clipboard).";
        }
        catch
        {
            // Prototype: best-effort only.
        }
    }

    private void DeleteButton_Click(object sender, RoutedEventArgs e)
    {
        try
        {
            var id = (sender as Button)?.Tag as string;
            if (HistoryStore.Delete(id))
                StatusText.Text = "حذف شد.";
            else
                StatusText.Text = "موردی یافت نشد.";
            RefreshList();
        }
        catch
        {
            // Prototype: best-effort only.
        }
    }

    private void ClearAllButton_Click(object sender, RoutedEventArgs e)
    {
        try
        {
            HistoryStore.Clear();
            RefreshList();
            StatusText.Text = "تاریخچه پاک شد.";
        }
        catch
        {
            // Prototype: best-effort only.
        }
    }

    private static HistoryEntry? Find(string? id)
    {
        try
        {
            if (string.IsNullOrEmpty(id))
                return null;
            foreach (var e in HistoryStore.List())
            {
                if (e.Id == id)
                    return e;
            }
        }
        catch
        {
            // Prototype: best-effort only.
        }
        return null;
    }

    // Flat projection for the DataTemplate (time + engine + text preview).
    private sealed class HistoryRow
    {
        public string Id { get; init; } = string.Empty;
        public string TimeText { get; init; } = string.Empty;
        public string Engine { get; init; } = string.Empty;
        public string Preview { get; init; } = string.Empty;

        public static HistoryRow From(HistoryEntry e)
        {
            string preview = e.Text ?? string.Empty;
            const int max = 160;
            if (preview.Length > max)
                preview = preview[..max] + "…";
            return new HistoryRow
            {
                Id = e.Id,
                TimeText = e.Time.ToLocalTime().ToString("yyyy/MM/dd HH:mm"),
                Engine = string.IsNullOrWhiteSpace(e.Engine) ? "—" : e.Engine,
                Preview = preview,
            };
        }
    }
}
