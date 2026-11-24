// Stagebar: customizable polish/structure/translate/raw tools + favorite quick strip + diff review gate.
import { Storage } from './storage.js';
import { hasKeyById } from './provider.js';
import { Logger } from './logger.js';
import { Transcription, smartModelScore, applyTonePreference } from './transcription.js';
import { Quota } from './quota.js';
import { Dashboard } from './dashboard.js';
import { $ } from './dom.js';
import { stripTimecodes } from './format.js';

// --- injected app.js collaborators (assigned once in mountStagebar) ---
let els = null;
let saveCursor = () => {};
let updateCounts = () => {};
let syncActionbar = () => {};
let engineInfo = () => ({ text: '', hasKey: false });
let entryIdOf = (e) => (typeof e === 'object' ? e?.id : e);
let providerIdOf = () => 'groq';
let sanitizeMsg = (m) => String(m ?? '');
let editorHistory = { push(){} };
let _getSelStart = () => 0;
let _getSelEnd = () => 0;
let _getPolishChain = () => [];
let _getDiffPending = () => null;
let diffEls = () => ({});
let openDiffRunning = () => {};
let fillDiffSheet = () => {};
let closeDiffSheet = () => {};
let onActionTriggered = () => {};
let onManageTools = () => {};

const STAGE_LANGS = [
  ['🇮🇷 فارسی', 'fa'], ['🇬🇧 English', 'en'], ['🇩🇪 Deutsch', 'de'], ['🇫🇷 Français', 'fr'],
  ['🇪🇸 Español', 'es'], ['🇮🇹 Italiano', 'it'], ['🇹🇷 Türkçe', 'tr'], ['🇸🇦 العربية', 'ar'],
  ['🇷🇺 Русский', 'ru'], ['🇨🇳 中文', 'zh'],
];

export const SYS_SIMPLE = 'You are a careful proofreader. Fix only spelling, ZWNJ spacing within words, and punctuation in the SAME language as the input text. Preserve all facts, names, numbers, and the speaker\'s register verbatim. Never emit timestamps, timecodes or duration markers (e.g. ۰:۲۴, 12:34). If no correction is needed, return the input text verbatim. Return ONLY the corrected text — never commentary, explanation or apology. (If the text is Persian and means UI, «رابطه کاربری» should become «رابط کاربری».)';
export const SYS_ADV = 'You are an experienced copy editor. Fix spelling, punctuation, sentence clarity, and agreement errors together in the SAME language as the input text; preserve all facts, numbers, and names. Never emit timestamps, timecodes or duration markers (e.g. ۰:۲۴, 12:34). Return ONLY the corrected text — never commentary, explanation or apology. (If the text is Persian and means UI, «رابطه کاربری» should become «رابط کاربری».)';
export const SYS_GRAMMAR = 'Fix only grammatical agreement and obvious inflection slips in the SAME language as the input text. Do not rewrite sentences or change vocabulary or register. Never emit timestamps, timecodes or duration markers (e.g. ۰:۲۴, 12:34). If no correction is needed, return the input text verbatim. Return ONLY the corrected text — never commentary, explanation or apology.';
export const SYS_STRUCTURE = 'You are an information architect organizing speech or written notes cleanly. CRITICAL LANGUAGE RULE: Keep the EXACT original language of every sentence (if the input is English, keep it 100% English; if Persian, keep Persian; if mixed, keep each phrase in its original language — NEVER translate). Structure the content logically according to what the user actually said: group related narrative prose into clear paragraphs separated by a blank line, and ONLY when the text contains explicit lists, tasks, steps, options, or distinct items, format them as clean bullets using "• " (or simple numbered lines when ordered). Keep ALL facts, numbers, names, and the speaker\'s exact wording/register intact; never rewrite colloquial phrasing into formal/bookish style unless instructed. Clean only obvious stutters or punctuation without dropping content. Do not invent facts or noisy Markdown (#, **, code fences). If the text is already clearly structured, return it cleanly as-is — never reply with explanations or commentary. Return ONLY the structured text.';

export const BUILTIN_PROMPTS = {
  'stage-simple': SYS_SIMPLE,
  'stage-advanced': SYS_ADV,
  'stage-grammar': SYS_GRAMMAR,
  'stage-structure': SYS_STRUCTURE,
};

export function resolveToolSystem(tool, tonePrefOverride, inputText = ''){
  const custom = typeof tool?.system === 'string' ? tool.system.trim() : '';
  const base = custom || BUILTIN_PROMPTS[tool?.id] || SYS_SIMPLE;
  return applyTonePreference(base, {
    respectTone: tool?.respectTone !== false,
    ...(tonePrefOverride ? { tonePref: tonePrefOverride } : {}),
    ...(inputText ? { text: inputText } : {}),
  });
}

// --- Icons per tool kind / id ---
const TOOL_ICONS = {
  'stage-simple': '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/></svg>',
  'stage-advanced': '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M18.5 3l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z"/><path d="M3 9h8M3 15h8"/><circle cx="15" cy="9" r="2"/><circle cx="15" cy="15" r="2"/><path d="M17 9h4M17 15h4"/></svg>',
  'stage-grammar': '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6h11M4 10h11M4 14h6"/><path d="M13 17l2.2 2.2L20.5 14"/></svg>',
  'stage-structure': '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5h16M4 10h11"/><path d="M9 15h11M9 19h8"/><circle cx="5" cy="15" r="1.2" fill="currentColor" stroke="none"/><circle cx="5" cy="19" r="1.2" fill="currentColor" stroke="none"/></svg>',
  'stage-tr-quick': '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8h13l-3-3"/><path d="M20 16H7l3 3"/></svg>',
  'stage-tr-panel': '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3a14 14 0 0 1 0 18"/><path d="M12 3a14 14 0 0 0 0 18"/></svg>',
  'stage-raw': '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M8 5L3 10l5 5"/><path d="M3 10h11a6 6 0 0 1 0 12h-2"/></svg>',
  'custom': '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>',
};

let stageRawStack = [];
const STAGE_RAW_MAX = 25;
let stageBusyState = false;

function stagePushRaw(scope){
  const entry = { start: scope.start, end: scope.end, text: scope.text, newEnd: scope.end };
  stageRawStack.push(entry);
  while (stageRawStack.length > STAGE_RAW_MAX) stageRawStack.shift();
  syncRawButtonsDisabled();
  return entry;
}

function syncRawButtonsDisabled(){
  const noRaw = !stageRawStack.length;
  document.querySelectorAll('#stage-raw, [data-tool-id="stage-raw"]').forEach(el => {
    el.disabled = stageBusyState || noRaw;
  });
}

let langHi = 0, langView = STAGE_LANGS.slice();
function stageScope(){
  const selStart = _getSelStart(), selEnd = _getSelEnd();
  const v = els.output.value;
  const a = Math.min(selStart, v.length), b = Math.min(selEnd, v.length);
  if (b > a) return { text: v.slice(a, b), start: a, end: b, kind: 'selection', sel: v.slice(a, b) };
  return { text: v, start: 0, end: v.length, kind: 'full' };
}

function updateStageScope(){
  const g = stageScope();
  const base = g.kind === 'selection'
    ? 'انتخاب («' + g.sel.slice(0, 22) + (g.sel.length > 22 ? '…' : '') + '»)'
    : 'کل متن';
  const eng = engineInfo();
  const badge = $('stage-scope');
  if (badge) {
    badge.textContent = `${base} · ${eng.text}`;
    badge.style.opacity = eng.hasKey ? '1' : '0.68';
  }
  const toolsScope = $('tools-scope-info');
  if (toolsScope) {
    toolsScope.textContent = `اعمال روی: ${base} · ${eng.text}`;
  }
}

function stageModelPick(){
  const sel = $('stage-model');
  const polishChainState = _getPolishChain();
  try { const o = sel?.value && JSON.parse(sel.value); if (o?.id) return o; } catch {}
  const first = polishChainState.find(e => e.enabled !== false);
  if (!first) return null;
  return { id: entryIdOf(first), providerId: providerIdOf(first, 'groq') };
}

function renderStageModelOptions(){
  const polishChainState = _getPolishChain();
  const sel = $('stage-model');
  if (!sel) return;
  const prev = sel.value;
  sel.innerHTML = '';
  const head = document.createElement('option');
  head.value = '';
  head.textContent = 'خودکار: زنجیره پالایش (مدل هوشمند برای ابزارهای تحلیلی)';
  head.title = 'اگر مدلی انتخاب کنی همان اول امتحان می‌شود؛ وگرنه در ابزارهای ساده زنجیره به‌ترتیب و در ابزارهای هوشمند قوی‌ترین مدل فعال زنجیره اجرا می‌شود.';
  sel.appendChild(head);
  const seen = new Set();
  const chainGroup = document.createElement('optgroup');
  chainGroup.label = 'زنجیره فعال پالایش';
  for (const e of polishChainState) {
    const id = entryIdOf(e), pid = providerIdOf(e, 'groq');
    const key = `${pid}:${id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const o = document.createElement('option');
    o.value = JSON.stringify({ id, providerId: pid });
    o.textContent = `${id} (${pid})${e.enabled === false ? ' — خاموش' : ''}`;
    chainGroup.appendChild(o);
  }
  if (chainGroup.children.length) sel.appendChild(chainGroup);

  try {
    const catalog = Storage.getModelCatalog?.() || {};
    const providers = Storage.getProviders?.() || [];
    const activeSet = new Set(providers.filter(p => !p.disabled && p.hasKey).map(p => p.id));
    const liveExtras = [];
    for (const [pid, info] of Object.entries(catalog)) {
      if (!activeSet.has(pid)) continue;
      for (const id of (info?.models || [])) {
        if (/whisper|transcrib|\bstt\b|embedding|tts|guard/i.test(id)) continue;
        const key = `${pid}:${id}`;
        if (seen.has(key)) continue;
        seen.add(key);
        liveExtras.push({ id, pid, score: smartModelScore(id) });
      }
    }
    if (liveExtras.length) {
      liveExtras.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
      const catGroup = document.createElement('optgroup');
      catGroup.label = 'سایر مدل‌های زنده کاتالوگ (دارای کلید)';
      for (const item of liveExtras.slice(0, 80)) {
        const o = document.createElement('option');
        o.value = JSON.stringify({ id: item.id, providerId: item.pid });
        o.textContent = `${item.id} (${item.pid})`;
        catGroup.appendChild(o);
      }
      sel.appendChild(catGroup);
    }
  } catch {}
  if (prev) sel.value = prev;
}

function stageApply(scope, next){
  const v = els.output.value;
  els.output.value = v.slice(0, scope.start) + next + v.slice(scope.end);
  els.output.focus();
  els.output.setSelectionRange(scope.start + next.length, scope.start + next.length);
  saveCursor(); updateCounts(); Storage.saveDraft(els.output.value);
  editorHistory.push(els.output.value);
  updateStageScope(); syncActionbar();
}

function stageQuotaSplit(model, words, chars){
  try {
    Quota.record(model, { durationMs: 0, words, chars, kind: 'postprocess' });
    Quota.render(els.quotaGrid, { period: Dashboard.getPeriod() });
    Dashboard.renderOverall();
  } catch {}
}

function setStageBusy(b){
  stageBusyState = !!b;
  document.querySelectorAll('#tools-grid .tool-card, #fav-tools-bar .fav-tool-btn').forEach(el => {
    el.disabled = !!b;
  });
  if (!b) syncRawButtonsDisabled();
}

async function runStage(kind, faLabel, sysPrompt, logTitle, opts = {}){
  const scope = stageScope();
  if (!scope.text.trim()) { Logger.toast('متنی برای پردازش نیست'); return; }
  onActionTriggered();
  const invoker = document.activeElement;
  const _dpGuard = _getDiffPending();
  if (_dpGuard && diffEls().back && !diffEls().back.hidden){ Logger.toast('نتیجه بازبینی‌نشده — اول اعمال یا دور بریز'); return; }
  const vlen = els.output.value.length;
  Logger.groupRun(logTitle);
  Logger.setStatus('✨ ' + faLabel + '…', 'warn');
  setStageBusy(true);
  openDiffRunning(faLabel, scope, invoker);
  const _dpSeq = _getDiffPending();
  const mySeq = _dpSeq ? _dpSeq.seq : -1;
  try {
    const pick = stageModelPick();
    const explicit = $('stage-model')?.value ? pick : null;
    const preferOk = explicit && hasKeyById(providerIdOf(explicit, 'groq'));
    if(explicit && !preferOk) Logger.log('warn','مدل ترجیحی بی‌کلید — از زنجیره استفاده شد',{id:explicit.id});
    const out = await Transcription.textChain(scope.text, { system: sysPrompt, layer: opts.layer || 'polish', smart: !!opts.smart, ...(preferOk ? { prefer: explicit } : {}) });
    const { text: cleanText, strippedCount } = stripTimecodes(out.text);
    if(cleanText !== out.text) Logger.log('warn','[ابزار] مهر زمان حذف شد',{strippedCount, before:out.text.slice(0,160), after:cleanText.slice(0,160)});
    if(els.output.value.length !== vlen){ closeDiffSheet(); Logger.clearRun(); Logger.log('warn','متن حین اجرا عوض شد — نتیجه دور ریخته شد'); Logger.toast('متن حین اجرا عوض شد — دوباره بزن'); return; }
    fillDiffSheet({ kind: 'polish', scope, text: cleanText, model: out.model, faLabel, logTitle,
      okStatus: '✅ ' + faLabel + ' نشست',
      okToast: faLabel + (scope.kind === 'selection' ? ' روی انتخاب ✓' : ' روی کل ✓'),
      okLog: `${logTitle} نشست — دامنه: ${scope.kind === 'selection' ? 'انتخاب' : 'کل'} — مدل: ${out.model} (${out.providerId})`,
      invoker }, mySeq);
    return;
  } catch (e) {
    closeDiffSheet();
    const safe = sanitizeMsg(e.message || e);
    Logger.setStatus('❌ ' + faLabel + ': ' + safe, 'error');
    Logger.toast('❌ ' + faLabel + ': ' + safe.slice(0, 60));
    Logger.clearRun();
  } finally { setStageBusy(false); }
}

async function runTranslate(code){
  const scope = stageScope();
  if (!scope.text.trim()) { Logger.toast('متنی برای ترجمه نیست'); return; }
  onActionTriggered();
  const invoker = document.activeElement;
  const _dpGuard = _getDiffPending();
  if (_dpGuard && diffEls().back && !diffEls().back.hidden){ Logger.toast('نتیجه بازبینی‌نشده — اول اعمال یا دور بریز'); return; }
  const vlen = els.output.value.length;
  Logger.groupRun('🌐 ترجمه → ' + code);
  Logger.setStatus('🌐 ترجمه → ' + code + '…', 'warn');
  setStageBusy(true);
  openDiffRunning('ترجمه → ' + code, scope, invoker);
  const _dpSeq = _getDiffPending();
  const mySeq = _dpSeq ? _dpSeq.seq : -1;
  try {
    const pick = stageModelPick();
    const explicit = $('stage-model')?.value ? pick : null;
    const preferOk = explicit && hasKeyById(providerIdOf(explicit, 'groq'));
    if(explicit && !preferOk) Logger.log('warn','مدل ترجیحی بی‌کلید — از زنجیره استفاده شد',{id:explicit.id});
    const res = await Transcription.translate(scope.text, code, preferOk ? explicit : undefined);
    if(els.output.value.length !== vlen){ closeDiffSheet(); Logger.clearRun(); Logger.log('warn','متن حین اجرا عوض شد — نتیجه دور ریخته شد'); Logger.toast('متن حین اجرا عوض شد — دوباره بزن'); return; }
    const out = res.text;
    fillDiffSheet({ kind: 'translate', scope, text: out, model: res.model, faLabel: 'ترجمه → ' + code, logTitle: '🌐 ترجمه → ' + code,
      okStatus: '✅ ترجمه نشست',
      okToast: 'ترجمه → ' + code + ' ✓',
      okLog: `🌐 ترجمه → ${code} نشست — دامنه: ${scope.kind === 'selection' ? 'انتخاب' : 'کل'} — مدل: ${res.model} (${res.providerId})`,
      invoker }, mySeq);
    return;
  } catch (e) {
    closeDiffSheet();
    const safe = sanitizeMsg(e.message || e);
    Logger.setStatus('❌ ترجمه: ' + safe, 'error');
    Logger.toast('❌ ترجمه: ' + safe.slice(0, 60));
    Logger.clearRun();
  } finally { setStageBusy(false); }
}

function executeRawUndo(){
  const prev = stageRawStack.pop();
  if (prev == null) return;
  const v = els.output.value;
  const start = Math.max(0, Math.min(prev.start, v.length));
  const newEnd = Math.max(start, Math.min(prev.newEnd ?? prev.end, v.length));
  const restored = v.slice(0, start) + prev.text + v.slice(newEnd);
  els.output.value = restored;
  els.output.focus();
  try { els.output.setSelectionRange(start + prev.text.length, start + prev.text.length); } catch {}
  saveCursor(); updateCounts(); Storage.saveDraft(restored);
  editorHistory.push(restored);
  syncRawButtonsDisabled();
  updateStageScope(); syncActionbar();
  onActionTriggered();
  Logger.log('info', '↩ برگشت به خام (دامنه)', { chars: prev.text.length });
  Logger.toast('به خام برگشت');
}

function triggerToolAction(tool, btn){
  if (!tool) return;
  if (tool.kind === 'tr-quick') {
    const t = stageScope().text.trim();
    let code = 'en';
    if (/[A-Za-z]/.test(t) && !/[^\x00-\x7F]/.test(t)) code = 'fa';
    runTranslate(code);
    return;
  }
  if (tool.kind === 'tr-panel') {
    const p = $('tr-panel');
    if (!p) return;
    p.hidden = !p.hidden;
    btn?.setAttribute('aria-pressed', String(!p.hidden));
    if (!p.hidden) { $('stage-lang-search')?.focus(); renderLangs(); }
    return;
  }
  if (tool.kind === 'raw') {
    executeRawUndo();
    return;
  }
  const scope = stageScope();
  const sys = resolveToolSystem(tool, undefined, scope.text);
  const layer = tool.smart || tool.id === 'stage-structure' ? 'structure' : 'polish';
  runStage(tool.id, tool.label, sys, '✨ ' + tool.label, { layer, smart: !!tool.smart });
}

function renderToolsUI(){
  const grid = $('tools-grid') || document.querySelector('#tools-pop .tools-grid');
  const favBar = $('fav-tools-bar');
  const tools = Storage.getToolsConfig();
  const visibleTools = tools.filter(t => !t.hidden);

  if (grid) {
    grid.innerHTML = '';
    const nonRawCount = visibleTools.filter(t => t.kind !== 'raw').length;
    visibleTools.forEach((tool, idx) => {
      const b = document.createElement('button');
      b.type = 'button';
      if (tool.builtin) b.id = tool.id;
      b.dataset.toolId = tool.id;
      const isLastSolo = idx === visibleTools.length - 1 && visibleTools.length % 2 === 1;
      const shouldSpan2 = tool.kind === 'raw' ? (nonRawCount % 2 === 0 || isLastSolo) : false;
      b.className = 'tool-card'
        + (tool.smart ? ' tool-card--smart' : '')
        + (shouldSpan2 ? ' tool-card--span2' : '');
      if (tool.kind === 'tr-panel') {
        const trOpen = !$('tr-panel')?.hidden;
        b.setAttribute('aria-pressed', String(!!trOpen));
      }
      if (tool.kind === 'raw') {
        b.disabled = stageBusyState || !stageRawStack.length;
      } else {
        b.disabled = stageBusyState;
      }

      const ic = document.createElement('span');
      ic.className = 'tool-card__ic';
      ic.setAttribute('aria-hidden', 'true');
      ic.innerHTML = TOOL_ICONS[tool.id] || TOOL_ICONS.custom;

      const copy = document.createElement('span');
      copy.className = 'tool-card__copy';
      const titleRow = document.createElement('span');
      titleRow.className = 'tool-card__title-row';
      const st = document.createElement('strong');
      st.textContent = tool.label;
      titleRow.appendChild(st);
      if (tool.pinned) {
        const star = document.createElement('span');
        star.className = 'tool-card__pin';
        star.textContent = '★';
        star.title = 'محبوب و پین‌شده در نوار پایین کادر';
        star.setAttribute('aria-hidden', 'true');
        titleRow.appendChild(star);
      }
      const sm = document.createElement('small');
      sm.textContent = tool.sub || (tool.builtin ? '' : 'ابزار سفارشی');
      copy.append(titleRow, sm);

      b.append(ic, copy);
      b.addEventListener('click', (e) => {
        if (tool.kind === 'tr-panel') e.stopPropagation();
        triggerToolAction(tool, b);
      });
      grid.appendChild(b);
    });
  }

  if (favBar) {
    const pinnedTools = visibleTools.filter(t => t.pinned && t.kind !== 'tr-panel');
    favBar.innerHTML = '';
    if (!pinnedTools.length) {
      favBar.hidden = true;
    } else {
      favBar.hidden = false;
      const listWrap = document.createElement('div');
      listWrap.className = 'fav-tools-bar__list';
      for (const tool of pinnedTools) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'fav-tool-btn' + (tool.smart ? ' is-smart' : '');
        btn.dataset.toolId = tool.id;
        btn.title = tool.sub ? `${tool.label} — ${tool.sub}` : tool.label;
        if (tool.kind === 'raw') btn.disabled = stageBusyState || !stageRawStack.length;
        else btn.disabled = stageBusyState;
        const ic = document.createElement('span');
        ic.className = 'fav-tool-btn__ic';
        ic.setAttribute('aria-hidden', 'true');
        ic.innerHTML = TOOL_ICONS[tool.id] || TOOL_ICONS.custom;
        const lbl = document.createElement('span');
        lbl.textContent = tool.label;
        btn.append(ic, lbl);
        btn.addEventListener('click', () => triggerToolAction(tool, btn));
        listWrap.appendChild(btn);
      }
      const gearBtn = document.createElement('button');
      gearBtn.type = 'button';
      gearBtn.id = 'btn-fav-manage';
      gearBtn.className = 'fav-manage-btn';
      gearBtn.title = 'شخصی‌سازی ابزارها و محبوب‌ها';
      gearBtn.setAttribute('aria-label', 'شخصی‌سازی ابزارها');
      gearBtn.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 1 1 3 3L7 19l-4 1 1-4Z"/></svg>';
      gearBtn.addEventListener('click', () => onManageTools());
      favBar.append(listWrap, gearBtn);
    }
  }
}

// searchable language combo
function renderLangs(){
  const box = $('stage-lang-opts');
  if (!box) return;
  box.innerHTML = '';
  (langView.length ? langView : [['— موردی نیست', '__none__']]).forEach(([label, code], i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = label;
    b.setAttribute('role', 'option');
    if (i === langHi) b.classList.add('hl');
    b.addEventListener('mouseenter', () => { langHi = i; paintLangHi(); });
    b.addEventListener('click', () => {
      if (code !== '__none__') {
        const p = $('tr-panel');
        if (p) p.hidden = true;
        $('stage-tr-panel')?.setAttribute('aria-pressed', 'false');
        runTranslate(code);
      }
    });
    box.appendChild(b);
  });
}
function paintLangHi(){
  const box = $('stage-lang-opts');
  if (!box) return;
  [...box.children].forEach((x, i) => x.classList.toggle('hl', i === langHi));
}

export function mountStagebar(deps){
  els = { output: $('output'), quotaGrid: $('quota-grid') };
  saveCursor = deps.saveCursor;
  updateCounts = deps.updateCounts;
  syncActionbar = deps.syncActionbar;
  engineInfo = deps.engineInfo;
  entryIdOf = deps.entryIdOf;
  providerIdOf = deps.providerIdOf;
  sanitizeMsg = deps.sanitizeMsg;
  editorHistory = deps.editorHistory;
  _getSelStart = deps.getSelStart;
  _getSelEnd = deps.getSelEnd;
  _getPolishChain = deps.getPolishChain;
  _getDiffPending = deps.getDiffPending;
  diffEls = deps.diffEls;
  openDiffRunning = deps.openDiffRunning;
  fillDiffSheet = deps.fillDiffSheet;
  closeDiffSheet = deps.closeDiffSheet;
  onActionTriggered = deps.onActionTriggered || (() => {});
  onManageTools = deps.onManageTools || (() => {});

  ['select', 'keyup', 'mouseup'].forEach(ev => els.output.addEventListener(ev, updateStageScope));
  els.output.addEventListener('focus', updateStageScope);

  $('stage-lang-search')?.addEventListener('input', (e) => {
    const q = e.target.value.trim().toLowerCase();
    langView = STAGE_LANGS.filter(([l, c]) => l.toLowerCase().includes(q) || c.includes(q));
    langHi = 0;
    renderLangs();
  });
  $('stage-lang-search')?.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); langHi = Math.min(langView.length - 1, langHi + 1); paintLangHi(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); langHi = Math.max(0, langHi - 1); paintLangHi(); }
    else if (e.key === 'Enter' && langView[langHi]) { const p = $('tr-panel'); if (p) p.hidden = true; $('stage-tr-panel')?.setAttribute('aria-pressed', 'false'); runTranslate(langView[langHi][1]); }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); const p = $('tr-panel'); if (p) p.hidden = true; $('stage-tr-panel')?.setAttribute('aria-pressed', 'false'); }
  });
  document.addEventListener('click', (e) => {
    const panel = $('tr-panel');
    if (panel && !panel.hidden && !e.target.closest('#tr-panel') && !e.target.closest('#stage-tr-panel')) {
      panel.hidden = true;
      $('stage-tr-panel')?.setAttribute('aria-pressed', 'false');
    }
    const det = $('stage-settings');
    if (det && det.open && !e.target.closest('#stage-settings')) det.removeAttribute('open');
  });

  renderToolsUI();
  renderStageModelOptions();
  updateStageScope();
  return { updateStageScope, stagePushRaw, stageApply, stageQuotaSplit, renderStageModelOptions, renderToolsUI, runStage, runTranslate };
}
