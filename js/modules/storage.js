// Module: storage
// Interface: small surface to read/write all persisted state. Everything about localStorage keys stays inside.
// Depth: hides 10+ keys, serialization, defaults, and migration behind 6 functions.
export const STT_DEFAULTS = ['groq','gemini-flash-lite-latest','gemini-3.5-flash-lite','gemini-3.1-flash-lite'];
export const GROQ_BASE_DEFAULT = 'https://api.groq.com/openai/v1';
export const OPENROUTER_BASE_DEFAULT = 'https://openrouter.ai/api/v1';
// پالیش دو-کلیده: هر ورودی {id,provider,enabled} — provider: groq|openrouter
export const POLISH_DEFAULTS = [
  { id:'qwen/qwen3.6-27b', provider:'groq', enabled:true },
  { id:'qwen/qwen3.8-27b', provider:'groq', enabled:true },
  { id:'openai/gpt-oss-20b', provider:'groq', enabled:true },
];
export const POLISH_DEFAULTS_LEGACY = ['qwen/qwen3.6-27b','qwen/qwen3.8-27b','openai/gpt-oss-20b'];

function normalizePolishEntry(x){
  if(typeof x === 'string'){
    const id = x.trim();
    if(!id) return null;
    // legacy :free → openrouter, else groq (qwen/oss via Groq per new spec)
    const provider = id.includes(':free') ? 'openrouter' : (id.includes('/') ? 'groq' : 'groq');
    const cleanId = id.replace(':free','');
    return { id: cleanId, provider, enabled:true };
  }
  if(x && typeof x === 'object' && typeof x.id === 'string' && x.id.trim()){
    const id = x.id.trim();
    const provider = x.provider === 'openrouter' ? 'openrouter' : x.provider === 'gemini' ? 'gemini' : 'groq';
    const enabled = x.enabled === false ? false : true;
    return { id, provider, enabled };
  }
  return null;
}
function normalizePolishChain(arr){
  const seen = new Set();
  const out = [];
  for(const raw of arr){
    const e = normalizePolishEntry(raw);
    if(!e) continue;
    const key = `${e.provider}:${e.id}`;
    if(seen.has(key)) continue;
    seen.add(key);
    out.push(e);
  }
  return out;
}
function normalizePolish(arr){
  return [...new Set(arr.filter(x=>typeof x==='string' && x.trim()!==''))];
}

const KEYS = {
  GROQ: 'KEY_GROQ',
  GROQ_BASE: 'GROQ_BASE_URL',
  GEMINI: 'KEY_GEMINI',
  OPENROUTER: 'KEY_OPENROUTER',
  OPENROUTER_BASE: 'OPENROUTER_BASE_URL',
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
  STATS_HISTORY: 'STATS_HISTORY',
  H_OUT: 'OUTPUT_HEIGHT',
  H_LOG: 'LOG_HEIGHT',
  LOG_COLLAPSED: 'LOG_COLLAPSED',
  REPORT_COLLAPSED: 'REPORT_COLLAPSED',
};

function parseChain(raw, defaults){
  if(!raw) return [...defaults];
  try{
    const arr = JSON.parse(raw);
    if(Array.isArray(arr) && arr.length) return normalizePolish([...new Set(arr.filter(x=>typeof x==='string' && x.trim()!==''))]);
  }catch{}
  return [...defaults];
}
function parsePolishChain(raw, defaults){
  if(!raw) return defaults.map(e=>({ ...e }));
  try{
    const arr = JSON.parse(raw);
    if(Array.isArray(arr) && arr.length){
      const norm = normalizePolishChain(arr);
      if(norm.length) return norm;
    }
  }catch{}
  return defaults.map(e=>({ ...e }));
}

export const Storage = {
  getSettings() {
    const rawStt = localStorage.getItem(KEYS.STT_CHAIN);
    const rawPolish = localStorage.getItem(KEYS.POLISH_CHAIN);
    let sttChain = parseChain(rawStt, STT_DEFAULTS);
    let polishChain = parsePolishChain(rawPolish, POLISH_DEFAULTS);
    if(!rawStt && (localStorage.getItem(KEYS.PRIMARY) || localStorage.getItem(KEYS.MODEL))){
      const p = localStorage.getItem(KEYS.PRIMARY) || 'groq';
      const m = localStorage.getItem(KEYS.MODEL) || 'gemini-flash-latest';
      const allowed = new Set([...STT_DEFAULTS, 'groq']);
      const set = new Set();
      if(p==='groq'){ set.add('groq'); if(allowed.has(m)) set.add(m); } else { if(allowed.has(m)) set.add(m); set.add('groq'); }
      for(const d of STT_DEFAULTS) set.add(d);
      sttChain = [...set];
    }
    const peRaw = localStorage.getItem(KEYS.POLISH_ENABLED);
    const logColRaw = localStorage.getItem(KEYS.LOG_COLLAPSED);
    const repColRaw = localStorage.getItem(KEYS.REPORT_COLLAPSED);
    return {
      groqKey: localStorage.getItem(KEYS.GROQ) || '',
      groqBaseURL: localStorage.getItem(KEYS.GROQ_BASE) || GROQ_BASE_DEFAULT,
      geminiKey: localStorage.getItem(KEYS.GEMINI) || '',
      openrouterKey: localStorage.getItem(KEYS.OPENROUTER) || '',
      openrouterBaseURL: localStorage.getItem(KEYS.OPENROUTER_BASE) || OPENROUTER_BASE_DEFAULT,
      primary: localStorage.getItem(KEYS.PRIMARY) || 'groq',
      model: localStorage.getItem(KEYS.MODEL) || 'gemini-flash-latest',
      sttChain,
      polishChain,
      polishEnabled: peRaw === null ? true : peRaw === '1',
      realtime: localStorage.getItem(KEYS.REALTIME) === '1',
      vad: localStorage.getItem(KEYS.VAD) !== '0',
      autocopy: localStorage.getItem(KEYS.AUTOCOPY) === '1',
      logCollapsed: logColRaw === null ? true : logColRaw === '1',
      reportCollapsed: repColRaw === null ? true : repColRaw === '1',
    };
  },
  saveSettings(patch) {
    if ('groqKey' in patch) localStorage.setItem(KEYS.GROQ, patch.groqKey.trim());
    if ('groqBaseURL' in patch) {
      const v = (patch.groqBaseURL||'').trim();
      if(v){
        try{ const u=new URL(v); if(u.protocol!=='https:') throw new Error('https only'); localStorage.setItem(KEYS.GROQ_BASE, v.replace(/\/+$/,'')); }catch{ /* keep old on invalid */ }
      } else localStorage.setItem(KEYS.GROQ_BASE, GROQ_BASE_DEFAULT);
    }
    if ('geminiKey' in patch) localStorage.setItem(KEYS.GEMINI, patch.geminiKey.trim());
    if ('openrouterKey' in patch) localStorage.setItem(KEYS.OPENROUTER, patch.openrouterKey.trim());
    if ('openrouterBaseURL' in patch) {
      const v = (patch.openrouterBaseURL||'').trim();
      if(v){
        try{ const u=new URL(v); if(u.protocol!=='https:') throw new Error('https only'); localStorage.setItem(KEYS.OPENROUTER_BASE, v.replace(/\/+$/,'')); }catch{}
      } else localStorage.setItem(KEYS.OPENROUTER_BASE, OPENROUTER_BASE_DEFAULT);
    }
    if ('primary' in patch) localStorage.setItem(KEYS.PRIMARY, patch.primary);
    if ('model' in patch) localStorage.setItem(KEYS.MODEL, patch.model);
    if ('sttChain' in patch) localStorage.setItem(KEYS.STT_CHAIN, JSON.stringify(normalizePolish(patch.sttChain)));
    if ('polishChain' in patch) localStorage.setItem(KEYS.POLISH_CHAIN, JSON.stringify(normalizePolishChain(patch.polishChain)));
    if ('polishEnabled' in patch) localStorage.setItem(KEYS.POLISH_ENABLED, patch.polishEnabled ? '1' : '0');
    if ('realtime' in patch) localStorage.setItem(KEYS.REALTIME, patch.realtime ? '1' : '0');
    if ('vad' in patch) localStorage.setItem(KEYS.VAD, patch.vad ? '1' : '0');
    if ('autocopy' in patch) localStorage.setItem(KEYS.AUTOCOPY, patch.autocopy ? '1' : '0');
    if ('logCollapsed' in patch) localStorage.setItem(KEYS.LOG_COLLAPSED, patch.logCollapsed ? '1' : '0');
    if ('reportCollapsed' in patch) localStorage.setItem(KEYS.REPORT_COLLAPSED, patch.reportCollapsed ? '1' : '0');
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
  getStatsHistory() {
    try { const raw = localStorage.getItem(KEYS.STATS_HISTORY); return raw ? JSON.parse(raw) : []; } catch { return []; }
  },
  saveStatsHistory(arr) {
    localStorage.setItem(KEYS.STATS_HISTORY, JSON.stringify(arr));
  },
};
