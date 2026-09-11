// Entry: wires deep modules together. Keeps orchestration thin; all heavy work stays behind module interfaces.
import { Storage, STT_DEFAULTS, POLISH_DEFAULTS, defaultWaveConfig, WAVE_TYPES } from './modules/storage.js';
import { createWaveRenderer, STARTERS, starterById, randomStack, WAVE_FA } from './modules/wave.js';
import { Logger } from './modules/logger.js';
import { Quota } from './modules/quota.js';
import { Dashboard } from './modules/dashboard.js';
import { Audio } from './modules/audio.js';
import { Realtime } from './modules/realtime.js';
import { Transcription } from './modules/transcription.js';
import { VERSION, BUILD } from './modules/version.js';
import { mountStagebar } from './modules/stagebar.js';
import { mountSettingsModal } from './modules/settingsModal.js';
import { mountWaveTab } from './modules/waveTab.js';
import {
  mountChains, getSttChain, setSttChain, getPolishChain, setPolishChain,
  renderAllChains, renderFlowListSoon, renderCustomProviders, flowInit, persistChains,
  providerIdOf, entryIdOf, sanitizeMsg, hasKeyFor,
  chainPanelEls, chainPanelOpen, setChainPanel,
} from './modules/chains.js';

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
// stagebar seam lives in js/modules/stagebar.js — set once by mountStagebar() at file end
let Stagebar = null;

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
  const searchWrap = document.createElement('div');
  searchWrap.id = 'log-search-wrap';
  const search = document.createElement('input');
  search.id = 'log-search';
  search.type = 'search';
  search.placeholder = 'جستجو…';
  search.setAttribute('aria-label', 'جستجو در لاگ');
  search.addEventListener('input', () => {
    searchQuery = search.value.trim();
    applyFilters();
  });
  // Esc collapses, focus returns to toggle; query preserved (input never cleared)
  search.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); collapseSearch(true); }
  });
  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.id = 'log-search-close';
  closeBtn.textContent = '✕';
  closeBtn.setAttribute('aria-label', 'بستن جستجو');
  closeBtn.addEventListener('click', () => collapseSearch(true));
  searchWrap.append(search, closeBtn);
  let actionsDiv = header.querySelector('#log-actions');
  if (!actionsDiv) {
    const btns = header.querySelector('div');
    if (btns) { btns.id = 'log-actions'; actionsDiv = btns; }
  }
  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.id = 'log-search-toggle';
  toggle.textContent = '🔍';
  toggle.setAttribute('aria-label', 'جستجو در لاگ');
  toggle.title = 'جستجو در لاگ';
  toggle.setAttribute('aria-expanded', 'false');
  toggle.setAttribute('aria-controls', 'log-search');
  toggle.addEventListener('click', () => {
    if (searchWrap.classList.contains('open')) collapseSearch(true);
    else expandSearch();
  });
  actionsDiv.appendChild(toggle);
  header.appendChild(searchWrap);
  function expandSearch() {
    searchWrap.classList.add('open');
    toggle.setAttribute('aria-expanded', 'true');
    search.focus();
  }
  function collapseSearch(refocus) {
    searchWrap.classList.remove('open');
    toggle.setAttribute('aria-expanded', 'false');
    if (refocus) toggle.focus();
  }
  header.insertBefore(filtersWrap, searchWrap);
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

// --- settings wiring + tabs + modal live in js/modules/settingsModal.js (ticket 31) ---
// Mounted FIRST so mountChains below can reuse its handles (updateBadge/
// saveSettings/renderProvidersStatus were hoisted functions before; now thin
// handles). No shared element-event targets between the two mounts (verified by
// grep: chains listens on models-flow/custom/easy/expand/add-search nodes;
// settings listens on keys/base-urls/toggles/tabs/modal nodes), so listener
// order is semantically unchanged. Wave collaborators arrive via mountWaveTab() above;
// mic state arrives via live isWaveMicActive() (never a snapshot).
// --- wave tab lives in js/modules/waveTab.js (ticket 32) ---
// Mounted BEFORE mountSettingsModal so the modal keeps receiving the same wave
// handles by reference (listener registration order unchanged); app.js keeps only
// thin calls. getMainWave/syncRecStrip are live (mainWave inits at file end; never snapshots).
const Wave = mountWaveTab({ els, getMainWave: () => mainWave, syncRecStrip });
const { waveEnsure, wavePrevStart, wavePrevStop, waveStarterPause, waveFollowStop, waveMicStop, waveSync, waveKillApply, isWaveHidden, isWaveMicActive } = Wave;
const Settings = mountSettingsModal({
  els, getStagebar: () => Stagebar,
  hasKeyFor, providerIdOf, getSttChain, setSttChain, getPolishChain, setPolishChain,
  renderAllChains, renderFlowListSoon, renderCustomProviders, flowInit, persistChains,
  chainPanelOpen, setChainPanel, chainPanelEls, STT_DEFAULTS, POLISH_DEFAULTS,
  waveEnsure, wavePrevStart, wavePrevStop, waveStarterPause, waveFollowStop, waveMicStop, waveSync, mainWaveSync,
  isWaveMicActive,
});
const { engineInfo, updateBadge, renderProvidersStatus, loadSettings, saveSettings, openModal } = Settings;

// --- preference chains UI + models flow + inline add panels live in js/modules/chains.js (ticket 30) ---
// Mounted here (original region-1 slot) so listener registration order is unchanged;
// chains.js owns labels, chain state, flow cache/filters and all row/panel behavior verbatim.
mountChains({
  els, updateBadge, saveSettings, shortcutsOpen, renderProvidersStatus,
  onChainsRendered: () => { try { Stagebar.renderStageModelOptions(); } catch {} },
});

// --- settings wiring + tabs live in js/modules/settingsModal.js (ticket 31; mounted above) ---

// --- models flow card + custom providers + manual id live in js/modules/chains.js (ticket 30; wired by mountChains above) ---

// --- wave tab (sliders, starters, list, globals, kill-switch) lives in js/modules/waveTab.js (ticket 32; mounted above) ---

// --- settings modal block lives in js/modules/settingsModal.js (ticket 31; mounted above) ---
// Original slot preserved: initial loadSettings() runs here, after wave lets
// exist and before log-panel wiring — same order as before the extraction.
loadSettings();
// --- per-chain inline add panels live in js/modules/chains.js (ticket 30; wired by mountChains above) ---

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
  const label = collapsed ? 'نمایش' : 'بستن';
  const tx = els.btnToggleLog.querySelector('.log-tx');
  const ic = els.btnToggleLog.querySelector('.log-ic');
  if (tx) tx.textContent = label; else els.btnToggleLog.textContent = label;
  if (ic) ic.textContent = collapsed ? '▴' : '▾';
  const full = collapsed ? 'نمایش لاگ' : 'بستن لاگ';
  els.btnToggleLog.title = full;
  els.btnToggleLog.setAttribute('aria-label', full);
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
// transcript touch resize (#93): a grip drag sets a manual-override flag — input may
// grow a user-enlarged box, never shrink it; double-tap on #output resets the flag.
// keyboard cap (#112 T1): a keyboard-open fires window/visualViewport resize with a
// shrunken viewport — that path is shrink-only and uses a tight cap (40vh of the
// shrunken viewport, 280px on narrow phones) so #stagebar stays above the fold.
// select/focus handlers above only saveCursor — they never autogrow (delta 0px).
let outManual=false;
let vpPeak=Math.max(window.innerHeight, window.visualViewport ? window.visualViewport.height : 0);
let kbCapOn=false, lastVpH=window.innerHeight;
function outputCap(){
  const vv=window.visualViewport;
  const vh=Math.round(Math.min(vv ? vv.height : window.innerHeight, window.innerHeight));
  const vw=Math.round(vv ? vv.width : window.innerWidth);
  let cap=Math.round(vh * (kbCapOn ? 0.4 : 0.6));
  if(vw <= 420) cap=Math.min(cap, 280);
  return Math.max(cap, 96);
}
function autogrowOutput(opts){
  if(!els.output) return;
  const shrinkOnly=!!(opts && opts.shrinkOnly);
  const cap=outputCap();
  const need=Math.min(els.output.scrollHeight, cap);
  let target;
  if(outManual){
    if(need > els.output.offsetHeight) target=need;
    else target=Math.max(120, Math.min(els.output.offsetHeight, cap));
  } else {
    els.output.style.height='auto';
    target=Math.min(els.output.scrollHeight, cap);
  }
  if(shrinkOnly && target > els.output.offsetHeight) target=els.output.offsetHeight;
  els.output.style.height=target+'px';
  els.output.style.overflowY=els.output.scrollHeight > cap+1 ? 'auto' : 'hidden';
}
function onViewportResize(){
  const vv=window.visualViewport;
  const h=Math.round(Math.min(vv ? vv.height : window.innerHeight, window.innerHeight));
  const shrinking=h < lastVpH-2;
  if(h > vpPeak) vpPeak=h;
  kbCapOn=h < vpPeak-120;
  lastVpH=h;
  autogrowOutput(shrinking ? {shrinkOnly:true} : undefined);
}
window.addEventListener('resize', onViewportResize);
if(window.visualViewport) window.visualViewport.addEventListener('resize', onViewportResize);
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
function resetOutputHeight(){
  outManual=false;
  saveCursor();
  els.output.style.height='auto';
  const nh=Math.min(els.output.scrollHeight, window.innerHeight*0.5, outputCap())+'px';
  els.output.style.height=nh;
  Storage.saveHeights({ out: nh });
}
els.output.addEventListener('dblclick', resetOutputHeight);
(() => { // touch double-tap reset (dblclick does not fire reliably on mobile)
  let lastTap=0;
  els.output.addEventListener('touchend', ()=>{
    const now=Date.now();
    if(now-lastTap<300) resetOutputHeight();
    lastTap=now;
  });
})();
// grip drag = manual resize affordance (prototype v2); sets the manual-override flag (#93)
// so autogrow never shrinks a user-enlarged height. Pointer events carry touch (with
// touch-action:none + capture + pointercancel); touchstart/move/end fallback mirrors the
// #log-splitter pattern for browsers without PointerEvent.
(()=>{
  const grip = document.getElementById('grip');
  if(!grip || !els.output) return;
  let drag=false, y0=0, h0=0;
  const clampH = v => Math.max(120, Math.min(v, outputCap()));
  const begin = (y)=>{ drag=true; y0=y; h0=els.output.offsetHeight; };
  const move = (y, prevent)=>{ if(!drag) return; outManual=true; els.output.style.height = clampH(h0 + (y - y0)) + 'px'; els.output.style.overflowY = 'auto'; if(prevent) prevent(); };
  const end = ()=>{ if(!drag) return; drag=false; try{ Storage.saveHeights({ out: getComputedStyle(els.output).height }); }catch{} };
  grip.addEventListener('pointerdown', e=>{ begin(e.clientY); try{ grip.setPointerCapture(e.pointerId); }catch{} try{ e.preventDefault(); }catch{} });
  grip.addEventListener('pointermove', e=>{ if(!drag) return; if(e.pointerId!==undefined && e.isPrimary===false) return; move(e.clientY); });
  grip.addEventListener('pointerup', end);
  grip.addEventListener('pointercancel', end);
  try{ grip.addEventListener('lostpointercapture', ()=>{ drag=false; }); }catch{}
  grip.addEventListener('touchstart', e=>{ if(e.touches && e.touches.length) begin(e.touches[0].clientY); try{ e.preventDefault(); }catch{} }, {passive:false});
  grip.addEventListener('touchmove', e=>{ if(e.touches && e.touches.length) move(e.touches[0].clientY, ()=>{ try{ e.preventDefault(); }catch{} }); }, {passive:false});
  grip.addEventListener('touchend', end);
  grip.addEventListener('touchcancel', end);
})();

// main rec strip (ticket/51 + mainwave T1): wave.js renderer on the user's saved stack; idle breathes via fake (until analyser attaches), live via Audio.getAnalyser()
let mainWave = null;
function mainWaveInit(){
  if(!els.wave) return;
  try{
    mainWave = createWaveRenderer(els.wave);
    mainWave.setConfig(Storage.getWave());
    mainWave.setFakeEnabled(true);
    if (!isWaveHidden()) mainWave.start(); // T3 (#109): hidden → strip stays stopped until re-enabled
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
// stagebar seam lives in js/modules/stagebar.js (mounted at file end) — see ticket 29.
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
  const undo = Stagebar.stagePushRaw(p.scope);
  Stagebar.stageApply(p.scope, p.text);
  undo.newEnd = p.scope.start + p.text.length;
  Stagebar.stageQuotaSplit(p.model, p.scope.text.split(/\s+/).length, p.scope.text.length);
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
// --- user guide (issue #95, ticket/guide-content): single source of truth for guide tabs + control titles ---
// ANTI-ROT: any PR touching stagebar/settings/quota UI MUST touch this GUIDE map
// (add/update/remove the matching entry) — enforced via the hamnegar-reviewer gate.
// The guide dialog tabs AND the applyShortcutHints() control titles render from it.
const GUIDE = {
  tools: [
    { id:'g-mic', title:'ضبط صدا', body:'دکمهٔ میکروفون نوار پایین ضبط را شروع/متوقف می‌کند؛ ✕ کناری لغو و دورریختن است.', ref:'btn-mic' },
    { id:'g-cancel', title:'لغو ضبط', body:'ضبط یا رونویسی جاری را لغو و دور می‌ریزد (آخرین راه Esc هم همین است).', ref:'btn-cancel-stt' },
    { id:'g-undo', title:'واگرد', body:'متن را یک قدم برمی‌گرداند — فقط وقتی کادر خروجی فوکوس است.', ref:'btn-undo' },
    { id:'g-redo', title:'ازنو', body:'واگرد را برمی‌گرداند — فقط با فوکوس کادر خروجی.', ref:'btn-redo' },
    { id:'g-output', title:'کادر خروجی', body:'متن نهایی اینجاست؛ پیش‌نویس خودکار ذخیره می‌شود.', ref:'output' },
    { id:'g-simple', title:'پالایش ساده', body:'املا و علائم نگارشی متن دامنه (کل متن یا انتخاب).', ref:'stage-simple' },
    { id:'g-advanced', title:'پالایش پیشرفته', body:'املا + دستور زبان؛ کامل‌ترین ویرایش فارسی.', ref:'stage-advanced' },
    { id:'g-grammar', title:'پالایش دستوری', body:'فقط دستور زبان؛ املا و واژه‌ها دست نمی‌خورند.', ref:'stage-grammar' },
    { id:'g-trquick', title:'ترجمه سریع EN⇄FA', body:'ترجمهٔ فوری انگلیسی⇄فارسی بدون انتخاب زبان.', ref:'stage-tr-quick' },
    { id:'g-trpanel', title:'ترجمه به زبان…', body:'پنل جست‌وجوی زبان را باز می‌کند؛ Enter یعنی اجرای ترجمه به زبان برجسته.', ref:'stage-tr-panel' },
    { id:'g-langsearch', title:'جست‌وجوی زبان', body:'نام یا کد زبان را بنویس (مثل en یا عربی)؛ Enter ترجمه به زبان برجسته است.', ref:'stage-lang-search' },
    { id:'g-raw', title:'خام', body:'متن پیش از آخرین پالایش را برمی‌گرداند؛ تا پالایشی نشده غیرفعال است.', ref:'stage-raw' },
    { id:'g-diffapply', title:'اعمال نتیجه', body:'نتیجهٔ شیت بازبینی را می‌پذیرد؛ سهمیه فقط همین‌جا مصرف می‌شود.', ref:'diff-apply' },
    { id:'g-diffdiscard', title:'دور ریختن نتیجه', body:'نتیجهٔ بازبینی‌نشده را دور می‌ریزد؛ هیچ پشته‌ای لمس نمی‌شود.', ref:'diff-discard' },
  ],
  config: [
    { id:'g-settings', title:'تنظیمات', body:'دکمهٔ ⚙️ نوار پایین مدال تنظیمات را باز می‌کند: زنجیره‌ها، کلیدها، رفتار.', ref:'btn-settings' },
    { id:'g-modal', title:'مدال تنظیمات', body:'Esc اول پنل افزودن را می‌بندد، بعد خود مدال را — بدون ذخیره.', ref:'settings-modal' },
    { id:'g-closemodal', title:'بستن تنظیمات', body:'مدال را بدون ذخیرهٔ اضافه می‌بندد.', ref:'btn-close-modal' },
    { id:'g-realtime', title:'حالت آنی', body:'پیش‌نمایش زندهٔ رونویسی حین صحبت.', ref:'toggle-realtime' },
    { id:'g-vad', title:'VAD', body:'ارسال خودکار پس از سکوت؛ بدون آن باید دستی متوقف کنی.', ref:'toggle-vad' },
    { id:'g-autocopy', title:'کپی خودکار', body:'متن نهایی پس از هر اجرا خودکار کپی می‌شود.', ref:'toggle-autocopy' },
    { id:'g-polish', title:'پالیش نهایی', body:'ویرایش خودکار متن رونوشت؛ خاموش یعنی درج متن خام.', ref:'toggle-polish' },
    { id:'g-stt', title:'زنجیرهٔ STT', body:'ترتیب تلاش مدل‌های گفتار→متن؛ مدل بی‌کلید بی‌صدا رد می‌شود.', ref:'stt-chain' },
    { id:'g-polishchain', title:'زنجیرهٔ پالیش', body:'ترتیب ویرایشگرهای فارسی؛ اولین مدلِ دارای کلید جواب می‌دهد.', ref:'polish-chain' },
    { id:'g-keys', title:'کلیدهای ارائه‌دهنده', body:'کلید Groq (با gsk_) و Google (با AQ.) را در کارت خود بگذار و «تست» بزن.', ref:'provider-drawer' },
    { id:'g-wavehygiene', title:'تنظیمات مرده موج', body:'ضخامت فقط ۶ نوع خطی، شکل/تعداد/فاصله فقط ستون‌ها، رنگ ۲ فقط گرادیان، ته‌رنگ فقط با aurora روشن؛ حساسیت هر موج گین پیش‌نمایش است نه گیت.', ref:'panel-wave' },
    { id:'g-wavehide', title:'پنهان‌سازی انیمیشن صدا', body:'نوار موج را به ارتفاع صفر می‌برد و همه حلقه‌های موج (نوار، پیش‌نمایش، استارترها) را می‌خواباند؛ با همان تیک برمی‌گردد و روی دیسک می‌ماند. حاشیه‌های ضبط/رونویسی جدا هستند.', ref:'wave-hide' },
  ],
  quota: [
    { id:'g-quota', title:'سهمیه امروز', body:'روی نوار «سهمیه امروز» بزن تا جزئیات هر مدل باز شود: مصرف امروز در برابر سقف روزانه.', ref:'quota-toggle' },
    { id:'g-quotadetail', title:'جزئیات مصرف', body:'کارت هر مدل: مصرف امروز، سقف روزانه و هشدار نزدیک‌شدن به سقف.', ref:'quota-detail' },
  ],
};
function guideEntryByRef(ref){
  for (const sec of Object.values(GUIDE)){ const f = sec.find(e => e.ref === ref); if (f) return f; }
  return null;
}
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
const GUIDE_TABS = ['shortcuts', 'tools', 'config', 'quota'];
function renderGuide(){
  for (const name of GUIDE_TABS){
    if (name === 'shortcuts') continue; // shortcuts tab output untouched (renders from SHORTCUTS)
    const panel = $('guide-panel-' + name);
    if (!panel) continue;
    panel.innerHTML = '';
    for (const e of (GUIDE[name] || [])){
      const row = document.createElement('div');
      const b = document.createElement('b'); b.textContent = e.title;
      const p = document.createElement('p'); p.className = 'sc-note'; p.textContent = e.body;
      row.append(b, p);
      panel.appendChild(row);
    }
  }
}
function selectGuideTab(name){
  if (!GUIDE_TABS.includes(name)) return;
  for (const n of GUIDE_TABS){
    const tab = $('guide-tab-' + n), panel = $('guide-panel-' + n);
    const on = n === name;
    tab?.setAttribute('aria-selected', on ? 'true' : 'false');
    tab?.classList.toggle('active', on);
    if (tab) tab.tabIndex = on ? 0 : -1;
    // NOTE: author CSS sets display on .sc-body which beats [hidden]; hide inline (no css/app.css change).
    if (panel){ panel.hidden = !on; panel.style.display = on ? '' : 'none'; }
  }
}
for (const n of GUIDE_TABS){
  $('guide-tab-' + n)?.addEventListener('click', () => selectGuideTab(n));
}
$('shortcuts-dialog')?.addEventListener('keydown', (e) => {
  if (e.target?.getAttribute?.('role') !== 'tab') return;
  const i = GUIDE_TABS.indexOf(GUIDE_TABS.find(n => $('guide-tab-' + n) === e.target));
  if (i < 0) return;
  let j = null;
  if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') j = (i + (e.key === 'ArrowLeft' ? 1 : -1) + GUIDE_TABS.length) % GUIDE_TABS.length; // RTL: Left = next
  else if (e.key === 'Home') j = 0;
  else if (e.key === 'End') j = GUIDE_TABS.length - 1;
  if (j === null) return;
  e.preventDefault();
  selectGuideTab(GUIDE_TABS[j]);
  $('guide-tab-' + GUIDE_TABS[j])?.focus?.();
});
function openShortcuts(){
  renderShortcuts();
  renderGuide();
  selectGuideTab('shortcuts');
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
    const base = (el.id && guideEntryByRef(el.id)?.title) || el.getAttribute('title') || '';
    if (!base.includes(hint)) el.setAttribute('title', (base ? base + ' — ' : '') + hint);
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
// stagebar run/wiring lives in js/modules/stagebar.js (mounted below) — see ticket 29.
// (ticket 30: renderAllChains→stage-model refresh now rides the chains.js onChainsRendered hook.)
Stagebar = mountStagebar({
  getSelStart: () => selStart, getSelEnd: () => selEnd,
  getPolishChain,
  getDiffPending: () => diffPending,
  saveCursor, updateCounts, editorHistory, syncActionbar, engineInfo,
  entryIdOf, providerIdOf, sanitizeMsg, diffEls, openDiffRunning, fillDiffSheet, closeDiffSheet,
});
mainWaveInit();
waveKillApply(); // T3 (#109): apply persisted kill-switch on load (hide + stop, or show)
const verEl = document.getElementById('settings-version'); if (verEl) verEl.textContent = `v${VERSION}`;
Dashboard.ensureReportUI();
Logger.log('info',`هم‌نگار v${VERSION} (${BUILD}) آماده`, {hasRealtime: Realtime.isSupported(), proto: location.protocol, version: VERSION});
Quota.render(els.quotaGrid, { period: Dashboard.getPeriod() });
Dashboard.renderOverall();
