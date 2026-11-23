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
import { esc, fa } from './format.js';
import { $ } from './dom.js';

// --- inline stroke/vector SVG icons (safe static constants) ---
const IC_GRIP = '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true"><circle cx="9" cy="6" r="1.5"/><circle cx="15" cy="6" r="1.5"/><circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/><circle cx="9" cy="18" r="1.5"/><circle cx="15" cy="18" r="1.5"/></svg>';
const IC_UP = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 15l-6-6-6 6"/></svg>';
const IC_DOWN = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>';
const IC_DOTS = '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true"><circle cx="12" cy="5.5" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="12" cy="18.5" r="1.6"/></svg>';
const IC_TOP = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 4h14"/><path d="M12 20V9"/><path d="M7 14l5-5 5 5"/></svg>';
const IC_TRASH = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16"/><path d="M9 7V4h6v3"/><path d="M7 7l1 13h8l1-13"/></svg>';
const IC_PLUS = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>';
const IC_CLOSE = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M18 6L6 18M6 6l12 12"/></svg>';

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
let onSettingsSync = () => {};

// --- preference chains UI ---
const STT_LABELS = {
  'groq': { label: 'Groq Whisper', sub: 'سریع • whisper-large-v3' },
  'gemini-3.5-transcribe': { label: 'gemini-3.5-transcribe', sub: 'پیشنهادی • رونویسی دقیق ✓' },
  'gemini-3.1-flash-lite': { label: 'gemini-3.1-flash-lite', sub: 'سریع و سبک ✓' },
};
const POLISH_LABELS = {
  'gemini-4-hydrogen': { label: 'gemini-4-hydrogen', sub: 'Google • پالیش و ترجمه سریع (سرور)' },
  'gemini-3.1-flash-lite': { label: 'gemini-3.1-flash-lite', sub: 'Google • سبک و سریع (سرور)' },
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
    (type === 'stt' ? $('btn-reset-stt') : $('btn-reset-polish'))?.focus?.({ preventScroll: true });
    return;
  }
  const row = rows[Math.max(0, Math.min(idx, rows.length - 1))];
  let inner = innerSelector ? row.querySelector(innerSelector) : null;
  if (inner && inner.disabled) {
    inner = row.querySelector('.chain-step-btn:not([disabled])') || row;
  }
  try { (inner || row).focus?.({ preventScroll: true }); } catch { (inner || row).focus?.(); }
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
function attachPointerDrag(handle, item, container, fromIdx, type){
  if(!handle || !item || !container) return;
  handle.addEventListener('pointerdown', (downEvt)=>{
    if(downEvt.pointerType === 'mouse' && downEvt.button !== 0) return;
    downEvt.preventDefault();
    downEvt.stopPropagation();
    closeChainMenus();
    const rows = [...container.querySelectorAll('.chain-item')];
    if(rows.length < 2) return;
    const rects = rows.map(r => r.getBoundingClientRect());
    const startRect = rects[fromIdx];
    if(!startRect) return;
    const pitch = fromIdx + 1 < rects.length
      ? Math.max(44, rects[fromIdx + 1].top - startRect.top)
      : (fromIdx > 0 ? Math.max(44, startRect.top - rects[fromIdx - 1].top) : startRect.height + 6);
    const mids = rects.map(r => r.top + r.height / 2);
    const startY = downEvt.clientY;
    const startScroll = container.scrollTop;
    const pointerId = downEvt.pointerId;
    let targetIdx = fromIdx;
    let lastClientY = downEvt.clientY;
    let autoScrollRaf = 0;
    let active = true;

    try { handle.setPointerCapture(pointerId); } catch {}
    container.classList.add('is-reordering');
    item.classList.add('is-dragging');
    rows.forEach((r, i) => { if(i !== fromIdx) r.classList.add('is-shifting'); });

    const updatePositions = () => {
      const scrollDelta = container.scrollTop - startScroll;
      const dy = (lastClientY - startY) + scrollDelta;
      item.style.transform = `translate3d(0, ${dy}px, 0)`;
      const dragMid = startRect.top + startRect.height / 2 + dy;
      let nextIdx = fromIdx;
      for(let i = 0; i < mids.length; i++){
        if(i < fromIdx && dragMid < mids[i]) { nextIdx = i; break; }
        if(i > fromIdx && dragMid > mids[i]) nextIdx = i;
      }
      if(nextIdx !== targetIdx){
        targetIdx = nextIdx;
        try { navigator.vibrate?.(8); } catch {}
      }
      rows.forEach((r, i) => {
        if(i === fromIdx) return;
        let shift = 0;
        if(targetIdx > fromIdx && i > fromIdx && i <= targetIdx) shift = -pitch;
        else if(targetIdx < fromIdx && i >= targetIdx && i < fromIdx) shift = pitch;
        r.style.transform = shift ? `translate3d(0, ${shift}px, 0)` : '';
      });
    };

    const tickAutoScroll = () => {
      autoScrollRaf = 0;
      if(!active) return;
      const box = container.getBoundingClientRect();
      const edge = 34;
      let delta = 0;
      if(lastClientY < box.top + edge) delta = -Math.ceil((box.top + edge - lastClientY) / 4);
      else if(lastClientY > box.bottom - edge) delta = Math.ceil((lastClientY - (box.bottom - edge)) / 4);
      if(delta !== 0){
        const before = container.scrollTop;
        container.scrollTop += delta;
        if(container.scrollTop !== before) updatePositions();
        autoScrollRaf = requestAnimationFrame(tickAutoScroll);
      }
    };

    const onMove = (e) => {
      if(!active || (e.pointerId !== undefined && e.pointerId !== pointerId)) return;
      lastClientY = e.clientY;
      updatePositions();
      const box = container.getBoundingClientRect();
      if((lastClientY < box.top + 34 || lastClientY > box.bottom - 34) && !autoScrollRaf){
        autoScrollRaf = requestAnimationFrame(tickAutoScroll);
      }
    };

    const cleanup = (commit) => {
      if(!active) return;
      active = false;
      if(autoScrollRaf) cancelAnimationFrame(autoScrollRaf);
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
      document.removeEventListener('pointercancel', onCancel);
      handle.removeEventListener('lostpointercapture', onCancel);
      try { handle.releasePointerCapture(pointerId); } catch {}
      container.classList.remove('is-reordering');
      item.classList.remove('is-dragging');
      rows.forEach((r) => {
        r.classList.remove('is-shifting');
        r.style.transform = '';
      });
      if(commit && targetIdx !== fromIdx){
        const arr = type === 'stt' ? sttChainState : polishChainState;
        const [moved] = arr.splice(fromIdx, 1);
        if(moved !== undefined){
          arr.splice(targetIdx, 0, moved);
          scheduleChainsPersist();
          renderAllChains();
          announce(`«${labelOf(moved, type)}» به جایگاه ${targetIdx + 1} از ${arr.length} منتقل شد`);
          focusChainRow(type, targetIdx, '.chain-drag');
        }
      }
    };

    const onUp = (e) => {
      if(e.pointerId !== undefined && e.pointerId !== pointerId) return;
      cleanup(true);
    };
    const onCancel = (e) => {
      if(e?.pointerId !== undefined && e.pointerId !== pointerId) return;
      cleanup(false);
    };

    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
    document.addEventListener('pointercancel', onCancel);
    handle.addEventListener('lostpointercapture', onCancel);
  });
}

function renderChain(container, chain, type){
  if(!container) return;
  const prevScroll = container.scrollTop;
  container.innerHTML='';
  const polishOff = type==='polish' && !els.togglePolish?.checked;
  const frag = document.createDocumentFragment();
  chain.forEach((entry, idx)=>{
    const id = entryIdOf(entry);
    const providerId = providerIdOf(entry, type === 'stt' ? 'google' : 'groq');
    const enabled = typeof entry === 'object' ? entry.enabled!==false : true;
    const meta = (type==='stt' ? STT_LABELS[id] : POLISH_LABELS[id]) || {label:id, sub:''};
    const provRemoved = Storage.isProviderRemoved(providerId);
    const provDisabled = Storage.isProviderDisabled(providerId);
    const hasKey = hasKeyById(providerId);
    const item = document.createElement('div');
    item.className = 'chain-item' + (!hasKey || provDisabled || provRemoved ? ' missing' : '') + (polishOff || !enabled || provDisabled ? ' polish-off' : '');
    item.draggable = false;
    item.dataset.id = id;
    item.dataset.index = idx;
    item.setAttribute('role','listitem');
    item.setAttribute('aria-label', `${idx+1}. ${meta.label}`);
    item.tabIndex = 0; // keyboard reorder target: Ctrl+ArrowUp/Down

    let dotCls = hasKey ? 'ok' : 'missing';
    let provLabel = flowProviderLabel(providerId);
    let statusWord = hasKey ? 'آماده' : 'بدون کلید';
    let statusTitle = hasKey ? `${provLabel} — کلید آماده است` : `${provLabel} — بی‌کلید (اول کلید را وارد کن)`;
    if (provRemoved) {
      dotCls = 'missing';
      statusWord = 'حذف‌شده';
      statusTitle = `${provLabel} — ارائه‌دهنده حذف شده است`;
    } else if (provDisabled) {
      dotCls = 'off';
      statusWord = 'خاموش';
      statusTitle = `${provLabel} — ارائه‌دهنده خاموش است`;
    }

    const switchLabel = `روشن یا خاموش کردن مدل ${meta.label}`;
    const menuLabel = `گزینه‌های مدل ${meta.label}: اولویت ۱، حذف`;
    item.title = 'دستگیره را بکش یا از دکمه‌های بالا و پایین استفاده کن — Ctrl+↑/↓';
    item.setAttribute('aria-keyshortcuts', 'Control+ArrowUp Control+ArrowDown');
    item.innerHTML = `
      <div class="chain-row-top">
        <button type="button" class="chain-drag" aria-label="بکش برای تغییر اولویت ${esc(meta.label)}" title="بکش برای جابه‌جایی">${IC_GRIP}</button>
        <span class="rank ${idx>0?'fallback':''}">${fa(idx+1)}</span>
        <div class="chain-head-info">
          <span class="chain-label" dir="auto" title="${esc(meta.label)}${meta.sub?` — ${esc(meta.sub)}`:''}">${esc(meta.label)}</span>
          <span class="chain-status ${dotCls}" title="${esc(statusTitle)}"><i class="chain-sdot" aria-hidden="true"></i>${esc(provLabel)} · ${esc(statusWord)}</span>
        </div>
        <label class="chain-switch" title="${esc(switchLabel)}">
          <input type="checkbox" class="sr-only" role="switch" data-toggle ${enabled?'checked':''} aria-checked="${enabled?'true':'false'}" aria-label="${esc(switchLabel)}">
          <span class="chain-track" aria-hidden="true"></span>
        </label>
      </div>
      <div class="chain-row-bottom">
        <span class="chain-sub">${esc(meta.sub || 'مدل سفارشی')}</span>
        <div class="chain-controls">
          <div class="chain-step-btns">
            <button type="button" class="chain-step-btn" data-step-up aria-label="انتقال ${esc(meta.label)} به بالا" title="یک پله بالاتر" ${idx===0?'disabled':''}>${IC_UP}</button>
            <button type="button" class="chain-step-btn" data-step-down aria-label="انتقال ${esc(meta.label)} به پایین" title="یک پله پایین‌تر" ${idx===chain.length-1?'disabled':''}>${IC_DOWN}</button>
          </div>
          <div class="chain-menu-wrap">
            <button type="button" class="chain-menubtn" aria-haspopup="menu" aria-expanded="false" aria-label="${esc(menuLabel)}" title="گزینه‌های بیشتر">${IC_DOTS}</button>
            <div class="chain-menu ${idx===chain.length-1?'up':''}" role="menu" aria-label="${esc(menuLabel)}" hidden>
              <button type="button" role="menuitem" data-top aria-label="انتقال ${esc(meta.label)} به اولویت ۱" ${idx===0?'disabled':''}>${IC_TOP}<span>انتقال به اولویت ۱</span></button>
              <button type="button" role="menuitem" class="danger" data-remove aria-label="حذف مدل ${esc(meta.label)}">${IC_TRASH}<span>حذف از زنجیره</span></button>
            </div>
          </div>
        </div>
      </div>
    `;

    attachPointerDrag(item.querySelector('.chain-drag'), item, container, idx, type);

    // toggle per-model (both chains) — single path: canonical {id, providerId, enabled}
    item.querySelector('[data-toggle]')?.addEventListener('change', (e)=>{
      const arr = type==='stt'? sttChainState : polishChainState;
      if(typeof arr[idx]==='string') arr[idx]={id:arr[idx], providerId: providerIdOf(arr[idx], type==='stt'?'google':'groq'), enabled:e.target.checked};
      else { arr[idx].providerId = providerIdOf(arr[idx], type==='stt'?'google':'groq'); arr[idx].enabled = e.target.checked; }
      scheduleChainsPersist();
      renderAllChains();
      announce(`مدل ${meta.label} ${e.target.checked?'روشن':'خاموش'} شد`);
      focusChainRow(type, idx, '[data-toggle]');
    });
    item.querySelector('[data-remove]')?.addEventListener('click', ()=>{
      const arr = type==='stt'? sttChainState : polishChainState;
      const [removed] = arr.splice(idx,1);
      lastDeleted = { entry: removed, index: idx, type };
      scheduleChainsPersist();
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
      if(e.key === 'Escape'){ e.preventDefault(); e.stopPropagation(); closeChainMenus(null, menuBtn); }
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
          if (shortcutsOpen()) return;
          const open = document.querySelector('.chain-menu-wrap.open .chain-menubtn');
          if(!open) return;
          e.preventDefault(); e.stopPropagation();
          closeChainMenus(null, open);
        }
      });
    }
    // inline stepper ▲ / ▼ + jump-to-top ⤒
    item.querySelector('[data-step-up]')?.addEventListener('click', (e)=>{
      e.stopPropagation();
      moveChain(type, idx, -1, '[data-step-up]');
    });
    item.querySelector('[data-step-down]')?.addEventListener('click', (e)=>{
      e.stopPropagation();
      moveChain(type, idx, 1, '[data-step-down]');
    });
    item.querySelector('[data-top]')?.addEventListener('click', ()=> moveChainToTop(type, idx));
    // keyboard reorder: Ctrl+ArrowUp/Down on focused row
    item.addEventListener('keydown', (e)=>{
      if(e.ctrlKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')){
        e.preventDefault();
        moveChain(type, idx, e.key === 'ArrowUp' ? -1 : 1);
      }
    });
    frag.appendChild(item);
  });
  container.appendChild(frag);
  container.scrollTop = prevScroll;
}

function moveChain(type, idx, dir, focusSel){
  const arr = type==='stt'? sttChainState : polishChainState;
  const n = idx+dir;
  if(n<0||n>=arr.length) return;
  [arr[idx], arr[n]] = [arr[n], arr[idx]];
  try { navigator.vibrate?.(6); } catch {}
  scheduleChainsPersist();
  renderAllChains();
  announce(`«${labelOf(arr[n], type)}» به جایگاه ${n+1} از ${arr.length} منتقل شد`);
  focusChainRow(type, n, focusSel);
}

function moveChainToTop(type, idx){
  const arr = type==='stt'? sttChainState : polishChainState;
  if(idx<=0 || idx>=arr.length) return;
  const [moved] = arr.splice(idx, 1);
  arr.unshift(moved);
  try { navigator.vibrate?.(8); } catch {}
  scheduleChainsPersist();
  renderAllChains();
  announce(`«${labelOf(moved, type)}» به اولویت ۱ منتقل شد`);
  focusChainRow(type, 0);
}

export function renderAllChains(){
  renderChain(els.sttChain, sttChainState, 'stt');
  renderChain(els.polishChain, polishChainState, 'polish');
  const hint = document.getElementById('polish-disabled-hint');
  if(hint) hint.style.display = els.togglePolish?.checked ? 'none' : 'block';
  try { syncCustomProviderSelects(); } catch {}
  // Single deliberate non-verbatim line: replaces the old app.js end-of-file
  // `renderAllChains = ...Stagebar.renderStageModelOptions` reassignment, which
  // ES-module read-only imports make impossible — the refresh rides as a hook.
  try { onChainsRendered?.(); } catch {}
}

export function persistChains(){ scheduleChainsPersist(); }

// --- models flow card + live persisted catalog ---
// Data source is Storage.getModelCatalog() + live Transcription.listModels + known/chain entries.
const modelCache = new Map(); // canonical providerId -> string[]
const fetchStamp = new Map(); // ui/canonical providerId -> cache-line label
const catalogUpdatedAt = new Map(); // canonical providerId -> epoch ms
let autoRefreshedThisSession = false;
let catalogRefreshInFlight = null;
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
function formatCacheLine(ts, count){
  if(!count) return 'نه هنوز — «بروزرسانی مدل‌ها» را بزن';
  if(!ts) return `ذخیره‌شده (${fa(count)} مدل)`;
  const timeStr = new Date(ts).toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' });
  return `به‌روزشده ${timeStr} (${fa(count)} مدل)`;
}
function updateCatalogStatus(customText){
  const el = $('catalog-status');
  if(!el) return;
  if(customText){ el.textContent = customText; return; }
  let total = 0, provCount = 0;
  for(const [, ids] of modelCache){
    if(Array.isArray(ids) && ids.length){ total += ids.length; provCount++; }
  }
  if(!provCount){
    el.textContent = 'هنوز کاتالوگ زنده‌ای دریافت نشده — برای دریافت دکمه بروزرسانی را بزن';
    return;
  }
  let latestTs = 0;
  for(const ts of catalogUpdatedAt.values()) if(ts > latestTs) latestTs = ts;
  const timePart = latestTs ? ` · ${new Date(latestTs).toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' })}` : '';
  el.textContent = `${fa(total)} مدل آماده از ${fa(provCount)} ارائه‌دهنده${timePart}`;
}
function persistModelCatalog(){
  const payload = {};
  for(const [pid, ids] of modelCache){
    if(!Array.isArray(ids) || !ids.length) continue;
    payload[pid] = { models: ids, updatedAt: catalogUpdatedAt.get(pid) || Date.now() };
  }
  Storage.saveModelCatalog?.(payload);
  updateCatalogStatus();
  try { onChainsRendered?.(); } catch {}
}
function hydrateCatalogFromStorage(){
  try{
    const saved = Storage.getModelCatalog?.() || {};
    for(const [rawPid, info] of Object.entries(saved)){
      const pid = canonicalize(rawPid) || rawPid;
      if(!pid || !Array.isArray(info?.models) || !info.models.length) continue;
      modelCache.set(pid, info.models);
      const ts = Number(info.updatedAt || 0);
      if(ts) catalogUpdatedAt.set(pid, ts);
      const stampKey = pid === 'google' ? 'gemini' : pid;
      fetchStamp.set(stampKey, formatCacheLine(ts, info.models.length));
    }
  }catch{}
  syncCacheLines();
  updateCatalogStatus();
}
function registerModelInCatalog(providerId, modelId){
  const pid = canonicalize(providerId) || String(providerId || '').trim();
  const mid = String(modelId || '').trim();
  if(!pid || !mid) return;
  const cur = modelCache.get(pid) ? [...modelCache.get(pid)] : [];
  if(!cur.includes(mid)){
    cur.unshift(mid);
    modelCache.set(pid, cur);
    catalogUpdatedAt.set(pid, Date.now());
    const stampKey = pid === 'google' ? 'gemini' : pid;
    fetchStamp.set(stampKey, formatCacheLine(catalogUpdatedAt.get(pid), cur.length));
    persistModelCatalog();
    syncCacheLines();
  }
}
export function syncCustomProviderSelects(){
  let providers = [];
  try{ providers = Storage.getProviders?.() || []; }catch{ providers = []; }
  const selects = [$('stt-custom-prov'), $('polish-custom-prov'), $('easy-provider-select')].filter(Boolean);
  for(const sel of selects){
    const prev = sel.value;
    sel.innerHTML = '';
    for(const p of providers){
      const o = document.createElement('option');
      o.value = p.id;
      const suffix = p.disabled ? ' (خاموش)' : (!p.hasKey && p.id !== 'openrouter' ? ' (بدون کلید)' : '');
      o.textContent = `${p.name || p.id}${suffix}`;
      sel.appendChild(o);
    }
    if(prev && providers.some(p => p.id === prev)){
      sel.value = prev;
    } else {
      const preferred = providers.find(p => !p.disabled && p.hasKey) || providers[0];
      if(preferred) sel.value = preferred.id;
    }
  }
}
function allFlowModels(){
  const out = [], seen = new Set();
  const push = (id, pid) => {
    const clean = String(id || '').trim();
    const cpid = canonicalize(pid) || String(pid || '').trim();
    if (!clean || !cpid) return;
    if (Storage.isProviderRemoved(cpid)) return;
    const k = cpid + ':' + clean;
    if (seen.has(k)) return;
    seen.add(k);
    const { caps, free, fa } = capsFor(clean, cpid);
    out.push({ id: clean, providerId: cpid, caps, free, fa });
  };
  push('groq', 'groq');
  for (const id of Object.keys(STT_LABELS)) if (id !== 'groq') push(id, /^gemini/i.test(id) ? 'google' : 'groq');
  for (const id of Object.keys(POLISH_LABELS)) push(id, providerIdOf({ id }, 'groq'));
  for (const e of sttChainState) push(entryIdOf(e), providerIdOf(e, 'google'));
  for (const e of polishChainState) push(entryIdOf(e), providerIdOf(e, 'groq'));
  for (const [pid, ids] of modelCache) for (const id of (ids || [])) push(id, canonicalize(pid) || pid);
  return out;
}
function chainLoc(id, pid){
  const cpid = canonicalize(pid) || pid;
  const si = sttChainState.findIndex(x => entryIdOf(x) === id && providerIdOf(x, '') === cpid);
  if (si >= 0) return { type: 'stt', index: si };
  const pi = polishChainState.findIndex(x => entryIdOf(x) === id && providerIdOf(x, '') === cpid);
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
  const frag = document.createDocumentFragment();
  for (const d of rows) {
    const disabled = Storage.isProviderDisabled(d.providerId);
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
    const provTag = document.createElement('span');
    provTag.className = 'mcap';
    provTag.textContent = flowProviderLabel(d.providerId);
    badges.appendChild(provTag);
    for (const c of d.caps) {
      const s = document.createElement('span');
      s.className = 'mcap';
      s.textContent = c === 'stt' ? 'صوتی' : 'متنی';
      badges.appendChild(s);
    }
    if (d.free) { const f = document.createElement('span'); f.className = 'mcap free'; f.textContent = 'رایگان'; badges.appendChild(f); }
    title.append(b, badges);
    main.append(title);
    if (disabled || !hasKey) {
      const note = document.createElement('span');
      note.className = 'mstatus';
      note.textContent = disabled ? 'ارائه‌دهنده خاموش است' : 'نیازمند ثبت کلید در تب «کلیدها»';
      main.appendChild(note);
    }
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn-ghost btn-sm ' + (loc ? 'btn-remove' : 'btn-add');
    btn.textContent = loc ? 'حذف' : 'افزودن';
    btn.setAttribute('aria-label', (loc ? 'حذف مدل ' : 'افزودن مدل ') + d.id);
    const targetNow = targetForModel(d.id, d.providerId);
    btn.title = disabled
      ? 'این ارائه‌دهنده خاموش است'
      : (!hasKey ? 'اول کلید این ارائه‌دهنده را وارد کن' : ((loc ? 'حذف از زنجیره ' : 'افزودن به زنجیره ') + (targetNow === 'stt' ? 'صوتی' : 'پالیش')));
    btn.disabled = (!hasKey || disabled) && !loc;
    btn.addEventListener('click', () => toggleFlowModel(d.id, d.providerId));
    card.append(main, btn);
    frag.appendChild(card);
  }
  box.appendChild(frag);
  const empty = $('m-empty'), err = $('m-err');
  if (empty) {
    empty.hidden = rows.length !== 0;
  }
  if (err) { err.hidden = true; delete err.dataset.failed; }
  const retry = $('m-retry');
  if (retry) retry.disabled = !flowLastPid;
  updateNokey();
  syncCustomProviderSelects();
  const count = $('m-count');
  if (count) {
    const total = sttChainState.length + polishChainState.length;
    count.textContent = `${fa(rows.length)} مدل یافت شد · ${fa(total)} مدل در زنجیره فعال`;
  }
}
function toggleFlowModel(modelId, providerId){
  const mid = String(modelId || '').trim(), pid = canonicalize(providerId) || String(providerId || '').trim();
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
  if (target === 'stt') {
    if (pid === 'google' && !/^gemini/i.test(mid)) { Logger.toast('این مدل Google فقط متنی است (برای STT از Gemini استفاده کن)'); return; }
    if (!isSttEligible(mid, pid)) { Logger.toast('مدل نامعتبر برای STT'); return; }
  }
  if (!hasKeyById(pid)) { Logger.toast('⚠ این ارائه‌دهنده کلید ندارد'); return; }
  addModelToChain(mid, pid, target);
  renderFlowList();
}
function addModelToChain(modelId, providerId, target){
  const mid = String(modelId||'').trim();
  const pid = canonicalize(providerId) || String(providerId||'').trim();
  if(!mid || !pid) return false;
  if(target==='stt' && !isSttEligible(mid, pid)){ Logger.toast('مدل نامعتبر برای STT'); return false; }
  if(target==='stt'){
    if(sttChainState.some(x=> entryIdOf(x)===mid && providerIdOf(x,'google')===pid)){ Logger.toast('قبلاً در زنجیره صوتی هست'); return false; }
    sttChainState.push({ id:mid, providerId:pid, enabled:true });
  } else {
    if(polishChainState.some(x=> entryIdOf(x)===mid && providerIdOf(x,'groq')===pid)){ Logger.toast('قبلاً در زنجیره متنی هست'); return false; }
    polishChainState.push({ id:mid, providerId:pid, enabled:true });
  }
  registerModelInCatalog(pid, mid);
  scheduleChainsPersist();
  renderAllChains();
  const list = target === 'stt' ? sttChainState : polishChainState;
  announce(`مدل ${mid} در جایگاه ${list.length} از ${list.length} به زنجیره ${target==='stt'?'STT':'پالیش'} اضافه شد`);
  return true;
}
function addCustomModelFromInputs(rawProviderId, rawModelId, target){
  const pid = canonicalize(rawProviderId) || String(rawProviderId || '').trim();
  const mid = String(rawModelId || '').trim();
  if(!pid){ Logger.toast('ارائه‌دهنده را انتخاب کن'); return false; }
  if(!mid){ Logger.toast('شناسه مدل را وارد کن'); return false; }
  if(Storage.isProviderRemoved(pid)){ Logger.toast('این ارائه‌دهنده حذف شده است'); return false; }
  if(target === 'stt'){
    if(pid === 'google' && !/^gemini/i.test(mid)){
      Logger.toast('مدل‌های غير Gemini فقط برای زنجیره متنی/پالیش مناسبند');
      return false;
    }
    if(!isSttEligible(mid, pid)){
      Logger.toast('مدل صوتی باید whisper/gemini/transcrib باشد');
      return false;
    }
  }
  const ok = addModelToChain(mid, pid, target);
  if(!ok) return false;
  renderFlowList();
  if(chainPanelOpen(target)) renderChainPanel(target);
  const disabled = Storage.isProviderDisabled(pid);
  const hasKey = hasKeyById(pid);
  if(disabled) Logger.toast(`«${mid}» افزوده شد (توجه: ${flowProviderLabel(pid)} الان خاموش است)`);
  else if(!hasKey) Logger.toast(`«${mid}» افزوده شد — برای اجرا کلید ${flowProviderLabel(pid)} را ثبت کن`);
  else Logger.toast(`«${mid}» به زنجیره ${target === 'stt' ? 'صوتی' : 'پالیش'} اضافه شد`);
  return true;
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
    const cpid = canonicalize(providerId) || providerId;
    const now = Date.now();
    modelCache.set(cpid, ids);
    catalogUpdatedAt.set(cpid, now);
    fetchStamp.set(providerId, formatCacheLine(now, ids.length));
    persistModelCatalog();
    if(errBox){ errBox.hidden = true; delete errBox.dataset.failed; }
    renderFlowList();
    Logger.toast(`مدل‌ها: ${ids.length}`);
    announce(`${ids.length} مدل برای ${providerId} بارگذاری شد`);
  }catch(e){ showFetchError(providerId, e); }
  finally{ if(btn) btn.textContent='بروزرسانی مدل‌ها'; syncCacheLines(); }
}
export async function refreshAllActiveCatalogs({ quiet = false } = {}){
  if(catalogRefreshInFlight) return catalogRefreshInFlight;
  const btn = $('btn-refresh-catalog');
  const prevLabel = btn?.textContent || 'بروزرسانی کاتالوگ زنده';
  if(btn){ btn.disabled = true; btn.textContent = 'در حال دریافت…'; }
  updateCatalogStatus('در حال دریافت جدیدترین لیست مدل‌ها…');
  catalogRefreshInFlight = (async () => {
    try{
      const providers = (Storage.getProviders?.() || []).filter(p => !p.disabled);
      const targets = providers.filter(p => p.hasKey || (!quiet && p.id === 'openrouter') || (quiet && p.id === 'openrouter' && !modelCache.has('openrouter')));
      if(!targets.length){
        updateCatalogStatus('هیچ ارائه‌دهنده فعالی با کلید نیست — فقط فهرست OpenRouter عمومی در دسترس است');
        if(!quiet) Logger.toast('کلیدی ثبت نشده است');
        return { ok: 0, total: 0 };
      }
      let okCount = 0;
      const results = await Promise.allSettled(targets.map(async (p) => {
        const ids = await Transcription.listModels(p.id);
        const cpid = canonicalize(p.id) || p.id;
        const now = Date.now();
        modelCache.set(cpid, ids);
        catalogUpdatedAt.set(cpid, now);
        fetchStamp.set(cpid === 'google' ? 'gemini' : cpid, formatCacheLine(now, ids.length));
        okCount++;
        return ids.length;
      }));
      persistModelCatalog();
      syncCacheLines();
      renderFlowList();
      if(chainPanelOpen('stt')) renderChainPanel('stt');
      if(chainPanelOpen('polish')) renderChainPanel('polish');
      const total = results.reduce((acc, r) => acc + (r.status === 'fulfilled' ? r.value : 0), 0);
      if(!quiet){
        if(okCount > 0) Logger.toast(`کاتالوگ زنده: ${fa(total)} مدل از ${fa(okCount)} ارائه‌دهنده`);
        else Logger.toast('بروزرسانی کاتالوگ با خطا مواجه شد');
      }
      return { ok: okCount, total };
    } finally {
      catalogRefreshInFlight = null;
      if(btn){ btn.disabled = false; btn.textContent = prevLabel; }
      updateCatalogStatus();
    }
  })();
  return catalogRefreshInFlight;
}
export function ensureLiveCatalog(){
  if(autoRefreshedThisSession) return;
  autoRefreshedThisSession = true;
  refreshAllActiveCatalogs({ quiet: true }).catch(() => {});
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
  const frag = document.createDocumentFragment();
  for(const c of (s.customProviders || [])){
    const disabled = Storage.isProviderDisabled(c.id);
    const card = document.createElement('details');
    card.className = 'provider-card' + (disabled ? ' is-disabled' : '');
    const head = document.createElement('summary');
    head.className = 'provider-head';
    const dot = document.createElement('span');
    dot.className = 'dot ' + (disabled ? 'warn' : c.key ? 'ok' : 'missing');
    const name = document.createElement('b');
    name.textContent = c.name || c.id; // textContent: custom names never as HTML
    const pill = document.createElement('span');
    pill.className = 'provider-status ' + (disabled ? 'disabled' : c.key ? 'ok' : 'missing');
    pill.textContent = disabled ? 'خاموش' : (c.key ? 'متصل' : 'بدون کلید');
    const spacer = document.createElement('span');
    spacer.style.flex = '1';
    const base = document.createElement('span');
    base.className = 'hint-inline';
    base.textContent = c.baseURL || '';
    base.dir = 'ltr';
    const swLbl = document.createElement('label');
    swLbl.className = 'prov-switch';
    swLbl.title = 'روشن یا خاموش کردن این ارائه‌دهنده';
    const swIn = document.createElement('input');
    swIn.type = 'checkbox';
    swIn.className = 'sr-only';
    swIn.checked = !disabled;
    swIn.setAttribute('aria-label', `فعال بودن ${c.name || c.id}`);
    const swTr = document.createElement('span');
    swTr.className = 'prov-track';
    swTr.setAttribute('aria-hidden', 'true');
    swLbl.append(swIn, swTr);
    swLbl.addEventListener('click', (e)=>{
      e.preventDefault();
      e.stopPropagation();
      const nextDisabled = swIn.checked;
      Storage.setProviderDisabled(c.id, nextDisabled);
      renderCustomProviders();
      renderAllChains();
      renderFlowListSoon();
      updateBadge();
      try { onSettingsSync(); } catch {}
      Logger.toast(`${c.name || c.id} ${nextDisabled ? 'خاموش' : 'روشن'} شد`);
    });
    const rm = document.createElement('button');
    rm.type = 'button'; rm.className = 'btn-ghost btn-xs prov-remove'; rm.textContent = 'حذف';
    rm.setAttribute('aria-label', `حذف ارائه‌دهنده سفارشی ${c.name || c.id}`);
    rm.addEventListener('click', (e)=>{
      e.preventDefault();
      e.stopPropagation();
      const prevCustom = Storage.getSettings().customProviders.map(x => ({ ...x }));
      const prevStt = sttChainState.map(x => (typeof x === 'object' ? { ...x } : x));
      const prevPolish = polishChainState.map(x => (typeof x === 'object' ? { ...x } : x));
      Storage.removeProvider(c.id);
      const nextS = Storage.getSettings();
      sttChainState = [...nextS.sttChain];
      polishChainState = nextS.polishChain.map(x => ({ ...x }));
      renderCustomProviders(); renderAllChains(); renderFlowList(); renderProvidersStatus(); updateBadge();
      try { onSettingsSync(); } catch {}
      Logger.toast(`«${c.name || c.id}» حذف شد`, 8000, {
        actionLabel: 'واگرد',
        onAction: () => {
          Storage.saveSettings({ customProviders: prevCustom, sttChain: prevStt, polishChain: prevPolish });
          const restored = Storage.getSettings();
          sttChainState = [...restored.sttChain];
          polishChainState = restored.polishChain.map(x => ({ ...x }));
          renderCustomProviders(); renderAllChains(); renderFlowList(); renderProvidersStatus(); updateBadge();
          try { onSettingsSync(); } catch {}
          Logger.toast(`${c.name || c.id} بازگردانده شد`);
        },
      });
    });
    head.append(dot, name, pill, spacer, base, swLbl, rm);
    const body = document.createElement('div');
    body.className = 'provider-body';
    const keyLabel = document.createElement('span');
    keyLabel.className = 'hint-inline';
    keyLabel.textContent = 'کلید در فرم افزودن ویرایش می‌شود — اینجا فقط نمایشی است.';
    body.appendChild(keyLabel);
    card.append(head, body);
    frag.appendChild(card);
  }
  box.appendChild(frag);
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
export function flowInit(){
  hydrateCatalogFromStorage();
  syncCustomProviderSelects();
  renderFlowList();
}

// --- per-chain inline add panels (ticket/76-inline-chain-add): expander + panel under each .chain-foot ---
const CHAIN_EXPAND_LABEL = { stt: 'افزودن مدل صوتی', polish: 'افزودن ویرایشگر' };
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
  const qRaw = (search?.value || '').trim();
  const q = qRaw.toLowerCase();
  list.innerHTML = '';
  // Pre-scoped per chain from the same sources as the models tab: the STT panel
  // hides t2t-only models outright (no muted rows, no stale-target class); polish shows all.
  const rows = allFlowModels()
    .filter(d => target === 'stt' ? isSttEligible(d.id, d.providerId) : true)
    .filter(d => !q || d.id.toLowerCase().includes(q) || (d.fa || '').includes(q) || String(d.providerId || '').includes(q));
  if(!rows.length){
    const emptyWrap = document.createElement('div');
    emptyWrap.className = 'hint-inline';
    if(qRaw){
      emptyWrap.textContent = `مدل «${qRaw}» در کاتالوگ پیدا نشد — از کادر پایین همین پنل با انتخاب ارائه‌دهنده اضافه‌اش کن یا «بروزرسانی کاتالوگ زنده» را بزن.`;
      const customInp = $(target === 'stt' ? 'stt-custom-id' : 'polish-custom-id');
      if(customInp && !customInp.value) customInp.value = qRaw;
    } else {
      emptyWrap.textContent = 'نتیجه‌ای نیست — جست‌وجو را عوض کن یا کاتالوگ زنده را بروزرسانی کن.';
    }
    list.appendChild(emptyWrap);
    return;
  }
  const chainFa = target === 'stt' ? 'STT' : 'پالیش';
  const frag = document.createDocumentFragment();
  for(const d of rows){
    const disabled = Storage.isProviderDisabled(d.providerId);
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
    const provTag = document.createElement('span');
    provTag.className = 'mcap';
    provTag.textContent = flowProviderLabel(d.providerId);
    badges.appendChild(provTag);
    for(const c of d.caps){
      const s = document.createElement('span');
      s.className = 'mcap';
      s.textContent = c === 'stt' ? 'صوتی' : 'متنی';
      badges.appendChild(s);
    }
    if(d.free){ const f = document.createElement('span'); f.className = 'mcap free'; f.textContent = 'رایگان'; badges.appendChild(f); }
    title.append(b, badges);
    main.append(title);
    if (!inTarget && (disabled || !hasKey)) {
      const note = document.createElement('span');
      note.className = 'mstatus';
      note.textContent = disabled ? 'ارائه‌دهنده خاموش است' : 'نیازمند ثبت کلید در تب «کلیدها»';
      main.appendChild(note);
    }
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn-ghost btn-sm';
    if(inTarget){ btn.textContent = 'در زنجیره'; btn.disabled = true; btn.setAttribute('aria-label', d.id + ' در زنجیره ' + chainFa + ' است'); }
    else{
      btn.textContent = 'افزودن';
      btn.classList.add('btn-add');
      btn.setAttribute('aria-label', 'افزودن مدل ' + d.id + ' به زنجیره ' + chainFa);
      btn.title = disabled ? 'این ارائه‌دهنده خاموش است' : (!hasKey ? 'اول کلید این ارائه‌دهنده را وارد کن' : 'افزودن به زنجیره ' + chainFa);
      btn.disabled = !hasKey || disabled;
      btn.addEventListener('click', ()=>{
        addModelToChain(d.id, d.providerId, target);
        renderFlowList();
        renderChainPanel(target);
        chainPanelEls(target).search?.focus?.();
      });
    }
    card.append(main, btn);
    frag.appendChild(card);
  }
  list.appendChild(frag);
}
export function setChainPanel(target, open, focusSearch){
  const { btn, panel, search } = chainPanelEls(target);
  if(!btn || !panel) return;
  panel.hidden = !open;
  btn.setAttribute('aria-expanded', String(open));
  btn.innerHTML = (open ? IC_CLOSE : IC_PLUS) + `<span>${open ? 'بستن فهرست' : CHAIN_EXPAND_LABEL[target]}</span>`;
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
  onSettingsSync = deps.onSettingsSync || onSettingsSync;
  els.btnGroqModels?.addEventListener('click', ()=> fetchAndShowModels('groq'));
  els.btnGeminiModels?.addEventListener('click', ()=> fetchAndShowModels('gemini'));
  els.btnOrModels?.addEventListener('click', ()=> fetchAndShowModels('openrouter'));
  $('btn-refresh-catalog')?.addEventListener('click', ()=> refreshAllActiveCatalogs({ quiet: false }));

  // --- models flow card wiring: provider chips + capability chips + search + custom model add ---
  $('m-q')?.addEventListener('input', renderFlowListSoon);
  document.querySelectorAll('#m-prov-chips .fchip').forEach(c => c.addEventListener('click', ()=>{
    flowProv = c.dataset.prov || 'all';
    document.querySelectorAll('#m-prov-chips .fchip').forEach(x=>{
      const on = (x.dataset.prov || 'all') === flowProv;
      x.classList.toggle('active', on);
      x.setAttribute('aria-pressed', String(on));
    });
    const easySel = $('easy-provider-select');
    if(easySel && flowProv !== 'all' && flowProv !== 'custom'){
      const cpid = canonicalize(flowProv) || flowProv;
      if([...easySel.options].some(o => o.value === cpid)) easySel.value = cpid;
    }
    renderFlowList();
  }));
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
    const target = flowProv === 'groq' ? els.keyGroq : flowProv === 'gemini' ? $('btn-test-gemini') : els.keyOpenrouter;
    target?.focus?.();
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
    renderCustomProviders(); syncCustomProviderSelects(); renderFlowList(); renderProvidersStatus();
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
        renderCustomProviders(); syncCustomProviderSelects(); renderFlowList(); renderProvidersStatus();
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
      const now = Date.now();
      modelCache.set(stored.id, ids);
      catalogUpdatedAt.set(stored.id, now);
      fetchStamp.set(stored.id, formatCacheLine(now, ids.length));
      persistModelCatalog();
      renderFlowList();
      Logger.toast(`مدل‌ها: ${ids.length}`);
      announce(`${ids.length} مدل بارگذاری شد`);
    }catch(e){ flowLastPid = stored.id; showFetchError(stored.id, e); }
  });

  // --- Always-visible custom model add box (Explorer) + per-chain custom model bars ---
  const submitEasyAdd = () => {
    const prov = $('easy-provider-select')?.value || '';
    const target = $('easy-target-select')?.value || 'polish';
    const inp = els.easyModelInput || $('easy-model-input');
    const mid = (inp?.value || '').trim();
    if(addCustomModelFromInputs(prov, mid, target) && inp) inp.value = '';
  };
  $('btn-easy-add')?.addEventListener('click', submitEasyAdd);
  (els.easyModelInput || $('easy-model-input'))?.addEventListener('keydown', (e)=>{
    if(e.key === 'Enter'){ e.preventDefault(); submitEasyAdd(); }
  });

  const submitSttCustom = () => {
    const prov = $('stt-custom-prov')?.value || '';
    const inp = $('stt-custom-id');
    const mid = (inp?.value || '').trim();
    if(addCustomModelFromInputs(prov, mid, 'stt') && inp) inp.value = '';
  };
  $('btn-stt-custom-add')?.addEventListener('click', submitSttCustom);
  $('stt-custom-id')?.addEventListener('keydown', (e)=>{
    if(e.key === 'Enter'){ e.preventDefault(); submitSttCustom(); }
  });

  const submitPolishCustom = () => {
    const prov = $('polish-custom-prov')?.value || '';
    const inp = $('polish-custom-id');
    const mid = (inp?.value || '').trim();
    if(addCustomModelFromInputs(prov, mid, 'polish') && inp) inp.value = '';
  };
  $('btn-polish-custom-add')?.addEventListener('click', submitPolishCustom);
  $('polish-custom-id')?.addEventListener('keydown', (e)=>{
    if(e.key === 'Enter'){ e.preventDefault(); submitPolishCustom(); }
  });

  $('btn-polish-all-on')?.addEventListener('click', ()=>{ polishChainState.forEach(e=> e.enabled=true); scheduleChainsPersist(); renderAllChains(); Logger.toast('همه روشن'); });
  $('btn-polish-all-off')?.addEventListener('click', ()=>{ polishChainState.forEach(e=> e.enabled=false); scheduleChainsPersist(); renderAllChains(); Logger.toast('همه خاموش'); });
  $('btn-stt-all-on')?.addEventListener('click', ()=>{ sttChainState = sttChainState.map(e=> typeof e==='string'?{id:e,providerId:providerIdOf(e,'google'),enabled:true}:e); sttChainState.forEach(e=> e.enabled=true); scheduleChainsPersist(); renderAllChains(); Logger.toast('همه STT روشن'); });
  $('btn-stt-all-off')?.addEventListener('click', ()=>{ sttChainState = sttChainState.map(e=> typeof e==='string'?{id:e,providerId:providerIdOf(e,'google'),enabled:false}:e); sttChainState.forEach(e=> e.enabled=false); scheduleChainsPersist(); renderAllChains(); Logger.toast('همه STT خاموش'); });

  els.btnExpandStt?.addEventListener('click', ()=> toggleChainPanel('stt'));
  els.btnExpandPolish?.addEventListener('click', ()=> toggleChainPanel('polish'));
  els.sttAddSearch?.addEventListener('input', ()=> renderChainPanel('stt'));
  els.polishAddSearch?.addEventListener('input', ()=> renderChainPanel('polish'));
  hydrateCatalogFromStorage();
  syncCustomProviderSelects();
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
  return { renderAllChains, renderFlowList, renderChainPanel, renderCustomProviders, flowInit, persistChains, refreshAllActiveCatalogs, ensureLiveCatalog, syncCustomProviderSelects };
}
