// Display-only mirror of the locked STT engine order in SttChain.cs:
//   google/gemini-flash-lite-latest → google/gemini-3.5-flash-lite →
//   google/gemini-3.1-flash-lite → groq/whisper-large-v3
// The settings window renders this list read-only. If SttChain's order ever
// changes, update this list to match (texts only — no behavior lives here).

namespace HamNegar.Native;

public sealed record ChainEngine(string Step, string Id, string Note);

public static class ChainSpec
{
    public static IReadOnlyList<ChainEngine> Engines { get; } =
    [
        new("1", "google/gemini-flash-lite-latest", "Tried first · fastest"),
        new("2", "google/gemini-3.5-flash-lite", "Fallback model"),
        new("3", "google/gemini-3.1-flash-lite", "Last Google fallback"),
        new("4", "groq/whisper-large-v3", "Final fallback · Groq"),
    ];
}
