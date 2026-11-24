import { GoogleGenAI } from '@google/genai';

export const DEFAULT_STT_MODEL = 'gemini-4-hydrogen';
export const DEFAULT_TEXT_MODEL = 'gemini-3.1-flash-lite';
export const FAST_LITE_MODEL = 'gemini-3.1-flash-lite';
export const TRANSCRIBE_MODEL = 'gemini-3.5-transcribe';

export const CURATED_MODELS = [
  DEFAULT_STT_MODEL,
  FAST_LITE_MODEL,
  TRANSCRIBE_MODEL,
];

const MODEL_NAME_RE = /^[a-z0-9][a-z0-9._-]{1,80}$/i;
const AUDIO_MIME_RE = /^audio\/[a-z0-9.+-]+(?:;\s*codecs=[a-z0-9.,_-]+)?$/i;
const MAX_AUDIO_B64_CHARS = 42 * 1024 * 1024; // ~31 MB binary audio
const MAX_TEXT_CHARS = 100_000;
const MAX_SYSTEM_CHARS = 4_000;

const DEPRECATED_OR_LEGACY_RE = /^(gemini-(1(\.\d+)?|2\.0|2\.5)-|gemini-pro$|gemini-flash-(lite-)?latest$|gemini-3\.5-flash-lite$)/i;

const DEFAULT_TRANSCRIBE_PROMPT =
  'Transcribe the speech in this audio verbatim in its original language (Persian/Farsi, English, or mixed). Return ONLY the spoken transcript with no commentary, summary, or labels. If there is only silence or background noise with no speech, return an empty string.';

const DEFAULT_POLISH_SYSTEM =
  'You are a spelling/grammar proofreader. Fix only spelling, orthography and grammar errors in the SAME language as the input text; never change the language, meaning or tone. If no correction is needed, return the input text verbatim. Return ONLY the corrected text — never commentary, explanation or apology. (If the text is Persian and means UI, «رابطه کاربری» should become «رابط کاربری».)';

let cachedClient = null;
let cachedKey = '';
const unsupportedThinkingModels = new Set();

export function isGeminiConfigured() {
  return Boolean((process.env.GEMINI_API_KEY || '').trim());
}

function getClient() {
  const apiKey = (process.env.GEMINI_API_KEY || '').trim();
  if (!apiKey) {
    const err = new Error('سرویس Google Gemini روی سرور پیکربندی نشده است');
    err.status = 503;
    throw err;
  }
  if (!cachedClient || cachedKey !== apiKey) {
    cachedClient = new GoogleGenAI({
      apiKey,
      httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
    });
    cachedKey = apiKey;
  }
  return cachedClient;
}

function normalizeModelInput(raw) {
  if (raw == null || raw === '') return '';
  if (typeof raw !== 'string') {
    const err = new Error('نام مدل نامعتبر است');
    err.status = 400;
    throw err;
  }
  const clean = raw.trim().replace(/^models\//i, '');
  if (!clean) return '';
  if (!MODEL_NAME_RE.test(clean)) {
    const err = new Error('فرمت نام مدل نامعتبر است');
    err.status = 400;
    throw err;
  }
  return clean;
}

export function resolveSttModel(raw) {
  const clean = normalizeModelInput(raw);
  if (!clean) return DEFAULT_STT_MODEL;
  if (DEPRECATED_OR_LEGACY_RE.test(clean)) return DEFAULT_STT_MODEL;
  return clean;
}

export function resolveTextModel(raw) {
  const clean = normalizeModelInput(raw);
  if (!clean) return DEFAULT_TEXT_MODEL;
  if (DEPRECATED_OR_LEGACY_RE.test(clean) || clean === TRANSCRIBE_MODEL) {
    return DEFAULT_TEXT_MODEL;
  }
  return clean;
}

export function extractHttpStatus(err) {
  const candidates = [err?.status, err?.statusCode, err?.code, err?.response?.status];
  for (const c of candidates) {
    const n = Number(c);
    if (Number.isInteger(n) && n >= 400 && n <= 599) return n;
  }
  return 500;
}

export function safeErrorMessage(err, status) {
  let raw = typeof err?.message === 'string' ? err.message : '';
  if (raw.startsWith('{')) {
    try {
      const parsed = JSON.parse(raw);
      if (typeof parsed?.error?.message === 'string') raw = parsed.error.message;
      else if (typeof parsed?.message === 'string') raw = parsed.message;
    } catch {
      // keep raw message
    }
  }
  const cleaned = raw
    .replace(/AIza[0-9A-Za-z_-]{10,}/g, '[redacted]')
    .replace(/AQ\.[0-9A-Za-z._-]{10,}/g, '[redacted]')
    .trim();
  if (status === 400 || status === 401 || status === 403 || status === 404 || status === 413 || status === 429 || status === 503) {
    return cleaned.slice(0, 300) || `HTTP ${status}`;
  }
  return cleaned.slice(0, 240) || 'خطای داخلی سرویس Gemini';
}

function buildMinimalThinkingConfig(model, mode = 'minimal') {
  const id = String(model || '').toLowerCase();
  if (!id || unsupportedThinkingModels.has(id)) return null;
  if (/transcribe|tts|image|imagen|veo/i.test(id)) return null;
  // Minimize latency and token usage on thinking-capable Gemini models
  if (/^gemini-(3|4)/i.test(id)) {
    return { thinkingLevel: mode === 'low' ? 'LOW' : 'MINIMAL' };
  }
  return { thinkingBudget: mode === 'low' ? 256 : 0 };
}

function isThinkingParamError(err) {
  const msg = String(err?.message || '').toLowerCase();
  return extractHttpStatus(err) === 400 && /thinking|budget|level|unknown name|not supported|invalid argument/i.test(msg);
}

function extractCleanText(response) {
  const parts = response?.candidates?.[0]?.content?.parts;
  if (Array.isArray(parts) && parts.length) {
    const visible = parts
      .filter((p) => p && !p.thought && typeof p.text === 'string')
      .map((p) => p.text)
      .join('')
      .trim();
    if (visible) return visible;
  }
  return String(response?.text || '').trim();
}

async function generateWithSafeThinking(ai, { model, contents, config, thinkingMode = 'minimal' }) {
  const thinkingConfig = buildMinimalThinkingConfig(model, thinkingMode);
  const fullConfig = thinkingConfig ? { ...(config || {}), thinkingConfig } : (config || {});
  try {
    return await ai.models.generateContent({ model, contents, config: fullConfig });
  } catch (err) {
    if (thinkingConfig && isThinkingParamError(err)) {
      unsupportedThinkingModels.add(String(model || '').toLowerCase());
      const { thinkingConfig: _drop, ...safeConfig } = fullConfig;
      return await ai.models.generateContent({ model, contents, config: safeConfig });
    }
    throw err;
  }
}

export async function transcribeAudio({ model, mimeType, data }) {
  const ai = getClient();
  const resolvedModel = resolveSttModel(model);

  const rawMime = typeof mimeType === 'string' && mimeType.trim() ? mimeType.trim() : 'audio/webm';
  if (!AUDIO_MIME_RE.test(rawMime)) {
    const err = new Error('فرمت فایل صوتی پشتیبانی نمی‌شود');
    err.status = 400;
    throw err;
  }
  const cleanMime = rawMime.split(';')[0].trim().toLowerCase();

  if (typeof data !== 'string' || data.length < 16) {
    const err = new Error('داده صوتی معتبر نیست یا خیلی کوتاه است');
    err.status = 400;
    throw err;
  }
  if (data.length > MAX_AUDIO_B64_CHARS) {
    const err = new Error('حجم فایل صوتی بیشتر از حد مجاز است');
    err.status = 413;
    throw err;
  }

  const contents = {
    parts: [
      { inlineData: { mimeType: cleanMime, data } },
      { text: DEFAULT_TRANSCRIBE_PROMPT },
    ],
  };

  let activeModel = resolvedModel;
  let response = await generateWithSafeThinking(ai, {
    model: activeModel,
    contents,
    config: { temperature: 0 },
    thinkingMode: 'minimal',
  });

  let text = extractCleanText(response);
  // If primary audio model returned empty text, seamlessly try dedicated transcribe model once
  if (!text && activeModel !== TRANSCRIBE_MODEL) {
    try {
      const fbResp = await generateWithSafeThinking(ai, {
        model: TRANSCRIBE_MODEL,
        contents,
        config: { temperature: 0 },
        thinkingMode: 'minimal',
      });
      const fbText = extractCleanText(fbResp);
      if (fbText) {
        response = fbResp;
        text = fbText;
        activeModel = TRANSCRIBE_MODEL;
      }
    } catch {
      // let caller handle empty text or chain fallback
    }
  }

  const finishReason = response?.candidates?.[0]?.finishReason || null;
  const blockReason = response?.promptFeedback?.blockReason || null;
  return {
    text,
    model: activeModel,
    finishReason,
    blockReason,
  };
}

export async function generateText({ model, text, system, maxOutputTokens, temperature, thinkingMode = 'minimal' }) {
  const ai = getClient();
  const resolvedModel = resolveTextModel(model);

  if (typeof text !== 'string' || !text.trim()) {
    const err = new Error('متن ورودی خالی است');
    err.status = 400;
    throw err;
  }
  if (text.length > MAX_TEXT_CHARS) {
    const err = new Error('متن ورودی بیش از حد طولانی است');
    err.status = 413;
    throw err;
  }

  let systemInstruction = DEFAULT_POLISH_SYSTEM;
  if (typeof system === 'string' && system.trim()) {
    if (system.length > MAX_SYSTEM_CHARS) {
      const err = new Error('دستورالعمل سیستم بیش از حد طولانی است');
      err.status = 400;
      throw err;
    }
    systemInstruction = system.trim();
  }

  const config = { systemInstruction };
  const parsedBudget = Number(maxOutputTokens);
  if (Number.isFinite(parsedBudget) && parsedBudget >= 64) {
    config.maxOutputTokens = Math.min(8192, Math.round(parsedBudget));
  }
  const parsedTemp = Number(temperature);
  if (Number.isFinite(parsedTemp) && parsedTemp >= 0 && parsedTemp <= 1) {
    config.temperature = parsedTemp;
  }

  let activeModel = resolvedModel;
  let response;
  try {
    response = await generateWithSafeThinking(ai, {
      model: activeModel,
      contents: text,
      config,
      thinkingMode,
    });
    if (!extractCleanText(response) && activeModel !== FAST_LITE_MODEL) {
      activeModel = FAST_LITE_MODEL;
      response = await generateWithSafeThinking(ai, {
        model: activeModel,
        contents: text,
        config,
        thinkingMode,
      });
    }
  } catch (err) {
    const code = extractHttpStatus(err);
    if ((code === 503 || code === 429) && activeModel !== FAST_LITE_MODEL) {
      activeModel = FAST_LITE_MODEL;
      response = await generateWithSafeThinking(ai, {
        model: activeModel,
        contents: text,
        config,
        thinkingMode,
      });
    } else {
      throw err;
    }
  }

  const finishReason = response.candidates?.[0]?.finishReason || null;
  return {
    text: extractCleanText(response),
    finishReason,
    model: activeModel,
  };
}

export async function listAvailableModels() {
  const ai = getClient();
  const out = new Set(CURATED_MODELS);
  try {
    const pager = await ai.models.list();
    for await (const m of pager) {
      const id = String(m?.name || '').replace(/^models\//i, '').trim();
      if (!id || !/^gemini-/i.test(id)) continue;
      if (DEPRECATED_OR_LEGACY_RE.test(id)) continue;
      if (/embedding|imagen|image|nano-banana|veo|lyria|aqa|bisheng|tts|robotics|computer-use|deep-research/i.test(id)) continue;
      out.add(id);
      if (out.size >= 40) break;
    }
  } catch {
    // Fall back to curated active models if listing endpoint is restricted
  }
  return Array.from(out);
}

export async function testConnection({ model } = {}) {
  const ai = getClient();
  let activeModel = resolveTextModel(model);
  try {
    await generateWithSafeThinking(ai, {
      model: activeModel,
      contents: 'Reply with OK.',
      config: { maxOutputTokens: 16 },
      thinkingMode: 'minimal',
    });
  } catch (err) {
    if (extractHttpStatus(err) === 503 && activeModel !== FAST_LITE_MODEL) {
      activeModel = FAST_LITE_MODEL;
      await generateWithSafeThinking(ai, {
        model: activeModel,
        contents: 'Reply with OK.',
        config: { maxOutputTokens: 16 },
        thinkingMode: 'minimal',
      });
    } else {
      throw err;
    }
  }
  return { ok: true, model: activeModel };
}
