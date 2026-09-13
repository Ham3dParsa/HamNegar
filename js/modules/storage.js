// Module: storage
// Interface: small surface to read/write all persisted state. Everything about localStorage keys stays inside.
// Depth: hides 11+ keys, serialization, defaults, and migration behind getSettings/saveSettings plus
// provider helpers (getProviders/hasKeyForProvider). Chains (STT + polish) share one entry shape
// {id, providerId, enabled} where providerId is 'groq'|'google'|'openrouter'|custom id
// (legacy stored providerIds migrate on read; purged ones are dropped).
// Ticket 39: getSettings is served from an in-memory copy-on-read cache (dirty flag,
// saveSettings write-through); reads trust a norm-version stamp + strict shape-check
// and fall back to full normalize on mismatch (ticket 24 migration unchanged).
// Custom providers live under a separate key as [{id,name,baseURL,key}]; built-ins stay fixed fields.
// Never logs keys.
export const STT_DEFAULTS = ['groq','gemini-flash-lite-latest','gemini-3.5-flash-lite','gemini-3.1-flash-lite'];
export const GROQ_BASE_DEFAULT = 'https://api.groq.com/openai/v1';
export const OPENROUTER_BASE_DEFAULT = 'https://openrouter.ai/api/v1';
export const BUILTIN_PROVIDER_IDS = ['groq','google','openrouter'];
export const SCHEMA_VERSION = 1;
// پالیش: هر ورودی {id,providerId,enabled} — providerId: groq|google|openrouter|custom id
export const POLISH_DEFAULTS = [
  { id:'openai/gpt-oss-120b', providerId:'groq', enabled:true },
  { id:'qwen/qwen3.8-27b', providerId:'groq', enabled:true },
  { id:'qwen/qwen3.6-27b', providerId:'groq', enabled:true },
  { id:'openai/gpt-oss-20b', providerId:'groq', enabled:true },
];
const POLISH_DEFAULTS_LEGACY = ['openai/gpt-oss-120b','qwen/qwen3.8-27b','qwen/qwen3.6-27b','openai/gpt-oss-20b'];

// Canonical provider ids: groq|google|openrouter (+ customs). Legacy stored aliases
// map to their canonical id (same localStorage slot, so no saved key is lost);
// purged ids map to null so chain normalizers can drop those entries.
// Customs pass through untouched. Exported for the provider seam (ticket 37);
// storage itself never imports provider.js (no cycle: provider imports storage).
export function migrateProviderId(raw){
  const t = typeof raw === 'string' ? raw.trim() : '';
  if(!t) return '';
  if(t === 'gemini') return 'google';
  if(t === 'zenspark') return null;
  return t;
}

function inferSTTProviderId(id, explicit){
  if(typeof explicit === 'string' && explicit.trim()){
    const m = migrateProviderId(explicit);
    if(m === null) return null;
    if(m) return m;
    return explicit.trim();
  }
  if(id === 'groq') return 'groq';
  if(/^gemini/i.test(id)) return 'google';
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
    const mig = migrateProviderId(rawPid);
    if(mig === null) return null; // purged provider entry dropped
    let providerId;
    if(mig) providerId = mig;
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
    if(migrateProviderId(id) === null) return null; // purged provider id dropped
    const cleanId = id.replace(':free','');
    const pid = inferSTTProviderId(id, '');
    if(pid === null) return null; // purged provider entry dropped
    return { id: cleanId, providerId: pid, enabled:true };
  }
  if(x && typeof x === 'object' && typeof x.id==='string' && x.id.trim()){
    const id=x.id.trim().replace(':free','');
    const explicit = (typeof x.providerId==='string' && x.providerId.trim())
      ? x.providerId.trim()
      : (typeof x.provider==='string' && x.provider.trim() ? x.provider.trim() : '');
    const pid = inferSTTProviderId(id, explicit || (x.id.includes(':free') ? 'openrouter' : ''));
    if(pid === null) return null; // purged provider entry dropped
    return { id, providerId: pid, enabled: x.enabled===false?false:true };
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

// ---- Ticket 39 (ref/storage): settings cache + normalize-on-write ----
// In-memory settings cache with a dirty flag. saveSettings is the only writer
// of settings keys (no direct localStorage writes to these keys outside this
// module), so write-through refresh keeps the cache exact. getSettings returns
// a FRESH COPY every time — callers mutate results (e.g. settingsModal spreads
// chains), so the cached object itself is never handed out.
// Write path normalizes fully; read path trusts a persisted version stamp
// (SETTINGS_STAMP_KEY, one-shot legacy migration E5) plus a cheap strict
// shape-check, and falls back to the full legacy normalize on mismatch —
// legacy/corrupt data self-heals exactly as before (ticket 24 contract:
// legacy `gemini` entries become `google`, `zenspark` entries are dropped).
const SETTINGS_CACHE_VERSION = 1;
const SETTINGS_STAMP_KEY = 'SETTINGS_NORM_V1';
let _settingsCache = null;
let _settingsDirty = true;

function cloneSettings(s){
  if(typeof structuredClone === 'function'){
    try{ return structuredClone(s); }catch{}
  }
  return {
    ...s,
    sttChain: s.sttChain.map(e => ({ ...e })),
    polishChain: s.polishChain.map(e => ({ ...e })),
    customProviders: s.customProviders.map(e => ({ ...e })),
  };
}

function hasKeyInSettings(s, pid){
  if(pid === 'groq') return !!s.groqKey;
  if(pid === 'google') return !!(s.googleKey || s.geminiKey);
  if(pid === 'openrouter') return !!s.openrouterKey;
  const c = s.customProviders.find(x => x.id === pid);
  return !!(c && c.key);
}

// Strict shape-check: accepts ONLY what normalize-on-write persists (exact keys,
// trimmed values, canonical providerIds, no ':free' residue, no legacy aliases).
// Anything else → null → full legacy normalize on read. Output on accept is built
// in canonical key order, byte-identical to the normalize path.
function verifyChainList(arr){
  if(!Array.isArray(arr) || !arr.length) return null;
  const seen = new Set(); const out = [];
  for(const x of arr){
    if(!x || typeof x !== 'object' || Array.isArray(x)) return null;
    const k = Object.keys(x);
    if(k.length !== 3 || !k.includes('id') || !k.includes('providerId') || !k.includes('enabled')) return null;
    if(typeof x.id !== 'string' || !x.id.trim() || x.id !== x.id.trim() || x.id.includes(':free')) return null;
    if(typeof x.providerId !== 'string' || !x.providerId.trim() || x.providerId !== x.providerId.trim()) return null;
    const pid = x.providerId;
    if(pid === 'gemini' || pid === 'zenspark') return null;
    if(x.enabled !== true && x.enabled !== false) return null;
    const key = `${pid}:${x.id}`;
    if(seen.has(key)) return null;
    seen.add(key);
    out.push({ id: x.id, providerId: pid, enabled: x.enabled });
  }
  return out;
}
function verifyCustomList(arr){
  if(!Array.isArray(arr)) return null;
  const seen = new Set(); const out = [];
  for(const x of arr){
    if(!x || typeof x !== 'object' || Array.isArray(x)) return null;
    const k = Object.keys(x);
    if(k.length !== 4 || !k.includes('id') || !k.includes('name') || !k.includes('baseURL') || !k.includes('key')) return null;
    if(typeof x.id !== 'string' || !x.id.trim() || x.id !== x.id.trim()) return null;
    if(typeof x.name !== 'string' || !x.name.trim() || x.name !== x.name.trim()) return null;
    if(typeof x.baseURL !== 'string' || x.baseURL !== x.baseURL.trim() || /\/$/.test(x.baseURL)) return null;
    if(typeof x.key !== 'string' || x.key !== x.key.trim()) return null;
    if(seen.has(x.id)) return null;
    seen.add(x.id);
    out.push({ id: x.id, name: x.name, baseURL: x.baseURL, key: x.key });
  }
  return out;
}
function tryVerifySettings(rawStt, rawPolish, rawCustoms){
  try{
    const sttChain = rawStt == null ? normalizeSTTChain(STT_DEFAULTS) : verifyChainList(JSON.parse(rawStt));
    if(!sttChain) return null;
    const polishChain = rawPolish == null ? POLISH_DEFAULTS.map(e => ({ ...e })) : verifyChainList(JSON.parse(rawPolish));
    if(!polishChain) return null;
    const customProviders = rawCustoms == null ? [] : verifyCustomList(JSON.parse(rawCustoms));
    if(!customProviders) return null;
    return { sttChain, polishChain, customProviders };
  }catch{ return null; }
}
function assembleSettings(sttChain, polishChain, customProviders){
  const peRaw = localStorage.getItem(KEYS.POLISH_ENABLED);
  const logColRaw = localStorage.getItem(KEYS.LOG_COLLAPSED);
  const repColRaw = localStorage.getItem(KEYS.REPORT_COLLAPSED);
  const googleKey = localStorage.getItem(KEYS.GEMINI) || '';
  return {
    groqKey: localStorage.getItem(KEYS.GROQ) || '',
    groqBaseURL: localStorage.getItem(KEYS.GROQ_BASE) || GROQ_BASE_DEFAULT,
    geminiKey: googleKey,
    googleKey,
    openrouterKey: localStorage.getItem(KEYS.OPENROUTER) || '',
    openrouterBaseURL: localStorage.getItem(KEYS.OPENROUTER_BASE) || OPENROUTER_BASE_DEFAULT,
    primary: localStorage.getItem(KEYS.PRIMARY) || 'groq',
    model: localStorage.getItem(KEYS.MODEL) || 'gemini-flash-latest',
    sttChain,
    polishChain,
    customProviders,
    polishEnabled: peRaw === null ? true : peRaw === '1',
    realtime: localStorage.getItem(KEYS.REALTIME) === '1',
    vad: localStorage.getItem(KEYS.VAD) !== '0',
    autocopy: localStorage.getItem(KEYS.AUTOCOPY) === '1',
    logCollapsed: logColRaw === null ? true : logColRaw === '1',
    reportCollapsed: repColRaw === null ? true : repColRaw === '1',
  };
}
function readSettingsFromStore(){
  const rawStt = localStorage.getItem(KEYS.STT_CHAIN);
  const rawPolish = localStorage.getItem(KEYS.POLISH_CHAIN);
  const rawCustoms = localStorage.getItem(KEYS.CUSTOM_PROVIDERS);
  const stamped = localStorage.getItem(SETTINGS_STAMP_KEY) === String(SETTINGS_CACHE_VERSION);
  const hasLegacyPrimaryModel = !rawStt && (localStorage.getItem(KEYS.PRIMARY) || localStorage.getItem(KEYS.MODEL));
  if(stamped && !hasLegacyPrimaryModel){
    const fast = tryVerifySettings(rawStt, rawPolish, rawCustoms);
    if(fast) return assembleSettings(fast.sttChain, fast.polishChain, fast.customProviders);
  }
  // Legacy full path (ticket 24 behavior, verbatim): normalize everything.
  let sttChain = parseSTTChain(rawStt, STT_DEFAULTS);
  let polishChain = parsePolishChain(rawPolish, POLISH_DEFAULTS);
  if(hasLegacyPrimaryModel){
    const p = localStorage.getItem(KEYS.PRIMARY) || 'groq';
    const m = localStorage.getItem(KEYS.MODEL) || 'gemini-flash-latest';
    const allowed = new Set([...STT_DEFAULTS, 'groq']);
    const set = new Set();
    if(p==='groq'){ set.add('groq'); if(allowed.has(m)) set.add(m); } else { if(allowed.has(m)) set.add(m); set.add('groq'); }
    for(const d of STT_DEFAULTS) set.add(d);
    sttChain = normalizeSTTChain([...set]);
  }
  const customProviders = parseCustomProviders(rawCustoms);
  // One-shot migration persist (E5): healed chains land next to the stamp so
  // later cold reads take the verify fast path. Best-effort: reads stay pure.
  try{
    if(rawStt == null ? hasLegacyPrimaryModel : rawStt !== JSON.stringify(sttChain))
      localStorage.setItem(KEYS.STT_CHAIN, JSON.stringify(sttChain));
    if(rawPolish != null && rawPolish !== JSON.stringify(polishChain))
      localStorage.setItem(KEYS.POLISH_CHAIN, JSON.stringify(polishChain));
    if(rawCustoms != null && rawCustoms !== JSON.stringify(customProviders))
      localStorage.setItem(KEYS.CUSTOM_PROVIDERS, JSON.stringify(customProviders));
    localStorage.setItem(SETTINGS_STAMP_KEY, String(SETTINGS_CACHE_VERSION));
  }catch{}
  return assembleSettings(sttChain, polishChain, customProviders);
}
function refreshSettingsCache(){
  _settingsCache = readSettingsFromStore();
  _settingsDirty = false;
}

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

// Wave personalization (ticket/50): stack model v3 under its own key. Never logs colors/keys.
export const WAVE_KEY = 'hamnegar.wave.v3';
export const WAVE_IDLE_KEY = 'hamnegar.wave.idle';
export const WAVE_TYPES = ['sine', 'mirror-sine', 'dash', 'steps', 'ribbon', 'flat-glow-line', 'bars'];
export const WAVE_COLOR_MODES = ['solid', 'gradient', 'rainbow'];
export const WAVE_BANDS = ['low', 'mid', 'high', 'rms'];
export const WAVE_PROFILES = ['flat', 'center', 'edges', 'bands'];
export const WAVE_PEAKS = ['low', 'mid', 'high'];
// T3/3 (ticket/53): bars EQ column options — shape/count/gap persist per wave.
export const WAVE_BAR_SHAPES = ['rounded', 'square', 'needle'];
export const WAVE_BAR_DEFAULTS = { shape: 'rounded', count: 24, gap: 2 };
export const DICT_KEY = 'hamnegar.dict.v1';
const DICT_MAX = 200;
const WAVE_MAX = 5;

function waveClampInt(v, lo, hi, fb) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fb;
  return Math.max(lo, Math.min(hi, Math.round(n)));
}
function wavePick(v, allowed, fb) {
  return allowed.includes(v) ? v : fb;
}
function waveColor(v, fb) {
  return typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v.trim()) ? v.trim().toLowerCase() : fb;
}
function waveOv(v) {
  if (v == null) return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.min(100, Math.round(n)));
}
function normalizeWaveEntry(x, idx) {
  if (!x || typeof x !== 'object') return null;
  const ov = (x.ov && typeof x.ov === 'object') ? x.ov : {};
  const name = typeof x.name === 'string' && x.name.trim()
    ? x.name.trim().slice(0, 24)
    : `موج ${idx + 1}`;
  return {
    id: typeof x.id === 'string' && x.id.trim() ? x.id.trim().slice(0, 32) : `w${idx + 1}`,
    name,
    type: wavePick(x.type, WAVE_TYPES, 'sine'),
    colorMode: wavePick(x.colorMode, WAVE_COLOR_MODES, 'solid'),
    c1: waveColor(x.c1, '#8ab4f8'),
    c2: waveColor(x.c2, '#c4b5fd'),
    opacity: waveClampInt(x.opacity, 0, 100, 100),
    glow: waveClampInt(x.glow, 0, 100, 70),
    thick: (() => { const n = Number(x.thick); return Number.isFinite(n) ? Math.max(1, Math.min(6, Math.round(n * 2) / 2)) : 2; })(),
    peaks: wavePick(x.peaks, WAVE_PEAKS, 'mid'),
    band: wavePick(x.band, WAVE_BANDS, 'rms'),
    profile: wavePick(x.profile, WAVE_PROFILES, 'flat'),
    mute: x.mute === true,
    // T3/3 bars EQ: old entries safely fall back to defaults (never wiped).
    barShape: wavePick(x.barShape, WAVE_BAR_SHAPES, WAVE_BAR_DEFAULTS.shape),
    barCount: waveClampInt(x.barCount, 8, 48, WAVE_BAR_DEFAULTS.count),
    barGap: waveClampInt(x.barGap, 0, 8, WAVE_BAR_DEFAULTS.gap),
    ov: {
      speed: waveOv(ov.speed),
      intensity: waveOv(ov.intensity),
      attack: waveOv(ov.attack),
      smooth: waveOv(ov.smooth),
      sensitivity: waveOv(ov.sensitivity),
    },
  };
}
function normalizeWaveList(arr) {
  if (!Array.isArray(arr)) return [];
  const out = [];
  const seen = new Set();
  arr.forEach((raw, i) => {
    if (out.length >= WAVE_MAX) return;
    const e = normalizeWaveEntry(raw, out.length);
    if (!e) return;
    let id = e.id;
    let k = 1;
    while (seen.has(id)) id = `${e.id}_${++k}`;
    e.id = id;
    seen.add(id);
    out.push(e);
  });
  return out;
}
export function defaultWaveConfig() {
  return {
    version: 3,
    starterId: 'classic-fade',
    sensitivity: 50,
    attack: 50,
    speed: 50,
    intensity: 50,
    smooth: 50,
    particles: 12,
    aurora: { on: false, hue: 220 },
    waves: [{
      id: 'w1', name: 'موج ۱', type: 'sine', colorMode: 'solid',
      c1: '#8ab4f8', c2: '#c4b5fd', opacity: 100, glow: 70, thick: 2,
      peaks: 'mid', band: 'rms', profile: 'flat', mute: false,
      barShape: 'rounded', barCount: 24, barGap: 2,
      ov: { speed: null, intensity: null, attack: null, smooth: null, sensitivity: null },
    }],
  };
}
function normalizeWaveConfig(raw) {
  const fb = defaultWaveConfig();
  const o = (raw && typeof raw === 'object') ? raw : {};
  const aur = (o.aurora && typeof o.aurora === 'object') ? o.aurora : {};
  const waves = normalizeWaveList(o.waves);
  return {
    version: 3,
    starterId: typeof o.starterId === 'string' && o.starterId.trim() ? o.starterId.trim().slice(0, 40) : fb.starterId,
    sensitivity: waveClampInt(o.sensitivity, 0, 100, fb.sensitivity),
    attack: waveClampInt(o.attack, 0, 100, fb.attack),
    speed: waveClampInt(o.speed, 0, 100, fb.speed),
    intensity: waveClampInt(o.intensity, 0, 100, fb.intensity),
    smooth: waveClampInt(o.smooth, 0, 100, fb.smooth),
    particles: waveClampInt(o.particles, 0, 24, fb.particles),
    aurora: {
      on: aur.on === true,
      hue: waveClampInt(aur.hue, 0, 360, fb.aurora.hue),
    },
    waves: waves.length ? waves : fb.waves,
  };
}
function normalizeDictEntry(x) {
  if (!x || typeof x !== 'object') return null;
  const from = typeof x.from === 'string' ? x.from.trim() : '';
  const to = typeof x.to === 'string' ? x.to.trim() : '';
  if (!from || !to) return null;
  if (from === to) return null;
  return { from, to, enabled: x.enabled === false ? false : true };
}
function normalizeDict(arr) {
  if (!Array.isArray(arr)) return [];
  const seen = new Set();
  const out = [];
  for (const raw of arr) {
    if (out.length >= DICT_MAX) break;
    const e = normalizeDictEntry(raw);
    if (!e) continue;
    if (seen.has(e.from)) continue;
    seen.add(e.from);
    out.push(e);
  }
  return out;
}
export const Storage = {
  getSettings() {
    if(!_settingsDirty && _settingsCache) return cloneSettings(_settingsCache);
    refreshSettingsCache();
    return cloneSettings(_settingsCache);
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
    if ('geminiKey' in patch) localStorage.setItem(KEYS.GEMINI, String(patch.geminiKey || '').trim());
    if ('googleKey' in patch) localStorage.setItem(KEYS.GEMINI, String(patch.googleKey || '').trim());
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
    // Ticket 39 write-through: chains/customs above were normalized on write.
    // Refresh the cache from the store, so the next getSettings is a zero-read
    // hit (single re-read on the rare write path; also stamps/heals any legacy
    // keys this patch did not touch).
    refreshSettingsCache();
  },
  getProviders() {
    // built-ins (key presence only — never leaks key values) + customs
    const s = Storage.getSettings();
    return [
      { id: 'groq', name: 'Groq', baseURL: s.groqBaseURL, hasKey: !!s.groqKey },
      { id: 'google', name: 'Google', baseURL: '', hasKey: !!(s.googleKey || s.geminiKey) },
      { id: 'openrouter', name: 'OpenRouter', baseURL: s.openrouterBaseURL, hasKey: !!s.openrouterKey },
      ...s.customProviders.map(c => ({ id: c.id, name: c.name || c.id, baseURL: c.baseURL || '', hasKey: !!c.key })),
    ];
  },
  hasKeyForProvider(providerId) {
    const pid = migrateProviderId(providerId);
    if(pid === null || !pid) return false;
    if(!_settingsDirty && _settingsCache) return hasKeyInSettings(_settingsCache, pid);
    // Cheap key-only fast path on a cold cache: 1–2 reads, no chain parsing.
    if(pid === 'groq') return !!localStorage.getItem(KEYS.GROQ);
    if(pid === 'google') return !!localStorage.getItem(KEYS.GEMINI);
    if(pid === 'openrouter') return !!localStorage.getItem(KEYS.OPENROUTER);
    const c = parseCustomProviders(localStorage.getItem(KEYS.CUSTOM_PROVIDERS)).find(x => x.id === pid);
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
  getWave() {
    try {
      const raw = localStorage.getItem(WAVE_KEY);
      if (!raw) return defaultWaveConfig();
      const parsed = JSON.parse(raw);
      const shape = (parsed && typeof parsed === 'object' && parsed.wave) ? parsed.wave : parsed;
      return normalizeWaveConfig(shape);
    } catch { return defaultWaveConfig(); }
  },
  saveWave(cfg) {
    const norm = normalizeWaveConfig(cfg);
    localStorage.setItem(WAVE_KEY, JSON.stringify({ wave: norm }));
    // Accept both bare {…v3…} and wrapped {wave:{…}} on read; always persist wrapped.
    return norm;
  },
  getWaveIdle() {
    const raw = localStorage.getItem(WAVE_IDLE_KEY);
    if (raw === null) return true;
    if (raw === '1') return true;
    if (raw === '0') return false;
    return true;
  },
  saveWaveIdle(v) {
    if (typeof v !== 'boolean') return Storage.getWaveIdle();
    localStorage.setItem(WAVE_IDLE_KEY, v ? '1' : '0');
    return v;
  },
  getDict() {
    try {
      const raw = localStorage.getItem(DICT_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return normalizeDict(parsed);
    } catch { return []; }
  },
  saveDict(arr) {
    const norm = normalizeDict(arr);
    localStorage.setItem(DICT_KEY, JSON.stringify(norm));
    return norm;
  },
  getPrefs() {
    const s = Storage.getSettings();
    return {
      version: SCHEMA_VERSION,
      prefs: {
        sttChain: s.sttChain,
        polishChain: s.polishChain,
        polishEnabled: s.polishEnabled,
        realtime: s.realtime,
        vad: s.vad,
        autocopy: s.autocopy,
        wave: Storage.getWave(),
        dict: Storage.getDict(),
      },
    };
  },
  exportPrefs() {
    return JSON.stringify(Storage.getPrefs());
  },
  importPrefs(json) {
    let parsed;
    try {
      parsed = JSON.parse(json);
    } catch {
      throw Object.assign(new Error('ورودی نامعتبر — JSON خراب است'), { status: 400 });
    }
    if (!parsed || typeof parsed !== 'object' || parsed.version !== SCHEMA_VERSION
      || !parsed.prefs || typeof parsed.prefs !== 'object') {
      throw Object.assign(new Error('نسخه طرح ناسازگار — version باید 1 باشد'), { status: 400 });
    }
    const p = parsed.prefs;
    let sttChain = Array.isArray(p.sttChain) ? normalizeSTTChain(p.sttChain) : [];
    if (!sttChain.length) sttChain = normalizeSTTChain(STT_DEFAULTS);
    let polishChain = Array.isArray(p.polishChain) ? normalizePolishChain(p.polishChain) : [];
    if (!polishChain.length) polishChain = POLISH_DEFAULTS.map(e => ({ ...e }));
    const patch = { sttChain, polishChain };
    for (const k of ['polishEnabled', 'realtime', 'vad', 'autocopy']) {
      if (typeof p[k] === 'boolean') patch[k] = p[k];
    }
    Storage.saveSettings(patch);
    if (p.wave !== undefined) Storage.saveWave(p.wave);
    if (Array.isArray(p.dict)) Storage.saveDict(p.dict);
    return Storage.getPrefs().prefs;
  },
  getSecretsMeta() {
    return {
      groq: Storage.hasKeyForProvider('groq'),
      google: Storage.hasKeyForProvider('google'),
      openrouter: Storage.hasKeyForProvider('openrouter'),
    };
  },
};
