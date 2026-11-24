// Wave tab: Wave Studio — 8 distinct styles (incl. 2-Bit Pixel), state preview switcher,
// quick 2-tone color palettes, adaptive style controls, globals, and kill-switch.
import { Storage, defaultWaveConfig, WAVE_TYPES } from './storage.js';
import { createWaveRenderer, STARTERS, starterById, randomStack, WAVE_FA, WAVE_PALETTES } from './wave.js';
import { Logger } from './logger.js';
import { Audio } from './audio.js';
import { $ } from './dom.js';

let els = null;
let getMainWave = () => null;
let syncRecStrip = () => {};

let waveCfg = Storage.getWave();
let waveRenderer = null, waveInit = false, waveFakeOn = true;
let wavePreviewState = 'recording'; // 'recording' | 'paused' | 'transcribing'
let waveHidden = !Storage.getWaveIdle();
let waveMicStream = null, waveMicCtx = null, waveMicAnalyser = null;
let waveMicPending = false;
let waveOpenIds = new Set(waveCfg.waves.length ? [waveCfg.waves[0].id] : []);
let waveAdvIds = new Set();

const STUDIO_SWATCHES = ['#9bbc0f', '#fde047', '#60a5fa', '#5eead4', '#c084fc', '#fb7185'];
const SVG_CHEV = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>';
const SVG_VOL_ON = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>';
const SVG_VOL_OFF = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="22" y1="9" x2="16" y2="15"/><line x1="16" y1="9" x2="22" y2="15"/></svg>';
const SVG_EDIT = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 1 1 3 3L7 19l-4 1 1-4Z"/></svg>';
const SVG_UP = '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 15l-6-6-6 6"/></svg>';
const SVG_DN = '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>';
const SVG_X = '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M18 6L6 18M6 6l12 12"/></svg>';

function waveName(wv, idx) { const n = (wv.name || '').trim(); return n || `لایه ${idx + 1}`; }

let wavePersistTimer = null;
let wavePersistPending = false;
function wavePreview() { try { waveRenderer?.setConfig(waveCfg); } catch {} waveSync(); }
function waveSchedulePersist() { wavePersistPending = true; if (wavePersistTimer) clearTimeout(wavePersistTimer); wavePersistTimer = setTimeout(() => waveFlushPersist(), 240); }
function waveFlushPersist() {
  if (wavePersistTimer) { clearTimeout(wavePersistTimer); wavePersistTimer = null; }
  if (!wavePersistPending) return;
  wavePersistPending = false;
  waveCfg = Storage.saveWave(waveCfg);
  try { waveRenderer?.setConfig(waveCfg); } catch {}
  waveSync();
}
function wavePersist() { wavePreview(); waveSchedulePersist(); }

function waveSeg(box, vals, cur, faMap, cb) {
  box.innerHTML = '';
  vals.forEach(v => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = faMap ? (faMap[v] || v) : v;
    b.className = v === cur ? 'active' : '';
    b.addEventListener('click', e => { e.preventDefault(); cb(v); });
    box.appendChild(b);
  });
}

function buildPaletteStrip(wv, onPickPalette) {
  const wrap = document.createElement('div');
  wrap.className = 'wave-palettes';
  const lab = document.createElement('span');
  lab.className = 'wave-ctrl-label';
  lab.textContent = 'پالت آماده رنگ';
  const row = document.createElement('div');
  row.className = 'wave-palette-chips';
  for (const p of WAVE_PALETTES) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'wave-pal-chip';
    const isActive = wv.colorMode === p.mode
      && (p.mode === 'rainbow' || (String(wv.c1).toLowerCase() === p.c1 && String(wv.c2).toLowerCase() === p.c2));
    if (isActive) b.classList.add('active');
    const dot = document.createElement('span');
    dot.className = 'wave-pal-dot';
    dot.style.background = p.mode === 'rainbow'
      ? 'conic-gradient(#ff595e,#ffca3a,#8ac926,#1982c4,#6a4c93,#ff595e)'
      : `linear-gradient(135deg, ${p.c1}, ${p.c2})`;
    const txt = document.createElement('span');
    txt.textContent = p.n;
    b.append(dot, txt);
    b.addEventListener('click', e => { e.preventDefault(); onPickPalette(p); });
    row.appendChild(b);
  }
  wrap.append(lab, row);
  return wrap;
}

function buildColorRow(labelText, currentHex, onPick) {
  const wrap = document.createElement('div');
  wrap.className = 'wave-color-row';
  const lab = document.createElement('span');
  lab.className = 'wave-ctrl-label';
  lab.textContent = labelText;
  const swatches = document.createElement('div');
  swatches.className = 'wave-swatches';
  const inp = document.createElement('input');
  inp.type = 'color';
  inp.value = currentHex;
  inp.setAttribute('aria-label', labelText);
  const syncActive = (hex) => {
    const low = String(hex || '').toLowerCase();
    swatches.querySelectorAll('.wave-swatch').forEach(s => {
      s.classList.toggle('active', s.dataset.color === low);
    });
  };
  for (const c of STUDIO_SWATCHES) {
    const sw = document.createElement('button');
    sw.type = 'button';
    sw.className = 'wave-swatch';
    sw.dataset.color = c.toLowerCase();
    sw.style.background = c;
    sw.setAttribute('aria-label', `${labelText}: ${c}`);
    sw.addEventListener('click', (e) => {
      e.preventDefault();
      inp.value = c;
      syncActive(c);
      onPick(c, true);
    });
    swatches.appendChild(sw);
  }
  inp.addEventListener('input', () => { syncActive(inp.value); onPick(inp.value, false); });
  inp.addEventListener('change', () => waveFlushPersist());
  syncActive(currentHex);
  wrap.append(lab, swatches, inp);
  return wrap;
}

function buildTogglePill(labelText, checked, onChange) {
  const lab = document.createElement('label');
  lab.className = 'wave-opt-toggle';
  const cb = document.createElement('input');
  cb.type = 'checkbox';
  cb.checked = !!checked;
  cb.addEventListener('change', () => onChange(!!cb.checked));
  const txt = document.createElement('span');
  txt.textContent = labelText;
  lab.append(cb, txt);
  return lab;
}

const waveGlobalPaints = [];
let waveListPaints = [];
function waveSlider(mount, o) {
  mount.classList.add('wslider', o.scope === 'global' ? 'wslider-global' : 'wslider-local');
  if (o.reuseInput?.id === 'wave-aurora-hue') mount.classList.add('wslider--hue');
  mount.innerHTML = '';
  const head = document.createElement('div');
  head.className = 'wslider-head';
  const lab = document.createElement('span');
  lab.className = 'wslider-label'; lab.textContent = o.label;
  const bb = document.createElement('output');
  bb.className = 'wslider-bubble';
  head.append(lab, bb);
  const track = document.createElement('div');
  track.className = 'wslider-track';
  const rg = o.reuseInput || document.createElement('input');
  rg.type = 'range';
  rg.min = String(o.min); rg.max = String(o.max); rg.step = String(o.step);
  rg.dir = 'ltr';
  rg.setAttribute('aria-label', o.label);
  if (rg.id && (o.scope === 'global')) bb.id = rg.id + '-val';
  track.append(rg);
  mount.append(head, track);
  let chip = null;
  if (o.follow) {
    chip = document.createElement('button');
    chip.type = 'button'; chip.className = 'wslider-follow';
    chip.textContent = 'همگام با تنظیم کلی';
    chip.setAttribute('aria-label', o.label + ' — همگام با تنظیم کلی');
    chip.title = 'روشن = تبعیت از تنظیم کلی؛ خاموش = مقدار اختصاصی همین لایه';
    mount.appendChild(chip);
  }
  const paint = () => {
    const v = o.get();
    const following = !!(o.follow && v == null);
    const sv = following ? o.follow.globalVal() : v;
    rg.value = String(sv);
    rg.disabled = following;
    rg.title = following ? 'همگام با تنظیم کلی — برای تغییر جداگانه دکمه پایین را بزن' : 'دابل‌کلیک = بازنشانی';
    const pct = (sv - o.min) / Math.max(1e-9, (o.max - o.min)) * 100;
    rg.style.setProperty('--p', pct.toFixed(1) + '%');
    bb.textContent = following ? `خودکار (${sv}${o.unit})` : `${sv}${o.unit}`;
    mount.classList.toggle('is-follow', following);
    if (chip) chip.setAttribute('aria-pressed', String(following));
  };
  rg.addEventListener('input', () => { o.set(+rg.value); paint(); wavePreview(); waveSchedulePersist(); });
  rg.addEventListener('change', () => { waveFlushPersist(); });
  rg.addEventListener('dblclick', () => {
    o.set(o.follow ? null : o.def);
    paint(); wavePreview(); waveSchedulePersist(); waveFlushPersist();
  });
  if (chip) chip.addEventListener('click', e => {
    e.preventDefault(); e.stopPropagation();
    const v = o.get();
    o.set((o.follow && v == null) ? o.follow.globalVal() : null);
    paint(); wavePreview(); waveSchedulePersist(); waveFlushPersist();
  });
  paint();
  (o.scope === 'global' ? waveGlobalPaints : waveListPaints).push(paint);
  return { el: mount, paint };
}

function waveApplyStarter(id, applyAurora) {
  const st = starterById(id);
  waveCfg.starterId = id;
  waveCfg.waves = st.stack();
  waveCfg.waves.forEach((w, i) => { if (!(w.name || '').trim()) w.name = `لایه ${i + 1}`; });
  if (applyAurora && st.aurora !== undefined) waveCfg.aurora = { ...waveCfg.aurora, on: !!st.aurora };
  waveOpenIds = new Set(waveCfg.waves.length ? [waveCfg.waves[0].id] : []);
  waveAdvIds = new Set();
  wavePreviewState = 'recording';
  try { waveRenderer?.setState('recording'); } catch {}
  wavePersist();
  waveRenderList();
}

// Live starter thumbnail previews (~28fps shared rAF, IntersectionObserver-gated)
const waveStarterLive = { raf: 0, last: 0, items: [], io: null };
function waveStarterLoop(now) {
  waveStarterLive.raf = 0;
  if (document.hidden) return;
  if (now - waveStarterLive.last >= 34) {
    waveStarterLive.last = now;
    const stats = (window.__waveStarterStats = window.__waveStarterStats || { ticks: 0, draws: 0 });
    stats.ticks++;
    const cfg = waveCfg;
    for (const it of waveStarterLive.items) {
      if (!it.visible || !it.renderer) continue;
      try {
        it.renderer.setConfig({ ...cfg, aurora: { ...cfg.aurora, on: !!it.aurora }, waves: it.waves, starterId: it.id });
        it.renderer.renderFrame(now);
        stats.draws++;
      } catch {}
    }
  }
  waveStarterLive.raf = requestAnimationFrame(waveStarterLoop);
}
function waveStarterVis() {
  if (document.hidden) {
    if (waveStarterLive.raf) cancelAnimationFrame(waveStarterLive.raf);
    waveStarterLive.raf = 0;
    return;
  }
  if (waveHidden) return;
  if (waveStarterLive.items.length && !waveStarterLive.raf &&
    !matchMedia('(prefers-reduced-motion: reduce)').matches) {
    waveStarterLive.last = performance.now();
    waveStarterLive.raf = requestAnimationFrame(waveStarterLoop);
  }
}
function waveStarterPause() {
  if (waveStarterLive.raf) cancelAnimationFrame(waveStarterLive.raf);
  waveStarterLive.raf = 0;
  try { waveStarterLive.io?.disconnect(); } catch {}
  waveStarterLive.io = null;
  document.removeEventListener('visibilitychange', waveStarterVis);
  waveStarterLive.items = [];
}
function waveStarterAttach() {
  const grid = $('wave-starters');
  if (!grid) return;
  const cvs = [...grid.querySelectorAll('canvas.wave-thumb')];
  if (cvs.length !== STARTERS.length) { grid.dataset.built = ''; waveRenderStarters(); return; }
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  waveStarterLive.items = STARTERS.map((s, i) => {
    const waves = s.stack();
    let renderer = null;
    try {
      renderer = createWaveRenderer(cvs[i]);
      renderer.setFakeEnabled(true);
      if (reduced || waveHidden) {
        renderer.setConfig({ ...waveCfg, aurora: { ...waveCfg.aurora, on: !!s.aurora }, waves, starterId: s.id });
        renderer.renderOnce();
      }
    } catch { renderer = null; }
    return { id: s.id, aurora: !!s.aurora, waves, renderer, cv: cvs[i], visible: true };
  });
  if (!reduced && !waveHidden) {
    try {
      waveStarterLive.io = new IntersectionObserver(es => {
        es.forEach(e => {
          const it = waveStarterLive.items.find(x => x.cv === e.target);
          if (it) it.visible = e.isIntersecting;
        });
      }, { threshold: 0.05 });
      waveStarterLive.items.forEach(it => waveStarterLive.io.observe(it.cv));
    } catch { waveStarterLive.io = null; }
    document.addEventListener('visibilitychange', waveStarterVis);
    waveStarterLive.last = performance.now();
    waveStarterLive.raf = requestAnimationFrame(waveStarterLoop);
  }
}
function waveRenderStarters() {
  const grid = $('wave-starters');
  if (!grid) return;
  if (grid.dataset.built === '1' && grid.children.length === STARTERS.length) {
    [...grid.children].forEach((b, i) => b.classList.toggle('active', STARTERS[i].id === waveCfg.starterId));
    if (!waveStarterLive.items.length) waveStarterAttach();
    return;
  }
  waveStarterPause();
  grid.innerHTML = '';
  grid.dataset.built = '1';
  STARTERS.forEach((s, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'wave-card' + (s.id === waveCfg.starterId ? ' active' : '');
    b.setAttribute('aria-label', `${s.n} — ${s.d}`);
    const cv = document.createElement('canvas');
    cv.className = 'wave-thumb';
    cv.width = 280; cv.height = 104;
    cv.setAttribute('aria-hidden', 'true');
    const head = document.createElement('div');
    head.className = 'wave-card-head';
    const t = document.createElement('b'); t.textContent = s.n;
    const tag = document.createElement('span'); tag.className = 'wave-card-tag'; tag.textContent = s.tag || '';
    head.append(t, tag);
    const d = document.createElement('span'); d.className = 'wave-card-desc'; d.textContent = s.d;
    b.append(cv, head, d);
    b.addEventListener('click', () => waveApplyStarter(s.id, true));
    grid.appendChild(b);
  });
  waveStarterAttach();
}

function waveRenderList() {
  const list = $('wave-list');
  if (!list) return;
  list.innerHTML = '';
  waveListPaints = [];
  const alive = new Set(waveCfg.waves.map(w => w.id));
  [...waveOpenIds].forEach(id => { if (!alive.has(id)) waveOpenIds.delete(id); });
  [...waveAdvIds].forEach(id => { if (!alive.has(id)) waveAdvIds.delete(id); });
  const frag = document.createDocumentFragment();
  waveCfg.waves.forEach((wv, idx) => {
    const row = document.createElement('div');
    row.className = 'wave-item' + (wv.mute ? ' muted' : '');
    const det = document.createElement('details');
    det.open = waveOpenIds.has(wv.id);
    const chev = document.createElement('button');
    chev.type = 'button'; chev.className = 'wave-chev'; chev.innerHTML = SVG_CHEV;
    chev.title = 'باز/بسته';
    chev.setAttribute('aria-label', 'باز/بسته ' + waveName(wv, idx));
    chev.setAttribute('aria-expanded', String(det.open));
    chev.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); det.open = !det.open; });
    det.addEventListener('toggle', () => { det.open ? waveOpenIds.add(wv.id) : waveOpenIds.delete(wv.id); chev.setAttribute('aria-expanded', String(det.open)); });
    const sum = document.createElement('summary');
    const dot = document.createElement('span');
    dot.className = 'wave-dot';
    dot.style.background = wv.colorMode === 'rainbow'
      ? 'conic-gradient(red,orange,yellow,green,blue,violet,red)'
      : (wv.colorMode === 'gradient' ? `linear-gradient(135deg, ${wv.c1}, ${wv.c2})` : wv.c1);
    const title = document.createElement('span');
    title.className = 'wave-title' + (wv.mute ? ' dim' : '');
    const paintTitle = () => {
      const tName = WAVE_FA.types[wv.type] || wv.type;
      const cmName = WAVE_FA.colorModes[wv.colorMode] || wv.colorMode;
      title.textContent = `${waveName(wv, idx)} — ${tName} · ${cmName}${wv.mute ? ' · خاموش' : ''}`;
      title.title = wv.mute ? 'خاموش — برای روشن کردن دکمه صدا را بزن' : 'برای باز یا بستن کلیک کن';
    };
    paintTitle();
    const muteBtn = document.createElement('button');
    muteBtn.type = 'button'; muteBtn.className = 'wave-mute';
    const paintMute = () => {
      muteBtn.innerHTML = wv.mute ? SVG_VOL_OFF : SVG_VOL_ON;
      muteBtn.setAttribute('aria-pressed', String(!wv.mute));
      muteBtn.setAttribute('aria-label', (wv.mute ? 'روشن کردن ' : 'خاموش کردن ') + waveName(wv, idx));
    };
    paintMute();
    muteBtn.addEventListener('click', e => {
      e.preventDefault(); e.stopPropagation();
      const live = waveCfg.waves.find(w => w.id === wv.id) || wv;
      live.mute = !live.mute;
      wv.mute = live.mute;
      row.classList.toggle('muted', wv.mute);
      paintTitle(); title.classList.toggle('dim', wv.mute); paintMute();
      wavePersist();
    });
    const rn = document.createElement('button');
    rn.type = 'button'; rn.className = 'wave-rename'; rn.innerHTML = SVG_EDIT; rn.title = 'تغییر نام لایه';
    rn.setAttribute('aria-label', 'تغییر نام ' + waveName(wv, idx));
    const tag = document.createElement('span');
    tag.className = 'wave-tag' + (idx === 0 ? ' front' : '');
    tag.textContent = idx === 0 ? 'رو' : (idx === waveCfg.waves.length - 1 ? 'زیر' : 'میانی');
    rn.addEventListener('click', e => {
      e.preventDefault(); e.stopPropagation();
      if (sum.querySelector('.wave-name-input')) return;
      const inp = document.createElement('input');
      inp.className = 'wave-name-input'; inp.type = 'text'; inp.value = waveName(wv, idx); inp.maxLength = 24; inp.dir = 'auto';
      inp.setAttribute('aria-label', 'نام لایه');
      title.style.display = 'none'; rn.style.display = 'none'; chev.style.display = 'none';
      sum.insertBefore(inp, tag);
      inp.focus(); inp.select();
      let done = false;
      const commit = ok => {
        if (done) return; done = true;
        if (ok) { wv.name = inp.value.trim().slice(0, 24) || ''; paintTitle(); wavePersist(); }
        inp.remove(); title.style.display = ''; rn.style.display = ''; chev.style.display = '';
      };
      inp.addEventListener('click', ev => ev.stopPropagation());
      inp.addEventListener('pointerdown', ev => ev.stopPropagation());
      inp.addEventListener('keydown', ev => { ev.stopPropagation(); if (ev.key === 'Enter') { ev.preventDefault(); commit(true); } else if (ev.key === 'Escape') { ev.preventDefault(); commit(false); } });
      inp.addEventListener('blur', () => commit(true));
    });
    title.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); det.open = !det.open; });

    const tools = document.createElement('span');
    tools.className = 'wave-tools';
    const up = document.createElement('button'); up.type = 'button'; up.innerHTML = SVG_UP; up.title = 'آوردن به رو'; up.setAttribute('aria-label', 'آوردن به رو ' + waveName(wv, idx)); up.disabled = idx === 0;
    up.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); [waveCfg.waves[idx - 1], waveCfg.waves[idx]] = [waveCfg.waves[idx], waveCfg.waves[idx - 1]]; wavePersist(); waveRenderList(); });
    const dn = document.createElement('button'); dn.type = 'button'; dn.innerHTML = SVG_DN; dn.title = 'بردن به زیر'; dn.setAttribute('aria-label', 'بردن به زیر ' + waveName(wv, idx)); dn.disabled = idx === waveCfg.waves.length - 1;
    dn.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); [waveCfg.waves[idx + 1], waveCfg.waves[idx]] = [waveCfg.waves[idx], waveCfg.waves[idx + 1]]; wavePersist(); waveRenderList(); });
    const del = document.createElement('button'); del.type = 'button'; del.innerHTML = SVG_X; del.title = 'حذف لایه'; del.setAttribute('aria-label', 'حذف ' + waveName(wv, idx)); del.disabled = waveCfg.waves.length <= 1;
    del.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); waveOpenIds.delete(wv.id); waveAdvIds.delete(wv.id); waveCfg.waves.splice(idx, 1); wavePersist(); waveRenderList(); });
    tools.append(up, dn, del);
    sum.append(chev, dot, title, rn, muteBtn, tag, tools);
    det.appendChild(sum);

    const body = document.createElement('div');
    body.className = 'wave-body';

    // 1. Style selector (8 distinct styles)
    const rType = document.createElement('div');
    const tLab = document.createElement('div'); tLab.className = 'wave-ctrl-label'; tLab.textContent = 'سبک نمایش';
    const segT = document.createElement('div'); segT.className = 'wave-seg';
    waveSeg(segT, WAVE_TYPES, wv.type, WAVE_FA.types, v => {
      wv.type = v;
      if (v === 'pixel-2bit' && wv.grid === undefined) wv.grid = true;
      wavePersist();
      waveRenderList();
    });
    rType.append(tLab, segT);
    body.appendChild(rType);

    // 2. Quick 2-tone color palettes + color mode + custom pickers
    body.appendChild(buildPaletteStrip(wv, (p) => {
      wv.colorMode = p.mode;
      wv.c1 = p.c1;
      wv.c2 = p.c2;
      wavePersist();
      waveRenderList();
    }));

    const rCm = document.createElement('div');
    const cLab = document.createElement('div'); cLab.className = 'wave-ctrl-label'; cLab.textContent = 'نوع رنگ‌آمیزی';
    const segC = document.createElement('div'); segC.className = 'wave-seg';
    waveSeg(segC, ['solid', 'gradient', 'rainbow'], wv.colorMode, WAVE_FA.colorModes, v => {
      wv.colorMode = v;
      wavePersist();
      waveRenderList();
    });
    rCm.append(cLab, segC);
    body.appendChild(rCm);

    if (wv.colorMode !== 'rainbow') {
      body.appendChild(buildColorRow('رنگ اصلی', wv.c1, (hex, commit) => {
        wv.c1 = hex;
        dot.style.background = wv.colorMode === 'gradient' ? `linear-gradient(135deg, ${wv.c1}, ${wv.c2})` : hex;
        wavePreview();
        if (commit) waveFlushPersist(); else waveSchedulePersist();
      }));
      if (wv.colorMode === 'gradient') {
        body.appendChild(buildColorRow('رنگ دوم گرادیان', wv.c2, (hex, commit) => {
          wv.c2 = hex;
          dot.style.background = `linear-gradient(135deg, ${wv.c1}, ${wv.c2})`;
          wavePreview();
          if (commit) waveFlushPersist(); else waveSchedulePersist();
        }));
      }
    }

    // 3. Adaptive per-style toggles (Mirror, CRT Grid, Peak-Hold)
    const togglesBox = document.createElement('div');
    togglesBox.className = 'wave-opt-toggles';
    togglesBox.appendChild(buildTogglePill('آینه‌ای دوطرفه', wv.mirror !== false, v => {
      wv.mirror = v; wavePersist();
    }));
    if (wv.type === 'pixel-2bit' || wv.type === 'laser-scope' || wv.type === 'sonic-rings') {
      const gridLabel = wv.type === 'pixel-2bit' ? 'شبکه ماتریس و اسکن‌لاین CRT' : 'خطوط راهنمای شبکه';
      togglesBox.appendChild(buildTogglePill(gridLabel, !!wv.grid, v => {
        wv.grid = v; wavePersist();
      }));
    }
    if (wv.type === 'pixel-2bit' || wv.type === 'capsule-eq') {
      togglesBox.appendChild(buildTogglePill('کلاهک قله‌گیر شناور', wv.peakHold !== false, v => {
        wv.peakHold = v; wavePersist();
      }));
    }
    body.appendChild(togglesBox);

    // 4. Adaptive per-style geometry controls
    if (wv.type === 'capsule-eq') {
      const rBar = document.createElement('div');
      const sLab = document.createElement('div'); sLab.className = 'wave-ctrl-label'; sLab.textContent = 'شکل ستون‌ها';
      const segS = document.createElement('div'); segS.className = 'wave-seg';
      waveSeg(segS, ['rounded', 'square', 'needle'], wv.barShape || 'rounded', WAVE_FA.barShapes, v => {
        wv.barShape = v; wavePersist(); waveRenderList();
      });
      rBar.append(sLab, segS);
      body.appendChild(rBar);
    }

    const styleSliders = document.createElement('div');
    styleSliders.className = 'wave-sliders-pair';
    const sliderDefs = [
      ['opacity', 'شفافیت', 10, 100, '1', '٪', 96],
      ['glow', 'درخشش نور', 0, 100, '1', '٪', 68],
      ['detail', wv.type === 'sonic-rings' ? 'تعداد حلقه‌ها' : 'جزئیات و موجک‌ها', 1, 5, '1', '', 3],
    ];
    if (wv.type === 'pixel-2bit') {
      sliderDefs.push(['pixelSize', 'اندازه پیکسل', 3, 12, '1', ' px', 5]);
    } else if (wv.type === 'capsule-eq') {
      sliderDefs.push(['barCount', 'تعداد ستون‌ها', 8, 48, '1', '', 24]);
      sliderDefs.push(['barGap', 'فاصله ستون‌ها', 0, 8, '1', ' px', 2]);
    } else {
      sliderDefs.push(['thick', 'ضخامت خط', 1, 6, '0.5', '', 2]);
    }
    sliderDefs.forEach(([k, fa, mn, mx, st, u, df]) => {
      const mount = document.createElement('div');
      styleSliders.appendChild(mount);
      waveSlider(mount, {
        label: fa, min: mn, max: mx, step: st, unit: u, def: df, scope: 'local',
        get: () => (wv[k] ?? df), set: v => { wv[k] = v; }, onChange: () => wavePersist(),
      });
    });
    body.appendChild(styleSliders);

    // 5. Optional fine-tuning collapsible
    const adv = document.createElement('details');
    adv.className = 'wave-adv'; adv.open = waveAdvIds.has(wv.id);
    adv.addEventListener('toggle', () => { adv.open ? waveAdvIds.add(wv.id) : waveAdvIds.delete(wv.id); });
    const advSum = document.createElement('summary'); advSum.textContent = 'تنظیمات تکمیلی این لایه (توزیع فرکانس و سرعت اختصاصی)';
    adv.appendChild(advSum);

    const rBd = document.createElement('div');
    const bLab = document.createElement('div'); bLab.className = 'wave-ctrl-label'; bLab.textContent = 'واکنش به محدوده صدا';
    const segB = document.createElement('div'); segB.className = 'wave-seg';
    waveSeg(segB, ['rms', 'low', 'mid', 'high'], wv.band, WAVE_FA.bands, v => { wv.band = v; wavePersist(); waveRenderList(); });
    rBd.append(bLab, segB);
    adv.appendChild(rBd);

    const rPf = document.createElement('div');
    const fLab = document.createElement('div'); fLab.className = 'wave-ctrl-label'; fLab.textContent = 'تمرکز عرضی موج';
    const segF = document.createElement('div'); segF.className = 'wave-seg';
    waveSeg(segF, ['center', 'flat', 'edges', 'bands'], wv.profile || 'center', WAVE_FA.profiles, v => { wv.profile = v; wavePersist(); waveRenderList(); });
    rPf.append(fLab, segF);
    adv.appendChild(rPf);

    const ovGrid = document.createElement('div');
    ovGrid.className = 'wave-sliders-pair';
    [['speed', 'سرعت اختصاصی'], ['intensity', 'شدت اختصاصی'], ['smooth', 'نرمی اختصاصی'], ['sensitivity', 'حساسیت اختصاصی']].forEach(([key, label]) => {
      const mount = document.createElement('div');
      ovGrid.appendChild(mount);
      waveSlider(mount, {
        label, min: 0, max: 100, step: '1', unit: '٪', def: 55, scope: 'local',
        get: () => wv.ov[key], set: v => { wv.ov[key] = v; },
        follow: { globalVal: () => waveCfg[key] }, onChange: () => wavePersist(),
      });
    });
    adv.appendChild(ovGrid);
    body.appendChild(adv);
    det.appendChild(body);
    row.appendChild(det);
    frag.appendChild(row);
  });
  list.appendChild(frag);
  const addBtn = $('wave-add');
  if (addBtn) addBtn.disabled = waveCfg.waves.length >= 5;
}

function waveSyncHue() {
  const rg = $('wave-aurora-hue');
  const mount = rg?.closest('.wslider');
  if (mount) mount.hidden = !waveCfg.aurora.on;
}
function waveSync() {
  waveRenderStarters();
  const set = (id, v) => { const el = $(id); if (el) el.value = v; };
  const txt = (id, v) => { const el = $(id); if (el) el.textContent = v; };
  set('wave-sens', waveCfg.sensitivity); set('wave-sens-mini', waveCfg.sensitivity);
  set('wave-spd', waveCfg.speed); set('wave-int', waveCfg.intensity);
  set('wave-sm', waveCfg.smooth);
  set('wave-parts', waveCfg.particles); set('wave-aurora-hue', waveCfg.aurora.hue);
  const aur = $('wave-aurora'); if (aur) aur.checked = !!waveCfg.aurora.on;
  txt('wave-sens-val', waveCfg.sensitivity + '٪'); txt('wave-sens-mini-val', waveCfg.sensitivity + '٪');
  txt('wave-spd-val', waveCfg.speed + '٪'); txt('wave-int-val', waveCfg.intensity + '٪');
  txt('wave-sm-val', waveCfg.smooth + '٪');
  txt('wave-parts-val', waveCfg.particles); txt('wave-aurora-hue-val', waveCfg.aurora.hue + '°');
  waveGlobalPaints.forEach(p => p());
  waveListPaints.forEach(p => p());
  waveSyncHue();
  txt('wave-count', waveCfg.waves.length + ' لایه' + (waveCfg.waves.length >= 5 ? ' (سقف)' : ''));
  const nm = $('wave-name');
  if (nm) nm.textContent = waveCfg.starterId === 'custom-dice' ? 'ترکیب تصادفی' : starterById(waveCfg.starterId).n;
  const addBtn = $('wave-add');
  if (addBtn) addBtn.disabled = waveCfg.waves.length >= 5;
  const ft = $('wave-fake-toggle');
  if (ft) {
    ft.textContent = waveFakeOn ? 'شبیه‌ساز: روشن' : 'شبیه‌ساز: خاموش';
    ft.classList.toggle('active', waveFakeOn);
    ft.setAttribute('aria-pressed', String(waveFakeOn));
  }
  const hb = $('wave-hide');
  if (hb) hb.checked = waveHidden;
  const mt = $('wave-mic-test');
  if (mt) {
    mt.textContent = waveMicStream ? 'توقف میکروفون' : 'تست با صدای من';
    mt.classList.toggle('active', !!waveMicStream);
  }
  document.querySelectorAll('#wave-state-seg button[data-wave-state]').forEach(b => {
    const active = b.dataset.waveState === wavePreviewState;
    b.classList.toggle('active', active);
    b.setAttribute('aria-pressed', String(active));
  });
}

function waveEnsure() {
  if (waveInit) { waveFollowStart(); waveSync(); return; }
  waveInit = true;
  const waveGlobalKey = { 'wave-sens': 'sensitivity', 'wave-sens-mini': 'sensitivity', 'wave-spd': 'speed', 'wave-int': 'intensity', 'wave-sm': 'smooth', 'wave-parts': 'particles' };
  document.querySelectorAll('#panel-wave .wslider-mount').forEach(m => {
    if (m.dataset.built) return;
    m.dataset.built = '1';
    const rg = m.querySelector('input[type=range]');
    if (!rg) return;
    const isHue = rg.id === 'wave-aurora-hue';
    const key = waveGlobalKey[rg.id];
    waveSlider(m, {
      label: m.dataset.label || rg.getAttribute('aria-label') || rg.id,
      min: +rg.min, max: +rg.max, step: rg.step || '1',
      unit: m.dataset.unit || '', def: +(m.dataset.def || 50), scope: 'global', reuseInput: rg,
      get: () => isHue ? waveCfg.aurora.hue : waveCfg[key],
      set: v => { if (isHue) waveCfg.aurora.hue = v; else waveCfg[key] = v; },
      onChange: () => wavePersist(),
    });
  });
  const cv = $('wave-preview');
  waveRenderer = createWaveRenderer(cv);
  waveRenderer.setConfig(waveCfg);
  waveRenderer.setFakeEnabled(waveFakeOn);
  waveRenderer.setState(wavePreviewState);

  document.querySelectorAll('#wave-state-seg button[data-wave-state]').forEach(btn => {
    btn.addEventListener('click', () => {
      wavePreviewState = btn.dataset.waveState || 'recording';
      try { waveRenderer?.setState(wavePreviewState); } catch {}
      waveSync();
    });
  });

  $('wave-aurora')?.addEventListener('change', e => { waveCfg.aurora.on = e.target.checked; wavePersist(); });
  $('wave-hide')?.addEventListener('change', e => {
    waveHidden = !!e.target.checked;
    try { Storage.saveWaveIdle(!waveHidden); } catch {}
    waveKillApply();
  });
  $('wave-add')?.addEventListener('click', () => {
    if (waveCfg.waves.length >= 5) return;
    const pal = WAVE_PALETTES[waveCfg.waves.length % WAVE_PALETTES.length];
    waveCfg.starterId = waveCfg.starterId || 'custom';
    waveCfg.waves.push({
      id: `w${Date.now().toString(36)}`, name: `لایه ${waveCfg.waves.length + 1}`, type: 'siri-ribbon',
      colorMode: pal.mode, c1: pal.c1, c2: pal.c2,
      opacity: 82, glow: 64, thick: 2, detail: 3, peaks: 'mid', band: 'rms', profile: 'center',
      mirror: true, grid: false, peakHold: true, pixelSize: 5, mute: false,
      barShape: 'rounded', barCount: 24, barGap: 2,
      ov: { speed: null, intensity: null, attack: null, smooth: null, sensitivity: null },
    });
    waveOpenIds.add(waveCfg.waves[waveCfg.waves.length - 1].id);
    wavePersist(); waveRenderList();
  });
  $('wave-dice')?.addEventListener('click', () => {
    waveCfg.starterId = 'custom-dice';
    waveCfg.waves = randomStack();
    waveOpenIds = new Set(waveCfg.waves.length ? [waveCfg.waves[0].id] : []);
    waveAdvIds = new Set();
    wavePreviewState = 'recording';
    try { waveRenderer?.setState('recording'); } catch {}
    wavePersist(); waveRenderList();
  });
  $('wave-reset')?.addEventListener('click', () => {
    const id = waveCfg.starterId && starterById(waveCfg.starterId) ? waveCfg.starterId : 'siri-aurora';
    const fb = defaultWaveConfig();
    const keepWaves = starterById(id).stack();
    keepWaves.forEach((w, i) => { if (!w.name) w.name = `لایه ${i + 1}`; });
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
    if (waveMicPending) return;
    if (waveMicStream) { waveMicStop(); waveSync(); return; }
    waveMicPending = true;
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('no-gum');
      waveMicStream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      waveMicCtx = waveMicCtx || new (window.AudioContext || window.webkitAudioContext)();
      if (waveMicCtx.state === 'suspended') await waveMicCtx.resume();
      const src = waveMicCtx.createMediaStreamSource(waveMicStream);
      waveMicAnalyser = waveMicCtx.createAnalyser();
      waveMicAnalyser.fftSize = 1024;
      src.connect(waveMicAnalyser);
      wavePreviewState = 'recording';
      waveRenderer.setState('recording');
      waveRenderer.setAnalyser(waveMicAnalyser);
      Logger.log('info', 'پیش‌نمایش موج: میکروفون وصل شد');
    } catch {
      waveMicStop();
      Logger.toast('میکروفون باز نشد — پیش‌نمایش روی شبیه‌ساز می‌ماند');
    } finally { waveMicPending = false; waveSync(); }
  });
  waveFollowStart();
  waveRenderList();
  waveSync();
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
  waveMicStream?.getTracks().forEach(t => { try { t.stop(); } catch {} });
  waveMicStream = null;
  waveMicAnalyser = null;
  try { waveRenderer?.setAnalyser(Audio.getAnalyser() || null); } catch {}
  if (waveMicCtx) {
    const ctx = waveMicCtx;
    waveMicCtx = null;
    try { if (ctx.state !== 'closed') Promise.resolve(ctx.close()).catch(() => {}); } catch {}
  }
}
function wavePrevStart() { try { if (!waveHidden) waveRenderer?.start(); } catch {} }
function wavePrevStop() { try { waveRenderer?.stop(); } catch {} }
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
    if (waveStarterLive.raf) { try { cancelAnimationFrame(waveStarterLive.raf); } catch {} }
    waveStarterLive.raf = 0;
  } else {
    try { getMainWave()?.start(); } catch {}
    if (els.panelWave && !els.panelWave.hidden && els.modal?.style.display === 'flex') {
      try { waveRenderer?.start(); } catch {}
      if (waveStarterLive.items.length && !waveStarterLive.raf && !document.hidden &&
        !matchMedia('(prefers-reduced-motion: reduce)').matches) {
        document.addEventListener('visibilitychange', waveStarterVis);
        waveStarterLive.last = performance.now();
        waveStarterLive.raf = requestAnimationFrame(waveStarterLoop);
      }
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
  const flush = () => waveFlushPersist();
  try { $('btn-save-modal')?.addEventListener('click', flush); } catch {}
  try { $('btn-close-modal')?.addEventListener('click', flush); } catch {}
  try { els.modal?.addEventListener('click', e => { if (e.target === els.modal) flush(); }); } catch {}
  try { els.tabAi?.addEventListener('click', flush); } catch {}
  try { els.tabKeys?.addEventListener('click', flush); } catch {}
  try { els.tabBehavior?.addEventListener('click', flush); } catch {}
  try { els.tabTools?.addEventListener('click', flush); } catch {}
  try { els.tabPipeline?.addEventListener('click', flush); } catch {}
  try { els.tabWave?.addEventListener('click', flush); } catch {}
  try { window.addEventListener('pagehide', flush); } catch {}
  try { window.addEventListener('beforeunload', flush); } catch {}
  try { document.addEventListener('visibilitychange', () => { if (document.hidden) flush(); }); } catch {}
  try { document.addEventListener('keydown', e => { if (e.key === 'Escape' && els.modal?.style.display === 'flex') flush(); }); } catch {}
}

export function mountWaveTab(deps) {
  els = deps.els || els;
  getMainWave = deps.getMainWave || getMainWave;
  syncRecStrip = deps.syncRecStrip || syncRecStrip;
  bindWaveFlushHooks();
  return { waveEnsure, wavePrevStart, wavePrevStop, waveStarterPause, waveFollowStop, waveMicStop, waveSync, waveKillApply, isWaveHidden, isWaveMicActive };
}
