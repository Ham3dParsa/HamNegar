// Module: storage
// Interface: small surface to read/write all persisted state. Everything about localStorage keys stays inside.
// Depth: hides 11+ keys, serialization, defaults, and migration behind getSettings/saveSettings plus
// provider helpers (getProviders/hasKeyForProvider). Chains (STT + polish) share one entry shape
// {id, providerId, enabled} where providerId is 'groq'|'gemini'|'openrouter'|custom id.
// Custom providers live under a separate key as [{id,name,baseURL,key}]; built-ins stay fixed fields.
// Never logs keys.
export const STT_DEFAULTS = ['groq','gemini-flash-lite-latest','gemini-3.5-flash-lite','gemini-3.1-flash-lite'];
export const GROQ_BASE_DEFAULT = 'https://api.groq.com/openai/v1';
export const OPENROUTER_BASE_DEFAULT = 'https://openrouter.ai/api/v1';
export const BUILTIN_PROVIDER_IDS = ['groq','gemini','openrouter'];
// پالیش: هر ورودی {id,providerId,enabled} — providerId: groq|gemini|openrouter|custom id
export const POLISH_DEFAULTS = [
  { id:'qwen/qwen3.6-27b', providerId:'groq', enabled:true },
  { id:'qwen/qwen3.8-27b', providerId:'groq', enabled:true },
  { id:'openai/gpt-oss-20b', providerId:'groq', enabled:true },
];
const POLISH_DEFAULTS_LEGACY = ['qwen/qwen3.6-27b','qwen/qwen3.8-27b','openai/gpt-oss-20b'];

function inferSTTProviderId(id, explicit){
  if(typeof explicit === 'string' && explicit.trim()) return explicit.trim();
  if(id === 'groq') return 'groq';
  if(/^gemini/i.test(id)) return 'gemini';
  if(id.includes(':free')) return 'openrouter';
  return 'groq';
}

function normalizePolishEntry(x){
  if(typeof x === 'string'){
    const id = x.trim();
    if(!id) return null;
    // legacy :free → openrouter, else groq (qwen/oss via Groq per new spec)
    const providerId = id.includes(':free') ? 'openrouter' : 'groq';
    const cleanId = id.replace(':free','');
    return { id: cleanId, providerId, enabled:true };
  }
  if(x && typeof x === 'object' && typeof x.id === 'string' && x.id.trim()){
    const id = x.id.trim();
    // canonical providerId wins; legacy `provider` accepted as alias for migration
    const rawPid = (typeof x.providerId === 'string' && x.providerId.trim())
      ? x.providerId.trim()
      : (typeof x.provider === 'string' && x.provider.trim() ? x.provider.trim() : '');
    let providerId;
    if(rawPid === 'openrouter' || rawPid === 'gemini' || rawPid === 'groq') providerId = rawPid;
    else if(rawPid) providerId = rawPid; // custom id passthrough
    else providerId = id.includes(':free') ? 'openrouter' : 'groq';
    const cleanId = id.replace(':free','');
    const enabled = x.enabled === false ? false : true;
    return { id: cleanId, providerId, enabled };
  }
  return null;
}
function normalizePolishChain(arr){
  const seen = new Set();
  const out = [];
  for(const raw of arr){
    const e = normalizePolishEntry(raw);
    if(!e) continue;
    const key = `${e.providerId}:${e.id}`;
    if(seen.has(key)) continue;
    seen.add(key);
    out.push(e);
  }
  return out;
}
function normalizeSTTEntry(x){
  if(typeof x === 'string'){
    const id=x.trim(); if(!id) return null;
    const cleanId = id.replace(':free','');
    return { id: cleanId, providerId: inferSTTProviderId(cleanId, ''), enabled:true };
  }
  if(x && typeof x === 'object' && typeof x.id==='string' && x.id.trim()){
    const id=x.id.trim().replace(':free','');
    const explicit = (typeof x.providerId==='string' && x.providerId.trim())
      ? x.providerId.trim()
      : (typeof x.provider==='string' && x.provider.trim() ? x.provider.trim() : '');
    return { id, providerId: inferSTTProviderId(id, explicit || (x.id.includes(':free') ? 'openrouter' : '')), enabled: x.enabled===false?false:true };
  }
  return null;
}
function normalizeSTTChain(arr){
  const seen=new Set(); const out=[];
  for(const raw of arr){ const e=normalizeSTTEntry(raw); if(!e) continue; const key=`${e.providerId}:${e.id}`; if(seen.has(key)) continue; seen.add(key); out.push(e); }
  return out;
}
function normalizeCustomProvider(x){
  if(!x || typeof x !== 'object') return null;
  const id = typeof x.id === 'string' ? x.id.trim() : '';
  if(!id) return null;
  const name = typeof x.name === 'string' && x.name.trim() ? x.name.trim() : id;
  const baseURL = typeof x.baseURL === 'string' ? x.baseURL.trim().replace(/\/+$/,'') : '';
  const key = typeof x.key === 'string' ? x.key.trim() : '';
  return { id, name, baseURL, key };
}
function normalizeCustomProviders(arr){
  if(!Array.isArray(arr)) return [];
  const seen = new Set(); const out = [];
  for(const raw of arr){
    const e = normalizeCustomProvider(raw);
    if(!e || seen.has(e.id)) continue;
    seen.add(e.id);
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
  CUSTOM_PROVIDERS: 'CUSTOM_PROVIDERS',
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

function parseSTTChain(raw, defaults){
  if(!raw) return normalizeSTTChain(defaults);
  try{
    const arr=JSON.parse(raw);
    if(Array.isArray(arr) && arr.length){
      const norm=normalizeSTTChain(arr); if(norm.length) return norm;
    }
  }catch{}
  return normalizeSTTChain(defaults);
}
function parseCustomProviders(raw){
  if(!raw) return [];
  try{
    const arr = JSON.parse(raw);
    if(Array.isArray(arr)) return normalizeCustomProviders(arr);
  }catch{}
  return [];
}

function checkHttpsBaseURL(v, label, field){
  let u; try{ u=new URL(v); }catch{ throw Object.assign(new Error(`${label} نامعتبر — باید https:// باشد`),{status:400, field}); }
  if(u.protocol!=='https:') throw Object.assign(new Error(`${label} باید https باشد`),{status:400, field});
  return v.replace(/\/+$/,'');
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
    let sttChain = parseSTTChain(rawStt, STT_DEFAULTS);
    let polishChain = parsePolishChain(rawPolish, POLISH_DEFAULTS);
    if(!rawStt && (localStorage.getItem(KEYS.PRIMARY) || localStorage.getItem(KEYS.MODEL))){
      const p = localStorage.getItem(KEYS.PRIMARY) || 'groq';
      const m = localStorage.getItem(KEYS.MODEL) || 'gemini-flash-latest';
      const allowed = new Set([...STT_DEFAULTS, 'groq']);
      const set = new Set();
      if(p==='groq'){ set.add('groq'); if(allowed.has(m)) set.add(m); } else { if(allowed.has(m)) set.add(m); set.add('groq'); }
      for(const d of STT_DEFAULTS) set.add(d);
      sttChain = normalizeSTTChain([...set]);
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
      customProviders: parseCustomProviders(localStorage.getItem(KEYS.CUSTOM_PROVIDERS)),
      polishEnabled: peRaw === null ? true : peRaw === '1',
      realtime: localStorage.getItem(KEYS.REALTIME) === '1',
      vad: localStorage.getItem(KEYS.VAD) !== '0',
      autocopy: localStorage.getItem(KEYS.AUTOCOPY) === '1',
      logCollapsed: logColRaw === null ? true : logColRaw === '1',
      reportCollapsed: repColRaw === null ? true : repColRaw === '1',
    };
  },
  saveSettings(patch) {
    // validate BaseURLs first — atomic: no partial persist on throw (waiver: custom host allowed, confirm at fetch)
    let groqBaseNorm = null, orBaseNorm = null, customsNorm = null;
    if ('groqBaseURL' in patch) {
      const v = (patch.groqBaseURL||'').trim();
      groqBaseNorm = v ? checkHttpsBaseURL(v, 'Groq BaseURL', 'groqBaseURL') : GROQ_BASE_DEFAULT;
    }
    if ('openrouterBaseURL' in patch) {
      const v = (patch.openrouterBaseURL||'').trim();
      orBaseNorm = v ? checkHttpsBaseURL(v, 'OpenRouter BaseURL', 'openrouterBaseURL') : OPENROUTER_BASE_DEFAULT;
    }
    if ('customProviders' in patch) {
      const arr = Array.isArray(patch.customProviders) ? patch.customProviders : [];
      customsNorm = normalizeCustomProviders(arr);
      customsNorm.forEach((c, i) => {
        if(c.baseURL) checkHttpsBaseURL(c.baseURL, 'BaseURL ارائه‌دهنده سفارشی', `customProviders[${i}].baseURL`);
      });
    }
    if ('groqKey' in patch) localStorage.setItem(KEYS.GROQ, patch.groqKey.trim());
    if ('groqBaseURL' in patch) localStorage.setItem(KEYS.GROQ_BASE, groqBaseNorm);
    if ('geminiKey' in patch) localStorage.setItem(KEYS.GEMINI, patch.geminiKey.trim());
    if ('openrouterKey' in patch) localStorage.setItem(KEYS.OPENROUTER, patch.openrouterKey.trim());
    if ('openrouterBaseURL' in patch) localStorage.setItem(KEYS.OPENROUTER_BASE, orBaseNorm);
    if ('primary' in patch) localStorage.setItem(KEYS.PRIMARY, patch.primary);
    if ('model' in patch) localStorage.setItem(KEYS.MODEL, patch.model);
    if ('sttChain' in patch) localStorage.setItem(KEYS.STT_CHAIN, JSON.stringify(normalizeSTTChain(patch.sttChain)));
    if ('polishChain' in patch) localStorage.setItem(KEYS.POLISH_CHAIN, JSON.stringify(normalizePolishChain(patch.polishChain)));
    if ('customProviders' in patch) localStorage.setItem(KEYS.CUSTOM_PROVIDERS, JSON.stringify(customsNorm));
    if ('polishEnabled' in patch) localStorage.setItem(KEYS.POLISH_ENABLED, patch.polishEnabled ? '1' : '0');
    if ('realtime' in patch) localStorage.setItem(KEYS.REALTIME, patch.realtime ? '1' : '0');
    if ('vad' in patch) localStorage.setItem(KEYS.VAD, patch.vad ? '1' : '0');
    if ('autocopy' in patch) localStorage.setItem(KEYS.AUTOCOPY, patch.autocopy ? '1' : '0');
    if ('logCollapsed' in patch) localStorage.setItem(KEYS.LOG_COLLAPSED, patch.logCollapsed ? '1' : '0');
    if ('reportCollapsed' in patch) localStorage.setItem(KEYS.REPORT_COLLAPSED, patch.reportCollapsed ? '1' : '0');
  },
  getProviders() {
    // built-ins (key presence only — never leaks key values) + customs
    const s = Storage.getSettings();
    return [
      { id: 'groq', name: 'Groq', baseURL: s.groqBaseURL, hasKey: !!s.groqKey },
      { id: 'gemini', name: 'Gemini', baseURL: '', hasKey: !!s.geminiKey },
      { id: 'openrouter', name: 'OpenRouter', baseURL: s.openrouterBaseURL, hasKey: !!s.openrouterKey },
      ...s.customProviders.map(c => ({ id: c.id, name: c.name || c.id, baseURL: c.baseURL || '', hasKey: !!c.key })),
    ];
  },
  hasKeyForProvider(providerId) {
    const s = Storage.getSettings();
    if(providerId === 'groq') return !!s.groqKey;
    if(providerId === 'gemini') return !!s.geminiKey;
    if(providerId === 'openrouter') return !!s.openrouterKey;
    const c = s.customProviders.find(x => x.id === providerId);
    return !!(c && c.key);
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
