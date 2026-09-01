// Module: audio
// Interface: start(), stop() -> Blob, getAnalyser(), getStream()
// Depth: hides MediaRecorder, getUserMedia constraints, mimeType picking, chunk collection, and analyser wiring.
let mediaRecorder = null;
let audioChunks = [];
let micStream = null;
let analyser = null;
let audioCtx = null;
let onStopCb = null;

export const Audio = {
  async start({ onStop, vadChunkMs }) {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    micStream = stream;
    audioChunks = [];
    onStopCb = onStop;
    const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : 'audio/webm';
    mediaRecorder = new MediaRecorder(stream, { mimeType });
    mediaRecorder.ondataavailable = e => { if (e.data.size > 0) audioChunks.push(e.data); };
    mediaRecorder.onstop = () => {
      const blob = new Blob(audioChunks, { type: mediaRecorder?.mimeType || 'audio/webm' });
      if (onStopCb) onStopCb(blob);
    };
    mediaRecorder.start(vadChunkMs);
    // analyser for vis + VAD
    try {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const src = audioCtx.createMediaStreamSource(stream);
      analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      src.connect(analyser);
    } catch {}
    return { mimeType };
  },
  stop() {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      try { mediaRecorder.stop(); } catch {}
    }
    if (micStream) { micStream.getTracks().forEach(t => t.stop()); micStream = null; }
    if (audioCtx) { try { audioCtx.close(); } catch {} audioCtx = null; analyser = null; }
  },
  getAnalyser() { return analyser; },
  getStream() { return micStream; },
  isRecording() { return !!mediaRecorder && mediaRecorder.state === 'recording'; },
};
