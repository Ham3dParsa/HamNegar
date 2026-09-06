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
  wave: $('wave'), fileWarn: $('file-warning'),
  logBody: $('log-body'), livePreview: $('live-preview'), liveFinal: $('live-final'), liveInterim: $('live-interim'), liveBadge: $('live-badge'),
  quotaGrid: $('quota-grid'), charCount: $('char-count'), wordCount: $('word-count'),
  logPanel: $('log-panel'), btnToggleLog: $('btn-toggle-log'),
  btnCancel: $('btn-cancel-stt'),
  btnGroqModels: $('btn-groq-models'), btnOrModels: $('btn-or-models'), btnGeminiModels: $('btn-gemini-models'), btnZenModels: $('btn-zen-models'),
  keyZen: $('key-zen'),
  tabPipeline: $('tab-pipeline'), panelPipeline: $('panel-pipeline'),
  btnExpandStt: $('btn-expand-stt'), btnExpandPolish: $('btn-expand-polish'),
  providerDrawer: $('provider-drawer'),
  sttAddPanel: $('stt-add-panel'), sttAddSearch: $('stt-add-search'), sttAddList: $('stt-add-list'),
  polishAddPanel: $('polish-add-panel'), polishAddSearch: $('polish-add-search'), polishAddList: $('polish-add-list'),
  tabWave: $('tab-wave'), panelWave: $('panel-wave'),
  customList: $('custom-providers-list'), customName: $('custom-name'), customBaseUrl: $('custom-base-url'), customKey: $('custom-key'),
  easyModelInput: $('easy-model-input'),
};
// hoisted above loadSettings(): updateBadge→updateStageScope→stageScope reads these during initial load
let selStart=0, selEnd=0;

Logger.init({ logBodyEl: els.logBody, statusTextEl: els.statusText, statusDotEl: els.statusDot, toastEl: $('toast') });

// --- log filter/search UI lives in app.js (seam: logger stays 3-call log/setStatus/toast) ---
let currentFilter = 'all';
let searchQuery = '';
let isolatedRun = null; // ticket/16: click a run separator to isolate that run (click again to clear)
function isSep(el){ return !!el && !!el.classList && el.classList.contains('log-sep'); }
function passes(level, text, el) {
  if (isSep(el)) return true; // separators are structural — always visible
  if (isolatedRun != null && String(el?.dataset?.run || '') !== String(isolatedRun)) return false;
  if (currentFilter !== 'all' && level !== currentFilter) return false;
  if (searchQuery && !text.toLowerCase().includes(searchQuery.toLowerCase())) return false;
  return true;
}
function applyFilters() {
  if (!els.logBody) return;
  for (const el of els.logBody.children) {
    const lvl = el.dataset.level || 'info';
    const ok = passes(lvl, el.textContent, el);
    el.classList.toggle('hidden', !ok);
  }
  for (const sep of els.logBody.querySelectorAll('.log-sep')) {
    const active = isolatedRun != null && String(sep.dataset.run) === String(isolatedRun);
    sep.classList.toggle('isolated', active);
    sep.setAttribute('aria-pressed', active ? 'true' : 'false');
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
  if (el && !passes(level, el.textContent, el)) el.classList.add('hidden');
  if (level === 'error' && logReady && els.logPanel?.classList.contains('collapsed')) {
    applyLogCollapsed(false);
    Logger.toast('خطای جدید — لاگ باز شد');
  }
};
// ticket/16: separator click/keyboard isolates that run (combines with level filter + search)
function toggleRunIsolation(sep){
  if (!sep) return;
  const run = sep.dataset.run;
  isolatedRun = (isolatedRun != null && String(isolatedRun) === String(run)) ? null : run;
  applyFilters();
  Logger.toast(isolatedRun != null ? `فقط اجرای #${isolatedRun} — کلیک دوباره: همه` : 'نمایش همه اجراها');
}
els.logBody?.addEventListener('click', (e) => {
  const sep = e.target?.closest?.('.log-sep');
  if (sep && els.logBody.contains(sep)) toggleRunIsolation(sep);
});
els.logBody?.addEventListener('keydown', (e) => {
  const sep = e.target?.closest?.('.log-sep');
  if (sep && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); toggleRunIsolation(sep); }
});

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
    .replace(/eyJ[A-Za-z0-9_-]{8,}/g, '[کلید حذف شد]')
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

let chainMenuDocBound = false; // one delegated closer for all ⋮ row menus (bound lazily)
function closeChainMenus(except, refocus){
  document.querySelectorAll('.chain-menu-wrap.open').forEach(w=>{
    if(w === except) return;
    w.classList.remove('open');
    w.querySelector('.chain-menu')?.setAttribute('hidden','');
    w.querySelector('.chain-menubtn')?.setAttribute('aria-expanded','false');
  });
  if(refocus?.focus) refocus.focus();
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
    const statusText = `● ${providerId} · ${hasKey ? '✓' : '⚠'}`;
    const statusTitle = hasKey ? `${providerId} — کلید دارد` : `${providerId} — بی‌کلید (اول کلید را وارد کن)`;
    const menuLabel = `گزینه‌های مدل ${meta.label}: جابه‌جایی، حذف`;
    // ticket/75-chainrows-compact: one ⋮ menu per row (up/down/remove) — ✕ off the surface.
    // aria-labels of the old ▲▼✕ buttons move onto menu items; Ctrl+Arrow/drag/undo paths untouched.
    item.title = 'بکش تا جابه‌جا شود — Ctrl+↑/↓ جابه‌جایی ردیف';
    item.setAttribute('aria-keyshortcuts', 'Control+ArrowUp Control+ArrowDown');
    item.innerHTML = `
      <span class="rank ${idx>0?'fallback':''}">${idx+1}</span>
      <div class="chain-main">
        <span class="chain-label" dir="auto" title="${esc(meta.label)}${meta.sub?` — ${esc(meta.sub)}`:''}">${esc(meta.label)}</span>
        <span class="chain-meta">
          ${meta.sub?`<span class="chain-sub">${esc(meta.sub)}</span><span aria-hidden="true">·</span>`:''}
          <span class="chain-status ${dotCls}" title="${esc(statusTitle)}">${esc(statusText)}</span>
        </span>
      </div>
      <label class="chain-switch"><input type="checkbox" class="sr-only" role="switch" data-toggle ${enabled?'checked':''} aria-checked="${enabled?'true':'false'}" aria-label="${esc(switchLabel)}"><span class="chain-track" aria-hidden="true"></span><span class="chain-state" aria-hidden="true">${enabled?'روشن':'خاموش'}</span></label>
      <div class="chain-menu-wrap">
        <button type="button" class="chain-menubtn" aria-haspopup="menu" aria-expanded="false" aria-label="${esc(menuLabel)}">⋮</button>
        <div class="chain-menu ${idx===chain.length-1?'up':''}" role="menu" aria-label="${esc(menuLabel)}" hidden>
          <button type="button" role="menuitem" data-up aria-label="انتقال ${esc(meta.label)} به بالا" ${idx===0?'disabled':''}>▲ بالا</button>
          <button type="button" role="menuitem" data-down aria-label="انتقال ${esc(meta.label)} به پایین" ${idx===chain.length-1?'disabled':''}>▼ پایین</button>
          <button type="button" role="menuitem" class="danger" data-remove aria-label="حذف مدل ${esc(meta.label)}">✕ حذف</button>
        </div>
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
    // ⋮ menu open/close (single open at a time; Esc closes and refocuses the trigger)
    const wrap = item.querySelector('.chain-menu-wrap');
    const menuBtn = item.querySelector('.chain-menubtn');
    const menu = item.querySelector('.chain-menu');
    menuBtn?.addEventListener('click', (e)=>{
      e.stopPropagation();
      const willOpen = !!menu?.hasAttribute('hidden');
      closeChainMenus();
      if(willOpen && menu){
        menu.removeAttribute('hidden');
        wrap?.classList.add('open');
        menuBtn.setAttribute('aria-expanded','true');
        menu.querySelector('button:not([disabled])')?.focus?.();
      }
    });
    menu?.addEventListener('keydown', (e)=>{
      const items = [...menu.querySelectorAll('button:not([disabled])')];
      const at = items.indexOf(document.activeElement);
      if(e.key === 'Escape'){ e.preventDefault(); e.stopPropagation(); closeChainMenus(null, menuBtn); } // consume: open menu owns Esc (ticket/2x)
      else if(e.key === 'ArrowDown'){ e.preventDefault(); (items[at + 1] || items[0])?.focus?.(); }
      else if(e.key === 'ArrowUp'){ e.preventDefault(); (items[at - 1] || items[items.length - 1])?.focus?.(); }
      else if(e.key === 'Home'){ e.preventDefault(); items[0]?.focus?.(); }
      else if(e.key === 'End'){ e.preventDefault(); items[items.length - 1]?.focus?.(); }
    });
    if(!chainMenuDocBound){
      chainMenuDocBound = true;
      document.addEventListener('click', (e)=>{
        if(!e.target?.closest?.('.chain-menu-wrap')) closeChainMenus();
      });
      document.addEventListener('keydown', (e)=>{
        if(e.key === 'Escape' && !e.defaultPrevented){
          if (shortcutsOpen()) return; // guide owns Esc while open (ticket/51)
          const open = document.querySelector('.chain-menu-wrap.open .chain-menubtn');
          if(!open) return;
          e.preventDefault(); e.stopPropagation(); // consumed — later document layers (recording-cancel) must see defaultPrevented (ticket/2x)
          closeChainMenus(null, open);
        }
      });
    }
    // up/down
    item.querySelector('[data-up]')?.addEventListener('click', ()=> moveChain(type, idx, -1));
    item.querySelector('[data-down]')?.addEventListener('click', ()=> moveChain(type, idx, 1));
    // keyboard reorder: Ctrl+ArrowUp/Down on focused row (bubbles from inner controls too).
    // NOTE (ticket/2x): bubbling is intentional and left as-is — there is no global
    // Ctrl+Arrow binding, so the row owns it wherever focus sits inside the row.
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
// Header removed (ticket header-polish-drawer): engine readout lives in the
// #stage-scope pill. engineInfo() is the single chain-head reader; updateBadge()
// just refreshes the pill via updateStageScope() (hoisted, defined below).
function engineInfo(){
  const s=Storage.getSettings();
  const raw = s.sttChain?.[0] || s.primary || 'groq';
  const firstId = typeof raw==='object' ? raw.id : raw;
  const label = firstId==='groq' ? 'Groq' : firstId;
  const pol = s.polishEnabled ? ' • پالیش روشن' : ' • پالیش خاموش';
  return { text: `موتور: ${label}${pol}`, hasKey: hasKeyFor(raw) };
}
function updateBadge(){
  updateStageScope();
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
  // re-render badges live + provider status pills (keys editable ONLY in models tab)
  renderProvidersStatus();
  renderAllChains();
  try{ renderFlowListSoon(); }catch{}
}
function renderProvidersStatus(){
  let providers = [];
  try{ providers = Storage.getProviders(); }catch{ return; }
  for(const p of providers){
    const pill = document.getElementById('pill-' + p.id);
    if(pill){
      pill.className = 'chain-badge ' + (p.hasKey ? 'ok' : 'missing');
      pill.textContent = p.hasKey ? '✓ کلید' : '⚠ بی‌کلید';
    }
  }
}
function loadSettings(){
  const s=Storage.getSettings();
  els.keyGroq.value=s.groqKey; els.keyGemini.value=s.geminiKey;   if(els.keyOpenrouter) els.keyOpenrouter.value=s.openrouterKey; if(els.keyZen) els.keyZen.value=s.zenKey;
  if(els.groqBaseUrl) els.groqBaseUrl.value=s.groqBaseURL || GROQ_BASE_DEFAULT;
  if(els.openrouterBaseUrl) els.openrouterBaseUrl.value=s.openrouterBaseURL || OPENROUTER_BASE_DEFAULT;
  sttChainState=[...s.sttChain];
  polishChainState=s.polishChain.map(e=>({ ...e }));
  if(els.togglePolish) els.togglePolish.checked=s.polishEnabled;
  els.toggleRealtime.checked=s.realtime; els.toggleVad.checked=s.vad; els.toggleAutocopy.checked=s.autocopy;
  renderCustomProviders();
  flowInit();
  renderAllChains();
  updateBadge(); validate(); Dashboard.ensureReportUI(); Quota.render(els.quotaGrid, { period: Dashboard.getPeriod() }); Dashboard.renderOverall();
  if(!s.groqKey&&!s.geminiKey&&!s.openrouterKey&&!s.zenKey){ Logger.setStatus('کلید تنظیم نشده — ⚙️ نوار پایین را بزن','warn'); } else Logger.setStatus('آماده به کار','info');
}
function saveSettings(){
  try{
    Storage.saveSettings({
      groqKey: els.keyGroq.value,
      geminiKey: els.keyGemini.value,
      openrouterKey: els.keyOpenrouter?.value||'',
      zenKey: els.keyZen?.value||'',
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
if(els.keyZen) els.keyZen.addEventListener('input',validate);
if(els.groqBaseUrl) els.groqBaseUrl.addEventListener('input',validate);
if(els.openrouterBaseUrl) els.openrouterBaseUrl.addEventListener('input',validate);
if(els.togglePolish) els.togglePolish.addEventListener('change', ()=>{ persistChains(); Logger.log('info', `پالیش ${els.togglePolish.checked?'روشن':'خاموش'}`); });

// --- settings tabs (pipeline | wave) ---
function switchTab(name){
  const tabs = { pipeline: els.tabPipeline, wave: els.tabWave };
  const panels = { pipeline: els.panelPipeline, wave: els.panelWave };
  for(const k of Object.keys(tabs)){
    const active = k === name;
    tabs[k]?.classList.toggle('active', active);
    tabs[k]?.setAttribute('aria-selected', active ? 'true' : 'false');
    if(panels[k]) panels[k].hidden = !active;
  }
  if(name === 'wave'){ waveEnsure(); wavePrevStart(); } else { wavePrevStop(); waveFollowStop(); const hadMic = !!waveMicStream || !!waveMicCtx; waveMicStop(); if (hadMic) { waveSync(); } }
}
els.tabPipeline?.addEventListener('click', ()=> switchTab('pipeline'));
els.tabWave?.addEventListener('click', ()=> switchTab('wave'));

// --- models flow card (ticket/08): rail is single truth, inline key cards, ONE search + ONE chip row → flat list ---
// Data source is modelCache (Transcription.listModels) + known chain labels; rows toggle real chains.
const modelCache = new Map(); // providerId -> string[]
const fetchStamp = new Map(); // providerId -> cache-line label
let flowProv = 'all';
let flowChips = new Set(); // multi-select: empty = all; 'stt'/'t2t' = capability OR, 'free' = AND modifier
let flowLastPid = null; // unknown until first fetch succeeds/fails — gates m-retry (disabled pre-fetch)
let flowRenderT = null; // debounce: validate()/search fire per keystroke, list rebuild is ~30 nodes
function renderFlowListSoon(){ clearTimeout(flowRenderT); flowRenderT = setTimeout(()=>{ try{ renderFlowList(); }catch{} }, 150); }
function flowProviderLabel(pid){
  if (pid === 'groq') return 'Groq';
  if (pid === 'gemini') return 'Google AI Studio';
  if (pid === 'openrouter') return 'OpenRouter';
  if (pid === 'zenspark') return 'OpenCode Zen';
  try {
    const hit = (Storage.getSettings().customProviders || []).find(x => x && x.id === pid);
    if (hit) return hit.name || pid;
  } catch {}
  return String(pid || 'نامشخص');
}
// Shared fetch-error path (ticket/45, folds zen-cors): attributed in-place `#m-err`
// (`✕ <provider-label>: <safe>`), retry stays bound via `flowLastPid`;
// `sanitizeMsg` is the single key-scrubbing gate.
function showFetchError(providerId, e){
  const raw = (e && e.message != null) ? String(e.message) : String(e ?? '');
  let safe = sanitizeMsg(raw) || 'خطای ناشناخته';
  if (/failed to fetch|networkerror|load failed|network request failed/i.test(raw)) safe = 'مرورگر جلوی دریافت مستقیم را گرفت (اتصال یا دسترسی مسدود است)';
  const label = flowProviderLabel(providerId);
  const msg = `✕ ${label}: ${safe}`;
  Logger.toast(msg.slice(0, 80));
  announce(`خطا در بارگذاری مدل‌ها (${label}): ${safe}`);
  const errBox = $('m-err');
  if (errBox) {
    errBox.hidden = false;
    errBox.dataset.failed = '1';
    const t = $('m-err-text');
    if (t) t.textContent = msg + ' ';
    const zen = $('m-err-zen');
    if (zen) zen.hidden = providerId !== 'zenspark';
  }
}
function capsFor(id, pid){
  const s = String(id || '');
  const low = s.toLowerCase();
  const isStt = s === 'groq' || /^gemini/i.test(s)
    || Object.prototype.hasOwnProperty.call(STT_LABELS, s)
    || /whisper|stt|transcrib/i.test(low);
  const free = /free/i.test(low);
  if (/^gemini/i.test(s)) return { caps: ['stt', 't2t'], free: true, fa: (STT_LABELS[s] || {}).sub || 'Google AI Studio' };
  if (/^muse-spark-/i.test(s)) return { caps: ['t2t'], free: /contributor-free/i.test(s), fa: /1\.3/i.test(s) ? 'muse spark 1.3 contributor (رایگان)' : /1\.2/i.test(s) ? 'muse spark 1.2 contributor (رایگان)' : 'muse spark contributor (رایگان)' };
  if (isStt) return { caps: ['stt'], free, fa: (STT_LABELS[s] || {}).sub || '' };
  return { caps: ['t2t'], free, fa: (POLISH_LABELS[s] || {}).sub || '' };
}
// Single source of truth for STT-eligibility: every add path + row disabled state must use this.
function isSttEligible(id, pid){ return capsFor(id, pid).caps.includes('stt'); }
// Per-row add target without global state (ticket/76): STT-eligible models belong to
// STT, t2t-only models to polish. Inline panels pass their own chain; the shared
// models-tab list derives it per row so no stale-target muting can recur.
function targetForModel(id, pid){ return isSttEligible(id, pid) ? 'stt' : 'polish'; }
function allFlowModels(){
  const out = [], seen = new Set();
  const push = (id, pid) => {
    const clean = String(id || '').trim();
    if (!clean) return;
    const k = pid + ':' + clean;
    if (seen.has(k)) return;
    seen.add(k);
    const { caps, free, fa } = capsFor(clean, pid);
    out.push({ id: clean, providerId: pid, caps, free, fa });
  };
  push('groq', 'groq');
  push('muse-spark-1.3-contributor-free', 'zenspark');
  push('muse-spark-1.2-contributor-free', 'zenspark');
  for (const id of Object.keys(STT_LABELS)) if (id !== 'groq') push(id, /^gemini/i.test(id) ? 'gemini' : 'groq');
  for (const id of Object.keys(POLISH_LABELS)) push(id, providerIdOf({ id }, 'groq'));
  for (const [pid, ids] of modelCache) for (const id of (ids || [])) push(id, pid);
  return out;
}
function chainLoc(id, pid){
  const si = sttChainState.findIndex(x => entryIdOf(x) === id && providerIdOf(x, '') === pid);
  if (si >= 0) return { type: 'stt', index: si };
  const pi = polishChainState.findIndex(x => entryIdOf(x) === id && providerIdOf(x, '') === pid);
  if (pi >= 0) return { type: 'polish', index: pi };
  return null;
}
function flowScopeLabel(){
  return flowProv === 'all' ? 'همه ارائه‌دهنده‌ها'
    : flowProv === 'groq' ? 'Groq'
    : flowProv === 'gemini' ? 'Google AI Studio'
    : flowProv === 'openrouter' ? 'OpenRouter'
    : flowProv === 'zenspark' ? 'OpenCode_Zen'
    : flowProv === 'custom' ? 'سفارشی' : flowProv;
}
function renderKeyVisibility(){
  const show = {
    groq: flowProv === 'all' || flowProv === 'groq',
    gemini: flowProv === 'all' || flowProv === 'gemini',
    openrouter: flowProv === 'all' || flowProv === 'openrouter',
    zenspark: flowProv === 'all' || flowProv === 'zenspark',
    custom: flowProv === 'all' || flowProv === 'custom',
  };
  const cardGroq = $('provider-card-groq'), cardGemini = $('provider-card-gemini'), cardOr = $('provider-card-openrouter'), cardZen = $('provider-card-zenspark');
  const customList = $('custom-providers-list'), customAdd = $('custom-add-card');
  if (cardGroq) cardGroq.hidden = !show.groq;
  if (cardGemini) cardGemini.hidden = !show.gemini;
  if (cardOr) cardOr.hidden = !show.openrouter;
  if (cardZen) cardZen.hidden = !show.zenspark;
  if (customList) customList.hidden = !show.custom;
  if (customAdd) customAdd.hidden = !show.custom;
}
function updateNokey(){
  const el = $('m-nokey');
  if (!el) return;
  if (flowProv === 'all' || flowProv === 'custom') { el.hidden = true; return; }
  let has = false;
  try { has = Storage.hasKeyForProvider(flowProv); } catch {}
  el.hidden = has;
}
function syncCacheLines(){
  for (const pid of ['groq', 'gemini', 'openrouter', 'zenspark']) {
    const el = document.getElementById('cache-' + pid);
    if (el) el.textContent = fetchStamp.get(pid) || 'نه هنوز — «لیست مدل‌ها» را بزن';
  }
}
function renderFlowList(){
  const box = $('models-list');
  if (!box) return;
  renderKeyVisibility();
  syncCacheLines();
  const q = ($('m-q')?.value || '').trim().toLowerCase();
  box.innerHTML = '';
  const rows = allFlowModels()
    .filter(d => flowProv === 'all' ? true : flowProv === 'custom' ? !['groq', 'gemini', 'openrouter', 'zenspark'].includes(d.providerId) : d.providerId === flowProv)
    .filter(d => {
      const capsSel = [...flowChips].filter(c => c === 'stt' || c === 't2t');
      if (capsSel.length && !capsSel.some(c => d.caps.includes(c))) return false;
      if (flowChips.has('free') && !d.free) return false;
      return true;
    })
    .filter(d => !q || d.id.toLowerCase().includes(q) || (d.fa || '').includes(q) || String(d.providerId || '').includes(q));
  for (const d of rows) {
    const hasKey = (() => { try { return Storage.hasKeyForProvider(d.providerId); } catch { return false; } })();
    const loc = chainLoc(d.id, d.providerId);
    const card = document.createElement('div');
    card.className = 'mrow';
    card.dataset.p = d.providerId;
    const main = document.createElement('div');
    main.className = 'mmain';
    const title = document.createElement('div');
    title.className = 'mtitle';
    const b = document.createElement('b');
    b.textContent = d.id;
    b.dir = 'ltr';
    const badges = document.createElement('span');
    badges.className = 'mbadges';
    for (const c of d.caps) { const s = document.createElement('span'); s.className = 'badge'; s.textContent = c; badges.appendChild(s); }
    if (d.free) { const f = document.createElement('span'); f.className = 'badge free'; f.textContent = 'رایگان'; badges.appendChild(f); }
    title.append(b, badges);
    main.append(title);
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn-ghost btn-sm ' + (loc ? 'btn-remove' : 'btn-add');
    btn.textContent = loc ? 'حذف' : 'افزودن';
    btn.setAttribute('aria-label', (loc ? 'حذف مدل ' : 'افزودن مدل ') + d.id);
    // Per-row target (ticket/76): each model knows its chain, so no row is ever
    // muted for "wrong chain" — only needs-key disables (remove stays enabled).
    const targetNow = targetForModel(d.id, d.providerId);
    btn.title = !hasKey ? 'اول کلید این ارائه‌دهنده را وارد کن' : ((loc ? 'حذف از زنجیره ' : 'افزودن به زنجیره ') + '(' + targetNow + ')'); btn.disabled = !hasKey && !loc;
    btn.addEventListener('click', () => toggleFlowModel(d.id, d.providerId));
    card.append(main, btn);
    box.appendChild(card);
  }
  const empty = $('m-empty'), err = $('m-err');
  if (empty) {
    empty.hidden = rows.length !== 0;
    const mw = $('m-manual-wrap');
    // Manual-id entry per rail (ticket/45, folds zen-cors): gemini/all → Gemini shape,
    // zenspark → exact `muse-spark-*` shape; other rails → foreign pid, hidden.
    const manualPid = (flowProv === 'gemini' || flowProv === 'all') ? 'gemini' : flowProv === 'zenspark' ? 'zenspark' : null;
    if (mw) {
      mw.hidden = !(rows.length === 0 && manualPid);
      if (!mw.hidden) {
        const inp = $('easy-model-input'), addB = $('btn-easy-add'), hint = $('m-manual-hint');
        if (manualPid === 'zenspark') {
          if (inp) { inp.placeholder = 'muse-spark-…'; inp.setAttribute('aria-label', 'شناسه دستی Zen'); }
          if (addB) addB.textContent = 'افزودن دستی Zen';
          if (hint) { hint.hidden = false; hint.textContent = 'شناسه‌های Zen شکل muse-spark-* دارند.'; }
        } else {
          if (inp) { inp.placeholder = 'gemini-…'; inp.setAttribute('aria-label', 'شناسه دستی Gemini'); }
          if (addB) addB.textContent = 'افزودن دستی Gemini';
          if (hint) hint.hidden = true;
        }
      }
    }
  }
  if (err && !err.dataset.failed) err.hidden = true;
  const retry = $('m-retry');
  if (retry) retry.disabled = !flowLastPid;
  updateNokey();
  const count = $('m-count');
  if (count) {
    const total = sttChainState.length + polishChainState.length;
    const chipLabel = flowChips.size ? [...flowChips].join('+') : 'all';
    count.textContent = `${rows.length} مدل در ${flowScopeLabel()} (چیپ: ${chipLabel}) — ${total} مدل در زنجیره`;
  }
}
function toggleFlowModel(modelId, providerId){
  const mid = String(modelId || '').trim(), pid = String(providerId || '').trim();
  if (!mid || !pid) return;
  const loc = chainLoc(mid, pid);
  if (loc) {
    const arr = loc.type === 'stt' ? sttChainState : polishChainState;
    const [removed] = arr.splice(loc.index, 1);
    lastDeleted = { entry: removed, index: loc.index, type: loc.type };
    persistChains();
    renderAllChains();
    renderFlowList();
    announce(`مدل ${mid} حذف شد — برای بازگردانی «واگرد» را بزن`);
    showUndoToast(mid);
    return;
  }
  const target = targetForModel(mid, pid);
  if (pid === 'gemini' && !/^gemini/i.test(mid)) { Logger.toast('مدل نامعتبر برای STT'); return; }
  if (target === 'stt') {
    if (!isSttEligible(mid, pid)) { Logger.toast('مدل نامعتبر برای STT'); return; }
  }
  if (!Storage.hasKeyForProvider(pid)) { Logger.toast('⚠ این ارائه‌دهنده کلید ندارد'); return; }
  addModelToChain(mid, pid, target);
  renderFlowList();
}
function addModelToChain(modelId, providerId, target){
  const mid = String(modelId||'').trim();
  const pid = String(providerId||'').trim();
  if(!mid || !pid) return;
  if(target==='stt' && !isSttEligible(mid, pid)){ Logger.toast('مدل نامعتبر برای STT'); return; }
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
async function fetchAndShowModels(providerId){
  flowLastPid = providerId;
  const btn = providerId==='groq' ? els.btnGroqModels : providerId==='gemini' ? els.btnGeminiModels : providerId==='zenspark' ? els.btnZenModels : els.btnOrModels;
  const errBox = $('m-err');
  if(btn) btn.textContent='...';
  try{
    saveSettings();
    const ids = await Transcription.listModels(providerId);
    modelCache.set(providerId, ids);
    fetchStamp.set(providerId, 'به‌روزشده: همین حالا (حافظه)');
    if(errBox){ errBox.hidden = true; delete errBox.dataset.failed; }
    renderFlowList();
    Logger.toast(`مدل‌ها: ${ids.length}`);
    announce(`${ids.length} مدل برای ${providerId} بارگذاری شد`);
  }catch(e){ showFetchError(providerId, e); }
  finally{ if(btn) btn.textContent='لیست مدل‌ها'; syncCacheLines(); }
}
els.btnGroqModels?.addEventListener('click', ()=> fetchAndShowModels('groq'));
els.btnGeminiModels?.addEventListener('click', ()=> fetchAndShowModels('gemini'));
els.btnOrModels?.addEventListener('click', ()=> fetchAndShowModels('openrouter'));
els.btnZenModels?.addEventListener('click', ()=> fetchAndShowModels('zenspark'));

// --- models flow card wiring: rail → key card filter + ONE search + ONE chip row + manual Gemini id ---
document.querySelectorAll('#prov-rail button').forEach(b => b.addEventListener('click', ()=>{
  document.querySelectorAll('#prov-rail button').forEach(x => x.classList.remove('active'));
  b.classList.add('active');
  syncRailAria();
  flowProv = b.dataset.prov || 'all';
  const openCard = flowProv === 'groq' ? $('provider-card-groq') : flowProv === 'gemini' ? $('provider-card-gemini') : flowProv === 'openrouter' ? $('provider-card-openrouter') : flowProv === 'zenspark' ? $('provider-card-zenspark') : flowProv === 'custom' ? $('custom-add-card') : null;
  if(openCard && 'open' in openCard) openCard.open = true;
  renderFlowList();
}));
function syncRailAria(){ document.querySelectorAll('#prov-rail button').forEach(x=>x.setAttribute('aria-selected', String(x.classList.contains('active')))); }
syncRailAria();
$('m-q')?.addEventListener('input', renderFlowListSoon);
document.querySelectorAll('#m-chips .fchip').forEach(c => c.addEventListener('click', ()=>{
  const cap = c.dataset.cap;
  if(cap === 'all') flowChips.clear();
  else if(flowChips.has(cap)) flowChips.delete(cap);
  else flowChips.add(cap);
  document.querySelectorAll('#m-chips .fchip').forEach(x=>{
    const on = x.dataset.cap === 'all' ? flowChips.size === 0 : flowChips.has(x.dataset.cap);
    x.classList.toggle('active', on);
    x.setAttribute('aria-pressed', String(on));
  });
  renderFlowList();
}));
$('m-retry')?.addEventListener('click', ()=>{
  if (!flowLastPid) return;
  const err = $('m-err');
  if(err){ err.hidden = true; delete err.dataset.failed; }
  fetchAndShowModels(flowProv === 'all' || flowProv === 'custom' ? flowLastPid : flowProv);
});
$('m-nokey-link')?.addEventListener('click', (e)=>{
  e.preventDefault();
  const card = flowProv === 'groq' ? $('provider-card-groq') : flowProv === 'gemini' ? $('provider-card-gemini') : flowProv === 'zenspark' ? $('provider-card-zenspark') : $('provider-card-openrouter');
  if(card && 'open' in card) card.open = true;
  const input = flowProv === 'groq' ? els.keyGroq : flowProv === 'gemini' ? els.keyGemini : flowProv === 'zenspark' ? els.keyZen : els.keyOpenrouter;
  input?.focus?.();
});
function flowInit(){ renderFlowList(); }

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
      persistChains(); renderCustomProviders(); renderFlowList(); renderAllChains();
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
  renderCustomProviders(); renderFlowList(); renderProvidersStatus();
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
      renderCustomProviders(); renderFlowList(); renderProvidersStatus();
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
  if(!baseURL || !key){ Logger.toast('BaseURL و کلید لازم است'); return; }
  try{
    // Route through Transcription seam so untrusted custom hosts hit the user-confirm gate.
    // Sync form values into the stored provider so listModels uses what the user sees.
    const cur = Storage.getSettings().customProviders.slice();
    Storage.saveSettings({ customProviders: cur.map(x => x.id === stored.id ? { ...x, baseURL, key } : x) });
    const ids = await Transcription.listModels(stored.id);
    modelCache.set(stored.id, ids);
    fetchStamp.set(stored.id, 'به‌روزشده: همین حالا (حافظه)');
    renderFlowList();
    Logger.toast(`مدل‌ها: ${ids.length}`);
    announce(`${ids.length} مدل بارگذاری شد`);
  }catch(e){ flowLastPid = stored.id; showFetchError(stored.id, e); }
});

// --- manual Gemini id (empty-state action): rail provider + target radios → Add ---
$('btn-easy-add')?.addEventListener('click', ()=>{
  let pid = flowProv === 'custom' ? '' : flowProv;
  const mid = (els.easyModelInput?.value || '').trim();
  if(!mid){ Logger.toast('مدل را انتخاب کن'); return; }
  if(flowProv === 'all'){
    // derive provider from the id itself so a Groq id never lands in the gemini chain;
    // paid OpenRouter ids (vendor/model) are indistinguishable from Groq by shape, so:
    // 1) exact hit in any fetched list (covers future releases + custom providers),
    // 2) whisper- only (Groq-exclusive in our provider set) — anything else picks its rail
    if(/^gemini/i.test(mid)) pid = 'gemini';
    else if(mid.includes(':free')) pid = 'openrouter';
    else {
      let hit = '';
      try{ for(const [p, ids] of modelCache){ if(Array.isArray(ids) && ids.includes(mid)){ hit = p; break; } } }catch{}
      if(hit) pid = hit;
      else if(/^whisper/i.test(mid)) pid = 'groq';
      else { Logger.toast('ارائه‌دهنده نامشخص است — ریل ارائه‌دهنده را انتخاب کن'); return; }
    }
  }
  if(!pid){ Logger.toast('ارائه‌دهنده را انتخاب کن'); return; }
  const target = targetForModel(mid, pid);
  if(pid === 'gemini' && !/^gemini/i.test(mid)){ Logger.toast('مدل نامعتبر برای STT'); return; }
  if(target === 'stt'){
    if(!isSttEligible(mid, pid)){ Logger.toast('مدل نامعتبر برای STT'); return; }
  }
  if(!Storage.hasKeyForProvider(pid)){ Logger.toast('⚠ این ارائه‌دهنده کلید ندارد'); return; }
  addModelToChain(mid, pid, target);
  renderFlowList();
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
    muteBtn.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); const live = waveCfg.waves.find(w => w.id === wv.id) || wv; const next = !live.mute; live.mute = next; wv.mute = next; row.classList.toggle('muted', next); paintTitle(); title.classList.toggle('dim', next); paintMute(); wavePersist(); const stored = waveCfg.waves.find(w => w.id === wv.id); if (stored && stored.mute !== next) { wv.mute = stored.mute; row.classList.toggle('muted', stored.mute); paintTitle(); title.classList.toggle('dim', !!stored.mute); paintMute(); } });
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
      inp.addEventListener('keydown', ev => { ev.stopPropagation(); if (ev.key === 'Enter'){ ev.preventDefault(); commit(true); } else if (ev.key === 'Escape'){ ev.preventDefault(); commit(false); } }); // consume: rename owns Enter/Esc (ticket/2x)
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

let lastModalFocus = null; // hoisted above loadSettings(): openModal() assigns it on manual open
loadSettings();
// --- per-chain inline add panels (ticket/76-inline-chain-add): expander + panel under each .chain-foot ---
const CHAIN_EXPAND_LABEL = { stt: '＋ افزودن مدل صوتی', polish: '＋ افزودن ویرایشگر' };
function chainPanelEls(target){
  return target === 'stt'
    ? { btn: els.btnExpandStt, panel: els.sttAddPanel, search: els.sttAddSearch, list: els.sttAddList }
    : { btn: els.btnExpandPolish, panel: els.polishAddPanel, search: els.polishAddSearch, list: els.polishAddList };
}
function chainPanelOpen(target){
  const { panel } = chainPanelEls(target);
  return !!panel && !panel.hidden;
}
function renderChainPanel(target){
  const { list, search } = chainPanelEls(target);
  if(!list) return;
  const q = (search?.value || '').trim().toLowerCase();
  list.innerHTML = '';
  // Pre-scoped per chain from the same sources as the models tab: the STT panel
  // hides t2t-only models outright (no muted rows, no stale-target class); polish shows all.
  const rows = allFlowModels()
    .filter(d => target === 'stt' ? isSttEligible(d.id, d.providerId) : true)
    .filter(d => !q || d.id.toLowerCase().includes(q) || (d.fa || '').includes(q) || String(d.providerId || '').includes(q));
  if(!rows.length){ list.textContent = 'نتیجه‌ای نیست — جست‌وجو را عوض کن.'; return; }
  const chainFa = target === 'stt' ? 'STT' : 'پالیش';
  for(const d of rows){
    let hasKey = false;
    try{ hasKey = Storage.hasKeyForProvider(d.providerId); }catch{ hasKey = false; }
    const loc = chainLoc(d.id, d.providerId);
    const inTarget = !!loc && loc.type === target;
    const card = document.createElement('div');
    card.className = 'mrow';
    card.dataset.p = d.providerId;
    const main = document.createElement('div');
    main.className = 'mmain';
    const title = document.createElement('div');
    title.className = 'mtitle';
    const b = document.createElement('b');
    b.textContent = d.id;
    b.dir = 'ltr';
    const badges = document.createElement('span');
    badges.className = 'mbadges';
    for(const c of d.caps){ const s = document.createElement('span'); s.className = 'badge'; s.textContent = c; badges.appendChild(s); }
    if(d.free){ const f = document.createElement('span'); f.className = 'badge free'; f.textContent = 'رایگان'; badges.appendChild(f); }
    title.append(b, badges);
    main.append(title);
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn-ghost btn-sm';
    if(inTarget){ btn.textContent = 'در زنجیره'; btn.disabled = true; btn.setAttribute('aria-label', d.id + ' در زنجیره ' + chainFa + ' است'); }
    else{
      btn.textContent = 'افزودن';
      btn.classList.add('btn-add');
      btn.setAttribute('aria-label', 'افزودن مدل ' + d.id + ' به زنجیره ' + chainFa);
      btn.title = !hasKey ? 'اول کلید این ارائه‌دهنده را وارد کن' : 'افزودن به زنجیره ' + chainFa;
      btn.disabled = !hasKey;
      btn.addEventListener('click', ()=>{
        addModelToChain(d.id, d.providerId, target); // same target-scoped helper as the models tab
        renderFlowList();
        renderChainPanel(target); // stays open so more models can follow without scrolling
        chainPanelEls(target).search?.focus?.();
      });
    }
    card.append(main, btn);
    list.appendChild(card);
  }
}
function setChainPanel(target, open, focusSearch){
  const { btn, panel, search } = chainPanelEls(target);
  if(!btn || !panel) return;
  panel.hidden = !open;
  btn.setAttribute('aria-expanded', String(open));
  btn.textContent = open ? '－ بستن' : CHAIN_EXPAND_LABEL[target];
  if(open){
    renderChainPanel(target);
    if(focusSearch) search?.focus?.();
  }
}
function toggleChainPanel(target){ setChainPanel(target, !chainPanelOpen(target), true); }
els.btnExpandStt?.addEventListener('click', ()=> toggleChainPanel('stt'));
els.btnExpandPolish?.addEventListener('click', ()=> toggleChainPanel('polish'));
els.sttAddSearch?.addEventListener('input', ()=> renderChainPanel('stt'));
els.polishAddSearch?.addEventListener('input', ()=> renderChainPanel('polish'));
// --- settings modal: focus trap + Esc closes without saving + focus returns to settings button ---
function modalFocusables(){
  const box = els.modal.querySelector('.modal-box');
  if(!box) return [];
  return [...box.querySelectorAll('button, [href], input, select, textarea, summary, [tabindex]:not([tabindex="-1"])')]
    .filter(el=> !el.disabled && el.getClientRects().length > 0);
}
function openModal(){
  lastModalFocus = document.activeElement;
  els.modal.style.display = 'flex';
  try{ if(Storage.getProviders().every(p => !p.hasKey) && els.providerDrawer) els.providerDrawer.open = true; }catch{}
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
  if(e.defaultPrevented) return; // inner layer (chain ⋮ menu, wave rename) already consumed it (ticket/2x)
  if(e.key === 'Escape'){ e.preventDefault(); e.stopPropagation(); const openPanel = ['stt','polish'].find(t => chainPanelOpen(t)); if(openPanel){ setChainPanel(openPanel, false); chainPanelEls(openPanel).btn?.focus?.(); return; } closeModal(); return; } // Esc: open inline add-panel first, else close WITHOUT saving; consumed so recording-cancel never fires
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
selStart=0; selEnd=0; const saveCursor=()=>{ selStart=els.output.selectionStart; selEnd=els.output.selectionEnd; };
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
// Undo scope (ticket/2x): the custom editorHistory runs ONLY while #output itself
// is focused — every other input keeps native undo (this listener lives on
// #output, so there is nothing global to leak).
els.output.addEventListener('keydown', (e)=>{
  if(e.target!==els.output) return;
  if(!(e.ctrlKey||e.metaKey)) return;
  // Persian-layout guard: the physical key still undoes/redoes when the active
  // layout yields ز/ذ — match e.code (layout-independent) as well as e.key.
  const k=(e.key||'').toLowerCase(), c=e.code||'';
  const isZ = k==='z' || c==='KeyZ', isY = k==='y' || c==='KeyY';
  if(isZ){
    e.preventDefault();
    if(e.shiftKey){ const v=editorHistory.redo(); if(v!==null) applyHistoryValue(v); }
    else { const v=editorHistory.undo(); if(v!==null) applyHistoryValue(v); }
  } else if(isY){ e.preventDefault(); const v=editorHistory.redo(); if(v!==null) applyHistoryValue(v); }
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
let discardRecording=false; // cancel during rec: drop the blob instead of transcribing
// ticket 15 — actionbar variant A: hero morph + cancel visible during rec AND transcribing + BIG timer chip
let recStartMs=0, recTimerId=null;
const FA_DIGITS='۰۱۲۳۴۵۶۷۸۹';
function recFa(n){ return String(n).replace(/\d/g, d=> FA_DIGITS[d]); }
function recTimerPaint(){
  const el=document.getElementById('mic-timer');
  if(!el || el.hidden) return;
  const s=Math.max(0, Math.floor((performance.now()-recStartMs)/1000));
  el.textContent=`${recFa(String(Math.floor(s/60)).padStart(2,'0'))}:${recFa(String(s%60).padStart(2,'0'))}`;
}
function recTimerStart(){
  recStartMs=performance.now();
  const el=document.getElementById('mic-timer');
  if(el){ el.hidden=false; el.classList.add('live'); }
  recTimerPaint();
  if(recTimerId) clearInterval(recTimerId);
  recTimerId=setInterval(recTimerPaint, 250);
}
function recTimerStop(){
  if(recTimerId){ clearInterval(recTimerId); recTimerId=null; }
  document.getElementById('mic-timer')?.classList.remove('live');
}
function recTimerReset(){
  recTimerStop();
  const el=document.getElementById('mic-timer');
  if(el){ el.textContent='۰۰:۰۰'; el.hidden=true; }
}
function syncActionbar(){
  const mic=els.btnMic, cb=els.btnCancel, tm=document.getElementById('mic-timer');
  if(!mic) return;
  mic.classList.toggle('recording', isRecording);
  mic.classList.toggle('transcribing', isTranscribing);
  mic.setAttribute('aria-busy', (isRecording||isTranscribing)?'true':'false');
  mic.setAttribute('aria-label', isRecording?'توقف و تبدیل':isTranscribing?'در حال تبدیل':'میکروفون');
  const showCancel=(isRecording||isTranscribing);
  if(cb){
    if(cb.hasAttribute('hidden')!==!showCancel) cb.hidden=!showCancel;
    cb.classList.remove('cancel-appear');
    if(showCancel){ void cb.offsetWidth; cb.classList.add('cancel-appear'); }
  }
  if(tm) tm.hidden=!(isRecording||isTranscribing);
  updateHistoryButtons();
}
function setMicBusy(busy){
  isTranscribing = busy;
  if (els.btnMic) {
    els.btnMic.disabled = busy;
  }
  syncActionbar();
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
  discardRecording = false; // defensive: a missed onStop must never discard a later recording
  if (isTranscribing) { shakeMic(); Logger.toast('⏳ صبر کن — تبدیل ادامه دارد…', 2000); return; }
  saveCursor();
  const s=Storage.getSettings(); if(!s.groqKey&&!s.geminiKey&&!s.openrouterKey){ Logger.setStatus('کلید نداری — ⚙️ نوار پایین را بزن','error'); openModal(); return; }
  let snap=null;
  try{
    snap = { id: ++rtVersion, startMs: 0, basePos: selStart, before: els.output.value.slice(0, selStart), after: els.output.value.slice(selEnd), committed:'', pending:'' };
    rtSnap = snap;
    const vadMs = s.vad ? 250 : undefined;
    await Audio.start({ vadChunkMs: vadMs, onStop: (blob)=> handleTranscription(blob, snap) });
    snap.startMs = performance.now();
    isRecording=true;
    recTimerStart();
    if(s.realtime) els.btnMic.classList.add('realtime-active');
    syncActionbar();
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
  recTimerStop(); // frozen chip stays visible through transcribing (variant A)
  setMicBusy(true);
  transcribingAbort = new AbortController();
  els.btnMic.classList.remove('realtime-active');
  syncActionbar();
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
  if (isRecording) { discardRecording = true; stopRecording(); return; } // variant A: cancel works mid-recording (discard)
  if (transcribingAbort) transcribingAbort.abort();
  // UI handled in handleTranscription catch — keep abort signal until finally
}
els.btnCancel?.addEventListener('click', cancelTranscription);
// Recording-cancel is the LAST Esc resort (ticket/2x layering: tr-panel → diff
// sheet (#83) → settings modal → cancel). Element-level layers consume via
// stopPropagation; same-node document listeners cannot be stopped that way, so
// this handler yields explicitly: it respects e.defaultPrevented AND skips while
// the diff sheet / modal / tr-panel own Esc.
document.addEventListener('keydown', (e)=>{
  if (e.key !== 'Escape' || e.defaultPrevented) return;
  if (shortcutsOpen()) return; // guide owns Esc while open (ticket/51)
  if (diffPending && diffEls().back && !diffEls().back.hidden) return; // #83 owns Esc (registered later on document)
  const trp = $('tr-panel');
  if (trp && !trp.hidden){ e.preventDefault(); trp.hidden = true; return; } // panel fallback: close, never cancel
  if (els.modal && els.modal.style.display === 'flex') return; // modal owns Esc (element handler consumes)
  if (isRecording || (isTranscribing && transcribingAbort)){ e.preventDefault(); e.stopPropagation(); cancelTranscription(); }
});
function startVAD(){ let quiet=0; const loop=()=>{ const an=Audio.getAnalyser(); if(!isRecording||!an) return; const d=new Uint8Array(an.frequencyBinCount); an.getByteFrequencyData(d); const avg=d.reduce((a,b)=>a+b,0)/d.length; if(avg<12) quiet+=250; else quiet=0; if(quiet>1400){ Logger.log('info','VAD سکوت — ارسال'); stopRecording(); return; } vadTimer=setTimeout(loop,250); }; vadTimer=setTimeout(loop,500); }
function stopVAD(){ if(vadTimer) clearTimeout(vadTimer); vadTimer=null; }

async function handleTranscription(blob, snap){
  const snapId = snap?.id;
  const isStale = snap && snapId !== rtVersion;
  if(isStale){ Logger.log('debug','stale transcription ignored',{ snapId, current: rtVersion }); return; }
  if(discardRecording){
    discardRecording = false;
    Logger.log('info','recording discarded by user',{ snapId: snapId||null });
    Logger.toast('ضبط دور ریخته شد', 1500); Logger.setStatus('لغو شد','warn'); Logger.dismissProgress(0);
    setMicBusy(false); transcribingAbort = null;
    recTimerReset(); mainWaveIdle();
    if(!snap || snapId===rtVersion){ rtSnap=null; }
    if(els.liveFinal) els.liveFinal.textContent=''; if(els.liveInterim) els.liveInterim.textContent=''; if(els.livePreview) els.livePreview.classList.remove('on');
    return;
  }
  // busy is set in stopRecording; keep VAD path safe without creating duplicate controller
  if (!isTranscribing) { setMicBusy(true); if (!transcribingAbort) transcribingAbort = new AbortController(); }
  Logger.log('info','handleTrans',{size:blob.size, snapId: snapId||null, rtActive: !!snap, rtPreviewLen: snap ? (snap.committed+snap.pending).length : 0});
  if(blob.size<800){
    Logger.setStatus('صدایی ضبط نشد','warn'); Logger.toast('صدایی نیست');
    Logger.dismissProgress(800);
    setMicBusy(false); transcribingAbort = null;
    recTimerReset(); syncActionbar();
    if(!snap || snapId===rtVersion){ rtSnap=null; }
    if(els.liveFinal) els.liveFinal.textContent=''; if(els.liveInterim) els.liveInterim.textContent=''; if(els.livePreview) els.livePreview.classList.remove('on');
    return;
  }
  try{
    const durationMs = snap?.startMs ? Math.round(performance.now() - snap.startMs) : 0;
    const signal = transcribingAbort?.signal;
    Logger.groupRun('🎙 رونویسی');
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
    editorHistory.push(els.output.value); // no-loss (ticket/2x): explicit push so the pre-insert state stays reachable via Ctrl+Z/redo (the dispatched `input` below then dedups)
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
    recTimerReset(); syncActionbar();
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
$('btn-test-zen').onclick=async()=>{ if(!safeSaveSettings()) return; Logger.setStatus('تست OpenCode_Zen...','warn'); try{ await Transcription.testZenspark(); Logger.setStatus(`✅ OpenCode_Zen اوکی`,'info'); Logger.toast('OpenCode_Zen ok'); }catch(e){ Logger.setStatus('❌ OpenCode_Zen: '+sanitizeMsg(e.message || e),'error'); } };
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
els.btnCopy.onclick=async()=>{
  if(!els.output.value.trim()){ els.btnCopy.classList.remove('shake'); void els.btnCopy.offsetWidth; els.btnCopy.classList.add('shake'); setTimeout(()=>els.btnCopy.classList.remove('shake'),400); Logger.toast('چیزی نیست'); return; }
  try{ await navigator.clipboard.writeText(els.output.value); }catch(e){ Logger.log('warn','clipboard.writeText failed',{msg:e?.message}); Logger.toast('کپی ناموفق — دستی کپی کن'); return; }
  els.btnCopy.classList.add('ok'); setTimeout(()=>els.btnCopy.classList.remove('ok'),1200);
  Logger.toast('کپی شد');
};
els.btnClear.onclick=()=>{ if(!els.output.value.trim()){ els.btnClear.classList.remove('shake'); void els.btnClear.offsetWidth; els.btnClear.classList.add('shake'); setTimeout(()=>els.btnClear.classList.remove('shake'),400); Logger.toast('متن خالی است'); return; } els.output.value=''; Storage.clearDraft(); selStart=selEnd=0; rtSnap=null; if(els.liveFinal) els.liveFinal.textContent=''; if(els.liveInterim) els.liveInterim.textContent=''; if(els.livePreview) els.livePreview.classList.remove('on'); updateCounts(); editorHistory.push(''); Logger.setStatus('آماده','info'); Logger.toast('پاک شد'); };
// --- stagebar (ticket/16): manual polish/translate stages on current text + per-run log groups ---
// Behavior adapted from temp/hamnegar-demo runStage/runTranslate (same owner labels, scope,
// raw stack, language combo); pipelines use the production polish chain + Transcription.translate.
const STAGE_LANGS = [
  ['🇮🇷 فارسی', 'fa'], ['🇬🇧 English', 'en'], ['🇩🇪 Deutsch', 'de'], ['🇫🇷 Français', 'fr'],
  ['🇪🇸 Español', 'es'], ['🇮🇹 Italiano', 'it'], ['🇹🇷 Türkçe', 'tr'], ['🇸🇦 العربية', 'ar'],
  ['🇷🇺 Русский', 'ru'], ['🇨🇳 中文', 'zh'],
];
const SYS_SIMPLE = 'You are a proofreader. Fix only spelling, orthography and punctuation in the SAME language as the input text; never change the language, meaning or tone. If no correction is needed, return the input text verbatim. Return ONLY the corrected text — never commentary, explanation or apology. (If the text is Persian and means UI, «رابطه کاربری» should become «رابط کاربری».)';
const SYS_ADV = 'You are a proofreader. Fix spelling, punctuation and grammar together in the SAME language as the input text; preserve meaning, numbers and names, never change the language or tone. If no correction is needed, return the input text verbatim. Return ONLY the corrected text — never commentary, explanation or apology. (If the text is Persian and means UI, «رابطه کاربری» should become «رابط کاربری».)';
const SYS_GRAMMAR = 'Fix only grammar and word inflection in the SAME language as the input text. Do not change spelling, style or punctuation, do not rewrite, never change the language. If no correction is needed, return the input text verbatim. Return ONLY the corrected text — never commentary, explanation or apology.';
let stageRawStack = [];
const STAGE_RAW_MAX = 25;
// Slice-scoped undo: push the pre-stage scope slice (not the whole doc) so خام
// splices just that slice back — earlier stages' results and foreign edits outside
// the range survive. newEnd is filled in after apply (post-stage range).
function stagePushRaw(scope){
  const entry = { start: scope.start, end: scope.end, text: scope.text, newEnd: scope.end };
  stageRawStack.push(entry);
  while (stageRawStack.length > STAGE_RAW_MAX) stageRawStack.shift();
  const rawBtn = $('stage-raw');
  if (rawBtn) rawBtn.disabled = false;
  return entry;
}
let langHi = 0, langView = STAGE_LANGS.slice();
function stageScope(){
  const v = els.output.value;
  const a = Math.min(selStart, v.length), b = Math.min(selEnd, v.length);
  if (b > a) return { text: v.slice(a, b), start: a, end: b, kind: 'selection', sel: v.slice(a, b) };
  return { text: v, start: 0, end: v.length, kind: 'full' };
}
function updateStageScope(){
  const badge = $('stage-scope');
  if (!badge) return;
  const g = stageScope();
  const base = g.kind === 'selection'
    ? 'دامنه: انتخاب («' + g.sel.slice(0, 24) + (g.sel.length > 24 ? '…' : '') + '»)'
    : 'دامنه: کل متن';
  const eng = engineInfo();
  badge.textContent = `${base} • ${eng.text}`;
  badge.style.opacity = eng.hasKey ? '1' : '0.6';
}
['select', 'keyup', 'mouseup'].forEach(ev => els.output.addEventListener(ev, updateStageScope));
els.output.addEventListener('focus', updateStageScope);
// stagebar button visibility (session-only: storage seam is locked, so no persistence here)
const STAGE_BTNS = [['stage-simple', 'پالایش ساده'], ['stage-advanced', 'پالایش پیشرفته'], ['stage-grammar', 'پالایش دستوری'], ['stage-tr-quick', 'EN⇄FA'], ['stage-tr-panel', 'ترجمه…']];
function stageBarApplyVisibility(){
  const menu = $('stage-edit-menu');
  if (menu && !menu.dataset.built) {
    menu.dataset.built = '1';
    for (const [id, label] of STAGE_BTNS) {
      const lab = document.createElement('label');
      lab.className = 'switch';
      lab.title = 'برداشتن تیک فقط دکمه را پنهان می‌کند؛ ابزار غیرفعال نمی‌شود';
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = true;
      cb.setAttribute('aria-label', 'نمایش دکمه ' + label);
      cb.addEventListener('change', () => { const btn = $(id); if (btn) btn.hidden = !cb.checked; });
      lab.append(cb, document.createTextNode(' نمایش: ' + label));
      menu.appendChild(lab);
    }
  }
}
function stageModelPick(){
  const sel = $('stage-model');
  try { const o = sel?.value && JSON.parse(sel.value); if (o?.id) return o; } catch {}
  const first = polishChainState.find(e => e.enabled !== false);
  if (!first) return null;
  return { id: entryIdOf(first), providerId: providerIdOf(first, 'groq') };
}
function renderStageModelOptions(){
  const sel = $('stage-model');
  if (!sel) return;
  const prev = sel.value;
  sel.innerHTML = '';
  const head = document.createElement('option');
  head.value = '';
  head.textContent = 'خودکار: زنجیرهٔ پالایش به‌ترتیب';
  head.title = 'اگر مدلی انتخاب کنی همان اول امتحان می‌شود؛ وگرنه زنجیرهٔ پالایش به‌ترتیب جلو می‌رود. مدل انتخابیِ بی‌کلید بی‌صدا نادیده گرفته می‌شود و زنجیره ادامه می‌دهد.';
  sel.appendChild(head);
  const seen = new Set();
  for (const e of polishChainState) {
    const id = entryIdOf(e), pid = providerIdOf(e, 'groq');
    const key = `${pid}:${id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const o = document.createElement('option');
    o.value = JSON.stringify({ id, providerId: pid });
    o.textContent = `${id} (${pid})${e.enabled === false ? ' — خاموش' : ''}`;
    sel.appendChild(o);
  }
  if (prev) sel.value = prev;
}
function stageApply(scope, next){
  const v = els.output.value;
  els.output.value = v.slice(0, scope.start) + next + v.slice(scope.end);
  els.output.focus();
  els.output.setSelectionRange(scope.start + next.length, scope.start + next.length);
  saveCursor(); updateCounts(); Storage.saveDraft(els.output.value);
  editorHistory.push(els.output.value);
  updateStageScope(); syncActionbar();
}
function stageQuotaSplit(model, words, chars){
  try {
    Quota.record(model, { durationMs: 0, words, chars, kind: 'postprocess' });
    Quota.render(els.quotaGrid, { period: Dashboard.getPeriod() });
    Dashboard.renderOverall();
  } catch {}
}
// --- apply-diff-confirm (issue #49): result-apply gate — Persian word diff + thin bottom sheet ---
// Pure Persian word diff (DOM-free; verified under node by slicing __DIFF_PURE_START__..__DIFF_PURE_END__).
// __DIFF_PURE_START__
function faNormalizeDiff(s){
  return String(s ?? '')
    .replace(/ي/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/ة/g, 'ه')
    .replace(/[\u064B-\u0652\u0670\u0640]/g, ''); // Arabic diacritics + superscript-alef + tatweel
}
function faTokenizeDiff(s){
  // Words = letters/digits/marks/ZWNJ runs (ZWNJ never splits: «می‌شود» stays one
  // token; diacritics/tatweel stay glued so raw/render token counts match normalized
  // ones); every other non-space char (punctuation «،.؟!;:«»()…» etc.) is its own
  // token, so an unchanged word stays white while attached punctuation highlights alone.
  const m = String(s ?? '').match(/[\p{L}\p{M}\p{N}\u200C]+|[^\s\p{L}\p{M}\p{N}\u200C]/gu);
  return m || [];
}
function diffFaTokens(a, b){
  const n = a.length, m = b.length;
  if (!n && !m) return { ops: [], changed: 0, total: 0, empty: true, fallback: false };
  if (n * m > 40000) return { ops: null, changed: n + m, total: Math.max(n, m), empty: false, fallback: true };
  const W = m + 1;
  const dp = new Uint32Array((n + 1) * W);
  const at = (i, j) => dp[i * W + j];
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--)
    dp[i * W + j] = a[i] === b[j] ? at(i + 1, j + 1) + 1 : Math.max(at(i + 1, j), at(i, j + 1));
  const ops = [];
  let i = 0, j = 0;
  while (i < n && j < m){
    if (a[i] === b[j]) { ops.push({ t: 'eq', a: i, b: j }); i++; j++; }
    else if (at(i + 1, j) >= at(i, j + 1)) { ops.push({ t: 'del', a: i }); i++; }
    else { ops.push({ t: 'ins', b: j }); j++; }
  }
  while (i < n) { ops.push({ t: 'del', a: i }); i++; }
  while (j < m) { ops.push({ t: 'ins', b: j }); j++; }
  diffPairSubstitutions(ops);
  let changed = 0;
  for (const o of ops) if (o.t !== 'eq') changed++;
  const total = Math.max(n, m);
  if (total > 0 && changed / total > 0.6) return { ops: null, changed, total, empty: false, fallback: true };
  return { ops, changed, total, empty: changed === 0, fallback: false };
}
function diffPairSubstitutions(ops){
  // Post-pass: an adjacent DEL+INS run (either order) of small size is a substituted
  // word, not a delete+insert — mark both sides changed. DEL keeps its `a` index,
  // INS keeps its `b` index; the renderer maps each side. Pure runs stay del/ins.
  for (let k = 0; k < ops.length;){
    if (ops[k].t === 'eq' || ops[k].t === 'chg'){ k++; continue; }
    let e = k;
    while (e < ops.length && ops[e].t !== 'eq' && ops[e].t !== 'chg') e++;
    let nd = 0, ni = 0;
    for (let q = k; q < e; q++){ if (ops[q].t === 'del') nd++; else if (ops[q].t === 'ins') ni++; }
    if (nd > 0 && ni > 0 && (e - k) <= 4){
      for (let q = k; q < e; q++) ops[q].t = 'chg';
    }
    k = e;
  }
  return ops;
}
function diffFaSummary(before, after){
  return diffFaTokens(faTokenizeDiff(faNormalizeDiff(before)), faTokenizeDiff(faNormalizeDiff(after)));
}
function diffFaSegments(ops){
  let n = 0, inSeg = false;
  for (const o of ops || []){
    if (o.t === 'eq') inSeg = false;
    else if (!inSeg) { inSeg = true; n++; }
  }
  return n;
}
// __DIFF_PURE_END__
let diffPending = null; // {seq, scope, text, model, faLabel, logTitle, okStatus, okToast, okLog, invoker, state}
let diffRunSeq = 0; // run token: stale resolves (discarded/superseded) are dropped in fillDiffSheet
function diffEls(){
  return {
    back: $('diff-backdrop'), sheet: $('diff-sheet'), title: $('diff-title'), scope: $('diff-scope'), count: $('diff-count'),
    mode: $('diff-mode'), body: $('diff-body'), origWrap: $('diff-orig-wrap'), orig: $('diff-orig'),
    res: $('diff-result'), note: $('diff-note'), apply: $('diff-apply'), discard: $('diff-discard'),
  };
}
function diffFaDigits(n){ return String(n).replace(/\d/g, d => '۰۱۲۳۴۵۶۷۸۹'[+d]); }
function diffScopeLabel(scope){ return scope.kind === 'selection' ? 'دامنه: انتخاب' : 'دامنه: کل متن'; }
function diffRenderSide(el, verbTokens, ops, side){
  el.textContent = '';
  const frag = document.createDocumentFragment();
  let first = true;
  const push = (text, cls) => {
    if (!first) frag.appendChild(document.createTextNode(' '));
    first = false;
    const s = document.createElement('span');
    s.className = cls;
    s.textContent = text;
    frag.appendChild(s);
  };
  for (const o of ops){
    if (o.t === 'eq') push(verbTokens[side === 'a' ? o.a : o.b], 'dd-eq');
    else if (o.t === 'del' && side === 'a') push(verbTokens[o.a], 'dd-del');
    else if (o.t === 'ins' && side === 'b') push(verbTokens[o.b], 'dd-ins');
    else if (o.t === 'chg' && side === 'a' && o.a !== undefined) push(verbTokens[o.a], 'dd-chg');
    else if (o.t === 'chg' && side === 'b' && o.b !== undefined) push(verbTokens[o.b], 'dd-chg');
  }
  if (!first) el.appendChild(frag);
}
function openDiffRunning(faLabel, scope, invoker){
  const d = diffEls();
  if (!d.back) return;
  diffPending = { seq: ++diffRunSeq, scope, text: '', model: '', faLabel, logTitle: '', okStatus: '', okToast: '', okLog: '', invoker: invoker || null, state: 'running' };
  d.title.textContent = faLabel;
  d.scope.textContent = diffScopeLabel(scope);
  d.mode.textContent = 'منبع: ' + faLabel + ' — بدون اجرای دوباره';
  d.count.textContent = 'در حال پردازش…';
  d.note.hidden = true;
  d.body.classList.add('diff-loading');
  d.orig.textContent = '';
  d.res.textContent = '';
  for (let k = 0; k < 3; k++){ const sk = document.createElement('span'); sk.className = 'diff-skel'; d.res.appendChild(sk); }
  d.apply.disabled = true;
  d.back.hidden = false;
}
function fillDiffSheet(p, seq){
  const d = diffEls();
  if (!d.back) return;
  if (!diffPending || diffPending.seq !== seq) return; // stale resolve (discarded or superseded) — drop silently
  const before = p.scope.text, after = p.text;
  const r = diffFaSummary(before, after);
  diffPending = { ...p, seq, invoker: p.invoker || null, state: r.fallback ? 'ready-fallback' : (r.empty ? 'empty' : 'ready') };
  d.title.textContent = p.faLabel;
  d.scope.textContent = diffScopeLabel(p.scope);
  d.mode.textContent = 'منبع: ' + p.faLabel + ' — بدون اجرای دوباره';
  d.body.classList.remove('diff-loading');
  try { d.origWrap.open = !window.matchMedia('(max-width: 640px)').matches; } catch {}
  if (r.fallback){
    d.orig.textContent = before;
    d.res.textContent = after;
    d.note.hidden = false;
    d.note.textContent = 'بازبینی کلی — تغییر زیاد است؛ مقایسه کلمه‌به‌کلمه نمایش داده نشد.';
    d.count.textContent = 'بازبینی کلی';
    d.apply.disabled = false;
  } else if (r.empty){
    d.orig.textContent = before;
    d.res.textContent = after;
    d.note.hidden = false;
    d.note.textContent = 'تغییری نیست';
    d.count.textContent = 'تغییری نیست';
    d.apply.disabled = true;
  } else {
    diffRenderSide(d.orig, faTokenizeDiff(before), r.ops, 'a');
    diffRenderSide(d.res, faTokenizeDiff(after), r.ops, 'b');
    d.note.hidden = true;
    d.count.textContent = diffFaDigits(diffFaSegments(r.ops)) + ' تغییر';
    d.apply.disabled = false;
  }
  d.back.hidden = false;
  (d.apply.disabled ? d.discard : d.apply).focus?.();
}
function closeDiffSheet(){
  const d = diffEls();
  const inv = diffPending?.invoker;
  diffPending = null;
  if (d.back) d.back.hidden = true;
  if (inv?.focus) { try { inv.focus(); } catch {} }
}
function diffApply(){
  const p = diffPending;
  if (!p || (p.state !== 'ready' && p.state !== 'ready-fallback') || !p.text) return;
  const undo = stagePushRaw(p.scope);
  stageApply(p.scope, p.text);
  undo.newEnd = p.scope.start + p.text.length;
  stageQuotaSplit(p.model, p.scope.text.split(/\s+/).length, p.scope.text.length);
  Logger.log('info', p.okLog);
  Logger.setStatus(p.okStatus, 'info');
  Logger.toast(p.okToast);
  Logger.clearRun();
  closeDiffSheet();
}
function diffDiscard(){
  const p = diffPending;
  if (!p) return;
  const had = p.state === 'ready' || p.state === 'ready-fallback';
  closeDiffSheet();
  Logger.clearRun();
  Logger.setStatus('آماده', 'info');
  if (had) Logger.toast('نتیجه دور ریخته شد');
}
$('diff-apply')?.addEventListener('click', diffApply);
$('diff-discard')?.addEventListener('click', diffDiscard);
$('diff-backdrop')?.addEventListener('click', (e) => { if (e.target?.id === 'diff-backdrop') diffDiscard(); });
document.addEventListener('keydown', (e) => {
  if (!diffPending || diffEls().back?.hidden) return;
  if (e.defaultPrevented) return;
  if (shortcutsOpen()) return; // guide owns keys while open (ticket/51)
  const ae = document.activeElement;
  const inModal = els.modal && els.modal.style.display === 'flex' && els.modal.contains(ae);
  if (inModal) return; // modal owns Esc while it has focus
  if (e.key === 'Escape'){ e.preventDefault(); e.stopPropagation(); diffDiscard(); }
  else if (e.key === 'Enter' && !diffEls().apply?.disabled){
    const tag = ae && ae.tagName;
    if (ae === diffEls().discard || tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || tag === 'SUMMARY') return; // let focused controls keep native Enter
    e.preventDefault(); e.stopPropagation(); diffApply();
  }
  else if (e.key === 'Tab'){
    const d = diffEls();
    const items = [...(d.sheet?.querySelectorAll('button:not([disabled]), summary, [href], input, [tabindex]:not([tabindex="-1"])') || [])].filter(el => el.getClientRects().length > 0);
    if (!items.length) return;
    const first = items[0], last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first){ e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last){ e.preventDefault(); first.focus(); }
  }
});
// --- shortcut guide (ticket/51): single source of truth for every user-facing binding ---
// Any PR adding/changing/removing a keydown/keyup listener MUST touch this map:
// the guide dialog AND the title/aria-keyshortcuts hints render from it.
const SHORTCUTS = [
  { id:'undo', keysFa:'Ctrl/⌘ + Z', keys:'Control+z Meta+z', action:'واگرد متن', scope:'کادر خروجی — فقط با فوکوس همین کادر' },
  { id:'redo', keysFa:'Ctrl/⌘ + Shift + Z یا Ctrl/⌘ + Y', keys:'Control+Shift+z Meta+Shift+z Control+y Meta+y', action:'ازنو (برگرداندن واگرد)', scope:'کادر خروجی — فقط با فوکوس همین کادر' },
  { id:'reorder', keysFa:'Ctrl + ↑ / ↓', keys:'Control+ArrowUp Control+ArrowDown', action:'جابه‌جایی ردیف زنجیره', scope:'ردیف فوکوس‌شدهٔ زنجیرهٔ STT/پالیش' },
  { id:'guide', keysFa:'؟ / ?', keys:'?', action:'باز کردن همین راهنما', scope:'هرجا بیرون از ورودی‌های متن' },
  { id:'enter-diff', keysFa:'Enter', keys:'Enter', action:'اعمال نتیجه', scope:'شیت بازبینی باز — زمینه‌ای', contextual:true },
  { id:'enter-lang', keysFa:'Enter', keys:'Enter', action:'اجرای ترجمه به زبان برجسته', scope:'جست‌وجوی زبان — زمینه‌ای', contextual:true },
  { id:'enter-rename', keysFa:'Enter', keys:'Enter', action:'تأیید نام', scope:'تغییرنام موج — زمینه‌ای', contextual:true },
  { id:'esc-guide', keysFa:'Esc', keys:'Escape', layer:1, action:'بستن همین راهنما', scope:'راهنما باز' },
  { id:'esc-tr', keysFa:'Esc', keys:'Escape', layer:2, action:'بستن پنل ترجمه', scope:'پنل ترجمه باز' },
  { id:'esc-diff', keysFa:'Esc', keys:'Escape', layer:3, action:'دور ریختن نتیجه', scope:'شیت بازبینی باز' },
  { id:'esc-modal', keysFa:'Esc', keys:'Escape', layer:4, action:'بستن مدال تنظیمات (اول پنل افزودن، بعد مدال — بدون ذخیره)', scope:'مدال تنظیمات باز' },
  { id:'esc-cancel', keysFa:'Esc', keys:'Escape', layer:5, action:'لغو ضبط/رونویسی', scope:'حین ضبط یا رونویسی — آخرین راه' },
];
function shortcutById(id){ return SHORTCUTS.find(s => s.id === id); }
function shortcutsOpen(){ return !($('shortcuts-backdrop')?.hidden ?? true); }
function renderShortcuts(){
  const tb = $('shortcuts-rows');
  if (tb){
    tb.innerHTML = '';
    for (const s of SHORTCUTS.filter(s => !s.layer)){
      const tr = document.createElement('tr');
      const tdK = document.createElement('td'); tdK.className = 'sc-keys'; tdK.textContent = s.keysFa; tdK.dir = 'auto';
      const tdA = document.createElement('td'); tdA.textContent = s.action;
      const tdS = document.createElement('td'); tdS.className = 'sc-scope'; tdS.textContent = s.scope;
      tr.append(tdK, tdA, tdS);
      tb.appendChild(tr);
    }
  }
  const ol = $('shortcuts-esc-order');
  if (ol){
    ol.innerHTML = '';
    for (const s of SHORTCUTS.filter(s => s.layer).sort((a, b) => a.layer - b.layer)){
      const li = document.createElement('li');
      li.textContent = `Esc — ${s.action} (${s.scope})`;
      ol.appendChild(li);
    }
  }
}
let lastShortcutsFocus = null;
function openShortcuts(){
  renderShortcuts();
  const back = $('shortcuts-backdrop');
  if (!back || !back.hidden) return;
  lastShortcutsFocus = document.activeElement;
  back.hidden = false;
  $('shortcuts-close')?.focus?.();
}
function closeShortcuts(){
  const back = $('shortcuts-backdrop');
  if (!back || back.hidden) return;
  back.hidden = true;
  if (lastShortcutsFocus?.focus) lastShortcutsFocus.focus();
  else $('btn-shortcuts')?.focus?.();
}
function applyShortcutHints(){
  const set = (el, ids) => {
    if (!el) return;
    const list = ids.map(shortcutById).filter(Boolean);
    if (!list.length) return;
    el.setAttribute('aria-keyshortcuts', list.map(s => s.keys).join(' '));
    const hint = list.map(s => s.keysFa).join(' یا ');
    const t = el.getAttribute('title') || '';
    if (!t.includes(hint)) el.setAttribute('title', (t ? t + ' — ' : '') + hint);
  };
  set(els.output, ['undo', 'redo']);
  set($('btn-undo'), ['undo']);
  set($('btn-redo'), ['redo']);
  set($('btn-shortcuts'), ['guide']);
  set($('btn-cancel-stt'), ['esc-cancel']);
  set($('diff-discard'), ['esc-diff']);
  set($('diff-apply'), ['enter-diff']);
  set($('stage-lang-search'), ['enter-lang', 'esc-tr']);
  set($('settings-modal'), ['esc-modal']);
  set($('btn-close-modal'), ['esc-modal']);
  set($('diff-sheet'), ['esc-diff']);
  set($('tr-panel'), ['esc-tr']);
}
$('btn-shortcuts')?.addEventListener('click', openShortcuts);
$('shortcuts-close')?.addEventListener('click', closeShortcuts);
$('shortcuts-backdrop')?.addEventListener('click', (e) => { if (e.target?.id === 'shortcuts-backdrop') closeShortcuts(); });
$('shortcuts-dialog')?.addEventListener('keydown', (e) => {
  if (e.key === 'Escape'){ e.preventDefault(); e.stopPropagation(); closeShortcuts(); return; } // consume: topmost layer owns Esc
  if (e.key !== 'Tab') return;
  const items = [...($('shortcuts-dialog')?.querySelectorAll('button:not([disabled])') || [])].filter(el => el.getClientRects().length > 0);
  if (!items.length) return;
  const first = items[0], last = items[items.length - 1];
  if (e.shiftKey && document.activeElement === first){ e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && document.activeElement === last){ e.preventDefault(); first.focus(); }
});
document.addEventListener('keydown', (e) => {
  if (e.defaultPrevented) return;
  if (shortcutsOpen()) return;
  if (e.key !== '?' && e.key !== '؟') return;
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const t = e.target, tag = t?.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || t?.isContentEditable) return; // inert inside text inputs
  e.preventDefault();
  openShortcuts();
});
applyShortcutHints();
function setStageBusy(b){ for(const id of ['stage-simple','stage-advanced','stage-grammar','stage-tr-quick','stage-tr-panel','stage-raw']){ const el = $(id); if(el) el.disabled = b; } if(!b){ const raw = $('stage-raw'); if(raw) raw.disabled = !stageRawStack.length; } }
async function runStage(kind, faLabel, sysPrompt, logTitle){
  const scope = stageScope();
  if (!scope.text.trim()) { Logger.toast('متنی برای پالایش نیست'); return; }
  const invoker = document.activeElement;
  if (diffPending && diffEls().back && !diffEls().back.hidden){ Logger.toast('نتیجه بازبینی‌نشده — اول اعمال یا دور بریز'); return; }
  const vlen = els.output.value.length;
  Logger.groupRun(logTitle);
  Logger.setStatus('✨ ' + faLabel + '…', 'warn');
  setStageBusy(true);
  openDiffRunning(faLabel, scope, invoker);
  const mySeq = diffPending ? diffPending.seq : -1;
  try {
    // Explicit stage-model choice (dropdown) goes first, rest of the enabled chain
    // stays as fallback; default (head option) follows chain order. Layer 'polish'
    // keeps the polish guards in validatePolishOutput.
    const pick = stageModelPick();
    const explicit = $('stage-model')?.value ? pick : null;
    const preferOk = explicit && Storage.hasKeyForProvider(providerIdOf(explicit, 'groq'));
    if(explicit && !preferOk) Logger.log('warn','مدل ترجیحی بی‌کلید — از زنجیره استفاده شد',{id:explicit.id});
    const out = await Transcription.textChain(scope.text, { system: sysPrompt, layer: 'polish', ...(explicit ? { prefer: explicit } : {}) });
    if(els.output.value.length !== vlen){ closeDiffSheet(); Logger.clearRun(); Logger.log('warn','متن حین اجرا عوض شد — نتیجه دور ریخته شد'); Logger.toast('متن حین اجرا عوض شد — دوباره بزن'); return; }
    // apply-diff-confirm (#49): gate the result behind the bottom sheet instead of
    // direct-apply — Apply replays stagePushRaw+stageApply verbatim; quota fires there.
    fillDiffSheet({ kind: 'polish', scope, text: out.text, model: out.model, faLabel, logTitle,
      okStatus: '✅ ' + faLabel + ' نشست',
      okToast: faLabel + (scope.kind === 'selection' ? ' روی انتخاب ✓' : ' روی کل ✓'),
      okLog: `${logTitle} نشست — دامنه: ${scope.kind === 'selection' ? 'انتخاب' : 'کل'} — مدل: ${out.model} (${out.providerId})`,
      invoker }, mySeq);
    return;
  } catch (e) {
    closeDiffSheet();
    const safe = sanitizeMsg(e.message || e);
    Logger.setStatus('❌ ' + faLabel + ': ' + safe, 'error');
    Logger.toast('❌ ' + faLabel + ': ' + safe.slice(0, 60));
    Logger.clearRun();
  } finally { setStageBusy(false); }
}
async function runTranslate(code){
  const scope = stageScope();
  if (!scope.text.trim()) { Logger.toast('متنی برای ترجمه نیست'); return; }
  const invoker = document.activeElement;
  if (diffPending && diffEls().back && !diffEls().back.hidden){ Logger.toast('نتیجه بازبینی‌نشده — اول اعمال یا دور بریز'); return; }
  const vlen = els.output.value.length;
  Logger.groupRun('🌐 ترجمه → ' + code);
  Logger.setStatus('🌐 ترجمه → ' + code + '…', 'warn');
  setStageBusy(true);
  openDiffRunning('ترجمه → ' + code, scope, invoker);
  const mySeq = diffPending ? diffPending.seq : -1;
  try {
    const pick = stageModelPick();
    const explicit = $('stage-model')?.value ? pick : null;
    const preferOk = explicit && Storage.hasKeyForProvider(providerIdOf(explicit, 'groq'));
    if(explicit && !preferOk) Logger.log('warn','مدل ترجیحی بی‌کلید — از زنجیره استفاده شد',{id:explicit.id});
    const res = await Transcription.translate(scope.text, code, preferOk ? explicit : undefined);
    if(els.output.value.length !== vlen){ closeDiffSheet(); Logger.clearRun(); Logger.log('warn','متن حین اجرا عوض شد — نتیجه دور ریخته شد'); Logger.toast('متن حین اجرا عوض شد — دوباره بزن'); return; }
    const out = res.text;
    // apply-diff-confirm (#49): gate the result behind the bottom sheet instead of
    // direct-apply — Apply replays stagePushRaw+stageApply verbatim; quota fires there.
    fillDiffSheet({ kind: 'translate', scope, text: out, model: res.model, faLabel: 'ترجمه → ' + code, logTitle: '🌐 ترجمه → ' + code,
      okStatus: '✅ ترجمه نشست',
      okToast: 'ترجمه → ' + code + ' ✓',
      okLog: `🌐 ترجمه → ${code} نشست — دامنه: ${scope.kind === 'selection' ? 'انتخاب' : 'کل'} — مدل: ${res.model} (${res.providerId})`,
      invoker }, mySeq);
    return;
  } catch (e) {
    closeDiffSheet();
    const safe = sanitizeMsg(e.message || e);
    Logger.setStatus('❌ ترجمه: ' + safe, 'error');
    Logger.toast('❌ ترجمه: ' + safe.slice(0, 60));
    Logger.clearRun();
  } finally { setStageBusy(false); }
}
$('stage-simple')?.addEventListener('click', () => runStage('simple', 'پالایش ساده', SYS_SIMPLE, '✨ پالایش ساده'));
$('stage-advanced')?.addEventListener('click', () => runStage('advanced', 'پالایش پیشرفته', SYS_ADV, '✨ پالایش پیشرفته'));
$('stage-grammar')?.addEventListener('click', () => runStage('grammar', 'پالایش دستوری', SYS_GRAMMAR, '📝 پالایش دستوری'));
$('stage-tr-quick')?.addEventListener('click', () => {
  const t = els.output.value.trim();
  // Rationale: ASCII-only Latin text is most likely English → 'fa'. Latin with
  // diacritics (äöüßéèêàçñ…) is likely another European language → 'en', and
  // non-Latin scripts (Persian/Arabic/CJK…) → 'en'. Heuristic only — the
  // «ترجمه…» panel is the escape hatch for misses.
  let code = 'en';
  if (/[A-Za-z]/.test(t) && !/[^\x00-\x7F]/.test(t)) code = 'fa';
  runTranslate(code);
});
$('stage-tr-panel')?.addEventListener('click', (e) => {
  const p = $('tr-panel');
  if (!p) return;
  p.hidden = !p.hidden;
  e.currentTarget.setAttribute('aria-pressed', String(!p.hidden));
  if (!p.hidden) { $('stage-lang-search')?.focus(); renderLangs(); }
});
$('stage-raw')?.addEventListener('click', () => {
  const prev = stageRawStack.pop();
  if (prev == null) return;
  const v = els.output.value;
  const start = Math.max(0, Math.min(prev.start, v.length));
  const newEnd = Math.max(start, Math.min(prev.newEnd ?? prev.end, v.length));
  const restored = v.slice(0, start) + prev.text + v.slice(newEnd);
  els.output.value = restored;
  els.output.focus();
  try { els.output.setSelectionRange(start + prev.text.length, start + prev.text.length); } catch {}
  saveCursor(); updateCounts(); Storage.saveDraft(restored);
  editorHistory.push(restored);
  const rawBtn = $('stage-raw');
  if (rawBtn) rawBtn.disabled = !stageRawStack.length;
  updateStageScope(); syncActionbar();
  Logger.log('info', '↩ برگشت به خام (دامنه)', { chars: prev.text.length });
  Logger.toast('به خام برگشت');
});
// searchable language combo (~10 langs, filter + ↑↓ + Enter, outside-click/Esc close)
function renderLangs(){
  const box = $('stage-lang-opts');
  if (!box) return;
  box.innerHTML = '';
  (langView.length ? langView : [['— موردی نیست', '__none__']]).forEach(([label, code], i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = label;
    b.setAttribute('role', 'option');
    if (i === langHi) b.classList.add('hl');
    b.addEventListener('mouseenter', () => { langHi = i; paintLangHi(); });
    b.addEventListener('click', () => {
      if (code !== '__none__') { const p = $('tr-panel'); if (p) p.hidden = true; runTranslate(code); }
    });
    box.appendChild(b);
  });
}
function paintLangHi(){
  const box = $('stage-lang-opts');
  if (!box) return;
  [...box.children].forEach((x, i) => x.classList.toggle('hl', i === langHi));
}
$('stage-lang-search')?.addEventListener('input', (e) => {
  const q = e.target.value.trim().toLowerCase();
  langView = STAGE_LANGS.filter(([l, c]) => l.toLowerCase().includes(q) || c.includes(q));
  langHi = 0;
  renderLangs();
});
$('stage-lang-search')?.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowDown') { e.preventDefault(); langHi = Math.min(langView.length - 1, langHi + 1); paintLangHi(); }
  else if (e.key === 'ArrowUp') { e.preventDefault(); langHi = Math.max(0, langHi - 1); paintLangHi(); }
  else if (e.key === 'Enter' && langView[langHi]) { const p = $('tr-panel'); if (p) p.hidden = true; runTranslate(langView[langHi][1]); }
  else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); const p = $('tr-panel'); if (p) p.hidden = true; } // consume: topmost layer owns Esc — must never reach recording-cancel (ticket/2x)
});
document.addEventListener('click', (e) => {
  const panel = $('tr-panel');
  if (panel && !panel.hidden && !e.target.closest('#tr-panel') && !e.target.closest('#stage-tr-panel')) panel.hidden = true;
  const det = $('stage-settings');
  if (det && det.open && !e.target.closest('#stage-settings')) det.removeAttribute('open');
});
const _renderAllChainsBase = renderAllChains;
renderAllChains = function(){ _renderAllChainsBase(); try { renderStageModelOptions(); } catch {} };
stageBarApplyVisibility();
renderStageModelOptions();
updateStageScope();
mainWaveInit();
const verEl = document.getElementById('settings-version'); if (verEl) verEl.textContent = `v${VERSION}`;
Dashboard.ensureReportUI();
Logger.log('info',`هم‌نگار v${VERSION} (${BUILD}) آماده`, {hasRealtime: Realtime.isSupported(), proto: location.protocol, version: VERSION});
Quota.render(els.quotaGrid, { period: Dashboard.getPeriod() });
Dashboard.renderOverall();
