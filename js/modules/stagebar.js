// Stagebar: manual polish/translate stages on current text + per-run log groups.
// Extracted verbatim from js/app.js (ticket 29-stagebar-extract) — logic, order,
// strings, aria and timers unchanged. Only wrappers added: module imports/exports
// plus dependency injection (see mountStagebar). Seam: Logger/UI vitrine region.
import { Storage } from './storage.js';
import { Logger } from './logger.js';
import { Transcription } from './transcription.js';
import { Quota } from './quota.js';
import { Dashboard } from './dashboard.js';

const $ = s => document.getElementById(s);

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

// --- stagebar (ticket/16): manual polish/translate stages on current text + per-run log groups ---
// Behavior adapted from temp/hamnegar-demo runStage/runTranslate (same owner labels, scope,
// raw stack, language combo); pipelines use the production polish chain + Transcription.translate.
const STAGE_LANGS = [
  ['🇮🇷 فارسی', 'fa'], ['🇬🇧 English', 'en'], ['🇩🇪 Deutsch', 'de'], ['🇫🇷 Français', 'fr'],
  ['🇪🇸 Español', 'es'], ['🇮🇹 Italiano', 'it'], ['🇹🇷 Türkçe', 'tr'], ['🇸🇦 العربية', 'ar'],
  ['🇷🇺 Русский', 'ru'], ['🇨🇳 中文', 'zh'],
];
const SYS_SIMPLE = 'You are a proofreader. Fix only spelling, orthography and punctuation in the SAME language as the input text; never change the language, meaning or tone. If no correction is needed, return the input text verbatim. Return ONLY the corrected text — never commentary, explanation or apology. (If the text is Persian and means UI, «رابطه کاربری» should become «رابط کاربری».)';
const SYS_ADV = 'You are a proofreader. Fix spelling, punctuation and grammar together in the SAME language as the input text; preserve meaning, numbers and names, never change the language or tone. If no correction is needed, return the input text verbatim. Return ONLY the corrected text — never commentary, explanation or apology. (If the text is Persian and means UI, «رابطه کاربری» should become «رابط کاربری».)';
const SYS_GRAMMAR = 'Fix only grammar and word inflection in the SAME language as the input text. Do not change spelling, style or punctuation, do not rewrite, never change the language. If no correction is needed, return the input text verbatim. Return ONLY the corrected text — never commentary, explanation or apology.';
let stageRawStack = [];
const STAGE_RAW_MAX = 25;
// Slice-scoped undo: push the pre-stage scope slice (not the whole doc) so خام
// splices just that slice back — earlier stages' results and foreign edits outside
// the range survive. newEnd is filled in after apply (post-stage range).
function stagePushRaw(scope){
  const entry = { start: scope.start, end: scope.end, text: scope.text, newEnd: scope.end };
  stageRawStack.push(entry);
  while (stageRawStack.length > STAGE_RAW_MAX) stageRawStack.shift();
  const rawBtn = $('stage-raw');
  if (rawBtn) rawBtn.disabled = false;
  return entry;
}
let langHi = 0, langView = STAGE_LANGS.slice();
function stageScope(){
  const selStart = _getSelStart(), selEnd = _getSelEnd(); // injected: live-read app.js-owned cursor
  const v = els.output.value;
  const a = Math.min(selStart, v.length), b = Math.min(selEnd, v.length);
  if (b > a) return { text: v.slice(a, b), start: a, end: b, kind: 'selection', sel: v.slice(a, b) };
  return { text: v, start: 0, end: v.length, kind: 'full' };
}
function updateStageScope(){
  const badge = $('stage-scope');
  if (!badge) return;
  const g = stageScope();
  const base = g.kind === 'selection'
    ? 'دامنه: انتخاب («' + g.sel.slice(0, 24) + (g.sel.length > 24 ? '…' : '') + '»)'
    : 'دامنه: کل متن';
  const eng = engineInfo();
  badge.textContent = `${base} • ${eng.text}`;
  badge.style.opacity = eng.hasKey ? '1' : '0.6';
}
// stagebar button visibility (session-only: storage seam is locked, so no persistence here)
const STAGE_BTNS = [['stage-simple', 'پالایش ساده'], ['stage-advanced', 'پالایش پیشرفته'], ['stage-grammar', 'پالایش دستوری'], ['stage-tr-quick', 'EN⇄FA'], ['stage-tr-panel', 'ترجمه…']];
function stageBarApplyVisibility(){
  const menu = $('stage-edit-menu');
  if (menu && !menu.dataset.built) {
    menu.dataset.built = '1';
    for (const [id, label] of STAGE_BTNS) {
      const lab = document.createElement('label');
      lab.className = 'switch';
      lab.title = 'برداشتن تیک فقط دکمه را پنهان می‌کند؛ ابزار غیرفعال نمی‌شود';
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = true;
      cb.setAttribute('aria-label', 'نمایش دکمه ' + label);
      cb.addEventListener('change', () => { const btn = $(id); if (btn) btn.hidden = !cb.checked; });
      lab.append(cb, document.createTextNode(' نمایش: ' + label));
      menu.appendChild(lab);
    }
  }
}
function stageModelPick(){
  const sel = $('stage-model');
  const polishChainState = _getPolishChain(); // injected: live-read (app.js reassigns on load)
  try { const o = sel?.value && JSON.parse(sel.value); if (o?.id) return o; } catch {}
  const first = polishChainState.find(e => e.enabled !== false);
  if (!first) return null;
  return { id: entryIdOf(first), providerId: providerIdOf(first, 'groq') };
}
function renderStageModelOptions(){
  const polishChainState = _getPolishChain(); // injected: live-read (app.js reassigns on load)
  const sel = $('stage-model');
  if (!sel) return;
  const prev = sel.value;
  sel.innerHTML = '';
  const head = document.createElement('option');
  head.value = '';
  head.textContent = 'خودکار: زنجیرهٔ پالایش به‌ترتیب';
  head.title = 'اگر مدلی انتخاب کنی همان اول امتحان می‌شود؛ وگرنه زنجیرهٔ پالایش به‌ترتیب جلو می‌رود. مدل انتخابیِ بی‌کلید بی‌صدا نادیده گرفته می‌شود و زنجیره ادامه می‌دهد.';
  sel.appendChild(head);
  const seen = new Set();
  for (const e of polishChainState) {
    const id = entryIdOf(e), pid = providerIdOf(e, 'groq');
    const key = `${pid}:${id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const o = document.createElement('option');
    o.value = JSON.stringify({ id, providerId: pid });
    o.textContent = `${id} (${pid})${e.enabled === false ? ' — خاموش' : ''}`;
    sel.appendChild(o);
  }
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
function setStageBusy(b){ for(const id of ['stage-simple','stage-advanced','stage-grammar','stage-tr-quick','stage-tr-panel','stage-raw']){ const el = $(id); if(el) el.disabled = b; } if(!b){ const raw = $('stage-raw'); if(raw) raw.disabled = !stageRawStack.length; } }
async function runStage(kind, faLabel, sysPrompt, logTitle){
  const scope = stageScope();
  if (!scope.text.trim()) { Logger.toast('متنی برای پالایش نیست'); return; }
  const invoker = document.activeElement;
  const _dpGuard = _getDiffPending(); // injected: live-read app.js-owned diff gate
  if (_dpGuard && diffEls().back && !diffEls().back.hidden){ Logger.toast('نتیجه بازبینی‌نشده — اول اعمال یا دور بریز'); return; }
  const vlen = els.output.value.length;
  Logger.groupRun(logTitle);
  Logger.setStatus('✨ ' + faLabel + '…', 'warn');
  setStageBusy(true);
  openDiffRunning(faLabel, scope, invoker);
  const _dpSeq = _getDiffPending(); // injected: re-read after open (app.js owns the token)
  const mySeq = _dpSeq ? _dpSeq.seq : -1;
  try {
    // Explicit stage-model choice (dropdown) goes first, rest of the enabled chain
    // stays as fallback; default (head option) follows chain order. Layer 'polish'
    // keeps the polish guards in validatePolishOutput.
    const pick = stageModelPick();
    const explicit = $('stage-model')?.value ? pick : null;
    const preferOk = explicit && Storage.hasKeyForProvider(providerIdOf(explicit, 'groq'));
    if(explicit && !preferOk) Logger.log('warn','مدل ترجیحی بی‌کلید — از زنجیره استفاده شد',{id:explicit.id});
    const out = await Transcription.textChain(scope.text, { system: sysPrompt, layer: 'polish', ...(explicit ? { prefer: explicit } : {}) });
    if(els.output.value.length !== vlen){ closeDiffSheet(); Logger.clearRun(); Logger.log('warn','متن حین اجرا عوض شد — نتیجه دور ریخته شد'); Logger.toast('متن حین اجرا عوض شد — دوباره بزن'); return; }
    // apply-diff-confirm (#49): gate the result behind the bottom sheet instead of
    // direct-apply — Apply replays stagePushRaw+stageApply verbatim; quota fires there.
    fillDiffSheet({ kind: 'polish', scope, text: out.text, model: out.model, faLabel, logTitle,
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
  const invoker = document.activeElement;
  const _dpGuard = _getDiffPending(); // injected: live-read app.js-owned diff gate
  if (_dpGuard && diffEls().back && !diffEls().back.hidden){ Logger.toast('نتیجه بازبینی‌نشده — اول اعمال یا دور بریز'); return; }
  const vlen = els.output.value.length;
  Logger.groupRun('🌐 ترجمه → ' + code);
  Logger.setStatus('🌐 ترجمه → ' + code + '…', 'warn');
  setStageBusy(true);
  openDiffRunning('ترجمه → ' + code, scope, invoker);
  const _dpSeq = _getDiffPending(); // injected: re-read after open (app.js owns the token)
  const mySeq = _dpSeq ? _dpSeq.seq : -1;
  try {
    const pick = stageModelPick();
    const explicit = $('stage-model')?.value ? pick : null;
    const preferOk = explicit && Storage.hasKeyForProvider(providerIdOf(explicit, 'groq'));
    if(explicit && !preferOk) Logger.log('warn','مدل ترجیحی بی‌کلید — از زنجیره استفاده شد',{id:explicit.id});
    const res = await Transcription.translate(scope.text, code, preferOk ? explicit : undefined);
    if(els.output.value.length !== vlen){ closeDiffSheet(); Logger.clearRun(); Logger.log('warn','متن حین اجرا عوض شد — نتیجه دور ریخته شد'); Logger.toast('متن حین اجرا عوض شد — دوباره بزن'); return; }
    const out = res.text;
    // apply-diff-confirm (#49): gate the result behind the bottom sheet instead of
    // direct-apply — Apply replays stagePushRaw+stageApply verbatim; quota fires there.
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
// searchable language combo (~10 langs, filter + ↑↓ + Enter, outside-click/Esc close)
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
      if (code !== '__none__') { const p = $('tr-panel'); if (p) p.hidden = true; runTranslate(code); }
    });
    box.appendChild(b);
  });
}
function paintLangHi(){
  const box = $('stage-lang-opts');
  if (!box) return;
  [...box.children].forEach((x, i) => x.classList.toggle('hl', i === langHi));
}

// Thin wiring entry: registers listeners in the original order, then runs the
// original end-of-file init (visibility → model options → scope). Returns the
// handles app.js still needs (updateBadge, diffApply, renderAllChains wrap).
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
  ['select', 'keyup', 'mouseup'].forEach(ev => els.output.addEventListener(ev, updateStageScope));
  els.output.addEventListener('focus', updateStageScope);
  $('stage-simple')?.addEventListener('click', () => runStage('simple', 'پالایش ساده', SYS_SIMPLE, '✨ پالایش ساده'));
  $('stage-advanced')?.addEventListener('click', () => runStage('advanced', 'پالایش پیشرفته', SYS_ADV, '✨ پالایش پیشرفته'));
  $('stage-grammar')?.addEventListener('click', () => runStage('grammar', 'پالایش دستوری', SYS_GRAMMAR, '📝 پالایش دستوری'));
  $('stage-tr-quick')?.addEventListener('click', () => {
    const t = els.output.value.trim();
    // Rationale: ASCII-only Latin text is most likely English → 'fa'. Latin with
    // diacritics (äöüßéèêàçñ…) is likely another European language → 'en', and
    // non-Latin scripts (Persian/Arabic/CJK…) → 'en'. Heuristic only — the
    // «ترجمه…» panel is the escape hatch for misses.
    let code = 'en';
    if (/[A-Za-z]/.test(t) && !/[^\x00-\x7F]/.test(t)) code = 'fa';
    runTranslate(code);
  });
  $('stage-tr-panel')?.addEventListener('click', (e) => {
    const p = $('tr-panel');
    if (!p) return;
    p.hidden = !p.hidden;
    e.currentTarget.setAttribute('aria-pressed', String(!p.hidden));
    if (!p.hidden) { $('stage-lang-search')?.focus(); renderLangs(); }
  });
  $('stage-raw')?.addEventListener('click', () => {
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
    const rawBtn = $('stage-raw');
    if (rawBtn) rawBtn.disabled = !stageRawStack.length;
    updateStageScope(); syncActionbar();
    Logger.log('info', '↩ برگشت به خام (دامنه)', { chars: prev.text.length });
    Logger.toast('به خام برگشت');
  });
  $('stage-lang-search')?.addEventListener('input', (e) => {
    const q = e.target.value.trim().toLowerCase();
    langView = STAGE_LANGS.filter(([l, c]) => l.toLowerCase().includes(q) || c.includes(q));
    langHi = 0;
    renderLangs();
  });
  $('stage-lang-search')?.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); langHi = Math.min(langView.length - 1, langHi + 1); paintLangHi(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); langHi = Math.max(0, langHi - 1); paintLangHi(); }
    else if (e.key === 'Enter' && langView[langHi]) { const p = $('tr-panel'); if (p) p.hidden = true; runTranslate(langView[langHi][1]); }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); const p = $('tr-panel'); if (p) p.hidden = true; } // consume: topmost layer owns Esc — must never reach recording-cancel (ticket/2x)
  });
  document.addEventListener('click', (e) => {
    const panel = $('tr-panel');
    if (panel && !panel.hidden && !e.target.closest('#tr-panel') && !e.target.closest('#stage-tr-panel')) panel.hidden = true;
    const det = $('stage-settings');
    if (det && det.open && !e.target.closest('#stage-settings')) det.removeAttribute('open');
  });
  stageBarApplyVisibility();
  renderStageModelOptions();
  updateStageScope();
  return { updateStageScope, stagePushRaw, stageApply, stageQuotaSplit, renderStageModelOptions, runStage, runTranslate };
}
