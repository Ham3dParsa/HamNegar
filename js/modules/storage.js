// Module: storage
// Interface: small surface to read/write all persisted state. Everything about localStorage keys stays inside.
// Depth: hides 10+ keys, serialization, defaults, and migration behind 6 functions.
export const STT_DEFAULTS = ['groq','gemini-flash-lite-latest','gemini-3.5-flash-lite','gemini-3.1-flash-lite'];
export const POLISH_DEFAULTS = ['qwen/qwen3-30b-a3b:free','qwen/qwen3-32b:free','openai/gpt-oss-20b:free'];
// canonical polish aliases — task spec uses dot notation; normalize to OpenRouter free ids
const POLISH_ALIAS = {
  'qwen/qwen3.6-27b': 'qwen/qwen3-30b-a3b:free',
  'qwen/qwen3.8-27b': 'qwen/qwen3-32b:free',
  'qwen/qwen3-6-27b': 'qwen/qwen3-30b-a3b:free',
  'openai/gpt-oss-20b': 'openai/gpt-oss-20b:free',
};

function normalizePolish(arr){
  return arr.map(m=>POLISH_ALIAS[m]||m);
}

const KEYS = {
  GROQ: 'KEY_GROQ',
  GEMINI: 'KEY_GEMINI',
  OPENROUTER: 'KEY_OPENROUTER',
  PRIMARY: 'PRIMARY_ENGINE',
  MODEL: 'GEMINI_MODEL',
  STT_CHAIN: 'STT_CHAIN',
  POLISH_CHAIN: 'POLISH_CHAIN',
  POLISH_ENABLED: 'POLISH_ENABLED',
  REALTIME: 'REALTIME',
  VAD: 'VAD',
  AUTOCOPY: 'AUTOCOPY',
  DRAFT: 'DRAFT_TEXT',
  QUOTA: 'QUOTA_USAGE',
  H_OUT: 'OUTPUT_HEIGHT',
  H_LOG: 'LOG_HEIGHT',
};

function parseChain(raw, defaults){
  if(!raw) return [...defaults];
  try{
    const arr = JSON.parse(raw);
    if(Array.isArray(arr) && arr.length) return normalizePolish(arr.filter(x=>typeof x==='string' && x.trim()));
  }catch{}
  return [...defaults];
}

export const Storage = {
  getSettings() {
    // migration: if new chain keys missing but legacy PRIMARY/MODEL exist, build chain respecting primary order
    const rawStt = localStorage.getItem(KEYS.STT_CHAIN);
    const rawPolish = localStorage.getItem(KEYS.POLISH_CHAIN);
    let sttChain = parseChain(rawStt, STT_DEFAULTS);
    let polishChain = parseChain(rawPolish, POLISH_DEFAULTS);
    // legacy migration for stt
    if(!rawStt && (localStorage.getItem(KEYS.PRIMARY) || localStorage.getItem(KEYS.MODEL))){
      const p = localStorage.getItem(KEYS.PRIMARY) || 'groq';
      const m = localStorage.getItem(KEYS.MODEL) || 'gemini-flash-latest';
      const set = new Set();
      if(p==='groq'){ set.add('groq'); set.add(m); } else { set.add(m); set.add('groq'); }
      for(const d of STT_DEFAULTS) set.add(d);
      sttChain = [...set];
    }
    const peRaw = localStorage.getItem(KEYS.POLISH_ENABLED);
    return {
      groqKey: localStorage.getItem(KEYS.GROQ) || '',
      geminiKey: localStorage.getItem(KEYS.GEMINI) || '',
      openrouterKey: localStorage.getItem(KEYS.OPENROUTER) || '',
      primary: localStorage.getItem(KEYS.PRIMARY) || 'groq',
      model: localStorage.getItem(KEYS.MODEL) || 'gemini-flash-latest',
      sttChain,
      polishChain,
      polishEnabled: peRaw === null ? true : peRaw === '1',
      realtime: localStorage.getItem(KEYS.REALTIME) === '1',
      vad: localStorage.getItem(KEYS.VAD) !== '0',
      autocopy: localStorage.getItem(KEYS.AUTOCOPY) === '1',
    };
  },
  saveSettings(patch) {
    if ('groqKey' in patch) localStorage.setItem(KEYS.GROQ, patch.groqKey.trim());
    if ('geminiKey' in patch) localStorage.setItem(KEYS.GEMINI, patch.geminiKey.trim());
    if ('openrouterKey' in patch) localStorage.setItem(KEYS.OPENROUTER, patch.openrouterKey.trim());
    if ('primary' in patch) localStorage.setItem(KEYS.PRIMARY, patch.primary);
    if ('model' in patch) localStorage.setItem(KEYS.MODEL, patch.model);
    if ('sttChain' in patch) localStorage.setItem(KEYS.STT_CHAIN, JSON.stringify(normalizePolish(patch.sttChain)));
    if ('polishChain' in patch) localStorage.setItem(KEYS.POLISH_CHAIN, JSON.stringify(normalizePolish(patch.polishChain)));
    if ('polishEnabled' in patch) localStorage.setItem(KEYS.POLISH_ENABLED, patch.polishEnabled ? '1' : '0');
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
