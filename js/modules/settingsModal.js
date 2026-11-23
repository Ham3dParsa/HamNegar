// Settings modal + wiring: 4-tab studio settings (keys | behavior | pipeline | wave),
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

function engineInfo() {
  const s = Storage.getSettings();
  const raw = s.sttChain?.find(e => typeof e !== 'object' || e.enabled !== false) || s.sttChain?.[0] || s.primary || 'groq';
  const firstId = typeof raw === 'object' ? raw.id : raw;
  const label = firstId === 'groq' ? 'Groq' : String(firstId).replace(/^gemini-/i, 'Gemini ');
  const pol = s.polishEnabled ? 'پالیش روشن' : 'پالیش خاموش';
  return { text: `${label} · ${pol}`, hasKey: hasKeyFor(raw) };
}

function updateBadge() {
  getStagebar()?.updateStageScope();
}

function validate() {
  const g = els.keyGroq?.value.trim() || '';
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
  if (hgm) {
    const serverReady = Storage.isServerGeminiAvailable();
    hgm.className = 'hint';
    hgm.textContent = serverReady
      ? 'مدل‌های Google Gemini به‌صورت خودکار از طریق سرور فعال هستند و نیازی به وارد کردن کلید در مرورگر نیست.'
      : 'سرویس Google Gemini روی سرور پیکربندی نشده است؛ برای فعال‌سازی، متغیر GEMINI_API_KEY را در تنظیمات سرور (Settings > Secrets) وارد کنید.';
  }
  if (hor) {
    const okOr = !or || or.startsWith('sk-or-');
    hor.className = 'hint' + (or && !okOr ? ' err' : '');
    hor.innerHTML = or && !okOr
      ? 'کلید OpenRouter معمولاً با <code>sk-or-v1-</code> شروع می‌شود.'
      : 'اختیاری برای مدل‌های پالیش بیشتر. در صورت خالی بودن، پالیش با Groq یا Google انجام می‌شود. <a href="https://openrouter.ai/keys" target="_blank" rel="noopener">openrouter.ai/keys</a>';
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

function renderProvidersStatus() {
  let providers = [];
  try { providers = Storage.getProviders(); } catch { return; }
  const liveValues = {
    groq: els.keyGroq?.value?.trim(),
    openrouter: els.keyOpenrouter?.value?.trim(),
  };
  for (const p of providers) {
    const pill = document.getElementById('pill-' + p.id) || (p.id === 'google' ? document.getElementById('pill-gemini') : null);
    if (pill) {
      if (p.id === 'google') {
        const ready = Storage.isServerGeminiAvailable();
        pill.className = 'provider-status ' + (ready ? 'ok' : 'missing');
        pill.textContent = ready ? 'متصل (سرور)' : 'تنظیم‌نشده روی سرور';
        continue;
      }
      const has = p.id in liveValues ? !!(liveValues[p.id] || p.hasKey) : !!p.hasKey;
      pill.className = 'provider-status ' + (has ? 'ok' : 'missing');
      pill.textContent = has ? 'متصل' : 'بدون کلید';
    }
  }
}

function hasAnyConfiguredKey() {
  try {
    return Storage.getProviders().some(p => p.hasKey);
  } catch {
    const s = Storage.getSettings();
    return !!(s.groqKey || s.geminiKey || s.openrouterKey);
  }
}

function loadSettings() {
  const s = Storage.getSettings();
  if (els.keyGroq) els.keyGroq.value = s.groqKey;
  if (els.keyOpenrouter) els.keyOpenrouter.value = s.openrouterKey;
  if (els.groqBaseUrl) els.groqBaseUrl.value = s.groqBaseURL || GROQ_BASE_DEFAULT;
  if (els.openrouterBaseUrl) els.openrouterBaseUrl.value = s.openrouterBaseURL || OPENROUTER_BASE_DEFAULT;
  setSttChain([...s.sttChain]);
  setPolishChain(s.polishChain.map(e => ({ ...e })));
  if (els.togglePolish) els.togglePolish.checked = s.polishEnabled;
  els.toggleRealtime.checked = s.realtime;
  els.toggleVad.checked = s.vad;
  els.toggleAutocopy.checked = s.autocopy;
  renderCustomProviders();
  flowInit();
  renderAllChains();
  updateBadge();
  validate();
  Dashboard.ensureReportUI();
  Quota.render(els.quotaGrid, { period: Dashboard.getPeriod() });
  Dashboard.renderOverall();
  if (!hasAnyConfiguredKey()) {
    Logger.setStatus('بدون کلید — برای شروع تنظیم کن', 'warn');
  } else {
    Logger.setStatus('آماده ضبط', 'info');
  }
  try { onSettingsSync(); } catch {}
}

function saveSettings() {
  try {
    Storage.saveSettings({
      groqKey: els.keyGroq?.value || '',
      openrouterKey: els.keyOpenrouter?.value || '',
      groqBaseURL: els.groqBaseUrl?.value || '',
      openrouterBaseURL: els.openrouterBaseUrl?.value || '',
      realtime: els.toggleRealtime.checked,
      vad: els.toggleVad.checked,
      autocopy: els.toggleAutocopy.checked,
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

// --- 4-tab settings navigation (keys | behavior | pipeline | wave) ---
const TAB_KEYS = ['keys', 'behavior', 'pipeline', 'wave'];
let activeTab = 'keys';

function switchTab(name) {
  const target = TAB_KEYS.includes(name) ? name : 'keys';
  activeTab = target;
  const tabs = {
    keys: els.tabKeys,
    behavior: els.tabBehavior,
    pipeline: els.tabPipeline,
    wave: els.tabWave,
  };
  const panels = {
    keys: els.panelKeys,
    behavior: els.panelBehavior,
    pipeline: els.panelPipeline,
    wave: els.panelWave,
  };
  for (const k of TAB_KEYS) {
    const on = k === target;
    tabs[k]?.classList.toggle('active', on);
    tabs[k]?.setAttribute('aria-selected', on ? 'true' : 'false');
    if (tabs[k]) tabs[k].tabIndex = on ? 0 : -1;
    if (panels[k]) panels[k].hidden = !on;
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
  const chosenTab = initialTab && TAB_KEYS.includes(initialTab)
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
  (f[0] || box)?.focus?.();
}

function closeModal() {
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
  if (lastModalFocus?.focus) lastModalFocus.focus();
  else els.btnSettings?.focus?.();
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

  if (els.keyGroq) els.keyGroq.addEventListener('input', validate);
  if (els.keyOpenrouter) els.keyOpenrouter.addEventListener('input', validate);
  if (els.groqBaseUrl) els.groqBaseUrl.addEventListener('input', validate);
  if (els.openrouterBaseUrl) els.openrouterBaseUrl.addEventListener('input', validate);
  if (els.togglePolish) {
    els.togglePolish.addEventListener('change', () => {
      persistChains();
      Logger.log('info', `پالیش ${els.togglePolish.checked ? 'روشن' : 'خاموش'}`);
      try { onSettingsSync(); } catch {}
    });
  }

  els.tabKeys?.addEventListener('click', () => switchTab('keys'));
  els.tabBehavior?.addEventListener('click', () => switchTab('behavior'));
  els.tabPipeline?.addEventListener('click', () => switchTab('pipeline'));
  els.tabWave?.addEventListener('click', () => switchTab('wave'));

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
    const tabMap = { keys: els.tabKeys, behavior: els.tabBehavior, pipeline: els.tabPipeline, wave: els.tabWave };
    tabMap[TAB_KEYS[next]]?.focus?.();
  });

  // Jump from "missing key" link inside model explorer directly to Keys tab
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
        chainPanelEls(openPanel).btn?.focus?.();
        return;
      }
      closeModal();
      return;
    }
    if (e.key !== 'Tab') return;
    const f = modalFocusables();
    if (!f.length) return;
    const first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
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

  return { engineInfo, updateBadge, validate, renderProvidersStatus, loadSettings, saveSettings, switchTab, openModal, closeModal, modalFocusables, hasAnyConfiguredKey };
}
