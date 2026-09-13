// Module: audio
// Interface: start(), stop() -> Blob, getAnalyser(), getStream()
// Depth: hides MediaRecorder, getUserMedia constraints, mimeType picking, chunk collection, and analyser wiring.
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
    if (mediaRecorder && mediaRecorder.state !== 'inactive') { try { mediaRecorder.stop(); } catch {} }
    mediaRecorder = null;
    audioChunks = [];
    onStopCb = null;

    let stream = null;
    let ctx = null;
    let src = null;
    let mr = null;
    starting = true;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      micStream = stream;
      audioChunks = [];
      onStopCb = onStop;
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : 'audio/webm';
      mr = new MediaRecorder(stream, { mimeType });
      mediaRecorder = mr;
      mediaRecorder.ondataavailable = e => { if (e.data.size > 0) audioChunks.push(e.data); };
      mediaRecorder.onstop = () => {
        const blob = new Blob(audioChunks, { type: mediaRecorder?.mimeType || 'audio/webm' });
        if (onStopCb) onStopCb(blob);
      };
      mediaRecorder.start(vadChunkMs);
      // analyser for vis + VAD
      try {
        ctx = new (window.AudioContext || window.webkitAudioContext)();
        src = ctx.createMediaStreamSource(stream);
        const an = ctx.createAnalyser();
        an.fftSize = 256;
        src.connect(an);
        analyser = an;
        audioCtx = ctx;
        audioSource = src;
        ctx = null; src = null;
      } catch {}
      return { mimeType };
    } catch (e) {
      // T3 rollback: close any partial resources so no orphan mic stays open
      if (mr && mr !== mediaRecorder) { try { if (mr.state !== 'inactive') mr.stop(); } catch {} }
      if (mediaRecorder === mr) mediaRecorder = null;
      else if (mediaRecorder) { try { if (mediaRecorder.state !== 'inactive') mediaRecorder.stop(); } catch {} mediaRecorder = null; }
      if (src) { try { src.disconnect(); } catch {} }
      if (ctx) { try { await ctx.close(); } catch {} }
      if (stream) { try { stream.getTracks().forEach(t => t.stop()); } catch {} }
      if (micStream === stream) micStream = null;
      // if ctx/src were already promoted, unwind
      if (audioCtx === ctx) { audioCtx = null; analyser = null; }
      if (audioSource === src) audioSource = null;
      audioChunks = [];
      onStopCb = null;
      throw e;
    } finally {
      starting = false;
    }
  },
  async stop() {
    const mr = mediaRecorder;
    const cb = onStopCb;
    if (mr && mr.state !== 'inactive') {
      try {
        mr.onstop = () => {
          const blob = new Blob(audioChunks, { type: mr.mimeType || 'audio/webm' });
          if (cb) cb(blob);
        };
      } catch {}
      try { mr.stop(); } catch {}
    }
    mediaRecorder = null;
    if (audioSource) { try { audioSource.disconnect(); } catch {} audioSource = null; }
    if (micStream) { try { micStream.getTracks().forEach(t => t.stop()); } catch {} micStream = null; }
    if (audioCtx) { const c = audioCtx; audioCtx = null; analyser = null; try { await c.close(); } catch {} }
    audioChunks = [];
    onStopCb = null;
  },
  getAnalyser() { return analyser; },
  getStream() { return micStream; },
  isRecording() { return !!mediaRecorder && mediaRecorder.state === 'recording'; },
};
