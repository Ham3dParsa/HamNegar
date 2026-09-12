// Settings modal + wiring: key validation, provider pills, load/save,
// pipeline|wave tabs, focus trap + Esc/Tab handling, save/close/reset buttons,
// realtime/vad/autocopy toggles.
// Extracted verbatim from js/app.js (ticket 31-settings-extract) — logic, order,
// strings, aria and focus-return unchanged. Only wrappers added: module
// imports/exports plus dependency injection (see mountSettingsModal).
// Seam: Logger/UI vitrine region (settings only).
import { Storage, GROQ_BASE_DEFAULT, OPENROUTER_BASE_DEFAULT } from './storage.js';
import { Logger } from './logger.js';
import { Dashboard } from './dashboard.js';
import { Quota } from './quota.js';

const $ = s => document.getElementById(s);

// --- injected app.js collaborators (assigned once in mountSettingsModal) ---
// els is the shared element map built in app.js. getStagebar is a live getter
// (() => Stagebar) — a snapshot would stay null because mountStagebar() runs at
// file end, after loadSettings(). hasKeyFor/providerIdOf + chain state and
// chain-panel helpers come from js/modules/chains.js via app.js (live function
// refs, never snapshots). STT/POLISH_DEFAULTS are immutable storage constants
// passed through so the reset handlers stay verbatim. wave* collaborators stay
// in app.js (wave tab seam); isWaveMicActive is a live getter over the
// app.js-owned waveMicStream/waveMicCtx lets (a boolean snapshot would go stale).
let els = null;
let getStagebar = () => null;
let hasKeyFor = () => false;
let providerIdOf = () => 'groq';
let getSttChain = () => [];
let setSttChain = () => {};
let getPolishChain = () => [];
let setPolishChain = () => {};
let renderAllChains = () => {};
let renderFlowListSoon = () => {};
let renderCustomProviders = () => {};
let flowInit = () => {};
let persistChains = () => {};
let chainPanelOpen = () => false;
let setChainPanel = () => {};
let chainPanelEls = () => ({});
let STT_DEFAULTS = [];
let POLISH_DEFAULTS = [];
let waveEnsure = () => {};
let wavePrevStart = () => {};
let wavePrevStop = () => {};
let waveStarterPause = () => {};
let waveFollowStop = () => {};
let waveMicStop = () => {};
let waveSync = () => {};
let mainWaveSync = () => {};
let isWaveMicActive = () => false;

// --- settings wiring ---
// Header removed (ticket header-polish-drawer): engine readout lives in the
// #stage-scope pill. engineInfo() is the single chain-head reader; updateBadge()
// just refreshes the pill via the mounted stagebar module (js/modules/stagebar.js).
function engineInfo(){
  const s=Storage.getSettings();
  const raw = s.sttChain?.[0] || s.primary || 'groq';
  const firstId = typeof raw==='object' ? raw.id : raw;
  const label = firstId==='groq' ? 'Groq' : firstId;
  const pol = s.polishEnabled ? ' • پالیش روشن' : ' • پالیش خاموش';
  return { text: `موتور: ${label}${pol}`, hasKey: hasKeyFor(raw) };
}
function updateBadge(){
  getStagebar()?.updateStageScope(); // no-op until mountStagebar() runs at file end (sync eval: converged then)
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
  els.keyGroq.value=s.groqKey; els.keyGemini.value=s.geminiKey;   if(els.keyOpenrouter) els.keyOpenrouter.value=s.openrouterKey;
  if(els.groqBaseUrl) els.groqBaseUrl.value=s.groqBaseURL || GROQ_BASE_DEFAULT;
  if(els.openrouterBaseUrl) els.openrouterBaseUrl.value=s.openrouterBaseURL || OPENROUTER_BASE_DEFAULT;
  setSttChain([...s.sttChain]);
  setPolishChain(s.polishChain.map(e=>({ ...e })));
  if(els.togglePolish) els.togglePolish.checked=s.polishEnabled;
  els.toggleRealtime.checked=s.realtime; els.toggleVad.checked=s.vad; els.toggleAutocopy.checked=s.autocopy;
  renderCustomProviders();
  flowInit();
  renderAllChains();
  updateBadge(); validate(); Dashboard.ensureReportUI(); Quota.render(els.quotaGrid, { period: Dashboard.getPeriod() }); Dashboard.renderOverall();
  if(!s.groqKey&&!s.geminiKey&&!s.openrouterKey){ Logger.setStatus('کلید تنظیم نشده — ⚙️ نوار پایین را بزن','warn'); } else Logger.setStatus('آماده به کار','info');
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
      sttChain: getSttChain(),
      polishChain: getPolishChain(),
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
  if(name === 'wave'){ waveEnsure(); wavePrevStart(); } else { wavePrevStop(); waveStarterPause(); waveFollowStop(); const hadMic = isWaveMicActive(); waveMicStop(); if (hadMic) { waveSync(); } }
}

// --- settings modal: focus trap + Esc closes without saving + focus returns to settings button ---
let lastModalFocus = null; // hoisted above loadSettings(): openModal() assigns it on manual open
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
  waveStarterPause();
  waveFollowStop();
  const hadMic = isWaveMicActive();
  waveMicStop();
  if (hadMic) { waveSync(); }
  if(lastModalFocus?.focus) lastModalFocus.focus();
  else els.btnSettings.focus();
}

// Thin wiring entry: assigns injected collaborators, then registers listeners in
// the original relative order (settings wiring, then tabs, then modal block).
// Returns the handles app.js still needs (mountChains + mountStagebar +
// startRecording/safeSaveSettings call sites); everything else stays private.
export function mountSettingsModal(deps){
  els = deps.els;
  getStagebar = deps.getStagebar || getStagebar;
  hasKeyFor = deps.hasKeyFor || hasKeyFor;
  providerIdOf = deps.providerIdOf || providerIdOf;
  getSttChain = deps.getSttChain || getSttChain;
  setSttChain = deps.setSttChain || setSttChain;
  getPolishChain = deps.getPolishChain || getPolishChain;
  setPolishChain = deps.setPolishChain || setPolishChain;
  renderAllChains = deps.renderAllChains || renderAllChains;
  renderFlowListSoon = deps.renderFlowListSoon || renderFlowListSoon;
  renderCustomProviders = deps.renderCustomProviders || renderCustomProviders;
  flowInit = deps.flowInit || flowInit;
  persistChains = deps.persistChains || persistChains;
  chainPanelOpen = deps.chainPanelOpen || chainPanelOpen;
  setChainPanel = deps.setChainPanel || setChainPanel;
  chainPanelEls = deps.chainPanelEls || chainPanelEls;
  if(deps.STT_DEFAULTS) STT_DEFAULTS = deps.STT_DEFAULTS;
  if(deps.POLISH_DEFAULTS) POLISH_DEFAULTS = deps.POLISH_DEFAULTS;
  waveEnsure = deps.waveEnsure || waveEnsure;
  wavePrevStart = deps.wavePrevStart || wavePrevStart;
  wavePrevStop = deps.wavePrevStop || wavePrevStop;
  waveStarterPause = deps.waveStarterPause || waveStarterPause;
  waveFollowStop = deps.waveFollowStop || waveFollowStop;
  waveMicStop = deps.waveMicStop || waveMicStop;
  waveSync = deps.waveSync || waveSync;
  mainWaveSync = deps.mainWaveSync || mainWaveSync;
  isWaveMicActive = deps.isWaveMicActive || isWaveMicActive;

  els.keyGroq.addEventListener('input',validate); els.keyGemini.addEventListener('input',validate);
  if(els.keyOpenrouter) els.keyOpenrouter.addEventListener('input',validate);
  if(els.groqBaseUrl) els.groqBaseUrl.addEventListener('input',validate);
  if(els.openrouterBaseUrl) els.openrouterBaseUrl.addEventListener('input',validate);
  if(els.togglePolish) els.togglePolish.addEventListener('change', ()=>{ persistChains(); Logger.log('info', `پالیش ${els.togglePolish.checked?'روشن':'خاموش'}`); });

  els.tabPipeline?.addEventListener('click', ()=> switchTab('pipeline'));
  els.tabWave?.addEventListener('click', ()=> switchTab('wave'));

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
  $('btn-reset-stt')?.addEventListener('click', ()=>{ setSttChain(STT_DEFAULTS.map(id=>({id, providerId:providerIdOf(id,'google'), enabled:true}))); renderAllChains(); persistChains(); Logger.toast('STT بازنشانی شد'); });
  $('btn-reset-polish')?.addEventListener('click', ()=>{ setPolishChain(POLISH_DEFAULTS.map(e=>({...e}))); renderAllChains(); persistChains(); Logger.toast('پالیش بازنشانی شد'); });
  els.modal.addEventListener('click',e=>{ if(e.target===els.modal) closeModal(); });
  els.toggleRealtime.addEventListener('change',()=>{ Storage.saveSettings({realtime: els.toggleRealtime.checked}); Logger.log('info',`حالت آنی ${els.toggleRealtime.checked?'روشن':'خاموش'}`); });
  els.toggleVad.addEventListener('change',()=> Storage.saveSettings({vad: els.toggleVad.checked}));
  els.toggleAutocopy.addEventListener('change',()=> Storage.saveSettings({autocopy: els.toggleAutocopy.checked}));

  return { engineInfo, updateBadge, validate, renderProvidersStatus, loadSettings, saveSettings, switchTab, openModal, closeModal, modalFocusables };
}
