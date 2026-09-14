using System.ComponentModel;
using System.IO;
using System.Runtime.InteropServices;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Interop;
using HamNegar.Native.Chain;

namespace HamNegar.Native;

public sealed class ChainRow : INotifyPropertyChanged
{
    private bool _enabled;
    public string Id { get; set; } = string.Empty;
    public string Note { get; set; } = string.Empty;
    public string Sub { get; set; } = string.Empty;
    public bool Enabled { get => _enabled; set { if (_enabled != value) { _enabled = value; PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(nameof(Enabled))); } } }
    public Visibility RemoveVisibility { get; set; } = Visibility.Collapsed;
    public event PropertyChangedEventHandler? PropertyChanged;
}

public partial class SettingsWindow : Window
{
    private const int DwmwaUseImmersiveDarkMode = 20;
    [DllImport("dwmapi.dll", PreserveSig = true)]
    private static extern int DwmSetWindowAttribute(IntPtr hwnd, int attr, ref int value, int size);
    private Button? _arming;
    private ExtraSettings _extras = new();
    private bool _themeReady;
    private bool _langReady;
    private bool _applyingLang;
    private string _statusKey = "";
    private object?[] _statusArgs = Array.Empty<object?>();
    private bool _statusEmpty = true;
    private bool _suppressChainSave;
    private List<ChainRow> _sttRows = new();
    private List<ChainRow> _polishRows = new();

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
        InjectModeComboBox.SelectedIndex = NativeMethods.LoadInjectMode() == NativeMethods.InjectMode.Animated ? 1 : 0;
        HotkeyShowsPillCheck.IsChecked = LoadHotkeyShowsPill();
        VerboseStatusCheck.IsChecked = LoadVerboseStatus();
        RefreshSttChain();
        RefreshPolishChain();
        SourceInitialized += (_, _) => ApplyTitleBarTheme();
        ThemeComboBox.SelectedIndex = ThemeManager.IsDark(ThemeManager.LoadTheme()) ? 0 : 1;
        _themeReady = true;
        LanguageComboBox.SelectedIndex = Lang.Current == Lang.En ? 1 : 0;
        _langReady = true;
        Closed += (_, _) => { try { Lang.Changed -= OnLangChanged; } catch { } };
        Lang.Changed += OnLangChanged;
        ApplyLang();
    }

    private void OnLangChanged()
    {
        try { if (Dispatcher.CheckAccess()) ApplyLang(); else Dispatcher.BeginInvoke(new Action(ApplyLang)); } catch { }
    }

    private void ApplyLang()
    {
        try
        {
            _applyingLang = true;
            FlowDirection = Lang.IsFa ? FlowDirection.RightToLeft : FlowDirection.LeftToRight;
            Title = Lang.Get(Lang.K.SettingsTitle);
            ApiKeysHeader.Text = Lang.Get(Lang.K.ApiKeys);
            GoogleKeyLabel.Text = Lang.Get(Lang.K.GoogleKey);
            GroqKeyLabel.Text = Lang.Get(Lang.K.GroqKey);
            KeysHint.Text = Lang.Get(Lang.K.KeysHint);
            ShortcutsHeader.Text = Lang.Get(Lang.K.Shortcuts);
            RecordLabel.Text = Lang.Get(Lang.K.RecToggle);
            ShowHideLabel.Text = Lang.Get(Lang.K.ShowHide);
            CancelRecLabel.Text = Lang.Get(Lang.K.CancelRec);
            RecordHotkeyButton.ToolTip = ShowHideHotkeyButton.ToolTip = CancelHotkeyButton.ToolTip = Lang.Get(Lang.K.HotkeyTip);
            ResetHotkeysButton.Content = Lang.Get(Lang.K.ResetDefaults);
            ResetHotkeysButton.ToolTip = Lang.Format(Lang.K.ResetTip, HotkeyConfig.DefaultRecord, HotkeyConfig.DefaultShowHide, HotkeyConfig.DefaultCancel);
            ShortcutsHint.Text = Lang.Get(Lang.K.ShortcutsHint);
            // Chain editor strings live in Lang.cs (K.Chain*) like every other label.
            SttChainHeader.Text = Lang.Get(Lang.K.ChainSttTitle);
            ResetSttButton.Content = Lang.Get(Lang.K.ChainReset);
            ResetSttButton.ToolTip = Lang.Get(Lang.K.ChainResetTip);
            SttHint.Text = Lang.Get(Lang.K.ChainSttHint);
            PolishChainHeader.Text = Lang.Get(Lang.K.ChainPolishTitle);
            ResetPolishButton.Content = Lang.Get(Lang.K.ChainReset);
            ResetPolishButton.ToolTip = Lang.Get(Lang.K.ChainResetTip);
            PolishHint.Text = Lang.Get(Lang.K.ChainPolishHint);
            CustomHeader.Text = Lang.Get(Lang.K.ChainCustomTitle);
            CustomIdLabel.Text = Lang.Get(Lang.K.ChainCustomId);
            CustomNameLabel.Text = Lang.Get(Lang.K.ChainCustomName);
            CustomBaseLabel.Text = Lang.Get(Lang.K.ChainCustomBase);
            CustomKeyLabel.Text = Lang.Get(Lang.K.ChainCustomKey);
            CustomModelLabel.Text = Lang.Get(Lang.K.ChainCustomModel);
            AddCustomButton.Content = Lang.Get(Lang.K.ChainCustomAdd);
            AddCustomButton.ToolTip = Lang.Get(Lang.K.ChainCustomAddTip);
            CustomHint.Text = Lang.Get(Lang.K.ChainCustomHint);
            // Refresh notes to reflect language switch
            RefreshSttChain();
            RefreshPolishChain();
            OptionsHeader.Text = Lang.Get(Lang.K.Options);
            ThemeLabel.Text = Lang.Get(Lang.K.Theme);
            ThemeComboBox.ToolTip = Lang.Get(Lang.K.ThemeTip);
            RebuildCombo(ThemeComboBox, Lang.Get(Lang.K.ThemeDark), Lang.Get(Lang.K.ThemeLight), ThemeManager.IsDark(ThemeManager.LoadTheme()) ? 0 : 1);
            LangLabel.Text = Lang.Get(Lang.K.LangLabel);
            LanguageComboBox.ToolTip = Lang.Get(Lang.K.LangTip);
            RebuildCombo(LanguageComboBox, Lang.Get(Lang.K.LangNameFa), Lang.Get(Lang.K.LangNameEn), Lang.Current == Lang.En ? 1 : 0);
            InjectLabel.Text = Lang.Get(Lang.K.InjectMode);
            InjectModeComboBox.ToolTip = Lang.Get(Lang.K.InjectTip);
            RebuildCombo(InjectModeComboBox, Lang.Get(Lang.K.InjectInstant), Lang.Get(Lang.K.InjectAnimated), NativeMethods.LoadInjectMode() == NativeMethods.InjectMode.Animated ? 1 : 0);
            HotkeyShowsPillCheck.Content = Lang.Get(Lang.K.HotkeyShowsPill);
            AutoCopyCheck.Content = Lang.Get(Lang.K.AutoCopy);
            ShowEngineLabelCheck.Content = Lang.Get(Lang.K.ShowEngine);
            VerboseStatusCheck.Content = Lang.Get(Lang.K.Verbose);
            OptionsHint.Text = Lang.Get(Lang.K.OptionsHint);
            SaveButton.Content = Lang.Get(Lang.K.Save);
            CancelButton.Content = Lang.Get(Lang.K.Cancel);
            RenderStatus();
        }
        catch { }
        finally { _applyingLang = false; }
    }

    private static void RebuildCombo(ComboBox box, string first, string second, int selected)
    {
        try { box.Items.Clear(); box.Items.Add(first); box.Items.Add(second); box.SelectedIndex = selected is 0 or 1 ? selected : 0; } catch { }
    }

    private void SetStatus(string key, params object?[] args) { _statusKey = key; _statusArgs = args; _statusEmpty = false; RenderStatus(); }
    private void SetStatusRaw(string text) { _statusKey = "__raw__"; _statusArgs = new object?[] { text }; _statusEmpty = false; try { StatusText.Text = text; } catch { } }
    private void RenderStatus() { try { if (_statusKey == "__raw__") StatusText.Text = _statusArgs.Length > 0 ? _statusArgs[0]?.ToString() ?? "" : ""; else StatusText.Text = _statusEmpty ? "" : Lang.Format(_statusKey, _statusArgs); } catch { } }

    private void ApplyTitleBarTheme()
    {
        try { var hwnd = new WindowInteropHelper(this).Handle; if (hwnd == IntPtr.Zero) return; int useDark = ThemeManager.IsDark(ThemeManager.LoadTheme()) ? 1 : 0; DwmSetWindowAttribute(hwnd, DwmwaUseImmersiveDarkMode, ref useDark, sizeof(int)); } catch { }
    }
    private string SelectedTheme() => ThemeComboBox.SelectedIndex == 1 ? ThemeManager.Light : ThemeManager.Dark;
    private void ThemeComboBox_SelectionChanged(object sender, SelectionChangedEventArgs e)
    {
        if (!_themeReady || _applyingLang) return;
        try { var theme = SelectedTheme(); ThemeManager.SaveTheme(theme); ThemeManager.ApplyTheme(theme); ApplyTitleBarTheme(); } catch { }
    }
    private string SelectedUiLang() => LanguageComboBox.SelectedIndex == 1 ? Lang.En : Lang.Fa;
    private void LanguageComboBox_SelectionChanged(object sender, SelectionChangedEventArgs e)
    {
        if (!_langReady || _applyingLang) return;
        try { Lang.Set(SelectedUiLang()); } catch { }
    }

    // ---- chain editor helpers ----
    private void RefreshSttChain()
    {
        try
        {
            _suppressChainSave = true;
            var chain = HamNegar.Native.Chain.ChainEngine.GetSttChain();
            var rows = new List<ChainRow>(chain.Count);
            foreach (var c in chain)
            {
                var id = c.Id ?? string.Empty;
                string note;
                if (id.Equals("google/gemini-flash-lite-latest", StringComparison.OrdinalIgnoreCase)) note = Lang.Get(Lang.K.ChainNote1);
                else if (id.Equals("google/gemini-3.5-flash-lite", StringComparison.OrdinalIgnoreCase)) note = Lang.Get(Lang.K.ChainNote2);
                else if (id.Equals("google/gemini-3.1-flash-lite", StringComparison.OrdinalIgnoreCase)) note = Lang.Get(Lang.K.ChainNote3);
                else if (id.Equals("groq/whisper-large-v3", StringComparison.OrdinalIgnoreCase)) note = Lang.Get(Lang.K.ChainNote4);
                else if (id.StartsWith("custom/", StringComparison.OrdinalIgnoreCase)) note = Lang.Get(Lang.K.ChainNoteCustomStt);
                else note = Lang.Get(Lang.K.ChainNoteUnknown);
                rows.Add(new ChainRow { Id = id, Note = note, Enabled = c.Enabled, RemoveVisibility = Visibility.Collapsed });
            }
            _sttRows = rows;
            SttChainItems.ItemsSource = null;
            SttChainItems.ItemsSource = _sttRows;
        }
        catch { }
        finally { _suppressChainSave = false; }
    }

    private void RefreshPolishChain()
    {
        try
        {
            _suppressChainSave = true;
            var chain = HamNegar.Native.Chain.ChainEngine.GetPolishChain();
            var customs = HamNegar.Native.Chain.ChainEngine.ListCustomProviders().ToDictionary(c => $"custom/{c.Id.Trim()}", c => c, StringComparer.OrdinalIgnoreCase);
            var rows = new List<ChainRow>(chain.Count);
            foreach (var c in chain)
            {
                var id = c.Id ?? string.Empty;
                string sub;
                bool isCustom = id.StartsWith("custom/", StringComparison.OrdinalIgnoreCase);
                if (isCustom && customs.TryGetValue(id, out var cp))
                    sub = $"{cp.BaseUrl} · {cp.Model}".Trim(' ', '·');
                else if (id.Equals("groq/qwen/qwen3.6-27b", StringComparison.OrdinalIgnoreCase)) sub = Lang.Get(Lang.K.ChainPolishDefault);
                else if (id.StartsWith("google/", StringComparison.OrdinalIgnoreCase)) sub = Lang.Get(Lang.K.ChainPolishGoogleFallback);
                else if (id.StartsWith("groq/", StringComparison.OrdinalIgnoreCase)) sub = Lang.Get(Lang.K.ChainPolishGroq);
                else sub = isCustom ? Lang.Get(Lang.K.ChainPolishCustomMissing) : "";
                rows.Add(new ChainRow { Id = id, Note = "", Sub = sub, Enabled = c.Enabled, RemoveVisibility = isCustom ? Visibility.Visible : Visibility.Collapsed });
            }
            _polishRows = rows;
            PolishChainItems.ItemsSource = null;
            PolishChainItems.ItemsSource = _polishRows;
        }
        catch { }
        finally { _suppressChainSave = false; }
    }

    private void PersistSttFromRows()
    {
        if (_suppressChainSave) return;
        try
        {
            var entries = _sttRows.Select(r => new ChainEntry { Id = r.Id, Enabled = r.Enabled }).ToList();
            if (entries.Count > 0 && entries.All(e => !e.Enabled))
            {
                // keep as-is; engine will fallback to all enabled on transcribe, but UI keeps showing all off
            }
            HamNegar.Native.Chain.ChainEngine.SaveSttChain(entries);
        }
        catch { }
    }

    private void PersistPolishFromRows()
    {
        if (_suppressChainSave) return;
        try
        {
            var entries = _polishRows.Select(r => new ChainEntry { Id = r.Id, Enabled = r.Enabled }).ToList();
            HamNegar.Native.Chain.ChainEngine.SavePolishChain(entries);
        }
        catch { }
    }

    private void ChainEnabled_Changed(object sender, RoutedEventArgs e)
    {
        if (_suppressChainSave) return;
        // Checkbox is TwoWay bound; row.Enabled already updated. Persist both chains (one of them changed).
        try
        {
            if (sender is CheckBox cb)
            {
                // Determine which ItemsControl owns this CheckBox by walking up? Persist both to be safe.
                PersistSttFromRows();
                PersistPolishFromRows();
                SetStatusRaw(Lang.Get(Lang.K.ChainSaved));
            }
        }
        catch { }
    }

    private void SttUp_Click(object sender, RoutedEventArgs e)
    {
        var id = (sender as Button)?.Tag as string ?? string.Empty;
        if (string.IsNullOrEmpty(id)) return;
        var idx = _sttRows.FindIndex(r => string.Equals(r.Id, id, StringComparison.OrdinalIgnoreCase));
        if (idx <= 0) return;
        var tmp = _sttRows[idx - 1]; _sttRows[idx - 1] = _sttRows[idx]; _sttRows[idx] = tmp;
        HamNegar.Native.Chain.ChainEngine.SaveSttChain(_sttRows.Select(r => new ChainEntry { Id = r.Id, Enabled = r.Enabled }).ToList());
        RefreshSttChain();
        SetStatusRaw(Lang.Get(Lang.K.ChainSttSaved));
    }

    private void SttDown_Click(object sender, RoutedEventArgs e)
    {
        var id = (sender as Button)?.Tag as string ?? string.Empty;
        if (string.IsNullOrEmpty(id)) return;
        var idx = _sttRows.FindIndex(r => string.Equals(r.Id, id, StringComparison.OrdinalIgnoreCase));
        if (idx < 0 || idx >= _sttRows.Count - 1) return;
        var tmp = _sttRows[idx + 1]; _sttRows[idx + 1] = _sttRows[idx]; _sttRows[idx] = tmp;
        HamNegar.Native.Chain.ChainEngine.SaveSttChain(_sttRows.Select(r => new ChainEntry { Id = r.Id, Enabled = r.Enabled }).ToList());
        RefreshSttChain();
        SetStatusRaw(Lang.Get(Lang.K.ChainSttSaved));
    }

    private void PolishUp_Click(object sender, RoutedEventArgs e)
    {
        var id = (sender as Button)?.Tag as string ?? string.Empty;
        if (string.IsNullOrEmpty(id)) return;
        var idx = _polishRows.FindIndex(r => string.Equals(r.Id, id, StringComparison.OrdinalIgnoreCase));
        if (idx <= 0) return;
        var tmp = _polishRows[idx - 1]; _polishRows[idx - 1] = _polishRows[idx]; _polishRows[idx] = tmp;
        HamNegar.Native.Chain.ChainEngine.SavePolishChain(_polishRows.Select(r => new ChainEntry { Id = r.Id, Enabled = r.Enabled }).ToList());
        RefreshPolishChain();
        SetStatusRaw(Lang.Get(Lang.K.ChainPolishSaved));
    }

    private void PolishDown_Click(object sender, RoutedEventArgs e)
    {
        var id = (sender as Button)?.Tag as string ?? string.Empty;
        if (string.IsNullOrEmpty(id)) return;
        var idx = _polishRows.FindIndex(r => string.Equals(r.Id, id, StringComparison.OrdinalIgnoreCase));
        if (idx < 0 || idx >= _polishRows.Count - 1) return;
        var tmp = _polishRows[idx + 1]; _polishRows[idx + 1] = _polishRows[idx]; _polishRows[idx] = tmp;
        HamNegar.Native.Chain.ChainEngine.SavePolishChain(_polishRows.Select(r => new ChainEntry { Id = r.Id, Enabled = r.Enabled }).ToList());
        RefreshPolishChain();
        SetStatusRaw(Lang.Get(Lang.K.ChainPolishSaved));
    }

    private void ResetSttButton_Click(object sender, RoutedEventArgs e)
    {
        try { HamNegar.Native.Chain.ChainEngine.ResetSttChain(); RefreshSttChain(); SetStatusRaw(Lang.Get(Lang.K.ChainSttResetDone)); } catch { }
    }

    private void ResetPolishButton_Click(object sender, RoutedEventArgs e)
    {
        try { HamNegar.Native.Chain.ChainEngine.ResetPolishChain(); RefreshPolishChain(); SetStatusRaw(Lang.Get(Lang.K.ChainPolishResetDone)); } catch { }
    }

    private void AddCustomButton_Click(object sender, RoutedEventArgs e)
    {
        var id = CustomIdBox.Text?.Trim() ?? string.Empty;
        var name = CustomNameBox.Text?.Trim() ?? string.Empty;
        var baseUrl = CustomBaseBox.Text?.Trim().TrimEnd('/') ?? string.Empty;
        var key = CustomKeyBox.Password?.Trim() ?? string.Empty;
        var model = CustomModelBox.Text?.Trim() ?? string.Empty;
        if (string.IsNullOrEmpty(id)) { SetStatusRaw(Lang.Get(Lang.K.ChainIdRequired)); return; }
        if (string.IsNullOrEmpty(baseUrl)) { SetStatusRaw(Lang.Get(Lang.K.ChainBaseRequired)); return; }
        if (!Uri.TryCreate(baseUrl, UriKind.Absolute, out var uri) || !uri.Scheme.Equals("https", StringComparison.OrdinalIgnoreCase)) { SetStatusRaw(Lang.Get(Lang.K.ChainBaseHttps)); return; }
        if (string.IsNullOrEmpty(model)) { SetStatusRaw(Lang.Get(Lang.K.ChainModelRequired)); return; }
        if (string.IsNullOrEmpty(key)) { SetStatusRaw(Lang.Get(Lang.K.ChainKeyRequired)); return; }
        try
        {
            HamNegar.Native.Chain.ChainEngine.UpsertCustomProvider(new CustomProvider { Id = id, Name = name, BaseUrl = baseUrl, Key = key, Model = model });
            CustomIdBox.Text = CustomNameBox.Text = CustomBaseBox.Text = CustomModelBox.Text = string.Empty;
            try { CustomKeyBox.Password = string.Empty; } catch { }
            RefreshPolishChain();
            SetStatusRaw(Lang.Get(Lang.K.ChainProviderAdded));
        }
        catch (Exception ex) { var m = ex.Message ?? ex.GetType().Name; if (m.Length > 220) m = m[..220]; SetStatusRaw(m); }
    }

    private void RemoveCustom_Click(object sender, RoutedEventArgs e)
    {
        var id = (sender as Button)?.Tag as string ?? string.Empty;
        if (string.IsNullOrEmpty(id)) return;
        var cid = id.StartsWith("custom/", StringComparison.OrdinalIgnoreCase) ? id.Substring("custom/".Length) : id;
        try { HamNegar.Native.Chain.ChainEngine.RemoveCustomProvider(cid); RefreshPolishChain(); SetStatusRaw(Lang.Get(Lang.K.ChainRemoved)); } catch { }
    }

    // ---- click-to-record hotkey capture ----
    private void HotkeyButton_Click(object sender, RoutedEventArgs e)
    {
        if (sender is not Button btn) return;
        Disarm(restore: true);
        _arming = btn;
        btn.Tag = btn.Content;
        btn.Content = Lang.Get(Lang.K.PressKeys);
        btn.Focus();
    }

    private void HotkeyButton_PreviewKeyDown(object sender, KeyEventArgs e)
    {
        if (sender is not Button btn || _arming != btn) return;
        var key = e.Key == Key.System ? e.SystemKey : e.Key;
        if (key is Key.Escape) { Disarm(restore: true); e.Handled = true; return; }
        if (IsBareModifier(key) || key is Key.ImeProcessed or Key.DeadCharProcessed) return;
        var mods = Keyboard.Modifiers;
        if (mods == ModifierKeys.None) { btn.Content = Lang.Get(Lang.K.HoldMod); e.Handled = true; return; }
        var combo = HotkeyConfig.Build(mods, key);
        if (!HotkeyConfig.TryParse(combo, out _, out _)) { btn.Content = Lang.Get(Lang.K.NotUsable); e.Handled = true; return; }
        btn.Content = btn.Tag = combo;
        _arming = null;
        MoveFocus(new TraversalRequest(FocusNavigationDirection.Next));
        e.Handled = true;
    }

    private void HotkeyButton_LostFocus(object sender, RoutedEventArgs e) { if (sender is Button btn && _arming == btn) Disarm(restore: true); }
    private void Disarm(bool restore) { if (_arming is null) return; if (restore && _arming.Tag is string prev) _arming.Content = prev; _arming = null; }
    private static bool IsBareModifier(Key key) => key is Key.LeftCtrl or Key.RightCtrl or Key.LeftAlt or Key.RightAlt or Key.LeftShift or Key.RightShift or Key.LWin or Key.RWin or Key.System;
    private void ResetHotkeysButton_Click(object sender, RoutedEventArgs e) { Disarm(restore: true); RecordHotkeyButton.Content = RecordHotkeyButton.Tag = HotkeyConfig.DefaultRecord; ShowHideHotkeyButton.Content = ShowHideHotkeyButton.Tag = HotkeyConfig.DefaultShowHide; CancelHotkeyButton.Content = CancelHotkeyButton.Tag = HotkeyConfig.DefaultCancel; }

    private string SelectedInjectMode() => InjectModeComboBox.SelectedIndex == 1 ? "animated" : "instant";
    public static bool LoadHotkeyShowsPill()
    {
        try { var path = SettingsStore.SettingsPath; if (!File.Exists(path)) return true; var root = JsonNode.Parse(File.ReadAllText(path))?.AsObject(); return root?["hotkeyShowsPill"]?.GetValue<bool>() ?? true; } catch { return true; }
    }
    public static bool LoadVerboseStatus()
    {
        try { var path = SettingsStore.SettingsPath; if (!File.Exists(path)) return false; var root = JsonNode.Parse(File.ReadAllText(path))?.AsObject(); return root?["verboseStatus"]?.GetValue<bool>() ?? false; } catch { return false; }
    }
    private static void SaveAdditivePrefs(string injectMode, bool hotkeyShowsPill, bool verboseStatus, string uiLang)
    {
        JsonObject root;
        try { var path = SettingsStore.SettingsPath; root = File.Exists(path) ? JsonNode.Parse(File.ReadAllText(path))?.AsObject() ?? new JsonObject() : new JsonObject(); } catch { root = new JsonObject(); }
        root["injectMode"] = injectMode; root["hotkeyShowsPill"] = hotkeyShowsPill; root["verboseStatus"] = verboseStatus; root["uiLang"] = Lang.Normalize(uiLang);
        var dir = Path.GetDirectoryName(SettingsStore.SettingsPath); if (!string.IsNullOrEmpty(dir)) Directory.CreateDirectory(dir);
        File.WriteAllText(SettingsStore.SettingsPath, root.ToJsonString(new JsonSerializerOptions { WriteIndented = true }));
    }

    private void SaveButton_Click(object sender, RoutedEventArgs e)
    {
        Disarm(restore: true);
        var keys = new PillSettings { GoogleKey = GoogleKeyBox.Password.Trim(), GroqKey = GroqKeyBox.Password.Trim() };
        var extras = new ExtraSettings { RecordHotkey = HotkeyConfig.Normalize(RecordHotkeyButton.Content as string, HotkeyConfig.DefaultRecord), ShowHideHotkey = HotkeyConfig.Normalize(ShowHideHotkeyButton.Content as string, HotkeyConfig.DefaultShowHide), CancelHotkey = HotkeyConfig.Normalize(CancelHotkeyButton.Content as string, HotkeyConfig.DefaultCancel), AutoCopy = AutoCopyCheck.IsChecked != false, ShowEngineLabel = ShowEngineLabelCheck.IsChecked != false, };
        var injectMode = SelectedInjectMode();
        var hotkeyShowsPill = HotkeyShowsPillCheck.IsChecked != false;
        var verboseStatus = VerboseStatusCheck.IsChecked == true;
        try
        {
            // Persist current chain enable states (live already, but ensure Save is authoritative)
            PersistSttFromRows();
            PersistPolishFromRows();
            ThemeManager.SaveTheme(SelectedTheme());
            SettingsExtras.Save(keys, extras);
            SaveAdditivePrefs(injectMode, hotkeyShowsPill, verboseStatus, SelectedUiLang());
            SetStatus(Lang.K.SavedFmt, SettingsStore.KeyPresence(keys));
            DialogResult = true;
            Close();
        }
        catch (Exception ex) { var m = ex.Message ?? ex.GetType().Name; SetStatus(Lang.K.SaveError, m.Length > 220 ? m[..220] : m); }
    }

    private void CancelButton_Click(object sender, RoutedEventArgs e) { Disarm(restore: true); DialogResult = false; Close(); }
}
