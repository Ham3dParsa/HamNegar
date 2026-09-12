using System.IO;
using System.Runtime.InteropServices;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Interop;

namespace HamNegar.Native;

public partial class SettingsWindow : Window
{
    // DWMWA_USE_IMMERSIVE_DARK_MODE (Win10 20H1+). Local P/Invoke: NativeMethods.cs is another track's seam.
    private const int DwmwaUseImmersiveDarkMode = 20;

    [DllImport("dwmapi.dll", PreserveSig = true)]
    private static extern int DwmSetWindowAttribute(IntPtr hwnd, int attr, ref int value, int size);

    // Button currently recording the next key combo (null when idle).
    private Button? _arming;
    private ExtraSettings _extras = new();
    private bool _themeReady; // true once ThemeComboBox reflects the stored value

    public SettingsWindow()
    {
        InitializeComponent();
        var settings = SettingsStore.Load();
        GoogleKeyBox.Password = settings.GoogleKey;
        GroqKeyBox.Password = settings.GroqKey;
        _extras = SettingsExtras.Load();
        RecordHotkeyButton.Content = RecordHotkeyButton.Tag = _extras.RecordHotkey;
        ShowHideHotkeyButton.Content = ShowHideHotkeyButton.Tag = _extras.ShowHideHotkey;
        CancelHotkeyButton.Content = CancelHotkeyButton.Tag = _extras.CancelHotkey;
        AutoCopyCheck.IsChecked = _extras.AutoCopy;
        ShowEngineLabelCheck.IsChecked = _extras.ShowEngineLabel;
        // injectMode lives in the same JSON (reader: NativeMethods.LoadInjectMode,
        // default instant — another track's seam, read-only here).
        InjectModeComboBox.SelectedIndex =
            NativeMethods.LoadInjectMode() == NativeMethods.InjectMode.Animated ? 1 : 0;
        // hotkeyShowsPill is additive (default true = today's behavior); the
        // MainWindow honoring comes from the other track — persistence only here.
        HotkeyShowsPillCheck.IsChecked = LoadHotkeyShowsPill();
        VerboseStatusCheck.IsChecked = LoadVerboseStatus();
        // Chain display only: fixed order mirrored from SttChain.cs via ChainSpec.
        ChainItems.ItemsSource = ChainSpec.Engines;
        // Dark OS title bar (main pill is borderless-dark; this window has a real frame).
        SourceInitialized += (_, _) => ApplyTitleBarTheme();
        // Theme ComboBox reflects the stored `theme` key (dark default); live below.
        ThemeComboBox.SelectedIndex = ThemeManager.IsDark(ThemeManager.LoadTheme()) ? 0 : 1;
        _themeReady = true;
    }

    // ---- dark/light OS title bar + live theme ----
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

    private string SelectedTheme() => ThemeComboBox.SelectedIndex == 1 ? ThemeManager.Light : ThemeManager.Dark;

    private void ThemeComboBox_SelectionChanged(object sender, SelectionChangedEventArgs e)
    {
        if (!_themeReady)
            return; // initial SelectedIndex set above, not a user change
        try
        {
            var theme = SelectedTheme();
            ThemeManager.SaveTheme(theme); // persist immediately: Cancel keeps the live choice
            ThemeManager.ApplyTheme(theme); // live: every DynamicResource window follows
            ApplyTitleBarTheme(); // this window's OS frame follows too
        }
        catch
        {
            // Prototype: theme switch is best-effort only.
        }
    }

    // ---- click-to-record hotkey capture ----
    private void HotkeyButton_Click(object sender, RoutedEventArgs e)
    {
        if (sender is not Button btn)
            return;
        Disarm(restore: true);
        _arming = btn;
        btn.Tag = btn.Content; // stash the current combo
        btn.Content = "Press keys… (Esc cancels)";
        btn.Focus();
    }

    private void HotkeyButton_PreviewKeyDown(object sender, KeyEventArgs e)
    {
        if (sender is not Button btn || _arming != btn)
            return;
        var key = e.Key == Key.System ? e.SystemKey : e.Key;
        if (key is Key.Escape)
        {
            Disarm(restore: true);
            e.Handled = true;
            return;
        }
        if (IsBareModifier(key) || key is Key.ImeProcessed or Key.DeadCharProcessed)
            return; // keep waiting for a real key
        var mods = Keyboard.Modifiers;
        if (mods == ModifierKeys.None)
        {
            btn.Content = "Hold Ctrl / Alt / Shift / Win + key…";
            e.Handled = true;
            return;
        }
        var combo = HotkeyConfig.Build(mods, key);
        if (!HotkeyConfig.TryParse(combo, out _, out _))
        {
            btn.Content = "Not usable — try again…";
            e.Handled = true;
            return;
        }
        btn.Content = btn.Tag = combo;
        _arming = null;
        // Move focus away so Space/Enter doesn't immediately re-trigger the button.
        MoveFocus(new TraversalRequest(FocusNavigationDirection.Next));
        e.Handled = true;
    }

    private void HotkeyButton_LostFocus(object sender, RoutedEventArgs e)
    {
        if (sender is Button btn && _arming == btn)
            Disarm(restore: true);
    }

    private void Disarm(bool restore)
    {
        if (_arming is null)
            return;
        if (restore && _arming.Tag is string prev)
            _arming.Content = prev;
        _arming = null;
    }

    private static bool IsBareModifier(Key key) => key is
        Key.LeftCtrl or Key.RightCtrl or
        Key.LeftAlt or Key.RightAlt or
        Key.LeftShift or Key.RightShift or
        Key.LWin or Key.RWin or Key.System;

    private void ResetHotkeysButton_Click(object sender, RoutedEventArgs e)
    {
        Disarm(restore: true);
        RecordHotkeyButton.Content = RecordHotkeyButton.Tag = HotkeyConfig.DefaultRecord;
        ShowHideHotkeyButton.Content = ShowHideHotkeyButton.Tag = HotkeyConfig.DefaultShowHide;
        CancelHotkeyButton.Content = CancelHotkeyButton.Tag = HotkeyConfig.DefaultCancel;
    }

    // ---- additive prefs (same JSON, same merge idea as SettingsExtras.Save) ----
    // injectMode: "instant" (default, safe) | "animated". Reader lives in
    // NativeMethods.LoadInjectMode (other track); this window only persists it.
    private string SelectedInjectMode() => InjectModeComboBox.SelectedIndex == 1 ? "animated" : "instant";

    // hotkeyShowsPill: default true = today's behavior (record hotkey re-shows
    // the hidden pill); false = recording runs headless with toasts only.
    // Handoff key documented in TODO.txt §7 for the MainWindow track.
    public static bool LoadHotkeyShowsPill()
    {
        try
        {
            var path = SettingsStore.SettingsPath;
            if (!File.Exists(path))
                return true;
            var root = JsonNode.Parse(File.ReadAllText(path))?.AsObject();
            return root?["hotkeyShowsPill"]?.GetValue<bool>() ?? true;
        }
        catch
        {
            return true;
        }
    }

    // verboseStatus: default false = human-only status line; true appends the
    // old technical line (hwnd/restored/typed) after the human line.
    // Additive JSON key, never-throw load (missing/corrupt → false).
    public static bool LoadVerboseStatus()
    {
        try
        {
            var path = SettingsStore.SettingsPath;
            if (!File.Exists(path))
                return false;
            var root = JsonNode.Parse(File.ReadAllText(path))?.AsObject();
            return root?["verboseStatus"]?.GetValue<bool>() ?? false;
        }
        catch
        {
            return false;
        }
    }

    // One additive merge for all prefs keys: preserves everything else in the file
    // (keys, hotkeys, theme, unknown props). Called after SettingsExtras.Save.
    private static void SaveAdditivePrefs(string injectMode, bool hotkeyShowsPill, bool verboseStatus)
    {
        JsonObject root;
        try
        {
            var path = SettingsStore.SettingsPath;
            root = File.Exists(path)
                ? JsonNode.Parse(File.ReadAllText(path))?.AsObject() ?? new JsonObject()
                : new JsonObject();
        }
        catch
        {
            root = new JsonObject();
        }
        root["injectMode"] = injectMode;
        root["hotkeyShowsPill"] = hotkeyShowsPill;
        root["verboseStatus"] = verboseStatus;
        var dir = Path.GetDirectoryName(SettingsStore.SettingsPath);
        if (!string.IsNullOrEmpty(dir))
            Directory.CreateDirectory(dir);
        File.WriteAllText(SettingsStore.SettingsPath,
            root.ToJsonString(new JsonSerializerOptions { WriteIndented = true }));
    }

    private void SaveButton_Click(object sender, RoutedEventArgs e)
    {
        Disarm(restore: true);
        var keys = new PillSettings
        {
            GoogleKey = GoogleKeyBox.Password.Trim(),
            GroqKey = GroqKeyBox.Password.Trim(),
        };
        var extras = new ExtraSettings
        {
            RecordHotkey = HotkeyConfig.Normalize(RecordHotkeyButton.Content as string, HotkeyConfig.DefaultRecord),
            ShowHideHotkey = HotkeyConfig.Normalize(ShowHideHotkeyButton.Content as string, HotkeyConfig.DefaultShowHide),
            CancelHotkey = HotkeyConfig.Normalize(CancelHotkeyButton.Content as string, HotkeyConfig.DefaultCancel),
            AutoCopy = AutoCopyCheck.IsChecked != false,
            ShowEngineLabel = ShowEngineLabelCheck.IsChecked != false,
        };
        var injectMode = SelectedInjectMode();
        var hotkeyShowsPill = HotkeyShowsPillCheck.IsChecked != false;
        var verboseStatus = VerboseStatusCheck.IsChecked == true;
        try
        {
            // Same store, same file: %AppData%/HamNegar/pill.settings.json.
            // SettingsExtras.Save merges so the key shape (and old files) keep working.
            // Theme was already saved live on selection; re-save here so Save is authoritative.
            ThemeManager.SaveTheme(SelectedTheme());
            SettingsExtras.Save(keys, extras);
            // Additive keys (same merge idea, own small writer so the
            // HotkeyConfig.cs shape stays untouched): injectMode + hotkeyShowsPill + verboseStatus.
            SaveAdditivePrefs(injectMode, hotkeyShowsPill, verboseStatus);
            // Never log key material — presence only.
            StatusText.Text = $"Saved. ({SettingsStore.KeyPresence(keys)})";
            DialogResult = true;
            Close();
        }
        catch (Exception ex)
        {
            var m = ex.Message ?? ex.GetType().Name;
            StatusText.Text = $"Save error: {(m.Length > 220 ? m[..220] : m)}";
        }
    }

    private void CancelButton_Click(object sender, RoutedEventArgs e)
    {
        Disarm(restore: true);
        DialogResult = false;
        Close();
    }
}
