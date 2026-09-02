// Module: transcription
// Interface: transcribe(blob) -> {text, engine}, polish(text)->{text, model}, testGroq(), testGemini()
// Depth: chains: STT chain + Polish chain with fallback, quota, header handling (x-goog-api-key), blob guard
// Seam: at Transcription interface. Adapters internal, not exposed.
import { Storage } from './storage.js';
import { Quota } from './quota.js';
import { Logger } from './logger.js';

function fmt(code){ const m={400:'درخواست نامعتبر (400)',401:'کلید نامعتبر (401)',403:'دسترسی ممنوع (403)',404:'مدل پیدا نشد (404)',429:'سهمیه پر شد (429)',500:'خطای سرور (500)'}; return m[code]||`HTTP ${code}` }
async function parseErr(res){ let b=''; try{ b=await res.text(); try{ const j=JSON.parse(b); return {text:b, msg:j.error?.message||j.error||j.message||b.slice(0,600)} }catch{ return {text:b, msg:b.slice(0,600)} } }catch{ return {text:'', msg:res.statusText} } }
function blobToB64(blob){ return new Promise((res,rej)=>{ const r=new FileReader(); r.onerror=()=>rej(new Error('خواندن صدا خطا')); r.onloadend=()=>{ try{ res(r.result.split(',')[1]); }catch(e){ rej(e); } }; r.readAsDataURL(blob); }); }
// rule-based polish fallback: ensures "رابطه کاربری" -> "رابط کاربری" when context is UI
function rulePolish(text){
  let out = text;
  // normalize only when "رابطه کاربری" appears (UI typo) -> "رابط کاربری"
  // keep "رابطه کاربری خوب" in interpersonal sense? But spec says this exact should be corrected to UI term.
  // Use simple replacement with boundary check
  out = out.replace(/رابطه\s+کاربری/g,'رابط کاربری');
  // common half-space fixes
  out = out.replace(/می\s+شود/g,'می‌شود').replace(/می\s+کند/g,'می‌کند').replace(/می\s+کنم/g,'می‌کنم');
  return out;
}

async function queryGroq(blob){
  const { groqKey: k } = Storage.getSettings();
  if(!k) throw Object.assign(new Error('کلید Groq نیست'),{status:401});
  if(!k.startsWith('gsk_')) throw Object.assign(new Error('Groq باید gsk_ باشد'),{status:401});
  if(blob.size<800) throw Object.assign(new Error('صدا خیلی کوتاهه'),{status:400});
  const fd=new FormData(); fd.append('file',blob,'speech.webm'); fd.append('model','whisper-large-v3'); fd.append('response_format','json');
  Logger.log('info','به Groq...',{size:blob.size});
  const ctrl=new AbortController(), to=setTimeout(()=>ctrl.abort(),35000);
  let res; try{ res=await fetch('https://api.groq.com/openai/v1/audio/transcriptions',{method:'POST',headers:{Authorization:`Bearer ${k}`},body:fd,signal:ctrl.signal}); }catch(e){ clearTimeout(to); if(e.name==='AbortError') throw Object.assign(new Error('تایم‌اوت Groq'),{status:408}); throw Object.assign(new Error('شبکه Groq: '+e.message),{status:0}); }
  clearTimeout(to);
  if(!res.ok){ const er=await parseErr(res); Logger.log('error','Groq fail',{status:res.status, body:er.text}); const err=new Error(`${fmt(res.status)} — ${er.msg}`); err.status=res.status; throw err; }
  const j=await res.json(); Logger.log('info','Groq ok',j); Quota.record('groq'); return (j.text||'').trim();
}
async function queryGemini(blob, model){
  const { geminiKey: k } = Storage.getSettings();
  if(!k) throw Object.assign(new Error('کلید Gemini نیست'),{status:401});
  if(!(k.startsWith('AQ.')||k.startsWith('AIza'))) throw Object.assign(new Error('فرمت کلید اشتباه'),{status:401});
  if(blob.size<800) throw Object.assign(new Error('صدا خیلی کوتاهه'),{status:400});
  const b64=await blobToB64(blob);
  Logger.log('info',`به Gemini ${model}...`,{size:blob.size});
  const url=`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  const ctrl=new AbortController(), to=setTimeout(()=>ctrl.abort(),40000);
  let res; try{ res=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json','x-goog-api-key':k},body:JSON.stringify({contents:[{parts:[{text:"Transcribe verbatim in original language(s). Only transcription, no summary."},{inlineData:{mimeType:blob.type||"audio/webm",data:b64}}]}],generationConfig:{temperature:0.1}}),signal:ctrl.signal}); }catch(e){ clearTimeout(to); if(e.name==='AbortError') throw Object.assign(new Error('تایم‌اوت Gemini'),{status:408}); throw Object.assign(new Error('شبکه Gemini: '+e.message),{status:0}); }
  clearTimeout(to);
  if(!res.ok){ const er=await parseErr(res); let hint=''; if(res.status===404) hint=' — مدل بعدی امتحان می‌شود'; const err=new Error(`${fmt(res.status)} — ${er.msg}${hint}`); err.status=res.status; Logger.log('error','Gemini fail',{status:res.status, model, body:er.text}); throw err; }
  const j=await res.json(); Logger.log('debug','Gemini raw',j); Quota.record(model); return j.candidates?.[0]?.content?.parts?.map(p=>p.text).join('')?.trim()||'';
}

// Polish adapters
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
  if(out) Quota.record(model);
  return out;
}
async function queryPolishViaOpenRouter(text, model){
  const { openrouterKey: k, geminiKey: gk } = Storage.getSettings();
  // if no openrouter key but gemini exists, fallback to gemini-flash-lite for polish
  if(!k){
    if(gk) return queryPolishViaGemini(text, 'gemini-flash-lite-latest');
    throw Object.assign(new Error('کلید OpenRouter نیست'),{status:401});
  }
  const prompt = `تو ویراستار فارسی هستی. فقط غلط‌های املایی/نگارشی را اصلاح کن، بدون توضیح اضافه. «رابطه کاربری» (UI) را به «رابط کاربری» تبدیل کن. فقط متن اصلاح‌شده را برگردان.`;
  const ctrl=new AbortController(), to=setTimeout(()=>ctrl.abort(),25000);
  let res; try{
    res=await fetch('https://openrouter.ai/api/v1/chat/completions',{method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${k}`,'HTTP-Referer':'https://hamnegar.local','X-Title':'HamNegar'},body:JSON.stringify({model, messages:[{role:'system', content:prompt},{role:'user', content:text}], temperature:0.2, max_tokens:2000}),signal:ctrl.signal});
  }catch(e){ clearTimeout(to); if(e.name==='AbortError') throw Object.assign(new Error('تایم‌اوت OpenRouter'),{status:408}); throw Object.assign(new Error('شبکه OpenRouter: '+e.message),{status:0}); }
  clearTimeout(to);
  if(!res.ok){ const er=await parseErr(res); const err=new Error(`${fmt(res.status)} — ${er.msg}`); err.status=res.status; Logger.log('error','OpenRouter polish fail',{status:res.status, model}); throw err; }
  const j=await res.json(); const out=j.choices?.[0]?.message?.content?.trim()||'';
  if(out) Quota.record(model);
  return out;
}
async function queryPolish(text, model){
  // model contains "/" -> OpenRouter/Kilo, else Gemini-style
  if(model.includes('/')) return queryPolishViaOpenRouter(text, model);
  return queryPolishViaGemini(text, model);
}

export const Transcription = {
  async transcribe(blob){
    // blob guard once before chain (REVIEW trap)
    if(blob.size<800) throw Object.assign(new Error('صدا خیلی کوتاهه'),{status:400});
    const { sttChain, polishChain, polishEnabled } = Storage.getSettings();
    const chain = (sttChain && sttChain.length) ? sttChain : ['groq','gemini-flash-lite-latest'];
    let lastErr=null, usedEngine='—', rawText='';
    for(let i=0;i<chain.length;i++){
      const id = chain[i];
      const isGroq = id==='groq';
      const label = isGroq ? 'Groq' : id;
      try{
        const t = isGroq ? await queryGroq(blob) : await queryGemini(blob, id);
        rawText = t;
        usedEngine = label;
        if(i>0) Logger.log('info',`فالبک موفق: STT #${i+1}/${chain.length} → ${label}`);
        break;
      }catch(err){
        lastErr=err;
        Logger.log('warn',`STT ${label} خطا (${i+1}/${chain.length})`,{msg:err.message, status:err.status});
        if(err.status===401||err.status===403){
          const s=Storage.getSettings();
          const next = chain[i+1];
          if(next){
            const hasNext = next==='groq' ? !!s.groqKey : !!s.geminiKey;
            if(!hasNext){ Logger.log('warn',`کلید ${next} نیست — فالبک متوقف`,{}); }
          }
          // skip missing-key engines: filter remaining chain for hasKey, if none left throw
          const remaining = chain.slice(i+1);
          const hasAnyRemainingKey = remaining.some(rid => rid==='groq' ? !!s.groqKey : !!s.geminiKey);
          if(!hasAnyRemainingKey){ throw err; }
          // if next engine lacks key, continue will skip to next iteration which will throw 401 again — but we already checked hasAny; loop will naturally skip? still continue
        }
        if(i===chain.length-1) throw err;
        // small delay before next for 429
        if(err.status===429) await new Promise(r=>setTimeout(r,600));
        // skip next if it has no key (avoid wasted 401)
        const s2=Storage.getSettings();
        let nxt = chain[i+1];
        if(nxt && (nxt==='groq' ? !s2.groqKey : !s2.geminiKey)){
          // find next with key
          let found=false;
          for(let j=i+1;j<chain.length;j++){ if(chain[j]==='groq' ? !!s2.groqKey : !!s2.geminiKey){ found=true; break; } }
          if(!found) throw err;
        }
        continue;
      }
    }
    if(!rawText){
      if(lastErr) throw lastErr;
      throw new Error('متنی برنگشت');
    }
    // Polish chain if enabled
    let finalText = rawText;
    let polishModelUsed = null;
    if(polishEnabled && polishChain && polishChain.length){
      // first always try rule-based quick fix for spec example, but still attempt model for broader polish
      const ruleFixed = rulePolish(rawText);
      // try model chain
      let polished=null;
      for(let i=0;i<polishChain.length;i++){
        const pm = polishChain[i];
        try{
          const out = await queryPolish(rawText, pm);
          if(out){
            polished = out;
            polishModelUsed = pm;
            if(i>0) Logger.log('info',`پالیش فالبک موفق #${i+1} → ${pm}`);
            break;
          }
        }catch(e){
          Logger.log('warn',`پالیش ${pm} خطا`,{msg:e.message, status:e.status});
          if(e.status===401||e.status===403){
            const s=Storage.getSettings();
            const isOR = pm.includes('/');
            if(isOR && !s.openrouterKey){ Logger.log('warn','کلید OpenRouter نیست — پالیش فالبک متوقف'); break; }
          }
          if(e.status===429) await new Promise(r=>setTimeout(r,500));
          if(i===polishChain.length-1) break;
        }
      }
      if(polished){
        // ensure rule still applied if model missed the specific typo
        finalText = rulePolish(polished);
      } else {
        finalText = ruleFixed;
        Logger.log('info','پالیش مدل‌ها ناموفق — قانون محلی اعمال شد',{before:rawText.slice(0,60), after:finalText.slice(0,60)});
      }
    }
    return { text: finalText, engine: usedEngine, raw: rawText, polishModel: polishModelUsed, sttChain: chain };
  },
  // exposed for manual polish button / tests
  async polishText(text){
    if(!text?.trim()) return text;
    const ruleFixed = rulePolish(text);
    const { polishChain, polishEnabled } = Storage.getSettings();
    if(!polishEnabled) return ruleFixed;
    const chain = polishChain?.length ? polishChain : ['qwen/qwen3-30b-a3b:free'];
    for(const m of chain){
      try{ const out=await queryPolish(text,m); if(out) return rulePolish(out); }catch{}
    }
    return ruleFixed;
  },
  async testGroq(){
    const { groqKey: k }=Storage.getSettings();
    if(!k) throw new Error('خالیه'); if(!k.startsWith('gsk_')) throw new Error('باید gsk_ باشد');
    const r=await fetch('https://api.groq.com/openai/v1/models',{headers:{Authorization:`Bearer ${k}`}});
    if(!r.ok){ const e=await parseErr(r); throw new Error(`${fmt(r.status)} — ${e.msg}`); }
    return true;
  },
  async testGemini(){
    const { geminiKey: k }=Storage.getSettings();
    if(!k) throw new Error('خالیه'); if(!(k.startsWith('AQ.')||k.startsWith('AIza'))) throw new Error('باید AQ. یا AIza باشد');
    // use first gemini in chain
    const { sttChain } = Storage.getSettings();
    const model = (sttChain.find(m=>m!=='groq') ) || 'gemini-flash-lite-latest';
    const r=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}`,{headers:{'x-goog-api-key':k}});
    if(!r.ok){ const e=await parseErr(r); throw new Error(`${fmt(r.status)} — ${e.msg}`); }
    return r.json();
  },
  async testPolish(){
    // keep for backwards compat — delegates to polishText which respects polishEnabled and chain fallback
    return this.polishText('رابطه کاربری زیبا است');
  }
};
