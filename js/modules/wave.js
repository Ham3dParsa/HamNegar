// Module: wave
// Interface: createWaveRenderer(canvas) -> { setConfig, setAnalyser, setFakeEnabled, start, stop, renderOnce }
//            + STARTERS (10 presets), randomStack(), WAVE_FA labels.
// Depth: hides standing-wave engine ported from approved prototypes (v4 behaviors + settings v3
// stack model): noise gate with hysteresis, perc loudness curve, near-still idle, standing waves
// only (PH0 fixed — no horizontal travel), thickness coupling, band drivers, spatial profiles,
// layered glow (no per-frame shadowBlur), DPR-aware rAF capped at ~60fps, reduced-motion static.
import { defaultWaveConfig } from './storage.js';

export const WAVE_FA = {
  types: { sine: 'سینوسی', 'mirror-sine': 'آینه‌ای', dash: 'خط‌چین', steps: 'پله‌ای', ribbon: 'نواری', 'flat-glow-line': 'خط تخت درخشان' },
  colorModes: { solid: 'تک‌رنگ', gradient: 'گرادیان عمودی', rainbow: 'رنگین‌کمان جاری' },
  bands: { low: 'بم', mid: 'میانی', high: 'زیر', rms: 'کل' },
  profiles: { flat: 'یکنواخت', center: 'مرکز-شدید', edges: 'لبه-شدید', bands: 'تفکیک باندی' },
  peaks: { low: 'کم', mid: 'متوسط', high: 'زیاد' },
};

const PEAK_CYC = { low: 1.5, mid: 3, high: 5.5 };
const PH0 = 0.6;
const FAKE_FLOOR = 0.06, FLOOR_MIN = 0.03, LOUD_REF = 0.7;
const IDLE_FRAC = 0.015;
let _wid = 0;
const nid = () => `w${Date.now().toString(36)}${(++_wid).toString(36)}`;

function W(o) {
  const w = {
    id: nid(), name: '', type: 'sine', colorMode: 'solid', c1: '#8ab4f8', c2: '#c4b5fd',
    opacity: 100, glow: 70, thick: 2, peaks: 'mid', band: 'rms', profile: 'flat', mute: false,
    ov: { speed: null, intensity: null, attack: null, smooth: null, sensitivity: null },
  };
  if (o) {
    const { ov, ...rest } = o;
    Object.assign(w, rest);
    if (ov) Object.assign(w.ov, ov);
  }
  return w;
}

export const STARTERS = [
  { id: 'classic-fade', n: 'محو کلاسیک', d: 'سینوس + محو؛ مبنای مقایسه.', stack: () => [W({ type: 'ribbon', c1: '#8ab4f8', opacity: 90, glow: 50, thick: 2, peaks: 'mid', band: 'rms' })] },
  { id: 'warm-presence', n: 'حضور گرم', d: 'تک‌موج گرم پرذره.', stack: () => [W({ type: 'sine', c1: '#f6b17a', opacity: 100, glow: 70, thick: 2, peaks: 'high', band: 'mid' })] },
  { id: 'perc-pop', n: 'ضربه‌ای', d: 'اتک تند؛ باند زیر.', stack: () => [W({ type: 'sine', c1: '#f9a8d4', opacity: 100, glow: 80, thick: 2, peaks: 'high', band: 'high' })] },
  { id: 'edge-whisper', n: 'زمزمه لبه', d: 'داش کم‌رنگ + سینوس.', stack: () => [W({ type: 'sine', c1: '#8ab4f8', opacity: 80, glow: 50, thick: 1.5, peaks: 'mid', band: 'rms' }), W({ type: 'dash', c1: '#e3ecfd', opacity: 50, glow: 30, thick: 1.5, peaks: 'mid', band: 'high' })] },
  { id: 'mirror-lake', n: 'دریاچه آینه‌ای', d: 'mirror-sine تکی.', stack: () => [W({ type: 'mirror-sine', c1: '#5eead4', opacity: 90, glow: 60, thick: 2, peaks: 'mid', band: 'low' })] },
  { id: 'aurora-wash', n: 'شفق زمینه', d: 'خط تخت درخشان + زمینه روشن.', stack: () => [W({ type: 'flat-glow-line', c1: '#c4b5fd', colorMode: 'gradient', c2: '#5eead4', opacity: 80, glow: 90, thick: 1.5, peaks: 'low', band: 'low' })], aurora: true },
  { id: 'dash-ticker', n: 'خط‌چین جاری', d: 'داش پررنگ + شبح سینوسی.', stack: () => [W({ type: 'dash', c1: '#8ab4f8', opacity: 100, glow: 70, thick: 2, peaks: 'mid', band: 'mid' }), W({ type: 'sine', c1: '#8ab4f8', opacity: 30, glow: 20, thick: 1, peaks: 'mid', band: 'rms' })] },
  { id: 'quantum-steps', n: 'پله‌های کوانتومی', d: 'پله + شبح.', stack: () => [W({ type: 'steps', c1: '#fde68a', opacity: 100, glow: 60, thick: 2, peaks: 'mid', band: 'mid' }), W({ type: 'sine', c1: '#fde68a', opacity: 25, glow: 20, thick: 1, peaks: 'mid', band: 'rms' })] },
  { id: 'ice-glow', n: 'درخشش یخی', d: 'گرادیان عمودی + گلو قوی.', stack: () => [W({ type: 'sine', colorMode: 'gradient', c1: '#bfe3ff', c2: '#8ab4f8', opacity: 100, glow: 100, thick: 2, peaks: 'mid', band: 'rms' })] },
  { id: 'heartbeat', n: 'نبض قلب', d: 'سینوس + ریبون رنگین‌کمانی.', stack: () => [W({ type: 'sine', c1: '#fca5a5', opacity: 100, glow: 60, thick: 2, peaks: 'high', band: 'mid' }), W({ type: 'ribbon', colorMode: 'rainbow', c1: '#fca5a5', opacity: 45, glow: 40, thick: 2, peaks: 'low', band: 'low' })] },
];
export const starterById = id => STARTERS.find(s => s.id === id) || STARTERS[0];

const FAMILIES = [['#8ab4f8', '#c4b5fd'], ['#5eead4', '#8ab4f8'], ['#f6b17a', '#f9a8d4'], ['#bfe3ff', '#5eead4'], ['#c4b5fd', '#f9a8d4'], ['#e3ecfd', '#8ab4f8']];
export function randomStack() {
  const fam = FAMILIES[Math.floor(Math.random() * FAMILIES.length)];
  const n = 1 + Math.floor(Math.random() * 3);
  const allowRainbow = Math.random() < 0.25;
  const types = ['sine', 'sine', 'mirror-sine', 'ribbon', 'dash', 'steps', 'flat-glow-line'];
  const bands = ['low', 'mid', 'high', 'rms'], pks = ['low', 'mid', 'mid', 'high'], profs = ['flat', 'flat', 'center', 'edges', 'bands'];
  const out = [];
  for (let i = 0; i < n; i++) {
    const cm = i === 0 && allowRainbow ? 'rainbow' : (Math.random() < 0.3 ? 'gradient' : 'solid');
    out.push(W({
      type: types[Math.floor(Math.random() * types.length)], colorMode: cm,
      c1: fam[i % fam.length], c2: fam[(i + 1) % fam.length],
      opacity: 60 + Math.floor(Math.random() * 41), glow: 30 + Math.floor(Math.random() * 51),
      thick: [1.5, 2, 2.5][Math.floor(Math.random() * 3)], peaks: pks[Math.floor(Math.random() * pks.length)],
      band: bands[Math.floor(Math.random() * bands.length)], profile: profs[Math.floor(Math.random() * profs.length)],
    }));
  }
  return out;
}

// --- math core ---
const sm = v => Math.min(1, Math.max(0, v));
function perc(x) { x = sm(x); return x <= 0 ? 0 : Math.min(1, Math.pow(x, 0.38) * (x < 0.3 ? 1.15 : 1.0)); }
function smoothE(e, tg, dt, a, r) { const k = tg > e ? a : r; return e + (tg - e) * (1 - Math.exp(-dt / Math.max(0.004, k))); }
function fakeRaw(t) {
  const s = t / 1000, CYC = 4.7, SPEAK = 3.2, EDGE = 0.15, cyc = s % CYC;
  let g = 1;
  if (cyc > SPEAK) { g = 0; const e = Math.min(cyc - SPEAK, CYC - cyc); if (e < EDGE) g = 0.5 - 0.5 * Math.cos(Math.PI * e / EDGE); }
  const b = 0.5 + 0.5 * Math.sin(2 * Math.PI * 0.22 * s) * Math.sin(2 * Math.PI * 0.11 * s + 1.3);
  const sy = 0.55 + 0.45 * Math.sin(2 * Math.PI * 2.7 * s + Math.sin(2 * Math.PI * 0.9 * s));
  const burst = Math.pow(Math.max(0, Math.sin(2 * Math.PI * 1.7 * s + 0.5) * Math.sin(2 * Math.PI * 0.63 * s)), 2) * 0.9;
  const pluck = Math.pow(Math.max(0, Math.sin(2 * Math.PI * 3.1 * s + 1.1)), 6) * 0.7;
  return sm((b * sy * 1.35 + burst + pluck) * 0.72) * g;
}
function hx(h) { return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]; }
function rgba(h, a) { const c = hx(h); return `rgba(${c[0]},${c[1]},${c[2]},${a})`; }
function sineY(x, Wd, H, A, cyc, ph) { return H / 2 + A * Math.sin(2 * Math.PI * cyc * x / Wd + ph) + A * 0.18 * Math.sin(4 * Math.PI * cyc * x / Wd + ph * 1.7); }
function profMul(p, u) {
  if (p === 'center') return 0.3 + 0.7 * Math.sin(Math.PI * Math.min(1, Math.max(0, u)));
  if (p === 'edges') return 0.3 + 0.7 * Math.abs(2 * u - 1);
  return 1;
}

export function createWaveRenderer(canvas) {
  const g = canvas.getContext('2d');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let cfg = defaultWaveConfig();
  let analyser = null;
  let micBuf = null;
  let fakeOn = true;
  let raf = 0;
  let last = 0;
  const t0 = performance.now();
  let gateOpen = false, env = 0, envFast = 0, envSlow = 0;
  const wSm = new Map();
  let Wd = 0, H = 0;

  const eff = (wv, k) => (wv.ov && wv.ov[k] != null ? wv.ov[k] : cfg[k]);
  const sensMap = () => { const k = cfg.sensitivity / 100; return { open: 2.6 - 1.5 * k, close: 2.2 - 1.5 * k, gain: 0.5 + 1.3 * k }; };
  const atkOf = v => { const k = (v == null ? cfg.attack : v) / 100; return 0.15 - 0.145 * k + 0.004; };
  const relOf = v => { const k = (v == null ? cfg.smooth : v) / 100; return 0.02 + 0.58 * k; };
  const ampOf = (HH, L, wv) => HH * IDLE_FRAC + HH * 0.52 * sm(L / (1 + 0.12 * L)) * (0.15 + 1.85 * (eff(wv, 'intensity') / 100));

  function fit() {
    const d = Math.min(devicePixelRatio || 1, 2);
    const r = canvas.getBoundingClientRect();
    Wd = Math.max(2, r.width); H = Math.max(2, r.height);
    canvas.width = Math.max(2, Math.round(Wd * d));
    canvas.height = Math.max(2, Math.round(H * d));
    g.setTransform(d, 0, 0, d, 0, 0);
  }

  function stepLevel(t, dt) {
    let tg = 0;
    if (analyser) {
      if (!micBuf || micBuf.length !== analyser.fftSize) micBuf = new Float32Array(analyser.fftSize);
      analyser.getFloatTimeDomainData(micBuf);
      let sum = 0;
      for (let i = 0; i < micBuf.length; i++) sum += micBuf[i] * micBuf[i];
      const mm = sensMap();
      const raw = Math.sqrt(sum / micBuf.length) / 0.22 * 1.4 * mm.gain;
      const o = Math.max(FLOOR_MIN, FAKE_FLOOR * mm.open), c = Math.max(FLOOR_MIN, FAKE_FLOOR * mm.close);
      gateOpen = gateOpen ? (raw >= c) : (raw > o); // floor frozen while open (fixed-floor hysteresis)
      tg = gateOpen ? perc(sm((raw - c) / Math.max(0.05, LOUD_REF - c))) : 0;
    } else if (fakeOn && !reduced) {
      const mm = sensMap(), raw = fakeRaw(t) * mm.gain;
      const o = Math.max(FLOOR_MIN, FAKE_FLOOR * mm.open), c = Math.max(FLOOR_MIN, FAKE_FLOOR * mm.close);
      gateOpen = gateOpen ? (raw >= c) : (raw > o);
      tg = gateOpen ? perc(sm((raw - c) / Math.max(0.05, LOUD_REF - c))) : 0;
    } else gateOpen = false;
    const a = atkOf(null), r = relOf(null);
    env = smoothE(env, tg, dt, a, r);
    envFast = smoothE(envFast, tg, dt, Math.max(0.004, a * 0.5), Math.max(0.01, r * 0.6));
    envSlow = smoothE(envSlow, tg, dt, a * 2, r * 2.4);
    return env;
  }

  function bandLevels() {
    if (!analyser) {
      return { low: sm(envSlow), mid: sm(env), high: sm(envFast), rms: sm((env + envFast + envSlow) / 3) };
    }
    // Mic spectrum shape × gated level: silence → 0 (stillness), speech → opens.
    const n = analyser.frequencyBinCount;
    const buf = new Uint8Array(n);
    analyser.getByteFrequencyData(buf);
    const q1 = Math.floor(n * 0.15), q2 = Math.floor(n * 0.45);
    let l = 0, m = 0, h = 0;
    for (let i = 1; i < q1; i++) { const v = buf[i] / 255; l += v * v; }
    for (let i = q1; i < q2; i++) { const v = buf[i] / 255; m += v * v; }
    for (let i = q2; i < n; i++) { const v = buf[i] / 255; h += v * v; }
    l = sm((Math.sqrt(l / Math.max(1, q1 - 1)) - 0.02) / 0.2);
    m = sm((Math.sqrt(m / Math.max(1, q2 - q1)) - 0.02) / 0.2);
    h = sm((Math.sqrt(h / Math.max(1, n - q2)) - 0.015) / 0.18);
    const gate = sm(env / 0.12);
    return { low: l * gate, mid: m * gate, high: h * gate, rms: sm(env) };
  }

  function shown(wv, band, raw, dt) {
    const key = `${wv.id}:${band}`;
    const gain = wv.ov && wv.ov.sensitivity != null ? 0.4 + 1.2 * (wv.ov.sensitivity / 100) : 1;
    const tgt = sm(raw * gain);
    const prev = wSm.has(key) ? wSm.get(key) : tgt;
    const nx = dt > 0 ? smoothE(prev, tgt, dt, atkOf(eff(wv, 'attack')), relOf(eff(wv, 'smooth'))) : tgt;
    wSm.set(key, nx);
    return nx;
  }

  function ampAt(x, bl, wv) {
    const u = Wd > 0 ? x / Wd : 0;
    if ((wv.profile || 'flat') === 'bands') {
      const Al = ampOf(H, bl.low, wv), Am = ampOf(H, bl.mid, wv), Ah = ampOf(H, bl.high, wv);
      if (u < 0.5) { const k = u * 2; return Al * (1 - k) + Am * k; }
      const k = (u - 0.5) * 2; return Am * (1 - k) + Ah * k;
    }
    return ampOf(H, bl[wv.band] ?? bl.rms, wv) * profMul(wv.profile || 'flat', u);
  }

  function strokeFor(wv, t) {
    if (wv.colorMode === 'gradient') {
      const gr = g.createLinearGradient(0, H / 2 - 30, 0, H / 2 + 30);
      gr.addColorStop(0, wv.c1); gr.addColorStop(1, wv.c2);
      return gr;
    }
    if (wv.colorMode === 'rainbow') {
      const rate = 0.1 + 3.0 * (eff(wv, 'speed') / 100);
      const gr = g.createLinearGradient(0, 0, Wd, 0), flow = (t / 1000) * 40 * rate;
      for (let k = 0; k <= 6; k++) gr.addColorStop(k / 6, `hsl(${((flow + k * 60) % 360).toFixed(0)} 90% 65%)`);
      return gr;
    }
    return wv.c1;
  }
  function halo(p, w, colorCss, alpha) {
    if (alpha <= 0) return;
    g.save();
    g.globalCompositeOperation = 'lighter';
    g.lineWidth = w; g.strokeStyle = colorCss; g.globalAlpha = sm(alpha); g.lineCap = 'round';
    g.stroke(p);
    g.restore();
  }
  function basePathP(ampFn, cyc) {
    const p = new Path2D(), N = Math.max(64, Math.floor(Wd / 2));
    for (let i = 0; i <= N; i++) {
      const x = i / N * Wd;
      const y = sineY(x, Wd, H, ampFn(x), cyc, PH0); // standing: PH0 fixed, never travels
      i ? p.lineTo(x, y) : p.moveTo(x, y);
    }
    return p;
  }

  function drawWave(t, wv, bl) {
    if (wv.mute || wv.opacity <= 0) return;
    const cyc = PEAK_CYC[wv.peaks] || 3;
    const rate = 0.1 + 3.0 * (eff(wv, 'speed') / 100);
    const s = t / 1000;
    const wob = 0.7 + 0.3 * Math.sin(2 * Math.PI * 0.9 * rate * s + 0.7) * Math.sin(2 * Math.PI * 1.3 * rate * s);
    const ampFn = x => {
      let a = ampAt(x, bl, wv);
      if (wv.type === 'flat-glow-line') a = Math.max(a * 0.15, 1.5);
      return a * wob; // vertical pulsation only
    };
    const col = strokeFor(wv, t);
    const colSolid = wv.colorMode === 'rainbow' ? '#9adcff' : wv.c1;
    const lwBase = +wv.thick || 2;
    const op = wv.opacity / 100, gl = wv.glow / 100;
    const avgL = bl[wv.band] ?? bl.rms;
    const thick = lwBase + 1.2 * sm(avgL); // thickness coupling
    if (wv.type === 'ribbon') {
      const p = basePathP(ampFn, cyc);
      const baseA = ampOf(H, avgL, wv);
      const gr = g.createLinearGradient(0, H / 2 - baseA, 0, H / 2 + baseA + 14);
      gr.addColorStop(0, wv.colorMode === 'gradient' ? wv.c2 : rgba(colSolid, 0.35));
      gr.addColorStop(1, 'rgba(0,0,0,0)');
      const f2 = new Path2D(p);
      f2.lineTo(Wd, H); f2.lineTo(0, H); f2.closePath();
      g.save(); g.globalAlpha = op * 0.8; g.fillStyle = wv.colorMode === 'rainbow' ? col : gr; g.fill(f2); g.restore();
    }
    let p;
    if (wv.type === 'steps') {
      p = new Path2D();
      const N = Math.max(64, Math.floor(Wd / 2)), st = ampOf(H, avgL, wv) / 4 + 0.5;
      for (let i = 0; i <= N; i++) {
        const x = i / N * Wd;
        let y = sineY(x, Wd, H, ampFn(x), cyc, PH0);
        y = H / 2 + Math.round((y - H / 2) / st) * st;
        i ? p.lineTo(x, y) : p.moveTo(x, y);
      }
    } else p = basePathP(ampFn, cyc);
    g.save(); g.globalAlpha = op;
    if (gl > 0) { halo(p, thick + 4 + gl * 14, col, 0.35 * gl); halo(p, thick + 2 + gl * 6, col, 0.22 * gl); }
    if (wv.type === 'dash') {
      g.save(); g.setLineDash([8, 7]); g.lineWidth = thick; g.strokeStyle = col; g.lineCap = 'round'; g.stroke(p); g.restore();
    } else {
      g.lineWidth = thick; g.strokeStyle = col; g.lineCap = 'round';
      g.lineJoin = wv.type === 'steps' ? 'miter' : 'round';
      g.stroke(p);
    }
    if (wv.type === 'mirror-sine') {
      g.save(); g.globalAlpha = op * 0.3; g.lineWidth = Math.max(1, thick - 0.5); g.strokeStyle = col;
      g.stroke(basePathP(x => ampFn(x) * 0.3, cyc)); g.restore();
    }
    g.restore();
  }

  const PARTS = Array.from({ length: 24 }, (_, i) => ({ u: (i + 0.5) / 24, sz: 1 + (i % 2), al: 0.22 + 0.28 * ((i * 53 % 10) / 10), j: (i * 7919 % 100) / 100 * 6.283 }));
  function drawParts(t, top) {
    const n = Math.min(cfg.particles, 24);
    if (n <= 0 || !top) return;
    const rate = 0.1 + 3.0 * (cfg.speed / 100);
    const A = ampOf(H, sm(env), top);
    const col = top.colorMode === 'rainbow' ? '#9adcff' : top.c1;
    for (let i = 0; i < n; i++) {
      const q = PARTS[i], x = q.u * Wd;
      const y = sineY(x, Wd, H, A, 3, PH0) + Math.sin(t / 700 * rate + q.j) * (0.6 + A * 0.12);
      g.fillStyle = rgba(col, +q.al.toFixed(2));
      g.beginPath(); g.arc(x, y, q.sz, 0, 7); g.fill();
    }
  }
  function drawAurora() {
    if (!cfg.aurora?.on) return;
    const a = 0.05 + 0.14 * sm(envSlow);
    const gr = g.createLinearGradient(0, 0, 0, H);
    gr.addColorStop(0, `hsla(${cfg.aurora.hue} 80% 60% / ${a.toFixed(3)})`);
    gr.addColorStop(1, `hsla(280 60% 70% / ${a.toFixed(3)})`);
    g.fillStyle = gr; g.fillRect(0, 0, Wd, H);
  }

  function drawStack(t, dt, bl0) {
    drawAurora();
    const bl = bl0 || { low: 0, mid: 0, high: 0, rms: 0 };
    const vis = cfg.waves.filter(w => !w.mute);
    if (dt > 0) vis.forEach(wv => { ['low', 'mid', 'high', 'rms'].forEach(b => shown(wv, b, bl[b] ?? bl.rms, dt)); });
    const smBl = wv => ({ low: shown(wv, 'low', bl.low, 0), mid: shown(wv, 'mid', bl.mid, 0), high: shown(wv, 'high', bl.high, 0), rms: shown(wv, 'rms', bl.rms, 0) });
    // list TOP = front: draw back-to-front so index 0 lands on top.
    for (let i = vis.length - 1; i >= 0; i--) drawWave(t, vis[i], smBl(vis[i]));
    const top = vis[0];
    if (top) drawParts(t, top);
  }

  function frame(now) {
    if (!raf) return;
    // Cap at ~60fps: skip frames arriving <16ms after the previous one.
    if (now - last < 15) { raf = requestAnimationFrame(frame); return; }
    const dt = Math.min(0.05, (now - last) / 1000 || 0.016);
    last = now;
    const t = reduced ? 0 : now - t0;
    const r = canvas.getBoundingClientRect();
    if (Math.abs(r.width - Wd) > 1 || Math.abs(r.height - H) > 1) fit();
    g.clearRect(0, 0, Wd, H);
    if (reduced) {
      // Static line: no animation, no fake/mic levels.
      g.fillStyle = '#333439';
      g.fillRect(0, H / 2 - 1, Wd, 2);
      raf = requestAnimationFrame(frame);
      return;
    }
    stepLevel(t, dt);
    drawStack(t, dt, bandLevels());
    raf = requestAnimationFrame(frame);
  }

  fit();
  return {
    setConfig(c) {
      cfg = c;
      const alive = new Set(c.waves.map(w => w.id));
      [...wSm.keys()].forEach(k => { if (!alive.has(String(k).split(':')[0])) wSm.delete(k); });
    },
    setAnalyser(node) {
      analyser = node || null;
      micBuf = null;
    },
    setFakeEnabled(on) { fakeOn = !!on; },
    getLevel() { return sm(env); },
    start() { if (!raf) { last = performance.now(); raf = requestAnimationFrame(frame); } },
    stop() { if (raf) cancelAnimationFrame(raf); raf = 0; },
    renderOnce() {
      fit();
      g.clearRect(0, 0, Wd, H);
      const bl = { low: 0.4, mid: 0.55, high: 0.45, rms: 0.5 };
      cfg.waves.filter(w => !w.mute).forEach(wv => { ['low', 'mid', 'high', 'rms'].forEach(b => wSm.set(`${wv.id}:${b}`, bl[b])); });
      drawStack(1200, 0, bl);
    },
  };
}
