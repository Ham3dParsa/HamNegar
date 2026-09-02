// Module: stats (deep)
// Interface: record({model,durationMs,words,chars}), getSummary(period), getSeries(days)
// Depth: hides Tehran timezone, daily rollup, color thresholds, favorite, WPM, saved time, streak.
// Seam at Stats interface; Storage is internal detail.
import { Storage } from './storage.js';

export const LIMITS = {
  groq: { label: 'Groq Whisper', rpd: 2000, rpm: 20, tpm: '—' },
  'gemini-flash-latest': { label: 'Gemini Flash Latest', rpd: 1500, rpm: 15, tpm: '1M' },
  'gemini-flash-lite-latest': { label: 'Gemini Flash-Lite Latest', rpd: 1500, rpm: 30, tpm: '1M' },
  'gemini-3.5-flash-lite': { label: 'Gemini 3.5 Flash-Lite', rpd: 1500, rpm: 30, tpm: '1M' },
  'gemini-3.1-flash-lite': { label: 'Gemini 3.1 Flash-Lite', rpd: 1500, rpm: 30, tpm: '1M' },
  'gemini-2.5-flash': { label: 'Gemini 2.5 Flash', rpd: 500, rpm: 10, tpm: '250K' },
  'gemini-2.0-flash': { label: 'Gemini 2.0 Flash', rpd: 1500, rpm: 15, tpm: '1M' },
  'gemini-1.5-flash': { label: 'Gemini 1.5 Flash', rpd: 1500, rpm: 15, tpm: '1M' },
};

let _tehranFmt = null;
let _tehranFmtFailed = false;
function getTehranFmt(){
  if(_tehranFmt || _tehranFmtFailed) return _tehranFmt;
  try{ _tehranFmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tehran' }); }catch{ _tehranFmtFailed = true; }
  return _tehranFmt;
}
function tehranDate(d = new Date()) {
  const fmt = getTehranFmt();
  if(fmt){
    try{ return fmt.format(d); }catch{}
  }
  return d.toISOString().slice(0, 10);
}

function loadHistory() {
  return Storage.getStatsHistory();
}
function saveHistory(arr) {
  // cap 365 days, keep sorted old->new
  if (arr.length > 365) arr = arr.slice(arr.length - 365);
  Storage.saveStatsHistory(arr);
}

function migrateIfNeeded() {
  const hist = loadHistory();
  if (hist.length > 0) return;
  const q = Storage.getQuotaRaw();
  if (!q || !q._date) return;
  const counts = {};
  const skipped = [];
  for (const k of Object.keys(LIMITS)) if (q[k]) counts[k] = q[k];
  for (const k of Object.keys(q)) if (k !== '_date' && !LIMITS[k] && q[k]) skipped.push({ k, v: q[k] });
  if (skipped.length) {
    try { console.warn('[Stats] migration skipped unknown keys', skipped); } catch {}
  }
  if (Object.keys(counts).length === 0) return;
  // ignore live-transcribe if present (already not in LIMITS, but guard)
  delete counts['live-transcribe'];
  if (Object.keys(counts).length === 0) return;
  hist.push({ date: q._date, counts, words: 0, chars: 0, durationMs: 0, sessions: Object.values(counts).reduce((a,b)=>a+b,0) });
  saveHistory(hist);
}

function getColor(pct) {
  if (pct > 95) return 'danger';
  if (pct >= 80) return 'warn-orange';
  if (pct >= 60) return 'warn';
  return 'none';
}

function aggregate(period) {
  migrateIfNeeded();
  const hist = loadHistory();
  if (hist.length === 0) return { totals: { count:0, words:0, chars:0, durationMs:0, sessions:0, minutes:0, counts:{} }, history: [] };
  let filtered = [];
  const todayStr = tehranDate();
  if (period === 'today') {
    filtered = hist.filter(h=> h.date === todayStr);
  } else if (period === 'week') {
    // last 7 days inclusive — use ms offset to avoid local TZ setDate drift vs Tehran
    const dates = new Set();
    const now = Date.now();
    for (let i=0;i<7;i++){ const d=new Date(now - i*86400000); dates.add(tehranDate(d)); }
    filtered = hist.filter(h=> dates.has(h.date));
  } else if (period === 'month') {
    const dates = new Set();
    const now = Date.now();
    for (let i=0;i<30;i++){ const d=new Date(now - i*86400000); dates.add(tehranDate(d)); }
    filtered = hist.filter(h=> dates.has(h.date));
  } else { // all
    filtered = hist;
  }
  const totals = { count:0, words:0, chars:0, durationMs:0, sessions:0, counts:{} };
  for (const h of filtered){
    totals.words += h.words||0;
    totals.chars += h.chars||0;
    totals.durationMs += h.durationMs||0;
    totals.sessions += h.sessions||0;
    for (const [k,v] of Object.entries(h.counts||{})){
      totals.counts[k]=(totals.counts[k]||0)+v;
      totals.count += v;
    }
  }
  totals.minutes = +(totals.durationMs/60000).toFixed(2);
  return { totals, history: filtered, fullHistory: hist };
}

export const Stats = {
  record({ model, durationMs=0, words=0, chars=0, success=true, kind='stt' }={}) {
    if (!model || model==='live-transcribe') return;
    // only stt counts toward quota display; polish ignored for quota but words still maybe? For now count all stt
    if (kind !== 'stt') return;
    if (!success) return;
    // avoid polluting totals with empty sessions (e.g. engine returned '' but duration>0)
    if (!words && !chars) return;
    migrateIfNeeded();
    const date = tehranDate();
    const hist = loadHistory();
    let entry = hist.find(h=> h.date===date);
    if (!entry){
      entry = { date, counts:{}, words:0, chars:0, durationMs:0, sessions:0 };
      hist.push(entry);
      hist.sort((a,b)=> a.date.localeCompare(b.date));
    }
    entry.counts[model]=(entry.counts[model]||0)+1;
    entry.words += words||0;
    entry.chars += chars||0;
    entry.durationMs += durationMs||0;
    entry.sessions += 1;
    saveHistory(hist);
  },

  getSummary(period='today'){
    const { totals, history, fullHistory } = aggregate(period);
    // byModel sorted DESC
    const byModel = Object.entries(totals.counts).map(([model,count])=>{
      const lim = LIMITS[model] || { label: model, rpd:'—' };
      let pct=0;
      if (typeof lim.rpd==='number') pct = Math.min(100, Math.round(count/lim.rpd*100));
      const color = getColor(pct);
      return { model, label: lim.label, count, pct, color, isNearLimit: pct>80, isFavorite:false };
    }).sort((a,b)=> b.count-a.count);
    let favorite=null;
    if (byModel.length){
      byModel[0].isFavorite=true;
      favorite={ model: byModel[0].model, label: byModel[0].label, count: byModel[0].count };
    }
    const minutes = totals.minutes;
    const avgWpm = totals.durationMs>=1000 ? Math.min(600, Math.round(totals.words / (totals.durationMs/60000))) : 0;
    const savedMinutes = Math.round(totals.words/40);
    const speedBoost = avgWpm>0 ? (avgWpm/40).toFixed(1)+'×' : '—';
    // fun stats
    const histForFun = fullHistory || history;
    let busiestDay=null, longestSessionMin=0;
    if (histForFun && histForFun.length){
      // prefer words; if all words==0 fallback to sessions count
      const maxWords = Math.max(0, ...histForFun.map(d=> d.words||0));
      if (maxWords > 0) {
        busiestDay = histForFun.reduce((a,b)=> (b.words||0)>(a.words||0)?b:a, histForFun[0]);
      } else {
        busiestDay = histForFun.reduce((a,b)=> (b.sessions||0)>(a.sessions||0)?b:a, histForFun[0]);
      }
      longestSessionMin = Math.max(0, ...histForFun.map(d=> (d.durationMs||0)/60000));
      longestSessionMin = +longestSessionMin.toFixed(2);
    }
    // streak: consecutive days with sessions>0 ending today — Tehran timezone
    let streakDays=0;
    if (histForFun && histForFun.length){
      const dateSet = new Set(histForFun.filter(h=> (h.sessions||0)>0).map(h=>h.date));
      const baseMs = Date.now();
      for(let i=0;i<365;i++){ const d=new Date(baseMs - i*86400000); const ds=tehranDate(d); if(dateSet.has(ds)) streakDays++; else break; }
    }
    const rangeLabel = period==='today'?'امروز': period==='week'?'هفته': period==='month'?'ماه':'کل';
    return {
      period, rangeLabel,
      totals: { count: totals.count, words: totals.words, chars: totals.chars, durationMs: totals.durationMs, minutes, sessions: totals.sessions, counts: totals.counts },
      byModel,
      favorite,
      avgWpm,
      savedMinutes,
      speedBoost,
      fun: { busiestDay, longestSessionMin, streakDays }
    };
  },

  getSeries(days=7){
    migrateIfNeeded();
    const hist = loadHistory();
    // return last N days sorted
    const sorted = [...hist].sort((a,b)=> a.date.localeCompare(b.date));
    const slice = sorted.slice(-days);
    return slice.map(h=> ({ date:h.date, count: Object.values(h.counts||{}).reduce((a,b)=>a+b,0), words:h.words||0, minutes: +((h.durationMs||0)/60000).toFixed(2) }));
  },

  _resetForTests(){ Storage.saveStatsHistory([]); },

  _tehranDate: tehranDate,
};
