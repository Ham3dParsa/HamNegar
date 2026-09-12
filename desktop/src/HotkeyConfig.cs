// Hotkey combos + non-secret prefs, persisted in the SAME prototype store:
// %AppData%/HamNegar/pill.settings.json (plain JSON — see TODO.txt §1).
//
// Shape (old files keep loading; unknown props are ignored by SettingsStore):
//   GoogleKey, GroqKey            (owned by SettingsStore/PillSettings)
//   RecordHotkey   e.g. "Ctrl+Shift+Space"   (default Ctrl+Shift+Space)
//   ShowHideHotkey e.g. "Ctrl+Shift+H"       (default Ctrl+Shift+H)
//   CancelHotkey   e.g. "Ctrl+Shift+X"       (default Ctrl+Shift+X — global
//                  discard; UI box comes later, JSON key is additive)
//   AutoCopy       bool (default false — clipboard untouched unless opted in)
//   ShowEngineLabel bool (default true)
//
// Collision rule: ONLY SettingsWindow (via SettingsExtras.Save below) writes
// this file. MainWindow must never call SettingsStore.Save — it would wipe
// the extended keys. Hotkey REGISTRATION lives in MainWindow (other track);
// see TODO.txt §7 for the paste-ready apply-on-startup patch calling
// HotkeyConfig.Register here.

using System.IO;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Windows.Input;

namespace HamNegar.Native;

public static class HotkeyConfig
{
    public const int RecordHotkeyId = 1;
    public const int ShowHideHotkeyId = 2;
    public const int CancelHotkeyId = 3;

    public const string DefaultRecord = "Ctrl+Shift+Space";
    public const string DefaultShowHide = "Ctrl+Shift+H";
    // Default cancel: Ctrl+Shift+X. NOT bare Escape: TryParse below requires a
    // modifier (a bare key would steal typing), and a GLOBAL Esc would fight
    // with every app's own Esc handling. Ctrl+Shift+X needs no typing keys,
    // mirrors the Ctrl+Shift+* family, and stays editable via settings JSON
    // (key "CancelHotkey"; UI box comes later — see TODO.txt).
    public const string DefaultCancel = "Ctrl+Shift+X";

    // Win32 MOD_* values, duplicated here so this file never touches NativeMethods.cs.
    private const uint MOD_ALT = 0x0001;
    private const uint MOD_CONTROL = 0x0002;
    private const uint MOD_SHIFT = 0x0004;
    private const uint MOD_WIN = 0x0008;

    // Canonical display string: Ctrl+Alt+Shift+Win+Key (RegisterHotKey order is irrelevant).
    public static string Build(ModifierKeys mods, Key key)
    {
        var parts = new List<string>(5);
        if (mods.HasFlag(ModifierKeys.Control))
            parts.Add("Ctrl");
        if (mods.HasFlag(ModifierKeys.Alt))
            parts.Add("Alt");
        if (mods.HasFlag(ModifierKeys.Shift))
            parts.Add("Shift");
        if (mods.HasFlag(ModifierKeys.Windows))
            parts.Add("Win");
        parts.Add(KeyToToken(key));
        return string.Join("+", parts);
    }

    public static bool TryParse(string? combo, out uint mods, out uint vk)
    {
        mods = 0;
        vk = 0;
        if (string.IsNullOrWhiteSpace(combo))
            return false;
        var tokens = combo.Split('+', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
        if (tokens.Length < 2) // at least one modifier + one key (a bare key would steal typing)
            return false;
        uint m = 0;
        for (int i = 0; i < tokens.Length - 1; i++)
        {
            switch (tokens[i].ToLowerInvariant())
            {
                case "ctrl":
                case "control": m |= MOD_CONTROL; break;
                case "shift": m |= MOD_SHIFT; break;
                case "alt": m |= MOD_ALT; break;
                case "win":
                case "windows": m |= MOD_WIN; break;
                default: return false;
            }
        }
        if (m == 0 || !TokenToKey(tokens[^1], out var key))
            return false;
        int v = KeyInterop.VirtualKeyFromKey(key);
        if (v <= 0)
            return false;
        mods = m;
        vk = (uint)v;
        return true;
    }

    // Unknown/corrupt combo → fallback (load path never throws).
    public static string Normalize(string? combo, string fallback) =>
        TryParse(combo, out _, out _) ? Canonical(combo!) : fallback;

    public static bool Register(IntPtr hwnd, int id, string combo)
    {
        if (!TryParse(combo, out var mods, out var vk) || mods == 0)
            return false;
        try
        {
            return NativeMethods.RegisterHotKey(hwnd, id, mods, vk);
        }
        catch
        {
            return false;
        }
    }

    public static void Unregister(IntPtr hwnd, int id)
    {
        try
        {
            NativeMethods.UnregisterHotKey(hwnd, id);
        }
        catch
        {
            // Prototype: best-effort cleanup.
        }
    }

    private static string Canonical(string combo)
    {
        // Re-split an already-validated combo into canonical modifier order.
        TryParse(combo, out _, out _);
        var tokens = combo.Split('+', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
        if (TokenToKey(tokens[^1], out var key))
        {
            uint m = 0;
            foreach (var t in tokens[..^1])
            {
                switch (t.ToLowerInvariant())
                {
                    case "ctrl":
                    case "control": m |= MOD_CONTROL; break;
                    case "shift": m |= MOD_SHIFT; break;
                    case "alt": m |= MOD_ALT; break;
                    case "win":
                    case "windows": m |= MOD_WIN; break;
                }
            }
            return Build((ModifierKeys)0
                | ((m & MOD_CONTROL) != 0 ? ModifierKeys.Control : ModifierKeys.None)
                | ((m & MOD_ALT) != 0 ? ModifierKeys.Alt : ModifierKeys.None)
                | ((m & MOD_SHIFT) != 0 ? ModifierKeys.Shift : ModifierKeys.None)
                | ((m & MOD_WIN) != 0 ? ModifierKeys.Windows : ModifierKeys.None), key);
        }
        return combo;
    }

    private static string KeyToToken(Key key) => key switch
    {
        Key.Return => "Enter",
        Key.Escape => "Esc",
        >= Key.D0 and <= Key.D9 => ((char)('0' + (key - Key.D0))).ToString(),
        >= Key.NumPad0 and <= Key.NumPad9 => "Num" + (key - Key.NumPad0),
        _ => key.ToString(),
    };

    private static bool TokenToKey(string token, out Key key)
    {
        key = Key.None;
        if (string.IsNullOrWhiteSpace(token))
            return false;
        var t = token.Trim();
        if (t.Equals("Space", StringComparison.OrdinalIgnoreCase))
        {
            key = Key.Space;
            return true;
        }
        if (t.Equals("Enter", StringComparison.OrdinalIgnoreCase) || t.Equals("Return", StringComparison.OrdinalIgnoreCase))
        {
            key = Key.Return;
            return true;
        }
        if (t.Equals("Esc", StringComparison.OrdinalIgnoreCase) || t.Equals("Escape", StringComparison.OrdinalIgnoreCase))
        {
            key = Key.Escape;
            return true;
        }
        if (t.Length == 1)
        {
            char c = char.ToUpperInvariant(t[0]);
            if (c is >= 'A' and <= 'Z' && Enum.TryParse<Key>(c.ToString(), ignoreCase: true, out var letter))
            {
                key = letter;
                return true;
            }
            if (c is >= '0' and <= '9')
            {
                key = Key.D0 + (c - '0');
                return true;
            }
            return false;
        }
        if (t.StartsWith("Num", StringComparison.OrdinalIgnoreCase)
            && t.Length == 4 && char.IsDigit(t[3])
            && Enum.TryParse($"NumPad{t[3]}", out Key numpad))
        {
            key = numpad;
            return true;
        }
        return Enum.TryParse(t, ignoreCase: true, out key)
            && key is not Key.None and not Key.System;
    }
}

// Non-secret prefs co-located with the keys in pill.settings.json.
// Load never throws (corrupt file → defaults); Save merges into the existing
// JSON so GoogleKey/GroqKey shape and any unknown props survive.
public sealed class ExtraSettings
{
    public string RecordHotkey { get; set; } = HotkeyConfig.DefaultRecord;
    public string ShowHideHotkey { get; set; } = HotkeyConfig.DefaultShowHide;
    public string CancelHotkey { get; set; } = HotkeyConfig.DefaultCancel;
    public bool AutoCopy { get; set; } = false;
    public bool ShowEngineLabel { get; set; } = true;
}

public static class SettingsExtras
{
    public static ExtraSettings Load()
    {
        var extras = new ExtraSettings();
        try
        {
            var path = SettingsStore.SettingsPath;
            if (!File.Exists(path))
                return extras;
            var root = JsonNode.Parse(File.ReadAllText(path))?.AsObject();
            if (root is null)
                return extras;
            extras.RecordHotkey = HotkeyConfig.Normalize(
                root["RecordHotkey"]?.GetValue<string>(), HotkeyConfig.DefaultRecord);
            extras.ShowHideHotkey = HotkeyConfig.Normalize(
                root["ShowHideHotkey"]?.GetValue<string>(), HotkeyConfig.DefaultShowHide);
            extras.CancelHotkey = HotkeyConfig.Normalize(
                root["CancelHotkey"]?.GetValue<string>(), HotkeyConfig.DefaultCancel);
            extras.AutoCopy = root["AutoCopy"]?.GetValue<bool>() ?? false;
            extras.ShowEngineLabel = root["ShowEngineLabel"]?.GetValue<bool>() ?? true;
        }
        catch
        {
            // Prototype: corrupt settings → defaults (same policy as SettingsStore).
        }
        return extras;
    }

    public static void Save(PillSettings keys, ExtraSettings extras)
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
        // Never log key material — presence only (same rule as SettingsStore).
        root["GoogleKey"] = keys.GoogleKey ?? string.Empty;
        root["GroqKey"] = keys.GroqKey ?? string.Empty;
        root["RecordHotkey"] = extras.RecordHotkey;
        root["ShowHideHotkey"] = extras.ShowHideHotkey;
        root["CancelHotkey"] = extras.CancelHotkey;
        root["AutoCopy"] = extras.AutoCopy;
        root["ShowEngineLabel"] = extras.ShowEngineLabel;
        var dir = Path.GetDirectoryName(SettingsStore.SettingsPath);
        if (!string.IsNullOrEmpty(dir))
            Directory.CreateDirectory(dir);
        File.WriteAllText(SettingsStore.SettingsPath,
            root.ToJsonString(new JsonSerializerOptions { WriteIndented = true }));
    }
}
