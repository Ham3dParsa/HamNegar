// Module: wave (v4 — ground-up rebuild)
// Interface: createWaveRenderer(canvas) -> { setConfig, setState, setAnalyser, setFakeEnabled, getLevel, start, stop, renderFrame, renderOnce }
//            + WAVE_PRESETS, presetById, randomWaveConfig, WAVE_STYLES_FA, WAVE_COLOR_MODES_FA, WAVE_PALETTES
// Architecture: 5 crisp, minimal, modern Canvas2D visualizers (sine, zigzag, bars, dots, pixel-2bit),
// DPR-aware rAF, real mic FFT + synthetic preview signal, smooth gravity peaks, zero allocation churn.
import { defaultWaveConfig } from './storage.js';

export const WAVE_STYLES_FA = {
  sine: 'سینوسی نرم',
  zigzag: 'زیگزاگ هندسی',
  bars: 'میله‌ای مینیمال',
  dots: 'پالس نقطه‌ای',
  'pixel-2bit': 'رترو ۲بیتی',
};

export const WAVE_COLOR_MODES_FA = {
  solid: 'تک‌رنگ',
  gradient: 'گرادیان',
  rainbow: 'رنگین‌کمان',
};

export const WAVE_PALETTES = [
  { id: 'glacier', n: 'یخی اقیانوسی', mode: 'gradient', c1: '#60a5fa', c2: '#a78bfa' },
  { id: 'cyber', n: 'نئون سایبری', mode: 'gradient', c1: '#22d3ee', c2: '#f472b6' },
  { id: 'emerald', n: 'زمرد استودیو', mode: 'gradient', c1: '#34d399', c2: '#38bdf8' },
  { id: 'sunset', n: 'غروب گرم', mode: 'gradient', c1: '#fb7185', c2: '#fbbf24' },
  { id: 'gameboy', n: '۲بیتی کلاسیک', mode: 'gradient', c1: '#9bbc0f', c2: '#306230' },
  { id: 'amber', n: 'کهربایی رترو', mode: 'gradient', c1: '#fde047', c2: '#ea580c' },
  { id: 'rainbow', n: 'طیف رنگین‌کمان', mode: 'rainbow', c1: '#60a5fa', c2: '#f472b6' },
];

export const WAVE_PRESETS = [
  {
    id: 'glacial-sine',
    n: 'سینوسی یخی',
    tag: 'سینوسی',
    cfg: { style: 'sine', colorMode: 'gradient', c1: '#60a5fa', c2: '#a78bfa', glow: 64, sensitivity: 58, speed: 52, smooth: 58, density: 48, mirror: true },
  },
  {
    id: 'neon-zigzag',
    n: 'زیگزاگ نئون',
    tag: 'زیگزاگ',
    cfg: { style: 'zigzag', colorMode: 'gradient', c1: '#22d3ee', c2: '#f472b6', glow: 78, sensitivity: 62, speed: 56, smooth: 44, density: 54, mirror: true },
  },
  {
    id: 'studio-bars',
    n: 'میله‌های مینیمال',
    tag: 'میله‌ای',
    cfg: { style: 'bars', colorMode: 'gradient', c1: '#34d399', c2: '#38bdf8', glow: 48, sensitivity: 60, speed: 50, smooth: 52, density: 50, mirror: true },
  },
  {
    id: 'aurora-dots',
    n: 'پالس شفق',
    tag: 'نقطه‌ای',
    cfg: { style: 'dots', colorMode: 'gradient', c1: '#818cf8', c2: '#f472b6', glow: 68, sensitivity: 60, speed: 52, smooth: 56, density: 52, mirror: true },
  },
  {
    id: 'retro-2bit',
    n: 'رترو ۲بیتی',
    tag: '۲بیتی',
    cfg: { style: 'pixel-2bit', colorMode: 'gradient', c1: '#9bbc0f', c2: '#306230', glow: 22, sensitivity: 62, speed: 54, smooth: 40, density: 52, mirror: true },
  },
  {
    id: 'amber-2bit',
    n: 'کهربایی ۲بیتی',
    tag: '۲بیتی',
    cfg: { style: 'pixel-2bit', colorMode: 'gradient', c1: '#fde047', c2: '#ea580c', glow: 34, sensitivity: 60, speed: 50, smooth: 42, density: 46, mirror: false },
  },
  {
    id: 'sunset-sine',
    n: 'غروب مینیمال',
    tag: 'سینوسی',
    cfg: { style: 'sine', colorMode: 'gradient', c1: '#fb7185', c2: '#fbbf24', glow: 58, sensitivity: 56, speed: 46, smooth: 64, density: 44, mirror: false },
  },
  {
    id: 'prism-bars',
    n: 'طیف رنگین‌کمان',
    tag: 'رنگین‌کمان',
    cfg: { style: 'bars', colorMode: 'rainbow', c1: '#60a5fa', c2: '#f472b6', glow: 62, sensitivity: 60, speed: 58, smooth: 50, density: 56, mirror: true },
  },
];

export function presetById(id) {
  return WAVE_PRESETS.find((p) => p.id === id) || null;
}

export function randomWaveConfig() {
  const styles = ['sine', 'zigzag', 'bars', 'dots', 'pixel-2bit'];
  const style = styles[Math.floor(Math.random() * styles.length)];
  const pal = WAVE_PALETTES[Math.floor(Math.random() * WAVE_PALETTES.length)];
  return {
    version: 4,
    presetId: 'custom',
    style,
    colorMode: pal.mode,
    c1: pal.c1,
    c2: pal.c2,
    glow: style === 'pixel-2bit' ? 28 : 42 + Math.floor(Math.random() * 45),
    sensitivity: 50 + Math.floor(Math.random() * 24),
    speed: 40 + Math.floor(Math.random() * 32),
    smooth: 38 + Math.floor(Math.random() * 30),
    density: 36 + Math.floor(Math.random() * 36),
    mirror: Math.random() > 0.25,
  };
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

function hexToRgb(hex) {
  const h = String(hex || '#60a5fa').replace('#', '');
  const n = parseInt(h.length === 6 ? h : '60a5fa', 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function mixRgb(a, b, t) {
  const k = clamp(t, 0, 1);
  return [
    Math.round(a[0] + (b[0] - a[0]) * k),
    Math.round(a[1] + (b[1] - a[1]) * k),
    Math.round(a[2] + (b[2] - a[2]) * k),
  ];
}

function rgba(rgb, alpha = 1) {
  return `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${clamp(alpha, 0, 1).toFixed(3)})`;
}

function hslToRgb(h, s, l) {
  const hn = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((hn / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0, g = 0, b = 0;
  if (hn < 60) { r = c; g = x; }
  else if (hn < 120) { r = x; g = c; }
  else if (hn < 180) { g = c; b = x; }
  else if (hn < 240) { g = x; b = c; }
  else if (hn < 300) { r = x; b = c; }
  else { r = c; b = x; }
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
}

export function createWaveRenderer(canvas) {
  let cfg = defaultWaveConfig();
  let state = 'idle'; // 'idle' | 'recording' | 'paused' | 'transcribing'
  let analyser = null;
  let fakeEnabled = false;
  let rafId = 0;
  let lastNow = 0;
  let phase = 0;
  let envLevel = 0;
  let width = 320;
  let height = 72;
  let dpr = 1;

  const BIN_COUNT = 64;
  const bins = new Float32Array(BIN_COUNT);
  const peaks = new Float32Array(BIN_COUNT);
  let freqBuf = null;
  let timeBuf = null;

  const ctx = canvas ? canvas.getContext('2d') : null;

  function syncSize() {
    if (!canvas || !ctx) return false;
    const rect = canvas.getBoundingClientRect();
    const cssW = Math.max(120, Math.round(rect.width || canvas.clientWidth || canvas.width || 320));
    const cssH = Math.max(40, Math.round(rect.height || canvas.clientHeight || canvas.height || 72));
    const nextDpr = Math.min(2, window.devicePixelRatio || 1);
    const targetW = Math.round(cssW * nextDpr);
    const targetH = Math.round(cssH * nextDpr);
    if (canvas.width !== targetW || canvas.height !== targetH) {
      canvas.width = targetW;
      canvas.height = targetH;
    }
    width = cssW;
    height = cssH;
    dpr = nextDpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return true;
  }

  function sampleAudio(now, dt) {
    const sens = 0.55 + (cfg.sensitivity / 100) * 1.65;
    const smoothFactor = clamp(0.12 + (1 - cfg.smooth / 100) * 0.42, 0.08, 0.55);
    const tSec = now * 0.001;

    if (state === 'paused') {
      envLevel += (0.04 - envLevel) * 0.14;
      for (let i = 0; i < BIN_COUNT; i++) {
        bins[i] += (0.03 - bins[i]) * 0.14;
        peaks[i] = Math.max(bins[i], peaks[i] - dt * 0.6);
      }
      return;
    }

    if (state === 'transcribing') {
      const pulse = 0.34 + 0.14 * Math.sin(tSec * 4.5);
      envLevel += (pulse - envLevel) * 0.16;
      const scan = ((tSec * 0.65) % 1);
      for (let i = 0; i < BIN_COUNT; i++) {
        const u = i / (BIN_COUNT - 1);
        const dist = Math.min(Math.abs(u - scan), 1 - Math.abs(u - scan));
        const val = 0.12 + 0.62 * Math.exp(-dist * dist * 42);
        bins[i] += (val - bins[i]) * 0.22;
        peaks[i] = Math.max(bins[i], peaks[i] - dt * 0.55);
      }
      return;
    }

    const useLiveMic = analyser && (state === 'recording' || !fakeEnabled);
    if (useLiveMic && analyser) {
      if (!freqBuf || freqBuf.length !== analyser.frequencyBinCount) {
        freqBuf = new Uint8Array(analyser.frequencyBinCount);
        timeBuf = new Uint8Array(analyser.fftSize || 512);
      }
      analyser.getByteFrequencyData(freqBuf);
      analyser.getByteTimeDomainData(timeBuf);

      let sumSq = 0;
      for (let i = 0; i < timeBuf.length; i++) {
        const v = (timeBuf[i] - 128) / 128;
        sumSq += v * v;
      }
      const rms = Math.sqrt(sumSq / timeBuf.length);
      const targetLvl = clamp(rms * 2.6 * sens, 0.02, 1);
      envLevel += (targetLvl - envLevel) * smoothFactor;

      const usableBins = Math.max(16, Math.floor(freqBuf.length * 0.68));
      for (let i = 0; i < BIN_COUNT; i++) {
        const idx = Math.min(usableBins - 1, Math.floor((i / BIN_COUNT) * usableBins));
        const raw = (freqBuf[idx] / 255) * sens;
        const shaped = clamp(raw * 0.85 + targetLvl * 0.25, 0.02, 1);
        bins[i] += (shaped - bins[i]) * smoothFactor;
        peaks[i] = Math.max(bins[i], peaks[i] - dt * 0.55);
      }
      return;
    }

    if (fakeEnabled || state === 'recording') {
      // Natural speech cadence envelope (syllables + brief pauses)
      const speechMod = Math.max(0, Math.sin(tSec * 2.4) * 0.55 + Math.sin(tSec * 5.7) * 0.35 + Math.sin(tSec * 0.9) * 0.35);
      const targetLvl = clamp((0.16 + speechMod * 0.62) * (0.65 + (cfg.sensitivity / 100) * 0.65), 0.06, 0.96);
      envLevel += (targetLvl - envLevel) * smoothFactor;
      for (let i = 0; i < BIN_COUNT; i++) {
        const u = i / (BIN_COUNT - 1);
        const bell = Math.sin(u * Math.PI);
        const wave = 0.5 + 0.5 * Math.sin(u * 13 + phase * 1.4) * Math.cos(u * 6 - phase * 0.9);
        const target = clamp((0.08 + bell * targetLvl * (0.45 + wave * 0.72)), 0.03, 0.98);
        bins[i] += (target - bins[i]) * smoothFactor;
        peaks[i] = Math.max(bins[i], peaks[i] - dt * 0.55);
      }
      return;
    }

    // Calm minimal idle breathing
    const idleLvl = 0.055 + 0.022 * Math.sin(tSec * 1.7);
    envLevel += (idleLvl - envLevel) * 0.1;
    for (let i = 0; i < BIN_COUNT; i++) {
      const u = i / (BIN_COUNT - 1);
      const target = idleLvl * (0.45 + 0.55 * Math.sin(u * Math.PI));
      bins[i] += (target - bins[i]) * 0.1;
      peaks[i] = Math.max(bins[i], peaks[i] - dt * 0.45);
    }
  }

  function colorAt(u, alpha = 1) {
    if (cfg.colorMode === 'rainbow') {
      const hue = (u * 290 + phase * 38) % 360;
      return rgba(hslToRgb(hue, 0.85, 0.64), alpha);
    }
    const rgb1 = hexToRgb(cfg.c1);
    if (cfg.colorMode === 'solid') return rgba(rgb1, alpha);
    const rgb2 = hexToRgb(cfg.c2);
    return rgba(mixRgb(rgb1, rgb2, u), alpha);
  }

  function makeStrokeStyle(alpha = 1) {
    if (cfg.colorMode === 'solid') return rgba(hexToRgb(cfg.c1), alpha);
    const g = ctx.createLinearGradient(0, 0, width, 0);
    if (cfg.colorMode === 'rainbow') {
      const stops = 6;
      for (let i = 0; i <= stops; i++) {
        const u = i / stops;
        g.addColorStop(u, colorAt(u, alpha));
      }
    } else {
      g.addColorStop(0, rgba(hexToRgb(cfg.c1), alpha));
      g.addColorStop(1, rgba(hexToRgb(cfg.c2), alpha));
    }
    return g;
  }

  function applyGlow(scale = 1) {
    const g = (cfg.glow / 100) * 18 * scale;
    if (g > 0.5) {
      ctx.shadowBlur = g;
      ctx.shadowColor = colorAt(0.45, 0.72);
    } else {
      ctx.shadowBlur = 0;
      ctx.shadowColor = 'transparent';
    }
  }

  function drawSine() {
    const midY = cfg.mirror ? height * 0.5 : height * 0.72;
    const maxAmp = (cfg.mirror ? height * 0.41 : height * 0.54) * (0.28 + envLevel * 0.85);
    const strokeW = 1.4 + (cfg.density / 100) * 2.8;
    const freq = 1.8 + (cfg.density / 100) * 2.2;
    const steps = Math.max(48, Math.floor(width / 4));

    // Subtle baseline
    ctx.save();
    ctx.strokeStyle = colorAt(0.5, 0.14);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(10, midY);
    ctx.lineTo(width - 10, midY);
    ctx.stroke();
    ctx.restore();

    const drawRibbon = (sign, mult, alpha, lw, phaseShift, glowScale) => {
      ctx.save();
      applyGlow(glowScale);
      ctx.strokeStyle = makeStrokeStyle(alpha);
      ctx.lineWidth = lw;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      for (let i = 0; i <= steps; i++) {
        const u = i / steps;
        const x = 10 + u * (width - 20);
        const env = Math.pow(Math.sin(u * Math.PI), 1.45);
        const binIdx = Math.min(BIN_COUNT - 1, Math.floor(u * BIN_COUNT));
        const local = 0.55 + bins[binIdx] * 0.75;
        const yOff = (
          Math.sin(u * Math.PI * 2 * freq + phase + phaseShift) * 0.68
          + Math.sin(u * Math.PI * 2 * (freq * 1.7) - phase * 1.3 + phaseShift) * 0.32
        ) * maxAmp * env * local * mult;
        const y = cfg.mirror ? midY + sign * yOff : midY - Math.abs(yOff);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.restore();
    };

    // Soft harmonic echo
    drawRibbon(1, 0.62, 0.34, Math.max(1, strokeW * 0.7), 1.15, 0.45);
    if (cfg.mirror) {
      drawRibbon(-1, 0.82, 0.55, Math.max(1.2, strokeW * 0.85), 0.4, 0.7);
    }
    drawRibbon(1, 1.0, 0.96, strokeW, 0, 1.0);
  }

  function drawZigzag() {
    const midY = cfg.mirror ? height * 0.5 : height * 0.76;
    const maxAmp = (cfg.mirror ? height * 0.42 : height * 0.58);
    const segments = Math.round(14 + (cfg.density / 100) * 34);
    const strokeW = 1.5 + (cfg.density / 100) * 1.6;
    const padX = 12;
    const span = width - padX * 2;

    // Hairline center guide
    ctx.save();
    ctx.strokeStyle = colorAt(0.5, 0.14);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padX, midY);
    ctx.lineTo(width - padX, midY);
    ctx.stroke();
    ctx.restore();

    const traceZig = (sign, alpha, lw, ampScale, glowScale) => {
      ctx.save();
      applyGlow(glowScale);
      ctx.strokeStyle = makeStrokeStyle(alpha);
      ctx.lineWidth = lw;
      ctx.lineJoin = 'miter';
      ctx.miterLimit = 3;
      ctx.lineCap = 'square';
      ctx.beginPath();
      for (let i = 0; i <= segments; i++) {
        const u = i / segments;
        const x = padX + u * span;
        const env = Math.sin(u * Math.PI);
        const binIdx = Math.min(BIN_COUNT - 1, Math.floor(u * BIN_COUNT));
        const amp = (0.06 + bins[binIdx] * 0.94) * maxAmp * env * ampScale;
        const dir = i === 0 || i === segments ? 0 : (i % 2 === 0 ? -1 : 1);
        const jitter = 0.75 + 0.25 * Math.sin(phase * 1.6 + i * 1.3);
        const y = cfg.mirror
          ? midY + dir * sign * amp * jitter
          : midY - (i === 0 || i === segments ? 0 : (i % 2 === 0 ? amp * 0.28 : amp * jitter));
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.restore();
    };

    if (cfg.mirror) {
      traceZig(-1, 0.38, Math.max(1.1, strokeW * 0.75), 0.78, 0.5);
    }
    traceZig(1, 0.98, strokeW, 1.0, 1.0);
  }

  function drawBars() {
    const count = Math.round(14 + (cfg.density / 100) * 34);
    const padX = 12;
    const span = width - padX * 2;
    const slot = span / count;
    const barW = Math.max(2, Math.min(12, slot * 0.56));
    const midY = cfg.mirror ? height * 0.5 : height - 8;
    const maxH = cfg.mirror ? height * 0.42 : height * 0.78;

    ctx.save();
    applyGlow(0.85);
    for (let i = 0; i < count; i++) {
      const u = count > 1 ? i / (count - 1) : 0.5;
      const binIdx = Math.min(BIN_COUNT - 1, Math.floor(u * BIN_COUNT));
      const env = 0.35 + 0.65 * Math.sin(u * Math.PI);
      const h = Math.max(3, bins[binIdx] * maxH * env);
      const pk = Math.max(h + 2, peaks[binIdx] * maxH * env);
      const x = padX + i * slot + (slot - barW) * 0.5;
      const col = colorAt(u, 0.94);
      ctx.fillStyle = col;

      const r = Math.min(barW * 0.5, h * 0.5);
      const drawPill = (rx, ry, rw, rh) => {
        ctx.beginPath();
        if (typeof ctx.roundRect === 'function') ctx.roundRect(rx, ry, rw, rh, r);
        else ctx.rect(rx, ry, rw, rh);
        ctx.fill();
      };

      if (cfg.mirror) {
        drawPill(x, midY - h, barW, h * 2);
        // Subtle peak cap dots
        ctx.fillStyle = colorAt(u, 0.55);
        const capH = 2;
        ctx.fillRect(x, midY - pk - capH - 2, barW, capH);
        ctx.fillRect(x, midY + pk + 2, barW, capH);
      } else {
        drawPill(x, midY - h, barW, h);
        ctx.fillStyle = colorAt(u, 0.6);
        ctx.fillRect(x, midY - pk - 4, barW, 2);
      }
    }
    ctx.restore();
  }

  function drawDots() {
    const count = Math.round(16 + (cfg.density / 100) * 34);
    const padX = 14;
    const span = width - padX * 2;
    const midY = cfg.mirror ? height * 0.5 : height * 0.74;
    const maxAmp = cfg.mirror ? height * 0.38 : height * 0.58;
    const baseR = clamp(span / count * 0.24, 1.8, 4.4);

    // Subtle pulse spine
    ctx.save();
    ctx.strokeStyle = colorAt(0.5, 0.16);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padX, midY);
    ctx.lineTo(width - padX, midY);
    ctx.stroke();
    ctx.restore();

    ctx.save();
    applyGlow(1.0);
    for (let i = 0; i < count; i++) {
      const u = count > 1 ? i / (count - 1) : 0.5;
      const x = padX + u * span;
      const binIdx = Math.min(BIN_COUNT - 1, Math.floor(u * BIN_COUNT));
      const env = Math.sin(u * Math.PI);
      const val = bins[binIdx] * env;
      const waveY = Math.sin(u * 10 + phase * 1.25) * 0.28 + 0.72;
      const dy = val * maxAmp * waveY;
      const r = baseR * (0.72 + val * 0.85);
      const col = colorAt(u, 0.96);

      // Vertical pulse stem
      if (dy > 3) {
        ctx.strokeStyle = colorAt(u, 0.28);
        ctx.lineWidth = Math.max(1, r * 0.45);
        ctx.beginPath();
        ctx.moveTo(x, cfg.mirror ? midY - dy : midY);
        ctx.lineTo(x, cfg.mirror ? midY + dy : midY - dy);
        ctx.stroke();
      }

      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.arc(x, midY - dy, r, 0, Math.PI * 2);
      ctx.fill();

      if (cfg.mirror && dy > 2) {
        ctx.fillStyle = colorAt(u, 0.76);
        ctx.beginPath();
        ctx.arc(x, midY + dy, r * 0.88, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  function drawPixel2Bit() {
    // Authentic crisp 2-bit quantized pixel matrix (4-tone shade ladder + floating peak + scanlines)
    const cell = Math.round(7 - (cfg.density / 100) * 3.5); // 3..7 px crisp blocks
    const step = cell + 2;
    const padX = 10;
    const cols = Math.max(8, Math.floor((width - padX * 2) / step));
    const offsetX = Math.floor((width - cols * step) * 0.5);
    const midRow = cfg.mirror ? Math.floor(height / (2 * step)) : Math.floor((height - 6) / step);
    const maxRows = Math.max(2, cfg.mirror ? midRow - 1 : Math.floor((height - 10) / step));

    // Subtle retro scanlines
    ctx.save();
    ctx.fillStyle = 'rgba(255,255,255,0.03)';
    for (let y = 0; y < height; y += 4) {
      ctx.fillRect(0, y, width, 1);
    }
    ctx.restore();

    ctx.save();
    ctx.imageSmoothingEnabled = false;
    applyGlow(0.55);

    const rgb1 = hexToRgb(cfg.c1);
    const rgb2 = cfg.colorMode === 'solid' ? mixRgb(rgb1, [12, 16, 24], 0.45) : hexToRgb(cfg.c2);

    for (let c = 0; c < cols; c++) {
      const u = cols > 1 ? c / (cols - 1) : 0.5;
      const binIdx = Math.min(BIN_COUNT - 1, Math.floor(u * BIN_COUNT));
      const env = 0.4 + 0.6 * Math.sin(u * Math.PI);
      const val = bins[binIdx] * env;
      const pkVal = peaks[binIdx] * env;
      const activeRows = Math.max(1, Math.round(val * maxRows));
      const peakRow = Math.min(maxRows, Math.max(activeRows, Math.round(pkVal * maxRows)));
      const x = offsetX + c * step;

      for (let r = 0; r < activeRows; r++) {
        // 4 quantized 2-bit brightness tiers
        const tier = Math.min(3, Math.floor((r / Math.max(1, maxRows)) * 4));
        const shadeT = tier / 3;
        let fill;
        if (cfg.colorMode === 'rainbow') {
          fill = colorAt(u, 0.55 + shadeT * 0.45);
        } else {
          fill = rgba(mixRgb(rgb2, rgb1, 0.25 + shadeT * 0.75), 0.72 + shadeT * 0.28);
        }
        ctx.fillStyle = fill;
        if (cfg.mirror) {
          const yUp = (midRow - 1 - r) * step + 1;
          const yDn = (midRow + r) * step + 1;
          ctx.fillRect(x, yUp, cell, cell);
          ctx.fillRect(x, yDn, cell, cell);
        } else {
          const yUp = (midRow - 1 - r) * step + 1;
          ctx.fillRect(x, yUp, cell, cell);
        }
      }

      // Bright 2-bit peak block
      if (peakRow > activeRows) {
        ctx.fillStyle = cfg.colorMode === 'rainbow' ? colorAt(u, 0.98) : rgba(rgb1, 0.98);
        const yPk = (midRow - 1 - peakRow) * step + 1;
        if (yPk >= 0) ctx.fillRect(x, yPk, cell, cell);
        if (cfg.mirror) {
          const yPkDn = (midRow + peakRow) * step + 1;
          if (yPkDn + cell <= height) ctx.fillRect(x, yPkDn, cell, cell);
        }
      }
    }
    ctx.restore();
  }

  function renderFrame(now = performance.now()) {
    if (!ctx || !syncSize()) return;
    const dt = lastNow ? clamp((now - lastNow) * 0.001, 0.001, 0.08) : 0.016;
    lastNow = now;
    const speedMult = 0.65 + (cfg.speed / 100) * 3.1;
    if (state !== 'paused') {
      phase += dt * speedMult * 2.2;
    }

    sampleAudio(now, dt);
    ctx.clearRect(0, 0, width, height);

    switch (cfg.style) {
      case 'zigzag': drawZigzag(); break;
      case 'bars': drawBars(); break;
      case 'dots': drawDots(); break;
      case 'pixel-2bit': drawPixel2Bit(); break;
      case 'sine':
      default: drawSine(); break;
    }
  }

  function loop(now) {
    rafId = 0;
    if (!document.hidden) {
      renderFrame(now);
    }
    rafId = requestAnimationFrame(loop);
  }

  return {
    setConfig(next) {
      cfg = { ...defaultWaveConfig(), ...(next || {}) };
    },
    setState(nextState) {
      state = nextState || 'idle';
    },
    setAnalyser(an) {
      analyser = an || null;
    },
    setFakeEnabled(v) {
      fakeEnabled = !!v;
    },
    getLevel() {
      return envLevel;
    },
    start() {
      if (rafId) return;
      lastNow = performance.now();
      rafId = requestAnimationFrame(loop);
    },
    stop() {
      if (rafId) {
        cancelAnimationFrame(rafId);
        rafId = 0;
      }
    },
    renderFrame,
    renderOnce() {
      renderFrame(performance.now());
    },
  };
}
