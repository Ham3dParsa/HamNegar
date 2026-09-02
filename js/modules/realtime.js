// Module: realtime
// Interface: start(basePos, {onInterim, onFinal}, snapId?), stop(), isSupported()
// Depth: hides SpeechRecognition vendor prefix, lang, continuous/interim setup, and error mapping + stale-id guard.
let recognition = null;
let activeId = null;
let gen = 0;
export const Realtime = {
  isSupported() { return 'webkitSpeechRecognition' in window || 'SpeechRecognition' in window; },
  start(basePos, handlers, snapId) {
    if (!this.isSupported()) return false;
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    // id/version برای race دو ضبط پشت هم — closure snapshot در app.js
    const myId = snapId ?? ++gen;
    activeId = myId;
    recognition = new SR();
    recognition.lang = 'fa-IR';
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    recognition.onresult = e => {
      if (activeId !== myId) return;
      // برای متن طولانی: cumulative finals از 0 تا آخر، نه فقط از resultIndex — وگرنه وقتی مرورگر از 0 ری‌استارت کند دوبار اضافه می‌شود و متن از اول شروع می‌کند
      let fin = '', inter = '';
      for (let i = 0; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) fin += t + ' '; else inter = t;
      }
      if (fin) handlers.onFinal?.(fin);
      // fin تجمعی است، inter فقط آخرین interim
      if (inter || fin) handlers.onInterim?.(fin + inter, fin);
    };
    recognition.onerror = e => { if (activeId !== myId) return; handlers.onError?.(e.error || e.message); };
    recognition.onend = () => { if (recognition && activeId !== myId) { try{ recognition.stop(); }catch{} } };
    try { recognition.start(); return true; } catch { return false; }
  },
  stop() {
    activeId = null;
    if (recognition) { try { recognition.stop(); } catch {} recognition = null; }
  },
};
