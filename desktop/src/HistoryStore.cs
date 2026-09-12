using System.IO;
using System.Text.Json;

namespace HamNegar.Native;

// Prototype-only local transcript history: PLAIN JSON at
// %AppData%/HamNegar/pill.history.json (same policy as pill.settings.json).
// Every successful transcription is appended here; the Windows clipboard is
// NOT touched (AutoCopy defaults to false — see SettingsExtras).
// Load never throws (missing/corrupt file → empty list). All writes are
// best-effort so history can never break transcription.
// Never logs text content — lengths only.
public sealed class HistoryEntry
{
    public string Id { get; set; } = Guid.NewGuid().ToString("N");
    public string Text { get; set; } = string.Empty;
    public string Engine { get; set; } = string.Empty;
    public DateTimeOffset Time { get; set; } = DateTimeOffset.Now;
}

public static class HistoryStore
{
    public const int MaxEntries = 100;

    public static string HistoryPath =>
        Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "HamNegar", "pill.history.json");

    private static readonly object Gate = new();

    public static void Add(string text, string engine)
    {
        try
        {
            if (string.IsNullOrWhiteSpace(text))
                return;
            lock (Gate)
            {
                var entries = LoadCore();
                entries.Add(new HistoryEntry
                {
                    Text = text,
                    Engine = engine ?? string.Empty,
                    Time = DateTimeOffset.Now,
                });
                while (entries.Count > MaxEntries)
                    entries.RemoveAt(0); // drop oldest, keep newest 100
                SaveCore(entries);
            }
        }
        catch
        {
            // Prototype: history is best-effort, never breaks transcription.
        }
    }

    // Newest first (latest transcription on top of the history window).
    public static IReadOnlyList<HistoryEntry> List()
    {
        try
        {
            lock (Gate)
            {
                var entries = LoadCore();
                entries.Reverse();
                return entries;
            }
        }
        catch
        {
            return Array.Empty<HistoryEntry>();
        }
    }

    public static bool Delete(string? id)
    {
        try
        {
            if (string.IsNullOrEmpty(id))
                return false;
            lock (Gate)
            {
                var entries = LoadCore();
                int removed = entries.RemoveAll(e => e.Id == id);
                if (removed == 0)
                    return false;
                SaveCore(entries);
                return true;
            }
        }
        catch
        {
            return false;
        }
    }

    public static void Clear()
    {
        try
        {
            lock (Gate)
            {
                SaveCore(new List<HistoryEntry>());
            }
        }
        catch
        {
            // Prototype: best-effort only.
        }
    }

    // Caller holds Gate. Never throws.
    private static List<HistoryEntry> LoadCore()
    {
        try
        {
            if (File.Exists(HistoryPath))
            {
                var json = File.ReadAllText(HistoryPath);
                var list = JsonSerializer.Deserialize<List<HistoryEntry>>(json);
                if (list is not null)
                {
                    list.RemoveAll(e => e is null || string.IsNullOrWhiteSpace(e.Text));
                    foreach (var e in list)
                    {
                        if (string.IsNullOrEmpty(e.Id))
                            e.Id = Guid.NewGuid().ToString("N");
                        e.Engine ??= string.Empty;
                        e.Text ??= string.Empty;
                    }
                    return list;
                }
            }
        }
        catch
        {
            // Prototype: corrupt history → start empty (same policy as SettingsStore).
        }
        return new List<HistoryEntry>();
    }

    // Caller holds Gate. Never throws.
    private static void SaveCore(List<HistoryEntry> entries)
    {
        try
        {
            var dir = Path.GetDirectoryName(HistoryPath);
            if (!string.IsNullOrEmpty(dir))
                Directory.CreateDirectory(dir);
            File.WriteAllText(HistoryPath,
                JsonSerializer.Serialize(entries, new JsonSerializerOptions { WriteIndented = true }));
        }
        catch
        {
            // Prototype: best-effort only.
        }
    }
}
