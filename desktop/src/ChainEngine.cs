// Deep module: ALL chain decisions live here and ONLY here.
//
//   - STT chain (owner order, google FIRST, groq LAST):
//       google/gemini-flash-lite-latest → google/gemini-3.5-flash-lite →
//       google/gemini-3.1-flash-lite → groq/whisper-large-v3
//     Semantics mirror the web app (js/modules/transcription.js):
//       Google: POST .../models/{model}:generateContent, header x-goog-api-key,
//               inlineData base64 audio.
//       Groq:   POST https://api.groq.com/openai/v1/audio/transcriptions multipart
//               (file, model, language=fa), Bearer.
//       401/403 → next engine; 404 → next model; 429 → 600ms wait then next;
//       empty/short audio → throw BEFORE any fetch. Never logs keys.
//   - Polish chain (web-identical prompts): Groq OpenAI-chat first, then Google,
//     then stored custom providers (OpenAI-compatible base+key+model).
//   - Custom providers CRUD persisted in pill.settings.json ("customProviders").
//   - Pair display provider/model (web pairLabel).
//   - Attempts reporting via IProgress<(engine, ok)>.
//
// SttChain.cs is a shallow compat wrapper that forwards here: deleting THIS
// file breaks all chain behavior (deletion test). No other file may contain
// chain order, status-code fallback, or provider dispatch — grep for the
// status handling and chain order must land in this file only.

using System.IO;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;

namespace HamNegar.Native.Chain;

public sealed class ChainResult
{
    public required string Text { get; init; }
    public required string Engine { get; init; }
}

public sealed class CustomProvider
{
    public string Id { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string BaseUrl { get; set; } = string.Empty;
    public string Key { get; set; } = string.Empty;
    public string Model { get; set; } = string.Empty;
}

public static class ChainEngine
{
    // ---- locked STT order (single home; SttChain/ChainSpec must not duplicate) ----
    private static readonly string[] GoogleModels =
    [
        "gemini-flash-lite-latest",
        "gemini-3.5-flash-lite",
        "gemini-3.1-flash-lite",
    ];

    private const string GroqModel = "whisper-large-v3";
    private const string GroqTranscriptionsUrl = "https://api.groq.com/openai/v1/audio/transcriptions";
    private const string GroqChatBaseDefault = "https://api.groq.com/openai/v1";
    private const string OpenRouterChatBaseDefault = "https://openrouter.ai/api/v1";

    // Default polish entry mirrors web textChain default (single qwen entry).
    private const string DefaultPolishProvider = "groq";
    private const string DefaultPolishModel = "qwen/qwen3.6-27b";

    private const long MinAudioBytes = 2000; // wav incl. 44-byte header; ~60ms @16kHz/16bit/mono. Web uses 800 for webm.
    private static readonly HttpClient Http = new() { Timeout = TimeSpan.FromSeconds(40) };

    // ---- web-identical prompts (js/modules/transcription.js) ----
    private const string SttPrompt = "Transcribe verbatim in original language(s). Only transcription, no summary.";
    private const string PolishSystem =
        "You are a spelling/grammar proofreader. Fix only spelling, orthography and grammar errors in the SAME language as the input text; never change the language, meaning or tone. If no correction is needed, return the input text verbatim. Return ONLY the corrected text \u2014 never commentary, explanation or apology. (If the text is Persian and means UI, \u00AB\u0631\u0627\u0628\u0637\u0647 \u06A9\u0627\u0631\u0628\u0631\u06CC\u00BB should become \u00AB\u0631\u0627\u0628\u0637 \u06A9\u0627\u0631\u0628\u0631\u06CC\u00BB.)";
    private const string GeminiPolishSystem =
        "You are a spelling/grammar proofreader. Fix only spelling, orthography and grammar errors in the SAME language as the input text; do not change the language, meaning or tone, do not explain, return ONLY the corrected text. If no correction is needed, return the input verbatim; never comment or apologize. (If the text is Persian and means UI, \u00AB\u0631\u0627\u0628\u0637\u0647 \u06A9\u0627\u0631\u0628\u0631\u06CC\u00BB should become \u00AB\u0631\u0627\u0628\u0637 \u06A9\u0627\u0631\u0628\u0631\u06CC\u00BB.)";

    private const int PolishMinOutputTokens = 2000;
    private const int PolishMaxOutputTokens = 8192;

    private static readonly Dictionary<string, string> TranslateNames = new(StringComparer.OrdinalIgnoreCase)
    {
        ["fa"] = "Persian (\u0641\u0627\u0631\u0633\u06CC)",
        ["en"] = "English",
        ["de"] = "German",
        ["fr"] = "French",
        ["es"] = "Spanish",
        ["it"] = "Italian",
        ["tr"] = "Turkish",
        ["ar"] = "Arabic",
        ["ru"] = "Russian",
        ["zh"] = "Chinese",
    };

    // Display chain (identifiers only; notes live in Lang via ChainSpec).
    public static IReadOnlyList<(string Step, string Id)> DefaultChain { get; } =
    [
        ("1", "google/gemini-flash-lite-latest"),
        ("2", "google/gemini-3.5-flash-lite"),
        ("3", "google/gemini-3.1-flash-lite"),
        ("4", "groq/whisper-large-v3"),
    ];

    // ---- pair display (web pairLabel; display only) ----
    public static string PairLabel(string? providerId, string? model)
    {
        var pid = CanonicalProviderId(providerId);
        if (pid is "groq" or "google" or "openrouter")
            pid = pid.ToLowerInvariant();
        var mid = (model ?? string.Empty).Trim();
        if (!string.IsNullOrEmpty(pid) && !string.IsNullOrEmpty(mid))
            return $"{pid}/{mid}";
        return pid switch { { Length: > 0 } => pid, _ => mid };
    }

    public static string CanonicalProviderId(string? pid)
    {
        if (string.IsNullOrWhiteSpace(pid))
            return string.Empty;
        var t = pid.Trim();
        if (t.Equals("gemini", StringComparison.OrdinalIgnoreCase))
            return "google";
        return t;
    }

    // ---- STT chain (behavior identical to legacy SttChain) ----
    public static async Task<ChainResult> TranscribeAsync(
        string wavPath,
        string googleKey,
        string groqKey,
        CancellationToken ct = default,
        IProgress<(string engine, bool ok)>? progress = null)
    {
        var info = new FileInfo(wavPath);
        if (!info.Exists || info.Length < MinAudioBytes)
            throw new InvalidOperationException("Audio too short \u2014 nothing sent (no fetch attempted).");

        Exception? last = null;

        foreach (var model in GoogleModels)
        {
            string engine = $"google/{model}";
            if (string.IsNullOrWhiteSpace(googleKey))
            {
                last = new InvalidOperationException($"{engine}: no key \u2014 skipped");
                Report(progress, engine, false);
                continue; // treat like 401 → next engine
            }
            try
            {
                var text = await QueryGeminiAsync(wavPath, model, googleKey, ct).ConfigureAwait(false);
                if (!string.IsNullOrWhiteSpace(text))
                {
                    Report(progress, engine, true);
                    return new ChainResult { Text = text.Trim(), Engine = engine };
                }
                last = new InvalidOperationException($"{engine}: empty transcript");
                Report(progress, engine, false);
            }
            catch (ChainException e) when (e.Status == 429)
            {
                last = e;
                Report(progress, engine, false);
                await Task.Delay(600, ct).ConfigureAwait(false);
            }
            catch (ChainException e) when (e.Status is 401 or 403 or 404)
            {
                last = e; // 401/403 → next engine, 404 → next model (same thing here)
                Report(progress, engine, false);
            }
            catch (Exception e)
            {
                last = e;
                Report(progress, engine, false);
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
                    Report(progress, engine, true);
                    return new ChainResult { Text = text.Trim(), Engine = engine };
                }
                last = new InvalidOperationException($"{engine}: empty transcript");
                Report(progress, engine, false);
            }
            catch (ChainException e) when (e.Status == 429)
            {
                last = e;
                Report(progress, engine, false);
                await Task.Delay(600, ct).ConfigureAwait(false);
            }
            catch (Exception e)
            {
                last = e;
                Report(progress, engine, false);
            }
        }
        else
        {
            last ??= new InvalidOperationException($"groq/{GroqModel}: no key \u2014 skipped");
            Report(progress, $"groq/{GroqModel}", false);
        }

        throw last ?? new InvalidOperationException("Transcription failed on all engines.");
    }

    // ---- polish chain (Groq chat first, then Google, then customs) ----
    public static async Task<ChainResult> PolishAsync(
        string text,
        string googleKey,
        string groqKey,
        CancellationToken ct = default,
        IProgress<(string engine, bool ok)>? progress = null)
    {
        if (string.IsNullOrWhiteSpace(text))
            return new ChainResult { Text = text ?? string.Empty, Engine = PairLabel("local", "rule") };
        var ruleFixed = RulePolish(text);
        var attempts = PolishAttempts(googleKey, groqKey);
        if (attempts.Count == 0)
            return new ChainResult { Text = ruleFixed, Engine = PairLabel("local", "rule") };
        Exception? last = null;
        foreach (var a in attempts)
        {
            ct.ThrowIfCancellationRequested();
            string engine = PairLabel(a.ProviderId, a.Model);
            try
            {
                var clean = await QueryPolishTargetAsync(text, a.ProviderId, a.Model, a.Key, a.BaseUrl, "polish", null, ct).ConfigureAwait(false);
                Report(progress, engine, true);
                return new ChainResult { Text = ApplyPolishGuards(clean, text), Engine = engine };
            }
            catch (ChainException e) when (e.Status is 401 or 403)
            {
                last = e;
                Report(progress, engine, false);
            }
            catch (ChainException e) when (e.Status == 429)
            {
                last = e;
                Report(progress, engine, false);
                await Task.Delay(600, ct).ConfigureAwait(false);
            }
            catch (Exception e)
            {
                last = e;
                Report(progress, engine, false);
            }
        }
        // All models failed → local rule fallback (web polishText behavior).
        _ = last;
        return new ChainResult { Text = ruleFixed, Engine = PairLabel("local", "rule") };
    }

    public static async Task<ChainResult> TranslateAsync(
        string text,
        string lang,
        string googleKey,
        string groqKey,
        CancellationToken ct = default,
        IProgress<(string engine, bool ok)>? progress = null)
    {
        if (string.IsNullOrWhiteSpace(text))
            throw new InvalidOperationException("Nothing to translate.");
        var system = TranslateSystem(lang);
        var attempts = PolishAttempts(googleKey, groqKey);
        if (attempts.Count == 0)
            throw new InvalidOperationException($"No key for translate ({PairLabel("groq", DefaultPolishModel)}).");
        Exception? last = null;
        foreach (var a in attempts)
        {
            ct.ThrowIfCancellationRequested();
            string engine = PairLabel(a.ProviderId, a.Model);
            try
            {
                var clean = await QueryPolishTargetAsync(text, a.ProviderId, a.Model, a.Key, a.BaseUrl, "translate", system, ct).ConfigureAwait(false);
                if (string.IsNullOrWhiteSpace(clean))
                    throw new ChainException("Empty translate output.", 500);
                Report(progress, engine, true);
                return new ChainResult { Text = clean.Trim(), Engine = engine };
            }
            catch (ChainException e) when (e.Status is 401 or 403)
            {
                last = e;
                Report(progress, engine, false);
            }
            catch (ChainException e) when (e.Status == 429)
            {
                last = e;
                Report(progress, engine, false);
                await Task.Delay(600, ct).ConfigureAwait(false);
            }
            catch (Exception e)
            {
                last = e;
                Report(progress, engine, false);
            }
        }
        throw last ?? new InvalidOperationException("Translate failed on all engines.");
    }

    // ---- custom providers CRUD (same pill.settings.json, additive merge) ----
    public static IReadOnlyList<CustomProvider> ListCustomProviders()
    {
        try
        {
            var root = ReadSettingsRoot();
            var arr = root?["customProviders"]?.AsArray();
            if (arr is null)
                return Array.Empty<CustomProvider>();
            var list = new List<CustomProvider>(arr.Count);
            foreach (var n in arr)
            {
                var o = n?.AsObject();
                if (o is null)
                    continue;
                list.Add(new CustomProvider
                {
                    Id = o["id"]?.GetValue<string>() ?? string.Empty,
                    Name = o["name"]?.GetValue<string>() ?? string.Empty,
                    BaseUrl = (o["baseURL"]?.GetValue<string>() ?? string.Empty).Trim().TrimEnd('/'),
                    Key = o["key"]?.GetValue<string>() ?? string.Empty,
                    Model = o["model"]?.GetValue<string>() ?? string.Empty,
                });
            }
            return list;
        }
        catch
        {
            return Array.Empty<CustomProvider>();
        }
    }

    public static void UpsertCustomProvider(CustomProvider provider)
    {
        if (provider is null)
            throw new ArgumentNullException(nameof(provider));
        var id = (provider.Id ?? string.Empty).Trim();
        if (string.IsNullOrEmpty(id))
            throw new InvalidOperationException("Provider id is required.");
        var baseUrl = (provider.BaseUrl ?? string.Empty).Trim().TrimEnd('/');
        if (string.IsNullOrEmpty(baseUrl))
            throw new InvalidOperationException("Provider base URL is empty.");
        if (!Uri.TryCreate(baseUrl, UriKind.Absolute, out var uri) || !uri.Scheme.Equals("https", StringComparison.OrdinalIgnoreCase))
            throw new InvalidOperationException("Provider base URL must be https.");
        var root = ReadSettingsRoot() ?? new JsonObject();
        var arr = root["customProviders"]?.AsArray() ?? new JsonArray();
        JsonObject? existing = null;
        foreach (var n in arr)
        {
            var o = n?.AsObject();
            if (o is not null && string.Equals(o["id"]?.GetValue<string>()?.Trim(), id, StringComparison.OrdinalIgnoreCase))
            {
                existing = o;
                break;
            }
        }
        var node = new JsonObject
        {
            ["id"] = id,
            ["name"] = provider.Name ?? string.Empty,
            ["baseURL"] = baseUrl,
            ["key"] = provider.Key ?? string.Empty,
            ["model"] = provider.Model ?? string.Empty,
        };
        if (existing is not null)
        {
            int idx = arr.IndexOf(existing);
            arr[idx] = node;
        }
        else
        {
            arr.Add(node);
        }
        root["customProviders"] = arr;
        WriteSettingsRoot(root);
    }

    public static bool RemoveCustomProvider(string id)
    {
        var want = (id ?? string.Empty).Trim();
        if (string.IsNullOrEmpty(want))
            return false;
        var root = ReadSettingsRoot();
        var arr = root?["customProviders"]?.AsArray();
        if (arr is null)
            return false;
        for (int i = 0; i < arr.Count; i++)
        {
            var o = arr[i]?.AsObject();
            if (o is not null && string.Equals(o["id"]?.GetValue<string>()?.Trim(), want, StringComparison.OrdinalIgnoreCase))
            {
                arr.RemoveAt(i);
                root!["customProviders"] = arr;
                WriteSettingsRoot(root!);
                return true;
            }
        }
        return false;
    }

    // ---- internals (single home for dispatch + prompts + guards) ----
    private sealed record PolishAttempt(string ProviderId, string Model, string Key, string BaseUrl);

    private static List<PolishAttempt> PolishAttempts(string googleKey, string groqKey)
    {
        var list = new List<PolishAttempt>(4);
        if (!string.IsNullOrWhiteSpace(groqKey))
            list.Add(new PolishAttempt("groq", DefaultPolishModel, groqKey, GroqChatBaseDefault));
        foreach (var c in ListCustomProviders())
        {
            if (string.IsNullOrWhiteSpace(c.Key) || string.IsNullOrWhiteSpace(c.BaseUrl))
                continue;
            var model = string.IsNullOrWhiteSpace(c.Model) ? DefaultPolishModel : c.Model.Trim();
            list.Add(new PolishAttempt(CanonicalProviderId(c.Id), model, c.Key, c.BaseUrl.Trim().TrimEnd('/')));
        }
        if (!string.IsNullOrWhiteSpace(googleKey))
            list.Add(new PolishAttempt("google", GoogleModels[0], googleKey, string.Empty));
        return list;
    }

    private static async Task<string> QueryPolishTargetAsync(
        string text, string providerId, string model, string key, string baseUrl, string layer, string? system, CancellationToken ct)
    {
        var pid = CanonicalProviderId(providerId);
        if (pid.Equals("google", StringComparison.OrdinalIgnoreCase))
            return await QueryPolishViaGeminiAsync(text, model, key, layer, system, ct).ConfigureAwait(false);
        var baseNorm = string.IsNullOrWhiteSpace(baseUrl)
            ? (pid.Equals("openrouter", StringComparison.OrdinalIgnoreCase) ? OpenRouterChatBaseDefault : GroqChatBaseDefault)
            : baseUrl.Trim().TrimEnd('/');
        return await QueryChatAsync(pid, text, model, key, baseNorm, layer, system, ct).ConfigureAwait(false);
    }

    private static async Task<string> QueryChatAsync(
        string providerId, string text, string model, string key, string baseUrl, string layer, string? system, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(model))
            throw new ChainException("Text model is missing.", 400);
        if (string.IsNullOrWhiteSpace(key))
            throw new ChainException($"No key for {PairLabel(providerId, model)}.", 401);
        if (string.IsNullOrWhiteSpace(baseUrl))
            throw new ChainException("Provider base URL is empty.", 400);
        if (!Uri.TryCreate(baseUrl, UriKind.Absolute, out var uri) || !uri.Scheme.Equals("https", StringComparison.OrdinalIgnoreCase))
            throw new ChainException("Provider base URL must be https.", 400);
        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(ct);
        timeout.CancelAfter(TimeSpan.FromSeconds(25));
        var token = timeout.Token;
        var body = new JsonObject
        {
            ["model"] = model,
            ["messages"] = new JsonArray
            {
                new JsonObject { ["role"] = "system", ["content"] = system ?? PolishSystem },
                new JsonObject { ["role"] = "user", ["content"] = text },
            },
            ["temperature"] = 0.2,
            ["max_tokens"] = PolishOutputBudget(text),
        };
        if (model.StartsWith("qwen/", StringComparison.OrdinalIgnoreCase))
        {
            body["reasoning_format"] = "hidden";
            body["reasoning_effort"] = "none";
        }
        using var req = new HttpRequestMessage(HttpMethod.Post, baseUrl.TrimEnd('/') + "/chat/completions");
        req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", key);
        if (CanonicalProviderId(providerId).Equals("openrouter", StringComparison.OrdinalIgnoreCase))
        {
            req.Headers.TryAddWithoutValidation("HTTP-Referer", "https://hamnegar.local");
            req.Headers.TryAddWithoutValidation("X-Title", "HamNegar");
        }
        req.Content = JsonContent.Create(body);
        HttpResponseMessage res;
        try
        {
            res = await Http.SendAsync(req, token).ConfigureAwait(false);
        }
        catch (OperationCanceledException) when (!ct.IsCancellationRequested)
        {
            throw new ChainException($"Timeout {PairLabel(providerId, model)} {layer}.", 408);
        }
        catch (OperationCanceledException)
        {
            throw;
        }
        catch (Exception e)
        {
            throw new ChainException($"Network {PairLabel(providerId, model)} {layer}: {Short(e)}", 0);
        }
        using (res)
        {
            if (!res.IsSuccessStatusCode)
                throw await ChainErrorAsync(res, PairLabel(providerId, model)).ConfigureAwait(false);
            var json = await res.Content.ReadAsStringAsync(token).ConfigureAwait(false);
            string raw = string.Empty;
            string? finish = null;
            try
            {
                var node = JsonNode.Parse(json);
                raw = node?["choices"]?[0]?["message"]?["content"]?.GetValue<string>() ?? string.Empty;
                finish = node?["choices"]?[0]?["finish_reason"]?.GetValue<string>();
            }
            catch (JsonException)
            {
                raw = string.Empty;
            }
            if (string.Equals(finish, "length", StringComparison.OrdinalIgnoreCase))
                throw new ChainException("Input too long \u2014 shorten it.", 413);
            if (layer.Equals("translate", StringComparison.OrdinalIgnoreCase))
            {
                var clean = CleanPolishOutput(raw);
                if (string.IsNullOrWhiteSpace(clean))
                    throw new ChainException("Empty translate output.", 500);
                return clean;
            }
            return ValidatePolishOutput(raw, text);
        }
    }

    private static async Task<string> QueryPolishViaGeminiAsync(
        string text, string model, string key, string layer, string? system, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(key))
            throw new ChainException($"No key for {PairLabel("google", model)}.", 401);
        var url = $"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent";
        var prompt = (system ?? GeminiPolishSystem) + "\nText:\n" + text;
        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(ct);
        timeout.CancelAfter(TimeSpan.FromSeconds(20));
        var token = timeout.Token;
        using var req = new HttpRequestMessage(HttpMethod.Post, url);
        req.Headers.TryAddWithoutValidation("x-goog-api-key", key);
        req.Content = JsonContent.Create(new
        {
            contents = new[] { new { parts = new object[] { new { text = prompt } } } },
            generationConfig = new { temperature = 0.2, maxOutputTokens = PolishOutputBudget(text) },
        });
        HttpResponseMessage res;
        try
        {
            res = await Http.SendAsync(req, token).ConfigureAwait(false);
        }
        catch (OperationCanceledException) when (!ct.IsCancellationRequested)
        {
            throw new ChainException($"Timeout {PairLabel("google", model)} {layer}.", 408);
        }
        catch (OperationCanceledException)
        {
            throw;
        }
        catch (Exception e)
        {
            throw new ChainException($"Network {PairLabel("google", model)} {layer}: {Short(e)}", 0);
        }
        using (res)
        {
            if (!res.IsSuccessStatusCode)
                throw await ChainErrorAsync(res, PairLabel("google", model)).ConfigureAwait(false);
            var json = await res.Content.ReadAsStringAsync(token).ConfigureAwait(false);
            string raw = string.Empty;
            string? finish = null;
            try
            {
                var node = JsonNode.Parse(json);
                var parts = node?["candidates"]?[0]?["content"]?["parts"]?.AsArray();
                if (parts is not null)
                {
                    var sb = new StringBuilder();
                    foreach (var p in parts)
                        sb.Append(p?["text"]?.GetValue<string>() ?? string.Empty);
                    raw = sb.ToString();
                }
                finish = node?["candidates"]?[0]?["finishReason"]?.GetValue<string>();
            }
            catch (JsonException)
            {
                raw = string.Empty;
            }
            if (string.Equals(finish, "MAX_TOKENS", StringComparison.OrdinalIgnoreCase))
                throw new ChainException("Input too long \u2014 shorten it.", 413);
            if (layer.Equals("translate", StringComparison.OrdinalIgnoreCase))
            {
                var clean = CleanPolishOutput(raw);
                if (string.IsNullOrWhiteSpace(clean))
                    throw new ChainException("Empty translate output.", 500);
                return clean;
            }
            return ValidatePolishOutput(raw, text);
        }
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
                    new { text = SttPrompt },
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
        using var req = new HttpRequestMessage(HttpMethod.Post, GroqTranscriptionsUrl);
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

    private static async Task<ChainException> ChainErrorAsync(HttpResponseMessage res, string engine)
    {
        string body;
        try { body = (await res.Content.ReadAsStringAsync().ConfigureAwait(false)).Trim(); }
        catch { body = res.ReasonPhrase ?? string.Empty; }
        if (body.Length > 600)
            body = body[..600];
        // Never include key material: body comes from the server; key is never echoed into it by us.
        return new ChainException($"{engine}: HTTP {(int)res.StatusCode} {body}", (int)res.StatusCode);
    }

    private static string TranslateSystem(string lang)
    {
        var key = (lang ?? string.Empty).Trim().ToLowerInvariant();
        var dest = TranslateNames.TryGetValue(key, out var name) ? name : ((lang ?? string.Empty).Trim() is { Length: > 0 } l ? (l.Length > 24 ? l[..24] : l) : "English");
        return $"You are an accurate translator. Translate the input text into {dest}. Preserve numbers, names and formatting. Return ONLY the translation \u2014 never commentary, explanation or apology.";
    }

    private static int PolishOutputBudget(string text)
    {
        var len = text?.Length ?? 0;
        var scaled = (int)Math.Ceiling(len * 1.5) + 500;
        return Math.Min(PolishMaxOutputTokens, Math.Max(PolishMinOutputTokens, scaled));
    }

    private static string CleanPolishOutput(string? raw)
    {
        if (string.IsNullOrEmpty(raw))
            return string.Empty;
        var out_ = raw;
        out_ = System.Text.RegularExpressions.Regex.Replace(out_, "<think>[\\s\\S]*?</think>", string.Empty, System.Text.RegularExpressions.RegexOptions.IgnoreCase);
        out_ = System.Text.RegularExpressions.Regex.Replace(out_, "<thinking>[\\s\\S]*?</thinking>", string.Empty, System.Text.RegularExpressions.RegexOptions.IgnoreCase);
        foreach (var pattern in new[] { "<think>[\\s\\S]*$", "<thinking>[\\s\\S]*$" })
        {
            var stripped = System.Text.RegularExpressions.Regex.Replace(out_, pattern, string.Empty, System.Text.RegularExpressions.RegexOptions.IgnoreCase);
            if (!string.IsNullOrWhiteSpace(stripped))
                out_ = stripped;
        }
        return out_.Trim();
    }

    private static string ValidatePolishOutput(string raw, string text)
    {
        var clean = CleanPolishOutput(raw);
        if (string.IsNullOrWhiteSpace(clean))
            throw new ChainException("Polish returned empty.", 500);
        if (clean.Length > text.Length * 3 + 500)
            throw new ChainException("Invalid polish (reasoning leak).", 500);
        if (System.Text.RegularExpressions.Regex.IsMatch(clean,
            "(\u0646\u06CC\u0627\u0632\u06CC \u0628\u0647 (\u0648\u06CC\u0631\u0627\u06CC\u0634|\u0627\u0635\u0644\u0627\u062D))|((\u0645\u062A\u0623\u0633\u0641\u0645)[\\s\\S]{0,30}(\u0646\u0645\u06CC\u200C\u062A\u0648\u0627\u0646\u0645))|((\u0646\u0645\u06CC\u200C\u062A\u0648\u0627\u0646\u0645)[\\s\\S]{0,30}(\u0648\u06CC\u0631\u0627\u06CC\u0634|\u0627\u0635\u0644\u0627\u062D))|(\u0639\u0630\u0631\u062E\u0648\u0627\u0647)|(\u0628\u0647 \u0639\u0646\u0648\u0627\u0646 \u06CC\u06A9 \u0647\u0648\u0634)|(as an ai language model)|(no (editing|correction) (needed|required))|((the (original|input) text) is)|(no changes (needed|made))",
            System.Text.RegularExpressions.RegexOptions.IgnoreCase))
            throw new ChainException("Invalid polish (commentary instead of text).", 500);
        return clean;
    }

    private static string ApplyPolishGuards(string clean, string text) => ValidatePolishOutput(clean, text);

    private static string RulePolish(string text)
    {
        var out_ = text;
        out_ = out_.Replace("\u0631\u0627\u0628\u0637\u0647 \u06A9\u0627\u0631\u0628\u0631\u06CC", "\u0631\u0627\u0628\u0637 \u06A9\u0627\u0631\u0628\u0631\u06CC");
        out_ = out_.Replace("\u0645\u06CC \u0634\u0648\u062F", "\u0645\u06CC\u200C\u0634\u0648\u062F")
            .Replace("\u0645\u06CC \u06A9\u0646\u062F", "\u0645\u06CC\u200C\u06A9\u0646\u062F")
            .Replace("\u0645\u06CC \u06A9\u0646\u0645", "\u0645\u06CC\u200C\u06A9\u0646\u0645");
        return out_;
    }

    private static void Report(IProgress<(string engine, bool ok)>? progress, string engine, bool ok)
    {
        try { progress?.Report((engine, ok)); } catch { }
    }

    private static string Short(Exception ex)
    {
        var m = ex.Message ?? ex.GetType().Name;
        return m.Length > 220 ? m[..220] : m;
    }

    private static string SettingsPath =>
        Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "HamNegar", "pill.settings.json");

    private static JsonObject? ReadSettingsRoot()
    {
        try
        {
            var path = SettingsPath;
            if (!File.Exists(path))
                return null;
            return JsonNode.Parse(File.ReadAllText(path))?.AsObject();
        }
        catch
        {
            return null;
        }
    }

    private static void WriteSettingsRoot(JsonObject root)
    {
        var dir = Path.GetDirectoryName(SettingsPath);
        if (!string.IsNullOrEmpty(dir))
            Directory.CreateDirectory(dir);
        File.WriteAllText(SettingsPath, root.ToJsonString(new JsonSerializerOptions { WriteIndented = true }));
    }

    public sealed class ChainException(string message, int status) : Exception(message)
    {
        public int Status { get; } = status;
    }
}
