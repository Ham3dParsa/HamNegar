// Module: wave
// Interface: createWaveRenderer(canvas) -> { setConfig, setAnalyser, setFakeEnabled, start, stop, renderOnce }
//            + STARTERS (11 presets, incl. eq-bars), randomStack(), WAVE_FA labels.
// Depth: hides standing-wave engine ported from approved prototypes (v4 behaviors + settings v3
// stack model): noise gate with hysteresis, perc loudness curve, near-still idle, standing waves
// only (PH0 fixed — no horizontal travel), thickness coupling, band drivers, spatial profiles,
// layered glow (no per-frame shadowBlur), DPR-aware rAF capped at ~60fps, reduced-motion static.
import { defaultWaveConfig } from './storage.js';

export const WAVE_FA = {
  types: { sine: 'سینوسی', 'mirror-sine': 'آینه‌ای', dash: 'خط‌چین', steps: 'پله‌ای', ribbon: 'نواری', 'flat-glow-line': 'خط تخت درخشان', bars: 'ستون‌ها (اکولایزر)' },
  colorModes: { solid: 'تک‌رنگ', gradient: 'گرادیان عمودی', rainbow: 'رنگین‌کمان جاری' },
  bands: { low: 'بم', mid: 'میانی', high: 'زیر', rms: 'کل' },
  profiles: { flat: 'یکنواخت', center: 'مرکز-شدید', edges: 'لبه-شدید', bands: 'تفکیک باندی' },
  peaks: { low: 'کم', mid: 'متوسط', high: 'زیاد' },
  barShapes: { rounded: 'گرد', square: 'مربع', needle: 'سوزنی' },
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
    barShape: 'rounded', barCount: 24, barGap: 2,
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
  { id: 'eq-bars', n: 'اکولایزر ستونی', d: 'ستون‌های گرد؛ تفکیک باندی.', stack: () => [W({ type: 'bars', colorMode: 'gradient', c1: '#5eead4', c2: '#8ab4f8', opacity: 100, glow: 70, thick: 2, peaks: 'mid', band: 'rms', profile: 'bands', barShape: 'rounded', barCount: 24, barGap: 2 })] },
];
export const starterById = id => STARTERS.find(s => s.id === id) || STARTERS[0];

const FAMILIES = [['#8ab4f8', '#c4b5fd'], ['#5eead4', '#8ab4f8'], ['#f6b17a', '#f9a8d4'], ['#bfe3ff', '#5eead4'], ['#c4b5fd', '#f9a8d4'], ['#e3ecfd', '#8ab4f8']];
export function randomStack() {
  const fam = FAMILIES[Math.floor(Math.random() * FAMILIES.length)];
  const n = 1 + Math.floor(Math.random() * 3);
  const allowRainbow = Math.random() < 0.25;
  const types = ['sine', 'sine', 'mirror-sine', 'ribbon', 'dash', 'steps', 'flat-glow-line', 'bars'];
  const barShapes = ['rounded', 'rounded', 'square', 'needle'];
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
      barShape: barShapes[Math.floor(Math.random() * barShapes.length)],
      barCount: 12 + Math.floor(Math.random() * 21), barGap: 1 + Math.floor(Math.random() * 3),
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

const rgbCache = new Map();
function parseHex(h) {
  if (typeof h !== 'string') return { r: 138, g: 180, b: 248 };
  let c = rgbCache.get(h);
  if (c) return c;
  if (h.length === 7 && h[0] === '#') {
    c = {
      r: parseInt(h.slice(1, 3), 16) || 0,
      g: parseInt(h.slice(3, 5), 16) || 0,
      b: parseInt(h.slice(5, 7), 16) || 0,
    };
  } else {
    c = { r: 138, g: 180, b: 248 };
  }
  rgbCache.set(h, c);
  return c;
}
function rgba(h, a) {
  const c = parseHex(h);
  return `rgba(${c.r},${c.g},${c.b},${a})`;
}
function hslToRgb(hDeg, sPct, lPct) {
  const h = (((hDeg % 360) + 360) % 360) / 360;
  const s = sPct / 100, l = lPct / 100;
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const hue2rgb = t => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return {
    r: Math.round(hue2rgb(h + 1 / 3) * 255),
    g: Math.round(hue2rgb(h) * 255),
    b: Math.round(hue2rgb(h - 1 / 3) * 255),
  };
}
function sineY(x, Wd, H, A, cyc, ph) {
  return H / 2 + A * Math.sin(2 * Math.PI * cyc * x / Wd + ph) + A * 0.18 * Math.sin(4 * Math.PI * cyc * x / Wd + ph * 1.7);
}
function profMul(p, u) {
  if (p === 'center') return 0.3 + 0.7 * Math.sin(Math.PI * Math.min(1, Math.max(0, u)));
  if (p === 'edges') return 0.3 + 0.7 * Math.abs(2 * u - 1);
  return 1;
}
const BAND_IDX = { low: 0, mid: 1, high: 2, rms: 3 };
const BAND_LIST = ['low', 'mid', 'high', 'rms'];

export function createWaveRenderer(canvas) {
  const g = canvas.getContext('2d');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let cfg = defaultWaveConfig();
  let analyser = null;
  let micBuf = null;
  let freqBuf = null;
  let fakeOn = true;
  let stripState = 'idle'; // 'idle' | 'recording' | 'paused' | 'transcribing'
  let raf = 0;
  let active = false;
  let last = 0;
  let lastF = 0;
  const t0 = performance.now();
  let gateOpen = false, env = 0, envFast = 0, envSlow = 0;
  // Per-wave numeric smoothing buffers [low, mid, high, rms] — zero string allocation per frame
  const wSm = new Map();
  const gradCache = new Map();
  // Reusable geometry buffers (avoid Path2D + GC churn per frame)
  let yBuf = new Float32Array(256);
  let yMirrorBuf = new Float32Array(256);
  let barGeoX = new Float32Array(48);
  let barGeoY = new Float32Array(48);
  let barGeoH = new Float32Array(48);
  const blReusable = { low: 0, mid: 0, high: 0, rms: 0 };
  const smBlReusable = { low: 0, mid: 0, high: 0, rms: 0 };
  let auroraRgb = hslToRgb(220, 80, 60);
  let Wd = 0, H = 0;

  const eff = (wv, k) => (wv.ov && wv.ov[k] != null ? wv.ov[k] : cfg[k]);
  const sensMap = () => { const k = cfg.sensitivity / 100; return { open: 2.6 - 1.5 * k, close: 2.2 - 1.5 * k, gain: 0.5 + 1.3 * k }; };
  const atkOf = v => { const k = (v == null ? cfg.attack : v) / 100; return 0.15 - 0.145 * k + 0.004; };
  const relOf = v => { const k = (v == null ? cfg.smooth : v) / 100; return 0.02 + 0.58 * k; };
  const ampOf = (HH, L, wv) => HH * IDLE_FRAC + HH * 0.40 * sm(L / (1 + 0.12 * L)) * (0.15 + 1.85 * (eff(wv, 'intensity') / 100));

  function ensureYBuf(need) {
    if (yBuf.length < need) {
      yBuf = new Float32Array(need + 32);
      yMirrorBuf = new Float32Array(need + 32);
    }
  }

  function warmColorCache() {
    if (cfg?.aurora?.hue != null) auroraRgb = hslToRgb(cfg.aurora.hue, 80, 60);
    for (const wv of (cfg?.waves || [])) {
      if (wv.c1) parseHex(wv.c1);
      if (wv.c2) parseHex(wv.c2);
    }
  }
  warmColorCache();

  function fit(nextW, nextH) {
    const d = Math.min(devicePixelRatio || 1, 2);
    let w = nextW, h = nextH;
    if (w == null || h == null) {
      const r = canvas.getBoundingClientRect();
      w = r.width;
      h = r.height;
    }
    const nw = Math.max(2, w || canvas.clientWidth || 2);
    const nh = Math.max(2, h || canvas.clientHeight || 2);
    const targetCw = Math.round(nw * d);
    const targetCh = Math.round(nh * d);
    if (Math.abs(nw - Wd) <= 0.5 && Math.abs(nh - H) <= 0.5 && canvas.width === targetCw && canvas.height === targetCh) return;
    Wd = nw; H = nh;
    canvas.width = Math.max(2, targetCw);
    canvas.height = Math.max(2, targetCh);
    g.setTransform(d, 0, 0, d, 0, 0);
    gradCache.clear();
  }

  function drawStaticLine(colorCss = 'rgba(255,255,255,0.14)') {
    if (Wd <= 2 || H <= 2) fit();
    g.clearRect(0, 0, Wd, H);
    g.fillStyle = colorCss;
    g.fillRect(0, H / 2 - 1, Wd, 2);
  }

  function drawPausedState(t) {
    if (Wd <= 2 || H <= 2) fit();
    g.clearRect(0, 0, Wd, H);
    if (reduced) {
      drawStaticLine('rgba(229, 160, 13, 0.55)');
      return;
    }
    const s = t / 1000;
    const breath = 0.55 + 0.45 * Math.sin(s * 2.1);
    const N = Math.max(48, Math.floor(Wd / 3));
    g.beginPath();
    for (let i = 0; i <= N; i++) {
      const u = i / N;
      const x = u * Wd;
      const envEnv = Math.sin(Math.PI * u);
      const y = H / 2 + Math.sin(u * Math.PI * 5 + 0.6) * (1.8 + 1.4 * breath) * envEnv;
      i ? g.lineTo(x, y) : g.moveTo(x, y);
    }
    g.lineCap = 'round';
    g.lineJoin = 'round';
    g.globalAlpha = 0.25 + 0.15 * breath;
    g.lineWidth = 6;
    g.strokeStyle = '#E5A00D';
    g.stroke();
    g.globalAlpha = 0.72 + 0.2 * breath;
    g.lineWidth = 1.8;
    g.stroke();
    g.globalAlpha = 1;
  }

  function drawTranscribingState(t) {
    if (Wd <= 2 || H <= 2) fit();
    g.clearRect(0, 0, Wd, H);
    const cy = H / 2;
    g.fillStyle = 'rgba(91, 141, 239, 0.16)';
    g.fillRect(0, cy - 1, Wd, 2);
    if (reduced) {
      g.fillStyle = 'rgba(139, 177, 250, 0.7)';
      g.fillRect(Wd * 0.25, cy - 1.5, Wd * 0.5, 3);
      return;
    }
    const s = (t / 1150) % 1;
    const segW = Math.max(48, Wd * 0.34);
    const x0 = -segW + (Wd + segW * 2) * s;
    const gr = g.createLinearGradient(x0, 0, x0 + segW, 0);
    gr.addColorStop(0, 'rgba(91, 141, 239, 0)');
    gr.addColorStop(0.5, 'rgba(139, 177, 250, 0.95)');
    gr.addColorStop(1, 'rgba(91, 141, 239, 0)');
    g.fillStyle = gr;
    g.fillRect(Math.max(0, x0), cy - 1.5, segW, 3);
  }

  if (typeof ResizeObserver === 'function') {
    try {
      const ro = new ResizeObserver((entries) => {
        const cr = entries[0]?.contentRect;
        if (!cr) return;
        fit(cr.width, cr.height);
        if (!raf && active && !canAnimate()) {
          if (stripState === 'paused') drawPausedState(performance.now() - t0);
          else if (stripState === 'transcribing') drawTranscribingState(performance.now() - t0);
          else drawStaticLine();
        }
      });
      ro.observe(canvas);
    } catch {}
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
      gateOpen = gateOpen ? (raw >= c) : (raw > o);
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
      blReusable.low = sm(envSlow);
      blReusable.mid = sm(env);
      blReusable.high = sm(envFast);
      blReusable.rms = sm((env + envFast + envSlow) / 3);
      return blReusable;
    }
    const n = analyser.frequencyBinCount;
    if (!freqBuf || freqBuf.length !== n) freqBuf = new Uint8Array(n);
    const buf = freqBuf;
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
    blReusable.low = l * gate;
    blReusable.mid = m * gate;
    blReusable.high = h * gate;
    blReusable.rms = sm(env);
    return blReusable;
  }

  function getSmArr(wv) {
    let arr = wSm.get(wv.id);
    if (!arr) {
      arr = new Float64Array(4);
      arr[0] = -1;
      wSm.set(wv.id, arr);
    }
    return arr;
  }

  function smoothWaveBands(wv, bl, dt) {
    const arr = getSmArr(wv);
    const gain = wv.ov && wv.ov.sensitivity != null ? 0.4 + 1.2 * (wv.ov.sensitivity / 100) : 1;
    const a = atkOf(eff(wv, 'attack')), r = relOf(eff(wv, 'smooth'));
    const uninit = arr[0] < 0;
    for (let bi = 0; bi < 4; bi++) {
      const bKey = BAND_LIST[bi];
      const tgt = sm((bl[bKey] ?? bl.rms) * gain);
      arr[bi] = (dt > 0 && !uninit) ? smoothE(arr[bi], tgt, dt, a, r) : tgt;
    }
    return arr;
  }

  function fillSmBl(wv, bl) {
    const arr = getSmArr(wv);
    if (arr[0] < 0) smoothWaveBands(wv, bl, 0);
    smBlReusable.low = arr[0];
    smBlReusable.mid = arr[1];
    smBlReusable.high = arr[2];
    smBlReusable.rms = arr[3];
    return smBlReusable;
  }

  function ampAtU(u, bl, wv) {
    if ((wv.profile || 'flat') === 'bands') {
      const Al = ampOf(H, bl.low, wv), Am = ampOf(H, bl.mid, wv), Ah = ampOf(H, bl.high, wv);
      if (u < 0.5) { const k = u * 2; return Al * (1 - k) + Am * k; }
      const k = (u - 0.5) * 2; return Am * (1 - k) + Ah * k;
    }
    return ampOf(H, bl[wv.band] ?? bl.rms, wv) * profMul(wv.profile || 'flat', u);
  }

  function strokeFor(wv, t) {
    if (wv.colorMode === 'gradient') {
      const k = `${H}|${wv.c1}|${wv.c2}`;
      let gr = gradCache.get(k);
      if (!gr) {
        gr = g.createLinearGradient(0, H / 2 - 30, 0, H / 2 + 30);
        gr.addColorStop(0, wv.c1); gr.addColorStop(1, wv.c2);
        gradCache.set(k, gr);
      }
      return gr;
    }
    if (wv.colorMode === 'rainbow') {
      const rate = 0.1 + 3.0 * (eff(wv, 'speed') / 100);
      const gr = g.createLinearGradient(0, 0, Wd, 0), flow = (t / 1000) * 40 * rate;
      for (let k = 0; k <= 6; k++) gr.addColorStop(k / 6, `hsl(${((flow + k * 60) | 0) % 360} 90% 65%)`);
      return gr;
    }
    return wv.c1;
  }

  function traceBuf(N, buf) {
    g.beginPath();
    for (let i = 0; i <= N; i++) {
      const x = (i / N) * Wd;
      i ? g.lineTo(x, buf[i]) : g.moveTo(x, buf[i]);
    }
  }

  function drawWave(t, wv, bl) {
    if (wv.mute || wv.opacity <= 0) return;
    const cyc = PEAK_CYC[wv.peaks] || 3;
    const rate = 0.1 + 3.0 * (eff(wv, 'speed') / 100);
    const s = t / 1000;
    const wob = 0.7 + 0.3 * Math.sin(2 * Math.PI * 0.9 * rate * s + 0.7) * Math.sin(2 * Math.PI * 1.3 * rate * s);
    const isFlat = wv.type === 'flat-glow-line';
    const isSteps = wv.type === 'steps';
    const isMirror = wv.type === 'mirror-sine';
    const avgL = bl[wv.band] ?? bl.rms;
    const baseA = ampOf(H, avgL, wv);
    const st = isSteps ? (baseA / 4 + 0.5) : 0;
    const N = Math.max(64, Math.floor(Wd / 2));
    ensureYBuf(N + 1);

    for (let i = 0; i <= N; i++) {
      const u = i / N;
      const x = u * Wd;
      let a = ampAtU(u, bl, wv);
      if (isFlat) a = Math.max(a * 0.15, 1.5);
      a *= wob;
      let y = sineY(x, Wd, H, a, cyc, PH0);
      if (isSteps) y = H / 2 + Math.round((y - H / 2) / st) * st;
      yBuf[i] = y;
      if (isMirror) yMirrorBuf[i] = sineY(x, Wd, H, a * 0.3, cyc, PH0);
    }

    const col = strokeFor(wv, t);
    const colSolid = wv.colorMode === 'rainbow' ? '#9adcff' : wv.c1;
    const lwBase = +wv.thick || 2;
    const op = wv.opacity / 100, gl = wv.glow / 100;
    const thick = lwBase + 1.2 * sm(avgL);

    if (wv.type === 'ribbon') {
      const gr = g.createLinearGradient(0, H / 2 - baseA, 0, H / 2 + baseA + 14);
      gr.addColorStop(0, wv.colorMode === 'gradient' ? wv.c2 : rgba(colSolid, 0.35));
      gr.addColorStop(1, 'rgba(0,0,0,0)');
      traceBuf(N, yBuf);
      g.lineTo(Wd, H);
      g.lineTo(0, H);
      g.closePath();
      g.globalAlpha = op * 0.8;
      g.fillStyle = wv.colorMode === 'rainbow' ? col : gr;
      g.fill();
    }

    // Build wave path ONCE — reused across halo passes and main stroke
    traceBuf(N, yBuf);
    g.lineCap = 'round';
    g.lineJoin = isSteps ? 'miter' : 'round';
    g.strokeStyle = col;

    if (gl > 0) {
      g.globalCompositeOperation = 'lighter';
      g.globalAlpha = op * sm(0.35 * gl);
      g.lineWidth = thick + 4 + gl * 14;
      g.stroke();
      g.globalAlpha = op * sm(0.22 * gl);
      g.lineWidth = thick + 2 + gl * 6;
      g.stroke();
      g.globalCompositeOperation = 'source-over';
    }

    g.globalAlpha = op;
    g.lineWidth = thick;
    if (wv.type === 'dash') {
      g.setLineDash([8, 7]);
      g.stroke();
      g.setLineDash([]);
    } else {
      g.stroke();
    }

    if (isMirror) {
      traceBuf(N, yMirrorBuf);
      g.globalAlpha = op * 0.3;
      g.lineWidth = Math.max(1, thick - 0.5);
      g.stroke();
    }
    g.globalAlpha = 1;
  }

  function barBase(u, bl, wv) {
    if ((wv.profile || 'flat') === 'bands') {
      if (u < 0.5) { const k = u * 2; return bl.low * (1 - k) + bl.mid * k; }
      const k = (u - 0.5) * 2; return bl.mid * (1 - k) + bl.high * k;
    }
    return bl[wv.band] ?? bl.rms;
  }
  function drawBars(t, wv, bl) {
    if (wv.mute || wv.opacity <= 0) return;
    const count = Math.max(8, Math.min(48, Math.round(wv.barCount ?? 24)));
    const gap = Math.max(0, Math.min(8, +(wv.barGap ?? 2)));
    const shape = wv.barShape === 'square' || wv.barShape === 'needle' ? wv.barShape : 'rounded';
    const cyc = PEAK_CYC[wv.peaks] || 3;
    const rate = 0.1 + 3.0 * (eff(wv, 'speed') / 100);
    const s = t / 1000;
    const wob = 0.7 + 0.3 * Math.sin(2 * Math.PI * 0.9 * rate * s + 0.7) * Math.sin(2 * Math.PI * 1.3 * rate * s);
    const slot = Wd / count;
    const bw = Math.max(1, slot - gap);
    const col = strokeFor(wv, t);
    const op = wv.opacity / 100, gl = wv.glow / 100;
    for (let i = 0; i < count; i++) {
      const u = (i + 0.5) / count;
      const amp = ampOf(H, sm(barBase(u, bl, wv)), wv);
      const mod = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(2 * Math.PI * cyc * u + 0.9 * Math.sin(2 * Math.PI * 0.9 * rate * s + u * 3) + 0.4 * Math.sin(2 * Math.PI * 1.7 * rate * s)));
      const h = Math.max(2, Math.min(H, amp * 2 * mod * profMul(wv.profile || 'flat', u) * wob));
      barGeoX[i] = i * slot + (slot - bw) / 2;
      barGeoY[i] = H / 2 - h / 2;
      barGeoH[i] = h;
    }
    if (gl > 0) {
      g.globalCompositeOperation = 'lighter';
      g.globalAlpha = op * 0.22 * gl;
      g.fillStyle = col;
      for (let i = 0; i < count; i++) g.fillRect(barGeoX[i] - 1, barGeoY[i] - 1, bw + 2, barGeoH[i] + 2);
      g.globalCompositeOperation = 'source-over';
    }
    g.globalAlpha = op;
    if (shape === 'needle') {
      g.strokeStyle = col;
      g.lineWidth = Math.max(1, Math.min(2.5, bw * 0.4));
      g.lineCap = 'round';
      g.beginPath();
      for (let i = 0; i < count; i++) { const nx = barGeoX[i] + bw / 2; g.moveTo(nx, barGeoY[i]); g.lineTo(nx, barGeoY[i] + barGeoH[i]); }
      g.stroke();
    } else {
      g.fillStyle = col;
      g.beginPath();
      const r = shape === 'square' ? 0 : Math.min(bw / 2, 3);
      for (let i = 0; i < count; i++) {
        if (r > 0 && g.roundRect) { g.moveTo(barGeoX[i], barGeoY[i]); g.roundRect(barGeoX[i], barGeoY[i], bw, barGeoH[i], r); }
        else g.rect(barGeoX[i], barGeoY[i], bw, barGeoH[i]);
      }
      g.fill();
    }
    g.globalAlpha = 1;
  }

  const PARTS = Array.from({ length: 24 }, (_, i) => ({ u: (i + 0.5) / 24, sz: 1 + (i % 2), al: 0.22 + 0.28 * ((i * 53 % 10) / 10), j: (i * 7919 % 100) / 100 * 6.283 }));
  function drawParts(t, top) {
    const n = Math.min(cfg.particles, 24);
    if (n <= 0 || !top) return;
    const rate = 0.1 + 3.0 * (cfg.speed / 100);
    const A = ampOf(H, sm(env), top);
    const col = top.colorMode === 'rainbow' ? '#9adcff' : top.c1;
    const rgb = parseHex(col);
    g.fillStyle = `rgb(${rgb.r},${rgb.g},${rgb.b})`;
    for (let i = 0; i < n; i++) {
      const q = PARTS[i], x = q.u * Wd;
      const y = sineY(x, Wd, H, A, 3, PH0) + Math.sin(t / 700 * rate + q.j) * (0.6 + A * 0.12);
      g.globalAlpha = q.al;
      g.beginPath(); g.arc(x, y, q.sz, 0, 7); g.fill();
    }
    g.globalAlpha = 1;
  }
  function drawAurora() {
    if (!cfg.aurora?.on) return;
    const a = +(0.05 + 0.14 * sm(envSlow)).toFixed(3);
    const gr = g.createLinearGradient(0, 0, 0, H);
    gr.addColorStop(0, `rgba(${auroraRgb.r},${auroraRgb.g},${auroraRgb.b},${a})`);
    gr.addColorStop(1, `rgba(191,115,245,${a})`);
    g.fillStyle = gr; g.fillRect(0, 0, Wd, H);
  }

  function drawStack(t, dt, bl0) {
    drawAurora();
    const bl = bl0 || { low: 0, mid: 0, high: 0, rms: 0 };
    const vis = cfg.waves;
    if (dt > 0) {
      for (let i = 0; i < vis.length; i++) {
        if (!vis[i].mute) smoothWaveBands(vis[i], bl, dt);
      }
    }
    let top = null;
    for (let i = vis.length - 1; i >= 0; i--) {
      const wv = vis[i];
      if (wv.mute) continue;
      if (!top) top = wv;
      const smBl = fillSmBl(wv, bl);
      if (wv.type === 'bars') drawBars(t, wv, smBl);
      else drawWave(t, wv, smBl);
    }
    // Note: top-most visible wave is index 0
    let front = null;
    for (let i = 0; i < vis.length; i++) { if (!vis[i].mute) { front = vis[i]; break; } }
    if (front) drawParts(t, front);
  }

  function canAnimate() {
    if (reduced || document.hidden) return false;
    if (stripState === 'paused' || stripState === 'transcribing') return true;
    return Boolean(analyser) || fakeOn;
  }

  function paintIdleSnapshot() {
    if (document.hidden) return;
    if (stripState === 'paused') drawPausedState(performance.now() - t0);
    else if (stripState === 'transcribing') drawTranscribingState(performance.now() - t0);
    else drawStaticLine();
  }

  function ensureLoop() {
    if (!active) return;
    if (!canAnimate()) {
      if (raf) { cancelAnimationFrame(raf); raf = 0; }
      paintIdleSnapshot();
      return;
    }
    if (Wd <= 2 || H <= 2) fit();
    if (!raf) {
      last = performance.now();
      raf = requestAnimationFrame(frame);
    }
  }

  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        if (raf) { cancelAnimationFrame(raf); raf = 0; }
      } else if (active) {
        ensureLoop();
      }
    });
  }

  function frame(now) {
    if (!raf || !active || !canAnimate()) {
      raf = 0;
      if (active) paintIdleSnapshot();
      return;
    }
    const minInterval = (stripState === 'paused' || stripState === 'transcribing') ? 32 : 15;
    if (now - last < minInterval) { raf = requestAnimationFrame(frame); return; }
    const dt = Math.min(0.05, (now - last) / 1000 || 0.016);
    last = now;
    const t = now - t0;
    if (stripState === 'paused') {
      drawPausedState(t);
    } else if (stripState === 'transcribing') {
      drawTranscribingState(t);
    } else {
      g.clearRect(0, 0, Wd, H);
      stepLevel(t, dt);
      drawStack(t, dt, bandLevels());
    }
    raf = requestAnimationFrame(frame);
  }

  fit();
  return {
    setConfig(c) {
      cfg = c;
      warmColorCache();
      gradCache.clear();
      const alive = new Set(c.waves.map(w => w.id));
      for (const k of wSm.keys()) { if (!alive.has(k)) wSm.delete(k); }
    },
    setState(mode) {
      const next = (mode === 'recording' || mode === 'paused' || mode === 'transcribing') ? mode : 'idle';
      if (stripState === next) return;
      stripState = next;
      if (active) ensureLoop();
      else paintIdleSnapshot();
    },
    setAnalyser(node) {
      analyser = node || null;
      micBuf = null;
      freqBuf = null;
      if (active) ensureLoop();
    },
    setFakeEnabled(on) {
      fakeOn = !!on;
      if (active) ensureLoop();
    },
    getLevel() { return sm(env); },
    start() {
      active = true;
      ensureLoop();
    },
    stop() {
      active = false;
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      paintIdleSnapshot();
    },
    renderFrame(now) {
      if (Wd <= 2 || H <= 2) fit();
      g.clearRect(0, 0, Wd, H);
      if (reduced || (!analyser && !fakeOn)) {
        drawStaticLine();
        return;
      }
      if (!lastF) lastF = now;
      const dt = Math.min(0.1, Math.max(0.001, (now - lastF) / 1000));
      lastF = now;
      stepLevel(now - t0, dt);
      drawStack(now - t0, dt, bandLevels());
    },
    renderOnce() {
      fit();
      g.clearRect(0, 0, Wd, H);
      const bl = { low: 0.4, mid: 0.55, high: 0.45, rms: 0.5 };
      for (const wv of cfg.waves) {
        if (wv.mute) continue;
        const arr = getSmArr(wv);
        arr[0] = bl.low; arr[1] = bl.mid; arr[2] = bl.high; arr[3] = bl.rms;
      }
      drawStack(1200, 0, bl);
    },
  };
}
