// Module: storage
// Interface: small surface to read/write all persisted state. Everything about localStorage keys stays inside.
// Depth: hides 10+ keys, serialization, defaults, and migration behind 6 functions.
const KEYS = {
  GROQ: 'KEY_GROQ',
  GEMINI: 'KEY_GEMINI',
  PRIMARY: 'PRIMARY_ENGINE',
  MODEL: 'GEMINI_MODEL',
  REALTIME: 'REALTIME',
  VAD: 'VAD',
  AUTOCOPY: 'AUTOCOPY',
  DRAFT: 'DRAFT_TEXT',
  QUOTA: 'QUOTA_USAGE',
  H_OUT: 'OUTPUT_HEIGHT',
  H_LOG: 'LOG_HEIGHT',
};

export const Storage = {
  getSettings() {
    return {
      groqKey: localStorage.getItem(KEYS.GROQ) || '',
      geminiKey: localStorage.getItem(KEYS.GEMINI) || '',
      primary: localStorage.getItem(KEYS.PRIMARY) || 'groq',
      model: localStorage.getItem(KEYS.MODEL) || 'gemini-flash-latest',
      realtime: localStorage.getItem(KEYS.REALTIME) === '1',
      vad: localStorage.getItem(KEYS.VAD) !== '0',
      autocopy: localStorage.getItem(KEYS.AUTOCOPY) === '1',
    };
  },
  saveSettings(patch) {
    if ('groqKey' in patch) localStorage.setItem(KEYS.GROQ, patch.groqKey.trim());
    if ('geminiKey' in patch) localStorage.setItem(KEYS.GEMINI, patch.geminiKey.trim());
    if ('primary' in patch) localStorage.setItem(KEYS.PRIMARY, patch.primary);
    if ('model' in patch) localStorage.setItem(KEYS.MODEL, patch.model);
    if ('realtime' in patch) localStorage.setItem(KEYS.REALTIME, patch.realtime ? '1' : '0');
    if ('vad' in patch) localStorage.setItem(KEYS.VAD, patch.vad ? '1' : '0');
    if ('autocopy' in patch) localStorage.setItem(KEYS.AUTOCOPY, patch.autocopy ? '1' : '0');
  },
  getDraft() { return localStorage.getItem(KEYS.DRAFT) || ''; },
  saveDraft(text) { localStorage.setItem(KEYS.DRAFT, text); },
  clearDraft() { localStorage.removeItem(KEYS.DRAFT); },
  getHeights() {
    return { out: localStorage.getItem(KEYS.H_OUT), log: localStorage.getItem(KEYS.H_LOG) };
  },
  saveHeights({ out, log }) {
    if (out) localStorage.setItem(KEYS.H_OUT, out);
    if (log) localStorage.setItem(KEYS.H_LOG, log);
  },
  getQuotaRaw() {
    try { return JSON.parse(localStorage.getItem(KEYS.QUOTA) || '{}'); } catch { return {}; }
  },
  saveQuotaRaw(obj) {
    localStorage.setItem(KEYS.QUOTA, JSON.stringify(obj));
  },
};
