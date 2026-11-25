// Settings modal + wiring: 4-tab studio settings (ai [keys | pipeline] | behavior | tools | wave),
// key validation, provider status badges (fixes #pill-google/#pill-gemini mismatch),
// load/save, focus trap + Esc/Tab handling, smooth open/close transitions.
import { Storage, GROQ_BASE_DEFAULT, OPENROUTER_BASE_DEFAULT } from './storage.js';
import { Logger } from './logger.js';
import { Dashboard } from './dashboard.js';
import { Quota } from './quota.js';
import { $ } from './dom.js';

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
let onSettingsSync = () => {};
let onPipelineOpen = () => {};
let onToolsOpen = () => {};
let syncCustomProviderSelects = () => {};

let geminiPersonalOpen = false;
const BUILTIN_LABELS = { groq: 'Groq', google: 'Google Gemini', openrouter: 'OpenRouter' };
const providerTestState = { groq: 'untested', google: 'untested', openrouter: 'untested' };

export function setProviderTestState(pid, state) {
  const key = pid === 'gemini' ? 'google' : pid;
  if (!Object.prototype.hasOwnProperty.call(providerTestState, key)) return;
  providerTestState[key] = (state === 'ok' || state === 'error') ? state : 'untested';
  try { renderProvidersStatus(); } catch {}
}

function engineInfo() {
  const s = Storage.getSettings();
  const active = s.sttChain?.find(e => (typeof e !== 'object' || e.enabled !== false) && hasKeyFor(e))
    || s.sttChain?.find(e => typeof e !== 'object' || e.enabled !== false)
    || s.sttChain?.[0];
  const pol = s.polishEnabled ? 'پالیش روشن' : 'پالیش خاموش';
  if (!active) return { text: `بدون مدل صوتی · ${pol}`, hasKey: false };
  const firstId = typeof active === 'object' ? active.id : active;
  const label = firstId === 'groq' ? 'Groq' : String(firstId).replace(/^gemini-/i, 'Gemini ');
  return { text: `${label} · ${pol}`, hasKey: hasKeyFor(active) };
}

function updateBadge() {
  getStagebar()?.updateStageScope();
}

function syncGeminiCardLayout() {
  const serverReady = Storage.isServerGeminiAvailable();
  const gm = els.keyGemini?.value?.trim() || Storage.getSettings().geminiKey || '';
  const showInput = !serverReady || geminiPersonalOpen || !!gm;
  const srvBar = $('gemini-server-bar');
  const keyBlock = $('gemini-key-block');
  const srvModelsRow = $('gemini-models-row');
  const rec = $('gemini-rec');
  const persBtn = $('btn-gemini-personal');
  if (srvBar) srvBar.hidden = !serverReady;
  if (keyBlock) keyBlock.hidden = !showInput;
  if (srvModelsRow) srvModelsRow.hidden = showInput;
  if (rec) rec.textContent = serverReady ? 'متصل از طریق سرور (یا کلید شخصی)' : 'کلید Google AI Studio';
  if (persBtn) persBtn.textContent = showInput ? 'مخفی کردن کلید شخصی' : 'افزودن کلید شخصی';
}

function validate() {
  const g = els.keyGroq?.value.trim() || '';
  const gm = els.keyGemini?.value.trim() || '';
  const or = els.keyOpenrouter?.value.trim() || '';
  const hg = $('hint-groq');
  const hgm = $('hint-gemini');
  const hor = $('hint-openrouter');

  if (hg) {
    hg.className = 'hint' + (g && !g.startsWith('gsk_') ? ' err' : '');
    hg.innerHTML = g && !g.startsWith('gsk_')
      ? 'کلید Groq باید با <code>gsk_</code> شروع شود.'
      : 'رایگان و بسیار سریع برای فارسی؛ با <code>gsk_</code> شروع می‌شود. <a href="https://console.groq.com/keys" target="_blank" rel="noopener">دریافت کلید از console.groq.com</a>';
  }
  syncGeminiCardLayout();
  if (hgm) {
    const serverReady = Storage.isServerGeminiAvailable();
    const looksGm = !gm || gm.startsWith('AIza') || gm.startsWith('AQ.');
    hgm.className = 'hint' + (gm && !looksGm ? ' err' : '');
    if (gm && !looksGm) {
      hgm.innerHTML = 'کلید Google AI Studio معمولاً با <code>AIza</code> یا <code>AQ.</code> شروع می‌شود.';
    } else if (serverReady) {
      hgm.textContent = gm
        ? 'کلید شخصی شما ثبت شده و به‌جای کلید سرور استفاده می‌شود.'
        : 'سرویس Google Gemini از طریق سرور فعال است. در صورت نیاز می‌توانی کلید شخصی خودت را هم وارد کنی.';
    } else {
      hgm.innerHTML = 'برای اجرا در مرورگر (مانند GitHub Pages)، کلید رایگان Google AI Studio را وارد کن. <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener">aistudio.google.com/apikey</a>';
    }
  }
  if (hor) {
    const okOr = !or || or.startsWith('sk-or-');
    hor.className = 'hint' + (or && !okOr ? ' err' : '');
    hor.innerHTML = or && !okOr
      ? 'کلید OpenRouter معمولاً با <code>sk-or-v1-</code> شروع می‌شود.'
      : 'اختیاری برای مدل‌های پالیش بیشتر. <a href="https://openrouter.ai/keys" target="_blank" rel="noopener">openrouter.ai/keys</a>';
  }

  if (els.groqBaseUrl) {
    const v = els.groqBaseUrl.value.trim();
    if (v) {
      try {
        const u = new URL(v);
        if (u.protocol !== 'https:') throw 0;
        els.groqBaseUrl.style.borderColor = '';
      } catch {
        els.groqBaseUrl.style.borderColor = 'var(--danger)';
      }
    } else els.groqBaseUrl.style.borderColor = '';
  }
  if (els.openrouterBaseUrl) {
    const v = els.openrouterBaseUrl.value.trim();
    if (v) {
      try {
        const u = new URL(v);
        if (u.protocol !== 'https:') throw 0;
        els.openrouterBaseUrl.style.borderColor = '';
      } catch {
        els.openrouterBaseUrl.style.borderColor = 'var(--danger)';
      }
    } else els.openrouterBaseUrl.style.borderColor = '';
  }

  renderProvidersStatus();
  renderAllChains();
  try { renderFlowListSoon(); } catch {}
}

function renderRestoreProvidersBar() {
  const bar = $('restore-providers-bar');
  if (!bar) return;
  let removed = [];
  try { removed = Storage.getRemovedBuiltIns(); } catch { removed = []; }
  bar.textContent = '';
  if (!removed.length) {
    bar.hidden = true;
    return;
  }
  bar.hidden = false;
  const label = document.createElement('span');
  label.className = 'hint-inline';
  label.textContent = 'ارائه‌دهندگان حذف‌شده:';
  bar.appendChild(label);
  for (const pid of removed) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn-ghost btn-xs';
    btn.textContent = `＋ بازگردانی ${BUILTIN_LABELS[pid] || pid}`;
    btn.addEventListener('click', () => {
      Storage.restoreProvider(pid);
      renderProvidersStatus();
      renderAllChains();
      try { renderFlowListSoon(); } catch {}
      updateBadge();
      try { onSettingsSync(); } catch {}
      Logger.toast(`${BUILTIN_LABELS[pid] || pid} بازگردانده شد`);
    });
    bar.appendChild(btn);
  }
}

function renderProvidersStatus() {
  const cardIds = { groq: 'provider-card-groq', google: 'provider-card-gemini', openrouter: 'provider-card-openrouter' };
  const s = Storage.getSettings();
  const liveValues = {
    groq: els.keyGroq?.value?.trim(),
    google: els.keyGemini?.value?.trim(),
    openrouter: els.keyOpenrouter?.value?.trim(),
  };
  for (const pid of ['groq', 'google', 'openrouter']) {
    const removed = Storage.isProviderRemoved(pid);
    const disabled = Storage.isProviderDisabled(pid);
    const card = $(cardIds[pid]);
    if (card) {
      card.hidden = removed;
      card.classList.toggle('is-disabled', disabled);
      const sw = card.querySelector(`[data-provider-toggle="${pid}"]`);
      if (sw) {
        sw.checked = !disabled;
        sw.setAttribute('aria-checked', String(!disabled));
      }
    }
    const pill = document.getElementById('pill-' + pid) || (pid === 'google' ? document.getElementById('pill-gemini') : null);
    if (!pill) continue;
    if (disabled) {
      pill.className = 'provider-status disabled';
      pill.textContent = 'خاموش';
      continue;
    }
    if (pid === 'google') {
      const hasPersonal = !!(liveValues.google || s.geminiKey);
      const serverReady = Storage.isServerGeminiAvailable();
      if (hasPersonal) {
        const st = providerTestState.google;
        if (st === 'ok') {
          pill.className = 'provider-status ok';
          pill.textContent = 'متصل (تأییدشده)';
        } else if (st === 'error') {
          pill.className = 'provider-status err';
          pill.textContent = 'کلید نامعتبر یا خطا';
        } else {
          pill.className = 'provider-status untested';
          pill.textContent = 'ثبت‌شده (تست‌نشده)';
        }
      } else if (serverReady) {
        pill.className = 'provider-status ok';
        pill.textContent = 'متصل (سرور)';
      } else {
        pill.className = 'provider-status missing';
        pill.textContent = 'بدون کلید';
      }
      continue;
    }
    const has = !!(liveValues[pid] || (pid === 'groq' ? s.groqKey : s.openrouterKey));
    if (!has) {
      pill.className = 'provider-status missing';
      pill.textContent = 'بدون کلید';
    } else if (providerTestState[pid] === 'ok') {
      pill.className = 'provider-status ok';
      pill.textContent = 'متصل (تأییدشده)';
    } else if (providerTestState[pid] === 'error') {
      pill.className = 'provider-status err';
      pill.textContent = 'کلید نامعتبر یا خطا';
    } else {
      pill.className = 'provider-status untested';
      pill.textContent = 'ثبت‌شده (تست‌نشده)';
    }
  }
  renderRestoreProvidersBar();
  try { syncCustomProviderSelects(); } catch {}
}

function hasAnyConfiguredKey() {
  try {
    return Storage.getProviders().some(p => !p.disabled && p.hasKey);
  } catch {
    const s = Storage.getSettings();
    return !!(s.groqKey || s.geminiKey || s.openrouterKey);
  }
}

function hasReadySttConfig() {
  try {
    const s = Storage.getSettings();
    const chain = Array.isArray(s.sttChain) ? s.sttChain : [];
    return chain.some((entry) => {
      const enabled = typeof entry === 'object' ? entry.enabled !== false : true;
      if (!enabled) return false;
      return hasKeyFor(entry);
    });
  } catch {
    return hasAnyConfiguredKey();
  }
}

function persistKeysQuietly() {
  try {
    const patch = {};
    if (els.keyGroq) patch.groqKey = els.keyGroq.value || '';
    if (els.keyGemini) patch.geminiKey = els.keyGemini.value || '';
    if (els.keyOpenrouter) patch.openrouterKey = els.keyOpenrouter.value || '';
    if (Object.keys(patch).length) {
      Storage.saveSettings(patch);
      updateBadge();
      renderProvidersStatus();
      renderAllChains();
      try { renderFlowListSoon(); } catch {}
      try { onSettingsSync(); } catch {}
    }
  } catch {}
}

function loadSettings() {
  const s = Storage.getSettings();
  if (els.keyGroq) els.keyGroq.value = s.groqKey;
  if (els.keyGemini) els.keyGemini.value = s.geminiKey || '';
  if (els.keyOpenrouter) els.keyOpenrouter.value = s.openrouterKey;
  if (els.groqBaseUrl) els.groqBaseUrl.value = s.groqBaseURL || GROQ_BASE_DEFAULT;
  if (els.openrouterBaseUrl) els.openrouterBaseUrl.value = s.openrouterBaseURL || OPENROUTER_BASE_DEFAULT;
  setSttChain([...s.sttChain]);
  setPolishChain(s.polishChain.map(e => ({ ...e })));
  if (els.togglePolish) els.togglePolish.checked = s.polishEnabled;
  els.toggleRealtime.checked = s.realtime;
  els.toggleVad.checked = s.vad;
  els.toggleAutocopy.checked = s.autocopy;
  syncTonePrefUI(s.tonePref);
  renderCustomProviders();
  flowInit();
  renderAllChains();
  updateBadge();
  validate();
  Dashboard.ensureReportUI();
  Quota.render(els.quotaGrid, { period: Dashboard.getPeriod() });
  Dashboard.renderOverall();
  if (!hasAnyConfiguredKey()) {
    Logger.setStatus('بدون کلید فعال — برای شروع تنظیم کن', 'warn');
  } else {
    Logger.setStatus('آماده ضبط', 'info');
  }
  try { onSettingsSync(); } catch {}
}

function getSelectedTonePref() {
  const active = document.querySelector('#tone-pref-group [data-tone].active');
  return active?.dataset?.tone === 'formal' ? 'formal' : 'preserve';
}

function syncTonePrefUI(val) {
  const tone = val === 'formal' ? 'formal' : 'preserve';
  document.querySelectorAll('#tone-pref-group [data-tone]').forEach((btn) => {
    const on = btn.dataset.tone === tone;
    btn.classList.toggle('active', on);
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
  });
}

function saveSettings() {
  try {
    Storage.saveSettings({
      groqKey: els.keyGroq?.value || '',
      geminiKey: els.keyGemini?.value || '',
      openrouterKey: els.keyOpenrouter?.value || '',
      groqBaseURL: els.groqBaseUrl?.value || '',
      openrouterBaseURL: els.openrouterBaseUrl?.value || '',
      realtime: els.toggleRealtime.checked,
      vad: els.toggleVad.checked,
      autocopy: els.toggleAutocopy.checked,
      tonePref: getSelectedTonePref(),
      sttChain: getSttChain(),
      polishChain: getPolishChain(),
      polishEnabled: els.togglePolish?.checked ?? true,
    });
  } catch (e) {
    Logger.log('error', 'saveSettings failed', { msg: e.message, field: e.field });
    Logger.toast(e.message || 'آدرس BaseURL نامعتبر است');
    if (e.field === 'groqBaseURL') els.groqBaseUrl.style.borderColor = 'var(--danger)';
    else if (e.field === 'openrouterBaseURL') els.openrouterBaseUrl.style.borderColor = 'var(--danger)';
    else {
      if (els.groqBaseUrl) els.groqBaseUrl.style.borderColor = '';
      if (els.openrouterBaseUrl) els.openrouterBaseUrl.style.borderColor = '';
    }
    throw e;
  }
  updateBadge();
  validate();
  Quota.render(els.quotaGrid, { period: Dashboard.getPeriod() });
  Dashboard.renderOverall();
  try { onSettingsSync(); } catch {}
}

// --- 4-tab settings navigation (ai [keys | pipeline] | behavior | tools | wave) ---
const TAB_KEYS = ['ai', 'behavior', 'tools', 'wave'];
const AI_SUBTABS = ['keys', 'pipeline'];
let activeTab = 'ai';
let activeAiSubtab = 'keys';

function switchAiSubtab(sub) {
  const target = AI_SUBTABS.includes(sub) ? sub : 'keys';
  activeAiSubtab = target;
  const subTabs = {
    keys: els.tabKeys,
    pipeline: els.tabPipeline,
  };
  const subPanels = {
    keys: els.panelKeys,
    pipeline: els.panelPipeline,
  };
  for (const k of AI_SUBTABS) {
    const on = k === target;
    subTabs[k]?.classList.toggle('active', on);
    subTabs[k]?.setAttribute('aria-selected', on ? 'true' : 'false');
    if (subTabs[k]) subTabs[k].tabIndex = on ? 0 : -1;
    if (subPanels[k]) subPanels[k].hidden = !on;
  }
  if (target === 'pipeline') {
    try { syncCustomProviderSelects(); } catch {}
    try { onPipelineOpen(); } catch {}
  }
}

function switchTab(name) {
  let target = name;
  if (name === 'keys' || name === 'pipeline') {
    activeAiSubtab = name;
    target = 'ai';
  } else if (!TAB_KEYS.includes(target)) {
    target = 'ai';
  }
  activeTab = target;
  const tabs = {
    ai: els.tabAi,
    behavior: els.tabBehavior,
    tools: els.tabTools,
    wave: els.tabWave,
  };
  const panels = {
    ai: els.panelAi,
    behavior: els.panelBehavior,
    tools: els.panelTools,
    wave: els.panelWave,
  };
  for (const k of TAB_KEYS) {
    const on = k === target;
    tabs[k]?.classList.toggle('active', on);
    tabs[k]?.setAttribute('aria-selected', on ? 'true' : 'false');
    if (tabs[k]) tabs[k].tabIndex = on ? 0 : -1;
    if (panels[k]) panels[k].hidden = !on;
  }
  if (target === 'ai') {
    switchAiSubtab(activeAiSubtab);
  }
  if (target === 'tools') {
    try { onToolsOpen(); } catch {}
  }
  if (target === 'wave') {
    waveEnsure();
    wavePrevStart();
  } else {
    wavePrevStop();
    waveStarterPause();
    waveFollowStop();
    const hadMic = isWaveMicActive();
    waveMicStop();
    if (hadMic) waveSync();
  }
}

let lastModalFocus = null;
function modalFocusables() {
  const box = els.modal.querySelector('.modal-box');
  if (!box) return [];
  return [...box.querySelectorAll('button, [href], input, select, textarea, summary, [tabindex]:not([tabindex="-1"])')]
    .filter(el => !el.disabled && el.getClientRects().length > 0);
}

function isModalOpen() {
  return els.modal?.classList.contains('is-open') || els.modal?.style.display === 'flex';
}

function openModal(initialTab) {
  lastModalFocus = document.activeElement;
  const known = [...TAB_KEYS, ...AI_SUBTABS];
  const chosenTab = initialTab && known.includes(initialTab)
    ? initialTab
    : (!hasAnyConfiguredKey() ? 'keys' : activeTab);
  switchTab(chosenTab);
  els.modal.style.display = 'flex';
  els.modal.setAttribute('aria-hidden', 'false');
  requestAnimationFrame(() => els.modal.classList.add('is-open'));
  if (chosenTab === 'wave') {
    waveEnsure();
    wavePrevStart();
  }
  const box = els.modal.querySelector('.modal-box');
  if (box && !box.hasAttribute('tabindex')) box.setAttribute('tabindex', '-1');
  const f = modalFocusables();
  (f[0] || box)?.focus?.({ preventScroll: true });
}

function closeModal() {
  persistKeysQuietly();
  els.modal.classList.remove('is-open');
  els.modal.setAttribute('aria-hidden', 'true');
  els.modal.style.display = 'none';
  mainWaveSync();
  wavePrevStop();
  waveStarterPause();
  waveFollowStop();
  const hadMic = isWaveMicActive();
  waveMicStop();
  if (hadMic) waveSync();
  if (lastModalFocus?.focus) lastModalFocus.focus({ preventScroll: true });
  else els.btnSettings?.focus?.({ preventScroll: true });
}

export function mountSettingsModal(deps) {
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
  if (deps.STT_DEFAULTS) STT_DEFAULTS = deps.STT_DEFAULTS;
  if (deps.POLISH_DEFAULTS) POLISH_DEFAULTS = deps.POLISH_DEFAULTS;
  waveEnsure = deps.waveEnsure || waveEnsure;
  wavePrevStart = deps.wavePrevStart || wavePrevStart;
  wavePrevStop = deps.wavePrevStop || wavePrevStop;
  waveStarterPause = deps.waveStarterPause || waveStarterPause;
  waveFollowStop = deps.waveFollowStop || waveFollowStop;
  waveMicStop = deps.waveMicStop || waveMicStop;
  waveSync = deps.waveSync || waveSync;
  mainWaveSync = deps.mainWaveSync || mainWaveSync;
  isWaveMicActive = deps.isWaveMicActive || isWaveMicActive;
  onSettingsSync = deps.onSettingsSync || onSettingsSync;
  onPipelineOpen = deps.onPipelineOpen || onPipelineOpen;
  onToolsOpen = deps.onToolsOpen || onToolsOpen;
  syncCustomProviderSelects = deps.syncCustomProviderSelects || syncCustomProviderSelects;

  const onKeyPersist = () => {
    persistKeysQuietly();
    validate();
  };
  if (els.keyGroq) { els.keyGroq.addEventListener('input', () => { providerTestState.groq = 'untested'; validate(); }); els.keyGroq.addEventListener('change', onKeyPersist); els.keyGroq.addEventListener('blur', onKeyPersist); }
  if (els.keyGemini) { els.keyGemini.addEventListener('input', () => { providerTestState.google = 'untested'; validate(); }); els.keyGemini.addEventListener('change', onKeyPersist); els.keyGemini.addEventListener('blur', onKeyPersist); }
  if (els.keyOpenrouter) { els.keyOpenrouter.addEventListener('input', () => { providerTestState.openrouter = 'untested'; validate(); }); els.keyOpenrouter.addEventListener('change', onKeyPersist); els.keyOpenrouter.addEventListener('blur', onKeyPersist); }
  if (els.groqBaseUrl) els.groqBaseUrl.addEventListener('input', validate);
  if (els.openrouterBaseUrl) els.openrouterBaseUrl.addEventListener('input', validate);

  $('btn-gemini-personal')?.addEventListener('click', () => {
    geminiPersonalOpen = !geminiPersonalOpen;
    syncGeminiCardLayout();
    if (geminiPersonalOpen) els.keyGemini?.focus?.({ preventScroll: true });
  });
  $('btn-gemini-models-srv')?.addEventListener('click', () => els.btnGeminiModels?.click?.());

  // Built-in provider On/Off switches + Remove actions inside <summary>
  els.providerDrawer?.querySelectorAll('.prov-switch').forEach((lbl) => {
    lbl.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const cb = lbl.querySelector('[data-provider-toggle]');
      if (!cb) return;
      const pid = cb.dataset.providerToggle;
      const nextDisabled = cb.checked; // currently checked (active) -> toggle off
      Storage.setProviderDisabled(pid, nextDisabled);
      renderProvidersStatus();
      renderAllChains();
      try { renderFlowListSoon(); } catch {}
      updateBadge();
      try { onSettingsSync(); } catch {}
      Logger.toast(`${BUILTIN_LABELS[pid] || pid} ${nextDisabled ? 'خاموش' : 'روشن'} شد`);
    });
  });

  els.providerDrawer?.querySelectorAll('[data-provider-remove]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const pid = btn.dataset.providerRemove;
      const prevStt = getSttChain().map(x => (typeof x === 'object' ? { ...x } : x));
      const prevPolish = getPolishChain().map(x => (typeof x === 'object' ? { ...x } : x));
      Storage.removeProvider(pid);
      const cur = Storage.getSettings();
      setSttChain([...cur.sttChain]);
      setPolishChain(cur.polishChain.map(x => ({ ...x })));
      renderProvidersStatus();
      renderAllChains();
      try { renderFlowListSoon(); } catch {}
      updateBadge();
      try { onSettingsSync(); } catch {}
      Logger.toast(`«${BUILTIN_LABELS[pid] || pid}» حذف شد`, 8000, {
        actionLabel: 'واگرد',
        onAction: () => {
          Storage.restoreProvider(pid);
          Storage.saveSettings({ sttChain: prevStt, polishChain: prevPolish });
          const next = Storage.getSettings();
          setSttChain([...next.sttChain]);
          setPolishChain(next.polishChain.map(x => ({ ...x })));
          renderProvidersStatus();
          renderAllChains();
          try { renderFlowListSoon(); } catch {}
          updateBadge();
          try { onSettingsSync(); } catch {}
          Logger.toast(`${BUILTIN_LABELS[pid] || pid} برگردانده شد`);
        },
      });
    });
  });

  if (els.togglePolish) {
    els.togglePolish.addEventListener('change', () => {
      persistChains();
      try { renderAllChains(); } catch {}
      Logger.log('info', `پالیش ${els.togglePolish.checked ? 'روشن' : 'خاموش'}`);
      try { onSettingsSync(); } catch {}
    });
  }

  els.tabAi?.addEventListener('click', () => switchTab('ai'));
  els.tabKeys?.addEventListener('click', () => switchTab('keys'));
  els.tabBehavior?.addEventListener('click', () => switchTab('behavior'));
  els.tabTools?.addEventListener('click', () => switchTab('tools'));
  els.tabPipeline?.addEventListener('click', () => switchTab('pipeline'));
  els.tabWave?.addEventListener('click', () => switchTab('wave'));

  document.querySelectorAll('#tone-pref-group [data-tone]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const tone = btn.dataset.tone === 'formal' ? 'formal' : 'preserve';
      syncTonePrefUI(tone);
      Storage.saveSettings({ tonePref: tone });
      try { onSettingsSync(); } catch {}
      Logger.toast(tone === 'formal' ? 'ترجیح لحن: رسمی و کتابی' : 'ترجیح لحن: حفظ لحن خودمانی گفتار');
    });
  });

  // Keyboard arrow navigation across settings tabs (RTL aware)
  els.modal.querySelector('.settings-tabs')?.addEventListener('keydown', (e) => {
    if (e.target?.getAttribute?.('role') !== 'tab') return;
    const i = TAB_KEYS.indexOf(activeTab);
    if (i < 0) return;
    let next = null;
    if (e.key === 'ArrowLeft') next = (i + 1) % TAB_KEYS.length;
    else if (e.key === 'ArrowRight') next = (i - 1 + TAB_KEYS.length) % TAB_KEYS.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = TAB_KEYS.length - 1;
    if (next === null) return;
    e.preventDefault();
    switchTab(TAB_KEYS[next]);
    const tabMap = { ai: els.tabAi, behavior: els.tabBehavior, tools: els.tabTools, wave: els.tabWave };
    tabMap[TAB_KEYS[next]]?.focus?.({ preventScroll: true });
  });

  els.modal.querySelector('.ai-subtabs')?.addEventListener('keydown', (e) => {
    if (e.target?.getAttribute?.('role') !== 'tab') return;
    const i = AI_SUBTABS.indexOf(activeAiSubtab);
    if (i < 0) return;
    let next = null;
    if (e.key === 'ArrowLeft') next = (i + 1) % AI_SUBTABS.length;
    else if (e.key === 'ArrowRight') next = (i - 1 + AI_SUBTABS.length) % AI_SUBTABS.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = AI_SUBTABS.length - 1;
    if (next === null) return;
    e.preventDefault();
    switchTab(AI_SUBTABS[next]);
    const subMap = { keys: els.tabKeys, pipeline: els.tabPipeline };
    subMap[AI_SUBTABS[next]]?.focus?.({ preventScroll: true });
  });

  // Jump from "missing key" link inside model explorer directly to Keys section
  $('m-nokey-link')?.addEventListener('click', () => switchTab('keys'));

  els.modal.addEventListener('keydown', (e) => {
    if (!isModalOpen()) return;
    if (e.defaultPrevented) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      const openPanel = ['stt', 'polish'].find(t => chainPanelOpen(t));
      if (openPanel) {
        setChainPanel(openPanel, false);
        chainPanelEls(openPanel).btn?.focus?.({ preventScroll: true });
        return;
      }
      closeModal();
      return;
    }
    if (e.key !== 'Tab') return;
    const f = modalFocusables();
    if (!f.length) return;
    const first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus({ preventScroll: true }); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus({ preventScroll: true }); }
  });

  els.btnSettings.onclick = () => openModal();
  $('btn-close-modal').onclick = () => closeModal();
  $('btn-save-modal').onclick = () => {
    try { saveSettings(); } catch (e) { Logger.log('error', 'saveSettings modal failed', { msg: e.message }); return; }
    closeModal();
    Logger.setStatus('تنظیمات ذخیره شد', 'info');
    Logger.toast('تنظیمات ذخیره شد');
  };
  $('btn-reset-stt')?.addEventListener('click', () => {
    setSttChain(STT_DEFAULTS.map(id => ({ id, providerId: providerIdOf(id, 'google'), enabled: true })));
    renderAllChains();
    persistChains();
    Logger.toast('زنجیره صوت به متن بازنشانی شد');
  });
  $('btn-reset-polish')?.addEventListener('click', () => {
    setPolishChain(POLISH_DEFAULTS.map(e => ({ ...e })));
    renderAllChains();
    persistChains();
    Logger.toast('زنجیره پالیش بازنشانی شد');
  });
  els.modal.addEventListener('click', (e) => { if (e.target === els.modal) closeModal(); });
  els.toggleRealtime.addEventListener('change', () => {
    Storage.saveSettings({ realtime: els.toggleRealtime.checked });
    Logger.log('info', `حالت آنی ${els.toggleRealtime.checked ? 'روشن' : 'خاموش'}`);
    try { onSettingsSync(); } catch {}
  });
  els.toggleVad.addEventListener('change', () => {
    Storage.saveSettings({ vad: els.toggleVad.checked });
    try { onSettingsSync(); } catch {}
  });
  els.toggleAutocopy.addEventListener('change', () => {
    Storage.saveSettings({ autocopy: els.toggleAutocopy.checked });
    try { onSettingsSync(); } catch {}
  });

  return { engineInfo, updateBadge, validate, renderProvidersStatus, setProviderTestState, loadSettings, saveSettings, switchTab, openModal, closeModal, modalFocusables, hasAnyConfiguredKey, hasReadySttConfig };
}
