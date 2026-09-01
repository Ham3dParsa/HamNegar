// Module: realtime
// Interface: start(basePos, {onInterim, onFinal}), stop(), isSupported()
// Depth: hides SpeechRecognition vendor prefix, lang, continuous/interim setup, and error mapping.
let recognition = null;
export const Realtime = {
  isSupported() { return 'webkitSpeechRecognition' in window || 'SpeechRecognition' in window; },
  start(basePos, handlers) {
    if (!this.isSupported()) return false;
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    recognition = new SR();
    recognition.lang = 'fa-IR';
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    recognition.onresult = e => {
      let fin = '', inter = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) fin += t + ' '; else inter += t;
      }
      if (fin) handlers.onFinal?.(fin);
      if (inter || fin) handlers.onInterim?.(fin + inter, fin);
    };
    recognition.onerror = e => handlers.onError?.(e.error || e.message);
    try { recognition.start(); return true; } catch { return false; }
  },
  stop() {
    if (recognition) { try { recognition.stop(); } catch {} recognition = null; }
  },
};
