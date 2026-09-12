// Display-only mirror of the locked STT engine order in SttChain.cs:
//   google/gemini-flash-lite-latest → google/gemini-3.5-flash-lite →
//   google/gemini-3.1-flash-lite → groq/whisper-large-v3
// The settings window renders this list read-only. If SttChain's order ever
// changes, update this list to match (texts only — no behavior lives here).

namespace HamNegar.Native;

public sealed record ChainEngine(string Step, string Id, string Note);

public static class ChainSpec
{
    // NOTE: notes live in Lang (K.ChainNote1..4) — the literals below are
    // gone; Engines is the localized projection (steps/ids are identifiers).
    public static IReadOnlyList<ChainEngine> Engines => Localized();

    // Language-facing projection: same steps/ids (identifiers, never
    // translated), notes re-read from Lang so a live FA↔EN switch re-renders.
    // SettingsWindow.ApplyLang() re-sets ItemsSource to this on every change.
    public static IReadOnlyList<ChainEngine> Localized() =>
    [
        new("1", "google/gemini-flash-lite-latest", Lang.Get(Lang.K.ChainNote1)),
        new("2", "google/gemini-3.5-flash-lite", Lang.Get(Lang.K.ChainNote2)),
        new("3", "google/gemini-3.1-flash-lite", Lang.Get(Lang.K.ChainNote3)),
        new("4", "groq/whisper-large-v3", Lang.Get(Lang.K.ChainNote4)),
    ];
}
