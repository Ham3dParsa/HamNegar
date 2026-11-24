// Module: wave
// Interface: createWaveRenderer(canvas) -> { setConfig, setState, setAnalyser, setFakeEnabled, getLevel, start, stop, renderFrame, renderOnce }
//            + STARTERS (8 distinct presets incl. 2-Bit Pixel), randomStack(), WAVE_FA, WAVE_PALETTES.
// Architecture: 8 distinct Canvas2D visual engines with zero per-frame Path2D/heap churn,
// quantized 2-bit integer pixel rasterizer, gravity peak-hold buffers, DPR-aware rAF,
// reduced-motion static frames, and paused/transcribing strip states.
import { defaultWaveConfig } from './storage.js';

export const WAVE_FA = {
  types: {
    'pixel-2bit': 'پیکسل ۲بیتی',
    'siri-ribbon': 'ابریشم سیری',
    'capsule-eq': 'اکولایزر قله‌دار',
    'droplet-orb': 'قطره شیشه‌ای',
    'laser-scope': 'اسیلوسکوپ',
    'sonic-rings': 'امواج راداری',
    'starburst-particles': 'کهکشان صوتی',
    'aurora-curtain': 'پرده شفق',
  },
  colorModes: { solid: 'تک‌رنگ', gradient: 'گرادیان', rainbow: 'طیف متحرک' },
  bands: { rms: 'همه صداها', low: 'صدای بم', mid: 'صدای گفتگو', high: 'زیر و تلفظ' },
  profiles: { center: 'متمرکز وسط', flat: 'یکنواخت', edges: 'لبه‌ها', bands: 'تفکیک فرکانس' },
  barShapes: { rounded: 'کپسولی', square: 'مربعی', needle: 'سوزنی' },
};

export const WAVE_PALETTES = [
  { id: 'gameboy', n: '۲بیتی کلاسیک', c1: '#9bbc0f', c2: '#306230', mode: 'gradient' },
  { id: 'amber-crt', n: 'کهربایی رترو', c1: '#fde047', c2: '#ea580c', mode: 'gradient' },
  { id: 'siri', n: 'سیری اقیانوسی', c1: '#60a5fa', c2: '#c084fc', mode: 'gradient' },
  { id: 'droplet', n: 'قطره یخی', c1: '#7dd3fc', c2: '#38bdf8', mode: 'gradient' },
  { id: 'emerald', n: 'زمرد استودیو', c1: '#34d399', c2: '#06b6d4', mode: 'gradient' },
  { id: 'sunset', n: 'مرجانی گرم', c1: '#fb7185', c2: '#fbbf24', mode: 'gradient' },
  { id: 'rainbow', n: 'طیف رنگی', c1: '#60a5fa', c2: '#f472b6', mode: 'rainbow' },
];

const FAKE_FLOOR = 0.055, FLOOR_MIN = 0.025, LOUD_REF = 0.68;
const IDLE_FRAC = 0.015;
let _wid = 0;
const nid = () => `w${Date.now().toString(36)}${(++_wid).toString(36)}`;

function W(o) {
  const w = {
    id: nid(), name: '', type: 'siri-ribbon', colorMode: 'gradient', c1: '#60a5fa', c2: '#c084fc',
    opacity: 96, glow: 70, thick: 2, detail: 3, peaks: 'mid', band: 'rms', profile: 'center',
    mirror: true, grid: false, peakHold: true, pixelSize: 5, mute: false,
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
  {
    id: 'retro-2bit',
    n: 'پیکسل ۲بیتی گیم‌بوی',
    d: 'ماتریس ۴‌طیفه بدون محو با کلاهک قله‌گیر و اسکن‌لاین.',
    tag: 'پیکسل ۲بیتی',
    aurora: false,
    stack: () => [
      W({
        name: 'پیکسل اصلی', type: 'pixel-2bit', colorMode: 'gradient',
        c1: '#9bbc0f', c2: '#306230', opacity: 100, glow: 28, detail: 4,
        band: 'rms', profile: 'center', mirror: true, grid: true, peakHold: true, pixelSize: 5,
      }),
    ],
  },
  {
    id: 'crt-amber-2bit',
    n: 'ترمینال ۲بیتی کهربایی',
    d: 'طیف روبه‌بالای رترو با پیکسل درشت و رده قله.',
    tag: '۲بیتی CRT',
    aurora: false,
    stack: () => [
      W({
        name: 'ستون کهربایی', type: 'pixel-2bit', colorMode: 'gradient',
        c1: '#fde047', c2: '#ea580c', opacity: 98, glow: 34, detail: 3,
        band: 'rms', profile: 'bands', mirror: false, grid: true, peakHold: true, pixelSize: 4,
      }),
    ],
  },
  {
    id: 'siri-aurora',
    n: 'ابریشم سیری',
    d: 'نوارهای ابریشمی هم‌تنیده با درخشش حجم‌دار.',
    tag: 'ابریشمی',
    aurora: true,
    stack: () => [
      W({
        name: 'ابریشم اصلی', type: 'siri-ribbon', colorMode: 'gradient',
        c1: '#60a5fa', c2: '#c084fc', opacity: 96, glow: 74, thick: 2, detail: 3,
        band: 'rms', profile: 'center', mirror: true,
      }),
      W({
        name: 'زمزمه فیروزه‌ای', type: 'siri-ribbon', colorMode: 'solid',
        c1: '#5eead4', c2: '#60a5fa', opacity: 48, glow: 52, thick: 1.5, detail: 4,
        band: 'mid', profile: 'center', mirror: true, ov: { speed: 66 },
      }),
    ],
  },
  {
    id: 'apple-droplet',
    n: 'قطره شیشه‌ای',
    d: 'لنز مرکزی تنفس‌گر روی خط افق شیشه‌ای.',
    tag: 'قطره اپل',
    aurora: true,
    stack: () => [
      W({
        name: 'هسته قطره', type: 'droplet-orb', colorMode: 'gradient',
        c1: '#7dd3fc', c2: '#818cf8', opacity: 98, glow: 82, thick: 2, detail: 3,
        band: 'rms', profile: 'center', mirror: true,
      }),
      W({
        name: 'افق شیشه‌ای', type: 'laser-scope', colorMode: 'solid',
        c1: '#bae6fd', c2: '#7dd3fc', opacity: 38, glow: 44, thick: 1.5, detail: 2,
        band: 'low', profile: 'center', mirror: false, grid: false,
      }),
    ],
  },
  {
    id: 'studio-peak-eq',
    n: 'اکولایزر قله‌دار',
    d: 'ستون‌های کپسولی تفکیک باند با کلاهک گرانشی.',
    tag: 'اکولایزر',
    aurora: false,
    stack: () => [
      W({
        name: 'ستون طیف', type: 'capsule-eq', colorMode: 'gradient',
        c1: '#34d399', c2: '#38bdf8', opacity: 96, glow: 64, detail: 3,
        band: 'rms', profile: 'bands', mirror: true, peakHold: true,
        barShape: 'rounded', barCount: 26, barGap: 3,
      }),
    ],
  },
  {
    id: 'crt-oscilloscope',
    n: 'اسیلوسکوپ لیزری',
    d: 'رد دقیق شکل‌موج صوتی روی شبکه کالیبراسیون.',
    tag: 'اسیلوسکوپ',
    aurora: false,
    stack: () => [
      W({
        name: 'پرتو فسفری', type: 'laser-scope', colorMode: 'gradient',
        c1: '#22d3ee', c2: '#a78bfa', opacity: 98, glow: 78, thick: 2, detail: 4,
        band: 'rms', profile: 'flat', mirror: true, grid: true,
      }),
    ],
  },
  {
    id: 'sonar-radar',
    n: 'رادار و سونار صوتی',
    d: 'حلقه‌های هم‌مرکز منبسط‌شونده با ضربان صدا.',
    tag: 'رادار',
    aurora: false,
    stack: () => [
      W({
        name: 'امواج رادار', type: 'sonic-rings', colorMode: 'gradient',
        c1: '#38bdf8', c2: '#c084fc', opacity: 96, glow: 76, thick: 2, detail: 4,
        band: 'rms', profile: 'center', mirror: true, grid: true,
      }),
    ],
  },
  {
    id: 'northern-galaxy',
    n: 'شفق و کهکشان',
    d: 'پرده نور شمالی همراه با ذرات درخشان واکنش‌گر.',
    tag: 'شفق',
    aurora: true,
    stack: () => [
      W({
        name: 'پرده شفق', type: 'aurora-curtain', colorMode: 'gradient',
        c1: '#5eead4', c2: '#a855f7', opacity: 82, glow: 68, thick: 2, detail: 3,
        band: 'low', profile: 'center', mirror: true,
      }),
      W({
        name: 'ستاره‌باران', type: 'starburst-particles', colorMode: 'solid',
        c1: '#e0f2fe', c2: '#c084fc', opacity: 94, glow: 72, thick: 2, detail: 4,
        band: 'high', profile: 'center', mirror: true,
      }),
    ],
  },
];

const LEGACY_STARTER_ALIAS = {
  'liquid-silk': 'siri-aurora',
  'horizon-pulse': 'sonar-radar',
  'glass-capsules': 'studio-peak-eq',
  'aurora-veil': 'northern-galaxy',
  'warm-amber': 'crt-amber-2bit',
  'eq-needle': 'studio-peak-eq',
  'classic-fade': 'apple-droplet',
  'warm-presence': 'crt-amber-2bit',
  'perc-pop': 'sonar-radar',
  'edge-whisper': 'siri-aurora',
  'mirror-lake': 'apple-droplet',
  'aurora-wash': 'northern-galaxy',
  'dash-ticker': 'retro-2bit',
  'quantum-steps': 'retro-2bit',
  'ice-glow': 'apple-droplet',
  'heartbeat': 'apple-droplet',
  'eq-bars': 'studio-peak-eq',
};
export const starterById = id => STARTERS.find(s => s.id === (LEGACY_STARTER_ALIAS[id] || id)) || STARTERS[0];

export function randomStack() {
  const pal = WAVE_PALETTES[Math.floor(Math.random() * WAVE_PALETTES.length)];
  const primaryTypes = ['pixel-2bit', 'siri-ribbon', 'capsule-eq', 'droplet-orb', 'laser-scope', 'sonic-rings', 'starburst-particles', 'aurora-curtain'];
  const t1 = primaryTypes[Math.floor(Math.random() * primaryTypes.length)];
  const n = t1 === 'pixel-2bit' ? 1 : (1 + Math.floor(Math.random() * 2));
  const out = [
    W({
      name: 'موج ۱',
      type: t1,
      colorMode: pal.mode,
      c1: pal.c1,
      c2: pal.c2,
      opacity: 96,
      glow: t1 === 'pixel-2bit' ? 32 : 55 + Math.floor(Math.random() * 30),
      thick: [1.5, 2, 2.5][Math.floor(Math.random() * 3)],
      detail: 2 + Math.floor(Math.random() * 3),
      band: 'rms',
      profile: t1 === 'capsule-eq' ? 'bands' : 'center',
      mirror: t1 !== 'pixel-2bit' || Math.random() > 0.3,
      grid: t1 === 'pixel-2bit' || Math.random() < 0.45,
      peakHold: true,
      pixelSize: 4 + Math.floor(Math.random() * 3),
      barShape: ['rounded', 'square', 'needle'][Math.floor(Math.random() * 3)],
      barCount: 18 + Math.floor(Math.random() * 14),
      barGap: 2 + Math.floor(Math.random() * 2),
    }),
  ];
  if (n === 2) {
    const t2 = t1 === 'aurora-curtain' ? 'starburst-particles' : (t1 === 'droplet-orb' ? 'laser-scope' : 'siri-ribbon');
    out.push(W({
      name: 'موج ۲',
      type: t2,
      colorMode: 'solid',
      c1: pal.c2,
      c2: pal.c1,
      opacity: 52,
      glow: 50,
      thick: 1.5,
      detail: 4,
      band: 'mid',
      profile: 'center',
      mirror: true,
    }));
  }
  return out;
}

// --- Math & Color Core ---
const sm = v => Math.min(1, Math.max(0, v));
function perc(x) { x = sm(x); return x <= 0 ? 0 : Math.min(1, Math.pow(x, 0.4) * (x < 0.3 ? 1.16 : 1.0)); }
function smoothE(e, tg, dt, a, r) { const k = tg > e ? a : r; return e + (tg - e) * (1 - Math.exp(-dt / Math.max(0.004, k))); }
function fakeRaw(t) {
  const s = t / 1000, CYC = 4.6, SPEAK = 3.3, EDGE = 0.16, cyc = s % CYC;
  let g = 1;
  if (cyc > SPEAK) { g = 0; const e = Math.min(cyc - SPEAK, CYC - cyc); if (e < EDGE) g = 0.5 - 0.5 * Math.cos(Math.PI * e / EDGE); }
  const b = 0.52 + 0.48 * Math.sin(2 * Math.PI * 0.24 * s) * Math.sin(2 * Math.PI * 0.12 * s + 1.2);
  const sy = 0.56 + 0.44 * Math.sin(2 * Math.PI * 2.65 * s + Math.sin(2 * Math.PI * 0.85 * s));
  const burst = Math.pow(Math.max(0, Math.sin(2 * Math.PI * 1.85 * s + 0.4) * Math.sin(2 * Math.PI * 0.67 * s)), 2) * 0.92;
  const pluck = Math.pow(Math.max(0, Math.sin(2 * Math.PI * 3.3 * s + 1.1)), 6) * 0.72;
  return sm((b * sy * 1.32 + burst + pluck) * 0.74) * g;
}

const rgbCache = new Map();
function parseHex(h) {
  if (typeof h !== 'string') return { r: 96, g: 165, b: 250 };
  let c = rgbCache.get(h);
  if (c) return c;
  if (h.length === 7 && h[0] === '#') {
    c = {
      r: parseInt(h.slice(1, 3), 16) || 0,
      g: parseInt(h.slice(3, 5), 16) || 0,
      b: parseInt(h.slice(5, 7), 16) || 0,
    };
  } else {
    c = { r: 96, g: 165, b: 250 };
  }
  rgbCache.set(h, c);
  return c;
}
function rgba(h, a) {
  const c = parseHex(h);
  return `rgba(${c.r},${c.g},${c.b},${a})`;
}
function mixRgbStr(cA, cB, t, alpha = 1) {
  const r = Math.round(cA.r + (cB.r - cA.r) * t);
  const g = Math.round(cA.g + (cB.g - cA.g) * t);
  const b = Math.round(cA.b + (cB.b - cA.b) * t);
  return `rgba(${r},${g},${b},${alpha})`;
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
function profMul(p, u) {
  if (p === 'center') return 0.25 + 0.75 * Math.sin(Math.PI * sm(u));
  if (p === 'edges') return 0.28 + 0.72 * Math.abs(2 * u - 1);
  return 1;
}

const BAND_LIST = ['low', 'mid', 'high', 'rms'];
const STAR_SEEDS = Array.from({ length: 64 }, (_, i) => ({
  u: ((i * 37 + 13) % 64) / 64,
  phase: (i * 1.6180339) % (Math.PI * 2),
  lane: ((i * 7919) % 100) / 100 * 2 - 1,
  speedMul: 0.55 + ((i * 31) % 10) * 0.09,
  radius: 1.1 + (i % 3) * 0.65,
}));

export function createWaveRenderer(canvas) {
  const g = canvas.getContext('2d');
  const reduced = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)').matches : false;
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
  const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();
  let gateOpen = false, env = 0, envFast = 0, envSlow = 0;

  // Per-wave smoothing & peak-hold state (zero GC churn)
  const wSm = new Map();
  const wPeaks = new Map();
  const gradCache = new Map();
  let yBuf = new Float32Array(256);
  let yMirrorBuf = new Float32Array(256);
  let yAuxBuf = new Float32Array(256);
  let barGeoX = new Float32Array(64);
  let barGeoY = new Float32Array(64);
  let barGeoH = new Float32Array(64);
  const blReusable = { low: 0, mid: 0, high: 0, rms: 0 };
  const smBlReusable = { low: 0, mid: 0, high: 0, rms: 0 };
  let auroraRgb = hslToRgb(225, 80, 60);
  let Wd = 0, H = 0;

  const eff = (wv, k) => (wv.ov && wv.ov[k] != null ? wv.ov[k] : cfg[k]);
  const sensMap = () => { const k = (cfg.sensitivity ?? 56) / 100; return { open: 2.5 - 1.45 * k, close: 2.1 - 1.45 * k, gain: 0.52 + 1.35 * k }; };
  // Unified human "نرمی واکنش" (`smooth` 0..100) drives both snappy attack and release cleanly
  const atkOf = v => { const smVal = (v == null ? (cfg.smooth ?? 54) : v) / 100; return 0.006 + 0.065 * smVal; };
  const relOf = v => { const smVal = (v == null ? (cfg.smooth ?? 54) : v) / 100; return 0.04 + 0.52 * smVal; };
  const ampOf = (HH, L, wv) => HH * IDLE_FRAC + HH * 0.42 * sm(L / (1 + 0.1 * L)) * (0.2 + 1.85 * (eff(wv, 'intensity') / 100));

  function ensureYBuf(need) {
    if (yBuf.length < need) {
      yBuf = new Float32Array(need + 32);
      yMirrorBuf = new Float32Array(need + 32);
      yAuxBuf = new Float32Array(need + 32);
    }
  }

  function warmColorCache() {
    if (cfg?.aurora?.hue != null) auroraRgb = hslToRgb(cfg.aurora.hue, 82, 60);
    for (const wv of (cfg?.waves || [])) {
      if (wv.c1) parseHex(wv.c1);
      if (wv.c2) parseHex(wv.c2);
    }
  }
  warmColorCache();

  function fit(nextW, nextH) {
    const dpr = typeof devicePixelRatio === 'number' ? devicePixelRatio : 1;
    const d = Math.min(dpr || 1, 2);
    let w = nextW, h = nextH;
    if (w == null || h == null) {
      const r = typeof canvas.getBoundingClientRect === 'function' ? canvas.getBoundingClientRect() : { width: canvas.width, height: canvas.height };
      w = r.width;
      h = r.height;
    }
    const nw = Math.max(2, w || canvas.clientWidth || canvas.width || 2);
    const nh = Math.max(2, h || canvas.clientHeight || canvas.height || 2);
    const targetCw = Math.round(nw * d);
    const targetCh = Math.round(nh * d);
    if (Math.abs(nw - Wd) <= 0.5 && Math.abs(nh - H) <= 0.5 && canvas.width === targetCw && canvas.height === targetCh) return;
    Wd = nw; H = nh;
    canvas.width = Math.max(2, targetCw);
    canvas.height = Math.max(2, targetCh);
    if (typeof g.setTransform === 'function') g.setTransform(d, 0, 0, d, 0, 0);
    gradCache.clear();
  }

  function drawStaticLine(colorCss = 'rgba(255,255,255,0.16)') {
    if (Wd <= 2 || H <= 2) fit();
    g.clearRect(0, 0, Wd, H);
    g.fillStyle = colorCss;
    g.fillRect(0, H / 2 - 1, Wd, 2);
  }

  function drawPausedState(t) {
    if (Wd <= 2 || H <= 2) fit();
    g.clearRect(0, 0, Wd, H);
    if (reduced) { drawStaticLine('rgba(229, 160, 13, 0.58)'); return; }
    const s = t / 1000;
    const breath = 0.55 + 0.45 * Math.sin(s * 2.1);
    const N = Math.max(48, Math.floor(Wd / 3));
    g.beginPath();
    for (let i = 0; i <= N; i++) {
      const u = i / N;
      const x = u * Wd;
      const envWin = Math.sin(Math.PI * u);
      const y = H / 2 + Math.sin(u * Math.PI * 5 + 0.6) * (1.8 + 1.5 * breath) * envWin;
      i ? g.lineTo(x, y) : g.moveTo(x, y);
    }
    g.lineCap = 'round';
    g.lineJoin = 'round';
    g.globalAlpha = 0.25 + 0.15 * breath;
    g.lineWidth = 6;
    g.strokeStyle = '#E5A00D';
    g.stroke();
    g.globalAlpha = 0.76 + 0.2 * breath;
    g.lineWidth = 1.8;
    g.stroke();
    g.globalAlpha = 1;
  }

  function drawTranscribingState(t) {
    if (Wd <= 2 || H <= 2) fit();
    g.clearRect(0, 0, Wd, H);
    const cy = H / 2;
    g.fillStyle = 'rgba(91, 141, 239, 0.18)';
    g.fillRect(0, cy - 1, Wd, 2);
    if (reduced) {
      g.fillStyle = 'rgba(139, 177, 250, 0.72)';
      g.fillRect(Wd * 0.25, cy - 1.5, Wd * 0.5, 3);
      return;
    }
    const s = (t / 1100) % 1;
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
        if (!raf && active && !canAnimate()) paintIdleSnapshot();
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
      const raw = Math.sqrt(sum / micBuf.length) / 0.22 * 1.45 * mm.gain;
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
    envFast = smoothE(envFast, tg, dt, Math.max(0.004, a * 0.45), Math.max(0.015, r * 0.55));
    envSlow = smoothE(envSlow, tg, dt, a * 2.1, r * 2.2);
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
    const q1 = Math.floor(n * 0.15), q2 = Math.floor(n * 0.48);
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
    if (!arr) { arr = new Float64Array(4); arr[0] = -1; wSm.set(wv.id, arr); }
    return arr;
  }

  function getPeakBuf(wv) {
    let st = wPeaks.get(wv.id);
    if (!st) {
      st = { vals: new Float32Array(96), vels: new Float32Array(96) };
      wPeaks.set(wv.id, st);
    }
    return st;
  }

  function smoothWaveBands(wv, bl, dt) {
    const arr = getSmArr(wv);
    const gain = wv.ov && wv.ov.sensitivity != null ? 0.4 + 1.25 * (wv.ov.sensitivity / 100) : 1;
    const smOverride = wv.ov && wv.ov.smooth != null ? wv.ov.smooth : null;
    const a = atkOf(smOverride), r = relOf(smOverride);
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

  function bandEnergyAtU(u, bl, wv) {
    if ((wv.profile || 'center') === 'bands') {
      if (u < 0.5) { const k = u * 2; return bl.low * (1 - k) + bl.mid * k; }
      const k = (u - 0.5) * 2; return bl.mid * (1 - k) + bl.high * k;
    }
    return (bl[wv.band] ?? bl.rms) * profMul(wv.profile || 'center', u);
  }

  function ampAtU(u, bl, wv) {
    return ampOf(H, bandEnergyAtU(u, bl, wv), wv);
  }

  function strokeFor(wv, t) {
    if (wv.colorMode === 'gradient') {
      const k = `${H}|${Wd}|${wv.c1}|${wv.c2}`;
      let gr = gradCache.get(k);
      if (!gr) {
        gr = g.createLinearGradient(0, 0, Wd, 0);
        gr.addColorStop(0, wv.c1);
        gr.addColorStop(0.5, wv.c2);
        gr.addColorStop(1, wv.c1);
        gradCache.set(k, gr);
      }
      return gr;
    }
    if (wv.colorMode === 'rainbow') {
      const rate = 0.12 + 2.8 * (eff(wv, 'speed') / 100);
      const gr = g.createLinearGradient(0, 0, Wd, 0), flow = (t / 1000) * 44 * rate;
      for (let k = 0; k <= 6; k++) gr.addColorStop(k / 6, `hsl(${((flow + k * 60) | 0) % 360} 92% 64%)`);
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

  // =========================================================================
  // STYLE 1: PIXEL 2-BIT (Authentic 4-Level Quantized Grid + Peak Caps + CRT)
  // =========================================================================
  function drawPixel2Bit(t, dt, wv, bl) {
    if (wv.mute || wv.opacity <= 0) return;
    const px = Math.max(3, Math.min(12, Math.round(wv.pixelSize || 5)));
    const pitchX = px + Math.max(1, Math.round(px * 0.35));
    const pitchY = px + 1;
    const cols = Math.min(92, Math.max(8, Math.floor((Wd - 4) / pitchX)));
    const startX = Math.floor((Wd - cols * pitchX) / 2);
    const cy = Math.floor(H / 2);
    const mirror = wv.mirror !== false;
    const rowsHalf = mirror ? Math.max(2, Math.floor((H * 0.45) / pitchY)) : Math.max(3, Math.floor((H * 0.88) / pitchY));
    const bottomY = Math.floor(H - Math.max(3, px));

    const cTop = parseHex(wv.c1);
    const cBot = parseHex(wv.colorMode === 'gradient' ? wv.c2 : wv.c1);
    const op = wv.opacity / 100;
    const gl = wv.glow / 100;
    const rate = 0.2 + 2.5 * (eff(wv, 'speed') / 100);
    const det = Math.max(1, Math.min(5, wv.detail || 3));
    const s = t / 1000;
    const pkState = getPeakBuf(wv);

    const prevSmooth = g.imageSmoothingEnabled;
    g.imageSmoothingEnabled = false;

    // Optional 2-bit LCD / CRT Pixel Matrix Backdrop
    if (wv.grid) {
      g.globalAlpha = op * 0.14;
      g.fillStyle = `rgb(${cBot.r},${cBot.g},${cBot.b})`;
      const stepRow = mirror ? rowsHalf : Math.min(rowsHalf, Math.floor(H / pitchY));
      for (let c = 0; c < cols; c++) {
        const bx = startX + c * pitchX;
        if (mirror) {
          for (let r = 0; r < stepRow; r++) {
            g.fillRect(bx, cy - (r + 1) * pitchY, px, px);
            g.fillRect(bx, cy + r * pitchY + 1, px, px);
          }
        } else {
          for (let r = 0; r < stepRow; r++) {
            g.fillRect(bx, bottomY - r * pitchY, px, px);
          }
        }
      }
    }

    // Quantize spectrum columns & draw 4-level 2-bit pixel shades
    for (let c = 0; c < cols; c++) {
      const u = (c + 0.5) / cols;
      const e = sm(bandEnergyAtU(u, bl, wv));
      const ampNorm = sm((e * 1.15) * (0.3 + 1.45 * (eff(wv, 'intensity') / 100)));
      const harmonic = 0.42 + 0.58 * (0.5 + 0.5 * Math.sin(u * Math.PI * (det * 1.7 + 1) - s * 2.8 * rate + Math.sin(s * 1.4 * rate + u * 5)));
      const level = Math.max(0.06, Math.min(1, ampNorm * harmonic * 1.25));
      const quantRows = Math.max(1, Math.min(rowsHalf, Math.round(level * rowsHalf)));

      // Peak-hold quantized block with gravity
      let pk = pkState.vals[c] || 0;
      if (quantRows >= pk) {
        pk = quantRows;
        pkState.vels[c] = 0;
      } else if (dt > 0) {
        pkState.vels[c] += 18 * dt;
        pk = Math.max(quantRows, pk - pkState.vels[c] * dt);
      }
      pkState.vals[c] = pk;
      const quantPeak = Math.min(rowsHalf, Math.round(pk));

      const bx = startX + c * pitchX;
      // Compute 4 quantized 2-bit color levels (darkest base -> bright specular tip)
      const hueFlow = wv.colorMode === 'rainbow' ? hslToRgb(((s * 65 * rate + u * 260) | 0) % 360, 88, 60) : null;
      const cHi = hueFlow || cTop;
      const cLo = hueFlow || cBot;

      const drawCell = (cellY, shadeLvl) => {
        // shadeLvl: 0 (dim echo), 1 (mid-low), 2 (bright), 3 (highlight cap)
        if (shadeLvl === 3) {
          g.fillStyle = mixRgbStr(cHi, { r: 248, g: 252, b: 232 }, 0.42, op);
        } else if (shadeLvl === 2) {
          g.fillStyle = `rgba(${cHi.r},${cHi.g},${cHi.b},${op * 0.96})`;
        } else if (shadeLvl === 1) {
          g.fillStyle = mixRgbStr(cLo, cHi, 0.45, op * 0.78);
        } else {
          g.fillStyle = `rgba(${cLo.r},${cLo.g},${cLo.b},${op * 0.48})`;
        }
        g.fillRect(bx, cellY, px, px);
      };

      // Subtle CRT glow behind bright 2-bit blocks
      if (gl > 0.15 && quantRows > 1) {
        g.globalCompositeOperation = 'lighter';
        g.fillStyle = `rgba(${cHi.r},${cHi.g},${cHi.b},${op * 0.16 * gl})`;
        if (mirror) g.fillRect(bx - 1, cy - quantRows * pitchY - 1, px + 2, quantRows * pitchY * 2 + 2);
        else g.fillRect(bx - 1, bottomY - quantRows * pitchY - 1, px + 2, quantRows * pitchY + 2);
        g.globalCompositeOperation = 'source-over';
      }

      for (let r = 0; r < quantRows; r++) {
        const frac = (r + 1) / Math.max(1, rowsHalf);
        const shade = r === quantRows - 1 && quantRows > 1 ? 3 : (frac > 0.55 ? 2 : (frac > 0.25 ? 1 : 0));
        if (mirror) {
          drawCell(cy - (r + 1) * pitchY, shade);
          drawCell(cy + r * pitchY + 1, shade);
        } else {
          drawCell(bottomY - r * pitchY, shade);
        }
      }

      // 2-Bit Peak-Hold Floating Pixel Cap
      if (wv.peakHold && quantPeak > quantRows) {
        g.fillStyle = mixRgbStr(cHi, { r: 255, g: 255, b: 255 }, 0.55, op);
        if (mirror) {
          g.fillRect(bx, cy - (quantPeak + 1) * pitchY, px, px);
          g.fillRect(bx, cy + quantPeak * pitchY + 1, px, px);
        } else {
          g.fillRect(bx, bottomY - quantPeak * pitchY, px, px);
        }
      }
    }

    // Crisp horizontal CRT scanlines overlay when grid is active
    if (wv.grid && px >= 4) {
      g.fillStyle = 'rgba(0,0,0,0.22)';
      for (let y = 0; y < H; y += Math.max(2, Math.floor(px / 2))) {
        g.fillRect(0, y, Wd, 1);
      }
    }

    g.imageSmoothingEnabled = prevSmooth;
    g.globalAlpha = 1;
  }

  // =========================================================================
  // STYLE 2: SIRI RIBBON (Multi-Harmonic Fluid Translucent Silk Bands)
  // =========================================================================
  function drawSiriRibbon(t, wv, bl) {
    if (wv.mute || wv.opacity <= 0) return;
    const det = Math.max(1, Math.min(5, wv.detail || 3));
    const cyc = 1.4 + det * 0.75;
    const rate = 0.16 + 2.4 * (eff(wv, 'speed') / 100);
    const s = t / 1000;
    const avgL = bl[wv.band] ?? bl.rms;
    const N = Math.max(72, Math.floor(Wd / 2));
    ensureYBuf(N + 1);
    const cy = H / 2;
    const ph1 = s * 2.7 * rate;
    const ph2 = -s * 1.9 * rate + 1.15;
    const mirror = wv.mirror !== false;

    for (let i = 0; i <= N; i++) {
      const u = i / N;
      const win = Math.pow(Math.sin(Math.PI * u), 1.35);
      const a = ampAtU(u, bl, wv) * (0.28 + 0.72 * win);
      const disp = a * (
        0.68 * Math.sin(2 * Math.PI * cyc * u - ph1) +
        0.24 * Math.sin(2 * Math.PI * (cyc * 1.8) * u + ph2) +
        0.08 * Math.cos(2 * Math.PI * (cyc * 2.7) * u - ph1 * 0.7)
      );
      yBuf[i] = cy + disp;
      yMirrorBuf[i] = mirror ? cy - disp * 0.62 : cy;
      yAuxBuf[i] = cy + disp * 0.45 * Math.cos(u * Math.PI * 3 + ph2 * 0.8);
    }

    const col = strokeFor(wv, t);
    const colSolid = wv.colorMode === 'rainbow' ? '#60a5fa' : wv.c1;
    const colSec = wv.colorMode === 'gradient' ? wv.c2 : colSolid;
    const op = wv.opacity / 100, gl = wv.glow / 100;
    const thick = (+wv.thick || 2) + 0.9 * sm(avgL);

    // Volumetric translucent silk body
    g.beginPath();
    for (let i = 0; i <= N; i++) {
      const x = (i / N) * Wd;
      i ? g.lineTo(x, yBuf[i]) : g.moveTo(x, yBuf[i]);
    }
    for (let i = N; i >= 0; i--) {
      g.lineTo((i / N) * Wd, yMirrorBuf[i]);
    }
    g.closePath();
    const fillGr = g.createLinearGradient(0, cy - H * 0.42, 0, cy + H * 0.42);
    fillGr.addColorStop(0, rgba(colSolid, 0.28));
    fillGr.addColorStop(0.5, rgba(colSec, 0.08));
    fillGr.addColorStop(1, rgba(colSec, 0.24));
    g.globalAlpha = op * 0.9;
    g.fillStyle = wv.colorMode === 'rainbow' ? col : fillGr;
    g.fill();

    g.lineCap = 'round';
    g.lineJoin = 'round';
    // Inner harmonic filament
    traceBuf(N, yAuxBuf);
    g.strokeStyle = colSec;
    g.globalAlpha = op * 0.42;
    g.lineWidth = Math.max(1, thick * 0.65);
    g.stroke();

    if (mirror) {
      traceBuf(N, yMirrorBuf);
      g.strokeStyle = colSec;
      g.globalAlpha = op * 0.48;
      g.lineWidth = Math.max(1, thick * 0.78);
      g.stroke();
    }

    traceBuf(N, yBuf);
    g.strokeStyle = col;
    if (gl > 0) {
      g.globalCompositeOperation = 'lighter';
      g.globalAlpha = op * sm(0.32 * gl);
      g.lineWidth = thick + 4 + gl * 11;
      g.stroke();
      g.globalCompositeOperation = 'source-over';
    }
    g.globalAlpha = op;
    g.lineWidth = thick;
    g.stroke();
    g.globalAlpha = 1;
  }

  // =========================================================================
  // STYLE 3: CAPSULE EQ (Rounded/Square/Needle + Real Gravity Peak-Hold Caps)
  // =========================================================================
  function drawCapsuleEq(t, dt, wv, bl) {
    if (wv.mute || wv.opacity <= 0) return;
    const count = Math.max(8, Math.min(48, Math.round(wv.barCount ?? 24)));
    const gap = Math.max(0, Math.min(8, +(wv.barGap ?? 2)));
    const shape = wv.barShape === 'square' || wv.barShape === 'needle' ? wv.barShape : 'rounded';
    const mirror = wv.mirror !== false;
    const det = Math.max(1, Math.min(5, wv.detail || 3));
    const cyc = 1.3 + det * 0.85;
    const rate = 0.16 + 2.5 * (eff(wv, 'speed') / 100);
    const s = t / 1000;
    const slot = Wd / count;
    const bw = Math.max(1.5, slot - gap);
    const col = strokeFor(wv, t);
    const colSolid = wv.colorMode === 'rainbow' ? '#34d399' : wv.c1;
    const op = wv.opacity / 100, gl = wv.glow / 100;
    const pkState = getPeakBuf(wv);
    const cy = H / 2;
    const bottomY = H - 3;

    for (let i = 0; i < count; i++) {
      const u = (i + 0.5) / count;
      const win = 0.3 + 0.7 * Math.sin(Math.PI * u);
      const amp = ampAtU(u, bl, wv);
      const mod = 0.28 + 0.72 * (0.5 + 0.5 * Math.sin(2 * Math.PI * cyc * u - s * 2.5 * rate + Math.sin(s * 1.5 * rate + u * 4.2)));
      const rawH = Math.max(bw, Math.min(H * 0.88, amp * 1.95 * mod * win));
      const h = mirror ? rawH : Math.max(3, rawH * 0.85);
      barGeoX[i] = i * slot + (slot - bw) / 2;
      barGeoH[i] = h;
      barGeoY[i] = mirror ? (cy - h / 2) : (bottomY - h);

      const valNorm = mirror ? h / 2 : h;
      let pk = pkState.vals[i] || valNorm;
      if (valNorm >= pk) {
        pk = valNorm;
        pkState.vels[i] = 0;
      } else if (dt > 0) {
        pkState.vels[i] += 110 * dt;
        pk = Math.max(valNorm, pk - pkState.vels[i] * dt);
      }
      pkState.vals[i] = pk;
    }

    if (gl > 0) {
      g.globalCompositeOperation = 'lighter';
      g.globalAlpha = op * 0.2 * gl;
      g.fillStyle = rgba(colSolid, 0.55);
      for (let i = 0; i < count; i++) g.fillRect(barGeoX[i] - 1, barGeoY[i] - 1, bw + 2, barGeoH[i] + 2);
      g.globalCompositeOperation = 'source-over';
    }

    g.globalAlpha = op * 0.94;
    if (shape === 'needle') {
      g.strokeStyle = col;
      g.lineWidth = Math.max(1.2, Math.min(2.6, bw * 0.38));
      g.lineCap = 'round';
      g.beginPath();
      for (let i = 0; i < count; i++) {
        const nx = barGeoX[i] + bw / 2;
        g.moveTo(nx, barGeoY[i]);
        g.lineTo(nx, barGeoY[i] + barGeoH[i]);
      }
      g.stroke();
    } else {
      g.fillStyle = col;
      const r = shape === 'square' ? 0 : Math.min(bw / 2, 4);
      g.beginPath();
      for (let i = 0; i < count; i++) {
        if (r > 0 && typeof g.roundRect === 'function') {
          g.moveTo(barGeoX[i], barGeoY[i]);
          g.roundRect(barGeoX[i], barGeoY[i], bw, barGeoH[i], r);
        } else {
          g.rect(barGeoX[i], barGeoY[i], bw, barGeoH[i]);
        }
      }
      g.fill();
    }

    // Floating gravity peak-hold caps
    if (wv.peakHold) {
      g.globalAlpha = op * 0.88;
      g.fillStyle = '#ffffff';
      const capH = Math.max(1.5, Math.min(3, bw * 0.32));
      for (let i = 0; i < count; i++) {
        const pk = pkState.vals[i];
        if (mirror) {
          const topY = Math.max(2, cy - pk - capH - 1.5);
          const botY = Math.min(H - capH - 2, cy + pk + 1.5);
          g.fillRect(barGeoX[i], topY, bw, capH);
          g.fillRect(barGeoX[i], botY, bw, capH);
        } else {
          const topY = Math.max(2, bottomY - pk - capH - 2);
          g.fillRect(barGeoX[i], topY, bw, capH);
        }
      }
    }
    g.globalAlpha = 1;
  }

  // =========================================================================
  // STYLE 4: DROPLET ORB (Apple Droplet Refractive Core + Specular Horizon)
  // =========================================================================
  function drawDropletOrb(t, wv, bl) {
    if (wv.mute || wv.opacity <= 0) return;
    const det = Math.max(1, Math.min(5, wv.detail || 3));
    const cyc = 1.2 + det * 0.65;
    const rate = 0.16 + 2.4 * (eff(wv, 'speed') / 100);
    const s = t / 1000;
    const avgL = bl[wv.band] ?? bl.rms;
    const N = Math.max(64, Math.floor(Wd / 2));
    ensureYBuf(N + 1);
    const cy = H / 2, cx = Wd / 2;
    const ph = s * 2.4 * rate;
    const mirror = wv.mirror !== false;

    for (let i = 0; i <= N; i++) {
      const u = i / N;
      const lens = Math.pow(Math.sin(Math.PI * u), 1.45);
      const lobe = 0.55 + 0.45 * Math.cos(Math.PI * (2 * u - 1) * cyc - ph * 0.5);
      const ripple = 0.2 * Math.sin(2 * Math.PI * (cyc * 1.9) * u + ph);
      const rad = Math.max(1.2, ampAtU(u, bl, wv) * lens * (0.45 + 0.55 * lobe + ripple));
      yBuf[i] = cy - rad;
      yMirrorBuf[i] = mirror ? cy + rad : cy + rad * 0.2;
    }

    const col = strokeFor(wv, t);
    const colSolid = wv.colorMode === 'rainbow' ? '#7dd3fc' : wv.c1;
    const colSec = wv.colorMode === 'gradient' ? wv.c2 : colSolid;
    const op = wv.opacity / 100, gl = wv.glow / 100;
    const thick = (+wv.thick || 2) + 0.8 * sm(avgL);

    g.beginPath();
    for (let i = 0; i <= N; i++) { const x = (i / N) * Wd; i ? g.lineTo(x, yBuf[i]) : g.moveTo(x, yBuf[i]); }
    for (let i = N; i >= 0; i--) { g.lineTo((i / N) * Wd, yMirrorBuf[i]); }
    g.closePath();

    const bodyGr = g.createLinearGradient(0, cy - H * 0.38, 0, cy + H * 0.38);
    bodyGr.addColorStop(0, rgba(colSolid, 0.35));
    bodyGr.addColorStop(0.5, rgba(colSec, 0.14));
    bodyGr.addColorStop(1, rgba(colSec, 0.32));
    g.globalAlpha = op;
    g.fillStyle = wv.colorMode === 'rainbow' ? col : bodyGr;
    g.fill();

    // Central luminous Apple droplet lens
    const coreR = Math.max(6, Math.min(H * 0.38, 6 + ampOf(H, avgL, wv) * 0.88));
    const orbGr = g.createRadialGradient(cx, cy - coreR * 0.22, 1, cx, cy, coreR * 1.45);
    orbGr.addColorStop(0, 'rgba(255,255,255,0.92)');
    orbGr.addColorStop(0.32, rgba(colSolid, 0.72));
    orbGr.addColorStop(0.75, rgba(colSec, 0.2));
    orbGr.addColorStop(1, 'rgba(0,0,0,0)');
    if (gl > 0) g.globalCompositeOperation = 'lighter';
    g.globalAlpha = op * (0.72 + 0.28 * sm(avgL));
    g.fillStyle = orbGr;
    g.beginPath();
    g.arc(cx, cy, coreR * 1.45, 0, Math.PI * 2);
    g.fill();
    g.globalCompositeOperation = 'source-over';

    g.lineCap = 'round';
    g.lineJoin = 'round';
    traceBuf(N, yBuf);
    g.strokeStyle = col;
    g.globalAlpha = op * 0.96;
    g.lineWidth = thick;
    g.stroke();

    traceBuf(N, yMirrorBuf);
    g.globalAlpha = op * 0.65;
    g.lineWidth = Math.max(1, thick * 0.78);
    g.stroke();
    g.globalAlpha = 1;
  }

  // =========================================================================
  // STYLE 5: LASER OSCILLOSCOPE (Crisp Phosphor Vector Trace + Calibration Grid)
  // =========================================================================
  function drawLaserScope(t, wv, bl) {
    if (wv.mute || wv.opacity <= 0) return;
    const det = Math.max(1, Math.min(5, wv.detail || 3));
    const rate = 0.2 + 2.8 * (eff(wv, 'speed') / 100);
    const s = t / 1000;
    const avgL = bl[wv.band] ?? bl.rms;
    const N = Math.max(84, Math.min(240, Math.floor(Wd / 2)));
    ensureYBuf(N + 1);
    const cy = H / 2;
    const col = strokeFor(wv, t);
    const colSolid = wv.colorMode === 'rainbow' ? '#22d3ee' : wv.c1;
    const colSec = wv.colorMode === 'gradient' ? wv.c2 : colSolid;
    const op = wv.opacity / 100, gl = wv.glow / 100;
    const thick = (+wv.thick || 2) + 0.7 * sm(avgL);

    // Optional oscilloscope calibration reticle
    if (wv.grid) {
      g.strokeStyle = rgba(colSolid, 0.14);
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(0, cy); g.lineTo(Wd, cy);
      g.moveTo(Wd / 2, 4); g.lineTo(Wd / 2, H - 4);
      const step = Math.max(24, Wd / 10);
      for (let x = step; x < Wd; x += step) {
        g.moveTo(x, cy - 4); g.lineTo(x, cy + 4);
      }
      g.stroke();
    }

    const useRealSamples = !!(analyser && micBuf && micBuf.length >= N);
    const gainScale = 0.35 + 1.75 * (eff(wv, 'intensity') / 100);
    for (let i = 0; i <= N; i++) {
      const u = i / N;
      const edgeFade = Math.sin(Math.PI * u);
      let disp = 0;
      if (useRealSamples) {
        const idx = Math.min(micBuf.length - 1, Math.floor(u * (micBuf.length - 1)));
        disp = micBuf[idx] * H * 0.85 * gainScale * (0.35 + 0.65 * edgeFade);
      } else {
        const a = ampAtU(u, bl, wv);
        const f1 = 2 + det * 1.4;
        disp = a * (
          0.62 * Math.sin(2 * Math.PI * f1 * u - s * 4.5 * rate) +
          0.26 * Math.sin(2 * Math.PI * (f1 * 2.1) * u + s * 6.2 * rate) +
          0.12 * Math.cos(2 * Math.PI * (f1 * 3.7) * u - s * 9.1 * rate)
        );
      }
      yBuf[i] = cy + disp;
      yMirrorBuf[i] = cy - disp * 0.55;
    }

    g.lineCap = 'round';
    g.lineJoin = 'round';
    if (wv.mirror) {
      traceBuf(N, yMirrorBuf);
      g.strokeStyle = colSec;
      g.globalAlpha = op * 0.32;
      g.lineWidth = Math.max(1, thick * 0.72);
      g.stroke();
    }

    traceBuf(N, yBuf);
    g.strokeStyle = col;
    if (gl > 0) {
      g.globalCompositeOperation = 'lighter';
      g.globalAlpha = op * sm(0.35 * gl);
      g.lineWidth = thick + 4 + gl * 10;
      g.stroke();
      g.globalCompositeOperation = 'source-over';
    }
    g.globalAlpha = op;
    g.lineWidth = thick;
    g.stroke();
    g.globalAlpha = 1;
  }

  // =========================================================================
  // STYLE 6: SONIC RINGS (Concentric Expanding Radar Ripples)
  // =========================================================================
  function drawSonicRings(t, wv, bl) {
    if (wv.mute || wv.opacity <= 0) return;
    const det = Math.max(1, Math.min(5, wv.detail || 3));
    const rings = det + 2; // 3..7 concentric waves
    const rate = 0.25 + 1.8 * (eff(wv, 'speed') / 100);
    const s = t / 1000;
    const avgL = bl[wv.band] ?? bl.rms;
    const cx = Wd / 2, cy = H / 2;
    const maxR = Math.min(Wd * 0.44, H * 0.46) * (0.45 + 0.7 * (eff(wv, 'intensity') / 100) * (0.35 + 0.85 * sm(avgL)));
    const rxRatio = Math.max(1, Math.min(2.6, Wd / Math.max(40, H * 1.45)));
    const colSolid = wv.colorMode === 'rainbow'
      ? `hsl(${((s * 60 * rate) | 0) % 360} 90% 64%)`
      : wv.c1;
    const colSec = wv.colorMode === 'gradient' ? wv.c2 : wv.c1;
    const op = wv.opacity / 100, gl = wv.glow / 100;
    const lw = Math.max(1, +wv.thick || 2);

    if (wv.grid) {
      g.strokeStyle = rgba(wv.c1, 0.14);
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(cx - maxR * rxRatio, cy); g.lineTo(cx + maxR * rxRatio, cy);
      g.moveTo(cx, 3); g.lineTo(cx, H - 3);
      g.stroke();
    }

    for (let k = 0; k < rings; k++) {
      const p = ((s * 0.55 * rate + k / rings) % 1);
      const rY = Math.max(3, 4 + p * Math.max(8, maxR));
      const rX = wv.mirror ? rY * rxRatio : rY;
      const alpha = (1 - p) * (0.25 + 0.75 * sm(avgL)) * op;
      if (alpha <= 0.02) continue;

      g.beginPath();
      if (typeof g.ellipse === 'function') {
        g.ellipse(cx, cy, rX, rY, 0, 0, Math.PI * 2);
      } else {
        g.arc(cx, cy, rY, 0, Math.PI * 2);
      }
      g.strokeStyle = k % 2 === 0 ? colSolid : colSec;
      if (gl > 0) {
        g.globalCompositeOperation = 'lighter';
        g.globalAlpha = alpha * 0.35 * gl;
        g.lineWidth = lw + 3 + gl * 6;
        g.stroke();
        g.globalCompositeOperation = 'source-over';
      }
      g.globalAlpha = alpha;
      g.lineWidth = lw * (1.15 - p * 0.5);
      g.stroke();
    }

    // Center acoustic ping dot
    const dotR = Math.max(3, Math.min(H * 0.18, 3.5 + avgL * 8));
    g.globalAlpha = op * (0.55 + 0.45 * sm(avgL));
    g.fillStyle = colSolid;
    g.beginPath();
    g.arc(cx, cy, dotR, 0, Math.PI * 2);
    g.fill();
    g.globalAlpha = 1;
  }

  // =========================================================================
  // STYLE 7: STARBURST PARTICLES (Luminous Sound-Reactive Constellation)
  // =========================================================================
  function drawStarburstParticles(t, wv, bl) {
    if (wv.mute || wv.opacity <= 0) return;
    const det = Math.max(1, Math.min(5, wv.detail || 3));
    const count = 14 + det * 10; // 24..64 particles
    const rate = 0.25 + 2.2 * (eff(wv, 'speed') / 100);
    const s = t / 1000;
    const avgL = bl[wv.band] ?? bl.rms;
    const op = wv.opacity / 100, gl = wv.glow / 100;
    const colA = parseHex(wv.c1);
    const colB = parseHex(wv.colorMode === 'gradient' ? wv.c2 : wv.c1);
    const intScale = 0.35 + 1.45 * (eff(wv, 'intensity') / 100);
    const cy = H / 2;

    if (gl > 0.1) g.globalCompositeOperation = 'lighter';
    for (let i = 0; i < count; i++) {
      const sd = STAR_SEEDS[i];
      const u = (sd.u + s * 0.04 * rate * sd.speedMul) % 1;
      const x = u * Wd;
      const envAtX = profMul(wv.profile || 'center', u);
      const spread = (H * 0.38) * intScale * envAtX * (0.15 + 0.95 * sm(avgL));
      const yOff = sd.lane * spread + Math.sin(s * 2.2 * rate * sd.speedMul + sd.phase) * (2 + 6 * sm(avgL));
      const y = cy + (wv.mirror === false ? -Math.abs(yOff) * 0.85 : yOff);
      const r = sd.radius * (0.8 + 1.15 * sm(avgL)) * ((+wv.thick || 2) * 0.55);

      const mixT = (i % 5) / 4;
      const colStr = wv.colorMode === 'rainbow'
        ? `hsla(${((s * 50 * rate + u * 320) | 0) % 360}, 90%, 68%, ${op * (0.4 + 0.6 * sm(avgL))})`
        : mixRgbStr(colA, colB, mixT, op * (0.35 + 0.65 * sm(avgL)));

      g.fillStyle = colStr;
      g.beginPath();
      g.arc(x, y, Math.max(0.9, r), 0, Math.PI * 2);
      g.fill();

      if (gl > 0.25 && avgL > 0.12) {
        g.fillStyle = mixRgbStr(colA, { r: 255, g: 255, b: 255 }, 0.35, op * 0.22 * gl);
        g.beginPath();
        g.arc(x, y, Math.max(2, r * 2.4), 0, Math.PI * 2);
        g.fill();
      }
    }
    g.globalCompositeOperation = 'source-over';
    g.globalAlpha = 1;
  }

  // =========================================================================
  // STYLE 8: AURORA CURTAIN (Northern Lights Vertical Billowing Curtains)
  // =========================================================================
  function drawAuroraCurtain(t, wv, bl) {
    if (wv.mute || wv.opacity <= 0) return;
    const det = Math.max(1, Math.min(5, wv.detail || 3));
    const folds = 2 + det * 1.1;
    const rate = 0.14 + 2.0 * (eff(wv, 'speed') / 100);
    const s = t / 1000;
    const avgL = bl[wv.band] ?? bl.rms;
    const N = Math.max(64, Math.floor(Wd / 3));
    ensureYBuf(N + 1);
    const cy = H / 2;
    const ph = s * 1.8 * rate;
    const col = strokeFor(wv, t);
    const col1 = wv.colorMode === 'rainbow' ? '#5eead4' : wv.c1;
    const col2 = wv.colorMode === 'gradient' ? wv.c2 : col1;
    const op = wv.opacity / 100, gl = wv.glow / 100;

    for (let i = 0; i <= N; i++) {
      const u = i / N;
      const win = Math.sin(Math.PI * u);
      const a = ampAtU(u, bl, wv) * (0.45 + 0.55 * win);
      const wave = 0.5 + 0.5 * Math.sin(u * Math.PI * folds - ph + 0.6 * Math.cos(u * Math.PI * 2 + ph * 0.5));
      const hCurtain = Math.max(4, a * (0.8 + 1.35 * wave));
      yBuf[i] = Math.max(2, cy - hCurtain);
      yMirrorBuf[i] = wv.mirror === false ? H - 2 : Math.min(H - 2, cy + hCurtain * 0.72);
    }

    g.beginPath();
    for (let i = 0; i <= N; i++) { const x = (i / N) * Wd; i ? g.lineTo(x, yBuf[i]) : g.moveTo(x, yBuf[i]); }
    for (let i = N; i >= 0; i--) { g.lineTo((i / N) * Wd, yMirrorBuf[i]); }
    g.closePath();

    const fillGr = g.createLinearGradient(0, 0, 0, H);
    fillGr.addColorStop(0, rgba(col1, 0.04));
    fillGr.addColorStop(0.35, rgba(col1, 0.36));
    fillGr.addColorStop(0.55, rgba(col2, 0.42));
    fillGr.addColorStop(1, rgba(col2, 0.05));
    if (gl > 0.15) g.globalCompositeOperation = 'lighter';
    g.globalAlpha = op * (0.65 + 0.35 * sm(avgL));
    g.fillStyle = wv.colorMode === 'rainbow' ? col : fillGr;
    g.fill();
    g.globalCompositeOperation = 'source-over';

    // Luminous upper ridge
    traceBuf(N, yBuf);
    g.strokeStyle = col;
    g.lineWidth = Math.max(1.2, (+wv.thick || 2) * 0.85);
    g.globalAlpha = op * 0.78;
    g.stroke();
    g.globalAlpha = 1;
  }

  // Ambient sparkles & backdrop aurora
  const PARTS = Array.from({ length: 24 }, (_, i) => ({ u: (i + 0.5) / 24, sz: 1 + (i % 2), al: 0.2 + 0.28 * ((i * 53 % 10) / 10), j: (i * 7919 % 100) / 100 * 6.283 }));
  function drawParts(t, top) {
    const n = Math.min(cfg.particles || 0, 24);
    if (n <= 0 || !top) return;
    const rate = 0.12 + 2.6 * ((cfg.speed ?? 52) / 100);
    const A = ampOf(H, sm(env), top);
    const col = top.colorMode === 'rainbow' ? '#9adcff' : top.c1;
    const rgb = parseHex(col);
    g.fillStyle = `rgb(${rgb.r},${rgb.g},${rgb.b})`;
    for (let i = 0; i < n; i++) {
      const q = PARTS[i], x = q.u * Wd;
      const y = H / 2 + Math.sin(2 * Math.PI * 2.5 * q.u + 0.6) * A * 0.65 + Math.sin(t / 700 * rate + q.j) * (0.8 + A * 0.16);
      g.globalAlpha = q.al * (0.45 + 0.55 * sm(env));
      g.beginPath(); g.arc(x, y, q.sz, 0, Math.PI * 2); g.fill();
    }
    g.globalAlpha = 1;
  }
  function drawAurora() {
    if (!cfg.aurora?.on) return;
    const a = +(0.06 + 0.16 * sm(envSlow)).toFixed(3);
    const gr = g.createLinearGradient(0, 0, 0, H);
    gr.addColorStop(0, `rgba(${auroraRgb.r},${auroraRgb.g},${auroraRgb.b},${a})`);
    gr.addColorStop(1, `rgba(168,85,247,${a})`);
    g.fillStyle = gr; g.fillRect(0, 0, Wd, H);
  }

  function drawStack(t, dt, bl0) {
    drawAurora();
    const bl = bl0 || { low: 0, mid: 0, high: 0, rms: 0 };
    const vis = cfg.waves || [];
    if (dt > 0) {
      for (let i = 0; i < vis.length; i++) {
        if (!vis[i].mute) smoothWaveBands(vis[i], bl, dt);
      }
    }
    let front = null;
    for (let i = vis.length - 1; i >= 0; i--) {
      const wv = vis[i];
      if (wv.mute) continue;
      front = wv;
      const smBl = fillSmBl(wv, bl);
      if (wv.type === 'pixel-2bit') drawPixel2Bit(t, dt, wv, smBl);
      else if (wv.type === 'capsule-eq') drawCapsuleEq(t, dt, wv, smBl);
      else if (wv.type === 'droplet-orb') drawDropletOrb(t, wv, smBl);
      else if (wv.type === 'laser-scope') drawLaserScope(t, wv, smBl);
      else if (wv.type === 'sonic-rings') drawSonicRings(t, wv, smBl);
      else if (wv.type === 'starburst-particles') drawStarburstParticles(t, wv, smBl);
      else if (wv.type === 'aurora-curtain') drawAuroraCurtain(t, wv, smBl);
      else drawSiriRibbon(t, wv, smBl);
    }
    if (front && front.type !== 'pixel-2bit' && front.type !== 'starburst-particles') drawParts(t, front);
  }

  function canAnimate() {
    if (reduced || (typeof document !== 'undefined' && document.hidden)) return false;
    if (stripState === 'paused' || stripState === 'transcribing') return true;
    return Boolean(analyser) || fakeOn;
  }

  function paintIdleSnapshot() {
    if (typeof document !== 'undefined' && document.hidden) return;
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    if (stripState === 'paused') drawPausedState(now - t0);
    else if (stripState === 'transcribing') drawTranscribingState(now - t0);
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
      last = typeof performance !== 'undefined' ? performance.now() : Date.now();
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
      const alive = new Set((c.waves || []).map(w => w.id));
      for (const k of wSm.keys()) { if (!alive.has(k)) wSm.delete(k); }
      for (const k of wPeaks.keys()) { if (!alive.has(k)) wPeaks.delete(k); }
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
      if (stripState === 'paused') { drawPausedState(now - t0); return; }
      if (stripState === 'transcribing') { drawTranscribingState(now - t0); return; }
      if (reduced || (!analyser && !fakeOn)) { drawStaticLine(); return; }
      if (!lastF) lastF = now;
      const dt = Math.min(0.1, Math.max(0.001, (now - lastF) / 1000));
      lastF = now;
      stepLevel(now - t0, dt);
      drawStack(now - t0, dt, bandLevels());
    },
    renderOnce() {
      fit();
      g.clearRect(0, 0, Wd, H);
      const bl = { low: 0.48, mid: 0.62, high: 0.52, rms: 0.56 };
      for (const wv of (cfg.waves || [])) {
        if (wv.mute) continue;
        const arr = getSmArr(wv);
        arr[0] = bl.low; arr[1] = bl.mid; arr[2] = bl.high; arr[3] = bl.rms;
      }
      drawStack(1450, 0.016, bl);
    },
  };
}
