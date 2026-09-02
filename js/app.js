// Entry: wires deep modules together. Keeps orchestration thin; all heavy work stays behind module interfaces.
import { Storage } from './modules/storage.js';
import { Logger } from './modules/logger.js';
import { Quota } from './modules/quota.js';
import { Audio } from './modules/audio.js';
import { Realtime } from './modules/realtime.js';
import { Transcription } from './modules/transcription.js';

const $ = s => document.getElementById(s);
const els = {
  btnMic: $('btn-mic'), btnCopy: $('btn-copy'), btnClear: $('btn-clear'), btnSettings: $('btn-settings'),
  output: $('output'), statusText: $('status-text'), statusDot: $('status-dot'),
  modal: $('settings-modal'), keyGroq: $('key-groq'), keyGemini: $('key-gemini'),
  selectPrimary: $('select-primary'), selectModel: $('select-gemini-model'),
  toggleRealtime: $('toggle-realtime'), toggleVad: $('toggle-vad'), toggleAutocopy: $('toggle-autocopy'),
  engineBadge: $('engine-badge'), wave: $('wave'), fileWarn: $('file-warning'),
  logBody: $('log-body'), livePreview: $('live-preview'), liveFinal: $('live-final'), liveInterim: $('live-interim'), liveBadge: $('live-badge'),
  quotaGrid: $('quota-grid'), charCount: $('char-count'), wordCount: $('word-count'),
  logPanel: $('log-panel'), btnToggleLog: $('btn-toggle-log'),
};

Logger.init({ logBodyEl: els.logBody, statusTextEl: els.statusText, statusDotEl: els.statusDot, toastEl: $('toast') });
if (location.protocol === 'file:') { els.fileWarn.style.display = 'block'; Logger.log('warn','file:// باز شده',location.href); }

// --- settings wiring ---
function updateBadge(){ const s=Storage.getSettings(); els.engineBadge.textContent = s.primary==='groq' ? 'موتور: Groq' : `موتور: ${s.model}`; }
function validate(){ const g=els.keyGroq.value.trim(), gm=els.keyGemini.value.trim(); const hg=$('hint-groq'), hgm=$('hint-gemini'); hg.className='hint'+(g&&!g.startsWith('gsk_')?' err':''); hg.innerHTML=g&&!g.startsWith('gsk_')?'⚠️ Groq باید با gsk_ شروع شود':'با <code>gsk_</code> شروع می‌شود. از console.groq.com بگیر.'; const ok=gm.startsWith('AQ.')||gm.startsWith('AIza'); hgm.className='hint'+(gm&&!ok?' err':''); hgm.innerHTML=gm&&!ok?'⚠️ باید با AQ. یا AIza شروع شود':'کلید جدید با <code>AQ.</code> شروع می‌شود. از aistudio.google.com بگیر.'; }
function loadSettings(){
  const s=Storage.getSettings();
  els.keyGroq.value=s.groqKey; els.keyGemini.value=s.geminiKey; els.selectPrimary.value=s.primary; els.selectModel.value=s.model;
  els.toggleRealtime.checked=s.realtime; els.toggleVad.checked=s.vad; els.toggleAutocopy.checked=s.autocopy;
  updateBadge(); validate(); Quota.render(els.quotaGrid);
  if(!s.groqKey&&!s.geminiKey){ els.modal.style.display='flex'; Logger.setStatus('کلید تنظیم نشده — ⚙️ را بزن','warn'); } else Logger.setStatus('آماده به کار','info');
}
function saveSettings(){ Storage.saveSettings({ groqKey: els.keyGroq.value, geminiKey: els.keyGemini.value, primary: els.selectPrimary.value, model: els.selectModel.value, realtime: els.toggleRealtime.checked, vad: els.toggleVad.checked, autocopy: els.toggleAutocopy.checked }); updateBadge(); validate(); Quota.render(els.quotaGrid); }
els.keyGroq.addEventListener('input',validate); els.keyGemini.addEventListener('input',validate);
loadSettings();
els.btnSettings.onclick=()=> els.modal.style.display='flex';
$('btn-close-modal').onclick=()=> els.modal.style.display='none';
$('btn-save-modal').onclick=()=>{ saveSettings(); els.modal.style.display='none'; Logger.setStatus('تنظیمات ذخیره شد','info'); Logger.toast('ذخیره شد'); };
els.modal.addEventListener('click',e=>{ if(e.target===els.modal) els.modal.style.display='none'; });
els.selectPrimary.addEventListener('change',updateBadge); els.selectModel.addEventListener('change',updateBadge);
els.toggleRealtime.addEventListener('change',()=>{ Storage.saveSettings({realtime: els.toggleRealtime.checked}); Logger.log('info',`حالت آنی ${els.toggleRealtime.checked?'روشن':'خاموش'}`); });
els.toggleVad.addEventListener('change',()=> Storage.saveSettings({vad: els.toggleVad.checked}));
els.toggleAutocopy.addEventListener('change',()=> Storage.saveSettings({autocopy: els.toggleAutocopy.checked}));

// log panel toggle + resize persistence handled via Storage heights
$('btn-clear-log').onclick=()=> els.logBody.innerHTML='';
$('btn-copy-log').onclick=async()=>{ await navigator.clipboard.writeText([...els.logBody.children].map(e=>e.innerText).join('\n')||'خالی'); Logger.toast('کپی شد'); };
let logCollapsed=false;
els.btnToggleLog.onclick=()=>{
  logCollapsed=!logCollapsed;
  if(logCollapsed){ els.logPanel.dataset.prevHeight=els.logPanel.style.height||getComputedStyle(els.logPanel).height; els.logPanel.style.display='none'; els.btnToggleLog.textContent='نمایش'; Logger.log('info','لاگ بسته شد'); }
  else { els.logPanel.style.display='flex'; els.logPanel.style.height=els.logPanel.dataset.prevHeight||Storage.getHeights().log||'180px'; els.btnToggleLog.textContent='بستن'; Logger.log('info','لاگ باز شد'); }
};

// output draft + counters + heights
let selStart=0, selEnd=0; const saveCursor=()=>{ selStart=els.output.selectionStart; selEnd=els.output.selectionEnd; };
els.output.addEventListener('click',saveCursor); els.output.addEventListener('keyup',saveCursor); els.output.addEventListener('select',saveCursor);
const updateCounts=()=>{ els.charCount.textContent=els.output.value.length+' کاراکتر'; els.wordCount.textContent=(els.output.value.trim()?els.output.value.trim().split(/\s+/).length:0)+' کلمه'; };
let draftTimer=null;
els.output.addEventListener('input',()=>{ saveCursor(); updateCounts(); clearTimeout(draftTimer); draftTimer=setTimeout(()=> Storage.saveDraft(els.output.value),400); });
// restore draft + heights
(() => {
  const d=Storage.getDraft(); if(d){ els.output.value=d; updateCounts(); Logger.log('info','پیش‌نویس بارگذاری شد',{chars:d.length}); }
  const h=Storage.getHeights(); if(h.out) els.output.style.height=h.out; if(h.log) els.logPanel.style.height=h.log;
  if(window.ResizeObserver){
    const roOut=new ResizeObserver(()=>{ clearTimeout(roOut._t); roOut._t=setTimeout(()=> Storage.saveHeights({out: getComputedStyle(els.output).height}),300); }); roOut.observe(els.output);
    const roLog=new ResizeObserver(()=>{ clearTimeout(roLog._t); roLog._t=setTimeout(()=> Storage.saveHeights({log: getComputedStyle(els.logPanel).height}),300); }); roLog.observe(els.logPanel);
  }
})();

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

// realtime — closure snapshot: هر ضبط snap خودش را دارد (id/version) تا race جهانی حذف شود
let rtVersion = 0;
let rtSnap = null;

function makeOnInterim(snap){
  let lastPreview = snap.committed + snap.pending;
  return (preview, fin)=>{
    const finChunk = fin || '';
    const interChunk = preview.slice(finChunk.length);
    if(finChunk) snap.committed += finChunk;
    snap.pending = interChunk;
    const fullPreview = snap.committed + snap.pending;
    els.liveFinal.textContent = snap.committed;
    els.liveInterim.textContent = snap.pending;
    // diff-merge: اگر کاربر وسط ضبط دستی ویرایش کرد، متن دستی را پاک نکن
    const expected = snap.before + lastPreview + snap.after;
    if(els.output.value !== expected){
      // ویرایش دستی تشخیص داده شد — فقط پیش‌نمایش زنده را به‌روز کن، مقدار اصلی را ننویس
      Logger.log('debug','realtime manual edit detected — keep user edit', { expectedLen: expected.length, actualLen: els.output.value.length });
      lastPreview = fullPreview;
      updateCounts();
      if(finChunk) Logger.log('debug','realtime committed',finChunk.trim());
      return;
    }
    els.output.value = snap.before + fullPreview + snap.after;
    const cursor = snap.basePos + fullPreview.length;
    els.output.setSelectionRange(cursor, cursor);
    lastPreview = fullPreview;
    updateCounts();
    if(finChunk) Logger.log('debug','realtime committed',finChunk.trim());
  };
}

// recording + VAD
let isRecording=false, vadTimer=null;
async function startRecording(){
  saveCursor();
  const s=Storage.getSettings(); if(!s.groqKey&&!s.geminiKey){ Logger.setStatus('کلید نداری — ⚙️ را بزن','error'); els.modal.style.display='flex'; return; }
  try{
    // closure snapshot با id/version برای هر ضبط — از race گلوبال جلوگیری می‌کند
    const snap = { id: ++rtVersion, basePos: selStart, before: els.output.value.slice(0, selStart), after: els.output.value.slice(selEnd), committed:'', pending:'' };
    rtSnap = snap;
    const vadMs = s.vad ? 250 : undefined;
    await Audio.start({ vadChunkMs: vadMs, onStop: (blob)=> handleTranscription(blob, snap) });
    isRecording=true; els.btnMic.textContent='⏹ پایان و تبدیل'; els.btnMic.classList.add('recording'); if(s.realtime) els.btnMic.classList.add('realtime-active');
    Logger.setStatus('🔴 در حال ضبط...'+(s.realtime?' (زنده)':''),'rec');
    startWave();
    if(s.realtime && Realtime.isSupported()){
      els.livePreview.classList.add('on'); els.liveBadge.classList.add('on'); els.liveFinal.textContent=''; els.liveInterim.textContent='';
      const onInterim = makeOnInterim(snap);
      Realtime.start(snap.basePos, { onInterim:(p,f)=> onInterim(p,f), onFinal: f=> Logger.log('debug','final',f), onError:e=>Logger.log('warn','WebSpeech',e)}, snap.id);
      Logger.log('info','حالت آنی روشن',{snapId: snap.id, basePos: snap.basePos, beforeLen: snap.before.length, afterLen: snap.after.length});
    }
    if(s.vad) startVAD();
    Logger.log('info','ضبط شروع',{realtime:s.realtime, vad:s.vad, snapId: snap.id});
  }catch(e){ Logger.setStatus('میکروفون خطا: '+e.message,'error'); Logger.log('error','getUserMedia',e.message); Logger.toast(e.message); }
}
function stopRecording(){
  if(!isRecording) return;
  const snap = rtSnap;
  Audio.stop(); isRecording=false; els.btnMic.textContent='🎤 شروع صحبت'; els.btnMic.classList.remove('recording','realtime-active');
  stopVAD(); stopWave(); Realtime.stop();
  setTimeout(()=>{ els.livePreview.classList.remove('on'); els.liveBadge.classList.remove('on'); },900);
  // اگر متنی نیمه‌کاره مانده، کرسر را آخر preview بگذار ولی snap را نگه دار تا handleTranscription جایگزین کند
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
  // snap = closure snapshot این ضبط؛ stale را با id/version نادیده بگیر
  const activeId = rtSnap?.id;
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
    const { text, engine } = await Transcription.transcribe(blob);
    // بعد از await هم stale چک کن — دو ضبط پشت هم race ندهد
    if(snap && snapId !== rtVersion){ Logger.log('debug','stale resolve after transcribe ignored',{ snapId, current: rtVersion }); return; }
    if(!text){ Logger.setStatus('متنی برنگشت','warn'); Logger.toast('متنی نیست'); if(snap && snapId===rtVersion) rtSnap=null; return; }
    const s=Storage.getSettings();
    if(s.realtime && snap){
      // جایگزینی دقیق با diff-merge: اگر کاربر وسط ضبط ویرایش دستی کرده بود، متن دستی را پاک نکن
      const finalText = text.trim();
      const previewLen = (snap.committed+snap.pending).length;
      const expected = snap.before + snap.committed + snap.pending + snap.after;
      if(els.output.value !== expected){
        // ویرایش دستی — در موقعیت کرسر فعلی درج کن به جای بازنویسی before/after
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
    // پاکسازی فقط اگر همین snap فعال است — از پاک کردن ضبط جدیدتر جلوگیری کن
    if(!snap || snapId===rtVersion){ rtSnap=null; }
    els.liveFinal.textContent=''; els.liveInterim.textContent=''; els.output.dispatchEvent(new Event('input'));
    Storage.saveDraft(els.output.value);
    Quota.render(els.quotaGrid);
    Logger.setStatus(`✅ با ${engine} نشست`,'info'); Logger.toast('درج شد'); if(Storage.getSettings().autocopy) try{ await navigator.clipboard.writeText(text); }catch{}
    Logger.log('info','success',{engine, len:text.length});
  }catch(err){
    Logger.log('error','transcribe failed',{msg:err.message, status:err.status});
    let h='کلید/اینترنت را چک کن'; if(err.status===429) h='سهمیه پر — کمی صبر کن'; else if(err.status===404) h='مدل پیدا نشد'; else if(err.status===401) h='کلید نامعتبر';
    Logger.setStatus(`❌ خطا: ${err.message.slice(0,90)} — ${h}`,'error');
    // در خطا preview را نگه دار تا کاربر متن زنده را از دست ندهد، فقط rt را ریست نکن
  }
}

// misc
$('btn-test-groq').onclick=async()=>{ saveSettings(); Logger.setStatus('تست Groq...','warn'); try{ await Transcription.testGroq(); Logger.setStatus('✅ Groq اوکی','info'); Logger.toast('Groq ok'); }catch(e){ Logger.setStatus('❌ Groq: '+e.message,'error'); } };
$('btn-test-gemini').onclick=async()=>{ saveSettings(); Logger.setStatus('تست Gemini...','warn'); try{ await Transcription.testGemini(); Logger.setStatus(`✅ Gemini اوکی`,'info'); Logger.toast('Gemini ok'); }catch(e){ Logger.setStatus('❌ Gemini: '+e.message,'error'); } };
els.btnCopy.onclick=async()=>{ if(!els.output.value.trim()){ Logger.toast('چیزی نیست'); return; } await navigator.clipboard.writeText(els.output.value); const p=els.btnCopy.textContent; els.btnCopy.textContent='✓ کپی شد'; els.btnCopy.style.background='#137333'; setTimeout(()=>{ els.btnCopy.textContent=p; els.btnCopy.style.background=''; },1200); Logger.toast('کپی شد'); };
els.btnClear.onclick=()=>{ els.output.value=''; Storage.clearDraft(); selStart=selEnd=0; rtSnap=null; els.liveFinal.textContent=''; els.liveInterim.textContent=''; els.livePreview.classList.remove('on'); updateCounts(); Logger.setStatus('آماده','info'); Logger.toast('پاک شد'); };
stopWave(); Logger.log('info','ماژولار آماده', {hasRealtime: Realtime.isSupported(), proto: location.protocol});
Quota.render(els.quotaGrid);
