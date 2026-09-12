// Shallow compat wrapper: all chain decisions live in ChainEngine
// (desktop/src/ChainEngine.cs). This file forwards only, so deleting
// ChainEngine breaks every chain path. Public surface below is frozen:
// MainWindow and all callers compile and behave exactly as before.
namespace HamNegar.Native;

public sealed class SttResult
{
    public required string Text { get; init; }
    public required string Engine { get; init; }
}

public static class SttChain
{
    public static async Task<SttResult> TranscribeAsync(string wavPath, string googleKey, string groqKey, CancellationToken ct = default, IProgress<(string engine, bool ok)>? progress = null)
    {
        try
        {
            var r = await Chain.ChainEngine.TranscribeAsync(wavPath, googleKey, groqKey, ct, progress).ConfigureAwait(false);
            return new SttResult { Text = r.Text, Engine = r.Engine };
        }
        catch (Chain.ChainEngine.ChainException e)
        {
            throw new HttpChainException(e.Message, e.Status);
        }
    }

    public sealed class HttpChainException(string message, int status) : Exception(message)
    {
        public int Status { get; } = status;
    }
}
