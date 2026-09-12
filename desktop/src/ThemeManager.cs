// Theme preference + live switching. Owned by the Settings/History track.
// Key: `theme` ("dark"|"light", default "dark") inside the SAME prototype store
// (%AppData%/HamNegar/pill.settings.json) as the keys/hotkeys. Additive merge,
// never throws: corrupt/missing file or value → "dark". Never logs key material.
using System.IO;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Windows;

namespace HamNegar.Native;

public static class ThemeManager
{
    public const string Dark = "dark";
    public const string Light = "light";

    private const string ThemeKey = "theme";

    // Additive, never-throw load: unknown/missing/corrupt → Dark.
    public static string LoadTheme()
    {
        try
        {
            var path = SettingsStore.SettingsPath;
            if (!File.Exists(path))
                return Dark;
            var root = JsonNode.Parse(File.ReadAllText(path))?.AsObject();
            var raw = root?[ThemeKey]?.GetValue<string>();
            return Normalize(raw);
        }
        catch
        {
            return Dark;
        }
    }

    public static string Normalize(string? raw) =>
        string.Equals(raw?.Trim(), Light, StringComparison.OrdinalIgnoreCase) ? Light : Dark;

    public static bool IsDark(string? theme) => !string.Equals(theme?.Trim(), Light, StringComparison.OrdinalIgnoreCase);

    // Additive merge save: preserves keys, hotkeys, options, and unknown props.
    public static void SaveTheme(string theme)
    {
        try
        {
            var normalized = Normalize(theme);
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
            root[ThemeKey] = normalized;
            var dir = Path.GetDirectoryName(SettingsStore.SettingsPath);
            if (!string.IsNullOrEmpty(dir))
                Directory.CreateDirectory(dir);
            File.WriteAllText(SettingsStore.SettingsPath,
                root.ToJsonString(new JsonSerializerOptions { WriteIndented = true }));
        }
        catch
        {
            // Prototype: theme persistence is best-effort only.
        }
    }

    // Swaps the merged theme dictionary. Safe to call at startup (before any
    // window exists) and live from Settings: elements using DynamicResource
    // re-resolve; StaticResource references keep the startup value.
    public static void ApplyTheme(string theme)
    {
        try
        {
            var app = Application.Current;
            if (app is null)
                return;
            var normalized = Normalize(theme);
            if (app.Dispatcher.CheckAccess())
                Swap(app, normalized);
            else
                app.Dispatcher.Invoke(() => Swap(app, normalized));
        }
        catch
        {
            // Prototype: theme apply is best-effort only.
        }
    }

    private static void Swap(Application app, string theme)
    {
        var merged = app.Resources.MergedDictionaries;
        ResourceDictionary? current = null;
        foreach (var d in merged)
        {
            var src = d.Source?.OriginalString ?? string.Empty;
            if (src.Contains("Theme", StringComparison.OrdinalIgnoreCase))
            {
                current = d;
                break;
            }
        }
        var want = theme == Light ? "LightTheme.xaml" : "DarkTheme.xaml";
        if (current?.Source?.OriginalString?.Contains(want, StringComparison.OrdinalIgnoreCase) == true)
            return; // already active
        if (current is not null)
            merged.Remove(current);
        merged.Add(new ResourceDictionary
        {
            Source = new Uri($"Themes/{want}", UriKind.Relative),
        });
    }
}
