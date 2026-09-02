// Module: transcription
// Interface: transcribe(blob) -> {text, engine}, polish(text)->{text, model}, testGroq(), testGemini(), listModels()
// Depth: chains: STT chain + Polish chain (dual-provider Groq/OpenRouter) with fallback, quota, header handling
// Seam: at Transcription interface. Adapters internal, not exposed.
import { Storage, GROQ_BASE_DEFAULT, OPENROUTER_BASE_DEFAULT } from './storage.js';
import { Quota } from './quota.js';
import { Logger } from './logger.js';

function fmt(code){ const m={400:'درخواست نامعتبر (400)',401:'کلید نامعتبر (401)',403:'دسترسی ممنوع (403)',404:'مدل پیدا نشد (404)',429:'سهمیه پر شد (429)',500:'خطای سرور (500)'}; return m[code]||`HTTP ${code}` }
function assertTrustedBase(base, allowed){
  try{
    const h = new URL(base).hostname.toLowerCase();
    if(!allowed.includes(h)){
      const msg = `کلید به ${h} ارسال می‌شود — ادامه می‌دهی؟`;
      if(typeof window !== 'undefined' && typeof window.confirm === 'function'){
        if(!window.confirm(msg)) throw Object.assign(new Error('لغو — BaseURL نامعتبر'),{status:400});
      }
      Logger.log('warn','untrusted BaseURL', { base, host:h });
    }
  }catch(e){ if(e.status===400) throw e; /* invalid URL handled elsewhere */ }
}
async function parseErr(res){ let b=''; try{ b=await res.text(); try{ const j=JSON.parse(b); return {text:b, msg:j.error?.message||j.error||j.message||b.slice(0,600)} }catch{ return {text:b, msg:b.slice(0,600)} } }catch{ return {text:'', msg:res.statusText} } }
function blobToB64(blob){ return new Promise((res,rej)=>{ const r=new FileReader(); r.onerror=()=>rej(new Error('خواندن صدا خطا')); r.onloadend=()=>{ try{ res(r.result.split(',')[1]); }catch(e){ rej(e); } }; r.readAsDataURL(blob); }); }
function rulePolish(text){
  let out = text;
  out = out.replace(/رابطه\s+کاربری/g,'رابط کاربری');
  out = out.replace(/می\s+شود/g,'می‌شود').replace(/می\s+کند/g,'می‌کند').replace(/می\s+کنم/g,'می‌کنم');
  return out;
}

async function queryGroq(blob, externalSignal){
  const { groqKey: k, groqBaseURL } = Storage.getSettings();
  if(!k) throw Object.assign(new Error('کلید Groq نیست'),{status:401});
  if(!k.startsWith('gsk_')) throw Object.assign(new Error('Groq باید gsk_ باشد'),{status:401});
  if(blob.size<800) throw Object.assign(new Error('صدا خیلی کوتاهه'),{status:400});
  const fd=new FormData(); fd.append('file',blob,'speech.webm'); fd.append('model','whisper-large-v3'); fd.append('response_format','json');
  Logger.log('info','به Groq...',{size:blob.size});
  const ctrl=new AbortController(), to=setTimeout(()=>ctrl.abort(),35000);
  if (externalSignal) externalSignal.addEventListener('abort', () => ctrl.abort(), { once: true });
  const base = (groqBaseURL || 'https://api.groq.com/openai/v1').replace(/\/+$/,'');
  assertTrustedBase(base, ['api.groq.com']);
  let res; try{ res=await fetch(`${base}/audio/transcriptions`,{method:'POST',headers:{Authorization:`Bearer ${k}`},body:fd,signal:ctrl.signal}); }catch(e){ clearTimeout(to); if(e.name==='AbortError') throw Object.assign(new Error(externalSignal?.aborted ? 'لغو شد' : 'تایم‌اوت Groq'),{status:408, aborted: !!externalSignal?.aborted}); throw Object.assign(new Error('شبکه Groq: '+e.message),{status:0}); }
  clearTimeout(to);
  if(!res.ok){ const er=await parseErr(res); Logger.log('error','Groq fail',{status:res.status, body:er.text}); const err=new Error(`${fmt(res.status)} — ${er.msg}`); err.status=res.status; throw err; }
  const j=await res.json(); Logger.log('info','Groq ok',j); return (j.text||'').trim();
}
async function queryGemini(blob, model, externalSignal){
  const { geminiKey: k } = Storage.getSettings();
  if(!k) throw Object.assign(new Error('کلید Gemini نیست'),{status:401});
  if(!(k.startsWith('AQ.')||k.startsWith('AIza'))) throw Object.assign(new Error('فرمت کلید اشتباه'),{status:401});
  if(blob.size<800) throw Object.assign(new Error('صدا خیلی کوتاهه'),{status:400});
  const b64=await blobToB64(blob);
  Logger.log('info',`به Gemini ${model}...`,{size:blob.size});
  const url=`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  const ctrl=new AbortController(), to=setTimeout(()=>ctrl.abort(),40000);
  if (externalSignal) externalSignal.addEventListener('abort', () => ctrl.abort(), { once: true });
  let res; try{ res=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json','x-goog-api-key':k},body:JSON.stringify({contents:[{parts:[{text:"Transcribe verbatim in original language(s). Only transcription, no summary."},{inlineData:{mimeType:blob.type||"audio/webm",data:b64}}]}],generationConfig:{temperature:0.1}}),signal:ctrl.signal}); }catch(e){ clearTimeout(to); if(e.name==='AbortError') throw Object.assign(new Error(externalSignal?.aborted ? 'لغو شد' : 'تایم‌اوت Gemini'),{status:408, aborted: !!externalSignal?.aborted}); throw Object.assign(new Error('شبکه Gemini: '+e.message),{status:0}); }
  clearTimeout(to);
  if(!res.ok){ const er=await parseErr(res); let hint=''; if(res.status===404) hint=' — مدل بعدی امتحان می‌شود'; const err=new Error(`${fmt(res.status)} — ${er.msg}${hint}`); err.status=res.status; Logger.log('error','Gemini fail',{status:res.status, model, body:er.text}); throw err; }
  const j=await res.json(); Logger.log('debug','Gemini raw',j); return j.candidates?.[0]?.content?.parts?.map(p=>p.text).join('')?.trim()||'';
}

// Polish adapters — dual provider (Groq OpenAI-compatible + OpenRouter + Gemini fallback)
async function queryPolishViaGroq(text, model){
  const { groqKey: k, groqBaseURL } = Storage.getSettings();
  if(!k) throw Object.assign(new Error('کلید Groq برای پالیش نیست'),{status:401});
  if(!k.startsWith('gsk_')) throw Object.assign(new Error('Groq باید gsk_ باشد'),{status:401});
  const base = (groqBaseURL || GROQ_BASE_DEFAULT).replace(/\/+$/,'');
  assertTrustedBase(base, ['api.groq.com']);
  const prompt = `تو ویراستار فارسی هستی. فقط غلط‌های املایی/نگارشی را اصلاح کن، بدون توضیح اضافه. «رابطه کاربری» (UI) را به «رابط کاربری» تبدیل کن. فقط متن اصلاح‌شده را برگردان.`;
  const ctrl=new AbortController(), to=setTimeout(()=>ctrl.abort(),25000);
  let res; try{
    res=await fetch(`${base}/chat/completions`,{method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${k}`},body:JSON.stringify({model, messages:[{role:'system', content:prompt},{role:'user', content:text}], temperature:0.2, max_tokens:2000}),signal:ctrl.signal});
  }catch(e){ clearTimeout(to); if(e.name==='AbortError') throw Object.assign(new Error('تایم‌اوت Groq polish'),{status:408}); throw Object.assign(new Error('شبکه Groq polish: '+e.message),{status:0}); }
  clearTimeout(to);
  if(!res.ok){ const er=await parseErr(res); const err=new Error(`${fmt(res.status)} — ${er.msg}`); err.status=res.status; Logger.log('error','Groq polish fail',{status:res.status, model, base}); throw err; }
  const j=await res.json(); const out=j.choices?.[0]?.message?.content?.trim()||'';
  return out;
}
async function queryPolishViaGemini(text, model){
  const { geminiKey: k } = Storage.getSettings();
  if(!k) throw Object.assign(new Error('کلید Gemini برای پالیش نیست'),{status:401});
  if(!(k.startsWith('AQ.')||k.startsWith('AIza'))) throw Object.assign(new Error('فرمت کلید Gemini اشتباه'),{status:401});
  const url=`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  const prompt = `تو ویراستار فارسی هستی. فقط غلط‌های املایی و نگارشی را درست کن، معنی و لحن را عوض نکن، توضیح نده، فقط متن اصلاح‌شده را برگردان. نمونه: «رابطه کاربری» وقتی منظور UI است باید «رابط کاربری» شود.\nمتن:\n${text}`;
  const ctrl=new AbortController(), to=setTimeout(()=>ctrl.abort(),20000);
  let res; try{
    res=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json','x-goog-api-key':k},body:JSON.stringify({contents:[{parts:[{text:prompt}]}],generationConfig:{temperature:0.2,maxOutputTokens:2000}}),signal:ctrl.signal});
  }catch(e){ clearTimeout(to); if(e.name==='AbortError') throw Object.assign(new Error('تایم‌اوت Gemini polish'),{status:408}); throw Object.assign(new Error('شبکه Gemini polish: '+e.message),{status:0}); }
  clearTimeout(to);
  if(!res.ok){ const er=await parseErr(res); const err=new Error(`${fmt(res.status)} — ${er.msg}`); err.status=res.status; Logger.log('error','Gemini polish fail',{status:res.status, model}); throw err; }
  const j=await res.json(); const out=j.candidates?.[0]?.content?.parts?.map(p=>p.text).join('')?.trim()||'';
  return out;
}
async function queryPolishViaOpenRouter(text, model){
  const { openrouterKey: k, openrouterBaseURL } = Storage.getSettings();
  if(!k) throw Object.assign(new Error('کلید OpenRouter نیست'),{status:401});
  const base = (openrouterBaseURL || OPENROUTER_BASE_DEFAULT).replace(/\/+$/,'');
  assertTrustedBase(base, ['api.openrouter.ai','openrouter.ai']);
  const prompt = `تو ویراستار فارسی هستی. فقط غلط‌های املایی/نگارشی را اصلاح کن، بدون توضیح اضافه. «رابطه کاربری» (UI) را به «رابط کاربری» تبدیل کن. فقط متن اصلاح‌شده را برگردان.`;
  const ctrl=new AbortController(), to=setTimeout(()=>ctrl.abort(),25000);
  let res; try{
    res=await fetch(`${base}/chat/completions`,{method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${k}`,'HTTP-Referer':'https://hamnegar.local','X-Title':'HamNegar'},body:JSON.stringify({model, messages:[{role:'system', content:prompt},{role:'user', content:text}], temperature:0.2, max_tokens:2000}),signal:ctrl.signal});
  }catch(e){ clearTimeout(to); if(e.name==='AbortError') throw Object.assign(new Error('تایم‌اوت OpenRouter'),{status:408}); throw Object.assign(new Error('شبکه OpenRouter: '+e.message),{status:0}); }
  clearTimeout(to);
  if(!res.ok){ const er=await parseErr(res); const err=new Error(`${fmt(res.status)} — ${er.msg}`); err.status=res.status; Logger.log('error','OpenRouter polish fail',{status:res.status, model, base}); throw err; }
  const j=await res.json(); const out=j.choices?.[0]?.message?.content?.trim()||'';
  return out;
}
async function queryPolish(text, entry){
  const model = typeof entry === 'string' ? entry : entry.id;
  const provider = typeof entry === 'string' ? (entry.includes(':free') ? 'openrouter' : 'groq') : (entry.provider || 'groq');
  if(provider === 'groq') return queryPolishViaGroq(text, model);
  if(provider === 'openrouter') return queryPolishViaOpenRouter(text, model);
  if(provider === 'gemini') return queryPolishViaGemini(text, model);
  if(!model.includes('/')) return queryPolishViaGemini(text, model);
  return queryPolishViaOpenRouter(text, model);
}

function hasKeyFor(id){
  const s=Storage.getSettings();
  if(id==='groq') return !!s.groqKey;
  if(typeof id === 'object' && id.provider) {
    if(id.provider==='groq') return !!s.groqKey;
    if(id.provider==='openrouter') return !!s.openrouterKey;
    return !!s.geminiKey;
  }
  if(typeof id === 'string' && id.includes('/')) {
    // legacy: treat slash ids as groq unless :free
    if(id.includes(':free')) return !!s.openrouterKey;
    return !!s.groqKey;
  }
  return !!s.geminiKey;
}
function hasKeyForPolish(entry){
  const s=Storage.getSettings();
  const provider = entry.provider || 'groq';
  if(provider==='groq') return !!s.groqKey;
  if(provider==='openrouter') return !!s.openrouterKey;
  return !!s.geminiKey;
}
export const Transcription = {
  async transcribe(blob, opts={}){
    if(blob.size<800) throw Object.assign(new Error('صدا خیلی کوتاهه'),{status:400});
    const { sttChain, polishChain, polishEnabled } = Storage.getSettings();
    const rawChain = (sttChain && sttChain.length) ? sttChain : ['groq','gemini-flash-lite-latest'];
    let chain = rawChain.filter(id => hasKeyFor(id));
    if(chain.length===0){
      throw Object.assign(new Error('کلید STT نیست — تنظیمات را چک کن'),{status:401});
    }
    if(chain.length !== rawChain.length){
      const skipped = rawChain.filter(id => !hasKeyFor(id));
      if(skipped.length) Logger.log('info','STT بی‌کلید حذف شد', { skipped });
    }
    try { Logger.rebuildProgress(chain); } catch (e) { Logger.log('warn','rebuildProgress failed', { msg:e.message }); }
    let lastErr=null, usedEngine='—', rawText='';
    for(let i=0;i<chain.length;i++){
      const id = chain[i];
      const isGroq = id==='groq';
      const label = isGroq ? 'Groq' : id;
      const signal = opts.signal;
      if (signal?.aborted) {
        Logger.setProgress({ state: 'failed', index: i, total: chain.length, label: `لغو شد` });
        throw Object.assign(new Error('لغو شد'), { status: 0, aborted: true });
      }
      try{
        if (i === 0) {
          Logger.setProgress({ state: 'trying', index: i, total: chain.length, label: `در حال تبدیل با ${label}…` });
          Logger.toast(`در حال تبدیل با ${label}… (قدم ${i + 1} از ${chain.length})`, 3500);
        } else {
          Logger.setProgress({ state: 'trying', index: i, total: chain.length, label: `تلاش با ${label}…` });
        }
        const t = isGroq ? await queryGroq(blob, signal) : await queryGemini(blob, id, signal);
        rawText = t;
        usedEngine = label;
        if(i>0) Logger.log('info',`فالبک موفق: STT #${i+1}/${chain.length} → ${label}`);
        Logger.setProgress({ state: 'done', index: i, total: chain.length, label: `با ${label} نشست` + (i>0?` (فالبک ${i+1}/${chain.length})`:'' ) });
        if(i>0) Logger.toast(`✅ با ${label} نشست` + (i>0?` (فالبک ${i+1}/${chain.length})`:''), 2600);
        break;
      }catch(err){
        if (err.aborted || signal?.aborted) {
          Logger.setProgress({ state: 'failed', index: i, total: chain.length, label: `لغو شد` });
          throw err;
        }
        lastErr=err;
        Logger.log('warn',`STT ${label} خطا (${i+1}/${chain.length})`,{msg:err.message, status:err.status});
        Logger.setProgress({ state: 'failed', index: i, total: chain.length, label: `خطا ${label} — تلاش با بعدی…` });
        if (err.status === 429) Logger.toast(`⚠️ سهمیه ${label} پر — تلاش با بعدی…`, 2000);
        else if (err.status === 404) Logger.toast(`⚠️ ${label} پیدا نشد — بعدی…`, 2000);
        else if (err.status === 401 || err.status === 403) Logger.toast(`⚠️ کلید ${label} نامعتبر — بعدی…`, 2000);
        if(i===chain.length-1) throw err;
        if(err.status===429) await new Promise(r=>setTimeout(r,600));
        continue;
      }
    }
    if(!rawText){
      if(lastErr) throw lastErr;
      throw new Error('متنی برنگشت');
    }
    {
      const words = rawText.trim() ? rawText.trim().split(/\s+/).filter(Boolean).length : 0;
      const chars = rawText.length;
      const durationMs = typeof opts.durationMs === 'number' ? opts.durationMs : 0;
      try{ Quota.record(usedEngine === 'Groq' ? 'groq' : usedEngine, { durationMs, words, chars }); }catch{}
    }
    let finalText = rawText;
    let polishModelUsed = null;
    if(polishEnabled && polishChain && polishChain.length){
      const ruleFixed = rulePolish(rawText);
      // filter by enabled + key
      const enabledChain = polishChain.filter(e=>e.enabled!==false);
      let usablePolish = enabledChain.filter(e => hasKeyForPolish(e));
      if(usablePolish.length !== enabledChain.length){
        const skippedP = enabledChain.filter(e => !hasKeyForPolish(e)).map(e=>`${e.id}(${e.provider})`);
        if(skippedP.length) Logger.log('info','پالیش بی‌کلید حذف شد', { skipped: skippedP });
      }
      if(usablePolish.length === 0 && enabledChain.length>0){
        Logger.log('info','پالیش همه خاموش یا بی‌کلید — قانون محلی اعمال شد',{before:rawText.slice(0,60), after:ruleFixed.slice(0,60)});
        finalText = ruleFixed;
      } else {
        let polished=null;
        for(let i=0;i<usablePolish.length;i++){
          const entry = usablePolish[i];
          const pm = entry.id;
          try{
            const out = await queryPolish(rawText, entry);
            if(out){
              polished = out;
              polishModelUsed = `${pm} (${entry.provider})`;
              if(i>0) Logger.log('info',`پالیش فالبک موفق #${i+1} → ${pm} (${entry.provider})`);
              break;
            }
          }catch(e){
            Logger.log('warn',`پالیش ${pm} (${entry.provider}) خطا`,{msg:e.message, status:e.status});
            if(e.status===429) await new Promise(r=>setTimeout(r,500));
            if(i===usablePolish.length-1) break;
          }
        }
        if(polished){
          finalText = rulePolish(polished);
        } else {
          finalText = ruleFixed;
          if(usablePolish.length>0) Logger.log('info','پالیش مدل‌ها ناموفق — قانون محلی اعمال شد',{before:rawText.slice(0,60), after:finalText.slice(0,60)});
        }
      }
    }
    return { text: finalText, engine: usedEngine, raw: rawText, polishModel: polishModelUsed, sttChain: chain };
  },
  async polishText(text){
    if(!text?.trim()) return text;
    const ruleFixed = rulePolish(text);
    const { polishChain, polishEnabled } = Storage.getSettings();
    if(!polishEnabled) return ruleFixed;
    const rawChain = polishChain?.length ? polishChain : [{id:'qwen/qwen3.6-27b',provider:'groq',enabled:true}];
    const enabledChain = rawChain.filter(e=>e && e.enabled!==false);
    const chain = enabledChain.filter(e => hasKeyForPolish(e));
    if(chain.length===0) return ruleFixed;
    for(const entry of chain){
      try{ const out=await queryPolish(text,entry); if(out) return rulePolish(out); }catch{}
    }
    return ruleFixed;
  },
  async listGroqModels(){
    const { groqKey: k, groqBaseURL } = Storage.getSettings();
    if(!k) throw new Error('کلید Groq نیست');
    const base = (groqBaseURL || GROQ_BASE_DEFAULT).replace(/\/+$/,'');
    assertTrustedBase(base, ['api.groq.com']);
    const r=await fetch(`${base}/models`,{headers:{Authorization:`Bearer ${k}`}});
    if(!r.ok){ const e=await parseErr(r); throw new Error(`${fmt(r.status)} — ${e.msg}`); }
    const j=await r.json(); return j.data?.map(m=>m.id) || j.models?.map(m=>m.id) || [];
  },
  async listOpenRouterModels(){
    const { openrouterKey: k, openrouterBaseURL } = Storage.getSettings();
    if(!k) throw new Error('کلید OpenRouter نیست');
    const base = (openrouterBaseURL || OPENROUTER_BASE_DEFAULT).replace(/\/+$/,'');
    assertTrustedBase(base, ['api.openrouter.ai','openrouter.ai']);
    const r=await fetch(`${base}/models`,{headers:{Authorization:`Bearer ${k}`}});
    if(!r.ok){ const e=await parseErr(r); throw new Error(`${fmt(r.status)} — ${e.msg}`); }
    const j=await r.json(); return j.data?.map(m=>m.id) || [];
  },
  async testGroq(){
    const { groqKey: k, groqBaseURL }=Storage.getSettings();
    if(!k) throw new Error('خالیه'); if(!k.startsWith('gsk_')) throw new Error('باید gsk_ باشد');
    const base = (groqBaseURL || GROQ_BASE_DEFAULT).replace(/\/+$/,'');
    assertTrustedBase(base, ['api.groq.com']);
    const r=await fetch(`${base}/models`,{headers:{Authorization:`Bearer ${k}`}});
    if(!r.ok){ const e=await parseErr(r); throw new Error(`${fmt(r.status)} — ${e.msg}`); }
    return true;
  },
  async testGemini(){
    const { geminiKey: k }=Storage.getSettings();
    if(!k) throw new Error('خالیه'); if(!(k.startsWith('AQ.')||k.startsWith('AIza'))) throw new Error('باید AQ. یا AIza باشد');
    const { sttChain } = Storage.getSettings();
    const model = (sttChain.find(m=>m!=='groq') ) || 'gemini-flash-lite-latest';
    const r=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}`,{headers:{'x-goog-api-key':k}});
    if(!r.ok){ const e=await parseErr(r); throw new Error(`${fmt(r.status)} — ${e.msg}`); }
    return r.json();
  },
  async testPolish(){
    return this.polishText('رابطه کاربری زیبا است');
  }
};
