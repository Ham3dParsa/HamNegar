// Entry: wires deep modules together. Keeps orchestration thin; all heavy work stays behind module interfaces.
import { Storage, STT_DEFAULTS, POLISH_DEFAULTS, GROQ_BASE_DEFAULT, OPENROUTER_BASE_DEFAULT, defaultWaveConfig, WAVE_TYPES } from './modules/storage.js';
import { createWaveRenderer, STARTERS, starterById, randomStack, WAVE_FA } from './modules/wave.js';
import { Logger } from './modules/logger.js';
import { Quota } from './modules/quota.js';
import { Dashboard } from './modules/dashboard.js';
import { Audio } from './modules/audio.js';
import { Realtime } from './modules/realtime.js';
import { Transcription } from './modules/transcription.js';
import { VERSION, BUILD } from './modules/version.js';

const $ = s => document.getElementById(s);
const els = {
  btnMic: $('btn-mic'), btnCopy: $('btn-copy'), btnClear: $('btn-clear'), btnSettings: $('btn-settings'),
  output: $('output'), statusText: $('status-text'), statusDot: $('status-dot'),
  modal: $('settings-modal'), keyGroq: $('key-groq'), keyGemini: $('key-gemini'), keyOpenrouter: $('key-openrouter'),
  groqBaseUrl: $('groq-base-url'), openrouterBaseUrl: $('openrouter-base-url'),
  toggleRealtime: $('toggle-realtime'), toggleVad: $('toggle-vad'), toggleAutocopy: $('toggle-autocopy'),
  togglePolish: $('toggle-polish'),
  sttChain: $('stt-chain'), polishChain: $('polish-chain'),
  engineBadge: $('engine-badge'), wave: $('wave'), fileWarn: $('file-warning'),
  logBody: $('log-body'), livePreview: $('live-preview'), liveFinal: $('live-final'), liveInterim: $('live-interim'), liveBadge: $('live-badge'),
  quotaGrid: $('quota-grid'), charCount: $('char-count'), wordCount: $('word-count'),
  logPanel: $('log-panel'), btnToggleLog: $('btn-toggle-log'),
  btnCancel: $('btn-cancel-stt'),
  btnGroqModels: $('btn-groq-models'), btnOrModels: $('btn-or-models'), btnGeminiModels: $('btn-gemini-models'),
  groqModelsList: $('groq-models-list'), orModelsList: $('or-models-list'), geminiModelsList: $('gemini-models-list'),
  tabProviders: $('tab-providers'), tabEasyadd: $('tab-easyadd'), tabChains: $('tab-chains'),
  panelProviders: $('panel-providers'), panelEasyadd: $('panel-easyadd'), panelChains: $('panel-chains'),
  tabWave: $('tab-wave'), panelWave: $('panel-wave'),
  customList: $('custom-providers-list'), customName: $('custom-name'), customBaseUrl: $('custom-base-url'), customKey: $('custom-key'),
  customModelsList: $('custom-models-list'),
  easyProvider: $('easy-provider-select'), easyModel: $('easy-model-select'), easyModelInput: $('easy-model-input'),
};

Logger.init({ logBodyEl: els.logBody, statusTextEl: els.statusText, statusDotEl: els.statusDot, toastEl: $('toast') });

// --- log filter/search UI lives in app.js (seam: logger stays 3-call log/setStatus/toast) ---
let currentFilter = 'all';
let searchQuery = '';
function passes(level, text) {
  if (currentFilter !== 'all' && level !== currentFilter) return false;
  if (searchQuery && !text.toLowerCase().includes(searchQuery.toLowerCase())) return false;
  return true;
}
function applyFilters() {
  if (!els.logBody) return;
  for (const el of els.logBody.children) {
    const lvl = el.dataset.level || 'info';
    const ok = passes(lvl, el.textContent);
    el.classList.toggle('hidden', !ok);
  }
}
function buildFilterUI() {
  const header = document.getElementById('log-header');
  if (!header || header.querySelector('.log-filters')) return;
  const filtersWrap = document.createElement('div');
  filtersWrap.className = 'log-filters';
  filtersWrap.setAttribute('role', 'group');
  filtersWrap.setAttribute('aria-label', 'فیلتر سطح لاگ');
  const levels = [
    ['all', 'همه'],
    ['info', 'info'],
    ['warn', 'warn'],
    ['error', 'error'],
    ['debug', 'debug'],
  ];
  for (const [lvl, label] of levels) {
    const btn = document.createElement('button');
    btn.className = 'log-filter' + (lvl === 'all' ? ' active' : '');
    btn.dataset.level = lvl;
    btn.textContent = label;
    btn.type = 'button';
    btn.addEventListener('click', () => {
      currentFilter = lvl;
      filtersWrap.querySelectorAll('.log-filter').forEach(b => b.classList.toggle('active', b.dataset.level === lvl));
      applyFilters();
    });
    filtersWrap.appendChild(btn);
  }
  const search = document.createElement('input');
  search.id = 'log-search';
  search.type = 'search';
  search.placeholder = 'جستجو…';
  search.setAttribute('aria-label', 'جستجو در لاگ');
  search.addEventListener('input', () => {
    searchQuery = search.value.trim();
    applyFilters();
  });
  let actionsDiv = header.querySelector('#log-actions');
  if (!actionsDiv) {
    const btns = header.querySelector('div');
    if (btns) { btns.id = 'log-actions'; actionsDiv = btns; }
  }
  header.insertBefore(search, actionsDiv);
  header.insertBefore(filtersWrap, search);
}
buildFilterUI();
const _origLog = Logger.log.bind(Logger);
let logReady = false; // flipped after initial collapsed state applies (guards TDZ on logCollapsed)
Logger.log = (level, msg, data) => {
  _origLog(level, msg, data);
  const el = els.logBody.lastElementChild;
  if (el && !passes(level, el.textContent)) el.classList.add('hidden');
  if (level === 'error' && logReady && els.logPanel?.classList.contains('collapsed')) {
    applyLogCollapsed(false);
    Logger.toast('خطای جدید — لاگ باز شد');
  }
};

if (location.protocol === 'file:') { els.fileWarn.style.display = 'block'; Logger.log('warn','file:// باز شده',location.href); }

// --- preference chains UI ---
const STT_LABELS = {
  'groq': { label: 'Groq Whisper', sub: 'سریع • whisper-large-v3' },
  'gemini-flash-latest': { label: 'gemini-flash-latest', sub: 'پیشنهادی' },
  'gemini-flash-lite-latest': { label: 'gemini-flash-lite-latest', sub: 'سهم بیشتر ✓' },
  'gemini-3.5-flash-lite': { label: 'gemini-3.5-flash-lite', sub: 'سهم بیشتر ✓' },
  'gemini-3.1-flash-lite': { label: 'gemini-3.1-flash-lite', sub: 'سهم بیشتر ✓' },
  'gemini-2.5-flash': { label: 'gemini-2.5-flash', sub: 'قدیمی' },
  'gemini-2.0-flash': { label: 'gemini-2.0-flash', sub: '' },
  'gemini-1.5-flash': { label: 'gemini-1.5-flash', sub: '' },
};
const POLISH_LABELS = {
  'qwen/qwen3-30b-a3b:free': { label: 'qwen/qwen3-30b', sub: 'Qwen سبک • رایگان' },
  'qwen/qwen3-32b:free': { label: 'qwen/qwen3-32b', sub: 'Qwen دقیق • رایگان' },
  'openai/gpt-oss-20b:free': { label: 'openai/gpt-oss-20b', sub: 'GPT-OSS • رایگان' },
  'qwen/qwen3.6-27b': { label: 'qwen/qwen3.6-27b', sub: 'Groq • 1K RPD' },
  'qwen/qwen3.8-27b': { label: 'qwen/qwen3.8-27b', sub: 'Groq • 1K RPD' },
  'openai/gpt-oss-20b': { label: 'openai/gpt-oss-20b', sub: 'Groq • 1K RPD' },
  'openai/gpt-oss-120b': { label: 'openai/gpt-oss-120b', sub: 'Groq • 1K RPD' },
  'openai/gpt-oss-safeguard-20b': { label: 'openai/gpt-oss-safeguard-20b', sub: 'Groq • 1K RPD' },
  'allam-2-7b': { label: 'allam-2-7b', sub: 'Groq • 7K RPD' },
};

let sttChainState = [];
let polishChainState = [];

// Canonical chain entry: {id, providerId, enabled}. Legacy `provider` alias + bare strings tolerated on read.
function providerIdOf(entry, fallback){
  if(entry && typeof entry === 'object'){
    if(typeof entry.providerId === 'string' && entry.providerId.trim()) return entry.providerId.trim();
    if(typeof entry.provider === 'string' && entry.provider.trim()) return entry.provider.trim();
  }
  const id = typeof entry === 'object' ? entry.id : entry;
  if(id === 'groq') return 'groq';
  if(typeof id === 'string' && /^gemini/i.test(id)) return 'gemini';
  if(typeof id === 'string' && id.includes(':free')) return 'openrouter';
  return fallback || 'groq';
}
function entryIdOf(entry){ return typeof entry === 'object' ? entry.id : entry; }
function hasKeyFor(entry){
  return Storage.hasKeyForProvider(providerIdOf(entry, 'gemini'));
}
function hasKeyForPolish(entry){
  return Storage.hasKeyForProvider(providerIdOf(entry, 'groq'));
}
function esc(s){ const d=document.createElement('div'); d.textContent=s; return d.innerHTML.replace(/"/g,'&quot;'); }

// --- chain/model a11y: single role=status live region + delete-with-undo (seam: ui behavior) ---
const liveEl = $('chain-live');
function announce(msg){
  if(!liveEl) return;
  const text = String(msg || '').slice(0, 200);
  liveEl.textContent = '';
  setTimeout(()=>{ liveEl.textContent = text; }, 30);
}
// Strip anything key-like before it reaches announcements/toasts/log-adjacent text.
function sanitizeMsg(msg){
  return String(msg ?? '')
    .replace(/gsk_[A-Za-z0-9_-]+/g, '[کلید حذف شد]')
    .replace(/sk-or-v1-[A-Za-z0-9_-]+/g, '[کلید حذف شد]')
    .replace(/sk-or-[A-Za-z0-9_-]+/g, '[کلید حذف شد]')
    .replace(/AIza[A-Za-z0-9_-]+/g, '[کلید حذف شد]')
    .replace(/AQ\.[A-Za-z0-9_.-]+/g, '[کلید حذف شد]')
    .replace(/Bearer\s+\S+/gi, 'Bearer [کلید حذف شد]')
    .slice(0, 120);
}
function labelOf(entry, type){
  const id = entryIdOf(entry);
  const meta = (type === 'stt' ? STT_LABELS[id] : POLISH_LABELS[id]) || { label: id };
  return meta.label;
}
// Sane focus after list mutations: next row, else previous, else section reset button.
function focusChainRow(type, idx, innerSelector){
  const container = type === 'stt' ? els.sttChain : els.polishChain;
  const rows = container?.querySelectorAll('.chain-item');
  if(!rows || !rows.length){
    (type === 'stt' ? $('btn-reset-stt') : $('btn-reset-polish'))?.focus?.();
    return;
  }
  const row = rows[Math.max(0, Math.min(idx, rows.length - 1))];
  const inner = innerSelector ? row.querySelector(innerSelector) : null;
  (inner || row).focus?.();
}
let lastDeleted = null; // {entry, index, type}
let undoTimer = null;
function hideUndoToast(){
  const t = $('toast');
  if(undoTimer){ clearTimeout(undoTimer); undoTimer = null; }
  if(!t) return;
  t.classList.remove('show');
  t.innerHTML = '';
}
function undoDelete(){
  if(!lastDeleted) return;
  const { entry, index, type } = lastDeleted;
  lastDeleted = null;
  hideUndoToast();
  const arr = type === 'stt' ? sttChainState : polishChainState;
  arr.splice(Math.min(index, arr.length), 0, entry);
  persistChains();
  renderAllChains();
  announce(`«${labelOf(entry, type)}» بازگردانده شد`);
  focusChainRow(type, Math.min(index, arr.length - 1));
}
function showUndoToast(label, ms = 8000){
  const t = $('toast');
  if(!t){ lastDeleted = null; return; }
  if(undoTimer){ clearTimeout(undoTimer); undoTimer = null; }
  t.innerHTML = '';
  const span = document.createElement('span');
  span.textContent = `«${label}» حذف شد`;
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'toast-undo';
  btn.textContent = 'واگرد';
  btn.setAttribute('aria-label', `بازگردانی «${label}»`);
  btn.addEventListener('click', undoDelete);
  t.append(span, btn);
  t.classList.add('show');
  undoTimer = setTimeout(()=>{ lastDeleted = null; hideUndoToast(); }, ms);
}

function renderChain(container, chain, type){
  if(!container) return;
  container.innerHTML='';
  const polishOff = type==='polish' && !els.togglePolish?.checked;
  chain.forEach((entry, idx)=>{
    const id = entryIdOf(entry);
    const providerId = providerIdOf(entry, type === 'stt' ? 'gemini' : 'groq');
    const enabled = typeof entry === 'object' ? entry.enabled!==false : true;
    const meta = (type==='stt' ? STT_LABELS[id] : POLISH_LABELS[id]) || {label:id, sub:''};
    const hasKey = Storage.hasKeyForProvider(providerId);
    const item = document.createElement('div');
    item.className = 'chain-item' + (hasKey?'':' missing') + (polishOff?' polish-off':'') + (!enabled?' polish-off':'');
    item.draggable = true;
    item.dataset.id = id;
    item.dataset.index = idx;
    item.setAttribute('role','listitem');
    item.setAttribute('aria-label', `${idx+1}. ${meta.label}`);
    item.tabIndex = 0; // keyboard reorder target: Ctrl+ArrowUp/Down
    const dotCls = hasKey ? 'ok' : 'missing';
    const switchLabel = `روشن یا خاموش کردن مدل ${meta.label}`;
    const toggleHtml = `<label class="chip chain-switch" style="padding:4px 8px;gap:4px"><input type="checkbox" role="switch" data-toggle ${enabled?'checked':''} aria-checked="${enabled?'true':'false'}" aria-label="${esc(switchLabel)}"><span style="font-size:11px">${enabled?'روشن':'خاموش'}</span></label>`;
    item.innerHTML = `
      <span class="drag-handle" title="بکش تا جابه‌جا شود" aria-hidden="true">⋮⋮</span>
      <span class="rank ${idx>0?'fallback':''}">${idx+1}</span>
      <span class="dot ${dotCls}" title="${esc(providerId)}"></span>
      <div style="flex:1;min-width:0;display:flex;flex-direction:column;gap:1px">
        <span class="chain-label" style="font-size:13px">${esc(meta.label)}</span>
        ${meta.sub?`<span style="font-size:11px;color:var(--muted)">${esc(meta.sub)}</span>`:''}
      </div>
      <span class="chain-badge" style="font-size:10px">${esc(providerId)}</span>
      ${toggleHtml}
      <span class="chain-badge ${hasKey?'ok':'missing'}">${hasKey?'✓ کلید':'⚠ بی‌کلید'}</span>
      <div class="chain-actions">
        <button type="button" class="chain-btn" data-up aria-label="انتقال ${esc(meta.label)} به بالا" ${idx===0?'disabled':''}>▲</button>
        <button type="button" class="chain-btn" data-down aria-label="انتقال ${esc(meta.label)} به پایین" ${idx===chain.length-1?'disabled':''}>▼</button>
        <button type="button" class="chain-btn" data-remove aria-label="حذف مدل ${esc(meta.label)}" title="حذف">✕</button>
      </div>
    `;
    // toggle per-model (both chains) — single path: canonical {id, providerId, enabled}
    item.querySelector('[data-toggle]')?.addEventListener('change', (e)=>{
      const arr = type==='stt'? sttChainState : polishChainState;
      if(typeof arr[idx]==='string') arr[idx]={id:arr[idx], providerId: providerIdOf(arr[idx], type==='stt'?'gemini':'groq'), enabled:e.target.checked};
      else { arr[idx].providerId = providerIdOf(arr[idx], type==='stt'?'gemini':'groq'); arr[idx].enabled = e.target.checked; }
      persistChains();
      renderAllChains();
      announce(`مدل ${meta.label} ${e.target.checked?'روشن':'خاموش'} شد`);
      focusChainRow(type, idx, '[data-toggle]');
    });
    item.querySelector('[data-remove]')?.addEventListener('click', ()=>{
      const arr = type==='stt'? sttChainState : polishChainState;
      const [removed] = arr.splice(idx,1);
      lastDeleted = { entry: removed, index: idx, type };
      persistChains();
      renderAllChains();
      announce(`مدل ${meta.label} حذف شد — برای بازگردانی «واگرد» را بزن`);
      showUndoToast(meta.label);
      focusChainRow(type, idx);
    });
    // up/down
    item.querySelector('[data-up]')?.addEventListener('click', ()=> moveChain(type, idx, -1));
    item.querySelector('[data-down]')?.addEventListener('click', ()=> moveChain(type, idx, 1));
    // keyboard reorder: Ctrl+ArrowUp/Down on focused row (bubbles from inner controls too)
    item.addEventListener('keydown', (e)=>{
      if(e.ctrlKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')){
        e.preventDefault();
        moveChain(type, idx, e.key === 'ArrowUp' ? -1 : 1);
      }
    });
    // drag
    item.addEventListener('dragstart', e=>{
      item.classList.add('dragging');
      e.dataTransfer.effectAllowed='move';
      e.dataTransfer.setData('text/plain', idx);
    });
    item.addEventListener('dragend', ()=> item.classList.remove('dragging'));
    container.appendChild(item);
  });
  // dragover reordering
  container.ondragover = e=>{ e.preventDefault(); e.dataTransfer.dropEffect='move'; };
  container.ondrop = e=>{
    e.preventDefault();
    const from = parseInt(e.dataTransfer.getData('text/plain'),10);
    const target = e.target.closest('.chain-item');
    if(!target) return;
    const to = parseInt(target.dataset.index,10);
    if(isNaN(from)||isNaN(to)||from===to) return;
    const arr = type==='stt'? sttChainState : polishChainState;
    const [moved]=arr.splice(from,1);
    arr.splice(to,0,moved);
    renderAllChains();
    persistChains();
  };
}

function moveChain(type, idx, dir){
  const arr = type==='stt'? sttChainState : polishChainState;
  const n = idx+dir;
  if(n<0||n>=arr.length) return;
  [arr[idx], arr[n]] = [arr[n], arr[idx]];
  renderAllChains();
  persistChains();
  announce(`«${labelOf(arr[n], type)}» به جایگاه ${n+1} از ${arr.length} منتقل شد`);
  focusChainRow(type, n);
}

function renderAllChains(){
  renderChain(els.sttChain, sttChainState, 'stt');
  renderChain(els.polishChain, polishChainState, 'polish');
  const hint = document.getElementById('polish-disabled-hint');
  if(hint) hint.style.display = els.togglePolish?.checked ? 'none' : 'block';
}

function persistChains(){
  Storage.saveSettings({ sttChain: sttChainState, polishChain: polishChainState, polishEnabled: els.togglePolish.checked });
  updateBadge();
  Quota.render(els.quotaGrid, { period: Dashboard.getPeriod() });
  Dashboard.renderOverall();
}

// --- settings wiring ---
function updateBadge(){
  const s=Storage.getSettings();
  const raw = s.sttChain?.[0] || s.primary || 'groq';
  const firstId = typeof raw==='object' ? raw.id : raw;
  const label = firstId==='groq' ? 'Groq' : firstId;
  const pol = s.polishEnabled ? ' • پالیش روشن' : ' • پالیش خاموش';
  els.engineBadge.textContent = `موتور: ${label}${pol}`;
  els.engineBadge.style.opacity = hasKeyFor(raw) ? '1' : '0.6';
}
function validate(){
  const g=els.keyGroq.value.trim(), gm=els.keyGemini.value.trim(), or=els.keyOpenrouter?.value.trim()||'';
  const hg=$('hint-groq'), hgm=$('hint-gemini'), hor=$('hint-openrouter');
  hg.className='hint'+(g&&!g.startsWith('gsk_')?' err':'');
  hg.innerHTML=g&&!g.startsWith('gsk_')?'⚠️ Groq باید با gsk_ شروع شود':'با <code>gsk_</code> شروع می‌شود. از console.groq.com بگیر.';
  const ok=gm.startsWith('AQ.')||gm.startsWith('AIza');
  hgm.className='hint'+(gm&&!ok?' err':'');
  hgm.innerHTML=gm&&!ok?'⚠️ باید با AQ. یا AIza شروع شود':'کلید جدید با <code>AQ.</code> شروع می‌شود. از aistudio.google.com بگیر.';
  if(hor){
    const okOr = !or || or.startsWith('sk-or-');
    hor.className='hint'+(or&&!okOr?' err':'');
    hor.innerHTML= or&&!okOr ? '⚠️ معمولا با sk-or-v1- شروع می‌شود' : 'از openrouter.ai/keys بگیر. اگر خالی باشد پالیش با Groq انجام می‌شود.';
  }
  // validate BaseURLs https
  const hgBase=$('hint-groq'), horBase=$('hint-openrouter');
  // reuse hint area for base validation
  if(els.groqBaseUrl){
    const v=els.groqBaseUrl.value.trim();
    if(v){ try{ const u=new URL(v); if(u.protocol!=='https:') throw 0; els.groqBaseUrl.style.borderColor=''; }catch{ els.groqBaseUrl.style.borderColor='var(--danger)'; } } else els.groqBaseUrl.style.borderColor='';
  }
  if(els.openrouterBaseUrl){
    const v=els.openrouterBaseUrl.value.trim();
    if(v){ try{ const u=new URL(v); if(u.protocol!=='https:') throw 0; els.openrouterBaseUrl.style.borderColor=''; }catch{ els.openrouterBaseUrl.style.borderColor='var(--danger)'; } } else els.openrouterBaseUrl.style.borderColor='';
  }
  // re-render badges live + provider status pills (keys editable ONLY in providers tab)
  renderProvidersStatus();
  renderAllChains();
}
function renderProvidersStatus(){
  let providers = [];
  try{ providers = Storage.getProviders(); }catch{ return; }
  for(const p of providers){
    const dot = document.getElementById('dot-' + p.id);
    const pill = document.getElementById('pill-' + p.id);
    if(dot) dot.className = 'dot ' + (p.hasKey ? 'ok' : 'missing');
    if(pill){
      pill.className = 'chain-badge ' + (p.hasKey ? 'ok' : 'missing');
      pill.textContent = p.hasKey ? '✓ کلید' : '⚠ بی‌کلید';
    }
  }
}
function loadSettings(){
  const s=Storage.getSettings();
  els.keyGroq.value=s.groqKey; els.keyGemini.value=s.geminiKey; if(els.keyOpenrouter) els.keyOpenrouter.value=s.openrouterKey;
  if(els.groqBaseUrl) els.groqBaseUrl.value=s.groqBaseURL || GROQ_BASE_DEFAULT;
  if(els.openrouterBaseUrl) els.openrouterBaseUrl.value=s.openrouterBaseURL || OPENROUTER_BASE_DEFAULT;
  sttChainState=[...s.sttChain];
  polishChainState=s.polishChain.map(e=>({ ...e }));
  if(els.togglePolish) els.togglePolish.checked=s.polishEnabled;
  els.toggleRealtime.checked=s.realtime; els.toggleVad.checked=s.vad; els.toggleAutocopy.checked=s.autocopy;
  renderCustomProviders();
  buildEasyProviderOptions();
  renderAllChains();
  updateBadge(); validate(); Dashboard.ensureReportUI(); Quota.render(els.quotaGrid, { period: Dashboard.getPeriod() }); Dashboard.renderOverall();
  if(!s.groqKey&&!s.geminiKey&&!s.openrouterKey){ openModal(); Logger.setStatus('کلید تنظیم نشده — ⚙️ را بزن','warn'); } else Logger.setStatus('آماده به کار','info');
}
function saveSettings(){
  try{
    Storage.saveSettings({
      groqKey: els.keyGroq.value,
      geminiKey: els.keyGemini.value,
      openrouterKey: els.keyOpenrouter?.value||'',
      groqBaseURL: els.groqBaseUrl?.value||'',
      openrouterBaseURL: els.openrouterBaseUrl?.value||'',
      realtime: els.toggleRealtime.checked,
      vad: els.toggleVad.checked,
      autocopy: els.toggleAutocopy.checked,
      sttChain: sttChainState,
      polishChain: polishChainState,
      polishEnabled: els.togglePolish?.checked ?? true,
    });
  }catch(e){
    Logger.log('error','saveSettings failed',{msg:e.message, field:e.field});
    Logger.toast(e.message || 'BaseURL نامعتبر');
    if(e.field==='groqBaseURL') els.groqBaseUrl.style.borderColor='var(--danger)';
    else if(e.field==='openrouterBaseURL') els.openrouterBaseUrl.style.borderColor='var(--danger)';
    else {
      if(els.groqBaseUrl) els.groqBaseUrl.style.borderColor='';
      if(els.openrouterBaseUrl) els.openrouterBaseUrl.style.borderColor='';
    }
    throw e;
  }
  updateBadge(); validate(); Quota.render(els.quotaGrid, { period: Dashboard.getPeriod() }); Dashboard.renderOverall();
}
els.keyGroq.addEventListener('input',validate); els.keyGemini.addEventListener('input',validate);
if(els.keyOpenrouter) els.keyOpenrouter.addEventListener('input',validate);
if(els.groqBaseUrl) els.groqBaseUrl.addEventListener('input',validate);
if(els.openrouterBaseUrl) els.openrouterBaseUrl.addEventListener('input',validate);
if(els.togglePolish) els.togglePolish.addEventListener('change', ()=>{ persistChains(); Logger.log('info', `پالیش ${els.togglePolish.checked?'روشن':'خاموش'}`); });

// --- settings tabs (providers | easy-add | chains) ---
function switchTab(name){
  const tabs = { providers: els.tabProviders, easyadd: els.tabEasyadd, chains: els.tabChains, wave: els.tabWave };
  const panels = { providers: els.panelProviders, easyadd: els.panelEasyadd, chains: els.panelChains, wave: els.panelWave };
  for(const k of Object.keys(tabs)){
    const active = k === name;
    tabs[k]?.classList.toggle('active', active);
    tabs[k]?.setAttribute('aria-selected', active ? 'true' : 'false');
    if(panels[k]) panels[k].hidden = !active;
  }
  if(name === 'wave'){ waveEnsure(); wavePrevStart(); } else { wavePrevStop(); waveFollowStop(); const hadMic = !!waveMicStream || !!waveMicCtx; waveMicStop(); if (hadMic) { waveSync(); } }
}
els.tabProviders?.addEventListener('click', ()=> switchTab('providers'));
els.tabEasyadd?.addEventListener('click', ()=> switchTab('easyadd'));
els.tabChains?.addEventListener('click', ()=> switchTab('chains'));
els.tabWave?.addEventListener('click', ()=> switchTab('wave'));

// --- provider model lists: single path via Transcription.listModels(providerId) ---
const modelCache = new Map(); // providerId -> string[]
function renderModelCodes(listEl, ids, providerId, target){
  listEl.style.display='block';
  listEl.innerHTML='';
  const isCustom = !['groq','gemini','openrouter'].includes(providerId);
  const filtered = (isCustom ? ids : ids.filter(id=> /qwen|gpt-oss|allam|llama|gemini|whisper/i.test(id))).slice(0,30);
  const title=document.createElement('b'); title.textContent=`مدل‌های یافت‌شده (${filtered.length}):`; listEl.appendChild(title); listEl.appendChild(document.createElement('br'));
  filtered.forEach(id=>{
    const code=document.createElement('code');
    code.style.cssText='display:inline-block;margin:2px;padding:2px 6px;background:var(--surface2);border:1px solid var(--border);border-radius:6px;cursor:pointer';
    code.textContent=id; // textContent: never inject model ids as HTML
    code.addEventListener('click', ()=> addModelToChain(id, providerId, target));
    listEl.appendChild(code);
  });
  const hint=document.createElement('div'); hint.style.marginTop='6px';
  const span=document.createElement('span'); span.className='hint-inline';
  span.textContent = target==='stt' ? 'کلیک روی مدل → به زنجیره STT اضافه می‌شود' : 'کلیک روی مدل → به زنجیره پالیش اضافه می‌شود';
  hint.appendChild(span); listEl.appendChild(hint);
}
function addModelToChain(modelId, providerId, target){
  const mid = String(modelId||'').trim();
  const pid = String(providerId||'').trim();
  if(!mid || !pid) return;
  if(target==='stt'){
    if(sttChainState.some(x=> entryIdOf(x)===mid && providerIdOf(x,'gemini')===pid)){ Logger.toast('قبلاً هست'); return; }
    sttChainState.push({ id:mid, providerId:pid, enabled:true });
  } else {
    if(polishChainState.some(x=> entryIdOf(x)===mid && providerIdOf(x,'groq')===pid)){ Logger.toast('قبلاً هست'); return; }
    polishChainState.push({ id:mid, providerId:pid, enabled:true });
  }
  persistChains(); renderAllChains();
  const list = target === 'stt' ? sttChainState : polishChainState;
  announce(`مدل ${mid} در جایگاه ${list.length} از ${list.length} به زنجیره ${target==='stt'?'STT':'پالیش'} اضافه شد`);
  Logger.toast('افزوده شد');
}
async function fetchAndShowModels(providerId, target){
  const btn = providerId==='groq' ? els.btnGroqModels : providerId==='gemini' ? els.btnGeminiModels : els.btnOrModels;
  const listEl = providerId==='groq' ? els.groqModelsList : providerId==='gemini' ? els.geminiModelsList : els.orModelsList;
  if(btn) btn.textContent='...';
  try{
    saveSettings();
    const ids = await Transcription.listModels(providerId);
    modelCache.set(providerId, ids);
    if(listEl) renderModelCodes(listEl, ids, providerId, 'polish');
    refreshEasyModels(false);
    Logger.toast(`مدل‌ها: ${ids.length}`);
    announce(`${ids.length} مدل برای ${providerId} بارگذاری شد`);
  }catch(e){ const safe = sanitizeMsg(e.message || e) || 'خطای ناشناخته'; Logger.toast(safe.slice(0,80)); announce(`خطا در بارگذاری مدل‌ها: ${safe}`); if(listEl){ listEl.style.display='block'; listEl.textContent='خطا: '+safe; } }
  finally{ if(btn) btn.textContent='لیست مدل‌ها'; }
}
els.btnGroqModels?.addEventListener('click', ()=> fetchAndShowModels('groq', 'polish'));
els.btnGeminiModels?.addEventListener('click', ()=> fetchAndShowModels('gemini', 'polish'));
els.btnOrModels?.addEventListener('click', ()=> fetchAndShowModels('openrouter', 'polish'));

// --- custom providers (providers tab only) ---
function slugifyCustomId(name){
  const base = String(name||'').trim().toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'');
  return 'custom-' + (base || 'provider');
}
function renderCustomProviders(){
  const box = els.customList;
  if(!box) return;
  box.innerHTML='';
  const s = Storage.getSettings();
  for(const c of (s.customProviders || [])){
    const card = document.createElement('details');
    card.className = 'provider-card';
    const head = document.createElement('summary');
    head.className = 'provider-head';
    const dot = document.createElement('span');
    dot.className = 'dot ' + (c.key ? 'ok' : 'missing');
    const name = document.createElement('b');
    name.textContent = c.name || c.id; // textContent: custom names never as HTML
    const pill = document.createElement('span');
    pill.className = 'chain-badge ' + (c.key ? 'ok' : 'missing');
    pill.textContent = c.key ? '✓ کلید' : '⚠ بی‌کلید';
    const spacer = document.createElement('span');
    spacer.style.flex = '1';
    const base = document.createElement('span');
    base.className = 'hint-inline';
    base.textContent = c.baseURL || '';
    base.dir = 'ltr';
    const rm = document.createElement('button');
    rm.type = 'button'; rm.className = 'btn-ghost btn-sm'; rm.textContent = 'حذف';
    rm.setAttribute('aria-label', 'حذف ارائه‌دهنده سفارشی');
    rm.addEventListener('click', (e)=>{
      e.preventDefault();
      const cur = Storage.getSettings().customProviders.filter(x=> x.id !== c.id);
      Storage.saveSettings({ customProviders: cur });
      // drop chain entries pointing at removed provider
      sttChainState = sttChainState.filter(x=> providerIdOf(x,'') !== c.id);
      polishChainState = polishChainState.filter(x=> providerIdOf(x,'') !== c.id);
      persistChains(); renderCustomProviders(); buildEasyProviderOptions(); renderAllChains();
      Logger.toast('حذف شد');
    });
    head.append(dot, name, pill, spacer, base, rm);
    const body = document.createElement('div');
    body.className = 'provider-body';
    const keyLabel = document.createElement('span');
    keyLabel.className = 'hint-inline';
    keyLabel.textContent = 'کلید در فرم افزودن ویرایش می‌شود — اینجا فقط نمایشی است.';
    body.appendChild(keyLabel);
    card.append(head, body);
    box.appendChild(card);
  }
  syncCustomModelsBtn();
}
function syncCustomModelsBtn(){
  const btn = $('btn-custom-models');
  if(!btn) return;
  const name = els.customName?.value.trim() || '';
  try{
    btn.disabled = !Storage.getSettings().customProviders.some(x => x.name === name || x.id === slugifyCustomId(name));
  }catch{ btn.disabled = true; }
}
els.customName?.addEventListener('input', syncCustomModelsBtn);
$('btn-custom-add')?.addEventListener('click', ()=>{
  const name = els.customName?.value.trim() || '';
  const baseURL = els.customBaseUrl?.value.trim() || '';
  const key = els.customKey?.value || '';
  if(!name){ Logger.toast('نام لازم است'); return; }
  if(!baseURL){ Logger.toast('BaseURL لازم است'); return; }
  const cur = Storage.getSettings().customProviders.slice();
  const id = slugifyCustomId(name);
  if(cur.some(x=> x.id === id)){ Logger.toast('قبلاً هست'); return; }
  try{
    Storage.saveSettings({ customProviders: [...cur, { id, name, baseURL, key }] });
  }catch(e){ Logger.toast(e.message || 'BaseURL نامعتبر'); return; }
  els.customName.value=''; els.customBaseUrl.value=''; els.customKey.value='';
  renderCustomProviders(); buildEasyProviderOptions(); renderProvidersStatus();
  Logger.toast('ارائه‌دهنده اضافه شد');
});
$('btn-custom-test')?.addEventListener('click', async ()=>{
  const name = els.customName?.value.trim() || '';
  const baseURL = els.customBaseUrl?.value.trim() || '';
  const key = els.customKey?.value || '';
  if(!baseURL || !key){ Logger.toast('BaseURL و کلید لازم است'); return; }
  Logger.setStatus('تست ارائه‌دهنده سفارشی...','warn');
  try{
    // Route through Transcription seam so untrusted custom hosts hit the user-confirm gate.
    const cur = Storage.getSettings().customProviders.slice();
    let stored = name ? cur.find(x => x.name === name || x.id === slugifyCustomId(name)) : undefined;
    let id;
    if(stored){
      id = stored.id;
      Storage.saveSettings({ customProviders: cur.map(x => x.id === id ? { ...x, baseURL, key } : x) });
    }else{
      if(!name){ Logger.toast('اول ارائه‌دهنده را اضافه کن'); return; }
      id = slugifyCustomId(name);
      try{
        Storage.saveSettings({ customProviders: [...cur, { id, name, baseURL, key }] });
      }catch(e){ Logger.setStatus('❌ سفارشی: '+sanitizeMsg(e.message || e),'error'); return; }
      renderCustomProviders(); buildEasyProviderOptions(); renderProvidersStatus();
    }
    await Transcription.listModels(id);
    Logger.setStatus('✅ ارائه‌دهنده سفارشی اوکی','info'); Logger.toast('ok');
  }catch(e){ Logger.setStatus('❌ سفارشی: '+sanitizeMsg(e.message || e),'error'); }
});
$('btn-custom-models')?.addEventListener('click', async ()=>{
  const name = els.customName?.value.trim() || '';
  const stored = Storage.getSettings().customProviders.find(x => x.name === name || x.id === slugifyCustomId(name));
  if(!stored){ Logger.toast('اول ارائه‌دهنده را اضافه کن'); return; }
  const baseURL = els.customBaseUrl?.value.trim() || stored.baseURL || '';
  const key = els.customKey?.value || stored.key || '';
  const listEl = els.customModelsList;
  if(!baseURL || !key){ Logger.toast('BaseURL و کلید لازم است'); return; }
  try{
    // Route through Transcription seam so untrusted custom hosts hit the user-confirm gate.
    // Sync form values into the stored provider so listModels uses what the user sees.
    const cur = Storage.getSettings().customProviders.slice();
    Storage.saveSettings({ customProviders: cur.map(x => x.id === stored.id ? { ...x, baseURL, key } : x) });
    const ids = await Transcription.listModels(stored.id);
    if(listEl) renderModelCodes(listEl, ids, stored.id, 'polish');
    Logger.toast(`مدل‌ها: ${ids.length}`);
    announce(`${ids.length} مدل بارگذاری شد`);
  }catch(e){ const safe = sanitizeMsg(e.message || e) || 'خطای ناشناخته'; Logger.toast(safe.slice(0,80)); announce(`خطا در بارگذاری مدل‌ها: ${safe}`); if(listEl){ listEl.style.display='block'; listEl.textContent='خطا: '+safe; } }
});

// --- easy-add tab: provider select → model select (listModels cache) → target → Add ---
function buildEasyProviderOptions(){
  const sel = els.easyProvider;
  if(!sel) return;
  const prev = sel.value;
  sel.innerHTML='';
  let providers = [];
  try{ providers = Storage.getProviders(); }catch{ providers = []; }
  for(const p of providers){
    const opt = document.createElement('option');
    opt.value = p.id;
    opt.textContent = `${p.name} — ${p.hasKey ? '✓ کلید' : '⚠ بی‌کلید'}`;
    sel.appendChild(opt);
  }
  if(prev && [...sel.options].some(o=> o.value===prev)) sel.value = prev;
  refreshEasyModels(false);
}
function refreshEasyModels(fetchIfMissing){
  const sel = els.easyModel, provSel = els.easyProvider;
  if(!sel || !provSel) return;
  const pid = provSel.value;
  const free = els.easyModelInput;
  const cached = modelCache.get(pid);
  const showFree = pid === 'gemini' && !(cached && cached.length);
  if(sel) sel.style.display = showFree ? 'none' : '';
  if(free){ free.style.display = showFree ? '' : 'none'; if(!showFree) free.value=''; }
  if(sel) sel.innerHTML='';
  if(!pid){ const o=document.createElement('option'); o.value=''; o.textContent='— اول ارائه‌دهنده را انتخاب کن —'; sel.appendChild(o); return; }
  if(!cached){
    const o=document.createElement('option'); o.value=''; o.textContent='— «تازه‌سازی مدل‌ها» را بزن —'; sel.appendChild(o);
    if(fetchIfMissing) loadEasyModels(pid);
    return;
  }
  if(!cached.length){ const o=document.createElement('option'); o.value=''; o.textContent='— مدلی یافت نشد —'; sel.appendChild(o); return; }
  for(const id of cached){
    const o=document.createElement('option'); o.value=id; o.textContent=id; sel.appendChild(o);
  }
}
async function loadEasyModels(providerId){
  if(!providerId) return;
  const btn = $('btn-easy-refresh');
  if(btn) btn.textContent='...';
  try{
    saveSettings();
    const ids = await Transcription.listModels(providerId);
    modelCache.set(providerId, ids);
    refreshEasyModels(false);
    Logger.toast(`مدل‌ها: ${ids.length}`);
    announce(`${ids.length} مدل برای ${providerId} بارگذاری شد`);
  }catch(e){ const safe = sanitizeMsg(e.message || e) || 'خطای ناشناخته'; refreshEasyModels(false); Logger.toast(safe.slice(0,80)); announce(`خطا در بارگذاری مدل‌ها: ${safe}`); }
  finally{ if(btn) btn.textContent='تازه‌سازی مدل‌ها'; }
}
els.easyProvider?.addEventListener('change', ()=> refreshEasyModels(true));
$('btn-easy-refresh')?.addEventListener('click', ()=> loadEasyModels(els.easyProvider?.value));
$('btn-easy-add')?.addEventListener('click', ()=>{
  const pid = els.easyProvider?.value || '';
  const mid = (els.easyModel?.style.display !== 'none' ? (els.easyModel?.value || '') : (els.easyModelInput?.value || '')).trim();
  if(!pid){ Logger.toast('ارائه‌دهنده را انتخاب کن'); return; }
  if(!mid){ Logger.toast('مدل را انتخاب کن'); return; }
  const target = document.querySelector('input[name="easy-target"]:checked')?.value || 'stt';
  if(pid === 'gemini' && !/^gemini/i.test(mid)){ Logger.toast('مدل نامعتبر برای STT'); return; }
  if(target === 'stt'){
    const okStt = pid === 'groq' || /^gemini/i.test(mid) || Object.prototype.hasOwnProperty.call(STT_LABELS, mid);
    if(!okStt){ Logger.toast('مدل نامعتبر برای STT'); return; }
  }
  if(!Storage.hasKeyForProvider(pid)){ Logger.toast('⚠ این ارائه‌دهنده کلید ندارد'); return; }
  addModelToChain(mid, pid, target);
});
$('btn-polish-all-on')?.addEventListener('click', ()=>{ polishChainState.forEach(e=> e.enabled=true); persistChains(); renderAllChains(); Logger.toast('همه روشن'); });
$('btn-polish-all-off')?.addEventListener('click', ()=>{ polishChainState.forEach(e=> e.enabled=false); persistChains(); renderAllChains(); Logger.toast('همه خاموش'); });
$('btn-stt-all-on')?.addEventListener('click', ()=>{ sttChainState = sttChainState.map(e=> typeof e==='string'?{id:e,providerId:providerIdOf(e,'gemini'),enabled:true}:e); sttChainState.forEach(e=> e.enabled=true); persistChains(); renderAllChains(); Logger.toast('همه STT روشن'); });
$('btn-stt-all-off')?.addEventListener('click', ()=>{ sttChainState = sttChainState.map(e=> typeof e==='string'?{id:e,providerId:providerIdOf(e,'gemini'),enabled:false}:e); sttChainState.forEach(e=> e.enabled=false); persistChains(); renderAllChains(); Logger.toast('همه STT خاموش'); });

// --- wave tab (ticket/50; seam: Storage.getWave/saveWave + wave renderer; main rec strip shares the stack via mainWaveSync) ---
let waveCfg = Storage.getWave();
let waveRenderer = null, waveInit = false, waveFakeOn = true;
let waveMicStream = null, waveMicCtx = null, waveMicAnalyser = null, waveFollowTimer = null;
let waveOpenIds = new Set(waveCfg.waves.length ? [waveCfg.waves[0].id] : []);
let waveAdvIds = new Set();
function waveName(wv, idx){ const n = (wv.name || '').trim(); return n || `موج ${idx + 1}`; }
function wavePersist(){ waveCfg = Storage.saveWave(waveCfg); waveRenderer?.setConfig(waveCfg); waveSync(); }
function waveSeg(box, vals, cur, faMap, cb){
  box.innerHTML = '';
  vals.forEach(v => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = faMap ? faMap[v] : v;
    b.className = v === cur ? 'active' : '';
    b.addEventListener('click', e => { e.preventDefault(); cb(v); });
    box.appendChild(b);
  });
}
function waveOvRow(wv, key, label){
  const wrap = document.createElement('div');
  wrap.className = 'wave-ov';
  const head = document.createElement('div');
  head.className = 'wave-ov-head';
  const sp = document.createElement('span'); sp.textContent = label;
  const bb = document.createElement('b');
  const rs = document.createElement('button'); rs.type = 'button'; rs.textContent = '↩ سراسری'; rs.title = 'بازگشت به سراسری';
  const paint = () => {
    const v = wv.ov[key], gv = waveCfg[key];
    if (v == null) { bb.textContent = `همگام با سراسری (${gv}٪)`; rs.disabled = true; }
    else { bb.textContent = `دستی ${v}٪ (سراسری ${gv}٪)`; rs.disabled = false; }
  };
  head.append(sp, bb, rs);
  const rg = document.createElement('input');
  rg.type = 'range'; rg.min = '-1'; rg.max = '100'; rg.step = '1';
  rg.value = wv.ov[key] == null ? -1 : wv.ov[key];
  rg.setAttribute('aria-label', label);
  rg.title = '-۱ = سراسری';
  rg.addEventListener('input', () => { const v = +rg.value; wv.ov[key] = v < 0 ? null : v; paint(); wavePersist(); });
  rs.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); wv.ov[key] = null; rg.value = -1; paint(); wavePersist(); });
  paint();
  wrap.append(head, rg);
  return wrap;
}
function waveApplyStarter(id, applyAurora){
  const st = starterById(id);
  waveCfg.starterId = id;
  waveCfg.waves = st.stack();
  waveCfg.waves.forEach((w, i) => { if (!(w.name || '').trim()) w.name = `موج ${i + 1}`; });
  if (applyAurora && st.aurora !== undefined) waveCfg.aurora = { ...waveCfg.aurora, on: !!st.aurora };
  waveOpenIds = new Set(waveCfg.waves.length ? [waveCfg.waves[0].id] : []);
  waveAdvIds = new Set();
  wavePersist(); waveRenderList();
}
function waveRenderStarters(){
  const grid = $('wave-starters');
  if (!grid) return;
  grid.innerHTML = '';
  STARTERS.forEach((s, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'wave-card' + (s.id === waveCfg.starterId ? ' active' : '');
    const sw = document.createElement('span');
    sw.className = 'swatch';
    const preview = s.stack();
    sw.style.background = preview.length > 1
      ? `linear-gradient(90deg, ${preview[0].c1}, ${preview[1].c1})`
      : preview[0].c1;
    const t = document.createElement('b'); t.textContent = `${i + 1} — ${s.n}`;
    const d = document.createElement('span'); d.textContent = s.d;
    b.append(sw, t, d);
    b.addEventListener('click', () => waveApplyStarter(s.id, true));
    grid.appendChild(b);
  });
}
function waveRenderList(){
  const list = $('wave-list');
  if (!list) return;
  list.innerHTML = '';
  const alive = new Set(waveCfg.waves.map(w => w.id));
  [...waveOpenIds].forEach(id => { if (!alive.has(id)) waveOpenIds.delete(id); });
  [...waveAdvIds].forEach(id => { if (!alive.has(id)) waveAdvIds.delete(id); });
  waveCfg.waves.forEach((wv, idx) => {
    const row = document.createElement('div');
    row.className = 'wave-item' + (wv.mute ? ' muted' : '');
    const det = document.createElement('details');
    det.open = waveOpenIds.has(wv.id);
    det.addEventListener('toggle', () => { det.open ? waveOpenIds.add(wv.id) : waveOpenIds.delete(wv.id); });
    const sum = document.createElement('summary');
    const dot = document.createElement('span');
    dot.className = 'wave-dot';
    dot.style.background = wv.colorMode === 'rainbow' ? 'conic-gradient(red,orange,yellow,green,blue,violet,red)' : wv.c1;
    const title = document.createElement('span');
    title.className = 'wave-title' + (wv.mute ? ' dim' : '');
    const paintTitle = () => {
      title.textContent = `${waveName(wv, idx)} — ${WAVE_FA.types[wv.type]} · ${WAVE_FA.colorModes[wv.colorMode]} · ${WAVE_FA.profiles[wv.profile || 'flat']}${wv.mute ? ' · بی‌صدا' : ''}`;
      title.title = wv.mute ? 'بی‌صدا — برای فعال‌سازی روی 🔊 بزن' : 'برای تغییر نام کلیک کن یا ✎ را بزن';
    };
    paintTitle();
    const muteBtn = document.createElement('button');
    muteBtn.type = 'button'; muteBtn.className = 'wave-mute';
    const paintMute = () => {
      muteBtn.textContent = wv.mute ? '🔇' : '🔊';
      muteBtn.setAttribute('aria-pressed', String(!wv.mute));
      muteBtn.setAttribute('aria-label', (wv.mute ? 'فعال‌سازی ' : 'بی‌صدا کردن ') + waveName(wv, idx));
    };
    paintMute();
    muteBtn.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); wv.mute = !wv.mute; row.classList.toggle('muted', wv.mute); paintTitle(); title.classList.toggle('dim', !!wv.mute); paintMute(); wavePersist(); });
    const rn = document.createElement('button');
    rn.type = 'button'; rn.className = 'wave-rename'; rn.textContent = '✎'; rn.title = 'تغییر نام موج';
    rn.setAttribute('aria-label', 'تغییر نام ' + waveName(wv, idx));
    const startRename = e => {
      if (e) { e.preventDefault(); e.stopPropagation(); }
      if (sum.querySelector('.wave-name-input')) return;
      const inp = document.createElement('input');
      inp.className = 'wave-name-input'; inp.type = 'text'; inp.value = waveName(wv, idx); inp.maxLength = 24; inp.dir = 'auto';
      inp.setAttribute('aria-label', 'نام موج');
      title.style.display = 'none'; rn.style.display = 'none';
      sum.insertBefore(inp, tag);
      inp.focus(); inp.select();
      let done = false;
      const commit = ok => {
        if (done) return; done = true;
        if (ok) { wv.name = inp.value.trim().slice(0, 24) || ''; paintTitle(); wavePersist(); }
        inp.remove(); title.style.display = ''; rn.style.display = '';
      };
      inp.addEventListener('click', ev => ev.stopPropagation());
      inp.addEventListener('pointerdown', ev => ev.stopPropagation());
      inp.addEventListener('keydown', ev => { ev.stopPropagation(); if (ev.key === 'Enter') commit(true); else if (ev.key === 'Escape') commit(false); });
      inp.addEventListener('blur', () => commit(true));
    };
    title.addEventListener('click', startRename);
    rn.addEventListener('click', startRename);
    const tag = document.createElement('span');
    tag.className = 'wave-tag' + (idx === 0 ? ' front' : '');
    tag.textContent = idx === 0 ? 'بالا · رو/جلو' : (idx === waveCfg.waves.length - 1 ? 'پایین · پشت/زیر' : 'میانی');
    const tools = document.createElement('span');
    tools.className = 'wave-tools';
    const up = document.createElement('button'); up.type = 'button'; up.textContent = '↑'; up.title = 'انتقال به رو (جلوتر)'; up.disabled = idx === 0;
    up.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); [waveCfg.waves[idx - 1], waveCfg.waves[idx]] = [waveCfg.waves[idx], waveCfg.waves[idx - 1]]; wavePersist(); waveRenderList(); });
    const dn = document.createElement('button'); dn.type = 'button'; dn.textContent = '↓'; dn.title = 'انتقال به پشت (عقب‌تر)'; dn.disabled = idx === waveCfg.waves.length - 1;
    dn.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); [waveCfg.waves[idx + 1], waveCfg.waves[idx]] = [waveCfg.waves[idx], waveCfg.waves[idx + 1]]; wavePersist(); waveRenderList(); });
    const del = document.createElement('button'); del.type = 'button'; del.textContent = '✕'; del.title = 'حذف'; del.disabled = waveCfg.waves.length <= 1;
    del.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); waveOpenIds.delete(wv.id); waveAdvIds.delete(wv.id); waveCfg.waves.splice(idx, 1); wavePersist(); waveRenderList(); });
    tools.append(up, dn, del);
    sum.append(dot, title, rn, muteBtn, tag, tools);
    det.appendChild(sum);
    const body = document.createElement('div');
    body.className = 'wave-body';
    const rType = document.createElement('div');
    const tLab = document.createElement('div'); tLab.className = 'wave-ctrl-label'; tLab.textContent = 'نوع موج';
    const segT = document.createElement('div'); segT.className = 'wave-seg';
    waveSeg(segT, WAVE_TYPES, wv.type, WAVE_FA.types, v => { wv.type = v; wavePersist(); waveRenderList(); });
    rType.append(tLab, segT);
    body.appendChild(rType);
    const rCm = document.createElement('div');
    const cLab = document.createElement('div'); cLab.className = 'wave-ctrl-label'; cLab.textContent = 'حالت رنگ';
    const segC = document.createElement('div'); segC.className = 'wave-seg';
    waveSeg(segC, ['solid', 'gradient', 'rainbow'], wv.colorMode, WAVE_FA.colorModes, v => { wv.colorMode = v; dot.style.background = v === 'rainbow' ? 'conic-gradient(red,orange,yellow,green,blue,violet,red)' : wv.c1; wavePersist(); waveRenderList(); });
    rCm.append(cLab, segC);
    body.appendChild(rCm);
    const rCol = document.createElement('div'); rCol.className = 'wave-row-btns';
    const c1Lab = document.createElement('span'); c1Lab.className = 'wave-ctrl-label'; c1Lab.textContent = 'رنگ ۱';
    const c1 = document.createElement('input'); c1.type = 'color'; c1.value = wv.c1; c1.setAttribute('aria-label', 'رنگ ۱');
    c1.addEventListener('input', () => { wv.c1 = c1.value; dot.style.background = wv.colorMode === 'rainbow' ? dot.style.background : c1.value; wavePersist(); });
    rCol.append(c1Lab, c1);
    body.appendChild(rCol);
    [['opacity', 'شفافیت (مطلق هر موج)', 0, 100, '%'], ['glow', 'درخشش (مطلق هر موج)', 0, 100, '%'], ['thick', 'ضخامت (مطلق هر موج)', 1, 6, '']].forEach(([k, fa, mn, mx, u]) => {
      const wrap = document.createElement('div');
      const lab = document.createElement('div'); lab.className = 'wave-lab';
      const sp = document.createElement('span'); sp.textContent = fa;
      const bb = document.createElement('b'); bb.textContent = wv[k] + u;
      lab.append(sp, bb);
      const rg = document.createElement('input');
      rg.type = 'range'; rg.min = mn; rg.max = mx; rg.step = k === 'thick' ? '0.5' : '1'; rg.value = wv[k];
      rg.setAttribute('aria-label', fa);
      rg.addEventListener('input', () => { wv[k] = +rg.value; bb.textContent = wv[k] + u; wavePersist(); });
      wrap.append(lab, rg);
      body.appendChild(wrap);
    });
    const rPk = document.createElement('div');
    const pLab = document.createElement('div'); pLab.className = 'wave-ctrl-label'; pLab.textContent = 'تراکم قله‌ها';
    const segP = document.createElement('div'); segP.className = 'wave-seg';
    waveSeg(segP, ['low', 'mid', 'high'], wv.peaks, WAVE_FA.peaks, v => { wv.peaks = v; wavePersist(); waveRenderList(); });
    rPk.append(pLab, segP);
    body.appendChild(rPk);
    const adv = document.createElement('details');
    adv.className = 'wave-adv'; adv.open = waveAdvIds.has(wv.id);
    adv.addEventListener('toggle', () => { adv.open ? waveAdvIds.add(wv.id) : waveAdvIds.delete(wv.id); });
    const advSum = document.createElement('summary'); advSum.textContent = '⚙️ پیشرفته (باند، پروفایل، رونوشت‌ها، توقف دوم گرادیان)';
    adv.appendChild(advSum);
    if (wv.colorMode === 'gradient') {
      const rC2 = document.createElement('div'); rC2.className = 'wave-row-btns';
      const c2Lab = document.createElement('span'); c2Lab.className = 'wave-ctrl-label'; c2Lab.textContent = 'رنگ ۲ (توقف دوم گرادیان)';
      const c2 = document.createElement('input'); c2.type = 'color'; c2.value = wv.c2; c2.setAttribute('aria-label', 'رنگ ۲');
      c2.addEventListener('input', () => { wv.c2 = c2.value; wavePersist(); });
      rC2.append(c2Lab, c2);
      adv.appendChild(rC2);
    }
    const rBd = document.createElement('div');
    const bLab = document.createElement('div'); bLab.className = 'wave-ctrl-label'; bLab.textContent = 'محرک باند (کدام بخش صدا این موج را می‌راند)';
    const segB = document.createElement('div'); segB.className = 'wave-seg';
    waveSeg(segB, ['low', 'mid', 'high', 'rms'], wv.band, WAVE_FA.bands, v => { wv.band = v; wavePersist(); waveRenderList(); });
    rBd.append(bLab, segB);
    adv.appendChild(rBd);
    const rPf = document.createElement('div');
    const fLab = document.createElement('div'); fLab.className = 'wave-ctrl-label'; fLab.textContent = 'پروفایل دامنه (ضریب فضایی روی x)';
    const segF = document.createElement('div'); segF.className = 'wave-seg';
    waveSeg(segF, ['flat', 'center', 'edges', 'bands'], wv.profile || 'flat', WAVE_FA.profiles, v => { wv.profile = v; wavePersist(); waveRenderList(); });
    rPf.append(fLab, segF);
    adv.appendChild(rPf);
    const ovLab = document.createElement('div'); ovLab.className = 'wave-ctrl-label'; ovLab.textContent = 'رونوشت هر موج — ۱- = همگام با سراسری';
    adv.appendChild(ovLab);
    adv.appendChild(waveOvRow(wv, 'speed', 'سرعت این موج'));
    adv.appendChild(waveOvRow(wv, 'intensity', 'شدت این موج'));
    adv.appendChild(waveOvRow(wv, 'attack', 'سرعت پاسخ این موج (اتک)'));
    adv.appendChild(waveOvRow(wv, 'smooth', 'نرمی این موج (رهایی)'));
    adv.appendChild(waveOvRow(wv, 'sensitivity', 'حساسیت این موج (گین)'));
    body.appendChild(adv);
    det.appendChild(body);
    row.appendChild(det);
    list.appendChild(row);
  });
  const addBtn = $('wave-add');
  if (addBtn) addBtn.disabled = waveCfg.waves.length >= 5;
}
function waveSync(){
  waveRenderStarters();
  const set = (id, v) => { const el = $(id); if (el) el.value = v; };
  const txt = (id, v) => { const el = $(id); if (el) el.textContent = v; };
  set('wave-sens', waveCfg.sensitivity); set('wave-sens-mini', waveCfg.sensitivity);
  set('wave-spd', waveCfg.speed); set('wave-int', waveCfg.intensity);
  set('wave-atk', waveCfg.attack); set('wave-sm', waveCfg.smooth);
  set('wave-parts', waveCfg.particles); set('wave-aurora-hue', waveCfg.aurora.hue);
  const aur = $('wave-aurora'); if (aur) aur.checked = !!waveCfg.aurora.on;
  txt('wave-sens-val', waveCfg.sensitivity + '٪'); txt('wave-sens-mini-val', waveCfg.sensitivity + '٪');
  txt('wave-spd-val', waveCfg.speed + '٪'); txt('wave-int-val', waveCfg.intensity + '٪');
  txt('wave-atk-val', waveCfg.attack + '٪'); txt('wave-sm-val', waveCfg.smooth + '٪');
  txt('wave-parts-val', waveCfg.particles); txt('wave-aurora-hue-val', waveCfg.aurora.hue);
  txt('wave-count', waveCfg.waves.length + ' موج' + (waveCfg.waves.length >= 5 ? ' (سقف)' : ''));
  const nm = $('wave-name');
  if (nm) nm.textContent = `«${waveCfg.starterId === 'custom-dice' ? 'ترکیب تصادفی 🎲' : starterById(waveCfg.starterId).n}» — ${waveCfg.waves.length} موج`;
  const addBtn = $('wave-add');
  if (addBtn) addBtn.disabled = waveCfg.waves.length >= 5;
  const ft = $('wave-fake-toggle');
  if (ft) ft.textContent = waveFakeOn ? '⏺ مصنوعی: روشن' : '⏺ مصنوعی: خاموش';
  const mt = $('wave-mic-test');
  if (mt) mt.textContent = waveMicStream ? '⏹ توقف میکروفون' : '🎤 تست با صدای من';
}
function waveEnsure(){
  if (waveInit) { waveFollowStart(); waveSync(); return; }
  waveInit = true;
  const cv = $('wave-preview');
  waveRenderer = createWaveRenderer(cv);
  waveRenderer.setConfig(waveCfg);
  waveRenderer.setFakeEnabled(waveFakeOn);
  const bind = (id, key, isAurora) => {
    $(id)?.addEventListener('input', e => {
      if (isAurora === 'hue') waveCfg.aurora.hue = +e.target.value;
      else waveCfg[key] = +e.target.value;
      wavePersist();
    });
  };
  bind('wave-sens', 'sensitivity'); bind('wave-sens-mini', 'sensitivity');
  bind('wave-spd', 'speed'); bind('wave-int', 'intensity');
  bind('wave-atk', 'attack'); bind('wave-sm', 'smooth');
  bind('wave-parts', 'particles'); bind('wave-aurora-hue', null, 'hue');
  $('wave-aurora')?.addEventListener('change', e => { waveCfg.aurora.on = e.target.checked; wavePersist(); });
  $('wave-add')?.addEventListener('click', () => {
    if (waveCfg.waves.length >= 5) return;
    const pal = ['#8ab4f8', '#5eead4', '#c4b5fd', '#f6b17a', '#f9a8d4'];
    waveCfg.starterId = waveCfg.starterId || 'custom';
    waveCfg.waves.push({
      id: `w${Date.now().toString(36)}`, name: `موج ${waveCfg.waves.length + 1}`, type: 'sine',
      colorMode: 'solid', c1: pal[waveCfg.waves.length % pal.length], c2: '#c4b5fd',
      opacity: 100, glow: 70, thick: 2, peaks: 'mid', band: 'rms', profile: 'flat', mute: false,
      ov: { speed: null, intensity: null, attack: null, smooth: null, sensitivity: null },
    });
    waveOpenIds.add(waveCfg.waves[waveCfg.waves.length - 1].id);
    wavePersist(); waveRenderList();
  });
  $('wave-dice')?.addEventListener('click', () => {
    waveCfg.starterId = 'custom-dice';
    waveCfg.waves = randomStack();
    waveCfg.waves.forEach((w, i) => { w.name = `موج ${i + 1}`; });
    waveOpenIds = new Set(waveCfg.waves.length ? [waveCfg.waves[0].id] : []);
    waveAdvIds = new Set();
    wavePersist(); waveRenderList();
  });
  $('wave-reset')?.addEventListener('click', () => {
    const id = waveCfg.starterId && starterById(waveCfg.starterId) ? waveCfg.starterId : 'classic-fade';
    const fb = defaultWaveConfig();
    const keepWaves = starterById(id).stack();
    keepWaves.forEach((w, i) => { w.name = `موج ${i + 1}`; });
    waveCfg = { ...fb, starterId: id, waves: keepWaves };
    waveOpenIds = new Set(waveCfg.waves.length ? [waveCfg.waves[0].id] : []);
    waveAdvIds = new Set();
    wavePersist(); waveRenderList();
  });
  $('wave-fake-toggle')?.addEventListener('click', () => {
    waveFakeOn = !waveFakeOn;
    waveRenderer.setFakeEnabled(waveFakeOn);
    waveSync();
  });
  $('wave-mic-test')?.addEventListener('click', async () => {
    if (waveMicStream) { waveMicStop(); waveSync(); return; }
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('no-gum');
      waveMicStream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      waveMicCtx = waveMicCtx || new (window.AudioContext || window.webkitAudioContext)();
      if (waveMicCtx.state === 'suspended') await waveMicCtx.resume();
      const src = waveMicCtx.createMediaStreamSource(waveMicStream);
      waveMicAnalyser = waveMicCtx.createAnalyser();
      waveMicAnalyser.fftSize = 1024;
      src.connect(waveMicAnalyser);
      waveRenderer.setAnalyser(waveMicAnalyser);
      Logger.log('info', 'پیش‌نمایش موج: میکروفون وصل شد');
    } catch (err) {
      waveMicStop();
      Logger.toast('میکروفون باز نشد — همان سطح مصنوعی می‌ماند');
    }
    waveSync();
  });
  // Follow the main recorder's analyser when the preview has no temp mic (reuse, no new stream).
  // Single guarded instance: re-entry into waveEnsure must not accumulate timers.
  waveFollowStart();
  waveRenderList();
  waveSync();
}
function waveFollowStart(){
  if (waveFollowTimer != null) return;
  waveFollowTimer = setInterval(() => {
    if (!waveRenderer || waveMicStream) return;
    try {
      const an = Audio.getAnalyser();
      waveRenderer.setAnalyser(an || null);
    } catch {}
  }, 1000);
}
function waveFollowStop(){
  if (waveFollowTimer == null) return;
  clearInterval(waveFollowTimer);
  waveFollowTimer = null;
}
function waveMicStop(){
  waveMicStream?.getTracks().forEach(t => { try { t.stop(); } catch {} });
  waveMicStream = null;
  waveMicAnalyser = null;
  try { waveRenderer?.setAnalyser(Audio.getAnalyser() || null); } catch {}
  if (waveMicCtx) {
    const ctx = waveMicCtx;
    waveMicCtx = null;
    try {
      if (ctx.state !== 'closed') Promise.resolve(ctx.close()).catch(() => {});
    } catch {}
  }
}
function wavePrevStart(){ try { waveRenderer?.start(); } catch {} }
function wavePrevStop(){ try { waveRenderer?.stop(); } catch {} }

loadSettings();
// --- settings modal: focus trap + Esc closes without saving + focus returns to settings button ---
let lastModalFocus = null;
function modalFocusables(){
  const box = els.modal.querySelector('.modal-box');
  if(!box) return [];
  return [...box.querySelectorAll('button, [href], input, select, textarea, summary, [tabindex]:not([tabindex="-1"])')]
    .filter(el=> !el.disabled && el.getClientRects().length > 0);
}
function openModal(){
  lastModalFocus = document.activeElement;
  els.modal.style.display = 'flex';
  if(els.panelWave && !els.panelWave.hidden){ waveEnsure(); wavePrevStart(); }
  const box = els.modal.querySelector('.modal-box');
  if(box && !box.hasAttribute('tabindex')) box.setAttribute('tabindex', '-1');
  const f = modalFocusables();
  (f[0] || box)?.focus?.();
}
function closeModal(){
  els.modal.style.display = 'none';
  mainWaveSync(); // wave tab edits persist live; main strip picks them up here
  wavePrevStop();
  waveFollowStop();
  const hadMic = !!waveMicStream || !!waveMicCtx;
  waveMicStop();
  if (hadMic) { waveSync(); }
  if(lastModalFocus?.focus) lastModalFocus.focus();
  else els.btnSettings.focus();
}
els.modal.addEventListener('keydown', (e)=>{
  if(els.modal.style.display !== 'flex') return;
  if(e.key === 'Escape'){ e.preventDefault(); closeModal(); return; } // Esc: close WITHOUT saving
  if(e.key !== 'Tab') return;
  const f = modalFocusables();
  if(!f.length) return;
  const first = f[0], last = f[f.length - 1];
  if(e.shiftKey && document.activeElement === first){ e.preventDefault(); last.focus(); }
  else if(!e.shiftKey && document.activeElement === last){ e.preventDefault(); first.focus(); }
});
els.btnSettings.onclick=()=> openModal();
$('btn-close-modal').onclick=()=> closeModal();
$('btn-save-modal').onclick=()=>{ try{ saveSettings(); }catch(e){ Logger.log('error','saveSettings modal failed',{msg:e.message}); return; } closeModal(); Logger.setStatus('تنظیمات ذخیره شد','info'); Logger.toast('ذخیره شد'); };
$('btn-reset-stt')?.addEventListener('click', ()=>{ sttChainState=STT_DEFAULTS.map(id=>({id, providerId:providerIdOf(id,'gemini'), enabled:true})); renderAllChains(); persistChains(); Logger.toast('STT بازنشانی شد'); });
$('btn-reset-polish')?.addEventListener('click', ()=>{ polishChainState=POLISH_DEFAULTS.map(e=>({...e})); renderAllChains(); persistChains(); Logger.toast('پالیش بازنشانی شد'); });
els.modal.addEventListener('click',e=>{ if(e.target===els.modal) closeModal(); });
els.toggleRealtime.addEventListener('change',()=>{ Storage.saveSettings({realtime: els.toggleRealtime.checked}); Logger.log('info',`حالت آنی ${els.toggleRealtime.checked?'روشن':'خاموش'}`); });
els.toggleVad.addEventListener('change',()=> Storage.saveSettings({vad: els.toggleVad.checked}));
els.toggleAutocopy.addEventListener('change',()=> Storage.saveSettings({autocopy: els.toggleAutocopy.checked}));

// log panel toggle + manual splitter (not resize:vertical on flex)
$('btn-clear-log').onclick=()=> els.logBody.innerHTML='';
$('btn-copy-log').onclick=async()=>{
  const visible = [...els.logBody.children].filter(el=> !el.classList.contains('hidden'));
  const text = visible.map(e=>e.textContent).join('\n');
  if (!text) { Logger.toast('چیزی برای کپی نیست'); return; }
  await navigator.clipboard.writeText(text);
  Logger.toast(visible.length !== els.logBody.children.length ? `کپی ${visible.length} سطر فیلترشده` : 'کپی شد');
};
let logCollapsed = Storage.getSettings().logCollapsed;
function applyLogCollapsed(collapsed){
  logCollapsed=collapsed;
  els.logPanel.classList.toggle('collapsed', collapsed);
  els.btnToggleLog.textContent= collapsed ? 'نمایش' : 'بستن';
  const splitter=document.getElementById('log-splitter');
  if(splitter) splitter.style.display = collapsed ? 'none' : 'flex';
  Storage.saveSettings({ logCollapsed: collapsed });
}
applyLogCollapsed(logCollapsed);
logReady = true;
els.btnToggleLog.onclick=()=>{
  applyLogCollapsed(!logCollapsed);
  Logger.log('info', logCollapsed ? 'لاگ بسته شد' : 'لاگ باز شد');
};
document.getElementById('log-header')?.addEventListener('click', (e)=>{
  if(e.target.closest('button') || e.target.closest('input')) return;
  applyLogCollapsed(!logCollapsed);
});

// quota strip (ticket/51): collapsed slim head (today numbers + worst-provider dot); details toggle reveals grid/report
function setQuotaExpanded(v){
  const detail = $('quota-detail'), toggle = $('quota-toggle'), chev = $('quota-chev');
  if(!detail || !toggle) return;
  detail.hidden = !v;
  toggle.setAttribute('aria-expanded', String(v));
  if(chev) chev.textContent = v ? '▴' : '▾';
}
$('quota-toggle')?.addEventListener('click', ()=> setQuotaExpanded(!!$('quota-detail')?.hidden));
function refreshQuotaStrip(){
  const nums = $('quota-nums'), dot = $('quota-dot');
  if(!nums && !dot) return;
  let s = null;
  try{ s = Quota.getSummary('today'); }catch{ return; }
  if(!s) return;
  if(nums) nums.textContent = `${s.totals.count} درخواست • ${s.totals.words} کلمه`;
  if(dot){
    let worst = 0;
    for(const m of (s.byModel || [])){
      const r = m.color === 'danger' ? 3 : m.color === 'warn-orange' ? 2 : m.color === 'warn' ? 1 : 0;
      if(r > worst) worst = r;
    }
    dot.className = 'dot' + (worst >= 3 ? ' err' : worst >= 1 ? ' warn' : '');
  }
}
if(els.quotaGrid) new MutationObserver(()=> refreshQuotaStrip()).observe(els.quotaGrid, { childList: true });
refreshQuotaStrip();

// output draft + counters + heights
let selStart=0, selEnd=0; const saveCursor=()=>{ selStart=els.output.selectionStart; selEnd=els.output.selectionEnd; };
els.output.addEventListener('click',saveCursor); els.output.addEventListener('keyup',saveCursor); els.output.addEventListener('select',saveCursor);
const updateCounts=()=>{ els.charCount.textContent=els.output.value.length+' کاراکتر'; els.wordCount.textContent=(els.output.value.trim()?els.output.value.trim().split(/\s+/).length:0)+' کلمه'; autogrowOutput(); };
// transcript autogrow (ticket/51): grow with content, cap ~60vh, then internal scroll; native resize:vertical kept for manual override
function autogrowOutput(){
  if(!els.output) return;
  const cap = Math.round(window.innerHeight * 0.6);
  els.output.style.height = 'auto';
  els.output.style.height = Math.min(els.output.scrollHeight, cap) + 'px';
  els.output.style.overflowY = els.output.scrollHeight > cap + 1 ? 'auto' : 'hidden';
}
window.addEventListener('resize', ()=> autogrowOutput());
let draftTimer=null;
const editorHistory={stack:[], index:-1, max:50, pushing:false, push(v){ if(this.pushing) return; if(this.stack[this.index]===v) return; this.stack=this.stack.slice(0,this.index+1); this.stack.push(v); if(this.stack.length>this.max){ this.stack.shift(); } else { this.index++; } this.index=Math.min(this.index,this.stack.length-1); updateHistoryButtons(); }, undo(){ if(this.index<=0) return null; this.index--; updateHistoryButtons(); return this.stack[this.index]; }, redo(){ if(this.index>=this.stack.length-1) return null; this.index++; updateHistoryButtons(); return this.stack[this.index]; }, canUndo(){return this.index>0}, canRedo(){return this.index<this.stack.length-1}};
function updateHistoryButtons(){ const u=document.getElementById('btn-undo'), r=document.getElementById('btn-redo'); if(u) u.disabled=!editorHistory.canUndo(); if(r) r.disabled=!editorHistory.canRedo(); }
function applyHistoryValue(v){ editorHistory.pushing=true; els.output.value=v; saveCursor(); updateCounts(); Storage.saveDraft(v); editorHistory.pushing=false; updateHistoryButtons(); }
els.output.addEventListener('input',()=>{ saveCursor(); updateCounts(); if(!editorHistory.pushing) editorHistory.push(els.output.value); clearTimeout(draftTimer); draftTimer=setTimeout(()=> Storage.saveDraft(els.output.value),400); });
document.getElementById('btn-undo')?.addEventListener('click', ()=>{ const v=editorHistory.undo(); if(v!==null) applyHistoryValue(v); });
document.getElementById('btn-redo')?.addEventListener('click', ()=>{ const v=editorHistory.redo(); if(v!==null) applyHistoryValue(v); });
els.output.addEventListener('keydown', (e)=>{
  if(e.target!==els.output) return;
  if((e.ctrlKey||e.metaKey) && e.key.toLowerCase()==='z'){
    e.preventDefault();
    if(e.shiftKey){ const v=editorHistory.redo(); if(v!==null) applyHistoryValue(v); }
    else { const v=editorHistory.undo(); if(v!==null) applyHistoryValue(v); }
  } else if((e.ctrlKey||e.metaKey) && e.key.toLowerCase()==='y'){ e.preventDefault(); const v=editorHistory.redo(); if(v!==null) applyHistoryValue(v); }
});
(() => {
  const d=Storage.getDraft(); if(d){ els.output.value=d; updateCounts(); Logger.log('info','پیش‌نویس بارگذاری شد',{chars:d.length}); }
  editorHistory.push(els.output.value);
  updateHistoryButtons();
  const h=Storage.getHeights(); if(h.out) els.output.style.height=h.out; if(h.log) els.logPanel.style.height=h.log;
  let splitter = document.getElementById('log-splitter');
  if(!splitter){
    splitter = document.createElement('div');
    splitter.id = 'log-splitter';
    splitter.setAttribute('role','separator');
    splitter.setAttribute('aria-orientation','horizontal');
    splitter.setAttribute('aria-label','تغییر ارتفاع لاگ');
    splitter.title = 'بکش تا ارتفاع لاگ عوض شود — ذخیره خودکار';
    els.logPanel.after(splitter);
    applyLogCollapsed(logCollapsed);
  }
  let dragging=false, startY=0, startH=0;
  const clamp = v => Math.max(80, Math.min(v, Math.floor(window.innerHeight*0.55)));
  const onMove = (e)=>{
    if(!dragging) return;
    const y = e.touches ? e.touches[0].clientY : e.clientY;
    const delta = y - startY;
    const nh = clamp(startH + delta);
    els.logPanel.style.height = nh + 'px';
    e.preventDefault();
  };
  const onUp = ()=>{
    if(!dragging) return;
    dragging=false;
    splitter.classList.remove('dragging');
    document.body.style.cursor='';
    document.body.style.userSelect='';
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
    document.removeEventListener('touchmove', onMove);
    document.removeEventListener('touchend', onUp);
    Storage.saveHeights({log: els.logPanel.style.height});
  };
  const onDown = (e)=>{
    dragging=true;
    startY = e.touches ? e.touches[0].clientY : e.clientY;
    startH = els.logPanel.getBoundingClientRect().height;
    splitter.classList.add('dragging');
    document.body.style.cursor='ns-resize';
    document.body.style.userSelect='none';
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    document.addEventListener('touchmove', onMove, {passive:false});
    document.addEventListener('touchend', onUp);
    e.preventDefault();
  };
  splitter.addEventListener('mousedown', onDown);
  splitter.addEventListener('touchstart', onDown, {passive:false});
  if(window.ResizeObserver){
    const roOut=new ResizeObserver(()=>{ clearTimeout(roOut._t); roOut._t=setTimeout(()=> Storage.saveHeights({out: getComputedStyle(els.output).height}),300); }); roOut.observe(els.output);
  }
})();
els.output.addEventListener('dblclick', ()=>{
  saveCursor();
  els.output.style.height='auto';
  const nh=Math.min(els.output.scrollHeight, window.innerHeight*0.5)+'px';
  els.output.style.height=nh;
  Storage.saveHeights({ out: nh });
});
// grip drag = manual resize affordance (prototype v2); autogrow resumes on next input
(()=>{
  const grip = document.getElementById('grip');
  if(!grip || !els.output) return;
  let drag=false, y0=0, h0=0;
  grip.addEventListener('pointerdown', e=>{ drag=true; y0=e.clientY; h0=els.output.offsetHeight; try{ grip.setPointerCapture(e.pointerId); }catch{} });
  grip.addEventListener('pointermove', e=>{
    if(!drag) return;
    els.output.style.height = Math.max(120, Math.min(h0 + (e.clientY - y0), Math.round(window.innerHeight * 0.6))) + 'px';
    els.output.style.overflowY = 'auto';
  });
  grip.addEventListener('pointerup', ()=>{ if(!drag) return; drag=false; Storage.saveHeights({ out: getComputedStyle(els.output).height }); });
})();

// main rec strip (ticket/51): wave.js renderer on the user's saved stack; idle near-still (fake off), live via Audio.getAnalyser()
let mainWave = null;
function mainWaveInit(){
  if(!els.wave) return;
  try{
    mainWave = createWaveRenderer(els.wave);
    mainWave.setConfig(Storage.getWave());
    mainWave.setFakeEnabled(false);
    mainWave.start();
  }catch{ mainWave = null; }
}
function mainWaveLive(){ try{ mainWave?.setAnalyser(Audio.getAnalyser() || null); }catch{} syncRecStrip(); }
function mainWaveIdle(){ try{ mainWave?.setAnalyser(null); }catch{} syncRecStrip(); }
function mainWaveSync(){ try{ mainWave?.setConfig(Storage.getWave()); }catch{} }
function syncRecStrip(){
  const strip = $('rec-strip');
  if(!strip) return;
  strip.classList.toggle('recording', isRecording);
  strip.classList.toggle('transcribing', isTranscribing && !isRecording);
}

let rtVersion = 0;
let rtSnap = null;

function makeOnInterim(snap){
  let lastPreview = snap.committed + snap.pending;
  return (preview, fin)=>{
    const finCum = fin || '';
    const interChunk = preview.slice(finCum.length);
    if(finCum && finCum !== snap.committed){
      const newChunk = finCum.slice(snap.committed.length);
      snap.committed = finCum;
      if(newChunk.trim()) Logger.log('debug','realtime committed', newChunk.trim());
    }
    snap.pending = interChunk;
    const fullPreview = snap.committed + snap.pending;
    if(els.liveFinal) els.liveFinal.textContent = snap.committed;
    if(els.liveInterim) els.liveInterim.textContent = snap.pending;
    const expected = snap.before + lastPreview + snap.after;
    if(els.output.value !== expected){
      Logger.log('debug','realtime manual edit detected — keep user edit', { expectedLen: expected.length, actualLen: els.output.value.length });
      lastPreview = fullPreview;
      updateCounts();
      return;
    }
    els.output.value = snap.before + fullPreview + snap.after;
    const cursor = snap.basePos + fullPreview.length;
    els.output.setSelectionRange(cursor, cursor);
    lastPreview = fullPreview;
    updateCounts();
  };
}

let isRecording=false, vadTimer=null;
let isTranscribing=false;
let transcribingAbort=null;
function setMicBusy(busy){
  isTranscribing = busy;
  if (els.btnMic) {
    els.btnMic.disabled = busy;
    els.btnMic.classList.toggle('transcribing', busy);
    els.btnMic.setAttribute('aria-busy', busy ? 'true' : 'false');
    const icon = els.btnMic.querySelector('.mic-icon');
    const label = els.btnMic.querySelector('.mic-label');
    if (busy) {
      if (label) label.textContent = 'در حال تبدیل…';
      if (icon) icon.textContent = '';
    } else {
      if (label) label.textContent = isRecording ? '⏹ پایان و تبدیل' : 'شروع صحبت';
      if (icon) icon.textContent = '🎤';
    }
  }
  if (els.btnCancel) els.btnCancel.hidden = !busy;
  if (els.output) els.output.setAttribute('aria-busy', busy ? 'true' : 'false');
  syncRecStrip();
}
function shakeMic(){
  if (!els.btnMic) return;
  els.btnMic.classList.remove('shake');
  void els.btnMic.offsetWidth;
  els.btnMic.classList.add('shake');
  setTimeout(()=> els.btnMic.classList.remove('shake'), 400);
}
async function startRecording(){
  if (isTranscribing) { shakeMic(); Logger.toast('⏳ صبر کن — تبدیل ادامه دارد…', 2000); return; }
  saveCursor();
  const s=Storage.getSettings(); if(!s.groqKey&&!s.geminiKey&&!s.openrouterKey){ Logger.setStatus('کلید نداری — ⚙️ را بزن','error'); openModal(); return; }
  let snap=null;
  try{
    snap = { id: ++rtVersion, startMs: 0, basePos: selStart, before: els.output.value.slice(0, selStart), after: els.output.value.slice(selEnd), committed:'', pending:'' };
    rtSnap = snap;
    const vadMs = s.vad ? 250 : undefined;
    await Audio.start({ vadChunkMs: vadMs, onStop: (blob)=> handleTranscription(blob, snap) });
    snap.startMs = performance.now();
    isRecording=true;
    const labelEl = els.btnMic.querySelector('.mic-label');
    const iconEl = els.btnMic.querySelector('.mic-icon');
    if (labelEl) labelEl.textContent = '⏹ پایان و تبدیل'; else els.btnMic.textContent = '⏹ پایان و تبدیل';
    if (iconEl) iconEl.textContent = '⏹';
    els.btnMic.classList.add('recording'); if(s.realtime) els.btnMic.classList.add('realtime-active');
    Logger.setStatus('🔴 در حال ضبط...'+(s.realtime?' (زنده)':''),'rec');
    mainWaveLive();
    if(s.realtime && Realtime.isSupported()){
      if(els.livePreview) els.livePreview.classList.add('on'); if(els.liveBadge) els.liveBadge.classList.add('on'); if(els.liveFinal) els.liveFinal.textContent=''; if(els.liveInterim) els.liveInterim.textContent='';
      const onInterim = makeOnInterim(snap);
      Realtime.start(snap.basePos, { onInterim:(p,f)=> onInterim(p,f), onFinal: f=> Logger.log('debug','final',f), onError:e=>Logger.log('warn','WebSpeech',e)}, snap.id);
      Logger.log('info','حالت آنی روشن',{snapId: snap.id, basePos: snap.basePos, beforeLen: snap.before.length, afterLen: snap.after.length});
    }
    if(s.vad) startVAD();
    Logger.log('info','ضبط شروع',{realtime:s.realtime, vad:s.vad, snapId: snap.id});
  }catch(e){ if(snap && rtSnap?.id===snap.id) rtSnap=null; Logger.setStatus('میکروفون خطا: '+e.message,'error'); Logger.log('error','getUserMedia',e.message); Logger.toast(e.message); }
}
function stopRecording(){
  if(!isRecording) return;
  const snap = rtSnap;
  Audio.stop(); isRecording=false;
  setMicBusy(true);
  transcribingAbort = new AbortController();
  els.btnMic.classList.remove('recording','realtime-active');
  stopVAD(); mainWaveIdle(); Realtime.stop();
  setTimeout(()=>{ if(els.livePreview) els.livePreview.classList.remove('on'); if(els.liveBadge) els.liveBadge.classList.remove('on'); },900);
  if(snap && (snap.committed+snap.pending)){
    const cursor = snap.basePos + (snap.committed+snap.pending).length;
    selStart=selEnd=cursor;
  }
  Logger.setStatus('⏳ در حال تبدیل...','warn');
}
els.btnMic.onclick=()=> {
  if (isTranscribing) { shakeMic(); Logger.toast('⏳ صبر کن — تبدیل ادامه دارد…', 2000); return; }
  isRecording?stopRecording():startRecording();
};
function cancelTranscription(){
  if (transcribingAbort) transcribingAbort.abort();
  // UI handled in handleTranscription catch — keep abort signal until finally
}
els.btnCancel?.addEventListener('click', cancelTranscription);
document.addEventListener('keydown', (e)=>{
  if (e.key === 'Escape' && isTranscribing && transcribingAbort) cancelTranscription();
});
function startVAD(){ let quiet=0; const loop=()=>{ const an=Audio.getAnalyser(); if(!isRecording||!an) return; const d=new Uint8Array(an.frequencyBinCount); an.getByteFrequencyData(d); const avg=d.reduce((a,b)=>a+b,0)/d.length; if(avg<12) quiet+=250; else quiet=0; if(quiet>1400){ Logger.log('info','VAD سکوت — ارسال'); stopRecording(); return; } vadTimer=setTimeout(loop,250); }; vadTimer=setTimeout(loop,500); }
function stopVAD(){ if(vadTimer) clearTimeout(vadTimer); vadTimer=null; }

async function handleTranscription(blob, snap){
  const snapId = snap?.id;
  const isStale = snap && snapId !== rtVersion;
  if(isStale){ Logger.log('debug','stale transcription ignored',{ snapId, current: rtVersion }); return; }
  // busy is set in stopRecording; keep VAD path safe without creating duplicate controller
  if (!isTranscribing) { setMicBusy(true); if (!transcribingAbort) transcribingAbort = new AbortController(); }
  Logger.log('info','handleTrans',{size:blob.size, snapId: snapId||null, rtActive: !!snap, rtPreviewLen: snap ? (snap.committed+snap.pending).length : 0});
  if(blob.size<800){
    Logger.setStatus('صدایی ضبط نشد','warn'); Logger.toast('صدایی نیست');
    Logger.dismissProgress(800);
    setMicBusy(false); transcribingAbort = null;
    if(!snap || snapId===rtVersion){ rtSnap=null; }
    if(els.liveFinal) els.liveFinal.textContent=''; if(els.liveInterim) els.liveInterim.textContent=''; if(els.livePreview) els.livePreview.classList.remove('on');
    return;
  }
  try{
    const durationMs = snap?.startMs ? Math.round(performance.now() - snap.startMs) : 0;
    const signal = transcribingAbort?.signal;
    const { text, engine, polishModel } = await Transcription.transcribe(blob, { durationMs, signal });
    if(snap && snapId !== rtVersion){ Logger.log('debug','stale resolve after transcribe ignored',{ snapId, current: rtVersion }); throw Object.assign(new Error('stale'), { code:'STALE', aborted:true }); }
    if (signal?.aborted) { throw Object.assign(new Error('لغو شد'), { code:'ABORTED', aborted:true }); }
    if(!text){ Logger.setStatus('متنی برنگشت','warn'); Logger.toast('متنی نیست'); Logger.dismissProgress(800); throw Object.assign(new Error('متنی نیست'), { code:'EMPTY', aborted:false }); }
    const s=Storage.getSettings();
    if(s.realtime && snap){
      const finalText = text.trim();
      const expected = snap.before + snap.committed + snap.pending + snap.after;
      if(els.output.value !== expected){
        Logger.log('warn','realtime manual edit before final — fallback to cursor insert',{ snapId });
        const o=els.output.value, ps=Math.min(selStart,o.length), pe=Math.min(selEnd,o.length);
        els.output.value=o.substring(0,ps)+finalText+o.substring(pe);
        els.output.setSelectionRange(ps+finalText.length,ps+finalText.length);
      } else {
        els.output.value = snap.before + finalText + snap.after;
        const cursor = snap.basePos + finalText.length;
        els.output.setSelectionRange(cursor, cursor);
      }
      Logger.log('info','realtime polished',{snapId, preview:(snap.committed+snap.pending).slice(0,80), final: finalText.slice(0,80)});
    } else {
      const o=els.output.value, ps=Math.min(selStart,o.length), pe=Math.min(selEnd,o.length); els.output.value=o.substring(0,ps)+text+o.substring(pe); els.output.setSelectionRange(ps+text.length,ps+text.length);
    }
    els.output.focus(); saveCursor();
    if(!snap || snapId===rtVersion){ rtSnap=null; }
    if(els.liveFinal) els.liveFinal.textContent=''; if(els.liveInterim) els.liveInterim.textContent=''; els.output.dispatchEvent(new Event('input'));
    Storage.saveDraft(els.output.value);
    Quota.render(els.quotaGrid, { period: Dashboard.getPeriod() });
    Dashboard.renderOverall();
    const polInfo = polishModel ? ` + پالیش ${polishModel}` : (s.polishEnabled ? ' + پالیش محلی' : '');
    Logger.setStatus(`✅ با ${engine}${polInfo} نشست`,'info'); Logger.toast('درج شد'); Logger.dismissProgress(2600); if(Storage.getSettings().autocopy) try{ await navigator.clipboard.writeText(text); }catch{}
    Logger.log('info','success',{engine, polishModel, len:text.length});
  }catch(err){
    if (err.code === 'STALE') {
      Logger.dismissProgress(0);
    } else if (err.code === 'EMPTY') {
      // already handled
    } else if (err.aborted || err.code === 'ABORTED' || transcribingAbort?.signal.aborted) {
      Logger.log('info','transcribe aborted',{msg:err.message, snapId});
      Logger.toast('لغو شد', 1500);
      Logger.dismissProgress(0);
      Logger.setStatus('لغو شد','warn');
      // already handled toast/status above
    } else {
      Logger.log('error','transcribe failed',{msg:err.message, status:err.status});
      if(err.status === 429) setQuotaExpanded(true); // quota errors auto-expand the strip; nothing else does
      let h='کلید/اینترنت را چک کن'; if(err.status===429) h='سهمیه پر — کمی صبر کن'; else if(err.status===404) h='مدل پیدا نشد'; else if(err.status===401 || err.status===403) h='کلید نامعتبر';
      Logger.setStatus(`❌ خطا: ${err.message.slice(0,90)} — ${h}`,'error');
      Logger.toast(`❌ ${err.message.slice(0,60)} — ${h}`, 3500);
      Logger.dismissProgress(3500);
    }
  } finally {
    setMicBusy(false);
    mainWaveIdle();
    transcribingAbort = null;
    if(!snap || snapId===rtVersion){ rtSnap=null; }
    if(els.liveFinal) els.liveFinal.textContent='';
    if(els.liveInterim) els.liveInterim.textContent='';
    if(els.livePreview) els.livePreview.classList.remove('on');
  }
}

// misc
function safeSaveSettings(){ try{ saveSettings(); return true; }catch(e){ Logger.log('error','saveSettings failed',{msg:e.message, field:e.field}); Logger.toast(e.message); if(e.field==='groqBaseURL') els.groqBaseUrl.style.borderColor='var(--danger)'; if(e.field==='openrouterBaseURL') els.openrouterBaseUrl.style.borderColor='var(--danger)'; return false; } }
$('btn-test-groq').onclick=async()=>{ if(!safeSaveSettings()) return; Logger.setStatus('تست Groq...','warn'); try{ await Transcription.testGroq(); Logger.setStatus('✅ Groq اوکی','info'); Logger.toast('Groq ok'); }catch(e){ Logger.setStatus('❌ Groq: '+sanitizeMsg(e.message || e),'error'); } };
  $('btn-test-gemini').onclick=async()=>{ if(!safeSaveSettings()) return; Logger.setStatus('تست Google...','warn'); try{ await Transcription.testGemini(); Logger.setStatus(`✅ Google اوکی`,'info'); Logger.toast('Google ok'); }catch(e){ Logger.setStatus('❌ Google: '+sanitizeMsg(e.message || e),'error'); } };
$('btn-test-polish')?.addEventListener('click', async()=>{
  if(!safeSaveSettings()) return;
  Logger.setStatus('تست پالیش...','warn');
  const sample='رابطه کاربری زیبا است و می شود بهتر کرد';
  try{
    const out=await Transcription.polishText(sample);
    Logger.setStatus(`✅ پالیش: ${out.slice(0,60)}`,'info');
    Logger.log('info','polish test',{in:sample, out});
    Logger.toast(`پالیش: ${out}`);
  }catch(e){ Logger.setStatus('❌ پالیش: '+sanitizeMsg(e.message || e),'error'); }
});
els.btnCopy.onclick=async()=>{ if(!els.output.value.trim()){ Logger.toast('چیزی نیست'); return; } await navigator.clipboard.writeText(els.output.value); const p=els.btnCopy.textContent; els.btnCopy.textContent='✓ کپی شد'; els.btnCopy.style.background='#137333'; setTimeout(()=>{ els.btnCopy.textContent=p; els.btnCopy.style.background=''; },1200); Logger.toast('کپی شد'); };
els.btnClear.onclick=()=>{ els.output.value=''; Storage.clearDraft(); selStart=selEnd=0; rtSnap=null; if(els.liveFinal) els.liveFinal.textContent=''; if(els.liveInterim) els.liveInterim.textContent=''; if(els.livePreview) els.livePreview.classList.remove('on'); updateCounts(); editorHistory.push(''); Logger.setStatus('آماده','info'); Logger.toast('پاک شد'); };
mainWaveInit();
const verEl = document.getElementById('app-version'); if (verEl) verEl.textContent = `v${VERSION}`;
Dashboard.ensureReportUI();
Logger.log('info',`هم‌نگار v${VERSION} (${BUILD}) آماده`, {hasRealtime: Realtime.isSupported(), proto: location.protocol, version: VERSION});
Quota.render(els.quotaGrid, { period: Dashboard.getPeriod() });
Dashboard.renderOverall();
