// Lang: the ONE home for every user-facing string (codebase-design deep module).
// Small interface: Current, Set(lang), Get(key), Format(key, args)
// (+ EngineName/Digits helpers). Two dictionaries (fa default, en) keyed by
// stable ids in K. Literals outside this file are a violation.
//
// SINGLE MECHANISM (documented choice): code-behind ApplyLang() in each window.
// x:Uid is NOT used anywhere: it needs resx/build plumbing and cannot cover
// dynamic templates (status lines with params) or window titles uniformly;
// ApplyLang() covers XAML labels, tooltips, titles, combos AND status/toast
// templates in one place. XAML therefore carries NO user-facing literals —
// only icon glyph codes (&#xE...) which are non-linguistic vector icons.
// Verify: grep XAML for Text="/Content="/ToolTip=/Title= attributes holding
// letters (Persian or Latin); only glyph codes and "" may remain.
//
// Persistence: additive `uiLang` key in pill.settings.json (default "fa",
// never-throw load; corrupt/missing/unknown → "fa"). Set() persists + fires
// Changed so ALL open windows re-ApplyLang() live (incl. titles). Restart
// persists: the static ctor loads before any window exists (App calls Init()).
// Like ThemeManager, Cancel in Settings keeps the live choice.
//
// Params (engine/count/hotkey) stay interpolated via Format — never logged
// content beyond existing rules (lengths/HWNDs only, same as before).
// Verbose technical lines (Tech*) are intentionally IDENTICAL in both dicts:
// diagnostics stay stable English regardless of UI language.

using System.IO;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;

namespace HamNegar.Native;

public static class Lang
{
    public const string Fa = "fa";
    public const string En = "en";

    // Stable string ids. Call sites use these consts — no magic strings.
    public static class K
    {
        // Main window
        public const string MainTitle = "main_title";
        public const string PillTitle = "pill_title";
        public const string TipHistory = "tip_history";
        public const string TipSettings = "tip_settings";
        public const string TipHide = "tip_hide";
        public const string TipClose = "tip_close";
        public const string MicTip = "mic_tip";               // {0} hotkey
        public const string ReadyStatus = "ready_status";     // {0} hotkey
        public const string TipCancel = "tip_cancel";
        public const string TipRetry = "tip_retry";
        public const string TipDiscard = "tip_discard";
        public const string EngineChip = "engine_chip";       // {0} engine
        public const string HotkeyFail = "hotkey_fail";
        public const string TranscribingBusy = "transcribing_busy";
        public const string MicError = "mic_error";           // {0} short msg
        public const string Recording = "recording";
        public const string StopError = "stop_error";         // {0} short msg
        public const string Sending = "sending";
        public const string AttemptOk = "attempt_ok";         // {0} n {1} engine
        public const string AttemptNext = "attempt_next";     // {0} n {1} engine
        public const string EngineGoogle = "engine_google";
        public const string EngineGroq = "engine_groq";
        public const string CanceledKept = "canceled_kept";
        public const string TooShort = "too_short";
        public const string FailedKept = "failed_kept";
        public const string KeptMissing = "kept_missing";
        public const string Discarded = "discarded";
        public const string Canceled = "canceled";
        // Inject (human first line)
        public const string InjEmpty = "inj_empty";
        public const string InjGone = "inj_gone";
        public const string InjLanded = "inj_landed";         // {0} engine
        public const string InjFocusMoved = "inj_focus_moved";
        public const string InjPartial = "inj_partial";       // {0} sent {1} total
        // Verbose technical lines (same EN text in both dicts — diagnostics)
        public const string TechEmpty = "tech_empty";         // {0} engine
        public const string TechGone = "tech_gone";           // {0} eng {1} hwnd {2} tail
        public const string TechDone = "tech_done";           // 7 args
        public const string TechStopped = "tech_stopped";     // 6 args
        public const string TailClipboard = "tail_clipboard";
        public const string TailHistory = "tail_history";
        public const string TailKept = "tail_kept";
        public const string TailCopied = "tail_copied";
        public const string TailBackupManual = "tail_backup_manual";
        // Settings window
        public const string SettingsTitle = "settings_title";
        public const string ApiKeys = "api_keys";
        public const string GoogleKey = "google_key";
        public const string GroqKey = "groq_key";
        public const string KeysHint = "keys_hint";
        public const string Shortcuts = "shortcuts";
        public const string RecToggle = "rec_toggle";
        public const string ShowHide = "show_hide";
        public const string CancelRec = "cancel_rec";
        public const string HotkeyTip = "hotkey_tip";
        public const string ResetDefaults = "reset_defaults";
        public const string ResetTip = "reset_tip";           // {0} {1} {2} defaults
        public const string ShortcutsHint = "shortcuts_hint";
        public const string ChainTitle = "chain_title";
        public const string ChainNote1 = "chain_note_1";
        public const string ChainNote2 = "chain_note_2";
        public const string ChainNote3 = "chain_note_3";
        public const string ChainNote4 = "chain_note_4";
        public const string Options = "options";
        public const string Theme = "theme";
        public const string ThemeTip = "theme_tip";
        public const string ThemeDark = "theme_dark";
        public const string ThemeLight = "theme_light";
        public const string LangLabel = "lang_label";
        public const string LangTip = "lang_tip";
        public const string LangNameFa = "lang_name_fa";
        public const string LangNameEn = "lang_name_en";
        public const string InjectMode = "inject_mode";
        public const string InjectTip = "inject_tip";
        public const string InjectInstant = "inject_instant";
        public const string InjectAnimated = "inject_animated";
        public const string HotkeyShowsPill = "hotkey_shows_pill";
        public const string AutoCopy = "autocopy";
        public const string ShowEngine = "show_engine";
        public const string Verbose = "verbose";
        public const string OptionsHint = "options_hint";
        public const string Save = "save";
        public const string Cancel = "cancel";
        public const string PressKeys = "press_keys";
        public const string HoldMod = "hold_mod";
        public const string NotUsable = "not_usable";
        public const string SavedFmt = "saved_fmt";           // {0} presence
        public const string SaveError = "save_error";         // {0} short msg
        // History window
        public const string HistoryTitle = "history_title";
        public const string HistoryHeader = "history_header";
        public const string ClearAll = "clear_all";
        public const string ClearTip = "clear_tip";
        public const string EmptyHint = "empty_hint";
        public const string ReinjectTip = "reinject_tip";
        public const string CopyTip = "copy_tip";
        public const string DeleteTip = "delete_tip";
        public const string NotFound = "not_found";
        public const string Resent = "resent";
        public const string CopiedPaste = "copied_paste";
        public const string Copied = "copied";
        public const string Deleted = "deleted";
        public const string Cleared = "cleared";
    }

    private static readonly Dictionary<string, string> _fa = new()
    {
        [K.MainTitle] = "HamNegar (proto)",
        [K.PillTitle] = "HamNegar (proto)",
        [K.TipHistory] = "تاریخچه",
        [K.TipSettings] = "تنظیمات",
        [K.TipHide] = "پنهان (هات‌کی دوباره نشان می‌دهد)",
        [K.TipClose] = "بستن",
        [K.MicTip] = "ضبط/توقف ({0})",
        [K.ReadyStatus] = "آماده — {0} برای ضبط",
        [K.TipCancel] = "لغو (انصراف)",
        [K.TipRetry] = "تلاش مجدد از صدای نگه‌داشته‌شده",
        [K.TipDiscard] = "دور ریختن صدا",
        [K.EngineChip] = "موتور: {0}",
        [K.HotkeyFail] = "ثبت هات‌کی ناموفق بود — از دکمه میکروفون استفاده کنید.",
        [K.TranscribingBusy] = "در حال تبدیل — ✕ یا هات‌کی لغو.",
        [K.MicError] = "خطای میکروفون: {0}",
        [K.Recording] = "در حال ضبط… برای توقف دوباره هات‌کی را بفشارید.",
        [K.StopError] = "خطای توقف: {0}",
        [K.Sending] = "در حال ارسال…",
        [K.AttemptOk] = "تلاش {0}: {1} ✓",
        [K.AttemptNext] = "تلاش {0}: {1} ✗ ← بعدی…",
        [K.EngineGoogle] = "گوگل",
        [K.EngineGroq] = "گروک",
        [K.CanceledKept] = "لغو شد — صدا نگه داشته شد، تلاش مجدد؟",
        [K.TooShort] = "صدا خیلی کوتاه بود — چیزی ارسال نشد.",
        [K.FailedKept] = "ناموفق بود — صدا نگه داشته شد، تلاش مجدد؟",
        [K.KeptMissing] = "صدای نگه‌داشته‌شده پیدا نشد.",
        [K.Discarded] = "دور ریخته شد.",
        [K.Canceled] = "لغو شد.",
        [K.InjEmpty] = "متن خالی — چیزی تایپ نشد.",
        [K.InjGone] = "پنجره مقصد بسته شد — در تاریخچه نگه داشته شد.",
        [K.InjLanded] = "نشست با {0}",
        [K.InjFocusMoved] = "توقف: فوکوس عوض شد — بقیه در تاریخچه",
        [K.InjPartial] = "ناقص تایپ شد ({0}/{1}) — بقیه در تاریخچه",
        [K.SettingsTitle] = "تنظیمات",
        [K.ApiKeys] = "کلیدهای API",
        [K.GoogleKey] = "کلید گوگل",
        [K.GroqKey] = "کلید گروک",
        [K.KeysHint] = "کلیدها: %AppData%/HamNegar/pill.settings.json (JSON ساده — فقط نمونه اولیه)",
        [K.Shortcuts] = "میان‌برها",
        [K.RecToggle] = "شروع/توقف ضبط",
        [K.ShowHide] = "نمایش/پنهان قرص",
        [K.CancelRec] = "لغو ضبط",
        [K.HotkeyTip] = "کلیک کنید، سپس میان‌بر جدید را بفشارید",
        [K.ResetDefaults] = "بازنشانی پیش‌فرض‌ها",
        [K.ResetTip] = "بازگشت به {0} / {1} / {2}",
        [K.ShortcutsHint] = "روی یک میان‌بر کلیک کنید، سپس کلیدهای جدید را بفشارید (نیاز به کلید ترکیبی). در pill.settings.json ذخیره می‌شود.",
        [K.ChainTitle] = "زنجیره رونویسی (ترتیب ثابت)",
        [K.ChainNote1] = "اول امتحان می‌شود · سریع‌ترین",
        [K.ChainNote2] = "مدل جایگزین",
        [K.ChainNote3] = "آخرین جایگزین گوگل",
        [K.ChainNote4] = "آخرین جایگزین · گروک",
        [K.Options] = "گزینه‌ها",
        [K.Theme] = "پوسته",
        [K.ThemeTip] = "تیره پیش‌فرض است؛ روی همه پنجره‌ها هم‌زمان اعمال می‌شود",
        [K.ThemeDark] = "تیره",
        [K.ThemeLight] = "روشن",
        [K.LangLabel] = "زبان",
        [K.LangTip] = "روی همه پنجره‌های باز هم‌زمان اعمال می‌شود",
        [K.LangNameFa] = "فارسی",
        [K.LangNameEn] = "English",
        [K.InjectMode] = "حالت تزریق",
        [K.InjectTip] = "آنی همه را یکجا تایپ می‌کند (پیش‌فرض امن)؛ متحرک تکه‌تکه تایپ می‌کند و با جابه‌جایی فوکوس می‌ایستد",
        [K.InjectInstant] = "آنی",
        [K.InjectAnimated] = "متحرک",
        [K.HotkeyShowsPill] = "نمایش قرص با هات‌کی هنگام پنهان بودن",
        [K.AutoCopy] = "کپی رونوشت در حافظه (پشتیبان بی‌صدا)",
        [K.ShowEngine] = "نمایش برچسب موتور روی قرص",
        [K.Verbose] = "نمایش جزئیات فنی",
        [K.OptionsHint] = "همه گزینه‌ها اکنون ذخیره می‌شوند.",
        [K.Save] = "ذخیره",
        [K.Cancel] = "انصراف",
        [K.PressKeys] = "کلیدها را بفشارید… (Esc انصراف)",
        [K.HoldMod] = "کلید Ctrl / Alt / Shift / Win + کلید را نگه دارید…",
        [K.NotUsable] = "قابل استفاده نیست — دوباره تلاش کنید…",
        [K.SavedFmt] = "ذخیره شد. ({0})",
        [K.SaveError] = "خطای ذخیره: {0}",
        [K.HistoryTitle] = "تاریخچه",
        [K.HistoryHeader] = "تاریخچه رونویسی‌ها",
        [K.ClearAll] = "پاک‌کردن همه",
        [K.ClearTip] = "حذف همه موارد تاریخچه",
        [K.EmptyHint] = "هنوز چیزی رونویسی نشده است.",
        [K.ReinjectTip] = "تایپ دوباره در پنجره قبلی",
        [K.CopyTip] = "کپی در حافظه (clipboard)",
        [K.DeleteTip] = "حذف",
        [K.NotFound] = "موردی یافت نشد.",
        [K.Resent] = "ارسال شد — نتیجه را در خط وضعیت پنجره اصلی ببینید.",
        [K.CopiedPaste] = "در حافظه کپی شد (clipboard) — با Ctrl+V بچسبانید.",
        [K.Copied] = "در حافظه کپی شد (clipboard).",
        [K.Deleted] = "حذف شد.",
        [K.Cleared] = "تاریخچه پاک شد.",
    };

    private static readonly Dictionary<string, string> _en = new()
    {
        [K.MainTitle] = "HamNegar (proto)",
        [K.PillTitle] = "HamNegar (proto)",
        [K.TipHistory] = "History",
        [K.TipSettings] = "Settings",
        [K.TipHide] = "Hide (hotkey shows again)",
        [K.TipClose] = "Close",
        [K.MicTip] = "Toggle record ({0})",
        [K.ReadyStatus] = "Ready — {0} to record",
        [K.TipCancel] = "Cancel",
        [K.TipRetry] = "Retry from kept audio",
        [K.TipDiscard] = "Discard audio",
        [K.EngineChip] = "engine: {0}",
        [K.HotkeyFail] = "Hotkey register failed — use mic button.",
        [K.TranscribingBusy] = "Transcribing — ✕ or the cancel hotkey.",
        [K.MicError] = "Mic error: {0}",
        [K.Recording] = "Recording… press hotkey again to stop.",
        [K.StopError] = "Stop error: {0}",
        [K.Sending] = "Sending…",
        [K.AttemptOk] = "Attempt {0}: {1} ✓",
        [K.AttemptNext] = "Attempt {0}: {1} ✗ ← next…",
        [K.EngineGoogle] = "Google",
        [K.EngineGroq] = "Groq",
        [K.CanceledKept] = "Canceled — audio kept, retry?",
        [K.TooShort] = "Audio too short — nothing sent.",
        [K.FailedKept] = "Failed — audio kept, retry?",
        [K.KeptMissing] = "Kept audio not found.",
        [K.Discarded] = "Discarded.",
        [K.Canceled] = "Canceled.",
        [K.InjEmpty] = "Empty text — nothing typed.",
        [K.InjGone] = "Target window closed — kept in history.",
        [K.InjLanded] = "Landed via {0}",
        [K.InjFocusMoved] = "Stopped: focus moved — rest in history",
        [K.InjPartial] = "Partially typed ({0}/{1}) — rest in history",
        [K.SettingsTitle] = "Settings",
        [K.ApiKeys] = "API keys",
        [K.GoogleKey] = "Google key",
        [K.GroqKey] = "Groq key",
        [K.KeysHint] = "Keys: %AppData%/HamNegar/pill.settings.json (plain JSON — prototype only)",
        [K.Shortcuts] = "Shortcuts",
        [K.RecToggle] = "Record toggle",
        [K.ShowHide] = "Show / hide pill",
        [K.CancelRec] = "Cancel recording",
        [K.HotkeyTip] = "Click, then press the new shortcut",
        [K.ResetDefaults] = "Reset defaults",
        [K.ResetTip] = "Back to {0} / {1} / {2}",
        [K.ShortcutsHint] = "Click a shortcut, then press the new keys (needs a modifier). Saved to pill.settings.json.",
        [K.ChainTitle] = "Transcription chain (fixed order)",
        [K.ChainNote1] = "Tried first · fastest",
        [K.ChainNote2] = "Fallback model",
        [K.ChainNote3] = "Last Google fallback",
        [K.ChainNote4] = "Final fallback · Groq",
        [K.Options] = "Options",
        [K.Theme] = "Theme",
        [K.ThemeTip] = "Dark is the default; applies to every window at once",
        [K.ThemeDark] = "Dark",
        [K.ThemeLight] = "Light",
        [K.LangLabel] = "Language",
        [K.LangTip] = "Applies to every open window at once",
        [K.LangNameFa] = "فارسی",
        [K.LangNameEn] = "English",
        [K.InjectMode] = "Inject mode",
        [K.InjectTip] = "Instant types everything at once (safe default); animated types in chunks and stops if focus moves",
        [K.InjectInstant] = "Instant",
        [K.InjectAnimated] = "Animated",
        [K.HotkeyShowsPill] = "Hotkey shows pill when hidden",
        [K.AutoCopy] = "Copy transcript to clipboard (silent backup)",
        [K.ShowEngine] = "Show engine label on the pill",
        [K.Verbose] = "Show technical details",
        [K.OptionsHint] = "All options persist now.",
        [K.Save] = "Save",
        [K.Cancel] = "Cancel",
        [K.PressKeys] = "Press keys… (Esc cancels)",
        [K.HoldMod] = "Hold Ctrl / Alt / Shift / Win + key…",
        [K.NotUsable] = "Not usable — try again…",
        [K.SavedFmt] = "Saved. ({0})",
        [K.SaveError] = "Save error: {0}",
        [K.HistoryTitle] = "History",
        [K.HistoryHeader] = "Transcript history",
        [K.ClearAll] = "Clear all",
        [K.ClearTip] = "Delete all history items",
        [K.EmptyHint] = "Nothing transcribed yet.",
        [K.ReinjectTip] = "Type again into the previous window",
        [K.CopyTip] = "Copy to clipboard",
        [K.DeleteTip] = "Delete",
        [K.NotFound] = "Item not found.",
        [K.Resent] = "Sent — see the main window status line.",
        [K.CopiedPaste] = "Copied to clipboard — paste with Ctrl+V.",
        [K.Copied] = "Copied to clipboard.",
        [K.Deleted] = "Deleted.",
        [K.Cleared] = "History cleared.",
    };

    // Verbose diagnostics: identical EN text in both languages (stable logs).
    private static readonly Dictionary<string, string> _tech = new()
    {
        [K.TechEmpty] = "Done ({0}) — empty, nothing typed.",
        [K.TechGone] = "Done ({0}) — hwnd {1} gone; {2}",
        [K.TechDone] = "Done ({0}) — hwnd {1} restored:{2} fg:{3} mode:{4} typed {5}/{6} chars; {7}",
        [K.TechStopped] = "Stopped: focus moved — rest in history (typed {0}/{1} chars, hwnd {2} restored:{3} fg:{4} mode:animated); {5}",
        [K.TailClipboard] = "backup on clipboard.",
        [K.TailHistory] = "saved in history.",
        [K.TailKept] = "kept in history.",
        [K.TailCopied] = "copied, paste manually.",
        [K.TailBackupManual] = "backup on clipboard, paste manually.",
    };

    private const string UiLangKey = "uiLang";

    private static string _current = LoadUiLang();

    static Lang() { }

    public static string Current => _current;
    public static bool IsFa => _current != En;

    // Fired on the caller's thread after a successful Set().
    // Windows re-run ApplyLang() (marshalled to their Dispatcher).
    public static event Action? Changed;

    // Explicit startup hook (App.OnStartup, before any window exists).
    public static void Init() { /* static ctor already loaded */ }

    public static void Set(string lang)
    {
        var norm = Normalize(lang);
        bool changed = !string.Equals(norm, _current, StringComparison.Ordinal);
        _current = norm;
        SaveUiLang(norm);
        if (changed)
        {
            try { Changed?.Invoke(); } catch { /* best-effort only */ }
        }
    }

    public static string Normalize(string? raw) =>
        string.Equals(raw?.Trim(), En, StringComparison.OrdinalIgnoreCase) ? En : Fa;

    public static string Get(string key)
    {
        try
        {
            if (_tech.TryGetValue(key, out var t))
                return t;
            var dict = _current == En ? _en : _fa;
            if (dict.TryGetValue(key, out var s))
                return s;
            // Fallback to the other language before giving up (never-throw).
            var other = _current == En ? _fa : _en;
            if (other.TryGetValue(key, out var o))
                return o;
            return key;
        }
        catch
        {
            return key;
        }
    }

    public static string Format(string key, params object?[] args)
    {
        try
        {
            return string.Format(Get(key), args);
        }
        catch
        {
            return Get(key);
        }
    }

    // Engine display name: localized family name, raw id otherwise.
    public static string EngineName(string engine)
    {
        try
        {
            if ((engine ?? string.Empty).StartsWith("google/", StringComparison.OrdinalIgnoreCase))
                return Get(K.EngineGoogle);
            if ((engine ?? string.Empty).StartsWith("groq/", StringComparison.OrdinalIgnoreCase))
                return Get(K.EngineGroq);
            return engine ?? string.Empty;
        }
        catch
        {
            return engine ?? string.Empty;
        }
    }

    // Attempt counter digits: Persian digits in FA, invariant in EN.
    public static string Digits(int n)
    {
        var s = n.ToString(System.Globalization.CultureInfo.InvariantCulture);
        if (_current == En)
            return s;
        var sb = new StringBuilder(s.Length);
        foreach (var ch in s)
            sb.Append(ch >= '0' && ch <= '9' ? (char)('\u06F0' + (ch - '0')) : ch);
        return sb.ToString();
    }

    // Additive, never-throw load: missing/corrupt/unknown → "fa".
    public static string LoadUiLang()
    {
        try
        {
            var path = SettingsStore.SettingsPath;
            if (!File.Exists(path))
                return Fa;
            var raw = JsonNode.Parse(File.ReadAllText(path))?.AsObject()?[UiLangKey]?.GetValue<string>();
            return Normalize(raw);
        }
        catch
        {
            return Fa;
        }
    }

    // Additive merge save: preserves keys, hotkeys, options, unknown props.
    public static void SaveUiLang(string lang)
    {
        try
        {
            var normalized = Normalize(lang);
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
            root[UiLangKey] = normalized;
            var dir = Path.GetDirectoryName(SettingsStore.SettingsPath);
            if (!string.IsNullOrEmpty(dir))
                Directory.CreateDirectory(dir);
            File.WriteAllText(SettingsStore.SettingsPath,
                root.ToJsonString(new JsonSerializerOptions { WriteIndented = true }));
        }
        catch
        {
            // Prototype: persistence is best-effort only.
        }
    }
}
