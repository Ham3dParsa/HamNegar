using System.IO;
using System.Runtime.InteropServices;
using System.Text.Json;

namespace HamNegar.Native;

// Prototype-only settings store: PLAIN JSON at %AppData%/HamNegar/pill.settings.json.
// Production must move secrets to Windows Credential Manager (see TODO.txt).
// Never log key material — only presence (set/missing).
public sealed class PillSettings
{
    public string GoogleKey { get; set; } = string.Empty;
    public string GroqKey { get; set; } = string.Empty;
}

public static class SettingsStore
{
    public static string SettingsPath =>
        Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "HamNegar", "pill.settings.json");

    public static PillSettings Load()
    {
        try
        {
            if (File.Exists(SettingsPath))
            {
                var json = File.ReadAllText(SettingsPath);
                var s = JsonSerializer.Deserialize<PillSettings>(json);
                if (s is not null)
                    return s;
            }
        }
        catch
        {
            // Prototype: ignore corrupt settings, start empty.
        }
        return new PillSettings();
    }

    public static void Save(PillSettings settings)
    {
        var dir = Path.GetDirectoryName(SettingsPath);
        if (!string.IsNullOrEmpty(dir))
            Directory.CreateDirectory(dir);
        var json = JsonSerializer.Serialize(settings, new JsonSerializerOptions { WriteIndented = true });
        File.WriteAllText(SettingsPath, json);
        // NOTE: prototype writes keys as PLAIN JSON. See TODO.txt.
    }

    // Safe one-liner for status/logs: never includes key material.
    public static string KeyPresence(PillSettings s) =>
        $"google={(string.IsNullOrWhiteSpace(s.GoogleKey) ? "missing" : "set")}, " +
        $"groq={(string.IsNullOrWhiteSpace(s.GroqKey) ? "missing" : "set")}";
}
