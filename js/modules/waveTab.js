// Module: waveTab (v4 — ground-up rebuild)
// Clean, direct, 100% responsive Wave Studio: 8 ready presets, 5 distinct styles,
// color modes + palettes + pickers, 5 immediate unlocked sliders, mirror & hide toggles,
// live preview switcher (recording/paused/transcribing), mic test & simulator.
import { Storage, defaultWaveConfig, WAVE_TYPES } from './storage.js';
import {
  createWaveRenderer,
  WAVE_PRESETS,
  presetById,
  randomWaveConfig,
  WAVE_STYLES_FA,
  WAVE_COLOR_MODES_FA,
  WAVE_PALETTES,
} from './wave.js';
import { Logger } from './logger.js';
import { Audio } from './audio.js';
import { $ } from './dom.js';

let els = null;
let getMainWave = () => null;
let syncRecStrip = () => {};

let waveCfg = Storage.getWave();
let waveRenderer = null;
let waveInit = false;
let waveFakeOn = true;
let wavePreviewState = 'recording'; // 'recording' | 'paused' | 'transcribing'
let waveHidden = !Storage.getWaveIdle();
let waveMicStream = null;
let waveMicCtx = null;
let waveMicAnalyser = null;
let waveMicPending = false;

let persistTimer = null;
let persistPending = false;

const DENSITY_LABELS = {
  sine: 'ضخامت و تراکم موج',
  zigzag: 'تراکم گوشه‌های زیگزاگ',
  bars: 'تعداد میله‌های صوتی',
  dots: 'تراکم نقطه‌های پالس',
  'pixel-2bit': 'ظرافت پیکسل ۲بیتی',
};

function pushToRenderers() {
  try { waveRenderer?.setConfig(waveCfg); } catch {}
  try { getMainWave()?.setConfig(waveCfg); } catch {}
}

function flushPersist() {
  if (persistTimer) { clearTimeout(persistTimer); persistTimer = null; }
  if (!persistPending) return;
  persistPending = false;
  waveCfg = Storage.saveWave(waveCfg);
  pushToRenderers();
}

function commitWave(immediate = false) {
  pushToRenderers();
  syncUI();
  persistPending = true;
  if (immediate) {
    flushPersist();
  } else {
    if (persistTimer) clearTimeout(persistTimer);
    persistTimer = setTimeout(flushPersist, 140);
  }
}

function buildPresets() {
  const grid = $('wave-presets-grid');
  if (!grid) return;
  grid.innerHTML = '';
  for (const p of WAVE_PRESETS) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'wave-preset-btn';
    btn.dataset.presetId = p.id;
    btn.setAttribute('aria-pressed', 'false');

    const cv = document.createElement('canvas');
    cv.className = 'wave-preset-thumb';
    cv.width = 220;
    cv.height = 54;
    cv.setAttribute('aria-hidden', 'true');

    const foot = document.createElement('div');
    foot.className = 'wave-preset-foot';
    const title = document.createElement('b');
    title.textContent = p.n;
    const tag = document.createElement('span');
    tag.className = 'wave-preset-tag';
    tag.textContent = p.tag;
    foot.append(title, tag);

    btn.append(cv, foot);
    btn.addEventListener('click', () => {
      waveCfg = {
        ...defaultWaveConfig(),
        ...p.cfg,
        version: 4,
        presetId: p.id,
      };
      wavePreviewState = 'recording';
      try { waveRenderer?.setState('recording'); } catch {}
      commitWave(true);
    });
    grid.appendChild(btn);

    // Draw a crisp static snapshot of this preset immediately
    try {
      const r = createWaveRenderer(cv);
      r.setFakeEnabled(true);
      r.setState('recording');
      r.setConfig({ version: 4, presetId: p.id, ...p.cfg });
      r.renderFrame(1850);
    } catch {}
  }
}

function buildStyleButtons() {
  const box = $('wave-style-seg');
  if (!box) return;
  box.innerHTML = '';
  for (const st of WAVE_TYPES) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'wave-seg-btn';
    btn.dataset.waveStyle = st;
    btn.textContent = WAVE_STYLES_FA[st] || st;
    btn.addEventListener('click', () => {
      waveCfg.style = st;
      waveCfg.presetId = 'custom';
      commitWave(true);
    });
    box.appendChild(btn);
  }
}

function buildColorModeButtons() {
  const box = $('wave-colormode-seg');
  if (!box) return;
  box.innerHTML = '';
  for (const mode of ['solid', 'gradient', 'rainbow']) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'wave-seg-btn';
    btn.dataset.colorMode = mode;
    btn.textContent = WAVE_COLOR_MODES_FA[mode] || mode;
    btn.addEventListener('click', () => {
      waveCfg.colorMode = mode;
      waveCfg.presetId = 'custom';
      commitWave(true);
    });
    box.appendChild(btn);
  }
}

function buildPaletteChips() {
  const box = $('wave-palette-chips');
  if (!box) return;
  box.innerHTML = '';
  for (const pal of WAVE_PALETTES) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'wave-pal-chip';
    btn.dataset.paletteId = pal.id;
    const dot = document.createElement('span');
    dot.className = 'wave-pal-dot';
    dot.style.background = pal.mode === 'rainbow'
      ? 'conic-gradient(#ff595e,#ffca3a,#8ac926,#1982c4,#6a4c93,#ff595e)'
      : `linear-gradient(135deg, ${pal.c1}, ${pal.c2})`;
    const label = document.createElement('span');
    label.textContent = pal.n;
    btn.append(dot, label);
    btn.addEventListener('click', () => {
      waveCfg.colorMode = pal.mode;
      waveCfg.c1 = pal.c1;
      waveCfg.c2 = pal.c2;
      waveCfg.presetId = 'custom';
      commitWave(true);
    });
    box.appendChild(btn);
  }
}

function syncSlider(id, val, unit = '٪') {
  const inp = $(id);
  if (inp) {
    inp.value = String(val);
    const mn = Number(inp.min || 0);
    const mx = Number(inp.max || 100);
    const pct = ((val - mn) / Math.max(1e-9, mx - mn)) * 100;
    inp.style.setProperty('--p', `${pct.toFixed(1)}%`);
  }
  const out = $(id + '-val');
  if (out) out.textContent = `${val}${unit}`;
}

function syncUI() {
  const preset = presetById(waveCfg.presetId);
  const nameEl = $('wave-name');
  if (nameEl) nameEl.textContent = preset ? preset.n : (WAVE_STYLES_FA[waveCfg.style] || 'سفارشی');
  const styleBadge = $('wave-style-badge');
  if (styleBadge) styleBadge.textContent = WAVE_STYLES_FA[waveCfg.style] || waveCfg.style;

  document.querySelectorAll('#wave-presets-grid .wave-preset-btn').forEach((btn) => {
    const on = btn.dataset.presetId === waveCfg.presetId;
    btn.classList.toggle('active', on);
    btn.setAttribute('aria-pressed', String(on));
  });

  document.querySelectorAll('#wave-style-seg .wave-seg-btn').forEach((btn) => {
    const on = btn.dataset.waveStyle === waveCfg.style;
    btn.classList.toggle('active', on);
    btn.setAttribute('aria-pressed', String(on));
  });

  document.querySelectorAll('#wave-colormode-seg .wave-seg-btn').forEach((btn) => {
    const on = btn.dataset.colorMode === waveCfg.colorMode;
    btn.classList.toggle('active', on);
    btn.setAttribute('aria-pressed', String(on));
  });

  document.querySelectorAll('#wave-palette-chips .wave-pal-chip').forEach((btn) => {
    const pal = WAVE_PALETTES.find((p) => p.id === btn.dataset.paletteId);
    const on = !!pal && waveCfg.colorMode === pal.mode && (
      pal.mode === 'rainbow'
      || (String(waveCfg.c1).toLowerCase() === pal.c1 && String(waveCfg.c2).toLowerCase() === pal.c2)
    );
    btn.classList.toggle('active', on);
    btn.setAttribute('aria-pressed', String(on));
  });

  const c1 = $('wave-c1');
  const c2 = $('wave-c2');
  const pickersWrap = $('wave-color-pickers');
  const c2Wrap = $('wave-c2-wrap');
  if (c1) c1.value = waveCfg.c1;
  if (c2) c2.value = waveCfg.c2;
  if (pickersWrap) pickersWrap.hidden = waveCfg.colorMode === 'rainbow';
  if (c2Wrap) c2Wrap.hidden = waveCfg.colorMode !== 'gradient';

  syncSlider('wave-glow', waveCfg.glow);
  syncSlider('wave-sens', waveCfg.sensitivity);
  syncSlider('wave-spd', waveCfg.speed);
  syncSlider('wave-sm', waveCfg.smooth);
  syncSlider('wave-density', waveCfg.density);

  const densLbl = $('wave-density-lbl');
  if (densLbl) densLbl.textContent = DENSITY_LABELS[waveCfg.style] || 'ضخامت و تراکم';

  const mir = $('wave-mirror');
  if (mir) mir.checked = !!waveCfg.mirror;
  const hb = $('wave-hide');
  if (hb) hb.checked = waveHidden;

  const ft = $('wave-fake-toggle');
  if (ft) {
    ft.textContent = waveFakeOn ? 'شبیه‌ساز: روشن' : 'شبیه‌ساز: خاموش';
    ft.classList.toggle('active', waveFakeOn);
    ft.setAttribute('aria-pressed', String(waveFakeOn));
  }
  const mt = $('wave-mic-test');
  if (mt) {
    mt.textContent = waveMicStream ? 'توقف میکروفون' : 'تست با صدای من';
    mt.classList.toggle('active', !!waveMicStream);
  }
  document.querySelectorAll('#wave-state-seg button[data-wave-state]').forEach((b) => {
    const on = b.dataset.waveState === wavePreviewState;
    b.classList.toggle('active', on);
    b.setAttribute('aria-pressed', String(on));
  });
}

function bindSliders() {
  const map = [
    ['wave-glow', 'glow'],
    ['wave-sens', 'sensitivity'],
    ['wave-spd', 'speed'],
    ['wave-sm', 'smooth'],
    ['wave-density', 'density'],
  ];
  for (const [id, key] of map) {
    const inp = $(id);
    if (!inp) continue;
    inp.addEventListener('input', () => {
      waveCfg[key] = Math.max(0, Math.min(100, Math.round(Number(inp.value) || 0)));
      waveCfg.presetId = 'custom';
      commitWave(false);
    });
    inp.addEventListener('change', () => flushPersist());
  }
}

function waveEnsure() {
  waveCfg = Storage.getWave();
  if (waveInit) {
    pushToRenderers();
    waveFollowStart();
    syncUI();
    return;
  }
  waveInit = true;

  buildPresets();
  buildStyleButtons();
  buildColorModeButtons();
  buildPaletteChips();
  bindSliders();

  const cv = $('wave-preview');
  waveRenderer = createWaveRenderer(cv);
  waveRenderer.setConfig(waveCfg);
  waveRenderer.setFakeEnabled(waveFakeOn);
  waveRenderer.setState(wavePreviewState);

  document.querySelectorAll('#wave-state-seg button[data-wave-state]').forEach((btn) => {
    btn.addEventListener('click', () => {
      wavePreviewState = btn.dataset.waveState || 'recording';
      try { waveRenderer?.setState(wavePreviewState); } catch {}
      syncUI();
    });
  });

  $('wave-c1')?.addEventListener('input', (e) => {
    waveCfg.c1 = e.target.value;
    waveCfg.presetId = 'custom';
    commitWave(false);
  });
  $('wave-c1')?.addEventListener('change', () => flushPersist());

  $('wave-c2')?.addEventListener('input', (e) => {
    waveCfg.c2 = e.target.value;
    waveCfg.presetId = 'custom';
    commitWave(false);
  });
  $('wave-c2')?.addEventListener('change', () => flushPersist());

  $('wave-mirror')?.addEventListener('change', (e) => {
    waveCfg.mirror = !!e.target.checked;
    waveCfg.presetId = 'custom';
    commitWave(true);
  });

  $('wave-hide')?.addEventListener('change', (e) => {
    waveHidden = !!e.target.checked;
    try { Storage.saveWaveIdle(!waveHidden); } catch {}
    waveKillApply();
    syncUI();
  });

  $('wave-dice')?.addEventListener('click', () => {
    waveCfg = randomWaveConfig();
    wavePreviewState = 'recording';
    try { waveRenderer?.setState('recording'); } catch {}
    commitWave(true);
  });

  $('wave-reset')?.addEventListener('click', () => {
    waveCfg = defaultWaveConfig();
    wavePreviewState = 'recording';
    try { waveRenderer?.setState('recording'); } catch {}
    commitWave(true);
    Logger.toast('تنظیمات موج صدا به پیش‌فرض برگشت');
  });

  $('wave-fake-toggle')?.addEventListener('click', () => {
    waveFakeOn = !waveFakeOn;
    try { waveRenderer?.setFakeEnabled(waveFakeOn); } catch {}
    syncUI();
  });

  $('wave-mic-test')?.addEventListener('click', async () => {
    if (waveMicPending) return;
    if (waveMicStream) { waveMicStop(); syncUI(); return; }
    waveMicPending = true;
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('no-gum');
      waveMicStream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      waveMicCtx = waveMicCtx || new (window.AudioContext || window.webkitAudioContext)();
      if (waveMicCtx.state === 'suspended') await waveMicCtx.resume();
      const src = waveMicCtx.createMediaStreamSource(waveMicStream);
      waveMicAnalyser = waveMicCtx.createAnalyser();
      waveMicAnalyser.fftSize = 512;
      src.connect(waveMicAnalyser);
      wavePreviewState = 'recording';
      waveRenderer?.setState('recording');
      waveRenderer?.setAnalyser(waveMicAnalyser);
      Logger.log('info', 'پیش‌نمایش موج: میکروفون وصل شد');
    } catch {
      waveMicStop();
      Logger.toast('میکروفون باز نشد — پیش‌نمایش روی شبیه‌ساز می‌ماند');
    } finally {
      waveMicPending = false;
      syncUI();
    }
  });

  waveFollowStart();
  syncUI();
}

function waveFollowStart() {
  if (!waveRenderer || waveMicStream) return;
  try {
    const an = Audio.getAnalyser();
    waveRenderer.setAnalyser(an || null);
  } catch {}
}

function waveFollowStop() {}

function waveMicStop() {
  waveMicStream?.getTracks().forEach((t) => { try { t.stop(); } catch {} });
  waveMicStream = null;
  waveMicAnalyser = null;
  try { waveRenderer?.setAnalyser(Audio.getAnalyser() || null); } catch {}
  if (waveMicCtx) {
    const ctx = waveMicCtx;
    waveMicCtx = null;
    try { if (ctx.state !== 'closed') Promise.resolve(ctx.close()).catch(() => {}); } catch {}
  }
}

function wavePrevStart() {
  try { if (!waveHidden) waveRenderer?.start(); } catch {}
}

function wavePrevStop() {
  try { waveRenderer?.stop(); } catch {}
}

function waveStarterPause() {}

function waveSync() {
  syncUI();
}

function waveKillApply() {
  const strip = $('rec-strip');
  if (strip) {
    strip.classList.toggle('wave-hidden', waveHidden);
    strip.setAttribute('aria-hidden', waveHidden ? 'true' : 'false');
  }
  const cb = $('wave-hide');
  if (cb) cb.checked = waveHidden;
  if (waveHidden) {
    try { getMainWave()?.stop(); } catch {}
    try { waveRenderer?.stop(); } catch {}
  } else {
    try { getMainWave()?.start(); } catch {}
    if (els?.panelWave && !els.panelWave.hidden && els.modal?.style.display === 'flex') {
      try { waveRenderer?.start(); } catch {}
    }
  }
  syncRecStrip();
}

function isWaveHidden() { return waveHidden; }
function isWaveMicActive() { return !!waveMicStream || !!waveMicCtx; }

let waveFlushBound = false;
function bindWaveFlushHooks() {
  if (waveFlushBound) return;
  waveFlushBound = true;
  const flush = () => flushPersist();
  try { $('btn-save-modal')?.addEventListener('click', flush); } catch {}
  try { $('btn-close-modal')?.addEventListener('click', flush); } catch {}
  try { els?.modal?.addEventListener('click', (e) => { if (e.target === els.modal) flush(); }); } catch {}
  try { window.addEventListener('pagehide', flush); } catch {}
  try { window.addEventListener('beforeunload', flush); } catch {}
  try { document.addEventListener('visibilitychange', () => { if (document.hidden) flush(); }); } catch {}
}

export function mountWaveTab(deps) {
  els = deps.els || els;
  getMainWave = deps.getMainWave || getMainWave;
  syncRecStrip = deps.syncRecStrip || syncRecStrip;
  bindWaveFlushHooks();
  return {
    waveEnsure,
    wavePrevStart,
    wavePrevStop,
    waveStarterPause,
    waveFollowStop,
    waveMicStop,
    waveSync,
    waveKillApply,
    isWaveHidden,
    isWaveMicActive,
  };
}
