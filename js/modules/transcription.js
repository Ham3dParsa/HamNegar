// Module: transcription
// Interface: transcribe(blob) -> {text, engine}, polish(text)->{text, model}, textChain(text,{system,layer})->{text,model,providerId} (full polish-chain fallback for stages/translate), translate(text,lang,entry?)->{text,model,providerId} (layer='translate'), queryChat(providerId,text,{system,model,layer}) with layer naming the op in logs, testGroq(), testGemini(), listModels(providerId)
// Depth: chains: STT chain + Polish chain (OpenAI-compatible groq/openrouter/custom + Google) with fallback, quota, header handling
// Seam: at Transcription interface. Adapters internal, not exposed.
import { Storage, GROQ_BASE_DEFAULT, OPENROUTER_BASE_DEFAULT } from './storage.js';
import { canonicalize, hasKey as hasProviderKey, displayPair } from './provider.js';
import { Quota } from './quota.js';
import { Logger } from './logger.js';

function fmt(code){ const m={400:'درخواست نامعتبر (400)',401:'کلید نامعتبر (401)',403:'دسترسی ممنوع (403)',404:'مدل پیدا نشد (404)',413:'ورودی طولانی (413)',429:'سهمیه پر شد (429)',500:'خطای سرور (500)'}; return m[code]||`HTTP ${code}` }
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

function escapeRegExp(s){ return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

// Personal dictionary core (ticket 19) — pure: no storage, no fetch, no DOM, no logging.
// Rules: trim from/to, drop empties, drop from===to, skip enabled===false
// (missing enabled means on). Longest-from-first. Literal global case-sensitive
// replace. Returns { text, count }.
export function applyPersonalDictionary(text, entries){
  const base = typeof text === 'string' ? text : String(text ?? '');
  if(!Array.isArray(entries) || entries.length === 0) return { text: base, count: 0 };
  const rules = [];
  for(const e of entries){
    if(!e || typeof e !== 'object') continue;
    if(e.enabled === false) continue;
    const from = typeof e.from === 'string' ? e.from.trim() : String(e.from ?? '').trim();
    const to = typeof e.to === 'string' ? e.to.trim() : String(e.to ?? '').trim();
    if(!from || !to) continue;
    if(from === to) continue;
    rules.push({ from, to });
  }
  rules.sort((a, b) => b.from.length - a.from.length);
  let out = base;
  let count = 0;
  for(const { from, to } of rules){
    const re = new RegExp(escapeRegExp(from), 'g');
    out = out.replace(re, () => { count++; return to; });
  }
  return { text: out, count };
}

async function queryGroq(blob, externalSignal){
  const { groqKey: k, groqBaseURL } = Storage.getSettings();
  if(!k) throw Object.assign(new Error(`کلید ${displayPair('groq', STT_GROQ_MODEL)} نیست`),{status:401});
  if(!k.startsWith('gsk_')) throw Object.assign(new Error(`کلید ${displayPair('groq', STT_GROQ_MODEL)} باید gsk_ باشد`),{status:401});
  if(blob.size<800) throw Object.assign(new Error('صدا خیلی کوتاهه'),{status:400});
  const fd=new FormData(); fd.append('file',blob,'speech.webm'); fd.append('model','whisper-large-v3'); fd.append('response_format','json');
  Logger.log('info',`به ${displayPair('groq', STT_GROQ_MODEL)}...`,{size:blob.size});
  const ctrl=new AbortController(), to=setTimeout(()=>ctrl.abort(),35000);
  if (externalSignal) externalSignal.addEventListener('abort', () => ctrl.abort(), { once: true });
  const base = (groqBaseURL || 'https://api.groq.com/openai/v1').replace(/\/+$/,'');
  assertTrustedBase(base, ['api.groq.com']);
  let res; try{ res=await fetch(`${base}/audio/transcriptions`,{method:'POST',headers:{Authorization:`Bearer ${k}`},body:fd,signal:ctrl.signal}); }catch(e){ clearTimeout(to); if(e.name==='AbortError') throw Object.assign(new Error(externalSignal?.aborted ? 'لغو شد' : `تایم‌اوت ${displayPair('groq', STT_GROQ_MODEL)}`),{status:408, aborted: !!externalSignal?.aborted}); throw Object.assign(new Error(`شبکه ${displayPair('groq', STT_GROQ_MODEL)}: `+e.message),{status:0}); }
  clearTimeout(to);
  if(!res.ok){ const er=await parseErr(res); Logger.log('error',`${displayPair('groq', STT_GROQ_MODEL)} fail`,{status:res.status, body:er.text}); const err=new Error(`${fmt(res.status)} — ${er.msg}`); err.status=res.status; throw err; }
  const j=await res.json(); Logger.log('info',`${displayPair('groq', STT_GROQ_MODEL)} ok`,j); return (j.text||'').trim();
}
async function queryGemini(blob, model, externalSignal){
  const { geminiKey: k } = Storage.getSettings();
  if(!k) throw Object.assign(new Error(`کلید ${displayPair('google', model)} نیست`),{status:401});
  if(!(k.startsWith('AQ.')||k.startsWith('AIza'))) throw Object.assign(new Error(`فرمت کلید ${displayPair('google', model)} اشتباه`),{status:401});
  if(blob.size<800) throw Object.assign(new Error('صدا خیلی کوتاهه'),{status:400});
  const b64=await blobToB64(blob);
  Logger.log('info',`به ${displayPair('google', model)}...`,{size:blob.size});
  const url=`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  const ctrl=new AbortController(), to=setTimeout(()=>ctrl.abort(),40000);
  if (externalSignal) externalSignal.addEventListener('abort', () => ctrl.abort(), { once: true });
  let res; try{ res=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json','x-goog-api-key':k},body:JSON.stringify({contents:[{parts:[{text:"Transcribe verbatim in original language(s). Only transcription, no summary."},{inlineData:{mimeType:blob.type||"audio/webm",data:b64}}]}],generationConfig:{temperature:0.1}}),signal:ctrl.signal}); }catch(e){ clearTimeout(to); if(e.name==='AbortError') throw Object.assign(new Error(externalSignal?.aborted ? 'لغو شد' : `تایم‌اوت ${displayPair('google', model)}`),{status:408, aborted: !!externalSignal?.aborted}); throw Object.assign(new Error(`شبکه ${displayPair('google', model)}: `+e.message),{status:0}); }
  clearTimeout(to);
  if(!res.ok){ const er=await parseErr(res); let hint=''; if(res.status===404) hint=' — مدل بعدی امتحان می‌شود'; const err=new Error(`${fmt(res.status)} — ${er.msg}${hint}`); err.status=res.status; Logger.log('error',`${displayPair('google', model)} fail`,{status:res.status, model, body:er.text}); throw err; }
  const j=await res.json(); Logger.log('debug',`${displayPair('google', model)} raw`,j); return j.candidates?.[0]?.content?.parts?.map(p=>p.text).join('')?.trim()||'';
}

// Polish adapters — canonical providers groq|google|openrouter (+ custom) + Google fallback
// Qwen reasoning models leak <think> into content unless reasoning_format:hidden — strip defensively + length guard
// Ticket 21 (chunk guard): the unclosed-think strip below is narrowed — an
// unclosed trailing block is removed only when usable text precedes it, so a
// length-cut reply that lives entirely inside <think> is never reduced to ''.
function cleanPolishOutput(raw){
  if(!raw) return '';
  let out = String(raw);
  out = out.replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/<thinking>[\s\S]*?<\/thinking>/gi, '');
  // unclosed trailing think block (stream cut): strip only with a usable prefix
  for(const re of [/<think>[\s\S]*$/gi, /<thinking>[\s\S]*$/gi]){
    const stripped = out.replace(re, '');
    if(stripped.trim()) out = stripped;
  }
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

// Ticket 21 (chunk guard): output budget scales with input length instead of a
// fixed 2000 cap. Short inputs (<=1000 chars) still request exactly 2000, so
// short-input behavior is byte-for-byte; longer inputs scale up to the model
// ceiling instead of truncating mid-<think>.
const POLISH_MIN_OUTPUT_TOKENS = 2000;
const POLISH_MAX_OUTPUT_TOKENS = 8192;
function polishOutputBudget(text){
  const len = typeof text === 'string' ? text.length : String(text ?? '').length;
  const scaled = Math.ceil(len * 1.5) + 500;
  return Math.min(POLISH_MAX_OUTPUT_TOKENS, Math.max(POLISH_MIN_OUTPUT_TOKENS, scaled));
}
// Distinct length-cut error (status 413, never 500-empty): callers already map
// typed errors to toast/status, and textChain keeps iterating the chain.
function longInputError(layer = 'polish'){
  const msg = layer === 'polish' ? 'متن طولانی است — ورودی را کوتاه‌تر کن' : `متن طولانی برای ${layer} — ورودی را کوتاه‌تر کن`;
  return Object.assign(new Error(msg), { status: 413 });
}

// Provider identity (canonical ids, legacy migration, display pairs) is owned by
// js/modules/provider.js (ticket 37) — consumed here via canonicalize/displayPair.
// STT via Groq always runs fixed whisper-large-v3, so its display pair is constant.
const STT_GROQ_MODEL = 'whisper-large-v3';
// STT entry → display pair only. Chain/key logic stays in sttProviderOf/hasKeyFor.
function sttPairLabel(entry){
  const pid = sttProviderOf(entry);
  if(pid === 'groq') return displayPair('groq', STT_GROQ_MODEL);
  const id = (typeof entry === 'object' ? entry.id : entry);
  return displayPair(pid, id);
}
// Storage still keys the Google credential as geminiKey, so 'google' resolves there.
// Single owner is js/modules/provider.js (ticket 37): google branch ≡ same slot,
// purged ids → false, everything else identical — verified case-by-case.
function hasKeyForProviderId(providerId){
  return hasProviderKey({ providerId });
}

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
  if(!k) throw Object.assign(new Error(layer==='polish' ? `کلید ${displayPair(providerId, model)} برای پالیش نیست` : `کلید ${displayPair(providerId, model)} برای ${layer} نیست`),{status:401});
  if(providerId === 'groq' && !k.startsWith('gsk_')) throw Object.assign(new Error(`کلید ${displayPair(providerId, model)} باید gsk_ باشد`),{status:401});
  if(!base) throw Object.assign(new Error('BaseURL ارائه‌دهنده خالی است'),{status:400});
  assertTrustedBase(base, trusted);
  const ctrl=new AbortController(), to=setTimeout(()=>ctrl.abort(),25000);
  const body = { model, messages:[{role:'system', content:system || DEFAULT_POLISH_SYSTEM},{role:'user', content:text}], temperature:0.2, max_tokens:polishOutputBudget(text) };
  // Qwen thinking models: instruct mode, hide reasoning (gpt-oss does NOT support reasoning_format — skip there)
  if(/^qwen\//i.test(model)) { body.reasoning_format = 'hidden'; body.reasoning_effort = 'none'; }
  let res; try{
    res=await fetch(`${base}/chat/completions`,{method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${k}`, ...extraHeaders},body:JSON.stringify(body),signal:ctrl.signal});
  }catch(e){ clearTimeout(to); if(e.name==='AbortError') throw Object.assign(new Error(`تایم‌اوت ${displayPair(providerId, model)} ${layer}`),{status:408}); throw Object.assign(new Error(`شبکه ${displayPair(providerId, model)} ${layer}: `+e.message),{status:0}); }
  clearTimeout(to);
  if(!res.ok){ const er=await parseErr(res); const err=new Error(`${fmt(res.status)} — ${er.msg}`); err.status=res.status; Logger.log('error',`${displayPair(providerId, model)} ${layer} fail`,{status:res.status, model, base}); throw err; }
  const j=await res.json(); Logger.log('debug',`${displayPair(providerId, model)} ${layer} raw`,{model, inLen:text.length, out:j.choices?.[0]?.message?.content?.trim()?.slice(0,200) || ''});
  if(j.choices?.[0]?.finish_reason === 'length'){ Logger.log('warn',`${displayPair(providerId, model)} ${layer} length cut`,{model, inLen:text.length}); throw longInputError(layer); }
  return validatePolishOutput(j.choices?.[0]?.message?.content?.trim()||'', text, model, layer);
}
async function queryPolishViaGemini(text, model, layer = 'polish', system = null){
  const { geminiKey: k } = Storage.getSettings();
  if(!k) throw Object.assign(new Error(layer==='polish' ? `کلید ${displayPair('google', model)} برای پالیش نیست` : `کلید ${displayPair('google', model)} برای ${layer} نیست`),{status:401});
  if(!(k.startsWith('AQ.')||k.startsWith('AIza'))) throw Object.assign(new Error(`فرمت کلید ${displayPair('google', model)} اشتباه`),{status:401});
  const url=`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  const prompt = (system || `You are a spelling/grammar proofreader. Fix only spelling, orthography and grammar errors in the SAME language as the input text; do not change the language, meaning or tone, do not explain, return ONLY the corrected text. If no correction is needed, return the input verbatim; never comment or apologize. (If the text is Persian and means UI, «رابطه کاربری» should become «رابط کاربری».)`) + `\nText:\n${text}`;
  const ctrl=new AbortController(), to=setTimeout(()=>ctrl.abort(),20000);
  let res; try{
    res=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json','x-goog-api-key':k},body:JSON.stringify({contents:[{parts:[{text:prompt}]}],generationConfig:{temperature:0.2,maxOutputTokens:polishOutputBudget(text)}}),signal:ctrl.signal});
  }catch(e){ clearTimeout(to); if(e.name==='AbortError') throw Object.assign(new Error(`تایم‌اوت ${displayPair('google', model)} ${layer}`),{status:408}); throw Object.assign(new Error(`شبکه ${displayPair('google', model)} ${layer}: `+e.message),{status:0}); }
  clearTimeout(to);
  if(!res.ok){ const er=await parseErr(res); const err=new Error(`${fmt(res.status)} — ${er.msg}`); err.status=res.status; Logger.log('error',`${displayPair('google', model)} ${layer} fail`,{status:res.status, model}); throw err; }
  const j=await res.json(); const out=j.candidates?.[0]?.content?.parts?.map(p=>p.text).join('')?.trim()||'';
  Logger.log('debug',`${displayPair('google', model)} ${layer} raw`,{model, inLen:text.length, out:out.slice(0,200)});
  if(j.candidates?.[0]?.finishReason === 'MAX_TOKENS'){ Logger.log('warn',`${displayPair('google', model)} ${layer} length cut`,{model, inLen:text.length}); throw longInputError(layer); }
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
  let providerId = canonicalize(rawPid);
  if(!providerId) providerId = (entry.id && entry.id.includes(':free')) ? 'openrouter' : (!model.includes('/') ? 'google' : 'groq');
  return { model, providerId };
}
async function queryPolish(text, entry, layer = 'polish'){
  const { model, providerId } = polishTargetOf(entry);
  if(canonicalize(providerId) === 'google') return queryPolishViaGemini(text, model, layer);
  return queryChat(canonicalize(providerId), text, { model, layer });
}

// Full-chain text op (ticket/16 chain fallback): iterates ENABLED polishChain entries
// that have keys, dispatching per provider through the existing adapters (no new
// seam). Default single qwen entry when the chain is empty, mirroring polishText.
// layer names the op in logs ('polish' keeps polish guards in validatePolishOutput,
// 'translate' skips them). 401/403 entries are skipped with a warn log; 429 backs
// off before the next entry. All throws are typed (err.status set).
async function textChain(text, { system, layer = 'polish', prefer } = {}){
  if(!text || !text.trim()) throw Object.assign(new Error(layer==='translate' ? 'متنی برای ترجمه نیست' : 'متنی برای پالایش نیست'),{status:400});
  const { polishChain } = Storage.getSettings();
  const rawChain = (polishChain && polishChain.length) ? polishChain : [{id:'qwen/qwen3.6-27b',providerId:'groq',enabled:true}];
  const chain = rawChain.filter(e => e && e.enabled !== false).filter(e => hasKeyForPolish(e));
  if(prefer && prefer.id && hasKeyForPolish(prefer) && !chain.some(e => polishTargetOf(e).model === polishTargetOf(prefer).model && polishTargetOf(e).providerId === polishTargetOf(prefer).providerId)){
    // explicit dropdown picks carry no enabled flag — resolve it from the chain itself
    const rawMatch = rawChain.find(e => e && polishTargetOf(e).model === polishTargetOf(prefer).model && polishTargetOf(e).providerId === polishTargetOf(prefer).providerId);
    if(!rawMatch || rawMatch.enabled !== false) chain.unshift({ id: prefer.id, providerId: canonicalize(prefer.providerId), enabled: true });
    else Logger.log('warn','مدل ترجیحی در زنجیره خاموش است — از زنجیره استفاده شد',{id:prefer.id});
  }
  if(chain.length===0) throw Object.assign(new Error('مدل متنی در زنجیره نیست'),{status:401});
  let lastErr=null;
  for(let i=0;i<chain.length;i++){
    const entry = chain[i];
    const { model, providerId } = polishTargetOf(entry);
    try{
      let out;
      if(canonicalize(providerId) === 'google') out = await queryPolishViaGemini(text, model, layer, system);
      else out = await queryChat(canonicalize(providerId), text, { system, model, layer });
      if(out){
        if(i>0) Logger.log('info',`${layer} fallback ok #${i+1}/${chain.length} → ${displayPair(providerId, model)}`);
        else Logger.log('debug',`${layer} ok → ${displayPair(providerId, model)}`,{model, providerId});
        if(layer === 'polish'){
          const dict = typeof Storage.getDict === 'function' ? Storage.getDict() : [];
          const applied = applyPersonalDictionary(out, dict);
          return { text: applied.text, model, providerId };
        }
        return { text: out, model, providerId };
      }
      Logger.log('warn',`${displayPair(providerId, model)} ${layer} empty`,{model});
    }catch(e){
      lastErr=e;
      if(e.status===401 || e.status===403){ Logger.log('warn',`${displayPair(providerId, model)} ${layer} skipped (key)`,{model, status:e.status}); continue; }
      Logger.log('warn',`${displayPair(providerId, model)} ${layer} fail (${i+1}/${chain.length})`,{model, msg:e.message, status:e.status});
      if(e.status===429 && i<chain.length-1) await new Promise(r=>setTimeout(r,600));
    }
  }
  throw lastErr || Object.assign(new Error(layer==='translate' ? 'ترجمه ناموفق بود' : 'پالایش ناموفق بود'),{status:500});
}
// Translate (ticket/16): same text-model chain as polish (default = first enabled polish
// entry), but a language-neutral translate prompt on layer='translate' so the polish
// meta-commentary/length guards in validatePolishOutput don't false-fire (layer!=='polish'
// returns after the empty-output check). STT/polish paths untouched.
const TRANSLATE_NAMES = { fa:'Persian (فارسی)', en:'English', de:'German', fr:'French', es:'Spanish', it:'Italian', tr:'Turkish', ar:'Arabic', ru:'Russian', zh:'Chinese' };
function translateSystem(lang){
  const dest = TRANSLATE_NAMES[lang] || String(lang || '').slice(0, 24) || 'English';
  return `You are an accurate translator. Translate the input text into ${dest}. Preserve numbers, names and formatting. Return ONLY the translation — never commentary, explanation or apology.`;
}
async function translateText(text, lang, entry){
  if(!text || !text.trim()) throw Object.assign(new Error('متنی برای ترجمه نیست'),{status:400});
  const system = translateSystem(lang);
  if(entry){
    const { model, providerId } = polishTargetOf(entry);
    if(!hasKeyForProviderId(providerId)) throw Object.assign(new Error(`⚠ کلید ${displayPair(providerId, model)} نیست`),{status:401});
    let t;
    if(canonicalize(providerId) === 'google') t = await queryPolishViaGemini(text, model, 'translate', system);
    else t = await queryChat(canonicalize(providerId), text, { system, model, layer: 'translate' });
    return { text: t, model, providerId };
  }
  return textChain(text, { system, layer: 'translate' });
}
function sttProviderOf(entry){
  if(entry && typeof entry === 'object'){
    if(typeof entry.providerId === 'string' && entry.providerId.trim()) return canonicalize(entry.providerId.trim());
    if(typeof entry.provider === 'string' && entry.provider.trim()) return canonicalize(entry.provider.trim());
  }
  const id = typeof entry === 'object' ? entry.id : entry;
  if(id==='groq') return 'groq';
  return 'google';
}
function hasKeyFor(entry){
  return hasKeyForProviderId(sttProviderOf(entry));
}
function hasKeyForPolish(entry){
  return hasKeyForProviderId(polishTargetOf(entry).providerId);
}
export const Transcription = {
  async transcribe(blob, opts={}){
    if(blob.size<800) throw Object.assign(new Error('صدا خیلی کوتاهه'),{status:400});
    const { sttChain, polishChain, polishEnabled } = Storage.getSettings();
    const rawChain = (sttChain && sttChain.length) ? sttChain : [{id:'groq',providerId:'groq',enabled:true},{id:'gemini-flash-lite-latest',providerId:'google',enabled:true}];
    // support both string[] legacy and object[] new
    const enabledChain = rawChain.filter(e=> typeof e==='object' ? e.enabled!==false : true);
    let chain = enabledChain.filter(id => hasKeyFor(id));
    if(chain.length===0){
      throw Object.assign(new Error('کلید STT نیست — تنظیمات را چک کن'),{status:401});
    }
    if(chain.length !== rawChain.length){
      const skipped = rawChain.filter(id => !hasKeyFor(id));
      if(skipped.length) Logger.log('info','STT بی‌کلید حذف شد', { skipped: skipped.map(e => sttPairLabel(e)) });
    }
    try { Logger.rebuildProgress(chain); } catch (e) { Logger.log('warn','rebuildProgress failed', { msg:e.message }); }
    let lastErr=null, usedEngine='—', usedEngineKey='—', rawText='';
    for(let i=0;i<chain.length;i++){
      const entry = chain[i];
      const id = typeof entry === 'object' ? entry.id : entry;
      const isGroq = sttProviderOf(entry)==='groq';
      const label = sttPairLabel(entry);
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
        usedEngineKey = isGroq ? 'groq' : id;
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
      try{ Quota.record(usedEngineKey, { durationMs, words, chars }); }catch{}
    }
    let finalText = rawText;
    let polishModelUsed = null;
    if(polishEnabled && polishChain && polishChain.length){
      const ruleFixed = rulePolish(rawText);
      // filter by enabled + key
      const enabledChain = polishChain.filter(e=>e.enabled!==false);
      let usablePolish = enabledChain.filter(e => hasKeyForPolish(e));
      if(usablePolish.length !== enabledChain.length){
        const skippedP = enabledChain.filter(e => !hasKeyForPolish(e)).map(e=>displayPair(polishTargetOf(e).providerId, polishTargetOf(e).model));
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
          const ppid = polishTargetOf(entry).providerId;
          try{
            const out = await queryPolish(rawText, entry);
            if(out){
              polished = out;
              polishModelUsed = displayPair(ppid, pm);
              if(i>0) Logger.log('info',`پالیش فالبک موفق #${i+1} → ${displayPair(ppid, pm)}`);
              break;
            }
          }catch(e){
            Logger.log('warn',`پالیش ${displayPair(ppid, pm)} خطا`,{msg:e.message, status:e.status});
            if(e.status===429) await new Promise(r=>setTimeout(r,500));
            if(i===usablePolish.length-1) break;
          }
        }
        if(polished){
          const dict = typeof Storage.getDict === 'function' ? Storage.getDict() : [];
          finalText = applyPersonalDictionary(rulePolish(polished), dict).text;
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
      try{ const out=await queryPolish(text,entry); if(out){ const dict = typeof Storage.getDict === 'function' ? Storage.getDict() : []; return applyPersonalDictionary(rulePolish(out), dict).text; } }catch{}
    }
    return ruleFixed;
  },
  async listModels(providerId){
    const pid = canonicalize(providerId);
    if(pid === 'google'){
      const { geminiKey: k }=Storage.getSettings();
      if(!k) throw Object.assign(new Error('کلید google نیست'),{status:401});
      if(!(k.startsWith('AQ.')||k.startsWith('AIza'))) throw Object.assign(new Error('فرمت کلید Google اشتباه'),{status:401});
      const ctrl=new AbortController(), to=setTimeout(()=>ctrl.abort(),25000);
      let r; try{
        r=await fetch('https://generativelanguage.googleapis.com/v1beta/models',{headers:{'x-goog-api-key':k},signal:ctrl.signal});
      }catch(e){ clearTimeout(to); throw Object.assign(new Error(e.name==='AbortError'?'تایم‌اوت لیست مدل‌ها':'شبکه لیست مدل‌ها: '+e.message),{status:e.name==='AbortError'?408:0}); }
      clearTimeout(to);
      if(!r.ok){ const e=await parseErr(r); throw Object.assign(new Error(`${fmt(r.status)} — ${e.msg}`),{status:r.status}); }
      const j=await r.json();
      return (j.models||[]).map(m=>String(m.name||'').replace(/^models\//,'')).filter(Boolean);
    }
    let resolved;
    try{ resolved = resolveChatProvider(pid); }
    catch(e){ throw Object.assign(new Error(`ارائه‌دهنده ناشناس: ${String(providerId ?? '')}`),{status:400}); }
    const { key: k, base, trusted } = resolved;
    if(!k) throw Object.assign(new Error(`کلید ${pid} نیست`),{status:401});
    if(!base) throw Object.assign(new Error('BaseURL ارائه‌دهنده خالی است'),{status:400});
    assertTrustedBase(base, trusted);
    const r=await fetch(`${base}/models`,{headers:{Authorization:`Bearer ${k}`}});
    if(!r.ok){ const e=await parseErr(r); const err=new Error(`${fmt(r.status)} — ${e.msg}`); err.status=r.status; throw err; }
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
  async queryChat(providerId, text, opts){ return queryChat(canonicalize(providerId), text, opts); },
  async textChain(text, opts){ return textChain(text, opts); },
  async translate(text, lang, entry){ return translateText(text, lang, entry); },
  async testPolish(){
    return this.polishText('رابطه کاربری زیبا است');
  }
};
