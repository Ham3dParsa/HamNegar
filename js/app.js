// Entry: wires deep modules together. Keeps orchestration thin; all heavy work stays behind module interfaces.
import { Storage, STT_DEFAULTS, POLISH_DEFAULTS } from './modules/storage.js';
import { createWaveRenderer } from './modules/wave.js';
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
import { mountToolsTab, refreshToolsTab } from './modules/toolsTab.js';
import {
  mountChains, getSttChain, setSttChain, getPolishChain, setPolishChain,
  renderAllChains, renderFlowListSoon, renderCustomProviders, flowInit, persistChains,
  providerIdOf, entryIdOf, sanitizeMsg, hasKeyFor,
  chainPanelEls, chainPanelOpen, setChainPanel, ensureLiveCatalog, syncCustomProviderSelects,
} from './modules/chains.js';
import { $ } from './modules/dom.js';
import { fa } from './modules/format.js';
import { worstOf } from './modules/quota-badge.js';
import { VoiceQueue } from './modules/voiceQueue.js';

const els = {
  btnMic: $('btn-mic'), btnCopy: $('btn-copy'), btnClear: $('btn-clear'), btnPause: $('btn-pause'), btnSettings: $('btn-settings'),
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
  btnGroqModels: $('btn-groq-models'), btnOrModels: $('btn-or-models'), btnGeminiModels: $('btn-gemini-models'),
  tabAi: $('tab-ai'), panelAi: $('panel-ai'),
  tabKeys: $('tab-keys'), panelKeys: $('panel-keys'),
  tabBehavior: $('tab-behavior'), panelBehavior: $('panel-behavior'),
  tabTools: $('tab-tools'), panelTools: $('panel-tools'),
  tabPipeline: $('tab-pipeline'), panelPipeline: $('panel-pipeline'),
  tabWave: $('tab-wave'), panelWave: $('panel-wave'),
  btnExpandStt: $('btn-expand-stt'), btnExpandPolish: $('btn-expand-polish'),
  providerDrawer: $('provider-drawer'),
  sttAddPanel: $('stt-add-panel'), sttAddSearch: $('stt-add-search'), sttAddList: $('stt-add-list'),
  polishAddPanel: $('polish-add-panel'), polishAddSearch: $('polish-add-search'), polishAddList: $('polish-add-list'),
  customList: $('custom-providers-list'), customName: $('custom-name'), customBaseUrl: $('custom-base-url'), customKey: $('custom-key'),
  easyModelInput: $('easy-model-input'),
  actionbar: document.querySelector('.actionbar'),
  onboardingCard: $('onboarding-card'),
  inspector: $('studio-inspector'), inspectorToggle: $('inspector-toggle'), btnInspector: $('btn-inspector'), inspectorClose: $('inspector-close'),
  btnUploadAudio: $('btn-upload-audio'), audioFileInput: $('audio-file-input'),
  modeQuick: $('mode-quick'), modeLecture: $('mode-lecture'),
  presetQuick: $('preset-quick'), presetLecture: $('preset-lecture'),
  pendingVoices: $('pending-voices'), pvList: $('pv-list'), pvHeading: $('pv-heading'),
  pvNetDot: $('pv-net-dot'), pvNetNote: $('pv-net-note'), btnRetryAllVoices: $('btn-retry-all-voices'),
};

const IC_SEARCH = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>';
const IC_CLOSE = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M18 6L6 18M6 6l12 12"/></svg>';
const IC_RETRY = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 0 1 15.5-6.3L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-15.5 6.3L3 16"/><path d="M3 21v-5h5"/></svg>';
const IC_PLAY = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="7 5 19 12 7 19 7 5"/></svg>';
const IC_STOP = '<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>';
const IC_DL = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v12"/><path d="M7 10l5 5 5-5"/><path d="M4 18v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/></svg>';
const IC_TRASH = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16"/><path d="M9 7V4h6v3"/><path d="M7 7l1 13h8l1-13"/></svg>';
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
  closeBtn.innerHTML = IC_CLOSE;
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
  toggle.innerHTML = IC_SEARCH;
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

if (location.protocol === 'file:') { if(els.fileWarn) els.fileWarn.style.display='block'; if(els.fileWarn) els.fileWarn.hidden = false; Logger.log('warn','file:// باز شده',location.href); } else { if(els.fileWarn){ els.fileWarn.style.display = 'none'; els.fileWarn.hidden = true; } }

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
let onboardingDismissed = false;
function syncOnboarding() {
  const card = els.onboardingCard;
  if (!card) return;
  const hasKey = typeof Settings !== 'undefined' && Settings ? Settings.hasAnyConfiguredKey() : false;
  const hasText = !!(els.output && els.output.value.trim());
  card.hidden = hasKey || hasText || onboardingDismissed;
}
function syncModeUI() {
  const isQuick = !!els.toggleVad?.checked;
  els.modeQuick?.classList.toggle('active', isQuick);
  els.modeQuick?.setAttribute('aria-pressed', isQuick ? 'true' : 'false');
  els.modeLecture?.classList.toggle('active', !isQuick);
  els.modeLecture?.setAttribute('aria-pressed', !isQuick ? 'true' : 'false');
  els.presetQuick?.classList.toggle('active', isQuick);
  els.presetQuick?.setAttribute('aria-pressed', isQuick ? 'true' : 'false');
  els.presetLecture?.classList.toggle('active', !isQuick);
  els.presetLecture?.setAttribute('aria-pressed', !isQuick ? 'true' : 'false');
}
function syncQuickToggles() {
  const pop = $('behavior-pop');
  if (!pop) return;
  const state = {
    realtime: !!els.toggleRealtime?.checked,
    vad: !!els.toggleVad?.checked,
    polish: !!els.togglePolish?.checked,
    autocopy: !!els.toggleAutocopy?.checked,
  };
  pop.querySelectorAll('[data-quick-toggle]').forEach((btn) => {
    const k = btn.dataset.quickToggle;
    if (!(k in state)) return;
    const on = state[k];
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    btn.classList.toggle('active', on);
  });
}
function applyPresetMode(mode) {
  const vad = mode === 'quick';
  if (els.toggleVad) els.toggleVad.checked = vad;
  Storage.saveSettings({ vad });
  syncModeUI();
  syncQuickToggles();
  Logger.toast(vad ? 'حالت روزمره: توقف خودکار در سکوت روشن است' : 'حالت کلاس: ضبط پیوسته بدون قطع در سکوت');
}

const Wave = mountWaveTab({ els, getMainWave: () => mainWave, syncRecStrip });
const { waveEnsure, wavePrevStart, wavePrevStop, waveStarterPause, waveFollowStop, waveMicStop, waveSync, waveKillApply, isWaveHidden, isWaveMicActive } = Wave;
const Settings = mountSettingsModal({
  els, getStagebar: () => Stagebar,
  hasKeyFor, providerIdOf, getSttChain, setSttChain, getPolishChain, setPolishChain,
  renderAllChains, renderFlowListSoon, renderCustomProviders, flowInit, persistChains,
  chainPanelOpen, setChainPanel, chainPanelEls, STT_DEFAULTS, POLISH_DEFAULTS,
  waveEnsure, wavePrevStart, wavePrevStop, waveStarterPause, waveFollowStop, waveMicStop, waveSync, mainWaveSync,
  isWaveMicActive,
  onPipelineOpen: () => ensureLiveCatalog(),
  onToolsOpen: () => mountToolsTab({ onToolsChanged: () => Stagebar?.renderToolsUI?.() }),
  syncCustomProviderSelects,
  onSettingsSync: () => { syncOnboarding(); syncModeUI(); syncQuickToggles(); try { refreshToolsTab(); } catch {} },
});
const { engineInfo, updateBadge, renderProvidersStatus, loadSettings, saveSettings, openModal, closeModal, hasAnyConfiguredKey } = Settings;
$('btn-x-modal')?.addEventListener('click', () => closeModal());

// --- preference chains UI + models flow + inline add panels live in js/modules/chains.js (ticket 30) ---
// Mounted here (original region-1 slot) so listener registration order is unchanged;
// chains.js owns labels, chain state, flow cache/filters and all row/panel behavior verbatim.
mountChains({
  els, updateBadge, saveSettings, shortcutsOpen, renderProvidersStatus,
  onChainsRendered: () => { try { Stagebar.renderStageModelOptions(); } catch {} try { refreshToolsTab(); } catch {} },
  onSettingsSync: () => { syncOnboarding(); syncModeUI(); syncQuickToggles(); },
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
  if (tx) tx.textContent = label; else els.btnToggleLog.textContent = label;
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

// progressive disclosure inspector (mobile bottom-sheet drawer, desktop side panel)
function isInspectorOpen(){
  return els.inspector?.dataset.open === 'true';
}
function setInspectorOpen(open){
  if (!els.inspector) return;
  els.inspector.dataset.open = open ? 'true' : 'false';
  els.inspectorToggle?.setAttribute('aria-expanded', open ? 'true' : 'false');
  els.btnInspector?.setAttribute('aria-expanded', open ? 'true' : 'false');
  els.btnInspector?.classList.toggle('active', open);
}
els.inspectorToggle?.addEventListener('click', () => setInspectorOpen(!isInspectorOpen()));
els.btnInspector?.addEventListener('click', () => setInspectorOpen(!isInspectorOpen()));
els.inspectorClose?.addEventListener('click', () => setInspectorOpen(false));

// quota strip: collapsed slim head (today numbers + worst-provider dot); details toggle reveals grid/report
function setQuotaExpanded(v){
  const detail = $('quota-detail'), toggle = $('quota-toggle');
  if(!detail || !toggle) return;
  detail.hidden = !v;
  toggle.setAttribute('aria-expanded', String(v));
}
$('quota-toggle')?.addEventListener('click', ()=> setQuotaExpanded(!!$('quota-detail')?.hidden));
function refreshQuotaStrip(){
  const nums = $('quota-nums'), dot = $('quota-dot');
  if(!nums && !dot) return;
  let s = null;
  try{ s = Quota.getSummary('today'); }catch{ return; }
  if(!s) return;
  if(nums) nums.textContent = `${fa(s.totals.count)} درخواست · ${fa(s.totals.words)} کلمه`;
  if(dot){
    const badge = worstOf(s);
    dot.className = 'dot' + (badge ? ' ' + badge : '');
  }
}
if(els.quotaGrid) new MutationObserver(()=> refreshQuotaStrip()).observe(els.quotaGrid, { childList: true });
refreshQuotaStrip();

// output draft + counters + heights
selStart=0; selEnd=0; const saveCursor=()=>{ selStart=els.output.selectionStart; selEnd=els.output.selectionEnd; };
els.output.addEventListener('click',saveCursor); els.output.addEventListener('keyup',saveCursor); els.output.addEventListener('select',saveCursor);
const updateCounts = () => {
  const v = els.output.value;
  const words = v.trim() ? v.trim().split(/\s+/).length : 0;
  els.charCount.textContent = `${fa(v.length)} کاراکتر`;
  els.wordCount.textContent = `${fa(words)} کلمه`;
  syncOnboarding();
  autogrowOutput();
};
// transcript autogrow: generous mobile writing height when keyboard is closed,
// tight keyboard cap ONLY when virtual keyboard shrinks visualViewport.
let outManual=false;
let vpPeak=Math.max(window.innerHeight, window.visualViewport ? window.visualViewport.height : 0);
let kbCapOn=false, lastVpH=window.innerHeight;
function outputCap(){
  const vv=window.visualViewport;
  const vh=Math.round(Math.min(vv ? vv.height : window.innerHeight, window.innerHeight));
  const vw=Math.round(vv ? vv.width : window.innerWidth);
  if(kbCapOn){
    let cap=Math.round(vh * 0.4);
    if(vw <= 420) cap=Math.min(cap, 280);
    return Math.max(cap, 96);
  }
  const ratio = vw <= 640 ? 0.52 : 0.6;
  return Math.max(Math.round(vh * ratio), 140);
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
els.output.addEventListener('input',()=>{ saveCursor(); updateCounts(); if(!editorHistory.pushing) editorHistory.push(els.output.value); clearTimeout(draftTimer); draftTimer=setTimeout(()=> { draftTimer=null; Storage.saveDraft(els.output.value); },400); });
function flushDraft(){ if(draftTimer){ clearTimeout(draftTimer); draftTimer=null; Storage.saveDraft(els.output.value); } }
window.addEventListener('pagehide', flushDraft);
window.addEventListener('beforeunload', flushDraft);
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

// main rec strip (#91 T3 static-unless-live): wave.js renderer on the user's saved stack; idle is a static line (fake OFF on this instance only — settings preview/starters keep their own fake demo), live motion only via Audio.getAnalyser()
let mainWave = null;
function mainWaveInit(){
  if(!els.wave) return;
  try{
    mainWave = createWaveRenderer(els.wave);
    mainWave.setConfig(Storage.getWave());
    mainWave.setFakeEnabled(false); // main strip only: never dance without real voice
    mainWave.setState('idle');
    if (!isWaveHidden()) mainWave.start(); // draws static line synchronously, zero idle rAF
  }catch{ mainWave = null; }
}
function mainWaveLive(){
  try{
    mainWave?.setAnalyser(Audio.getAnalyser() || null);
    mainWave?.setState(isPaused ? 'paused' : 'recording');
    if (!isWaveHidden()) mainWave?.start();
  }catch{}
  syncRecStrip();
}
function mainWaveTranscribing(){
  try{
    mainWave?.setAnalyser(null);
    mainWave?.setState('transcribing');
    if (!isWaveHidden()) mainWave?.start();
  }catch{}
  syncRecStrip();
}
function mainWaveIdle(){
  try{
    mainWave?.setAnalyser(null);
    mainWave?.setState('idle');
    mainWave?.stop();
  }catch{}
  syncRecStrip();
} // detach → static line, zero rAF
function mainWaveSync(){ try{ mainWave?.setConfig(Storage.getWave()); }catch{} }
function syncRecStrip(){
  const strip = $('rec-strip');
  if(!strip) return;
  strip.classList.toggle('recording', isRecording && !isPaused);
  strip.classList.toggle('paused', isRecording && isPaused);
  strip.classList.toggle('transcribing', isTranscribing && !isRecording);
  if (mainWave) {
    if (isRecording && isPaused) mainWave.setState('paused');
    else if (isRecording) mainWave.setState('recording');
    else if (isTranscribing) mainWave.setState('transcribing');
    else mainWave.setState('idle');
  }
}

let rtVersion = 0;
let rtSnap = null;
let rtPaused = false;

function makeOnInterim(snap){
  let lastPreview = (snap.archived || '') + snap.committed + snap.pending;
  return (preview, fin)=>{
    const finCum = fin || '';
    const interChunk = preview.slice(finCum.length);
    if(finCum && finCum !== snap.committed){
      const newChunk = finCum.slice(snap.committed.length);
      snap.committed = finCum;
      if(newChunk.trim()) Logger.log('debug','realtime committed', newChunk.trim());
    }
    snap.pending = interChunk;
    const fullCommitted = (snap.archived || '') + snap.committed;
    const fullPreview = fullCommitted + snap.pending;
    if(els.liveFinal) els.liveFinal.textContent = fullCommitted;
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

let isRecording=false, isPaused=false, vadTimer=null;
let recordingStarting=false;
// ticket/106 — realtime failure surfaces (additive; engine untouched).
// Every realtime failure lands here: unsupported browser, start()==false,
// SR onError codes, onend while recording. Recording (Audio path) always
// continues; only the live layer degrades with a visible hint.
const RT_MAX_RESTARTS = 5; // guard: onend auto-restart never loops forever
const RT_RESTART_BASE_MS = 800; // linear backoff × attempt (800…4000ms)
let rtRestarts = 0, rtRestartTimer = 0, rtFatal = false;
function rtClearRestart(){ if (rtRestartTimer) { clearTimeout(rtRestartTimer); rtRestartTimer = 0; } }
function realtimeHint(code){
  switch (String(code || '')) {
    case 'not-allowed':
    case 'service-not-allowed':
      return 'دسترسی به میکروفون برای حالت آنی رد شد — از نوار آدرس اجازه بده؛ ضبط بدون متن زنده ادامه دارد';
    case 'network':
      return 'خطای شبکه در حالت آنی — اتصال را چک کن؛ ضبط ادامه دارد';
    case 'audio-capture':
      return 'میکروفون برای حالت آنی پیدا نشد — دستگاه را چک کن؛ ضبط ادامه دارد';
    case 'no-speech':
      return 'صدایی شنیده نشد — بلندتر بگو';
    case 'aborted':
      return 'حالت آنی متوقف شد';
    default:
      return 'خطای حالت آنی (' + String(code || 'نامشخص') + ') — ضبط بدون متن زنده ادامه دارد';
  }
}
function rtHandlers(snap, onInterim){
  return {
    onInterim: (p, f) => onInterim(p, f),
    onFinal: f => Logger.log('debug', 'final', f),
    onError: e => handleRealtimeError(e, snap),
    onEnd: () => handleRealtimeEnd(snap, onInterim),
  };
}
function rtStartOrSurface(snap, onInterim){
  // start() false = engine refused (unsupported/exception) — visible, not silent
  let ok = false;
  try { ok = Realtime.start(snap.basePos, rtHandlers(snap, onInterim), snap.id); } catch { ok = false; }
  if (!ok) {
    Logger.setStatus('⚠️ حالت آنی شروع نشد — ضبط بدون متن زنده ادامه دارد', 'warn');
    Logger.toast('حالت آنی شروع نشد — ضبط ادامه دارد');
    Logger.log('warn', 'WebSpeech', 'start-failed');
    els.btnMic.classList.remove('realtime-active');
  }
  return ok;
}
function handleRealtimeError(code, snap){
  if (!snap || rtSnap?.id !== snap.id) return; // stale race — never surface
  const c = String(code || '');
  Logger.log('warn', 'WebSpeech', c);
  if (c === 'aborted' || c === 'no-speech' || c === '') return; // transient — log only
  if (c === 'not-allowed' || c === 'service-not-allowed' || c === 'audio-capture') rtFatal = true; // retry is pointless — onend must not restart
  Logger.setStatus('⚠️ ' + realtimeHint(c), 'error');
  Logger.toast(realtimeHint(c));
}
function handleRealtimeEnd(snap, onInterim){
  if (!isRecording || isPaused || rtPaused || !snap || rtSnap?.id !== snap.id || rtFatal) return;
  if (rtRestarts >= RT_MAX_RESTARTS) {
    Logger.setStatus('⚠️ حالت آنی قطع شد — ضبط بدون متن زنده ادامه دارد', 'warn');
    Logger.toast('حالت آنی قطع شد — ضبط ادامه دارد');
    Logger.log('warn', 'WebSpeech', 'restart-budget-exhausted');
    els.btnMic.classList.remove('realtime-active');
    return;
  }
  rtRestarts++;
  Logger.log('info', 'تلاش مجدد حالت آنی', { attempt: rtRestarts, of: RT_MAX_RESTARTS });
  rtClearRestart();
  rtRestartTimer = setTimeout(() => {
    rtRestartTimer = 0;
    if (!isRecording || isPaused || rtPaused || !snap || rtSnap?.id !== snap.id || rtFatal) return;
    if (snap.committed) {
      snap.archived = (snap.archived || '') + snap.committed;
      snap.committed = '';
      snap.pending = '';
    }
    rtStartOrSurface(snap, makeOnInterim(snap));
  }, RT_RESTART_BASE_MS * rtRestarts);
}
let isTranscribing=false;
let transcribingAbort=null;
let discardRecording=false; // cancel during rec: drop the blob instead of transcribing
// ticket 15 — actionbar variant A: hero morph + pause/resume + cancel visible during rec AND transcribing + BIG timer chip
let recStartMs=0, recTimerId=null, accumulatedRecMs=0, recSegmentStartMs=0;
function getRecElapsedMs(){
  if (!recSegmentStartMs) return accumulatedRecMs;
  if (isPaused || !isRecording) return accumulatedRecMs;
  return accumulatedRecMs + Math.max(0, performance.now() - recSegmentStartMs);
}
function recTimerPaint(){
  const el=document.getElementById('mic-timer');
  if(!el || el.hidden) return;
  const s=Math.max(0, Math.floor(getRecElapsedMs()/1000));
  el.textContent=`${fa(String(Math.floor(s/60)).padStart(2,'0'))}:${fa(String(s%60).padStart(2,'0'))}`;
}
function recTimerStart(){
  recStartMs=performance.now();
  recSegmentStartMs=recStartMs;
  accumulatedRecMs=0;
  const el=document.getElementById('mic-timer');
  if(el){ el.hidden=false; el.classList.add('live'); el.classList.remove('paused'); }
  recTimerPaint();
  if(recTimerId) clearInterval(recTimerId);
  recTimerId=setInterval(recTimerPaint, 250);
}
function recTimerPause(){
  if (recSegmentStartMs) {
    accumulatedRecMs += Math.max(0, performance.now() - recSegmentStartMs);
    recSegmentStartMs = 0;
  }
  if(recTimerId){ clearInterval(recTimerId); recTimerId=null; }
  const el=document.getElementById('mic-timer');
  if(el){ el.classList.remove('live'); el.classList.add('paused'); }
  recTimerPaint();
}
function recTimerResume(){
  recSegmentStartMs=performance.now();
  const el=document.getElementById('mic-timer');
  if(el){ el.classList.remove('paused'); el.classList.add('live'); }
  recTimerPaint();
  if(recTimerId) clearInterval(recTimerId);
  recTimerId=setInterval(recTimerPaint, 250);
}
function recTimerStop(){
  if (recSegmentStartMs) {
    accumulatedRecMs += Math.max(0, performance.now() - recSegmentStartMs);
    recSegmentStartMs = 0;
  }
  if(recTimerId){ clearInterval(recTimerId); recTimerId=null; }
  const el=document.getElementById('mic-timer');
  el?.classList.remove('live', 'paused');
}
function recTimerReset(){
  recTimerStop();
  accumulatedRecMs=0;
  recStartMs=0;
  const el=document.getElementById('mic-timer');
  if(el){ el.textContent='۰۰:۰۰'; el.hidden=true; }
}
function syncActionbar(){
  const mic=els.btnMic, cb=els.btnCancel, pb=els.btnPause, tm=document.getElementById('mic-timer');
  if(!mic) return;
  const active = isRecording || isTranscribing;
  els.actionbar?.classList.toggle('is-active', active);
  if (els.btnUploadAudio) els.btnUploadAudio.disabled = active;
  if ($('tools-toggle')) $('tools-toggle').disabled = active;
  mic.classList.toggle('recording', isRecording);
  mic.classList.toggle('paused', isRecording && isPaused);
  mic.classList.toggle('transcribing', isTranscribing);
  mic.setAttribute('aria-busy', active ? 'true' : 'false');
  mic.setAttribute('aria-label', isRecording ? (isPaused ? 'پایان ضبط و تبدیل' : 'توقف و تبدیل') : isTranscribing ? 'در حال تبدیل' : 'شروع ضبط');
  if(pb){
    const showPause = isRecording && Audio.canPause();
    pb.hidden = !showPause;
    pb.classList.toggle('is-paused', isPaused);
    pb.setAttribute('aria-pressed', isPaused ? 'true' : 'false');
    pb.setAttribute('aria-label', isPaused ? 'ادامه ضبط' : 'مکث ضبط');
    const lbl = $('pause-lbl');
    if (lbl) lbl.textContent = isPaused ? 'ادامه' : 'مکث';
  }
  if(cb){
    if(cb.hasAttribute('hidden')!==!active) cb.hidden=!active;
    cb.classList.remove('cancel-appear');
    if(active){ void cb.offsetWidth; cb.classList.add('cancel-appear'); }
  }
  if(tm) tm.hidden=!active;
  updateHistoryButtons();
  if (typeof pendingVoicesCache !== 'undefined' && pendingVoicesCache.length) renderPendingVoices();
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
  // T1 double-start guard: block re-entry while starting or already recording
  if (isRecording || recordingStarting || Audio.isRecording()) { Logger.toast('⏳ در حال شروع ضبط…', 1200); return; }
  setToolsOpen(false);
  setBehaviorOpen(false);
  discardRecording = false; // defensive: a missed onStop must never discard a later recording
  if (isTranscribing) { shakeMic(); Logger.toast('⏳ صبر کن — تبدیل ادامه دارد…', 2000); return; }
  saveCursor();
  const s=Storage.getSettings();
  const hasBatchKey = hasAnyConfiguredKey();
  // live preview is keyless — only the batch key gate stays. Keyless
  // recording is allowed when realtime can actually preview (realtime=1 + SR
  // supported); otherwise open the Keys setup tab directly.
  const keylessPreview = !hasBatchKey && s.realtime && Realtime.isSupported();
  if(!hasBatchKey && !keylessPreview){ Logger.setStatus('برای ضبط دقیق یک کلید رایگان وارد کن','warn'); openModal('keys'); return; }
  let snap=null;
  recordingStarting = true;
  try{
    snap = { id: ++rtVersion, startMs: 0, durationMs: 0, basePos: selStart, before: els.output.value.slice(0, selStart), after: els.output.value.slice(selEnd), archived:'', committed:'', pending:'', keyless: keylessPreview };
    rtSnap = snap;
    const vadMs = s.vad ? 250 : undefined;
    await Audio.start({ vadChunkMs: vadMs, onStop: (blob)=> handleTranscription(blob, snap) });
    snap.startMs = performance.now();
    isRecording=true;
    isPaused=false;
    rtPaused=false;
    rtRestarts = 0; rtFatal = false; rtClearRestart(); // ticket/106: fresh restart budget per recording
    recTimerStart();
    if(s.realtime) els.btnMic.classList.add('realtime-active');
    syncActionbar();
    Logger.setStatus('🔴 در حال ضبط...'+(s.realtime?' (زنده)':'')+(snap.keyless?' — پیش‌نمایش زنده بدون کلید؛ ثبت نهایی نیاز به کلید':''),'rec');
    if(snap.keyless){ Logger.toast('پیش‌نمایش زنده بدون کلید؛ ثبت نهایی نیاز به کلید', 3500); Logger.log('warn','keyless realtime preview',{snapId: snap.id}); }
    mainWaveLive();
    if(s.realtime){
      if(!Realtime.isSupported()){
        // ticket/106 else-branch: unsupported browser — persistent hint + auto-untoggle
        if (els.toggleRealtime) els.toggleRealtime.checked = false;
        try { Storage.saveSettings({ realtime: false }); } catch {}
        els.btnMic.classList.remove('realtime-active');
        Logger.setStatus('⚠️ مرورگر از حالت آنی پشتیبانی نمی‌کند — ضبط بدون متن زنده ادامه دارد', 'warn');
        Logger.toast('مرورگر حالت آنی ندارد — ضبط ادامه دارد');
        Logger.log('warn', 'realtime-unsupported');
      } else {
        if(els.livePreview) els.livePreview.classList.add('on'); if(els.liveBadge) els.liveBadge.classList.add('on'); if(els.liveFinal) els.liveFinal.textContent=''; if(els.liveInterim) els.liveInterim.textContent='';
        const onInterim = makeOnInterim(snap);
        rtStartOrSurface(snap, onInterim);
        Logger.log('info','حالت آنی روشن',{snapId: snap.id, basePos: snap.basePos, beforeLen: snap.before.length, afterLen: snap.after.length});
      }
    }
    if(s.vad) startVAD();
    Logger.log('info','ضبط شروع',{realtime:s.realtime, vad:s.vad, snapId: snap.id});
  }catch(e){
    try { await Audio.stop(); } catch {}
    if(snap && rtSnap?.id===snap.id) rtSnap=null;
    isPaused=false; rtPaused=false;
    const hint = micErrorHint(e);
    Logger.setStatus(hint,'error');
    Logger.log('error','getUserMedia',{ name: e?.name, msg: e?.message });
    Logger.toast(hint, 4500);
  }
  finally { recordingStarting = false; }
}
function pauseRecording(){
  if (!isRecording || isPaused) return;
  if (!Audio.pause()) { Logger.toast('این مرورگر مکث وسط ضبط را پشتیبانی نمی‌کند'); return; }
  isPaused = true;
  rtPaused = true;
  recTimerPause();
  stopVAD();
  rtClearRestart();
  const snap = rtSnap;
  if (snap && snap.committed) {
    snap.archived = (snap.archived || '') + snap.committed;
    snap.committed = '';
    snap.pending = '';
  }
  Realtime.stop();
  syncActionbar();
  syncRecStrip();
  Logger.setStatus('⏸ ضبط متوقف شد — برای ادامه دکمه «ادامه» را بزن', 'warn');
  Logger.log('info', 'ضبط متوقف موقت شد', { elapsedMs: Math.round(getRecElapsedMs()) });
}
function resumeRecording(){
  if (!isRecording || !isPaused) return;
  if (!Audio.resume()) { Logger.toast('ادامه ضبط ممکن نشد'); return; }
  isPaused = false;
  rtPaused = false;
  recTimerResume();
  syncActionbar();
  mainWaveLive();
  const s = Storage.getSettings();
  if (s.realtime && Realtime.isSupported() && rtSnap) {
    rtStartOrSurface(rtSnap, makeOnInterim(rtSnap));
  }
  if (s.vad) startVAD();
  Logger.setStatus('🔴 ادامه ضبط...' + (s.realtime ? ' (زنده)' : ''), 'rec');
  Logger.log('info', 'ضبط از سر گرفته شد');
}
function togglePauseRecording(){
  if (!isRecording) return;
  if (isPaused) resumeRecording();
  else pauseRecording();
}
els.btnPause?.addEventListener('click', togglePauseRecording);
function stopRecording(){
  if(!isRecording) return;
  const snap = rtSnap;
  recTimerStop(); // capture exact active elapsedMs excluding pause
  if (snap) snap.durationMs = Math.round(accumulatedRecMs);
  Audio.stop(); isRecording=false; isPaused=false; rtPaused=false;
  setMicBusy(true);
  transcribingAbort = new AbortController();
  els.btnMic.classList.remove('realtime-active');
  syncActionbar();
  stopVAD();
  if (discardRecording) mainWaveIdle();
  else mainWaveTranscribing();
  Realtime.stop();
  rtClearRestart(); rtRestarts = 0; rtFatal = false; // ticket/106: user stopped — no restart after onend
  setTimeout(()=>{ if(els.livePreview) els.livePreview.classList.remove('on'); if(els.liveBadge) els.liveBadge.classList.remove('on'); },900);
  if(snap && (snap.archived || snap.committed || snap.pending)){
    const cursor = snap.basePos + ((snap.archived||'') + snap.committed + snap.pending).length;
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
// Recording-cancel is the LAST Esc resort (ticket/2x layering: tr-panel → tools-pop / behavior-pop → diff sheet → modal → cancel).
document.addEventListener('keydown', (e)=>{
  if (e.key !== 'Escape' || e.defaultPrevented) return;
  if (shortcutsOpen()) return; // guide owns Esc while open
  if (diffPending && diffEls().back && !diffEls().back.hidden) return; // diff owns Esc
  const trp = $('tr-panel');
  if (trp && !trp.hidden){ e.preventDefault(); trp.hidden = true; $('stage-tr-panel')?.setAttribute('aria-pressed', 'false'); return; }
  const tpop = $('tools-pop');
  if (tpop && !tpop.hidden){ e.preventDefault(); setToolsOpen(false); $('tools-toggle')?.focus?.(); return; }
  const bpop = $('behavior-pop');
  if (bpop && !bpop.hidden){ e.preventDefault(); setBehaviorOpen(false); $('behavior-toggle')?.focus?.(); return; }
  if (els.modal && els.modal.style.display === 'flex') return; // modal owns Esc
  if (isInspectorOpen() && window.innerWidth < 1080){ e.preventDefault(); setInspectorOpen(false); return; }
  if (isRecording || (isTranscribing && transcribingAbort)){ e.preventDefault(); e.stopPropagation(); cancelTranscription(); }
});
function startVAD(){ if(vadTimer) { clearTimeout(vadTimer); vadTimer=null; } let quiet=0; const loop=()=>{ const an=Audio.getAnalyser(); if(!isRecording||isPaused||!an) return; const d=new Uint8Array(an.frequencyBinCount); an.getByteFrequencyData(d); const avg=d.reduce((a,b)=>a+b,0)/d.length; if(avg<12) quiet+=250; else quiet=0; if(quiet>1400){ Logger.log('info','VAD سکوت — ارسال'); stopRecording(); return; } vadTimer=setTimeout(loop,250); }; vadTimer=setTimeout(loop,500); }
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
  if (!isTranscribing) { setMicBusy(true); if (!transcribingAbort) transcribingAbort = new AbortController(); mainWaveTranscribing(); }
  Logger.log('info','handleTrans',{size:blob.size, snapId: snapId||null, rtActive: !!snap, rtPreviewLen: snap ? ((snap.archived||'')+snap.committed+snap.pending).length : 0});
  if(blob.size<800){
    Logger.setStatus('صدایی ضبط نشد','warn'); Logger.toast('صدایی نیست');
    Logger.dismissProgress(800);
    setMicBusy(false); transcribingAbort = null;
    recTimerReset(); syncActionbar(); mainWaveIdle();
    if(!snap || snapId===rtVersion){ rtSnap=null; }
    if(els.liveFinal) els.liveFinal.textContent=''; if(els.liveInterim) els.liveInterim.textContent=''; if(els.livePreview) els.livePreview.classList.remove('on');
    return;
  }
  const durationMs = snap?.durationMs || (snap?.startMs ? Math.round(performance.now() - snap.startMs) : 0);
  // keyless preview session — preserve the recorded blob too so entering a key
  // lets the user convert what they just said without re-recording.
  {
    if(snap?.keyless && !hasAnyConfiguredKey()){
      await preservePendingVoice({
        blob,
        durationMs,
        reason: 'کلید API ثبت نشده — پس از وارد کردن کلید، «تلاش مجدد» را بزن',
        statusCode: 401,
      });
      Logger.log('info','keyless stop — audio preserved + key prompt',{snapId: snapId||null});
      Logger.dismissProgress(0);
      setMicBusy(false); transcribingAbort = null;
      recTimerReset(); syncActionbar(); mainWaveIdle();
      if(!snap || snapId===rtVersion){ rtSnap=null; }
      if(els.liveFinal) els.liveFinal.textContent=''; if(els.liveInterim) els.liveInterim.textContent=''; if(els.livePreview) els.livePreview.classList.remove('on');
      Logger.setStatus('صدایت ذخیره شد — برای تبدیل دقیق یک کلید رایگان وارد کن','warn');
      Logger.toast('صدایت ذخیره شد — پس از وارد کردن کلید «تلاش مجدد» را بزن', 4000);
      openModal('keys');
      return;
    }
  }
  // Fast offline guard: preserve audio immediately without waiting for fetch timeout
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    await preservePendingVoice({
      blob,
      durationMs,
      reason: 'اینترنت قطع است — صدای شما امن ذخیره شد؛ پس از وصل شدن شبکه «تلاش مجدد» را بزن',
      statusCode: 0,
    });
    Logger.log('warn', 'offline at stop — voice preserved', { size: blob.size, durationMs });
    Logger.setStatus('آفلاین — صدای شما ذخیره شد تا با بازگشت اینترنت تبدیل شود', 'warn');
    Logger.toast('اینترنت قطع است — صدایت امن ذخیره شد', 4000);
    Logger.dismissProgress(0);
    setMicBusy(false); transcribingAbort = null;
    recTimerReset(); syncActionbar(); mainWaveIdle();
    if(!snap || snapId===rtVersion){ rtSnap=null; }
    if(els.liveFinal) els.liveFinal.textContent=''; if(els.liveInterim) els.liveInterim.textContent=''; if(els.livePreview) els.livePreview.classList.remove('on');
    return;
  }
  try{
    const signal = transcribingAbort?.signal;
    Logger.groupRun('🎙 رونویسی');
    const { text, engine, polishModel } = await Transcription.transcribe(blob, { durationMs, signal });
    if(snap && snapId !== rtVersion){ Logger.log('debug','stale resolve after transcribe ignored',{ snapId, current: rtVersion }); throw Object.assign(new Error('stale'), { code:'STALE', aborted:true }); }
    if (signal?.aborted) { throw Object.assign(new Error('لغو شد'), { code:'ABORTED', aborted:true }); }
    if(!text){ Logger.setStatus('متنی برنگشت','warn'); Logger.toast('متنی نیست'); Logger.dismissProgress(800); throw Object.assign(new Error('متنی نیست'), { code:'EMPTY', aborted:false }); }
    const s=Storage.getSettings();
    if(s.realtime && snap){
      const finalText = text.trim();
      const expected = snap.before + (snap.archived || '') + snap.committed + snap.pending + snap.after;
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
      Logger.log('info','realtime polished',{snapId, preview:((snap.archived||'')+snap.committed+snap.pending).slice(0,80), final: finalText.slice(0,80)});
    } else {
      const o=els.output.value, ps=Math.min(selStart,o.length), pe=Math.min(selEnd,o.length); els.output.value=o.substring(0,ps)+text+o.substring(pe); els.output.setSelectionRange(ps+text.length,ps+text.length);
    }
    els.output.focus(); saveCursor();
    editorHistory.push(els.output.value);
    if(!snap || snapId===rtVersion){ rtSnap=null; }
    if(els.liveFinal) els.liveFinal.textContent=''; if(els.liveInterim) els.liveInterim.textContent=''; els.output.dispatchEvent(new Event('input'));
    Storage.saveDraft(els.output.value);
    Quota.render(els.quotaGrid, { period: Dashboard.getPeriod() });
    Dashboard.renderOverall();
    const polInfo = polishModel ? ` + پالیش ${polishModel}` : (s.polishEnabled ? ' + پالیش محلی' : '');
    Logger.setStatus(`با ${engine}${polInfo} درج شد`,'info');
    Logger.dismissProgress(2600);
    const copied = await tryAutocopy(text);
    if (!Storage.getSettings().autocopy) Logger.toast('درج شد');
    else if (copied) Logger.toast('درج و کپی شد');
    Logger.log('info','success',{engine, polishModel, len:text.length});
  }catch(err){
    if (err.code === 'STALE') {
      Logger.dismissProgress(0);
    } else if (err.code === 'EMPTY') {
      // already handled
    } else if (err.aborted || err.code === 'ABORTED' || transcribingAbort?.signal.aborted) {
      Logger.log('info','transcribe aborted — preserving recorded blob',{msg:err.message, snapId, size: blob.size});
      await preservePendingVoice({
        blob,
        durationMs,
        reason: 'ارسال متوقف شد — صدا محفوظ است؛ هر زمان بخواهی می‌توانی دوباره تبدیل یا حذف کنی',
        statusCode: 0,
      });
      Logger.toast('ارسال متوقف شد — صدایت ذخیره ماند', 3200);
      Logger.dismissProgress(0);
      Logger.setStatus('ارسال متوقف شد — صدا در صف انتظار ذخیره ماند','warn');
    } else {
      Logger.log('error','transcribe failed',{msg:err.message, status:err.status});
      if(err.status === 429){
        setInspectorOpen(true);
        setQuotaExpanded(true);
        try{ Quota.render(els.quotaGrid, { period: Dashboard.getPeriod() }); }catch{}
        try{ Dashboard.renderOverall(); }catch{}
        try{ refreshQuotaStrip(); }catch{}
      }
      const h = errorHintFor(err);
      await preservePendingVoice({
        blob,
        durationMs,
        reason: h,
        statusCode: err.status || 0,
      });
      Logger.setStatus(`صدایت ذخیره شد — ${h}`,'error');
      Logger.toast(`صدایت ذخیره شد — ${h}`, 4500);
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

function micErrorHint(err) {
  const name = String(err?.name || '');
  const msg = String(err?.message || '');
  if (name === 'NotAllowedError' || name === 'PermissionDeniedError' || /denied|permission/i.test(msg)) {
    return 'دسترسی میکروفون رد شد — از آیکون کنار آدرس مرورگر دسترسی میکروفون را باز کن و صفحه را تازه کن';
  }
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
    return 'میکروفونی پیدا نشد — اتصال میکروفون یا هندزفری را بررسی کن';
  }
  if (name === 'NotReadableError' || name === 'TrackStartError') {
    return 'میکروفون در برنامه دیگری مشغول است — آن را ببند و دوباره تلاش کن';
  }
  if (name === 'NotSupportedError' || name === 'SecurityError') {
    return 'دسترسی میکروفون در این محیط فعال نیست — صفحه را در تب مستقل (HTTPS) باز کن';
  }
  return 'خطای میکروفون: ' + (msg || 'نامشخص');
}

function errorHintFor(err) {
  const st = Number(err?.status || 0);
  const msg = String(err?.message || '');
  if (st === 429) return 'سهمیه موقتاً پر شد — چند لحظه صبر کن یا مدل پشتیبان اضافه کن';
  if (st === 401 || st === 403) return 'کلید API نامعتبر یا منقضی است — در تب «کلیدها» بررسی کن';
  if (st === 404) return 'مدل انتخاب‌شده پیدا نشد — لیست مدل‌ها را در تنظیمات بروزرسانی کن';
  if (st === 408 || /timeout|زمان/i.test(msg)) return 'پاسخ سرور طول کشید — اتصال اینترنت را چک کن و دوباره بزن';
  if (st === 413 || /large|size|حجم/i.test(msg)) return 'حجم صدا از سقف سرویس بیشتر است — فایل یا ضبط کوتاه‌تری امتحان کن';
  if (st === 0 && /network|fetch|failed|اینترنت/i.test(msg)) return 'اتصال به اینترنت برقرار نشد — شبکه یا فیلترشکن را بررسی کن';
  return 'کلید API و اتصال اینترنت را بررسی کن';
}

async function tryAutocopy(text) {
  if (!Storage.getSettings().autocopy) return false;
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (e) {
    Logger.log('warn', 'autocopy failed', { msg: e?.message });
    Logger.toast('درج شد — کپی خودکار ناموفق بود، دستی کپی کن', 3200);
    return false;
  }
}

// Student & long-form audio file transcription (mp3/m4a/wav/ogg/webm)
const MAX_AUDIO_BYTES = 24 * 1024 * 1024;
async function transcribeAudioFile(file) {
  if (!file) return;
  if (isRecording || isTranscribing) {
    Logger.toast('صبر کن تا ضبط یا تبدیل فعلی تمام شود', 2000);
    return;
  }
  if (!hasAnyConfiguredKey()) {
    Logger.toast('برای تبدیل فایل صوتی ابتدا یک کلید رایگان وارد کن', 3200);
    openModal('keys');
    return;
  }
  if (file.size > MAX_AUDIO_BYTES) {
    Logger.toast('حجم فایل بیشتر از ۲۴ مگابایت است — فایل کوتاه‌تری انتخاب کن', 4000);
    Logger.setStatus('فایل صوتی بزرگ‌تر از حد مجاز است', 'warn');
    return;
  }
  saveCursor();
  setMicBusy(true);
  mainWaveTranscribing();
  transcribingAbort = new AbortController();
  Logger.setStatus(`در حال تبدیل فایل «${file.name.slice(0, 28)}»…`, 'warn');
  try {
    const signal = transcribingAbort.signal;
    Logger.groupRun('📎 تبدیل فایل صوتی');
    const { text, engine, polishModel } = await Transcription.transcribe(file, { durationMs: 0, signal });
    if (signal.aborted) throw Object.assign(new Error('لغو شد'), { code: 'ABORTED', aborted: true });
    if (!text) {
      Logger.setStatus('متنی از فایل استخراج نشد', 'warn');
      Logger.toast('متنی در فایل پیدا نشد');
      Logger.dismissProgress(800);
      return;
    }
    const o = els.output.value;
    const ps = Math.min(selStart, o.length), pe = Math.min(selEnd, o.length);
    const sep = ps > 0 && !/\s$/.test(o.slice(0, ps)) ? '\n' : '';
    const inserted = sep + text.trim();
    els.output.value = o.substring(0, ps) + inserted + o.substring(pe);
    const cur = ps + inserted.length;
    els.output.setSelectionRange(cur, cur);
    els.output.focus();
    saveCursor();
    editorHistory.push(els.output.value);
    els.output.dispatchEvent(new Event('input'));
    Storage.saveDraft(els.output.value);
    Quota.render(els.quotaGrid, { period: Dashboard.getPeriod() });
    Dashboard.renderOverall();
    const s = Storage.getSettings();
    const polInfo = polishModel ? ` + پالیش ${polishModel}` : (s.polishEnabled ? ' + پالیش محلی' : '');
    Logger.setStatus(`فایل با ${engine}${polInfo} تبدیل شد`, 'info');
    const copied = await tryAutocopy(text.trim());
    if (!s.autocopy) Logger.toast('متن فایل درج شد');
    else if (copied) Logger.toast('متن فایل درج و کپی شد');
    Logger.dismissProgress(2600);
    Logger.log('info', 'file transcribe success', { name: file.name, size: file.size, engine, polishModel, len: text.length });
  } catch (err) {
    if (err.aborted || err.code === 'ABORTED' || transcribingAbort?.signal.aborted) {
      Logger.log('info', 'file transcribe aborted — preserved', { name: file.name });
      await preservePendingVoice({
        blob: file,
        durationMs: 0,
        name: file.name,
        reason: 'ارسال فایل متوقف شد — آماده تلاش مجدد یا حذف',
        statusCode: 0,
      });
      Logger.toast('تبدیل فایل متوقف شد — در صف انتظار ذخیره ماند', 3000);
      Logger.dismissProgress(0);
      Logger.setStatus('تبدیل فایل متوقف شد — ذخیره ماند', 'warn');
    } else {
      Logger.log('error', 'file transcribe failed', { name: file.name, msg: err.message, status: err.status });
      if (err.status === 429) {
        setInspectorOpen(true);
        setQuotaExpanded(true);
        try { Quota.render(els.quotaGrid, { period: Dashboard.getPeriod() }); } catch {}
        try { Dashboard.renderOverall(); } catch {}
        try { refreshQuotaStrip(); } catch {}
      }
      const h = errorHintFor(err);
      await preservePendingVoice({
        blob: file,
        durationMs: 0,
        name: file.name,
        reason: h,
        statusCode: err.status || 0,
      });
      Logger.setStatus(`فایل ذخیره ماند — ${h}`, 'error');
      Logger.toast(`فایل ذخیره ماند — ${h}`, 4200);
      Logger.dismissProgress(3500);
    }
  } finally {
    setMicBusy(false);
    recTimerReset();
    syncActionbar();
    mainWaveIdle();
    transcribingAbort = null;
  }
}
els.btnUploadAudio?.addEventListener('click', () => {
  setToolsOpen(false);
  if (isRecording || isTranscribing) { Logger.toast('صبر کن تا ضبط یا تبدیل فعلی تمام شود', 1800); return; }
  if (!hasAnyConfiguredKey()) { Logger.toast('برای تبدیل فایل صوتی ابتدا یک کلید رایگان وارد کن', 3200); openModal('keys'); return; }
  els.audioFileInput?.click();
});
els.audioFileInput?.addEventListener('change', (e) => {
  const file = e.target?.files?.[0];
  e.target.value = '';
  if (file) transcribeAudioFile(file);
});

// --- Offline / Failed Voice Preservation Vault (IndexedDB-backed) ---
let pendingVoicesCache = [];
let activeVoiceAudio = null, activeVoiceId = null, activeVoiceUrl = null;
let retryingVoiceId = null;

function stopVoicePlayback() {
  if (activeVoiceAudio) {
    try { activeVoiceAudio.pause(); } catch {}
    activeVoiceAudio = null;
  }
  if (activeVoiceUrl) {
    try { URL.revokeObjectURL(activeVoiceUrl); } catch {}
    activeVoiceUrl = null;
  }
  activeVoiceId = null;
}

function formatVoiceDuration(ms) {
  const sec = Math.max(0, Math.round((Number(ms) || 0) / 1000));
  if (!sec) return '';
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${fa(String(m).padStart(2, '0'))}:${fa(String(s).padStart(2, '0'))}`;
}

function formatVoiceSize(bytes) {
  const n = Number(bytes) || 0;
  if (n >= 1024 * 1024) return `${fa((n / (1024 * 1024)).toFixed(1))} مگابایت`;
  return `${fa(Math.max(1, Math.round(n / 1024)))} کیلوبایت`;
}

function formatVoiceTime(ts) {
  try {
    return new Date(ts || Date.now()).toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

function extForMime(mime) {
  const m = String(mime || '').toLowerCase();
  if (m.includes('mp4') || m.includes('m4a')) return 'm4a';
  if (m.includes('mpeg') || m.includes('mp3')) return 'mp3';
  if (m.includes('wav')) return 'wav';
  if (m.includes('ogg')) return 'ogg';
  return 'webm';
}

async function preservePendingVoice({ blob, durationMs = 0, name = '', reason = '', statusCode = 0 }) {
  try {
    const saved = await VoiceQueue.save({ blob, durationMs, name, reason, statusCode });
    await refreshPendingVoices();
    return saved;
  } catch (e) {
    Logger.log('warn', 'VoiceQueue save failed', { msg: e?.message });
    return null;
  }
}

function toggleVoicePlayback(item) {
  if (!item?.blob) return;
  if (activeVoiceId === item.id) {
    stopVoicePlayback();
    renderPendingVoices();
    return;
  }
  stopVoicePlayback();
  try {
    const url = URL.createObjectURL(item.blob);
    const audio = new window.Audio(url);
    activeVoiceAudio = audio;
    activeVoiceUrl = url;
    activeVoiceId = item.id;
    audio.addEventListener('ended', () => {
      stopVoicePlayback();
      renderPendingVoices();
    });
    audio.addEventListener('error', () => {
      stopVoicePlayback();
      renderPendingVoices();
      Logger.toast('پخش این فایل صوتی ممکن نشد');
    });
    audio.play().catch(() => {
      stopVoicePlayback();
      renderPendingVoices();
      Logger.toast('پخش صدا با محدودیت مرورگر متوقف شد');
    });
    renderPendingVoices();
  } catch {
    stopVoicePlayback();
  }
}

function downloadPendingVoice(item) {
  if (!item?.blob) return;
  try {
    const url = URL.createObjectURL(item.blob);
    const a = document.createElement('a');
    const ext = extForMime(item.mimeType || item.blob.type);
    const stamp = new Date(item.createdAt || Date.now()).toISOString().replace(/[:T]/g, '-').slice(0, 16);
    a.href = url;
    a.download = item.name || `hamnegar-voice-${stamp}.${ext}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => { try { URL.revokeObjectURL(url); } catch {} }, 1500);
    Logger.toast('فایل صوتی ذخیره شد');
  } catch {
    Logger.toast('ذخیره فایل ناموفق بود');
  }
}

async function cancelPendingVoice(item) {
  if (!item) return;
  if (retryingVoiceId === item.id) cancelTranscription();
  if (activeVoiceId === item.id) stopVoicePlayback();
  await VoiceQueue.remove(item.id);
  await refreshPendingVoices();
  Logger.toast('صدای ذخیره‌شده لغو و حذف شد', 5000, {
    actionLabel: 'واگرد',
    onAction: async () => {
      await VoiceQueue.save(item);
      await refreshPendingVoices();
      Logger.toast('صدای ذخیره‌شده برگردانده شد', 1800);
    },
  });
}

async function retryPendingVoice(id) {
  const item = await VoiceQueue.get(id);
  if (!item?.blob) {
    await refreshPendingVoices();
    return false;
  }
  if (isRecording || isTranscribing) {
    Logger.toast('صبر کن تا ضبط یا تبدیل فعلی تمام شود', 2000);
    return false;
  }
  if (!hasAnyConfiguredKey()) {
    Logger.toast('ابتدا یک کلید رایگان وارد کن تا صدایت تبدیل شود', 3200);
    openModal('keys');
    return false;
  }
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    Logger.toast('هنوز به اینترنت وصل نیستی — صدایت امن ذخیره مانده است', 3200);
    return false;
  }
  if (activeVoiceId === id) stopVoicePlayback();
  saveCursor();
  retryingVoiceId = id;
  setMicBusy(true);
  mainWaveTranscribing();
  transcribingAbort = new AbortController();
  renderPendingVoices();
  Logger.setStatus('در حال تلاش مجدد برای تبدیل صدای ذخیره‌شده…', 'warn');
  try {
    const signal = transcribingAbort.signal;
    Logger.groupRun('🔄 تلاش مجدد صدا');
    const { text, engine, polishModel } = await Transcription.transcribe(item.blob, {
      durationMs: item.durationMs || 0,
      signal,
    });
    if (signal.aborted) throw Object.assign(new Error('لغو شد'), { code: 'ABORTED', aborted: true });
    if (!text) {
      await VoiceQueue.updateReason(id, 'متنی از این صدا استخراج نشد — می‌توانی پخش کنی یا حذفش کنی', 0);
      Logger.setStatus('متنی از صدا استخراج نشد', 'warn');
      Logger.toast('متنی از این صدا برنگشت', 3000);
      Logger.dismissProgress(800);
      return false;
    }
    const o = els.output.value;
    const ps = Math.min(selStart, o.length), pe = Math.min(selEnd, o.length);
    const sep = ps > 0 && !/\s$/.test(o.slice(0, ps)) ? '\n' : '';
    const inserted = sep + text.trim();
    els.output.value = o.substring(0, ps) + inserted + o.substring(pe);
    const cur = ps + inserted.length;
    els.output.setSelectionRange(cur, cur);
    els.output.focus();
    saveCursor();
    editorHistory.push(els.output.value);
    els.output.dispatchEvent(new Event('input'));
    Storage.saveDraft(els.output.value);
    Quota.render(els.quotaGrid, { period: Dashboard.getPeriod() });
    Dashboard.renderOverall();
    await VoiceQueue.remove(id);
    const s = Storage.getSettings();
    const polInfo = polishModel ? ` + پالیش ${polishModel}` : (s.polishEnabled ? ' + پالیش محلی' : '');
    Logger.setStatus(`صدای ذخیره‌شده با ${engine}${polInfo} درج شد`, 'info');
    const copied = await tryAutocopy(text.trim());
    if (!s.autocopy) Logger.toast('صدای ذخیره‌شده تبدیل و درج شد');
    else if (copied) Logger.toast('صدای ذخیره‌شده تبدیل و کپی شد');
    Logger.dismissProgress(2600);
    Logger.log('info', 'pending voice recovered', { id, engine, polishModel, len: text.length });
    return true;
  } catch (err) {
    if (err.aborted || err.code === 'ABORTED' || transcribingAbort?.signal.aborted) {
      await VoiceQueue.updateReason(id, 'تلاش مجدد متوقف شد — صدا همچنان محفوظ است', 0);
      Logger.toast('تلاش مجدد متوقف شد — صدا محفوظ ماند', 2600);
      Logger.dismissProgress(0);
      Logger.setStatus('تلاش مجدد متوقف شد — صدا محفوظ ماند', 'warn');
      return false;
    }
    Logger.log('error', 'pending voice retry failed', { id, msg: err.message, status: err.status });
    if (err.status === 429) {
      setInspectorOpen(true);
      setQuotaExpanded(true);
      try { Quota.render(els.quotaGrid, { period: Dashboard.getPeriod() }); } catch {}
      try { Dashboard.renderOverall(); } catch {}
      try { refreshQuotaStrip(); } catch {}
    }
    const h = errorHintFor(err);
    await VoiceQueue.updateReason(id, h, err.status || 0);
    Logger.setStatus(`خطا در تلاش مجدد — ${h}`, 'error');
    Logger.toast(`صدا محفوظ ماند — ${h}`, 4000);
    Logger.dismissProgress(3500);
    return false;
  } finally {
    retryingVoiceId = null;
    setMicBusy(false);
    recTimerReset();
    syncActionbar();
    mainWaveIdle();
    transcribingAbort = null;
    await refreshPendingVoices();
  }
}

async function retryAllPendingVoices() {
  const queue = [...pendingVoicesCache].reverse(); // chronological order
  for (const item of queue) {
    const ok = await retryPendingVoice(item.id);
    if (!ok) break;
  }
}

function renderPendingVoices() {
  const box = els.pendingVoices, list = els.pvList;
  if (!box || !list) return;
  const items = pendingVoicesCache;
  box.hidden = !items.length;
  if (!items.length) {
    list.textContent = '';
    return;
  }
  const online = typeof navigator === 'undefined' ? true : navigator.onLine !== false;
  box.classList.toggle('is-online', online);
  if (els.pvHeading) {
    els.pvHeading.textContent = items.length === 1
      ? '۱ صدای ذخیره‌شده در انتظار تبدیل'
      : `${fa(items.length)} صدای ذخیره‌شده در انتظار تبدیل`;
  }
  if (els.pvNetNote) {
    els.pvNetNote.textContent = online
      ? 'شبکه وصل است — آماده تلاش مجدد'
      : 'آفلاین — صداها تا بازگشت شبکه امن می‌مانند';
  }
  if (els.btnRetryAllVoices) {
    els.btnRetryAllVoices.hidden = items.length < 2;
    els.btnRetryAllVoices.disabled = isRecording || isTranscribing || !online;
  }
  list.textContent = '';
  for (const item of items) {
    const card = document.createElement('article');
    const isThisRetrying = retryingVoiceId === item.id;
    const isPlaying = activeVoiceId === item.id;
    card.className = 'voice-card' + (isThisRetrying ? ' is-retrying' : '') + (isPlaying ? ' is-playing' : '');

    const top = document.createElement('div');
    top.className = 'voice-card__top';
    const title = document.createElement('span');
    title.className = 'voice-card__title';
    const dur = formatVoiceDuration(item.durationMs);
    title.textContent = item.name
      ? `فایل: ${item.name}`
      : (dur ? `صدای ضبط‌شده · ${dur}` : 'صدای ضبط‌شده');
    const meta = document.createElement('span');
    meta.className = 'voice-card__meta';
    const clock = formatVoiceTime(item.createdAt);
    meta.textContent = [formatVoiceSize(item.size), clock].filter(Boolean).join(' · ');
    top.append(title, meta);

    const reason = document.createElement('p');
    reason.className = 'voice-card__reason';
    reason.textContent = item.reason || 'تبدیل ناموفق بود — صدای شما امن ذخیره شده است';

    const actions = document.createElement('div');
    actions.className = 'voice-card__actions';

    const setBtnLabel = (btn, iconHtml, txt) => {
      btn.innerHTML = iconHtml;
      const s = document.createElement('span');
      s.textContent = txt;
      btn.appendChild(s);
    };

    const retryBtn = document.createElement('button');
    retryBtn.type = 'button';
    retryBtn.className = (isThisRetrying ? 'btn-ghost' : 'btn-primary') + ' btn-xs vc-retry';
    setBtnLabel(retryBtn, isThisRetrying ? IC_STOP : IC_RETRY, isThisRetrying ? 'توقف تلاش' : 'تلاش مجدد');
    retryBtn.disabled = !isThisRetrying && (isRecording || isTranscribing);
    retryBtn.addEventListener('click', () => {
      if (isThisRetrying) cancelTranscription();
      else retryPendingVoice(item.id);
    });

    const playBtn = document.createElement('button');
    playBtn.type = 'button';
    playBtn.className = 'btn-ghost btn-xs vc-btn';
    setBtnLabel(playBtn, isPlaying ? IC_STOP : IC_PLAY, isPlaying ? 'توقف پخش' : 'پخش');
    playBtn.addEventListener('click', () => toggleVoicePlayback(item));

    const dlBtn = document.createElement('button');
    dlBtn.type = 'button';
    dlBtn.className = 'btn-ghost btn-xs vc-btn';
    setBtnLabel(dlBtn, IC_DL, 'دانلود');
    dlBtn.title = 'ذخیره فایل صوتی روی دستگاه';
    dlBtn.addEventListener('click', () => downloadPendingVoice(item));

    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'btn-ghost btn-xs vc-cancel';
    setBtnLabel(cancelBtn, IC_TRASH, 'لغو و حذف');
    cancelBtn.addEventListener('click', () => cancelPendingVoice(item));

    actions.append(retryBtn, playBtn, dlBtn, cancelBtn);
    card.append(top, reason, actions);
    list.appendChild(card);
  }
}

async function refreshPendingVoices() {
  try {
    pendingVoicesCache = await VoiceQueue.list();
  } catch {
    pendingVoicesCache = [];
  }
  renderPendingVoices();
}

els.btnRetryAllVoices?.addEventListener('click', retryAllPendingVoices);
window.addEventListener('online', async () => {
  await refreshPendingVoices();
  if (pendingVoicesCache.length > 0 && !isRecording && !isTranscribing) {
    Logger.setStatus('اتصال برقرار شد — صداهای ذخیره‌شده آماده تبدیل‌اند', 'info');
    Logger.toast(
      `اینترنت وصل شد — ${fa(pendingVoicesCache.length)} صدای ذخیره‌شده آماده است`,
      6000,
      { actionLabel: 'تبدیل کن', onAction: () => retryAllPendingVoices() },
    );
  }
});
window.addEventListener('offline', () => {
  renderPendingVoices();
  if (isRecording) {
    Logger.toast('اینترنت قطع شد — نگران نباش، پس از توقف صدایت امن ذخیره می‌شود', 3800);
  }
});

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
els.btnCopy.onclick=async()=>{
  if(!els.output.value.trim()){ els.btnCopy.classList.remove('shake'); void els.btnCopy.offsetWidth; els.btnCopy.classList.add('shake'); setTimeout(()=>els.btnCopy.classList.remove('shake'),400); Logger.toast('چیزی نیست'); return; }
  try{ await navigator.clipboard.writeText(els.output.value); }catch(e){ Logger.log('warn','clipboard.writeText failed',{msg:e?.message}); Logger.toast('کپی ناموفق — دستی کپی کن'); return; }
  els.btnCopy.classList.add('ok'); setTimeout(()=>els.btnCopy.classList.remove('ok'),1200);
  Logger.toast('کپی شد');
};
els.btnClear.onclick = () => {
  const hasText = !!els.output.value.trim();
  if (!hasText && !isRecording && !isTranscribing) {
    els.btnClear.classList.remove('shake');
    void els.btnClear.offsetWidth;
    els.btnClear.classList.add('shake');
    setTimeout(() => els.btnClear.classList.remove('shake'), 400);
    Logger.toast('متن خالی است');
    return;
  }
  setBehaviorOpen(false);
  setToolsOpen(false);
  if (isRecording || isTranscribing) {
    rtVersion++;
    cancelTranscription();
  }
  const prevText = els.output.value;
  els.output.value = '';
  Storage.clearDraft();
  selStart = selEnd = 0;
  rtSnap = null;
  if (els.liveFinal) els.liveFinal.textContent = '';
  if (els.liveInterim) els.liveInterim.textContent = '';
  if (els.livePreview) els.livePreview.classList.remove('on');
  updateCounts();
  editorHistory.push('');
  Logger.setStatus('آماده ضبط', 'info');
  if (prevText) {
    Logger.toast('متن پاک شد', 4500, {
      actionLabel: 'واگرد',
      onAction: () => {
        applyHistoryValue(prevText);
        Logger.toast('متن برگردانده شد', 1600);
      },
    });
  } else {
    Logger.toast('پاک شد');
  }
};
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
const DIFF_TOK_RE = /[\p{L}\p{M}\p{N}\u200C]+|[^\s\p{L}\p{M}\p{N}\u200C]/gu;
function faTokenizeWithGaps(s){
  const str = String(s ?? '');
  const tokens = [];
  const gaps = [];
  let lastIdx = 0;
  DIFF_TOK_RE.lastIndex = 0;
  let m;
  while ((m = DIFF_TOK_RE.exec(str)) !== null) {
    gaps.push(str.slice(lastIdx, m.index));
    tokens.push(m[0]);
    lastIdx = m.index + m[0].length;
  }
  return { tokens, gaps, tail: str.slice(lastIdx) };
}
function faTokenizeDiff(s){
  return faTokenizeWithGaps(s).tokens;
}
function faLineSig(gap){
  return (String(gap || '').match(/\r?\n/g) || []).length;
}
function diffFaTokens(a, b, gapsA, gapsB, tailA, tailB){
  const n = a.length, m = b.length;
  if (!n && !m) return { ops: [], changed: 0, breakChanges: 0, total: 0, empty: true, layoutOnly: false, fallback: false };
  if (n * m > 40000) return { ops: null, changed: n + m, breakChanges: 0, total: Math.max(n, m), empty: false, layoutOnly: false, fallback: true };
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
  let breakChanges = 0;
  for (const o of ops) {
    if (o.t !== 'eq') {
      changed++;
      const nlB = (gapsB && o.b !== undefined) ? faLineSig(gapsB[o.b]) : 0;
      const nlA = (gapsA && o.a !== undefined) ? faLineSig(gapsA[o.a]) : 0;
      if (o.t === 'ins' && nlB > 0) {
        o.nlDelta = nlB;
        breakChanges += nlB;
      } else if (o.t === 'del' && nlA > 0) {
        o.nlDelta = -nlA;
        breakChanges += nlA;
      } else if (o.t === 'chg' && nlA !== nlB) {
        o.nlDelta = nlB - nlA;
        breakChanges += Math.abs(nlB - nlA);
      }
    } else if (gapsA && gapsB) {
      const nlA = faLineSig(gapsA[o.a]);
      const nlB = faLineSig(gapsB[o.b]);
      if (nlA !== nlB) {
        o.nlDelta = nlB - nlA; // >0: newline added before token in b; <0: newline removed from a
        breakChanges++;
      }
    }
  }
  if (tailA !== undefined && tailB !== undefined && faLineSig(tailA) !== faLineSig(tailB)) {
    breakChanges++;
  }
  const total = Math.max(n, m);
  if (total > 0 && changed / total > 0.6) return { ops: null, changed, breakChanges, total, empty: false, layoutOnly: false, fallback: true };
  const layoutOnly = changed === 0 && breakChanges > 0;
  return { ops, changed, breakChanges, total, empty: changed === 0 && breakChanges === 0, layoutOnly, fallback: false };
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
  const normA = faTokenizeWithGaps(faNormalizeDiff(before));
  const normB = faTokenizeWithGaps(faNormalizeDiff(after));
  return diffFaTokens(normA.tokens, normB.tokens, normA.gaps, normB.gaps, normA.tail, normB.tail);
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
function diffRenderSide(el, parsed, ops, side){
  el.textContent = '';
  const frag = document.createDocumentFragment();
  const { tokens, gaps, tail } = parsed;
  let emitted = false;
  const appendGap = (gap, nlDelta) => {
    if (!gap) return;
    if (nlDelta && ((side === 'b' && nlDelta > 0) || (side === 'a' && nlDelta < 0))) {
      const nlIdx = gap.indexOf('\n');
      if (nlIdx >= 0) {
        if (nlIdx > 0) frag.appendChild(document.createTextNode(gap.slice(0, nlIdx)));
        const mark = document.createElement('span');
        mark.className = side === 'b' ? 'dd-nl' : 'dd-nl-del';
        mark.setAttribute('aria-hidden', 'true');
        mark.textContent = '↵';
        frag.appendChild(mark);
        frag.appendChild(document.createTextNode(gap.slice(nlIdx)));
        return;
      }
    }
    frag.appendChild(document.createTextNode(gap));
  };
  const push = (idx, cls, nlDelta) => {
    if (idx === undefined || tokens[idx] === undefined) return;
    appendGap(gaps[idx] || '', nlDelta);
    emitted = true;
    const s = document.createElement('span');
    s.className = cls;
    s.textContent = tokens[idx];
    frag.appendChild(s);
  };
  for (const o of ops){
    if (o.t === 'eq') push(side === 'a' ? o.a : o.b, 'dd-eq', o.nlDelta || 0);
    else if (o.t === 'del' && side === 'a') push(o.a, 'dd-del', o.nlDelta || 0);
    else if (o.t === 'ins' && side === 'b') push(o.b, 'dd-ins', o.nlDelta || 0);
    else if (o.t === 'chg' && side === 'a' && o.a !== undefined) push(o.a, 'dd-chg', o.nlDelta || 0);
    else if (o.t === 'chg' && side === 'b' && o.b !== undefined) push(o.b, 'dd-chg', o.nlDelta || 0);
  }
  if (tail) frag.appendChild(document.createTextNode(tail));
  if (emitted || tail) el.appendChild(frag);
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
    diffRenderSide(d.orig, faTokenizeWithGaps(before), r.ops, 'a');
    diffRenderSide(d.res, faTokenizeWithGaps(after), r.ops, 'b');
    d.note.hidden = true;
    const wordSegs = diffFaSegments(r.ops);
    const totalCount = wordSegs + (r.breakChanges || 0);
    d.count.textContent = r.layoutOnly
      ? `بازآرایی ساختار (${diffFaDigits(r.breakChanges)} خط)`
      : (r.breakChanges ? `${diffFaDigits(totalCount)} تغییر (واژه و خط‌بندی)` : `${diffFaDigits(wordSegs)} تغییر`);
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
  { id:'esc-tr', keysFa:'Esc', keys:'Escape', layer:2, action:'بستن پنل ترجمه یا گزینه‌های سریع', scope:'پاپ‌اور باز' },
  { id:'esc-diff', keysFa:'Esc', keys:'Escape', layer:3, action:'دور ریختن نتیجه', scope:'شیت بازبینی باز' },
  { id:'esc-modal', keysFa:'Esc', keys:'Escape', layer:4, action:'بستن تنظیمات (اول پنل افزودن، بعد مدال — بدون ذخیره)', scope:'تنظیمات باز' },
  { id:'esc-cancel', keysFa:'Esc', keys:'Escape', layer:5, action:'لغو ضبط/رونویسی', scope:'حین ضبط یا رونویسی — آخرین راه' },
];
function shortcutById(id){ return SHORTCUTS.find(s => s.id === id); }
const GUIDE = {
  tools: [
    { id:'g-mic', title:'ضبط، مکث و پایان', body:'دکمه میکروفون در مرکز نوار پایین ضبط را شروع و تمام می‌کند؛ حین ضبط می‌توانی با «مکث/ادامه» ضبط را موقت نگه داری و دوباره ادامه دهی یا با «لغو» آن را کنار بگذاری.', ref:'btn-mic' },
    { id:'g-mode', title:'حالت روزمره و کلاس', body:'در نوار بالا بین «روزمره» (توقف خودکار پس از سکوت) و «کلاس» (ضبط پیوسته برای سخنرانی و درس بدون قطع در مکث استاد) جابه‌جا شو.', ref:'mode-lecture' },
    { id:'g-tools', title:'منوی ابزارهای متن و صوت', body:'دکمه «ابزارها» در نوار پایین زیر شست قرار دارد و پالایش ساده/پیشرفته/دستوری، ساختاردهی متن، ترجمه سریع یا چندزبانه، برگشت به خام و تبدیل فایل صوتی را در یک پنجره جمع‌وجور باز می‌کند.', ref:'tools-toggle' },
    { id:'g-upload', title:'تبدیل فایل صوتی', body:'از داخل منوی «ابزارها» گزینه «تبدیل فایل صوتی» را بزن تا فایل ضبط‌شده کلاس یا مصاحبه (mp3، m4a، wav و…) مستقیم به متن تبدیل شود.', ref:'btn-upload-audio' },
    { id:'g-clear', title:'پاک کردن بوم با واگرد', body:'دکمه «پاک» در نوار پایین بوم متن را پاک می‌کند و تا چند ثانیه دکمه «واگرد» برای بازگرداندن متن نمایش داده می‌شود.', ref:'btn-clear' },
    { id:'g-vault', title:'نگهداری خودکار صدا در قطعی شبکه', body:'اگر اینترنت قطع شود یا تبدیل خطا بدهد، صدای ضبط‌شده امن در مرورگر می‌ماند و می‌توانی پس از وصل شدن شبکه «تلاش مجدد»، «پخش»، «دانلود» یا «لغو و حذف» بزنی.', ref:'pending-voices' },
    { id:'g-cancel', title:'لغو ضبط', body:'حین ضبط صدا را دور می‌ریزد؛ حین ارسالِ کند، ارسال را متوقف می‌کند و صدا را در صف انتظار نگه می‌دارد تا از بین نرود.', ref:'btn-cancel-stt' },
    { id:'g-undo', title:'واگرد و ازنو', body:'متن را قدم‌به‌قدم برمی‌گرداند؛ با دکمه‌های زیر کادر متن یا Ctrl+Z در حالت فوکوس.', ref:'btn-undo' },
    { id:'g-output', title:'بوم متن', body:'متن نهایی اینجاست؛ پیش‌نویس به‌صورت خودکار ذخیره می‌شود و حتی با بستن صفحه از بین نمی‌رود.', ref:'output' },
    { id:'g-simple', title:'پالایش ساده', body:'اصلاح املا، نیم‌فاصله و علائم نگارشی روی کل متن یا بخش انتخاب‌شده.', ref:'stage-simple' },
    { id:'g-advanced', title:'پالایش پیشرفته', body:'اصلاح هم‌زمان املا، نگارش و دستور زبان؛ کامل‌ترین ویرایش فارسی.', ref:'stage-advanced' },
    { id:'g-grammar', title:'پالایش دستوری', body:'فقط اصلاح ساختار دستوری بدون تغییر واژه‌ها و سبک.', ref:'stage-grammar' },
    { id:'g-structure', title:'ساختاردهی متن', body:'گفتار را بر اساس محتوا به پاراگراف‌های منظم و در صورت بیان موارد یا مراحل به لیست نقطه‌ای تمیز تبدیل می‌کند؛ با اولویت هوشمند روی قوی‌ترین مدل متنی فعال زنجیره.', ref:'stage-structure' },
    { id:'g-trquick', title:'ترجمه سریع EN⇄FA', body:'ترجمه فوری فارسی ⇄ انگلیسی بدون نیاز به انتخاب زبان.', ref:'stage-tr-quick' },
    { id:'g-trpanel', title:'سایر زبان‌ها', body:'پنل جست‌وجوی زبان را باز می‌کند؛ با Enter به زبان انتخاب‌شده ترجمه می‌شود.', ref:'stage-tr-panel' },
    { id:'g-raw', title:'برگشت به خام', body:'متن پیش از آخرین پالایش را برمی‌گرداند.', ref:'stage-raw' },
    { id:'g-diffapply', title:'اعمال نتیجه', body:'نتیجه بازبینی‌شده را روی متن می‌نشاند.', ref:'diff-apply' },
  ],
  config: [
    { id:'g-settings', title:'تنظیمات استودیو', body:'آیکون چرخ‌دنده در نوار بالا تنظیمات ۴بخشی را باز می‌کند: پیکربندی هوش مصنوعی (کلیدها و مدل‌ها)، رفتار، ابزارها و موج صدا.', ref:'btn-settings' },
    { id:'g-keys', title:'کلیدها و ارائه‌دهندگان', body:'کلیدهای Groq، Google AI Studio (Gemini)، OpenRouter و ارائه‌دهنده سفارشی را اینجا وارد کن. اگر سرور میزبان فعال باشد Google Gemini خودکار در دسترس است. هر ارائه‌دهنده را می‌توانی موقت خاموش کنی یا حذف کنی و بعداً برگردانی.', ref:'provider-drawer' },
    { id:'g-realtime', title:'حالت آنی', body:'نمایش زنده کلمات حین صحبت و سپس جایگزینی با متن دقیق و پالایش‌شده.', ref:'toggle-realtime' },
    { id:'g-vad', title:'توقف خودکار در سکوت (VAD)', body:'برای پیام‌های سریع روشن بگذار و برای ضبط کلاس و سخنرانی خاموش کن.', ref:'toggle-vad' },
    { id:'g-polish', title:'پالیش خودکار فارسی', body:'اصلاح خودکار نیم‌فاصله و نگارش پس از هر رونویسی.', ref:'toggle-polish' },
    { id:'g-autocopy', title:'کپی خودکار', body:'متن نهایی پس از تبدیل بلافاصله در کلیپ‌بورد کپی می‌شود.', ref:'toggle-autocopy' },
    { id:'g-stt', title:'زنجیره صوت به متن', body:'ترتیب اولویت مدل‌های STT؛ با کشیدن دستگیره ⠿ یا دکمه‌های ▲/▼ جایگاه را عوض کن.', ref:'stt-chain' },
    { id:'g-polishchain', title:'زنجیره پالیش', body:'ترتیب ویرایشگرهای متنی برای پالیش و ترجمه؛ با کشیدن دستگیره ⠿ یا دکمه‌های ▲/▼ مرتب کن.', ref:'polish-chain' },
    { id:'g-wavehide', title:'پنهان‌سازی نوار موج', body:'نوار موج را می‌بندد و حلقه رندر را متوقف می‌کند تا باتری کمتری مصرف شود.', ref:'wave-hide' },
  ],
  quota: [
    { id:'g-quota', title:'سهمیه و گزارش سیستم', body:'با دکمه نمودار در نوار بالا یا نوار خلاصه پایین صفحه، آمار مصرف امروز و گزارش سیستم را باز و بسته کن.', ref:'inspector-toggle' },
    { id:'g-quotadetail', title:'جزئیات مصرف مدل‌ها', body:'نمایش تعداد درخواست، کلمات و وضعیت نزدیک‌شدن به سقف روزانه هر مدل.', ref:'quota-detail' },
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
// Quick tools & behavior popovers (mutually exclusive thumb-zone droplets)
const toolsToggle = $('tools-toggle'), toolsPop = $('tools-pop'), toolsClose = $('tools-close');
const behaviorToggle = $('behavior-toggle'), behaviorPop = $('behavior-pop');

function setToolsOpen(open) {
  if (!toolsToggle || !toolsPop) return;
  if (open) {
    setBehaviorOpen(false);
    try { Stagebar?.updateStageScope?.(); } catch {}
  } else {
    const trp = $('tr-panel');
    if (trp) trp.hidden = true;
    $('stage-tr-panel')?.setAttribute('aria-pressed', 'false');
  }
  toolsPop.hidden = !open;
  toolsToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
  toolsToggle.classList.toggle('active', open);
}

function setBehaviorOpen(open) {
  if (!behaviorToggle || !behaviorPop) return;
  if (open) setToolsOpen(false);
  behaviorPop.hidden = !open;
  behaviorToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
  behaviorToggle.classList.toggle('active', open);
  if (open) syncQuickToggles();
}

if (toolsToggle && toolsPop) {
  toolsToggle.addEventListener('click', (e) => {
    e.stopPropagation();
    setToolsOpen(toolsPop.hidden);
  });
  toolsClose?.addEventListener('click', () => {
    setToolsOpen(false);
    toolsToggle.focus?.();
  });
  document.addEventListener('click', (e) => {
    if (!toolsPop.hidden && !e.target.closest('#tools-pop') && !e.target.closest('#tools-toggle')) {
      setToolsOpen(false);
    }
  });
  setToolsOpen(false);
}

if (behaviorToggle && behaviorPop) {
  behaviorToggle.addEventListener('click', (e) => {
    e.stopPropagation();
    setBehaviorOpen(behaviorPop.hidden);
  });
  const QUICK_MAP = {
    realtime: () => els.toggleRealtime,
    vad: () => els.toggleVad,
    polish: () => els.togglePolish,
    autocopy: () => els.toggleAutocopy,
  };
  behaviorPop.querySelectorAll('[data-quick-toggle]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const cb = QUICK_MAP[btn.dataset.quickToggle]?.();
      if (!cb) return;
      cb.checked = !cb.checked;
      cb.dispatchEvent(new Event('change', { bubbles: true }));
      syncQuickToggles();
      syncModeUI();
    });
  });
  $('btn-quick-settings')?.addEventListener('click', () => {
    setBehaviorOpen(false);
    openModal();
  });
  document.addEventListener('click', (e) => {
    if (!behaviorPop.hidden && !e.target.closest('#behavior-pop') && !e.target.closest('#behavior-toggle')) {
      setBehaviorOpen(false);
    }
  });
  setBehaviorOpen(false);
}

// Onboarding card & Everyday/Lecture preset mode controls
$('btn-onboard-keys')?.addEventListener('click', () => openModal('keys'));
$('btn-onboard-live')?.addEventListener('click', () => {
  if (!Realtime.isSupported()) {
    Logger.toast('مرورگر فعلی از حالت زنده پشتیبانی نمی‌کند — یک کلید رایگان وارد کن', 3500);
    openModal('keys');
    return;
  }
  if (els.toggleRealtime) els.toggleRealtime.checked = true;
  Storage.saveSettings({ realtime: true });
  onboardingDismissed = true;
  syncOnboarding();
  syncQuickToggles();
  els.btnMic?.focus?.();
  Logger.setStatus('حالت زنده روشن شد — دکمه ضبط را بزن', 'info');
  Logger.toast('حالت زنده روشن شد — دکمه ضبط را بزن', 2800);
});
$('btn-onboard-dismiss')?.addEventListener('click', () => {
  onboardingDismissed = true;
  syncOnboarding();
});
els.modeQuick?.addEventListener('click', () => applyPresetMode('quick'));
els.modeLecture?.addEventListener('click', () => applyPresetMode('lecture'));
els.presetQuick?.addEventListener('click', () => applyPresetMode('quick'));
els.presetLecture?.addEventListener('click', () => applyPresetMode('lecture'));

$('btn-manage-tools')?.addEventListener('click', () => {
  setToolsOpen(false);
  openModal('tools');
});

// stagebar run/wiring lives in js/modules/stagebar.js
Stagebar = mountStagebar({
  getSelStart: () => selStart, getSelEnd: () => selEnd,
  getPolishChain,
  getDiffPending: () => diffPending,
  saveCursor, updateCounts, editorHistory, syncActionbar, engineInfo,
  entryIdOf, providerIdOf, sanitizeMsg, diffEls, openDiffRunning, fillDiffSheet, closeDiffSheet,
  onActionTriggered: () => setToolsOpen(false),
  onManageTools: () => { setToolsOpen(false); openModal('tools'); },
});
mainWaveInit();
waveKillApply();
const verEl = document.getElementById('settings-version'); if (verEl) verEl.textContent = `v${VERSION}`;
Dashboard.ensureReportUI();
Logger.log('info',`هم‌نگار v${VERSION} (${BUILD}) آماده`, {hasRealtime: Realtime.isSupported(), proto: location.protocol, version: VERSION});
Quota.render(els.quotaGrid, { period: Dashboard.getPeriod() });
Dashboard.renderOverall();
syncOnboarding();
syncModeUI();
syncQuickToggles();
refreshPendingVoices();

async function initServerGeminiStatus() {
  let available = false;
  try {
    const res = await fetch('./api/gemini/status', { cache: 'no-store' });
    const ct = res.headers.get('content-type') || '';
    if (res.ok && ct.includes('application/json')) {
      const j = await res.json();
      available = Boolean(j?.configured);
    }
  } catch {
    available = false;
  }
  Storage.setServerGeminiAvailable(available);
  Settings.validate();
  updateBadge();
  try { Stagebar?.renderStageModelOptions?.(); } catch {}
  syncOnboarding();
  Quota.render(els.quotaGrid, { period: Dashboard.getPeriod() });
  Dashboard.renderOverall();
  if (hasAnyConfiguredKey()) {
    Logger.setStatus('آماده ضبط', 'info');
  }
}
initServerGeminiStatus();
