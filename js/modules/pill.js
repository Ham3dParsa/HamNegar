// Module: pill (ticket 34) — collapsed 64px circle, standalone page (pill.html).
// Imports existing seams read-only: Audio, Transcription, wave engine, Storage, Quota, shell.
// Never calls focus(). Never logs key material.
import { Audio } from './audio.js';
import { Transcription } from './transcription.js';
import { createWaveRenderer } from './wave.js';
import { Storage } from './storage.js';
import { Quota } from './quota.js';
import { detectShell } from './shell.js';
import { fa } from './format.js';
import { $ } from './dom.js';
import { worstOf } from './quota-badge.js';

const els = {
  fileWarn: $('file-warning'),
  wrap: $('pill-wrap'),
  pill: $('pill'),
  cancel: $('pill-cancel'),
  timer: $('pill-timer'),
  engine: $('pill-engine'),
  quotaDot: $('pill-quota-dot'),
  bubble: $('pill-bubble'),
  text: $('pill-text'),
  copy: $('pill-copy'),
  status: $('pill-status'),
  hint: $('pill-hint'),
  shell: $('pill-shell'),
  show: $('pill-show'),
  toast: $('pill-toast'),
  wave: $('pill-wave'),
};

const fmtTimer = (ms) => {
  const s = Math.floor(ms / 1000);
  const mm = String(Math.floor(s / 60)).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  return fa(`${mm}:${ss}`);
};

let state = 'idle'; // idle|recording|sending|success|error
let discardRecording = false;
let aborter = null;
let startMs = 0;
let timerId = 0;
let lastText = '';
let waveRenderer = null;

function toast(msg, ms = 2500) {
  if (!els.toast) return;
  els.toast.textContent = msg;
  els.toast.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => els.toast.classList.remove('show'), ms);
}

function setState(next, statusText = '') {
  state = next;
  if (els.pill) {
    els.pill.dataset.state = next;
    const labels = {
      idle: 'میکروفون — شروع ضبط',
      recording: 'در حال ضبط — کلیک برای توقف',
      sending: 'در حال تبدیل…',
      success: 'موفق — کلیک برای ضبط دوباره',
      error: 'خطا — کلیک برای تلاش دوباره',
    };
    els.pill.setAttribute('aria-label', labels[next] || labels.idle);
  }
  const busy = next === 'recording' || next === 'sending';
  if (els.cancel) els.cancel.hidden = !busy;
  if (els.timer) {
    const showTimer = next === 'recording' || next === 'sending';
    els.timer.hidden = !showTimer;
    els.timer.classList.toggle('live', next === 'recording');
  }
  if (statusText && els.status) els.status.textContent = statusText;
}

// Quota dot: READ-ONLY (worst-color rule lives in quota-badge.js).
function refreshQuotaDot() {
  if (!els.quotaDot) return;
  let s = null;
  try { s = Quota.getSummary('today'); } catch { return; }
  if (!s) return;
  const badge = worstOf(s);
  els.quotaDot.className = 'dot' + (badge ? ' ' + badge : '');
}

// Engine pair badge: idle shows first STT chain entry; success shows used engine.
function idleEngineLabel() {
  try {
    const s = Storage.getSettings();
    const chain = s.sttChain && s.sttChain.length ? s.sttChain : [{ id: 'groq', providerId: 'groq' }];
    const e = chain[0];
    const id = typeof e === 'object' ? e.id : e;
    const pid = typeof e === 'object' ? (e.providerId || '') : '';
    if (id === 'groq' || pid === 'groq') return 'groq/whisper-large-v3';
    if (pid && id) return `${String(pid).trim()}/${String(id).trim()}`;
    return String(id || '—');
  } catch { return '—'; }
}
function refreshIdleEngine() {
  if (els.engine && (state === 'idle')) els.engine.textContent = idleEngineLabel();
}

function timerStart() {
  startMs = performance.now();
  if (els.timer) els.timer.textContent = fmtTimer(0);
  clearInterval(timerId);
  timerId = setInterval(() => {
    if (els.timer) els.timer.textContent = fmtTimer(performance.now() - startMs);
  }, 250);
}
function timerStop() {
  clearInterval(timerId);
  timerId = 0;
}

function waveIdle() {
  try { waveRenderer && waveRenderer.setAnalyser(null); } catch {}
}
function waveLive() {
  try { waveRenderer && waveRenderer.setAnalyser(Audio.getAnalyser() || null); } catch {}
}

function hasBatchKey() {
  try {
    const s = Storage.getSettings();
    if (s.groqKey || s.geminiKey || s.googleKey || s.openrouterKey) return true;
    const customs = s.customProviders || [];
    if (customs.some((c) => c && c.key)) return true;
  } catch {}
  return false;
}

async function startRecording() {
  if (state === 'recording' || state === 'sending') {
    toast('⏳ صبر کن — تبدیل ادامه دارد…', 2000);
    return;
  }
  discardRecording = false;
  if (!hasBatchKey()) {
    setState('error', 'کلید STT نیست');
    toast('کلید STT نیست — تنظیمات را چک کن', 3000);
    return;
  }
  try {
    const s = Storage.getSettings();
    await Audio.start({ vadChunkMs: s.vad ? 250 : undefined, onStop: handleAudioStop });
    timerStart();
    setState('recording', '🔴 در حال ضبط…');
    waveLive();
  } catch (e) {
    const msg = (e && e.message) || 'میکروفون در دسترس نیست';
    setState('error', 'خطای میکروفون');
    toast(`میکروفون خطا: ${msg.slice(0, 80)}`, 3500);
    waveIdle();
  }
}

function stopRecording() {
  if (state !== 'recording') return;
  try { Audio.stop(); } catch {}
  waveIdle();
  // Transcription starts in handleAudioStop (MediaRecorder onstop callback).
  // Show sending immediately so cancel stays available across the gap.
  setState('sending', '⏳ در حال تبدیل…');
}

function cancelAll() {
  if (state === 'recording') {
    discardRecording = true;
    try { Audio.stop(); } catch {}
    waveIdle();
    return; // handleAudioStop discards the blob and resets UI
  }
  if (state === 'sending' && aborter) {
    try { aborter.abort(); } catch {}
  }
}

async function handleAudioStop(blob) {
  if (discardRecording) {
    discardRecording = false;
    timerStop();
    aborter = null;
    waveIdle();
    setState('idle', '');
    refreshIdleEngine();
    toast('ضبط دور ریخته شد', 1500);
    return;
  }
  if (!blob || blob.size < 800) {
    timerStop();
    aborter = null;
    waveIdle();
    setState('error', 'صدایی ضبط نشد');
    toast('صدایی نیست', 2000);
    return;
  }
  const durationMs = startMs ? Math.round(performance.now() - startMs) : 0;
  setState('sending', '⏳ در حال تبدیل…');
  aborter = new AbortController();
  try {
    const { text, engine, polishModel } = await Transcription.transcribe(blob, {
      durationMs,
      signal: aborter.signal,
    });
    if (aborter.signal.aborted) throw Object.assign(new Error('لغو شد'), { aborted: true });
    if (!text || !text.trim()) throw Object.assign(new Error('متنی نیست'), { status: 500 });
    lastText = text;
    if (els.text) els.text.textContent = text;
    if (els.bubble) els.bubble.hidden = false;
    const polInfo = polishModel ? ` + ${polishModel}` : '';
    if (els.engine) els.engine.textContent = `${engine}${polInfo}`;
    timerStop();
    setState('success', `✅ با ${engine} نشست`);
    toast('درج شد', 2000);
    refreshQuotaDot();
    if (Storage.getSettings().autocopy) {
      try { await navigator.clipboard.writeText(text); } catch {}
    }
    if (await tauriPaste(text)) toast('در برنامه فعال درج شد', 2000);
  } catch (err) {
    timerStop();
    if ((err && err.aborted) || aborter?.signal.aborted) {
      setState('idle', 'لغو شد');
      refreshIdleEngine();
      toast('لغو شد', 1500);
    } else {
      const msg = (err && err.message) || 'خطای نامشخص';
      let h = 'کلید/اینترنت را چک کن';
      if (err && err.status === 429) h = 'سهمیه پر — کمی صبر کن';
      else if (err && err.status === 404) h = 'مدل پیدا نشد';
      else if (err && (err.status === 401 || err.status === 403)) h = 'کلید نامعتبر';
      setState('error', `❌ ${msg.slice(0, 60)}`);
      toast(`❌ ${msg.slice(0, 60)} — ${h}`, 3500);
    }
  } finally {
    aborter = null;
    waveIdle();
  }
}

async function copyResult() {
  if (!lastText) { toast('چیزی برای کپی نیست', 1500); return; }
  try {
    await navigator.clipboard.writeText(lastText);
    toast('کپی شد', 1500);
  } catch {
    toast('کپی ناموفق — دستی کپی کن', 2500);
  }
}

function toggleHidden() {
  if (!els.wrap || !els.show) return;
  const hidden = els.wrap.classList.toggle('pill-hidden');
  els.show.hidden = !hidden;
}

// Draggable 64px circle: pointer drag on #pill, click threshold 5px.
function makeDraggable() {
  if (!els.pill || !els.wrap) return;
  let sx = 0, sy = 0, ox = 0, oy = 0, dragging = false, moved = false;
  els.pill.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    dragging = true;
    moved = false;
    sx = e.clientX; sy = e.clientY;
    const r = els.wrap.getBoundingClientRect();
    ox = r.left; oy = r.top;
    els.pill.setPointerCapture(e.pointerId);
  });
  els.pill.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const dx = e.clientX - sx, dy = e.clientY - sy;
    if (Math.abs(dx) + Math.abs(dy) > 5) moved = true;
    if (!moved) return;
    const nx = Math.min(window.innerWidth - 80, Math.max(8, ox + dx));
    const ny = Math.min(window.innerHeight - 80, Math.max(8, oy + dy));
    els.wrap.style.left = 'auto';
    els.wrap.style.right = 'auto';
    els.wrap.style.left = `${Math.round(nx)}px`;
    els.wrap.style.top = `${Math.round(ny)}px`;
    els.wrap.style.bottom = 'auto';
  });
  const end = () => {
    if (!dragging) return;
    dragging = false;
    if (!moved) {
      if (state === 'recording') stopRecording();
      else startRecording();
    }
  };
  els.pill.addEventListener('pointerup', end);
  els.pill.addEventListener('pointercancel', () => { dragging = false; });
}

function toggleMic() {
  if (state === 'recording') stopRecording();
  else if (state === 'idle' || state === 'success' || state === 'error') startRecording();
  else if (state === 'sending') toast('⏳ صبر کن — تبدیل ادامه دارد…', 1500);
}

// Tauri bridge (ticket 36) — contract for shell P1, web path byte-identical:
// Rust→pill: event 'hamnegar-toggle-record' (same as M key).
// pill→Rust: invoke('hamnegar_paste', { text }) after success, tauri-only.
function tauriGlobal() {
  try {
    if (typeof window === 'undefined') return null;
    const T = window.__TAURI__ || null;
    if (!T || detectShell() !== 'tauri') return null;
    return T;
  } catch { return null; }
}
function tauriBridge() {
  try {
    const T = tauriGlobal();
    if (!T || !T.event || typeof T.event.listen !== 'function') return;
    T.event.listen('hamnegar-toggle-record', () => { try { toggleMic(); } catch {} }).catch(() => {});
  } catch {}
}
async function tauriPaste(text) {
  try {
    const T = tauriGlobal();
    if (!T || !T.core || typeof T.core.invoke !== 'function') return false;
    await T.core.invoke('hamnegar_paste', { text });
    return true;
  } catch { return false; }
}

function bindKeys() {
  document.addEventListener('keydown', (e) => {
    const t = e.target;
    const inField = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
    if (e.key === 'Escape') {
      if (state === 'recording' || state === 'sending') {
        e.preventDefault();
        cancelAll();
      }
      return;
    }
    if (inField) return;
    if (e.key === 'm' || e.key === 'M') {
      toggleMic();
    } else if (e.key === 'h' || e.key === 'H') {
      toggleHidden();
    }
  });
}

function init() {
  if (location.protocol === 'file:' && els.fileWarn) els.fileWarn.hidden = false;
  try {
    if (els.shell) els.shell.textContent = detectShell() === 'tauri' ? 'تاوری' : 'وب';
  } catch {}
  try {
    waveRenderer = createWaveRenderer(els.wave);
    try { waveRenderer.setConfig(Storage.getWave()); } catch {}
    try { waveRenderer.setFakeEnabled(false); } catch {}
    waveRenderer.start();
  } catch {}
  refreshQuotaDot();
  refreshIdleEngine();
  setState('idle', '');
  makeDraggable();
  bindKeys();
  tauriBridge();
  if (els.cancel) els.cancel.addEventListener('click', cancelAll);
  if (els.copy) els.copy.addEventListener('click', copyResult);
  if (els.show) els.show.addEventListener('click', toggleHidden);
}

init();

// Test hook (read-only state, no focus tricks): window.__pill.getState()
try {
  window.__pill = {
    getState: () => state,
    getEngine: () => (els.engine ? els.engine.textContent : ''),
    getText: () => lastText,
  };
} catch {}

export const Pill = { getState: () => state };
