// Chains + models-flow UI: preference chains, model cards, custom providers,
// manual ids and per-chain inline add panels.
// Extracted verbatim from js/app.js (ticket 30-chains-extract) — logic, order,
// strings, aria, focus-after-mutation and timers unchanged. Only wrappers added:
// module imports/exports plus dependency injection (see mountChains).
// Seam: Logger/UI vitrine region (chains only).
import { Storage } from './storage.js';
import { resolve as resolveProvider, hasKey as hasProviderKey, hasKeyById, canonicalize } from './provider.js';
import { Logger } from './logger.js';
import { Transcription } from './transcription.js';
import { Quota } from './quota.js';
import { Dashboard } from './dashboard.js';
import { esc } from './format.js';
import { $ } from './dom.js';

// --- injected app.js collaborators (assigned once in mountChains) ---
// els is the shared element map built in app.js (single way to reach named
// nodes; the imported $() from dom.js covers only the ad-hoc lookups the moved code
// already did). updateBadge/saveSettings/shortcutsOpen/renderProvidersStatus
// are hoisted app.js functions passed by reference; onChainsRendered replaces
// the old end-of-file renderAllChains reassignment (imports are read-only).
let els = null;
let updateBadge = () => {};
let saveSettings = () => {};
let shortcutsOpen = () => false;
let renderProvidersStatus = () => {};
let onChainsRendered = null;

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
// --- persist timing (ticket 41): free mutation + debounced flush -> one render cascade ---
let chainPersistTimer = null;
let chainPending = false;
function scheduleChainsPersist(){ chainPending = true; if(chainPersistTimer) clearTimeout(chainPersistTimer); chainPersistTimer = setTimeout(()=> flushChains(), 300); }
function flushChains(){ if(chainPersistTimer){ clearTimeout(chainPersistTimer); chainPersistTimer = null; } if(!chainPending) return; chainPending = false; Storage.saveSettings({ sttChain: sttChainState, polishChain: polishChainState, polishEnabled: els.togglePolish?.checked ?? true }); try{ updateBadge(); }catch{} try{ Quota.render(els.quotaGrid, { period: Dashboard.getPeriod() }); }catch{} try{ Dashboard.renderOverall(); }catch{} try{ renderAllChains(); }catch{} }

// Live accessors for app.js-owned call sites (loadSettings/saveSettings/reset:
// they reassign, so callers must read/write through these, never a snapshot).
export function getSttChain(){ return sttChainState; }
export function setSttChain(next){ sttChainState = next; }
export function getPolishChain(){ return polishChainState; }
export function setPolishChain(next){ polishChainState = next; }

// Canonical chain entry: {id, providerId, enabled}. Legacy `provider` alias + bare strings tolerated on read.
// Single implementation lives in js/modules/provider.js (ticket 37); these are
// thin same-name adapters so the app.js/stagebar/settingsModal injection keeps working.
export function providerIdOf(entry, fallback){
  return resolveProvider(entry, fallback);
}
export function entryIdOf(entry){ return typeof entry === 'object' ? entry.id : entry; }
export function hasKeyFor(entry){
  return hasProviderKey(entry, 'google');
}
function hasKeyForPolish(entry){
  return hasProviderKey(entry, 'groq');
}

// --- chain/model a11y: single role=status live region + delete-with-undo (seam: ui behavior) ---
const liveEl = $('chain-live');
function announce(msg){
  if(!liveEl) return;
  const text = String(msg || '').slice(0, 200);
  liveEl.textContent = '';
  setTimeout(()=>{ liveEl.textContent = text; }, 30);
}
// Strip anything key-like before it reaches announcements/toasts/log-adjacent text.
export function sanitizeMsg(msg){
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
  scheduleChainsPersist();
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
    const providerId = providerIdOf(entry, type === 'stt' ? 'google' : 'groq');
    const enabled = typeof entry === 'object' ? entry.enabled!==false : true;
    const meta = (type==='stt' ? STT_LABELS[id] : POLISH_LABELS[id]) || {label:id, sub:''};
    const hasKey = hasKeyById(providerId);
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
      if(typeof arr[idx]==='string') arr[idx]={id:arr[idx], providerId: providerIdOf(arr[idx], type==='stt'?'google':'groq'), enabled:e.target.checked};
      else { arr[idx].providerId = providerIdOf(arr[idx], type==='stt'?'google':'groq'); arr[idx].enabled = e.target.checked; }
      scheduleChainsPersist();
      announce(`مدل ${meta.label} ${e.target.checked?'روشن':'خاموش'} شد`);
      focusChainRow(type, idx, '[data-toggle]');
    });
    item.querySelector('[data-remove]')?.addEventListener('click', ()=>{
      const arr = type==='stt'? sttChainState : polishChainState;
      const [removed] = arr.splice(idx,1);
      lastDeleted = { entry: removed, index: idx, type };
      scheduleChainsPersist();
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
    scheduleChainsPersist();
  };
}

function moveChain(type, idx, dir){
  const arr = type==='stt'? sttChainState : polishChainState;
  const n = idx+dir;
  if(n<0||n>=arr.length) return;
  [arr[idx], arr[n]] = [arr[n], arr[idx]];
  scheduleChainsPersist();
  announce(`«${labelOf(arr[n], type)}» به جایگاه ${n+1} از ${arr.length} منتقل شد`);
  focusChainRow(type, n);
}

export function renderAllChains(){
  renderChain(els.sttChain, sttChainState, 'stt');
  renderChain(els.polishChain, polishChainState, 'polish');
  const hint = document.getElementById('polish-disabled-hint');
  if(hint) hint.style.display = els.togglePolish?.checked ? 'none' : 'block';
  // Single deliberate non-verbatim line: replaces the old app.js end-of-file
  // `renderAllChains = ...Stagebar.renderStageModelOptions` reassignment, which
  // ES-module read-only imports make impossible — the refresh rides as a hook.
  try { onChainsRendered?.(); } catch {}
}

export function persistChains(){ scheduleChainsPersist(); }

// --- models flow card (ticket/08): rail is single truth, inline key cards, ONE search + ONE chip row → flat list ---
// Data source is modelCache (Transcription.listModels) + known chain labels; rows toggle real chains.
const modelCache = new Map(); // providerId -> string[]
const fetchStamp = new Map(); // providerId -> cache-line label
let flowProv = 'all';
let flowChips = new Set(); // multi-select: empty = all; 'stt'/'t2t' = capability OR, 'free' = AND modifier
let flowLastPid = null; // unknown until first fetch succeeds/fails — gates m-retry (disabled pre-fetch)
let flowRenderT = null; // debounce: validate()/search fire per keystroke, list rebuild is ~30 nodes
export function renderFlowListSoon(){ clearTimeout(flowRenderT); flowRenderT = setTimeout(()=>{ try{ renderFlowList(); }catch{} }, 150); }
function flowProviderLabel(pid){
  if (pid === 'groq') return 'Groq';
  if (pid === 'gemini' || pid === 'google') return 'Google AI Studio';
  if (pid === 'openrouter') return 'OpenRouter';
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
  for (const id of Object.keys(STT_LABELS)) if (id !== 'groq') push(id, /^gemini/i.test(id) ? 'google' : 'groq');
  for (const id of Object.keys(POLISH_LABELS)) push(id, providerIdOf({ id }, 'groq'));
  for (const [pid, ids] of modelCache) for (const id of (ids || [])) push(id, canonicalize(pid) || pid);
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
    : flowProv === 'custom' ? 'سفارشی' : flowProv;
}
function renderKeyVisibility(){
  const show = {
    groq: flowProv === 'all' || flowProv === 'groq',
    gemini: flowProv === 'all' || flowProv === 'gemini',
    openrouter: flowProv === 'all' || flowProv === 'openrouter',
    custom: flowProv === 'all' || flowProv === 'custom',
  };
  const cardGroq = $('provider-card-groq'), cardGemini = $('provider-card-gemini'), cardOr = $('provider-card-openrouter');
  const customList = $('custom-providers-list'), customAdd = $('custom-add-card');
  if (cardGroq) cardGroq.hidden = !show.groq;
  if (cardGemini) cardGemini.hidden = !show.gemini;
  if (cardOr) cardOr.hidden = !show.openrouter;
  if (customList) customList.hidden = !show.custom;
  if (customAdd) customAdd.hidden = !show.custom;
}
function updateNokey(){
  const el = $('m-nokey');
  if (!el) return;
  if (flowProv === 'all' || flowProv === 'custom') { el.hidden = true; return; }
  let has = false;
  try{ has = hasKeyById(flowProv); }catch{}
  el.hidden = has;
}
function syncCacheLines(){
  for (const pid of ['groq', 'gemini', 'openrouter']) {
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
    .filter(d => flowProv === 'all' ? true : flowProv === 'custom' ? !['groq', 'gemini', 'openrouter'].includes(d.providerId) : d.providerId === flowProv || (flowProv === 'gemini' && d.providerId === 'google'))
    .filter(d => {
      const capsSel = [...flowChips].filter(c => c === 'stt' || c === 't2t');
      if (capsSel.length && !capsSel.some(c => d.caps.includes(c))) return false;
      if (flowChips.has('free') && !d.free) return false;
      return true;
    })
    .filter(d => !q || d.id.toLowerCase().includes(q) || (d.fa || '').includes(q) || String(d.providerId || '').includes(q));
  for (const d of rows) {
    const hasKey = (() => { try { return hasKeyById(d.providerId); } catch { return false; } })();
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
    // Manual-id entry per rail (ticket/45): gemini/all → Gemini shape;
    // other rails → foreign pid, hidden.
    const manualPid = (flowProv === 'gemini' || flowProv === 'all') ? 'google' : null;
    if (mw) {
      mw.hidden = !(rows.length === 0 && manualPid);
      if (!mw.hidden) {
        const inp = $('easy-model-input'), addB = $('btn-easy-add'), hint = $('m-manual-hint');
        if (inp) { inp.placeholder = 'gemini-…'; inp.setAttribute('aria-label', 'شناسه دستی Gemini'); }
        if (addB) addB.textContent = 'افزودن دستی Gemini';
        if (hint) hint.hidden = true;
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
    scheduleChainsPersist();
    renderFlowList();
    announce(`مدل ${mid} حذف شد — برای بازگردانی «واگرد» را بزن`);
    showUndoToast(mid);
    return;
  }
  const target = targetForModel(mid, pid);
  if (pid === 'google' && !/^gemini/i.test(mid)) { Logger.toast('مدل نامعتبر برای STT'); return; }
  if (target === 'stt') {
    if (!isSttEligible(mid, pid)) { Logger.toast('مدل نامعتبر برای STT'); return; }
  }
  if (!hasKeyById(pid)) { Logger.toast('⚠ این ارائه‌دهنده کلید ندارد'); return; }
  addModelToChain(mid, pid, target);
  renderFlowList();
}
function addModelToChain(modelId, providerId, target){
  const mid = String(modelId||'').trim();
  const pid = String(providerId||'').trim();
  if(!mid || !pid) return;
  if(target==='stt' && !isSttEligible(mid, pid)){ Logger.toast('مدل نامعتبر برای STT'); return; }
  if(target==='stt'){
    if(sttChainState.some(x=> entryIdOf(x)===mid && providerIdOf(x,'google')===pid)){ Logger.toast('قبلاً هست'); return; }
    sttChainState.push({ id:mid, providerId:pid, enabled:true });
  } else {
    if(polishChainState.some(x=> entryIdOf(x)===mid && providerIdOf(x,'groq')===pid)){ Logger.toast('قبلاً هست'); return; }
    polishChainState.push({ id:mid, providerId:pid, enabled:true });
  }
  scheduleChainsPersist();
  const list = target === 'stt' ? sttChainState : polishChainState;
  announce(`مدل ${mid} در جایگاه ${list.length} از ${list.length} به زنجیره ${target==='stt'?'STT':'پالیش'} اضافه شد`);
  Logger.toast('افزوده شد');
}
async function fetchAndShowModels(providerId){
  flowLastPid = providerId;
  // Rail-vocabulary compat: 'gemini' here is the models-tab rail/filter/DOM key
  // (btnGeminiModels, provider-card-gemini, cache-gemini in index.html), not the
  // canonical identity — canonicalize() above maps it to 'google' for all
  // identity logic (chainLoc/hasKey/dedup).
  const btn = providerId==='groq' ? els.btnGroqModels : providerId==='gemini' ? els.btnGeminiModels : els.btnOrModels;
  const errBox = $('m-err');
  if(btn) btn.textContent='...';
  try{
    saveSettings();
    const ids = await Transcription.listModels(providerId);
    modelCache.set(canonicalize(providerId) || providerId, ids);
    fetchStamp.set(providerId, 'به‌روزشده: همین حالا (حافظه)');
    if(errBox){ errBox.hidden = true; delete errBox.dataset.failed; }
    renderFlowList();
    Logger.toast(`مدل‌ها: ${ids.length}`);
    announce(`${ids.length} مدل برای ${providerId} بارگذاری شد`);
  }catch(e){ showFetchError(providerId, e); }
  finally{ if(btn) btn.textContent='لیست مدل‌ها'; syncCacheLines(); }
}

// --- custom providers (providers tab only) ---
function slugifyCustomId(name){
  const base = String(name||'').trim().toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'');
  return 'custom-' + (base || 'provider');
}
export function renderCustomProviders(){
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
      scheduleChainsPersist(); renderCustomProviders(); renderFlowList();
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
export function flowInit(){ renderFlowList(); }

// --- per-chain inline add panels (ticket/76-inline-chain-add): expander + panel under each .chain-foot ---
const CHAIN_EXPAND_LABEL = { stt: '＋ افزودن مدل صوتی', polish: '＋ افزودن ویرایشگر' };
export function chainPanelEls(target){
  return target === 'stt'
    ? { btn: els.btnExpandStt, panel: els.sttAddPanel, search: els.sttAddSearch, list: els.sttAddList }
    : { btn: els.btnExpandPolish, panel: els.polishAddPanel, search: els.polishAddSearch, list: els.polishAddList };
}
export function chainPanelOpen(target){
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
    try{ hasKey = hasKeyById(d.providerId); }catch{ hasKey = false; }
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
export function setChainPanel(target, open, focusSearch){
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

// Thin wiring entry: assigns injected collaborators, then registers listeners in
// the original relative order (models-flow block, then inline-panel block).
export function mountChains(deps){
  els = deps.els;
  updateBadge = deps.updateBadge;
  saveSettings = deps.saveSettings;
  shortcutsOpen = deps.shortcutsOpen;
  renderProvidersStatus = deps.renderProvidersStatus;
  onChainsRendered = deps.onChainsRendered || null;
  els.btnGroqModels?.addEventListener('click', ()=> fetchAndShowModels('groq'));
  els.btnGeminiModels?.addEventListener('click', ()=> fetchAndShowModels('gemini'));
  els.btnOrModels?.addEventListener('click', ()=> fetchAndShowModels('openrouter'));

  // --- models flow card wiring: ONE search + ONE chip row + manual Gemini id ---
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
    const card = flowProv === 'groq' ? $('provider-card-groq') : flowProv === 'gemini' ? $('provider-card-gemini') : $('provider-card-openrouter');
    if(card && 'open' in card) card.open = true;
    const input = flowProv === 'groq' ? els.keyGroq : flowProv === 'gemini' ? els.keyGemini : els.keyOpenrouter;
    input?.focus?.();
  });
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
      if(/^gemini/i.test(mid)) pid = 'google';
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
    if(pid === 'google' && !/^gemini/i.test(mid)){ Logger.toast('مدل نامعتبر برای STT'); return; }
    if(target === 'stt'){
      if(!isSttEligible(mid, pid)){ Logger.toast('مدل نامعتبر برای STT'); return; }
    }
    if(!hasKeyById(pid)){ Logger.toast('⚠ این ارائه‌دهنده کلید ندارد'); return; }
    addModelToChain(mid, pid, target);
    renderFlowList();
  });
  $('btn-polish-all-on')?.addEventListener('click', ()=>{ polishChainState.forEach(e=> e.enabled=true); scheduleChainsPersist(); Logger.toast('همه روشن'); });
  $('btn-polish-all-off')?.addEventListener('click', ()=>{ polishChainState.forEach(e=> e.enabled=false); scheduleChainsPersist(); Logger.toast('همه خاموش'); });
  $('btn-stt-all-on')?.addEventListener('click', ()=>{ sttChainState = sttChainState.map(e=> typeof e==='string'?{id:e,providerId:providerIdOf(e,'google'),enabled:true}:e); sttChainState.forEach(e=> e.enabled=true); scheduleChainsPersist(); Logger.toast('همه STT روشن'); });
  $('btn-stt-all-off')?.addEventListener('click', ()=>{ sttChainState = sttChainState.map(e=> typeof e==='string'?{id:e,providerId:providerIdOf(e,'google'),enabled:false}:e); sttChainState.forEach(e=> e.enabled=false); scheduleChainsPersist(); Logger.toast('همه STT خاموش'); });

  els.btnExpandStt?.addEventListener('click', ()=> toggleChainPanel('stt'));
  els.btnExpandPolish?.addEventListener('click', ()=> toggleChainPanel('polish'));
  els.sttAddSearch?.addEventListener('input', ()=> renderChainPanel('stt'));
  els.polishAddSearch?.addEventListener('input', ()=> renderChainPanel('polish'));
  // --- persist flush hooks (ticket 41): modal-close + pagehide ensure no loss ---
  try{
    const flush = ()=> flushChains();
    $('btn-save-modal')?.addEventListener('click', flush);
    $('btn-close-modal')?.addEventListener('click', flush);
    els.modal?.addEventListener('click', e=>{ if(e.target===els.modal) flush(); });
    document.addEventListener('keydown', e=>{ if(e.key==='Escape' && els.modal?.style.display==='flex') flush(); });
    window.addEventListener('pagehide', flush);
    window.addEventListener('beforeunload', flush);
    document.addEventListener('visibilitychange', ()=>{ if(document.hidden) flush(); });
  }catch{}
  return { renderAllChains, renderFlowList, renderChainPanel, renderCustomProviders, flowInit, persistChains };
}
