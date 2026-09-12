using System;
using System.IO;
using System.Runtime.InteropServices;
using System.Threading;
using System.Threading.Tasks;
using System.Windows;
using System.Windows.Input;
using System.Windows.Interop;
using System.Windows.Media;
using System.Windows.Threading;

namespace HamNegar.Native;

public partial class MainWindow : Window
{
    private readonly AudioRecorder _recorder = new();
    private PillSettings _settings;
    private IntPtr _prevWindow = IntPtr.Zero;
    private IntPtr _hotkeyWindow = IntPtr.Zero;
    private bool _busy;
    private bool _transcribing;
    private CancellationTokenSource? _transcribeCts;
    private string? _failedWav; // session-only retained wav after STT failure/cancel (never persisted)
    private int _attemptCount;

    public MainWindow()
    {
        InitializeComponent();
        _settings = SettingsStore.Load();
        MouseLeftButtonDown += (_, _) =>
        {
            try { DragMove(); } catch { /* click on button etc. */ }
        };
        SourceInitialized += (_, _) => RegisterGlobalHotkeys();
        Closed += (_, _) => { UnregisterGlobalHotkeys(); try { Lang.Changed -= OnLangChanged; } catch { } };
        Lang.Changed += OnLangChanged;
        ApplyLang();
        UpdateEngineLabel("—");
    }

    // Language: single mechanism — code-behind ApplyLang() (see Lang.cs).
    // Re-renders title, tooltips, mic tip, engine chip AND the current status
    // (kept as key+args so a live switch never loses it).
    private void OnLangChanged()
    {
        try
        {
            if (Dispatcher.CheckAccess())
                ApplyLang();
            else
                Dispatcher.BeginInvoke(new Action(ApplyLang));
        }
        catch { /* best-effort only */ }
    }

    private void ApplyLang()
    {
        try
        {
            FlowDirection = Lang.IsFa ? FlowDirection.RightToLeft : FlowDirection.LeftToRight;
            Title = Lang.Get(Lang.K.MainTitle);
            TitleLabel.Text = Lang.Get(Lang.K.PillTitle);
            HistoryButton.ToolTip = Lang.Get(Lang.K.TipHistory);
            SettingsButton.ToolTip = Lang.Get(Lang.K.TipSettings);
            HideButton.ToolTip = Lang.Get(Lang.K.TipHide);
            CloseButton.ToolTip = Lang.Get(Lang.K.TipClose);
            CancelActionButton.ToolTip = Lang.Get(Lang.K.TipCancel);
            RetryButton.ToolTip = Lang.Get(Lang.K.TipRetry);
            DiscardButton.ToolTip = Lang.Get(Lang.K.TipDiscard);
            RefreshHotkeyHint();
            RenderStatus();
            UpdateEngineLabel(_lastEngine);
        }
        catch { /* best-effort only */ }
    }

    // ---- global hotkeys (persisted, configurable in Settings) ----
    private void RegisterGlobalHotkeys()
    {
        var handle = new WindowInteropHelper(this).Handle;
        var source = HwndSource.FromHwnd(handle);
        source?.AddHook(HwndHook);
        var extras = SettingsExtras.Load();
        if (!HotkeyConfig.Register(handle, HotkeyConfig.RecordHotkeyId, extras.RecordHotkey))
            SetStatus(Lang.K.HotkeyFail);
        HotkeyConfig.Register(handle, HotkeyConfig.ShowHideHotkeyId, extras.ShowHideHotkey);
        HotkeyConfig.Register(handle, HotkeyConfig.CancelHotkeyId, extras.CancelHotkey);
    }

    private void UnregisterGlobalHotkeys()
    {
        try
        {
            var handle = new WindowInteropHelper(this).Handle;
            HotkeyConfig.Unregister(handle, HotkeyConfig.RecordHotkeyId);
            HotkeyConfig.Unregister(handle, HotkeyConfig.ShowHideHotkeyId);
            HotkeyConfig.Unregister(handle, HotkeyConfig.CancelHotkeyId);
        }
        catch
        {
            // Prototype: best-effort cleanup.
        }
    }

    private void RefreshHotkeyHint()
    {
        try
        {
            var rec = SettingsExtras.Load().RecordHotkey;
            MicButton.ToolTip = Lang.Format(Lang.K.MicTip, rec);
            // Idle hint only: never clobber an in-flight status (recording /
            // transcribing / retained results re-render via RenderStatus).
            if (_statusKey != Lang.K.ReadyStatus && _statusKey != Lang.K.HotkeyFail && _statusKey != "")
                return;
            _statusKey = Lang.K.ReadyStatus;
            _statusArgs = new object?[] { rec };
            RenderStatus();
        }
        catch { }
    }

    private IntPtr HwndHook(IntPtr hwnd, int msg, IntPtr wParam, IntPtr lParam, ref bool handled)
    {
        if (msg == NativeMethods.WM_HOTKEY)
        {
            var id = wParam.ToInt32();
            if (id == HotkeyConfig.RecordHotkeyId)
            {
                handled = true;
                // Capture synchronously: the hotkey itself never changes focus, but
                // Show() below can activate the pill, so StartRecording must not
                // re-capture after that. Lengths/HWNDs only, never content.
                try { _hotkeyWindow = NativeMethods.GetForegroundWindow(); } catch { }
                Dispatcher.BeginInvoke(new Action(() => _ = ToggleRecordAsync(fromHotkey: true)));
            }
            else if (id == HotkeyConfig.ShowHideHotkeyId)
            {
                handled = true;
                Dispatcher.BeginInvoke(new Action(() =>
                {
                    if (!IsVisible) Show(); else Hide();
                }));
            }
            else if (id == HotkeyConfig.CancelHotkeyId)
            {
                handled = true;
                Dispatcher.BeginInvoke(new Action(() => CancelOrDiscard()));
            }
        }
        return IntPtr.Zero;
    }

    // ---- record toggle (mic button + hotkey) ----
    private void MicButton_Click(object sender, RoutedEventArgs e) => _ = ToggleRecordAsync();

    private async Task ToggleRecordAsync(bool fromHotkey = false)
    {
        if (_busy)
            return;
        // Transcribing: record toggle is a no-op (busy) — ONLY the dedicated
        // cancel hotkey discards, and only while recording. This closes the
        // "hotkey mid-transcribe kills pending text" hole regardless of timing.
        if (_transcribing)
        {
            SetStatus(Lang.K.TranscribingBusy);
            return;
        }
        // Hidden window: hotkey shows it again unless the user disabled it
        // (hotkeyShowsPill=false → headless record with toasts only).
        if (!IsVisible)
        {
            bool showPill = true;
            try { showPill = SettingsWindow.LoadHotkeyShowsPill(); } catch { }
            if (!showPill && fromHotkey) { /* stay hidden, record headless */ }
            else Show();
        }

        if (!_recorder.IsRecording)
            StartRecording();
        else
            await StopAndTranscribeAsync().ConfigureAwait(true);
    }

    private void StartRecording()
    {
        // Prefer the HWND captured synchronously in the hotkey hook: by the
        // time we get here Show() may have activated the pill itself, and
        // GetForegroundWindow would then return our own handle (typing into
        // ourselves = user sees nothing in Notepad/Telegram).
        IntPtr selfHandle = IntPtr.Zero;
        try { selfHandle = new WindowInteropHelper(this).Handle; } catch { }
        IntPtr hookHwnd = _hotkeyWindow;
        if (hookHwnd != IntPtr.Zero && hookHwnd != selfHandle && NativeMethods.IsWindow(hookHwnd))
        {
            _prevWindow = hookHwnd;
        }
        else
        {
            IntPtr fg = IntPtr.Zero;
            try { fg = NativeMethods.GetForegroundWindow(); } catch { }
            if (fg != IntPtr.Zero && fg != selfHandle && NativeMethods.IsWindow(fg))
                _prevWindow = fg;
            // Else: keep the previous valid _prevWindow (mic-button click path
            // steals focus to the pill, so live fg is us and useless).
        }
        try
        {
            _recorder.Start();
        }
        catch (Exception ex)
        {
            SetStatus(Lang.K.MicError, shortMsg(ex));
            return;
        }
        MicButton.Content = "\uE71A";
        MicButton.Background = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#EA4335"));
        PulseRing.Visibility = Visibility.Visible;
        CancelActionButton.Visibility = Visibility.Visible;
        HideRetryDiscard();
        SetStatus(Lang.K.Recording);
    }

    private async Task StopAndTranscribeAsync()
    {
        string wavPath;
        try
        {
            wavPath = _recorder.Stop();
        }
        catch (Exception ex)
        {
            SetStatus(Lang.K.StopError, shortMsg(ex));
            MicButton.Content = "\uE720";
            MicButton.Background = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#1A73E8"));
            PulseRing.Visibility = Visibility.Collapsed;
            CancelActionButton.Visibility = Visibility.Collapsed;
            return;
        }
        MicButton.Content = "\uE720";
        MicButton.Background = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#1A73E8"));
        PulseRing.Visibility = Visibility.Collapsed;

        await TranscribeFileAsync(wavPath).ConfigureAwait(true);
    }

    // Shared transcription path: fresh stops AND Retry-from-saved-wav both
    // come here. Owns _busy/_transcribing/CTS, human progress lines, and
    // failed-audio retention (wav deleted only on success or explicit
    // discard; kept in _failedWav otherwise). Lengths only, never content.
    private async Task TranscribeFileAsync(string wavPath)
    {
        if (_transcribing)
            return;
        _busy = true;
        _transcribing = true;
        _attemptCount = 0;
        MicButton.Content = "\uE72C";
        MicButton.Background = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#1A73E8"));
        PulseRing.Visibility = Visibility.Collapsed;
        CancelActionButton.Visibility = Visibility.Visible;
        HideRetryDiscard();
        SetStatus(Lang.K.Sending);
        try { _transcribeCts?.Dispose(); } catch { }
        _transcribeCts = new CancellationTokenSource();
        var ct = _transcribeCts.Token;
        var progress = new Progress<(string engine, bool ok)>(t =>
        {
            _attemptCount++;
            string n = Lang.Digits(_attemptCount);
            string e = Lang.EngineName(t.engine);
            if (t.ok)
                SetStatus(Lang.K.AttemptOk, n, e);
            else
                SetStatus(Lang.K.AttemptNext, n, e);
        });
        bool success = false;
        try
        {
            SetStatus(Lang.K.Sending);
            var result = await SttChain.TranscribeAsync(wavPath, _settings.GoogleKey, _settings.GroqKey, ct, progress).ConfigureAwait(true);
            try { HistoryStore.Add(result.Text, result.Engine); } catch { /* history best-effort only */ }
            UpdateEngineLabel(result.Engine);
            if (string.Equals(wavPath, _failedWav, StringComparison.OrdinalIgnoreCase))
                _failedWav = null;
            try { if (File.Exists(wavPath)) File.Delete(wavPath); } catch { }
            HideRetryDiscard();
            success = true;
            InjectIntoPrevious(result.Text, result.Engine);
        }
        catch (OperationCanceledException)
        {
            _failedWav = wavPath; // keep wav for retry; NOT deleted here
            ShowRetryDiscard();
            SetStatus(Lang.K.CanceledKept);
        }
        catch (Exception ex)
        {
            if (IsEmptyAudioGuard(ex))
            {
                try { if (File.Exists(wavPath)) File.Delete(wavPath); } catch { }
                HideRetryDiscard();
                SetStatus(Lang.K.TooShort);
            }
            else
            {
                _failedWav = wavPath; // keep wav for retry; NOT deleted here
                ShowRetryDiscard();
                SetStatus(Lang.K.FailedKept);
            }
        }
        finally
        {
            try { _transcribeCts?.Dispose(); } catch { }
            _transcribeCts = null;
            _transcribing = false;
            _busy = false;
            MicButton.Content = "\uE720";
            MicButton.Background = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#1A73E8"));
            PulseRing.Visibility = Visibility.Collapsed;
            CancelActionButton.Visibility = Visibility.Collapsed;
            if (success)
                HideRetryDiscard();
        }
    }

    private void CancelActionButton_Click(object sender, RoutedEventArgs e) => CancelOrDiscard();

    private void RetryButton_Click(object sender, RoutedEventArgs e)
    {
        var path = _failedWav;
        if (string.IsNullOrEmpty(path) || _transcribing || _busy)
            return;
        if (!File.Exists(path))
        {
            _failedWav = null;
            HideRetryDiscard();
            SetStatus(Lang.K.KeptMissing);
            return;
        }
        _ = TranscribeFileAsync(path);
    }

    private void DiscardButton_Click(object sender, RoutedEventArgs e) => DiscardFailedWav();

    private void DiscardFailedWav()
    {
        var path = _failedWav;
        _failedWav = null;
        try { if (!string.IsNullOrEmpty(path) && File.Exists(path)) File.Delete(path); } catch { }
        HideRetryDiscard();
        SetStatus(Lang.K.Discarded);
    }

    private void ShowRetryDiscard()
    {
        RetryButton.Visibility = Visibility.Visible;
        DiscardButton.Visibility = Visibility.Visible;
    }

    private void HideRetryDiscard()
    {
        RetryButton.Visibility = Visibility.Collapsed;
        DiscardButton.Visibility = Visibility.Collapsed;
    }

    private void CancelOrDiscard()
    {
        if (_recorder.IsRecording)
        {
            DiscardRecording();
            return;
        }
        if (_transcribing)
        {
            try { _transcribeCts?.Cancel(); } catch { }
        }
    }

    private static bool IsEmptyAudioGuard(Exception ex) =>
        ex is InvalidOperationException && (ex.Message ?? string.Empty).Contains("Audio too short", StringComparison.Ordinal);

    private static bool IsVerbose()
    {
        try { return SettingsWindow.LoadVerboseStatus(); } catch { return false; }
    }

    // ---- direct injection: restore prev window, SendInput KEYEVENTF_UNICODE ----
    // Typing replaces any active selection natively (cursor in field → insert).
    // Clipboard is written ONLY when AutoCopy is on (default off); every
    // successful transcript is kept in HistoryStore instead. Reused by
    // HistoryWindow re-inject (same path, same _prevWindow). Never logs keys
    // or text content.
    // Debug status line reports every stage (HWND hex, restore ok/fail,
    // foreground match, sent/total chars, win32 error) so the owner can tell
    // exactly which stage failed. Lengths only, never content.
    // HUMAN FIRST: the status line shows a short localized sentence
    // (Lang.K.Inj*); the technical line (Lang.K.Tech*, stable English) is
    // appended only when verboseStatus is on (pill.settings.json key
    // "verboseStatus", default OFF).
    public void InjectIntoPrevious(string text, string engine)
    {
        // Silent backup ONLY when AutoCopy is on: Clipboard.SetText needs no focus, steals none.
        bool autoCopy = false;
        try { autoCopy = SettingsExtras.Load().AutoCopy; } catch { }
        if (autoCopy)
        { try { Clipboard.SetText(text ?? string.Empty); } catch { /* backup best-effort only */ } }
        bool verbose = IsVerbose();
        // Human + technical lines are both Lang templates (key+args, so a live
        // switch re-renders). Tails pick clipboard vs history wording.
        string tail = autoCopy ? Lang.K.TailClipboard : Lang.K.TailHistory;
        void SetHuman(string humanKey, object?[] humanArgs, string techKey, object?[] techArgs) =>
            SetStatusComposite(humanKey, humanArgs, techKey, techArgs, verbose);
        if (string.IsNullOrEmpty(text))
        {
            SetHuman(Lang.K.InjEmpty, Array.Empty<object?>(), Lang.K.TechEmpty, new object?[] { engine });
            return;
        }
        string hwndHex = $"0x{_prevWindow.ToInt64():X}";
        bool valid = _prevWindow != IntPtr.Zero && NativeMethods.IsWindow(_prevWindow);
        if (!valid)
        {
            string tailGone = autoCopy ? Lang.K.TailCopied : Lang.K.TailKept;
            SetHuman(Lang.K.InjGone, Array.Empty<object?>(), Lang.K.TechGone,
                new object?[] { engine, hwndHex, Lang.Get(tailGone) });
            return;
        }
        // Mode from pill.settings.json key "injectMode" (never-throw, default instant).
        NativeMethods.InjectMode mode = NativeMethods.InjectMode.Instant;
        try { mode = NativeMethods.LoadInjectMode(); } catch { }
        bool restored = NativeMethods.TryRestoreWindow(_prevWindow);
        Thread.Sleep(120);
        bool fgMatch = false;
        try { fgMatch = NativeMethods.GetForegroundWindow() == _prevWindow; } catch { }
        int sent = 0;
        if (mode == NativeMethods.InjectMode.Animated)
        {
            try { sent = NativeMethods.SendUnicodeTextAnimated(text, _prevWindow); } catch { sent = 0; }
            bool focusChanged = false;
            try { focusChanged = NativeMethods.GetForegroundWindow() != _prevWindow; } catch { }
            if (sent >= text.Length)
            {
                SetHuman(Lang.K.InjLanded, new object?[] { Lang.EngineName(engine) }, Lang.K.TechDone,
                    new object?[] { engine, hwndHex, restored, fgMatch, "animated", sent, text.Length, Lang.Get(tail) });
            }
            else if (focusChanged)
            {
                try { EnsureInHistory(text, engine); } catch { /* history best-effort only */ }
                SetHuman(Lang.K.InjFocusMoved, Array.Empty<object?>(), Lang.K.TechStopped,
                    new object?[] { sent, text.Length, hwndHex, restored, fgMatch, Lang.Get(tail) });
            }
            else
            {
                int err = Marshal.GetLastWin32Error();
                try { EnsureInHistory(text, engine); } catch { /* history best-effort only */ }
                string tailManual = autoCopy ? Lang.K.TailBackupManual : Lang.K.TailHistory;
                SetHuman(Lang.K.InjPartial, new object?[] { sent, text.Length }, Lang.K.TechDone,
                    new object?[] { engine, hwndHex, restored, fgMatch, "animated", sent, text.Length, $"{Lang.Get(tailManual)} err={err}" });
            }
        }
        else
        {
            try { sent = NativeMethods.SendUnicodeText(text); } catch { sent = 0; }
            if (sent >= text.Length)
            {
                SetHuman(Lang.K.InjLanded, new object?[] { Lang.EngineName(engine) }, Lang.K.TechDone,
                    new object?[] { engine, hwndHex, restored, fgMatch, "instant", sent, text.Length, Lang.Get(tail) });
            }
            else
            {
                int err = Marshal.GetLastWin32Error();
                string tailManual = autoCopy ? Lang.K.TailBackupManual : Lang.K.TailHistory;
                SetHuman(Lang.K.InjPartial, new object?[] { sent, text.Length }, Lang.K.TechDone,
                    new object?[] { engine, hwndHex, restored, fgMatch, "instant", sent, text.Length, $"{Lang.Get(tailManual)} err={err}" });
            }
        }
    }

    // Animated focus-stop guard: the fresh-transcription path already added the
    // full text before inject and the re-inject path reads from history, but a
    // partial send must never lose the remainder — add only if absent (lengths
    // only in status, never content).
    private static void EnsureInHistory(string text, string engine)
    {
        try
        {
            foreach (var e in HistoryStore.List())
            {
                if (e.Text == text && e.Engine == (engine ?? string.Empty))
                    return;
            }
            HistoryStore.Add(text, engine ?? string.Empty);
        }
        catch
        {
            // Prototype: history is best-effort, never breaks injection.
        }
    }

    // ---- history dialog (local in-app clipboard) ----
    private void HistoryButton_Click(object sender, RoutedEventArgs e)
    {
        try
        {
            HistoryWindow.ShowModeless(this);
        }
        catch
        {
            // Prototype: best-effort only.
        }
    }

    // ---- settings dialog (keys off the main page) ----
    private void SettingsButton_Click(object sender, RoutedEventArgs e)
    {
        var dlg = new SettingsWindow { Owner = this };
        dlg.ShowDialog();
        // Reload: same %AppData%/HamNegar/pill.settings.json store, same shape.
        _settings = SettingsStore.Load();
        UnregisterGlobalHotkeys();
        RegisterGlobalHotkeys();
        RefreshHotkeyHint();
        UpdateEngineLabel(_lastEngine);
    }

    // ---- window chrome ----
    private void HideButton_Click(object sender, RoutedEventArgs e)
    {
        // Prototype: no tray icon (no new packages) — Hide() only; hotkey shows again.
        Hide();
    }

    private void CloseButton_Click(object sender, RoutedEventArgs e) => Close();

    protected override void OnKeyDown(KeyEventArgs e)
    {
        if (e.Key == Key.Escape && (_recorder.IsRecording || _transcribing))
        {
            CancelOrDiscard();
            e.Handled = true;
            return;
        }
        base.OnKeyDown(e);
    }

    private void DiscardRecording()
    {
        if (!_recorder.IsRecording) return;
        try { File.Delete(_recorder.Stop()); } catch { }
        MicButton.Content = "\uE720";
        MicButton.Background = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#1A73E8"));
        PulseRing.Visibility = Visibility.Collapsed;
        CancelActionButton.Visibility = Visibility.Collapsed;
        SetStatus(Lang.K.Canceled);
    }

    // Status is stored as key+args (never a baked string) so ApplyLang() can
    // re-render the live line after an FA↔EN switch. Composite variant keeps
    // the human + verbose-technical pair for inject results.
    private string _statusKey = Lang.K.ReadyStatus;
    private object?[] _statusArgs = Array.Empty<object?>();
    private string? _compositeHumanKey;
    private object?[] _compositeHumanArgs = Array.Empty<object?>();
    private string? _compositeTechKey;
    private object?[] _compositeTechArgs = Array.Empty<object?>();
    private bool _compositeVerbose;

    private void SetStatus(string key, params object?[] args)
    {
        _statusKey = key;
        _statusArgs = args;
        _compositeHumanKey = null;
        RenderStatus();
    }

    private void SetStatusComposite(string humanKey, object?[] humanArgs, string techKey, object?[] techArgs, bool verbose)
    {
        _compositeHumanKey = humanKey;
        _compositeHumanArgs = humanArgs;
        _compositeTechKey = techKey;
        _compositeTechArgs = techArgs;
        _compositeVerbose = verbose;
        _statusKey = humanKey;
        _statusArgs = humanArgs;
        RenderStatus();
    }

    private void RenderStatus()
    {
        try
        {
            if (_compositeHumanKey is not null && _compositeTechKey is not null)
            {
                var human = Lang.Format(_compositeHumanKey, _compositeHumanArgs);
                StatusText.Text = _compositeVerbose
                    ? $"{human}\n{Lang.Format(_compositeTechKey, _compositeTechArgs)}"
                    : human;
            }
            else
            {
                StatusText.Text = Lang.Format(_statusKey, _statusArgs);
            }
        }
        catch { /* best-effort only */ }
    }

    private string _lastEngine = "—";
    private void UpdateEngineLabel(string engine)
    {
        _lastEngine = engine;
        bool show = true;
        try { show = SettingsExtras.Load().ShowEngineLabel; } catch { }
        EngineText.Visibility = show ? Visibility.Visible : Visibility.Collapsed;
        EngineText.Text = Lang.Format(Lang.K.EngineChip, engine);
    }

    private static string shortMsg(Exception ex)
    {
        var m = ex.Message ?? ex.GetType().Name;
        return m.Length > 220 ? m[..220] : m;
    }
}
