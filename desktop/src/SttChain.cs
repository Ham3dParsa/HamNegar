using System;
using System.IO;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;

namespace HamNegar.Native;

// Locked STT chain (owner order, google FIRST, groq LAST):
//   google/gemini-flash-lite-latest → google/gemini-3.5-flash-lite →
//   google/gemini-3.1-flash-lite → groq/whisper-large-v3
// Semantics mirror the web app (js/modules/transcription.js):
//   Google: POST .../models/{model}:generateContent, header x-goog-api-key,
//           inlineData base64 audio.
//   Groq:   POST https://api.groq.com/openai/v1/audio/transcriptions multipart
//           (file, model, language=fa), Bearer.
//   401/403 → next engine; 404 → next model; 429 → 600ms wait then next;
//   empty/short audio → throw BEFORE any fetch. Never logs keys.
public sealed class SttResult
{
    public required string Text { get; init; }
    public required string Engine { get; init; }
}

public static class SttChain
{
    private static readonly string[] GoogleModels =
    [
        "gemini-flash-lite-latest",
        "gemini-3.5-flash-lite",
        "gemini-3.1-flash-lite",
    ];

    private const string GroqModel = "whisper-large-v3";
    private const long MinAudioBytes = 2000; // wav incl. 44-byte header; ~60ms @16kHz/16bit/mono. Web uses 800 for webm.
    private static readonly HttpClient Http = new() { Timeout = TimeSpan.FromSeconds(40) };

    public static async Task<SttResult> TranscribeAsync(string wavPath, string googleKey, string groqKey, CancellationToken ct = default, IProgress<(string engine, bool ok)>? progress = null)
    {
        var info = new FileInfo(wavPath);
        if (!info.Exists || info.Length < MinAudioBytes)
            throw new InvalidOperationException("Audio too short — nothing sent (no fetch attempted).");

        Exception? last = null;

        foreach (var model in GoogleModels)
        {
            string engine = $"google/{model}";
            if (string.IsNullOrWhiteSpace(googleKey))
            {
                last = new InvalidOperationException($"{engine}: no key — skipped");
                try { progress?.Report((engine, false)); } catch { }
                continue; // treat like 401 → next engine
            }
            try
            {
                var text = await QueryGeminiAsync(wavPath, model, googleKey, ct).ConfigureAwait(false);
                if (!string.IsNullOrWhiteSpace(text))
                {
                    try { progress?.Report((engine, true)); } catch { }
                    return new SttResult { Text = text.Trim(), Engine = engine };
                }
                last = new InvalidOperationException($"{engine}: empty transcript");
                try { progress?.Report((engine, false)); } catch { }
            }
            catch (HttpChainException e) when (e.Status == 429)
            {
                last = e;
                try { progress?.Report((engine, false)); } catch { }
                await Task.Delay(600, ct).ConfigureAwait(false);
            }
            catch (HttpChainException e) when (e.Status is 401 or 403 or 404)
            {
                last = e; // 401/403 → next engine, 404 → next model (same thing here)
                try { progress?.Report((engine, false)); } catch { }
            }
            catch (Exception e)
            {
                last = e;
                try { progress?.Report((engine, false)); } catch { }
            }
        }

        if (!string.IsNullOrWhiteSpace(groqKey))
        {
            string engine = $"groq/{GroqModel}";
            try
            {
                var text = await QueryGroqAsync(wavPath, groqKey, ct).ConfigureAwait(false);
                if (!string.IsNullOrWhiteSpace(text))
                {
                    try { progress?.Report((engine, true)); } catch { }
                    return new SttResult { Text = text.Trim(), Engine = engine };
                }
                last = new InvalidOperationException($"{engine}: empty transcript");
                try { progress?.Report((engine, false)); } catch { }
            }
            catch (HttpChainException e) when (e.Status == 429)
            {
                last = e;
                try { progress?.Report((engine, false)); } catch { }
                await Task.Delay(600, ct).ConfigureAwait(false);
            }
            catch (Exception e)
            {
                last = e;
                try { progress?.Report((engine, false)); } catch { }
            }
        }
        else
        {
            last ??= new InvalidOperationException($"groq/{GroqModel}: no key — skipped");
            try { progress?.Report(($"groq/{GroqModel}", false)); } catch { }
        }

        throw last ?? new InvalidOperationException("Transcription failed on all engines.");
    }

    private static async Task<string> QueryGeminiAsync(string wavPath, string model, string key, CancellationToken ct)
    {
        byte[] audio = await File.ReadAllBytesAsync(wavPath, ct).ConfigureAwait(false);
        string b64 = Convert.ToBase64String(audio);
        var url = $"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent";
        using var req = new HttpRequestMessage(HttpMethod.Post, url);
        req.Headers.TryAddWithoutValidation("x-goog-api-key", key);
        req.Content = JsonContent.Create(new
        {
            contents = new[]
            {
                new { parts = new object[]
                {
                    new { text = "Transcribe verbatim in original language(s). Only transcription, no summary." },
                    new { inlineData = new { mimeType = "audio/wav", data = b64 } },
                } },
            },
            generationConfig = new { temperature = 0.1 },
        });
        using var res = await Http.SendAsync(req, ct).ConfigureAwait(false);
        if (!res.IsSuccessStatusCode)
            throw await ChainErrorAsync(res, $"google/{model}").ConfigureAwait(false);
        var json = await res.Content.ReadAsStringAsync(ct).ConfigureAwait(false);
        try
        {
            var node = JsonNode.Parse(json);
            var parts = node?["candidates"]?[0]?["content"]?["parts"]?.AsArray();
            if (parts is null)
                return string.Empty;
            var sb = new StringBuilder();
            foreach (var p in parts)
                sb.Append(p?["text"]?.GetValue<string>() ?? string.Empty);
            return sb.ToString().Trim();
        }
        catch (JsonException)
        {
            return string.Empty;
        }
    }

    private static async Task<string> QueryGroqAsync(string wavPath, string key, CancellationToken ct)
    {
        using var form = new MultipartFormDataContent();
        byte[] audio = await File.ReadAllBytesAsync(wavPath, ct).ConfigureAwait(false);
        var file = new ByteArrayContent(audio);
        file.Headers.ContentType = new MediaTypeHeaderValue("audio/wav");
        form.Add(file, "file", "speech.wav");
        form.Add(new StringContent(GroqModel), "model");
        form.Add(new StringContent("fa"), "language");
        using var req = new HttpRequestMessage(HttpMethod.Post, "https://api.groq.com/openai/v1/audio/transcriptions");
        req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", key);
        req.Content = form;
        using var res = await Http.SendAsync(req, ct).ConfigureAwait(false);
        if (!res.IsSuccessStatusCode)
            throw await ChainErrorAsync(res, $"groq/{GroqModel}").ConfigureAwait(false);
        var json = await res.Content.ReadAsStringAsync(ct).ConfigureAwait(false);
        try
        {
            var node = JsonNode.Parse(json);
            return (node?["text"]?.GetValue<string>() ?? string.Empty).Trim();
        }
        catch (JsonException)
        {
            return string.Empty;
        }
    }

    private static async Task<HttpChainException> ChainErrorAsync(HttpResponseMessage res, string engine)
    {
        string body;
        try { body = (await res.Content.ReadAsStringAsync().ConfigureAwait(false)).Trim(); }
        catch { body = res.ReasonPhrase ?? string.Empty; }
        if (body.Length > 600)
            body = body[..600];
        // Never include key material: body comes from the server; key is never echoed into it by us.
        return new HttpChainException($"{engine}: HTTP {(int)res.StatusCode} {body}", (int)res.StatusCode);
    }

    public sealed class HttpChainException(string message, int status) : Exception(message)
    {
        public int Status { get; } = status;
    }
}
