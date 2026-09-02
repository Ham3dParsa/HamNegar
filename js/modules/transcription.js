// Module: transcription
// Interface: transcribe(blob) -> {text, engine}, testGroq(), testGemini()
// Depth: small interface, large implementation: two adapters (Groq, Gemini), smart fallback, quota recording, header handling (AQ.).
// Seam: at Transcription interface. Adapters are Groq and Gemini internals, not exposed.
import { Storage } from './storage.js';
import { Quota } from './quota.js';
import { Logger } from './logger.js';

function fmt(code){ const m={400:'درخواست نامعتبر (400)',401:'کلید نامعتبر (401)',403:'دسترسی ممنوع (403)',404:'مدل پیدا نشد (404)',429:'سهمیه پر شد (429)',500:'خطای سرور (500)'}; return m[code]||`HTTP ${code}` }
async function parseErr(res){ let b=''; try{ b=await res.text(); try{ const j=JSON.parse(b); return {text:b, msg:j.error?.message||j.error||j.message||b.slice(0,600)} }catch{ return {text:b, msg:b.slice(0,600)} } }catch{ return {text:'', msg:res.statusText} } }
function blobToB64(blob){ return new Promise((res,rej)=>{ const r=new FileReader(); r.onerror=()=>rej(new Error('خواندن صدا خطا')); r.onloadend=()=>{ try{ res(r.result.split(',')[1]); }catch(e){ rej(e); } }; r.readAsDataURL(blob); }); }

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
async function queryGemini(blob){
  const { geminiKey: k, model } = Storage.getSettings();
  if(!k) throw Object.assign(new Error('کلید Gemini نیست'),{status:401});
  if(!(k.startsWith('AQ.')||k.startsWith('AIza'))) throw Object.assign(new Error('فرمت کلید اشتباه'),{status:401});
  if(blob.size<800) throw Object.assign(new Error('صدا خیلی کوتاهه'),{status:400});
  const b64=await blobToB64(blob);
  Logger.log('info',`به Gemini ${model}...`,{size:blob.size});
  const url=`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  const ctrl=new AbortController(), to=setTimeout(()=>ctrl.abort(),40000);
  let res; try{ res=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json','x-goog-api-key':k},body:JSON.stringify({contents:[{parts:[{text:"Transcribe verbatim in original language(s). Only transcription, no summary."},{inlineData:{mimeType:blob.type||"audio/webm",data:b64}}]}],generationConfig:{temperature:0.1}}),signal:ctrl.signal}); }catch(e){ clearTimeout(to); if(e.name==='AbortError') throw Object.assign(new Error('تایم‌اوت Gemini'),{status:408}); throw Object.assign(new Error('شبکه Gemini: '+e.message),{status:0}); }
  clearTimeout(to);
  if(!res.ok){ const er=await parseErr(res); let hint=''; if(res.status===404) hint=' — مدل را به gemini-flash-latest عوض کن'; const err=new Error(`${fmt(res.status)} — ${er.msg}${hint}`); err.status=res.status; Logger.log('error','Gemini fail',{status:res.status, model, body:er.text}); throw err; }
  const j=await res.json(); Logger.log('debug','Gemini raw',j); Quota.record(model); return j.candidates?.[0]?.content?.parts?.map(p=>p.text).join('')?.trim()||'';
}

export const Transcription = {
  async transcribe(blob){
    const { primary, model } = Storage.getSettings();
    const secondary = primary==='groq'?'gemini':'groq';
    const call = (eng)=> eng==='groq'?queryGroq(blob):queryGemini(blob);
    try{
      const text=await call(primary);
      return { text, engine: primary==='groq'?'Groq':model };
    }catch(err){
      Logger.log('warn',`${primary} خطا`,{msg:err.message, status:err.status});
      if(err.status===401||err.status===403){
        const s=Storage.getSettings();
        const hasSecondary = secondary==='groq' ? s.groqKey : s.geminiKey;
        if(hasSecondary){
          Logger.log('warn',`auth ${primary} 401/403 → fallback ${secondary}`,{hasSecondary:!!hasSecondary});
          const text=await call(secondary);
          return { text, engine: secondary==='groq'?'Groq':model };
        }
        throw err;
      }
      if(err.status===404 && primary==='gemini'){
        Logger.log('warn','فالبک هوشمند: 404 مدل → groq');
        const text=await queryGroq(blob);
        return { text, engine: 'Groq' };
      }
      if(err.status===429){
        Logger.log('warn',`سهمیه ${primary} پر → ${secondary}`);
        await new Promise(r=>setTimeout(r,600));
        const text=await call(secondary);
        return { text, engine: secondary==='groq'?'Groq':model };
      }
      // generic fallback once
      const text=await call(secondary);
      return { text, engine: secondary==='groq'?'Groq':model };
    }
  },
  async testGroq(){
    const { groqKey: k }=Storage.getSettings();
    if(!k) throw new Error('خالیه'); if(!k.startsWith('gsk_')) throw new Error('باید gsk_ باشد');
    const r=await fetch('https://api.groq.com/openai/v1/models',{headers:{Authorization:`Bearer ${k}`}});
    if(!r.ok){ const e=await parseErr(r); throw new Error(`${fmt(r.status)} — ${e.msg}`); }
    return true;
  },
  async testGemini(){
    const { geminiKey: k, model }=Storage.getSettings();
    if(!k) throw new Error('خالیه'); if(!(k.startsWith('AQ.')||k.startsWith('AIza'))) throw new Error('باید AQ. یا AIza باشد');
    const r=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}`,{headers:{'x-goog-api-key':k}});
    if(!r.ok){ const e=await parseErr(r); throw new Error(`${fmt(r.status)} — ${e.msg}`); }
    return r.json();
  }
};
