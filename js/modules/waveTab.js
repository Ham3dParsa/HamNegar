// Wave tab: sliders, starter cards + live previews, wave list, globals, kill-switch.
// Extracted verbatim from js/app.js (ticket 32-wave-extract) — logic, order,
// strings, aria, rAF loop, IntersectionObserver, prefers-reduced-motion and
// slider persistence unchanged. Only wrappers added: module imports/exports
// plus dependency injection (see mountWaveTab). Seam: Logger/UI vitrine region (wave only).
import { Storage, defaultWaveConfig, WAVE_TYPES } from './storage.js';
import { createWaveRenderer, STARTERS, starterById, randomStack, WAVE_FA } from './wave.js';
import { Logger } from './logger.js';
import { Audio } from './audio.js';

const $ = s => document.getElementById(s);

// --- injected app.js collaborators (assigned once in mountWaveTab) ---
// els is the shared element map built in app.js (waveKillApply reads
// panelWave/modal through it). getMainWave is a live getter over the
// app.js-owned mainWave renderer (a snapshot would go stale: mainWaveInit runs
// at file end); syncRecStrip re-asserts strip borders from app.js.
let els = null;
let getMainWave = () => null;
let syncRecStrip = () => {};

// --- wave tab (ticket/50; seam: Storage.getWave/saveWave + wave renderer; main rec strip shares the stack via mainWaveSync) ---
let waveCfg = Storage.getWave();
let waveRenderer = null, waveInit = false, waveFakeOn = true;
// T3 (#109): global wave kill-switch reuses the persisted waveIdle flag (PR #113,
// read-only get/set — no storage.js change). waveIdle=true means animation allowed,
// so the «hide» checkbox is its inverse: checked → saveWaveIdle(false). Default
// visible (waveIdle absent → true), reduced-motion stays independent.
let waveHidden = !Storage.getWaveIdle();
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
// --- wave sliders T2/3 (ticket/52): ONE builder for globals + per-wave.
// Replaces the undiscoverable `min=-1` "follow global" dead-zone with an explicit
// «همگام با سراسری» toggle chip + a real 0–100 track. Value bubble, tick marks,
// double-click reset (def value; follow-sliders reset back to follow). Track fill
// via --p; track stays LTR, labels/bubbles inherit page RTL. Native <input range>
// keeps keyboard operation free; thumb transition off under reduced-motion (CSS).
const waveGlobalPaints = [];
let waveListPaints = [];
function waveSlider(mount, o){
  // o: {label, min, max, step, unit, def, scope:'global'|'local',
  //     get:()=>number|null, set:(v:number|null)=>void,
  //     follow?: {globalVal:()=>number}|null, onChange:()=>void}
  mount.classList.add('wslider', o.scope === 'global' ? 'wslider-global' : 'wslider-local');
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
  let rg = o.reuseInput || document.createElement('input');
  rg.type = 'range';
  rg.min = String(o.min); rg.max = String(o.max); rg.step = String(o.step);
  rg.dir = 'ltr';
  rg.setAttribute('aria-label', o.label);
  if (rg.id && (o.scope === 'global')) bb.id = rg.id + '-val'; // keep waveSync txt() targets working
  const ticks = document.createElement('div');
  ticks.className = 'wslider-ticks'; ticks.setAttribute('aria-hidden', 'true');
  for (let i = 0; i < 5; i++) ticks.appendChild(document.createElement('i'));
  track.append(rg, ticks);
  mount.append(head, track);
  let chip = null;
  if (o.follow) {
    chip = document.createElement('button');
    chip.type = 'button'; chip.className = 'wslider-follow';
    chip.textContent = 'همگام با سراسری';
    chip.setAttribute('aria-label', o.label + ' — همگام با سراسری');
    chip.title = 'روشن = مقدار سراسری؛ خاموش = مقدار دستی این موج';
    mount.appendChild(chip);
  }
  const shownVal = () => {
    const v = o.get();
    return (o.follow && v == null) ? o.follow.globalVal() : v;
  };
  const paint = () => {
    const v = o.get();
    const following = !!(o.follow && v == null);
    const sv = following ? o.follow.globalVal() : v;
    rg.value = String(sv);
    rg.disabled = following;
    rg.title = following ? 'همگام با سراسری — برای دستی شدن چیپ را بزن' : 'دابل‌کلیک = بازنشانی';
    const pct = (sv - o.min) / Math.max(1e-9, (o.max - o.min)) * 100;
    rg.style.setProperty('--p', pct.toFixed(1) + '%');
    bb.textContent = following ? `همگام با سراسری (${sv}${o.unit})` : `${sv}${o.unit}`;
    mount.classList.toggle('is-follow', following);
    if (chip) chip.setAttribute('aria-pressed', String(following));
  };
  rg.addEventListener('input', () => { o.set(+rg.value); paint(); o.onChange(); });
  rg.addEventListener('dblclick', () => {
    o.set(o.follow ? null : o.def);
    paint(); o.onChange();
  });
  if (chip) chip.addEventListener('click', e => {
    e.preventDefault(); e.stopPropagation();
    const v = o.get();
    o.set((o.follow && v == null) ? o.follow.globalVal() : null);
    paint(); o.onChange();
  });
  paint();
  (o.scope === 'global' ? waveGlobalPaints : waveListPaints).push(paint);
  return { el: mount, paint };
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
// --- live starter previews T3/3 (ticket/53): tiny canvases reusing createWaveRenderer,
// driven by ONE shared rAF (~16fps), paused via IntersectionObserver + tab-hidden.
// T1 discipline: starter `waves` are static preset defs (pinned per build), but every
// tick re-reads the LIVE waveCfg globals — thumbs never desync like mute did.
// prefers-reduced-motion → static renderOnce() frame, no loop.
let waveStarterLive = { raf: 0, last: 0, items: [], io: null };
function waveStarterLoop(now) {
  waveStarterLive.raf = 0;
  if (document.hidden) return; // zero CPU while hidden — resumed by waveStarterVis
  if (now - waveStarterLive.last >= 60) {
    waveStarterLive.last = now;
    const stats = (window.__waveStarterStats = window.__waveStarterStats || { ticks: 0, draws: 0 });
    stats.ticks++;
    const cfg = waveCfg; // live config every tick (never a closed-over copy)
    for (const it of waveStarterLive.items) {
      if (!it.visible || !it.renderer) continue;
      try {
        it.renderer.setConfig({ ...cfg, waves: it.waves, starterId: it.id });
        it.renderer.renderFrame(now); // same wall clock for all → shared fake clock
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
  if (waveHidden) return; // T3 (#109): kill-switch — never resume starter loops while hidden
  if (waveStarterLive.items.length && !waveStarterLive.raf &&
    !matchMedia('(prefers-reduced-motion: reduce)').matches) {
    waveStarterLive.last = performance.now();
    waveStarterLive.raf = requestAnimationFrame(waveStarterLoop);
  }
}
function waveStarterPause() {
  // Modal closed / tab left: stop the loop + observer, keep DOM for cheap re-attach.
  if (waveStarterLive.raf) cancelAnimationFrame(waveStarterLive.raf);
  waveStarterLive.raf = 0;
  try { waveStarterLive.io?.disconnect(); } catch {}
  waveStarterLive.io = null;
  document.removeEventListener('visibilitychange', waveStarterVis);
  waveStarterLive.items = [];
}
function waveStarterAttach() {
  // Re-create renderers on the EXISTING canvases (after a pause) without DOM churn.
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
      if (reduced || waveHidden) { // T3 (#109): hidden → static thumb, no loop (reduced-motion untouched)
        renderer.setConfig({ ...waveCfg, waves, starterId: s.id });
        renderer.renderOnce();
      }
    } catch { renderer = null; }
    return { id: s.id, waves, renderer, cv: cvs[i], visible: true };
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
function waveRenderStarters(){
  const grid = $('wave-starters');
  if (!grid) return;
  // Cheap path (runs on EVERY waveSync incl. slider drags): grid built + loop alive
  // → just refresh active states, never touch canvases/renderers.
  if (grid.dataset.built === '1' && grid.children.length === STARTERS.length) {
    [...grid.children].forEach((b, i) => b.classList.toggle('active', STARTERS[i].id === waveCfg.starterId));
    if (!waveStarterLive.items.length) waveStarterAttach(); // resume after pause
    return;
  }
  waveStarterPause();
  grid.innerHTML = '';
  grid.dataset.built = '1';
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  STARTERS.forEach((s, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'wave-card' + (s.id === waveCfg.starterId ? ' active' : '');
    b.setAttribute('aria-label', `استارتر ${i + 1}: ${s.n} — ${s.d}`);
    const cv = document.createElement('canvas');
    cv.className = 'wave-thumb';
    cv.width = 240; cv.height = 96; // ~120×48 CSS px ×2 for DPR
    cv.setAttribute('aria-hidden', 'true');
    const t = document.createElement('b'); t.textContent = `${i + 1} — ${s.n}`;
    const d = document.createElement('span'); d.textContent = s.d;
    b.append(cv, t, d);
    b.addEventListener('click', () => waveApplyStarter(s.id, true));
    grid.appendChild(b);
  });
  waveStarterAttach();
}
function waveRenderList(){
  const list = $('wave-list');
  if (!list) return;
  list.innerHTML = '';
  waveListPaints = [];
  const alive = new Set(waveCfg.waves.map(w => w.id));
  [...waveOpenIds].forEach(id => { if (!alive.has(id)) waveOpenIds.delete(id); });
  [...waveAdvIds].forEach(id => { if (!alive.has(id)) waveAdvIds.delete(id); });
  waveCfg.waves.forEach((wv, idx) => {
    const row = document.createElement('div');
    row.className = 'wave-item' + (wv.mute ? ' muted' : '');
    const det = document.createElement('details');
    det.open = waveOpenIds.has(wv.id);
    // #109 T4: explicit chevron affordance — native summary marker stays hidden
    // (css), this button is the visible open/collapse control.
    const chev = document.createElement('button');
    chev.type = 'button'; chev.className = 'wave-chev'; chev.textContent = '▾';
    chev.title = 'باز/بسته';
    chev.setAttribute('aria-label', 'باز/بسته ' + waveName(wv, idx));
    chev.setAttribute('aria-expanded', String(det.open));
    chev.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); det.open = !det.open; });
    det.addEventListener('toggle', () => { det.open ? waveOpenIds.add(wv.id) : waveOpenIds.delete(wv.id); chev.setAttribute('aria-expanded', String(det.open)); });
    const sum = document.createElement('summary');
    const dot = document.createElement('span');
    dot.className = 'wave-dot';
    dot.style.background = wv.colorMode === 'rainbow' ? 'conic-gradient(red,orange,yellow,green,blue,violet,red)' : wv.c1;
    const title = document.createElement('span');
    title.className = 'wave-title' + (wv.mute ? ' dim' : '');
    const paintTitle = () => {
      title.textContent = `${waveName(wv, idx)} — ${WAVE_FA.types[wv.type]} · ${WAVE_FA.colorModes[wv.colorMode]} · ${WAVE_FA.profiles[wv.profile || 'flat']}${wv.mute ? ' · بی‌صدا' : ''}`;
      title.title = wv.mute ? 'بی‌صدا — برای فعال‌سازی روی 🔊 بزن' : 'برای باز/بسته کلیک کن؛ تغییر نام با ✎';
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
      inp.addEventListener('keydown', ev => { ev.stopPropagation(); if (ev.key === 'Enter'){ ev.preventDefault(); commit(true); } else if (ev.key === 'Escape'){ ev.preventDefault(); commit(false); } }); // consume: rename owns Enter/Esc (ticket/2x)
      inp.addEventListener('blur', () => commit(true));
    };
    // #109 T4: title tap toggles open/collapse ONLY — never starts rename.
    // preventDefault avoids the native summary double-toggle; det.open flips once.
    title.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); det.open = !det.open; });
    rn.addEventListener('click', startRename);
    const tag = document.createElement('span');
    tag.className = 'wave-tag' + (idx === 0 ? ' front' : '');
    tag.textContent = idx === 0 ? 'بالا · رو/جلو' : (idx === waveCfg.waves.length - 1 ? 'پایین · پشت/زیر' : 'میانی');
    const tools = document.createElement('span');
    tools.className = 'wave-tools';
    const up = document.createElement('button'); up.type = 'button'; up.textContent = '↑'; up.title = 'انتقال به رو (جلوتر)'; up.setAttribute('aria-label', 'انتقال به رو ' + waveName(wv, idx)); up.disabled = idx === 0;
    up.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); [waveCfg.waves[idx - 1], waveCfg.waves[idx]] = [waveCfg.waves[idx], waveCfg.waves[idx - 1]]; wavePersist(); waveRenderList(); });
    const dn = document.createElement('button'); dn.type = 'button'; dn.textContent = '↓'; dn.title = 'انتقال به پشت (عقب‌تر)'; dn.setAttribute('aria-label', 'انتقال به پشت ' + waveName(wv, idx)); dn.disabled = idx === waveCfg.waves.length - 1;
    dn.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); [waveCfg.waves[idx + 1], waveCfg.waves[idx]] = [waveCfg.waves[idx], waveCfg.waves[idx + 1]]; wavePersist(); waveRenderList(); });
    const del = document.createElement('button'); del.type = 'button'; del.textContent = '✕'; del.title = 'حذف'; del.setAttribute('aria-label', 'حذف ' + waveName(wv, idx)); del.disabled = waveCfg.waves.length <= 1;
    del.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); waveOpenIds.delete(wv.id); waveAdvIds.delete(wv.id); waveCfg.waves.splice(idx, 1); wavePersist(); waveRenderList(); });
    tools.append(up, dn, del);
    sum.append(chev, dot, title, rn, muteBtn, tag, tools);
    det.appendChild(sum);
    const body = document.createElement('div');
    body.className = 'wave-body';
    const rType = document.createElement('div');
    const tLab = document.createElement('div'); tLab.className = 'wave-ctrl-label'; tLab.textContent = 'نوع موج';
    const segT = document.createElement('div'); segT.className = 'wave-seg';
    waveSeg(segT, WAVE_TYPES, wv.type, WAVE_FA.types, v => { wv.type = v; wavePersist(); waveRenderList(); });
    rType.append(tLab, segT);
    body.appendChild(rType);
    // T3/3 bars EQ options: shape seg + count/gap sliders, only for bars waves.
    // Same pattern as sibling segs: mutate + persist + re-render (fresh objects after).
    if (wv.type === 'bars') {
      const rBar = document.createElement('div');
      rBar.dataset.hygiene = 'bar-opts';
      const sLab = document.createElement('div'); sLab.className = 'wave-ctrl-label'; sLab.textContent = 'شکل ستون‌ها';
      const segS = document.createElement('div'); segS.className = 'wave-seg';
      waveSeg(segS, ['rounded', 'square', 'needle'], wv.barShape || 'rounded', WAVE_FA.barShapes, v => { wv.barShape = v; wavePersist(); waveRenderList(); });
      rBar.append(sLab, segS);
      body.appendChild(rBar);
      [['barCount', 'تعداد ستون‌ها', 8, 48, 24], ['barGap', 'فاصله ستون‌ها', 0, 8, 2]].forEach(([k, fa, mn, mx, df]) => {
        const mount = document.createElement('div');
        mount.dataset.hygiene = k;
        body.appendChild(mount);
        waveSlider(mount, { label: fa, min: mn, max: mx, step: '1', unit: '', def: df, scope: 'local',
          get: () => (wv[k] ?? df), set: v => { wv[k] = v; }, onChange: () => wavePersist() });
      });
    }
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
    // T2 dead-setting hygiene (#109): `thick` is never read in drawBars (wave.js) —
    // hide it on bars waves; it stays for the 6 line types.
    [['opacity', 'شفافیت (مطلق هر موج)', 0, 100, '1', '٪', 100], ['glow', 'درخشش (مطلق هر موج)', 0, 100, '1', '٪', 70], ...(wv.type === 'bars' ? [] : [['thick', 'ضخامت (مطلق هر موج)', 1, 6, '0.5', '', 2]])].forEach(([k, fa, mn, mx, st, u, df]) => {
      const mount = document.createElement('div');
      mount.dataset.hygiene = k;
      body.appendChild(mount);
      waveSlider(mount, { label: fa, min: mn, max: mx, step: st, unit: u, def: df, scope: 'local',
        get: () => wv[k], set: v => { wv[k] = v; }, onChange: () => wavePersist() });
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
      rC2.dataset.hygiene = 'c2-row';
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
    const ovLab = document.createElement('div'); ovLab.className = 'wave-ctrl-label'; ovLab.textContent = 'رونوشت هر موج — چیپ «همگام با سراسری» = همان مقدار سراسری';
    adv.appendChild(ovLab);
    // T2 dead-setting hygiene (#109): per-wave ov.sensitivity only scales the preview
    // gain in shown() (wave.js:182) — it never gates open/close like the global
    // sensMap does. Labelled honestly (label, not gate: zero behavior risk).
    [['speed', 'سرعت این موج'], ['intensity', 'شدت این موج'], ['attack', 'سرعت پاسخ این موج (اتک)'], ['smooth', 'نرمی این موج (رهایی)'], ['sensitivity', 'حساسیت این موج (گین پیش‌نمایش — گیت را عوض نمی‌کند)']].forEach(([key, label]) => {
      const mount = document.createElement('div');
      adv.appendChild(mount);
      waveSlider(mount, { label, min: 0, max: 100, step: '1', unit: '٪', def: 50, scope: 'local',
        get: () => wv.ov[key], set: v => { wv.ov[key] = v; },
        follow: { globalVal: () => waveCfg[key] }, onChange: () => wavePersist() });
    });
    body.appendChild(adv);
    det.appendChild(body);
    row.appendChild(det);
    list.appendChild(row);
  });
  const addBtn = $('wave-add');
  if (addBtn) addBtn.disabled = waveCfg.waves.length >= 5;
}
function waveSyncHue(){
  // T2 dead-setting hygiene (#109): aurora hue is dead while aurora is off
  // (early-return in wave.js drawAurora) — hide its slider unless aurora.on.
  const rg = $('wave-aurora-hue');
  const mount = rg?.closest('.wslider');
  if (mount) mount.hidden = !waveCfg.aurora.on;
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
  waveGlobalPaints.forEach(p => p());
  waveListPaints.forEach(p => p());
  waveSyncHue();
  txt('wave-count', waveCfg.waves.length + ' موج' + (waveCfg.waves.length >= 5 ? ' (سقف)' : ''));
  const nm = $('wave-name');
  if (nm) nm.textContent = `«${waveCfg.starterId === 'custom-dice' ? 'ترکیب تصادفی 🎲' : starterById(waveCfg.starterId).n}» — ${waveCfg.waves.length} موج`;
  const addBtn = $('wave-add');
  if (addBtn) addBtn.disabled = waveCfg.waves.length >= 5;
  const ft = $('wave-fake-toggle');
  if (ft) ft.textContent = waveFakeOn ? '⏺ مصنوعی: روشن' : '⏺ مصنوعی: خاموش';
  const hb = $('wave-hide');
  if (hb) hb.checked = waveHidden; // T3 (#109): persisted kill-switch (inverse of waveIdle)
  const mt = $('wave-mic-test');
  if (mt) mt.textContent = waveMicStream ? '⏹ توقف میکروفون' : '🎤 تست با صدای من';
}
function waveEnsure(){
  if (waveInit) { waveFollowStart(); waveSync(); return; }
  waveInit = true;
  const waveGlobalKey = { 'wave-sens': 'sensitivity', 'wave-sens-mini': 'sensitivity', 'wave-atk': 'attack', 'wave-spd': 'speed', 'wave-int': 'intensity', 'wave-sm': 'smooth', 'wave-parts': 'particles' };
  document.querySelectorAll('#panel-wave .wslider-mount').forEach(m => {
    if (m.dataset.built) return;
    m.dataset.built = '1';
    const rg = m.querySelector('input[type=range]');
    const isHue = rg.id === 'wave-aurora-hue';
    const key = waveGlobalKey[rg.id];
    waveSlider(m, { label: m.dataset.label || rg.getAttribute('aria-label') || rg.id,
      min: +rg.min, max: +rg.max, step: rg.step || '1',
      unit: m.dataset.unit || '', def: +(m.dataset.def || 50), scope: 'global', reuseInput: rg,
      get: () => isHue ? waveCfg.aurora.hue : waveCfg[key],
      set: v => { if (isHue) waveCfg.aurora.hue = v; else waveCfg[key] = v; },
      onChange: () => wavePersist() });
  });
  const cv = $('wave-preview');
  waveRenderer = createWaveRenderer(cv);
  waveRenderer.setConfig(waveCfg);
  waveRenderer.setFakeEnabled(waveFakeOn);
  $('wave-aurora')?.addEventListener('change', e => { waveCfg.aurora.on = e.target.checked; wavePersist(); });
  $('wave-hide')?.addEventListener('change', e => { // T3 (#109): persisted kill-switch
    waveHidden = !!e.target.checked;
    try { Storage.saveWaveIdle(!waveHidden); } catch {}
    waveKillApply();
  });
  $('wave-add')?.addEventListener('click', () => {
    if (waveCfg.waves.length >= 5) return;
    const pal = ['#8ab4f8', '#5eead4', '#c4b5fd', '#f6b17a', '#f9a8d4'];
    waveCfg.starterId = waveCfg.starterId || 'custom';
    waveCfg.waves.push({
      id: `w${Date.now().toString(36)}`, name: `موج ${waveCfg.waves.length + 1}`, type: 'sine',
      colorMode: 'solid', c1: pal[waveCfg.waves.length % pal.length], c2: '#c4b5fd',
      opacity: 100, glow: 70, thick: 2, peaks: 'mid', band: 'rms', profile: 'flat', mute: false,
      barShape: 'rounded', barCount: 24, barGap: 2,
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
function wavePrevStart(){ try { if (!waveHidden) waveRenderer?.start(); } catch {} } // T3 (#109): hidden → no preview loop
function wavePrevStop(){ try { waveRenderer?.stop(); } catch {} }
// T3 (#109): global kill-switch — hides #rec-strip to 0 height and stops every
// wave loop (main strip + tab preview + starter thumbs). Reduced-motion is
// independent (its static-frame path is untouched); borders re-assert via syncRecStrip.
function waveKillApply(){
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
    // Re-enable: restore exactly the pre-existing loop states (wave.js itself
    // draws the static line under reduced-motion — no special-casing here).
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
// Thin state readers for app.js-owned call sites (mainWaveInit kill-switch
// check; settingsModal mic-active gate): live reads, never snapshots.
function isWaveHidden(){ return waveHidden; }
function isWaveMicActive(){ return !!waveMicStream || !!waveMicCtx; }

// Thin wiring entry: assigns injected collaborators. Returns the handles app.js
// still needs (settingsModal wiring + file-end kill-switch apply); everything
// else stays private.
export function mountWaveTab(deps){
  els = deps.els || els;
  getMainWave = deps.getMainWave || getMainWave;
  syncRecStrip = deps.syncRecStrip || syncRecStrip;
  return { waveEnsure, wavePrevStart, wavePrevStop, waveStarterPause, waveFollowStop, waveMicStop, waveSync, waveKillApply, isWaveHidden, isWaveMicActive };
}
