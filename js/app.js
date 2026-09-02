// Entry: wires deep modules together. Keeps orchestration thin; all heavy work stays behind module interfaces.
import { Storage, STT_DEFAULTS, POLISH_DEFAULTS } from './modules/storage.js';
import { Logger } from './modules/logger.js';
import { Quota } from './modules/quota.js';
import { Dashboard } from './modules/dashboard.js';
import { Audio } from './modules/audio.js';
import { Realtime } from './modules/realtime.js';
import { Transcription } from './modules/transcription.js';
import { VERSION, BUILD } from './modules/version.js';

const $ = s => document.getElementById(s);
const els = {
  btnMic: $('btn-mic'), btnCopy: $('btn-copy'), btnClear: $('btn-clear'), btnSettings: $('btn-settings'),
  output: $('output'), statusText: $('status-text'), statusDot: $('status-dot'),
  modal: $('settings-modal'), keyGroq: $('key-groq'), keyGemini: $('key-gemini'), keyOpenrouter: $('key-openrouter'),
  toggleRealtime: $('toggle-realtime'), toggleVad: $('toggle-vad'), toggleAutocopy: $('toggle-autocopy'),
  togglePolish: $('toggle-polish'),
  sttChain: $('stt-chain'), polishChain: $('polish-chain'),
  engineBadge: $('engine-badge'), wave: $('wave'), fileWarn: $('file-warning'),
  logBody: $('log-body'), livePreview: $('live-preview'), liveFinal: $('live-final'), liveInterim: $('live-interim'), liveBadge: $('live-badge'),
  quotaGrid: $('quota-grid'), charCount: $('char-count'), wordCount: $('word-count'),
  logPanel: $('log-panel'), btnToggleLog: $('btn-toggle-log'),
};

Logger.init({ logBodyEl: els.logBody, statusTextEl: els.statusText, statusDotEl: els.statusDot, toastEl: $('toast') });

// --- log filter/search UI lives in app.js (seam: logger stays 3-call log/setStatus/toast) ---
let currentFilter = 'all';
let searchQuery = '';
function passes(level, text) {
  if (currentFilter !== 'all' && level !== currentFilter) return false;
  if (searchQuery && !text.toLowerCase().includes(searchQuery.toLowerCase())) return false;
  return true;
}
function applyFilters() {
  if (!els.logBody) return;
  for (const el of els.logBody.children) {
    const lvl = el.dataset.level || 'info';
    const ok = passes(lvl, el.textContent);
    el.classList.toggle('hidden', !ok);
  }
}
function buildFilterUI() {
  const header = document.getElementById('log-header');
  if (!header || header.querySelector('.log-filters')) return;
  const filtersWrap = document.createElement('div');
  filtersWrap.className = 'log-filters';
  filtersWrap.setAttribute('role', 'group');
  filtersWrap.setAttribute('aria-label', 'فیلتر سطح لاگ');
  const levels = [
    ['all', 'همه'],
    ['info', 'info'],
    ['warn', 'warn'],
    ['error', 'error'],
    ['debug', 'debug'],
  ];
  for (const [lvl, label] of levels) {
    const btn = document.createElement('button');
    btn.className = 'log-filter' + (lvl === 'all' ? ' active' : '');
    btn.dataset.level = lvl;
    btn.textContent = label;
    btn.type = 'button';
    btn.addEventListener('click', () => {
      currentFilter = lvl;
      filtersWrap.querySelectorAll('.log-filter').forEach(b => b.classList.toggle('active', b.dataset.level === lvl));
      applyFilters();
    });
    filtersWrap.appendChild(btn);
  }
  const search = document.createElement('input');
  search.id = 'log-search';
  search.type = 'search';
  search.placeholder = 'جستجو…';
  search.setAttribute('aria-label', 'جستجو در لاگ');
  search.addEventListener('input', () => {
    searchQuery = search.value.trim();
    applyFilters();
  });
  let actionsDiv = header.querySelector('#log-actions');
  if (!actionsDiv) {
    const btns = header.querySelector('div');
    if (btns) { btns.id = 'log-actions'; actionsDiv = btns; }
  }
  header.insertBefore(search, actionsDiv);
  header.insertBefore(filtersWrap, search);
}
buildFilterUI();
const _origLog = Logger.log.bind(Logger);
Logger.log = (level, msg, data) => {
  _origLog(level, msg, data);
  const el = els.logBody.lastElementChild;
  if (el && !passes(level, el.textContent)) el.classList.add('hidden');
};

if (location.protocol === 'file:') { els.fileWarn.style.display = 'block'; Logger.log('warn','file:// باز شده',location.href); }

// --- preference chains UI ---
const STT_LABELS = {
  'groq': { label: 'Groq Whisper', sub: 'سریع • whisper-large-v3' },
  'gemini-flash-latest': { label: 'gemini-flash-latest', sub: 'پیشنهادی' },
  'gemini-flash-lite-latest': { label: 'gemini-flash-lite-latest', sub: 'سهم بیشتر ✓' },
  'gemini-3.5-flash-lite': { label: 'gemini-3.5-flash-lite', sub: 'سهم بیشتر ✓' },
  'gemini-3.1-flash-lite': { label: 'gemini-3.1-flash-lite', sub: 'سهم بیشتر ✓' },
  'gemini-2.5-flash': { label: 'gemini-2.5-flash', sub: 'قدیمی' },
  'gemini-2.0-flash': { label: 'gemini-2.0-flash', sub: '' },
  'gemini-1.5-flash': { label: 'gemini-1.5-flash', sub: '' },
};
const POLISH_LABELS = {
  'qwen/qwen3-30b-a3b:free': { label: 'qwen/qwen3-30b', sub: 'Qwen سبک • رایگان' },
  'qwen/qwen3-32b:free': { label: 'qwen/qwen3-32b', sub: 'Qwen دقیق • رایگان' },
  'openai/gpt-oss-20b:free': { label: 'openai/gpt-oss-20b', sub: 'GPT-OSS • رایگان' },
  // aliases for display
  'qwen/qwen3.6-27b': { label: 'qwen/qwen3.6-27b', sub: 'Qwen' },
  'qwen/qwen3.8-27b': { label: 'qwen/qwen3.8-27b', sub: 'Qwen' },
  'openai/gpt-oss-20b': { label: 'openai/gpt-oss-20b', sub: '' },
};

let sttChainState = [];
let polishChainState = [];

function hasKeyFor(id){
  const s=Storage.getSettings();
  if(id==='groq') return !!s.groqKey;
  if(id.includes('/')) return !!s.openrouterKey; // OR models require openrouterKey only; gemini fallback is decided in chain loop
  return !!s.geminiKey;
}
function esc(s){ const d=document.createElement('div'); d.textContent=s; return d.innerHTML; }

function renderChain(container, chain, type){
  if(!container) return;
  container.innerHTML='';
  const polishOff = type==='polish' && !els.togglePolish?.checked;
  chain.forEach((id, idx)=>{
    const meta = (type==='stt' ? STT_LABELS[id] : POLISH_LABELS[id]) || {label:id, sub:''};
    const hasKey = hasKeyFor(id);
    const item = document.createElement('div');
    item.className = 'chain-item' + (hasKey?'':' missing') + (polishOff?' polish-off':'');
    item.draggable = true;
    item.dataset.id = id;
    item.dataset.index = idx;
    item.setAttribute('role','listitem');
    item.setAttribute('aria-label', `${idx+1}. ${meta.label}`);
    item.innerHTML = `
      <span class="drag-handle" title="بکش تا جابه‌جا شود" aria-hidden="true">⋮⋮</span>
      <span class="rank ${idx>0?'fallback':''}">${idx+1}</span>
      <div style="flex:1;min-width:0;display:flex;flex-direction:column;gap:1px">
        <span class="chain-label" style="font-size:13px">${esc(meta.label)}</span>
        ${meta.sub?`<span style="font-size:11px;color:var(--muted)">${esc(meta.sub)}</span>`:''}
      </div>
      <span class="chain-badge ${hasKey?'ok':'missing'}">${hasKey?'✓ کلید':'⚠ بی‌کلید'}</span>
      <div class="chain-actions">
        <button class="chain-btn" data-up aria-label="بالا" ${idx===0?'disabled':''}>▲</button>
        <button class="chain-btn" data-down aria-label="پایین" ${idx===chain.length-1?'disabled':''}>▼</button>
      </div>
    `;
    // up/down
    item.querySelector('[data-up]')?.addEventListener('click', ()=> moveChain(type, idx, -1));
    item.querySelector('[data-down]')?.addEventListener('click', ()=> moveChain(type, idx, 1));
    // drag
    item.addEventListener('dragstart', e=>{
      item.classList.add('dragging');
      e.dataTransfer.effectAllowed='move';
      e.dataTransfer.setData('text/plain', idx);
    });
    item.addEventListener('dragend', ()=> item.classList.remove('dragging'));
    // click label to show engine info (optional)
    container.appendChild(item);
  });
  // dragover reordering
  container.ondragover = e=>{ e.preventDefault(); e.dataTransfer.dropEffect='move'; };
  container.ondrop = e=>{
    e.preventDefault();
    const from = parseInt(e.dataTransfer.getData('text/plain'),10);
    const target = e.target.closest('.chain-item');
    if(!target) return;
    const to = parseInt(target.dataset.index,10);
    if(isNaN(from)||isNaN(to)||from===to) return;
    const arr = type==='stt'? sttChainState : polishChainState;
    const [moved]=arr.splice(from,1);
    arr.splice(to,0,moved);
    renderAllChains();
    persistChains();
  };
}

function moveChain(type, idx, dir){
  const arr = type==='stt'? sttChainState : polishChainState;
  const n = idx+dir;
  if(n<0||n>=arr.length) return;
  [arr[idx], arr[n]] = [arr[n], arr[idx]];
  renderAllChains();
  persistChains();
}

function renderAllChains(){
  renderChain(els.sttChain, sttChainState, 'stt');
  renderChain(els.polishChain, polishChainState, 'polish');
  const hint = document.getElementById('polish-disabled-hint');
  if(hint) hint.style.display = els.togglePolish?.checked ? 'none' : 'block';
}

function persistChains(){
  Storage.saveSettings({ sttChain: sttChainState, polishChain: polishChainState, polishEnabled: els.togglePolish.checked });
  updateBadge();
  Quota.render(els.quotaGrid, { period: Dashboard.getPeriod() });
  Dashboard.renderOverall();
}

// --- settings wiring ---
function updateBadge(){
  const s=Storage.getSettings();
  const first = s.sttChain?.[0] || s.primary || 'groq';
  const label = first==='groq' ? 'Groq' : first;
  const pol = s.polishEnabled ? ' • پالیش روشن' : ' • پالیش خاموش';
  els.engineBadge.textContent = `موتور: ${label}${pol}`;
  // fallback indicator in badge color?
  els.engineBadge.style.opacity = hasKeyFor(first) ? '1' : '0.6';
}
function validate(){
  const g=els.keyGroq.value.trim(), gm=els.keyGemini.value.trim(), or=els.keyOpenrouter?.value.trim()||'';
  const hg=$('hint-groq'), hgm=$('hint-gemini'), hor=$('hint-openrouter');
  hg.className='hint'+(g&&!g.startsWith('gsk_')?' err':'');
  hg.innerHTML=g&&!g.startsWith('gsk_')?'⚠️ Groq باید با gsk_ شروع شود':'با <code>gsk_</code> شروع می‌شود. از console.groq.com بگیر.';
  const ok=gm.startsWith('AQ.')||gm.startsWith('AIza');
  hgm.className='hint'+(gm&&!ok?' err':'');
  hgm.innerHTML=gm&&!ok?'⚠️ باید با AQ. یا AIza شروع شود':'کلید جدید با <code>AQ.</code> شروع می‌شود. از aistudio.google.com بگیر.';
  if(hor){
    const okOr = !or || or.startsWith('sk-or-');
    hor.className='hint'+(or&&!okOr?' err':'');
    hor.innerHTML= or&&!okOr ? '⚠️ معمولا با sk-or-v1- شروع می‌شود' : 'از openrouter.ai/keys بگیر. اگر خالی باشد پالیش با Gemini انجام می‌شود. مدل‌های Qwen از اینجا استفاده می‌کنند.';
  }
  // re-render badges live
  renderAllChains();
}
function loadSettings(){
  const s=Storage.getSettings();
  els.keyGroq.value=s.groqKey; els.keyGemini.value=s.geminiKey; if(els.keyOpenrouter) els.keyOpenrouter.value=s.openrouterKey;
  sttChainState=[...s.sttChain];
  polishChainState=[...s.polishChain];
  if(els.togglePolish) els.togglePolish.checked=s.polishEnabled;
  els.toggleRealtime.checked=s.realtime; els.toggleVad.checked=s.vad; els.toggleAutocopy.checked=s.autocopy;
  renderAllChains();
  updateBadge(); validate(); Dashboard.ensureReportUI(); Quota.render(els.quotaGrid, { period: Dashboard.getPeriod() }); Dashboard.renderOverall();
  if(!s.groqKey&&!s.geminiKey&&!s.openrouterKey){ els.modal.style.display='flex'; Logger.setStatus('کلید تنظیم نشده — ⚙️ را بزن','warn'); } else Logger.setStatus('آماده به کار','info');
}
function saveSettings(){
  Storage.saveSettings({
    groqKey: els.keyGroq.value,
    geminiKey: els.keyGemini.value,
    openrouterKey: els.keyOpenrouter?.value||'',
    realtime: els.toggleRealtime.checked,
    vad: els.toggleVad.checked,
    autocopy: els.toggleAutocopy.checked,
    sttChain: sttChainState,
    polishChain: polishChainState,
    polishEnabled: els.togglePolish?.checked ?? true,
  });
  updateBadge(); validate(); Quota.render(els.quotaGrid, { period: Dashboard.getPeriod() }); Dashboard.renderOverall();
}
els.keyGroq.addEventListener('input',validate); els.keyGemini.addEventListener('input',validate);
if(els.keyOpenrouter) els.keyOpenrouter.addEventListener('input',validate);
if(els.togglePolish) els.togglePolish.addEventListener('change', ()=>{ persistChains(); Logger.log('info', `پالیش ${els.togglePolish.checked?'روشن':'خاموش'}`); });

loadSettings();
els.btnSettings.onclick=()=> els.modal.style.display='flex';
$('btn-close-modal').onclick=()=> els.modal.style.display='none';
$('btn-save-modal').onclick=()=>{ saveSettings(); els.modal.style.display='none'; Logger.setStatus('تنظیمات ذخیره شد','info'); Logger.toast('ذخیره شد'); };
$('btn-reset-stt')?.addEventListener('click', ()=>{ sttChainState=[...STT_DEFAULTS]; renderAllChains(); persistChains(); Logger.toast('STT بازنشانی شد'); });
$('btn-reset-polish')?.addEventListener('click', ()=>{ polishChainState=[...POLISH_DEFAULTS]; renderAllChains(); persistChains(); Logger.toast('پالیش بازنشانی شد'); });
els.modal.addEventListener('click',e=>{ if(e.target===els.modal) els.modal.style.display='none'; });
els.toggleRealtime.addEventListener('change',()=>{ Storage.saveSettings({realtime: els.toggleRealtime.checked}); Logger.log('info',`حالت آنی ${els.toggleRealtime.checked?'روشن':'خاموش'}`); });
els.toggleVad.addEventListener('change',()=> Storage.saveSettings({vad: els.toggleVad.checked}));
els.toggleAutocopy.addEventListener('change',()=> Storage.saveSettings({autocopy: els.toggleAutocopy.checked}));

// log panel toggle + manual splitter (not resize:vertical on flex)
$('btn-clear-log').onclick=()=> els.logBody.innerHTML='';
$('btn-copy-log').onclick=async()=>{
  const visible = [...els.logBody.children].filter(el=> !el.classList.contains('hidden'));
  const text = visible.map(e=>e.textContent).join('\n');
  if (!text) { Logger.toast('چیزی برای کپی نیست'); return; }
  await navigator.clipboard.writeText(text);
  Logger.toast(visible.length !== els.logBody.children.length ? `کپی ${visible.length} سطر فیلترشده` : 'کپی شد');
};
let logCollapsed = localStorage.getItem('LOG_COLLAPSED') !== '0';
function applyLogCollapsed(collapsed){
  logCollapsed=collapsed;
  els.logPanel.classList.toggle('collapsed', collapsed);
  els.btnToggleLog.textContent= collapsed ? 'نمایش' : 'بستن';
  const splitter=document.getElementById('log-splitter');
  if(splitter) splitter.style.display = collapsed ? 'none' : 'flex';
  localStorage.setItem('LOG_COLLAPSED', collapsed ? '1' : '0');
}
applyLogCollapsed(logCollapsed);
els.btnToggleLog.onclick=()=>{
  applyLogCollapsed(!logCollapsed);
  Logger.log('info', logCollapsed ? 'لاگ بسته شد' : 'لاگ باز شد');
};
document.getElementById('log-header')?.addEventListener('click', (e)=>{
  if(e.target.closest('button') || e.target.closest('input')) return;
  applyLogCollapsed(!logCollapsed);
});

// output draft + counters + heights
let selStart=0, selEnd=0; const saveCursor=()=>{ selStart=els.output.selectionStart; selEnd=els.output.selectionEnd; };
els.output.addEventListener('click',saveCursor); els.output.addEventListener('keyup',saveCursor); els.output.addEventListener('select',saveCursor);
const updateCounts=()=>{ els.charCount.textContent=els.output.value.length+' کاراکتر'; els.wordCount.textContent=(els.output.value.trim()?els.output.value.trim().split(/\s+/).length:0)+' کلمه'; };
let draftTimer=null;
els.output.addEventListener('input',()=>{ saveCursor(); updateCounts(); clearTimeout(draftTimer); draftTimer=setTimeout(()=> Storage.saveDraft(els.output.value),400); });
(() => {
  const d=Storage.getDraft(); if(d){ els.output.value=d; updateCounts(); Logger.log('info','پیش‌نویس بارگذاری شد',{chars:d.length}); }
  const h=Storage.getHeights(); if(h.out) els.output.style.height=h.out; if(h.log) els.logPanel.style.height=h.log;
  let splitter = document.getElementById('log-splitter');
  if(!splitter){
    splitter = document.createElement('div');
    splitter.id = 'log-splitter';
    splitter.setAttribute('role','separator');
    splitter.setAttribute('aria-orientation','horizontal');
    splitter.setAttribute('aria-label','تغییر ارتفاع لاگ');
    splitter.title = 'بکش تا ارتفاع لاگ عوض شود — ذخیره خودکار';
    els.logPanel.parentNode.insertBefore(splitter, els.logPanel);
  }
  let dragging=false, startY=0, startH=0;
  const clamp = v => Math.max(80, Math.min(v, Math.floor(window.innerHeight*0.55)));
  const onMove = (e)=>{
    if(!dragging) return;
    const y = e.touches ? e.touches[0].clientY : e.clientY;
    const delta = startY - y;
    const nh = clamp(startH + delta);
    els.logPanel.style.height = nh + 'px';
    e.preventDefault();
  };
  const onUp = ()=>{
    if(!dragging) return;
    dragging=false;
    splitter.classList.remove('dragging');
    document.body.style.cursor='';
    document.body.style.userSelect='';
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
    document.removeEventListener('touchmove', onMove);
    document.removeEventListener('touchend', onUp);
    Storage.saveHeights({log: els.logPanel.style.height});
  };
  const onDown = (e)=>{
    dragging=true;
    startY = e.touches ? e.touches[0].clientY : e.clientY;
    startH = els.logPanel.getBoundingClientRect().height;
    splitter.classList.add('dragging');
    document.body.style.cursor='ns-resize';
    document.body.style.userSelect='none';
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    document.addEventListener('touchmove', onMove, {passive:false});
    document.addEventListener('touchend', onUp);
    e.preventDefault();
  };
  splitter.addEventListener('mousedown', onDown);
  splitter.addEventListener('touchstart', onDown, {passive:false});
  if(window.ResizeObserver){
    const roOut=new ResizeObserver(()=>{ clearTimeout(roOut._t); roOut._t=setTimeout(()=> Storage.saveHeights({out: getComputedStyle(els.output).height}),300); }); roOut.observe(els.output);
  }
})();
els.output.addEventListener('dblclick', ()=>{
  els.output.style.height='auto';
  els.output.style.height=Math.min(els.output.scrollHeight, window.innerHeight*0.5)+'px';
});

// waveform
const waveCtx=els.wave.getContext('2d'); let animId=null;
function startWave(){
  const analyser=Audio.getAnalyser(); if(!analyser) return;
  const data=new Uint8Array(analyser.frequencyBinCount);
  (function draw(){
    animId=requestAnimationFrame(draw);
    analyser.getByteFrequencyData(data);
    waveCtx.clearRect(0,0,els.wave.width,els.wave.height);
    const bw=els.wave.width/data.length*2.2; let x=0;
    for(let i=0;i<data.length;i++){ const h=data[i]/255*els.wave.height, al=0.3+data[i]/255*0.7; waveCtx.fillStyle=isRecording?`rgba(234,67,53,${al})`:`rgba(138,180,248,${al})`; waveCtx.fillRect(x,els.wave.height-h,bw-1,h); x+=bw; if(x>els.wave.width) break; }
  })();
}
function stopWave(){ if(animId) cancelAnimationFrame(animId); waveCtx.clearRect(0,0,els.wave.width,els.wave.height); waveCtx.fillStyle='#333439'; waveCtx.fillRect(0,els.wave.height/2-1,els.wave.width,2); }

let rtVersion = 0;
let rtSnap = null;

function makeOnInterim(snap){
  let lastPreview = snap.committed + snap.pending;
  return (preview, fin)=>{
    const finCum = fin || '';
    const interChunk = preview.slice(finCum.length);
    if(finCum && finCum !== snap.committed){
      const newChunk = finCum.slice(snap.committed.length);
      snap.committed = finCum;
      if(newChunk.trim()) Logger.log('debug','realtime committed', newChunk.trim());
    }
    snap.pending = interChunk;
    const fullPreview = snap.committed + snap.pending;
    if(els.liveFinal) els.liveFinal.textContent = snap.committed;
    if(els.liveInterim) els.liveInterim.textContent = snap.pending;
    const expected = snap.before + lastPreview + snap.after;
    if(els.output.value !== expected){
      Logger.log('debug','realtime manual edit detected — keep user edit', { expectedLen: expected.length, actualLen: els.output.value.length });
      lastPreview = fullPreview;
      updateCounts();
      return;
    }
    els.output.value = snap.before + fullPreview + snap.after;
    const cursor = snap.basePos + fullPreview.length;
    els.output.setSelectionRange(cursor, cursor);
    lastPreview = fullPreview;
    updateCounts();
  };
}

let isRecording=false, vadTimer=null;
async function startRecording(){
  saveCursor();
  const s=Storage.getSettings(); if(!s.groqKey&&!s.geminiKey&&!s.openrouterKey){ Logger.setStatus('کلید نداری — ⚙️ را بزن','error'); els.modal.style.display='flex'; return; }
  let snap=null;
  try{
    snap = { id: ++rtVersion, startMs: 0, basePos: selStart, before: els.output.value.slice(0, selStart), after: els.output.value.slice(selEnd), committed:'', pending:'' };
    rtSnap = snap;
    const vadMs = s.vad ? 250 : undefined;
    await Audio.start({ vadChunkMs: vadMs, onStop: (blob)=> handleTranscription(blob, snap) });
    snap.startMs = performance.now();
    isRecording=true; els.btnMic.textContent='⏹ پایان و تبدیل'; els.btnMic.classList.add('recording'); if(s.realtime) els.btnMic.classList.add('realtime-active');
    Logger.setStatus('🔴 در حال ضبط...'+(s.realtime?' (زنده)':''),'rec');
    startWave();
    if(s.realtime && Realtime.isSupported()){
      if(els.livePreview) els.livePreview.classList.add('on'); if(els.liveBadge) els.liveBadge.classList.add('on'); if(els.liveFinal) els.liveFinal.textContent=''; if(els.liveInterim) els.liveInterim.textContent='';
      const onInterim = makeOnInterim(snap);
      Realtime.start(snap.basePos, { onInterim:(p,f)=> onInterim(p,f), onFinal: f=> Logger.log('debug','final',f), onError:e=>Logger.log('warn','WebSpeech',e)}, snap.id);
      Logger.log('info','حالت آنی روشن',{snapId: snap.id, basePos: snap.basePos, beforeLen: snap.before.length, afterLen: snap.after.length});
    }
    if(s.vad) startVAD();
    Logger.log('info','ضبط شروع',{realtime:s.realtime, vad:s.vad, snapId: snap.id});
  }catch(e){ if(snap && rtSnap?.id===snap.id) rtSnap=null; Logger.setStatus('میکروفون خطا: '+e.message,'error'); Logger.log('error','getUserMedia',e.message); Logger.toast(e.message); }
}
function stopRecording(){
  if(!isRecording) return;
  const snap = rtSnap;
  Audio.stop(); isRecording=false; els.btnMic.textContent='🎤 شروع صحبت'; els.btnMic.classList.remove('recording','realtime-active');
  stopVAD(); stopWave(); Realtime.stop();
  setTimeout(()=>{ if(els.livePreview) els.livePreview.classList.remove('on'); if(els.liveBadge) els.liveBadge.classList.remove('on'); },900);
  if(snap && (snap.committed+snap.pending)){
    const cursor = snap.basePos + (snap.committed+snap.pending).length;
    selStart=selEnd=cursor;
  }
  Logger.setStatus('⏳ در حال تبدیل...','warn');
}
els.btnMic.onclick=()=> isRecording?stopRecording():startRecording();
function startVAD(){ let quiet=0; const loop=()=>{ const an=Audio.getAnalyser(); if(!isRecording||!an) return; const d=new Uint8Array(an.frequencyBinCount); an.getByteFrequencyData(d); const avg=d.reduce((a,b)=>a+b,0)/d.length; if(avg<12) quiet+=250; else quiet=0; if(quiet>1400){ Logger.log('info','VAD سکوت — ارسال'); stopRecording(); return; } vadTimer=setTimeout(loop,250); }; vadTimer=setTimeout(loop,500); }
function stopVAD(){ if(vadTimer) clearTimeout(vadTimer); vadTimer=null; }

async function handleTranscription(blob, snap){
  const snapId = snap?.id;
  const isStale = snap && snapId !== rtVersion;
  if(isStale){ Logger.log('debug','stale transcription ignored',{ snapId, current: rtVersion }); return; }
  Logger.log('info','handleTrans',{size:blob.size, snapId: snapId||null, rtActive: !!snap, rtPreviewLen: snap ? (snap.committed+snap.pending).length : 0});
  if(blob.size<800){
    Logger.setStatus('صدایی ضبط نشد','warn'); Logger.toast('صدایی نیست');
    if(snap && snapId===rtVersion){ rtSnap=null; }
    else if(!snap){ rtSnap=null; }
    return;
  }
  try{
    const durationMs = snap?.startMs ? Math.round(performance.now() - snap.startMs) : 0;
    const { text, engine, polishModel } = await Transcription.transcribe(blob, { durationMs });
    if(snap && snapId !== rtVersion){ Logger.log('debug','stale resolve after transcribe ignored',{ snapId, current: rtVersion }); return; }
    if(!text){ Logger.setStatus('متنی برنگشت','warn'); Logger.toast('متنی نیست'); if(snap && snapId===rtVersion) rtSnap=null; return; }
    const s=Storage.getSettings();
    if(s.realtime && snap){
      const finalText = text.trim();
      const expected = snap.before + snap.committed + snap.pending + snap.after;
      if(els.output.value !== expected){
        Logger.log('warn','realtime manual edit before final — fallback to cursor insert',{ snapId });
        const o=els.output.value, ps=Math.min(selStart,o.length), pe=Math.min(selEnd,o.length);
        els.output.value=o.substring(0,ps)+finalText+o.substring(pe);
        els.output.setSelectionRange(ps+finalText.length,ps+finalText.length);
      } else {
        els.output.value = snap.before + finalText + snap.after;
        const cursor = snap.basePos + finalText.length;
        els.output.setSelectionRange(cursor, cursor);
      }
      Logger.log('info','realtime polished',{snapId, preview:(snap.committed+snap.pending).slice(0,80), final: finalText.slice(0,80)});
    } else {
      const o=els.output.value, ps=Math.min(selStart,o.length), pe=Math.min(selEnd,o.length); els.output.value=o.substring(0,ps)+text+o.substring(pe); els.output.setSelectionRange(ps+text.length,ps+text.length);
    }
    els.output.focus(); saveCursor();
    if(!snap || snapId===rtVersion){ rtSnap=null; }
    if(els.liveFinal) els.liveFinal.textContent=''; if(els.liveInterim) els.liveInterim.textContent=''; els.output.dispatchEvent(new Event('input'));
    Storage.saveDraft(els.output.value);
    Quota.render(els.quotaGrid, { period: Dashboard.getPeriod() });
    Dashboard.renderOverall();
    const polInfo = polishModel ? ` + پالیش ${polishModel}` : (s.polishEnabled ? ' + پالیش محلی' : '');
    Logger.setStatus(`✅ با ${engine}${polInfo} نشست`,'info'); Logger.toast('درج شد'); if(Storage.getSettings().autocopy) try{ await navigator.clipboard.writeText(text); }catch{}
    Logger.log('info','success',{engine, polishModel, len:text.length});
  }catch(err){
    Logger.log('error','transcribe failed',{msg:err.message, status:err.status});
    let h='کلید/اینترنت را چک کن'; if(err.status===429) h='سهمیه پر — کمی صبر کن'; else if(err.status===404) h='مدل پیدا نشد'; else if(err.status===401) h='کلید نامعتبر';
    Logger.setStatus(`❌ خطا: ${err.message.slice(0,90)} — ${h}`,'error');
  }
}

// misc
$('btn-test-groq').onclick=async()=>{ saveSettings(); Logger.setStatus('تست Groq...','warn'); try{ await Transcription.testGroq(); Logger.setStatus('✅ Groq اوکی','info'); Logger.toast('Groq ok'); }catch(e){ Logger.setStatus('❌ Groq: '+e.message,'error'); } };
$('btn-test-gemini').onclick=async()=>{ saveSettings(); Logger.setStatus('تست Gemini...','warn'); try{ await Transcription.testGemini(); Logger.setStatus(`✅ Gemini اوکی`,'info'); Logger.toast('Gemini ok'); }catch(e){ Logger.setStatus('❌ Gemini: '+e.message,'error'); } };
$('btn-test-polish')?.addEventListener('click', async()=>{
  saveSettings();
  Logger.setStatus('تست پالیش...','warn');
  const sample='رابطه کاربری زیبا است و می شود بهتر کرد';
  try{
    const out=await Transcription.polishText(sample);
    Logger.setStatus(`✅ پالیش: ${out.slice(0,60)}`,'info');
    Logger.log('info','polish test',{in:sample, out});
    Logger.toast(`پالیش: ${out}`);
  }catch(e){ Logger.setStatus('❌ پالیش: '+e.message,'error'); }
});
els.btnCopy.onclick=async()=>{ if(!els.output.value.trim()){ Logger.toast('چیزی نیست'); return; } await navigator.clipboard.writeText(els.output.value); const p=els.btnCopy.textContent; els.btnCopy.textContent='✓ کپی شد'; els.btnCopy.style.background='#137333'; setTimeout(()=>{ els.btnCopy.textContent=p; els.btnCopy.style.background=''; },1200); Logger.toast('کپی شد'); };
els.btnClear.onclick=()=>{ els.output.value=''; Storage.clearDraft(); selStart=selEnd=0; rtSnap=null; if(els.liveFinal) els.liveFinal.textContent=''; if(els.liveInterim) els.liveInterim.textContent=''; if(els.livePreview) els.livePreview.classList.remove('on'); updateCounts(); Logger.setStatus('آماده','info'); Logger.toast('پاک شد'); };
stopWave();
const verEl = document.getElementById('app-version'); if (verEl) verEl.textContent = `v${VERSION}`;
Dashboard.ensureReportUI();
Logger.log('info',`هم‌نگار v${VERSION} (${BUILD}) آماده`, {hasRealtime: Realtime.isSupported(), proto: location.protocol, version: VERSION});
Quota.render(els.quotaGrid, { period: Dashboard.getPeriod() });
Dashboard.renderOverall();
