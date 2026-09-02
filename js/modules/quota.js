// Module: quota
// Interface: record(model), render(container)
// Depth: hides LIMITS table, daily reset, percentage calc, and rendering behind 2 calls.
// Seam is at Quota interface; Storage is an internal detail, not exposed to callers.
import { Storage } from './storage.js';
export const LIMITS = {
  groq: { label: 'Groq Whisper', rpd: 2000, rpm: 20, tpm: '—' },
  'gemini-flash-latest': { label: 'Gemini Flash Latest', rpd: 1500, rpm: 15, tpm: '1M' },
  'gemini-2.5-flash': { label: 'Gemini 2.5 Flash', rpd: 500, rpm: 10, tpm: '250K' },
  'gemini-2.5-flash-lite': { label: 'Gemini 2.5 Flash-Lite', rpd: 1500, rpm: 30, tpm: '1M' },
  'gemini-2.0-flash': { label: 'Gemini 2.0 Flash', rpd: 1500, rpm: 15, tpm: '1M' },
  'gemini-1.5-flash': { label: 'Gemini 1.5 Flash', rpd: 1500, rpm: 15, tpm: '1M' },
  'gemini-3.5-transcribe-preview': { label: 'Gemini 3.5 Transcribe', rpd: 500, rpm: 15, tpm: '1M' },
  'live-transcribe': { label: 'Gemini Live Transcribe', rpd: '∞', rpm: '∞', tpm: '20K' },
};
export const Quota = {
  record(model) {
    const q = Storage.getQuotaRaw();
    const today = new Date().toISOString().slice(0, 10);
    if (q._date !== today) { q._date = today; Object.keys(LIMITS).forEach(k => q[k] = 0); }
    q[model] = (q[model] || 0) + 1;
    Storage.saveQuotaRaw(q);
  },
  render(container) {
    if (!container) return;
    const q = Storage.getQuotaRaw();
    const s = Storage.getSettings();
    const keys = [s.primary === 'groq' ? 'groq' : s.model, s.primary === 'groq' ? s.model : 'groq', 'live-transcribe'];
    container.innerHTML = '';
    keys.forEach(k => {
      const lim = LIMITS[k] || { label: k, rpd: '—', rpm: '—', tpm: '—' };
      const used = q[k] || 0;
      let pct = 0, cls = '';
      if (lim.rpd !== '∞' && lim.rpd !== '—' && typeof lim.rpd === 'number') {
        pct = Math.min(100, Math.round((used / lim.rpd) * 100));
        if (pct > 80) cls = 'warn';
        if (pct > 95) cls = 'danger';
      }
      container.innerHTML += `<div class="quota-card"><h4>${lim.label} <span class="badge">${typeof lim.rpd === 'number' ? lim.rpd + ' /روز' : 'نامحدود'}</span></h4><div class="bar"><i class="${cls}" style="width:${pct}%"></i></div><div class="meta"><span>امروز: <b>${used}</b></span><span>${lim.rpm} /دقیقه • ${lim.tpm} /دقیقه</span></div></div>`;
    });
  },
};
