// Module: transcription
// Interface: transcribe(blob) -> {text, engine}, polish(text)->{text, model}, queryChat(providerId,text,{system,model,layer}) with layer naming the op in logs, testGroq(), testGemini(), listModels(providerId)
// Depth: chains: STT chain + Polish chain (OpenAI-compatible groq/openrouter/custom + Gemini) with fallback, quota, header handling
// Seam: at Transcription interface. Adapters internal, not exposed.
import { Storage, GROQ_BASE_DEFAULT, OPENROUTER_BASE_DEFAULT } from './storage.js';
import { Quota } from './quota.js';
import { Logger } from './logger.js';

function fmt(code){ const m={400:'درخواست نامعتبر (400)',401:'کلید نامعتبر (401)',403:'دسترسی ممنوع (403)',404:'مدل پیدا نشد (404)',429:'سهمیه پر شد (429)',500:'خطای سرور (500)'}; return m[code]||`HTTP ${code}` }
function assertTrustedBase(base, allowed){
  let u; try{ u = new URL(base); }catch{ throw Object.assign(new Error('BaseURL نامعتبر — باید https:// باشد'),{status:400}); }
  if(u.protocol!=='https:') throw Object.assign(new Error('BaseURL باید https باشد'),{status:400});
  const h = u.hostname.toLowerCase();
  if(!allowed.includes(h)){
    const msg = `کلید به ${h} ارسال می‌شود — ادامه می‌دهی؟`;
    if(typeof window !== 'undefined' && typeof window.confirm === 'function'){
      if(!window.confirm(msg)) throw Object.assign(new Error('لغو — BaseURL نامعتبر'),{status:400});
    } else {
      throw Object.assign(new Error('BaseURL نامعتبر — تأیید لازم است'),{status:400});
    }
    Logger.log('warn','untrusted BaseURL', { base, host:h });
  }
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
// Qwen reasoning models leak <think> into content unless reasoning_format:hidden — strip defensively + length guard
function cleanPolishOutput(raw){
  if(!raw) return '';
  let out = String(raw);
  out = out.replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/<thinking>[\s\S]*?<\/thinking>/gi, '');
  // unclosed trailing think block (stream cut)
  out = out.replace(/<think>[\s\S]*$/gi, '').replace(/<thinking>[\s\S]*$/gi, '');
  return out.trim();
}
function validatePolishOutput(raw, text, model, layer = 'polish'){
  const out = cleanPolishOutput(raw);
  if(!out) throw Object.assign(new Error(layer==='polish' ? 'پالیش خالی برگشت' : `خروجی ${layer} خالی بود`),{status:500});
  if(layer !== 'polish') return out;
  if(out.length > text.length*3 + 500){ Logger.log('warn','polish reasoning leak suspected',{model, inLen:text.length, outLen:out.length}); throw Object.assign(new Error('پالیش نامعتبر (نشت تفکر)'),{status:500}); }
  if(/(نیازی به (ویرایش|اصلاح))|((متأسفم)[\s\S]{0,30}(نمی‌توانم))|((نمی‌توانم)[\s\S]{0,30}(ویرایش|اصلاح))|(عذرخواه)|(به عنوان یک هوش)|(as an ai language model)|(no (editing|correction) (needed|required))|((the (original|input) text) is)|(no changes (needed|made))/i.test(out)){ Logger.log('warn','polish meta-commentary rejected',{model, inLen:text.length, outLen:out.length, out:out.slice(0,40)}); throw Object.assign(new Error('پالیش نامعتبر (توضیح به‌جای متن)'),{status:500}); }
  return out;
}
const DEFAULT_POLISH_SYSTEM = `You are a spelling/grammar proofreader. Fix only spelling, orthography and grammar errors in the SAME language as the input text; never change the language, meaning or tone. If no correction is needed, return the input text verbatim. Return ONLY the corrected text — never commentary, explanation or apology. (If the text is Persian and means UI, «رابطه کاربری» should become «رابط کاربری».)`;

// Resolve OpenAI-compatible credentials for providerId: built-ins groq/openrouter from fixed
// keys+bases, customs by id from Storage. Never logs key material — callers must not log the result.
function resolveChatProvider(providerId){
  const s = Storage.getSettings();
  if(providerId === 'groq') return { key: s.groqKey, base: (s.groqBaseURL || GROQ_BASE_DEFAULT).replace(/\/+$/,''), trusted: ['api.groq.com'], extraHeaders: {} };
  if(providerId === 'openrouter') return { key: s.openrouterKey, base: (s.openrouterBaseURL || OPENROUTER_BASE_DEFAULT).replace(/\/+$/,''), trusted: ['api.openrouter.ai','openrouter.ai'], extraHeaders: { 'HTTP-Referer': 'https://hamnegar.local', 'X-Title': 'HamNegar' } };
  const c = (s.customProviders || []).find(x => x.id === providerId);
  if(!c) throw Object.assign(new Error(`ارائه‌دهنده ناشناس: ${providerId}`),{status:400});
  return { key: c.key || '', base: (c.baseURL || '').replace(/\/+$/,''), trusted: [], extraHeaders: {} };
}

// Generic OpenAI-compatible chat — single network path for groq/openrouter/custom TEXT ops
// (polish, translate, ...). `layer` names the operation in logs so each layer filters
// separately (search the layer name in the log box); callers pass layer:'translate' etc.
async function queryChat(providerId, text, { system, model, layer = 'polish' } = {}){
// Custom hosts are never in `trusted`, so every custom call passes the user confirm gate.
// Payload semantics match the legacy Groq path (temperature/max_tokens/qwen guards).
  if(!model || typeof model !== 'string') throw Object.assign(new Error(layer==='polish' ? 'مدل پالیش مشخص نیست' : 'مدل عملیات متنی مشخص نیست'),{status:400});
  const { key: k, base, trusted, extraHeaders } = resolveChatProvider(providerId);
  if(!k) throw Object.assign(new Error(layer==='polish' ? `کلید ${providerId} برای پالیش نیست` : `کلید ${providerId} برای ${layer} نیست`),{status:401});
  if(providerId === 'groq' && !k.startsWith('gsk_')) throw Object.assign(new Error('Groq باید gsk_ باشد'),{status:401});
  if(!base) throw Object.assign(new Error('BaseURL ارائه‌دهنده خالی است'),{status:400});
  assertTrustedBase(base, trusted);
  const ctrl=new AbortController(), to=setTimeout(()=>ctrl.abort(),25000);
  const body = { model, messages:[{role:'system', content:system || DEFAULT_POLISH_SYSTEM},{role:'user', content:text}], temperature:0.2, max_tokens:2000 };
  // Qwen thinking models: instruct mode, hide reasoning (gpt-oss does NOT support reasoning_format — skip there)
  if(/^qwen\//i.test(model)) { body.reasoning_format = 'hidden'; body.reasoning_effort = 'none'; }
  let res; try{
    res=await fetch(`${base}/chat/completions`,{method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${k}`, ...extraHeaders},body:JSON.stringify(body),signal:ctrl.signal});
  }catch(e){ clearTimeout(to); if(e.name==='AbortError') throw Object.assign(new Error(`تایم‌اوت ${providerId} ${layer}`),{status:408}); throw Object.assign(new Error(`شبکه ${providerId} ${layer}: `+e.message),{status:0}); }
  clearTimeout(to);
  if(!res.ok){ const er=await parseErr(res); const err=new Error(`${fmt(res.status)} — ${er.msg}`); err.status=res.status; Logger.log('error',`${providerId} ${layer} fail`,{status:res.status, model, base}); throw err; }
  const j=await res.json(); Logger.log('debug',`${providerId} ${layer} raw`,{model, inLen:text.length, out:j.choices?.[0]?.message?.content?.trim()?.slice(0,200) || ''}); return validatePolishOutput(j.choices?.[0]?.message?.content?.trim()||'', text, model, layer);
}
async function queryPolishViaGemini(text, model, layer = 'polish'){
  const { geminiKey: k } = Storage.getSettings();
  if(!k) throw Object.assign(new Error(layer==='polish' ? 'کلید Gemini برای پالیش نیست' : `کلید Gemini برای ${layer} نیست`),{status:401});
  if(!(k.startsWith('AQ.')||k.startsWith('AIza'))) throw Object.assign(new Error('فرمت کلید Gemini اشتباه'),{status:401});
  const url=`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  const prompt = `You are a spelling/grammar proofreader. Fix only spelling, orthography and grammar errors in the SAME language as the input text; do not change the language, meaning or tone, do not explain, return ONLY the corrected text. If no correction is needed, return the input verbatim; never comment or apologize. (If the text is Persian and means UI, «رابطه کاربری» should become «رابط کاربری».)\nText:\n${text}`;
  const ctrl=new AbortController(), to=setTimeout(()=>ctrl.abort(),20000);
  let res; try{
    res=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json','x-goog-api-key':k},body:JSON.stringify({contents:[{parts:[{text:prompt}]}],generationConfig:{temperature:0.2,maxOutputTokens:2000}}),signal:ctrl.signal});
  }catch(e){ clearTimeout(to); if(e.name==='AbortError') throw Object.assign(new Error(`تایم‌اوت Gemini ${layer}`),{status:408}); throw Object.assign(new Error(`شبکه Gemini ${layer}: `+e.message),{status:0}); }
  clearTimeout(to);
  if(!res.ok){ const er=await parseErr(res); const err=new Error(`${fmt(res.status)} — ${er.msg}`); err.status=res.status; Logger.log('error',`Gemini ${layer} fail`,{status:res.status, model}); throw err; }
  const j=await res.json(); const out=j.candidates?.[0]?.content?.parts?.map(p=>p.text).join('')?.trim()||'';
  Logger.log('debug',`Gemini ${layer} raw`,{model, inLen:text.length, out:out.slice(0,200)});
  return validatePolishOutput(out, text, model, layer);
}
// Canonical polish entry shape {id, providerId, enabled}; legacy `provider` alias + string entries supported.
function polishTargetOf(entry){
  if(typeof entry === 'string'){
    const clean = entry.replace(':free','');
    return { model: clean, providerId: entry.includes(':free') ? 'openrouter' : 'groq' };
  }
  const model = (entry.id || '').replace(':free','');
  const rawPid = (typeof entry.providerId === 'string' && entry.providerId.trim()) ? entry.providerId.trim()
    : (typeof entry.provider === 'string' && entry.provider.trim() ? entry.provider.trim() : '');
  let providerId = rawPid;
  if(!providerId) providerId = (entry.id && entry.id.includes(':free')) ? 'openrouter' : (!model.includes('/') ? 'gemini' : 'groq');
  return { model, providerId };
}
async function queryPolish(text, entry, layer = 'polish'){
  const { model, providerId } = polishTargetOf(entry);
  if(providerId === 'gemini') return queryPolishViaGemini(text, model, layer);
  return queryChat(providerId, text, { model, layer });
}

function sttProviderOf(entry){
  if(entry && typeof entry === 'object'){
    if(typeof entry.providerId === 'string' && entry.providerId.trim()) return entry.providerId.trim();
    if(typeof entry.provider === 'string' && entry.provider.trim()) return entry.provider.trim();
  }
  const id = typeof entry === 'object' ? entry.id : entry;
  if(id==='groq') return 'groq';
  return 'gemini';
}
function hasKeyFor(entry){
  return Storage.hasKeyForProvider(sttProviderOf(entry));
}
function hasKeyForPolish(entry){
  return Storage.hasKeyForProvider(polishTargetOf(entry).providerId);
}
export const Transcription = {
  async transcribe(blob, opts={}){
    if(blob.size<800) throw Object.assign(new Error('صدا خیلی کوتاهه'),{status:400});
    const { sttChain, polishChain, polishEnabled } = Storage.getSettings();
    const rawChain = (sttChain && sttChain.length) ? sttChain : [{id:'groq',providerId:'groq',enabled:true},{id:'gemini-flash-lite-latest',providerId:'gemini',enabled:true}];
    // support both string[] legacy and object[] new
    const enabledChain = rawChain.filter(e=> typeof e==='object' ? e.enabled!==false : true);
    let chain = enabledChain.filter(id => hasKeyFor(id));
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
      const entry = chain[i];
      const id = typeof entry === 'object' ? entry.id : entry;
      const isGroq = sttProviderOf(entry)==='groq';
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
        const skippedP = enabledChain.filter(e => !hasKeyForPolish(e)).map(e=>`${e.id}(${e.providerId || e.provider})`);
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
              polishModelUsed = `${pm} (${entry.providerId || entry.provider})`;
              if(i>0) Logger.log('info',`پالیش فالبک موفق #${i+1} → ${pm} (${entry.providerId || entry.provider})`);
              break;
            }
          }catch(e){
            Logger.log('warn',`پالیش ${pm} (${entry.providerId || entry.provider}) خطا`,{msg:e.message, status:e.status});
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
    const rawChain = polishChain?.length ? polishChain : [{id:'qwen/qwen3.6-27b',providerId:'groq',enabled:true}];
    const enabledChain = rawChain.filter(e=>e && e.enabled!==false);
    const chain = enabledChain.filter(e => hasKeyForPolish(e));
    if(chain.length===0) return ruleFixed;
    for(const entry of chain){
      try{ const out=await queryPolish(text,entry); if(out) return rulePolish(out); }catch{}
    }
    return ruleFixed;
  },
  async listModels(providerId){
    if(providerId === 'gemini') throw Object.assign(new Error('لیست مدل Gemini پشتیبانی نمی‌شود'),{status:400});
    const { key: k, base, trusted } = resolveChatProvider(providerId);
    if(!k) throw new Error(`کلید ${providerId} نیست`);
    if(!base) throw new Error('BaseURL ارائه‌دهنده خالی است');
    assertTrustedBase(base, trusted);
    const r=await fetch(`${base}/models`,{headers:{Authorization:`Bearer ${k}`}});
    if(!r.ok){ const e=await parseErr(r); throw new Error(`${fmt(r.status)} — ${e.msg}`); }
    const j=await r.json(); return j.data?.map(m=>m.id) || j.models?.map(m=>m.id) || [];
  },
  // provider model lists: single path is listModels(providerId); app.js calls it via fetchAndShowModels/loadEasyModels
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
    const found = sttChain.find(m=> (typeof m==='object'?m.id:m)!=='groq');
    const model = (typeof found==='object'?found.id:found) || 'gemini-flash-lite-latest';
    const r=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}`,{headers:{'x-goog-api-key':k}});
    if(!r.ok){ const e=await parseErr(r); throw new Error(`${fmt(r.status)} — ${e.msg}`); }
    return r.json();
  },
  async queryChat(providerId, text, opts){ return queryChat(providerId, text, opts); },
  async testPolish(){
    return this.polishText('رابطه کاربری زیبا است');
  }
};
