// Module: audio
// Interface: start(), stop() -> Blob (via onStop callback), getAnalyser(), getStream(), canPause(), pause(), resume(), isPaused(), isRecording()
// Depth: hides MediaRecorder, getUserMedia constraints, mimeType picking, race-free chunk collection, and analyser wiring.
let mediaRecorder = null;
let audioChunks = [];
let micStream = null;
let analyser = null;
let audioCtx = null;
let audioSource = null;
let onStopCb = null;
let starting = false;

export const Audio = {
  async start({ onStop, vadChunkMs }) {
    if (starting) throw new Error('already starting');
    // T1 reentrant-safe: close any previous live stream before acquiring a new one
    // (prevents orphan tracks on double-start).
    if (micStream) { try { micStream.getTracks().forEach(t => t.stop()); } catch {} micStream = null; }
    if (audioSource) { try { audioSource.disconnect(); } catch {} audioSource = null; }
    if (audioCtx) {
      const prev = audioCtx; audioCtx = null; analyser = null;
      try { await prev.close(); } catch {}
    }
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      try {
        mediaRecorder.onstop = null;
        mediaRecorder.ondataavailable = null;
        mediaRecorder.stop();
      } catch {}
    }
    mediaRecorder = null;
    audioChunks = [];
    onStopCb = null;

    let stream = null;
    let ctx = null;
    let src = null;
    let mr = null;
    starting = true;
    try {
      if (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== 'function') {
        const err = new Error('دسترسی میکروفون در این محیط فعال نیست');
        err.name = 'NotSupportedError';
        throw err;
      }
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      micStream = stream;
      const sessionChunks = [];
      audioChunks = sessionChunks;
      onStopCb = onStop;
      const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];
      const mimeType = typeof MediaRecorder !== 'undefined' && typeof MediaRecorder.isTypeSupported === 'function'
        ? (candidates.find(t => MediaRecorder.isTypeSupported(t)) || '')
        : '';
      mr = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      mediaRecorder = mr;
      mr._sessionChunks = sessionChunks;
      mr._resolvedMime = mimeType;
      mr._finished = false;
      mr.ondataavailable = e => {
        if (e.data && e.data.size > 0) sessionChunks.push(e.data);
      };
      mr.onstop = () => {
        if (mr._finished) return;
        mr._finished = true;
        const blob = new Blob(sessionChunks, { type: mr.mimeType || mimeType || 'audio/webm' });
        sessionChunks.length = 0;
        if (onStop) onStop(blob);
      };
      if (vadChunkMs && Number.isFinite(vadChunkMs) && vadChunkMs > 0) {
        mr.start(vadChunkMs);
      } else {
        mr.start();
      }
      // analyser for vis + VAD
      try {
        ctx = new (window.AudioContext || window.webkitAudioContext)();
        src = ctx.createMediaStreamSource(stream);
        const an = ctx.createAnalyser();
        an.fftSize = 512;
        src.connect(an);
        analyser = an;
        audioCtx = ctx;
        audioSource = src;
        ctx = null; src = null;
      } catch {}
      return { mimeType: mr.mimeType || mimeType };
    } catch (e) {
      // T3 rollback: close any partial resources so no orphan mic stays open
      if (mr && mr !== mediaRecorder) { try { if (mr.state !== 'inactive') mr.stop(); } catch {} }
      if (mediaRecorder === mr) mediaRecorder = null;
      else if (mediaRecorder) { try { if (mediaRecorder.state !== 'inactive') mediaRecorder.stop(); } catch {} mediaRecorder = null; }
      if (src) { try { src.disconnect(); } catch {} }
      if (ctx) { try { await ctx.close(); } catch {} }
      if (stream) { try { stream.getTracks().forEach(t => t.stop()); } catch {} }
      if (micStream === stream) micStream = null;
      if (audioCtx === ctx) { audioCtx = null; analyser = null; }
      if (audioSource === src) audioSource = null;
      audioChunks = [];
      onStopCb = null;
      throw e;
    } finally {
      starting = false;
    }
  },
  canPause() {
    return !!mediaRecorder && typeof mediaRecorder.pause === 'function' && typeof mediaRecorder.resume === 'function';
  },
  pause() {
    if (!mediaRecorder || mediaRecorder.state !== 'recording' || typeof mediaRecorder.pause !== 'function') return false;
    try { if (typeof mediaRecorder.requestData === 'function') mediaRecorder.requestData(); } catch {}
    try {
      mediaRecorder.pause();
      return mediaRecorder.state === 'paused';
    } catch {
      return false;
    }
  },
  resume() {
    if (!mediaRecorder || mediaRecorder.state !== 'paused' || typeof mediaRecorder.resume !== 'function') return false;
    try {
      mediaRecorder.resume();
      return mediaRecorder.state === 'recording';
    } catch {
      return false;
    }
  },
  async stop() {
    const mr = mediaRecorder;
    const cb = onStopCb;
    const sessionChunks = mr?._sessionChunks || audioChunks;
    const fallbackMime = mr?._resolvedMime || 'audio/webm';
    mediaRecorder = null;
    onStopCb = null;
    audioChunks = [];

    // Wait briefly for MediaRecorder's async ondataavailable + onstop BEFORE tearing down tracks,
    // and NEVER wipe sessionChunks before mr.onstop builds the Blob!
    let stopPromise = Promise.resolve();
    if (mr && mr.state !== 'inactive') {
      stopPromise = new Promise((resolve) => {
        let settled = false;
        const finish = () => {
          if (settled) return;
          settled = true;
          clearTimeout(guardTimer);
          if (!mr._finished) {
            mr._finished = true;
            const blob = new Blob(sessionChunks, { type: mr.mimeType || fallbackMime || 'audio/webm' });
            sessionChunks.length = 0;
            if (cb) {
              try { cb(blob); } catch {}
            }
          }
          resolve();
        };
        const guardTimer = setTimeout(finish, 1800);
        try {
          mr.onstop = finish;
        } catch {}
        try {
          if (mr.state === 'recording' && typeof mr.requestData === 'function') {
            mr.requestData();
          }
        } catch {}
        try {
          mr.stop();
        } catch {
          finish();
        }
      });
    }

    await stopPromise;

    if (audioSource) { try { audioSource.disconnect(); } catch {} audioSource = null; }
    if (micStream) { try { micStream.getTracks().forEach(t => t.stop()); } catch {} micStream = null; }
    if (audioCtx) { const c = audioCtx; audioCtx = null; analyser = null; try { await c.close(); } catch {} }
  },
  getAnalyser() { return analyser; },
  getStream() { return micStream; },
  isPaused() { return !!mediaRecorder && mediaRecorder.state === 'paused'; },
  isRecording() { return !!mediaRecorder && (mediaRecorder.state === 'recording' || mediaRecorder.state === 'paused'); },
};
