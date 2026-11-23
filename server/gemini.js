import { GoogleGenAI } from '@google/genai';

export const DEFAULT_STT_MODEL = 'gemini-3.5-transcribe';
export const DEFAULT_TEXT_MODEL = 'gemini-4-hydrogen';
export const FAST_LITE_MODEL = 'gemini-3.1-flash-lite';

export const CURATED_MODELS = [
  DEFAULT_STT_MODEL,
  FAST_LITE_MODEL,
  DEFAULT_TEXT_MODEL,
];

const MODEL_NAME_RE = /^[a-z0-9][a-z0-9._-]{1,80}$/i;
const AUDIO_MIME_RE = /^audio\/[a-z0-9.+-]+(?:;\s*codecs=[a-z0-9.,_-]+)?$/i;
const MAX_AUDIO_B64_CHARS = 42 * 1024 * 1024; // ~31 MB binary audio
const MAX_TEXT_CHARS = 100_000;
const MAX_SYSTEM_CHARS = 4_000;

const DEPRECATED_OR_LEGACY_RE = /^(gemini-(1(\.\d+)?|2\.0|2\.5)-|gemini-pro$|gemini-flash-(lite-)?latest$|gemini-3\.5-flash-lite$)/i;

const DEFAULT_TRANSCRIBE_PROMPT =
  'Transcribe verbatim in original language(s). Only transcription, no summary.';

const DEFAULT_POLISH_SYSTEM =
  'You are a spelling/grammar proofreader. Fix only spelling, orthography and grammar errors in the SAME language as the input text; never change the language, meaning or tone. If no correction is needed, return the input text verbatim. Return ONLY the corrected text — never commentary, explanation or apology. (If the text is Persian and means UI, «رابطه کاربری» should become «رابط کاربری».)';

let cachedClient = null;
let cachedKey = '';

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
  if (DEPRECATED_OR_LEGACY_RE.test(clean) || clean === DEFAULT_STT_MODEL) {
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

  const response = await ai.models.generateContent({
    model: resolvedModel,
    contents: {
      parts: [
        { inlineData: { mimeType: cleanMime, data } },
        { text: DEFAULT_TRANSCRIBE_PROMPT },
      ],
    },
  });

  return {
    text: (response.text || '').trim(),
    model: resolvedModel,
  };
}

export async function generateText({ model, text, system, maxOutputTokens, temperature }) {
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
    response = await ai.models.generateContent({
      model: activeModel,
      contents: text,
      config,
    });
    if (!(response?.text || '').trim() && activeModel !== FAST_LITE_MODEL) {
      activeModel = FAST_LITE_MODEL;
      response = await ai.models.generateContent({
        model: activeModel,
        contents: text,
        config,
      });
    }
  } catch (err) {
    const code = extractHttpStatus(err);
    if ((code === 503 || code === 429) && activeModel !== FAST_LITE_MODEL) {
      activeModel = FAST_LITE_MODEL;
      response = await ai.models.generateContent({
        model: activeModel,
        contents: text,
        config,
      });
    } else {
      throw err;
    }
  }

  const finishReason = response.candidates?.[0]?.finishReason || null;
  return {
    text: (response.text || '').trim(),
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
    await ai.models.generateContent({
      model: activeModel,
      contents: 'Reply with OK.',
      config: { maxOutputTokens: 16 },
    });
  } catch (err) {
    if (extractHttpStatus(err) === 503 && activeModel !== FAST_LITE_MODEL) {
      activeModel = FAST_LITE_MODEL;
      await ai.models.generateContent({
        model: activeModel,
        contents: 'Reply with OK.',
        config: { maxOutputTokens: 16 },
      });
    } else {
      throw err;
    }
  }
  return { ok: true, model: activeModel };
}
