// Tools Studio Tab: custom & built-in tool manager (order, favorite pin, show/hide, prompt edit)
// + live system prompt sandbox with preset Persian samples or user-supplied text.
import { Storage, BUILTIN_TOOLS } from './storage.js';
import { Transcription, smartModelScore, applyTonePreference } from './transcription.js';
import { BUILTIN_PROMPTS } from './stagebar.js';
import { providerIdOf, entryIdOf } from './chains.js';
import { Logger } from './logger.js';
import { fa, stripTimecodes } from './format.js';
import { $ } from './dom.js';

const SANDBOX_SAMPLES = {
  casual: 'سلام بچه ها ببینید من فردا می خوام برم دانشگاه ولی هنوز نمیدونم کلاس ساعت چنده لطفا اگه کسی خبر داره بهم بگه راستی جزوه جلسه قبل رو هم بفرستید ممنون',
  tasks: 'ببین امروز سه تا کار مهم داریم یکی اینکه باگ لاگین رو فیکس کنیم دوم نمودار سهمیه رو مرتب کنیم و سوم نسخه جدید رو روی سرور تست کنیم و لاگ هاشو چک کنیم',
  tech: 'امروز روی api گیت وی کار کردیم و دیدیم ریسپانس تایم رو موبایل بالاست باید کش ردیس و تایم اوت فچ رو بهینه کنیم تا کاربر خطا نبینه',
  en: 'Alright team, quick recap from today\'s standup. First we need to ship the auth patch before noon, second check why the mobile wave preview drops frames on iOS, and third test the structuring tool on plain English notes.',
};

const SVG_UP = '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 15l-6-6-6 6"/></svg>';
const SVG_DN = '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>';
const SVG_EDIT = '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 1 1 3 3L7 19l-4 1 1-4Z"/></svg>';
const SVG_DEL = '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M18 6L6 18M6 6l12 12"/></svg>';

let editingId = null; // null = creating new tool when editor open, or string tool id
let editorVisible = false;
let sandboxTargetId = 'stage-structure'; // '__editor__' or a prompt tool id
let bound = false;
let onChanged = () => {};

function effectivePromptFor(tool) {
  if (!tool) return '';
  const custom = (tool.system || '').trim();
  if (custom) return custom;
  return BUILTIN_PROMPTS[tool.id] || '';
}

function getPromptTools() {
  return Storage.getToolsConfig().filter(t => t.kind === 'prompt');
}

function resolveSandboxSpec() {
  const promptTools = getPromptTools();
  const useEditor = editorVisible && sandboxTargetId === '__editor__';
  if (useEditor) {
    const draftName = ($('tool-ed-label')?.value || '').trim();
    const editingTool = editingId ? promptTools.find(t => t.id === editingId) : null;
    const label = draftName || editingTool?.label || 'ابزار سفارشی جدید';
    const baseSystem = ($('tool-ed-system')?.value || '').trim() || BUILTIN_PROMPTS['stage-structure'];
    const respectTone = !!$('tool-ed-tone')?.checked;
    const smart = !!$('tool-ed-smart')?.checked;
    return {
      id: '__editor__',
      editToolId: editingId,
      isDraft: true,
      label,
      sourceNote: editingId ? 'پیش‌نویسِ ذخیره‌نشده ویرایشگر' : 'پیش‌نویسِ ابزار جدید',
      baseSystem,
      respectTone,
      smart,
    };
  }
  const picked = promptTools.find(t => t.id === sandboxTargetId)
    || promptTools.find(t => t.id === 'stage-structure')
    || promptTools[0];
  if (picked) {
    sandboxTargetId = picked.id;
    return {
      id: picked.id,
      editToolId: picked.id,
      isDraft: false,
      label: picked.label,
      sourceNote: picked.builtin
        ? ((picked.system || '').trim() ? 'ابزار داخلی با پرامپت ویرایش‌شده' : 'پرامپت پیش‌فرض داخلی')
        : 'ابزار سفارشی ذخیره‌شده',
      baseSystem: effectivePromptFor(picked),
      respectTone: picked.respectTone !== false,
      smart: !!picked.smart,
    };
  }
  return {
    id: 'stage-structure',
    editToolId: 'stage-structure',
    isDraft: false,
    label: 'ساختاردهی متن',
    sourceNote: 'پرامپت پیش‌فرض داخلی',
    baseSystem: BUILTIN_PROMPTS['stage-structure'],
    respectTone: true,
    smart: true,
  };
}

function renderSandboxTargetUI() {
  const sel = $('tool-test-target');
  const banner = $('tool-test-banner');
  const peekTxt = $('tool-test-prompt-text');
  const runBtn = $('btn-tool-test');
  const editBtn = $('btn-sandbox-edit-target');
  const promptTools = getPromptTools();

  if (sel) {
    if (!editorVisible && sandboxTargetId === '__editor__') {
      sandboxTargetId = editingId || promptTools[0]?.id || 'stage-structure';
    }
    sel.innerHTML = '';
    if (editorVisible) {
      const draftLabel = ($('tool-ed-label')?.value || '').trim() || (editingId ? 'ابزار در حال ویرایش' : 'ابزار جدید');
      const opt = document.createElement('option');
      opt.value = '__editor__';
      opt.textContent = `پیش‌نویس ویرایشگر: «${draftLabel}»`;
      sel.appendChild(opt);
    }
    for (const t of promptTools) {
      const opt = document.createElement('option');
      opt.value = t.id;
      opt.textContent = `${t.label}${t.builtin ? '' : ' (سفارشی)'}`;
      sel.appendChild(opt);
    }
    const validVals = [...sel.options].map(o => o.value);
    if (!validVals.includes(sandboxTargetId)) {
      sandboxTargetId = editorVisible ? '__editor__' : (promptTools.find(t => t.id === 'stage-structure')?.id || validVals[0] || '');
    }
    sel.value = sandboxTargetId;
  }

  const spec = resolveSandboxSpec();
  const sampleText = ($('tool-test-input')?.value || '').trim();
  const finalPrompt = applyTonePreference(spec.baseSystem, { respectTone: spec.respectTone, text: sampleText || 'نمونه' });

  if (banner) {
    const toneTxt = spec.respectTone ? 'با لحاظ تنظیم لحن' : 'مستقل از لحن';
    const smartTxt = spec.smart ? 'مسیریابی هوشمند (قوی‌ترین مدل)' : 'مدل عادی زنجیره';
    banner.textContent = `هدف فعال: «${spec.label}» · ${spec.sourceNote} · ${toneTxt} · ${smartTxt}`;
    banner.classList.toggle('is-draft', spec.isDraft);
  }
  if (peekTxt) peekTxt.textContent = finalPrompt;
  if (runBtn && !runBtn.disabled) {
    runBtn.textContent = `اجرای تست «${spec.label}»`;
  }
  if (editBtn) {
    editBtn.hidden = spec.isDraft || !spec.editToolId;
  }
}

function renderToolsManagerList() {
  const box = $('tools-manager-list');
  if (!box) return;
  const scrollHost = box.closest('.settings-panel');
  const prevScroll = scrollHost ? scrollHost.scrollTop : 0;
  const tools = Storage.getToolsConfig();
  const frag = document.createDocumentFragment();

  tools.forEach((tool, idx) => {
    const row = document.createElement('div');
    row.className = 'tool-mgr-row'
      + (tool.hidden ? ' is-hidden' : '')
      + (editingId === tool.id && editorVisible ? ' is-editing' : '');
    row.setAttribute('role', 'listitem');

    // Pin (Favorite) toggle button
    const pinBtn = document.createElement('button');
    pinBtn.type = 'button';
    pinBtn.className = 'tool-mgr-pin' + (tool.pinned ? ' active' : '');
    pinBtn.textContent = tool.pinned ? '★' : '☆';
    pinBtn.setAttribute('aria-pressed', String(!!tool.pinned));
    pinBtn.title = tool.pinned ? 'حذف از نوار دسترسی سریع پایین کادر' : 'پین کردن در نوار دسترسی سریع پایین کادر';
    pinBtn.setAttribute('aria-label', (tool.pinned ? 'حذف محبوبیت ' : 'محبوب کردن ') + tool.label);
    pinBtn.addEventListener('click', () => {
      const list = Storage.getToolsConfig();
      const target = list.find(x => x.id === tool.id);
      if (!target) return;
      target.pinned = !target.pinned;
      Storage.saveToolsConfig(list);
      renderToolsManagerList();
      onChanged();
      Logger.toast(target.pinned ? `«${target.label}» به نوار دسترسی سریع پین شد` : `«${target.label}» از نوار سریع برداشته شد`);
    });

    // Main title & subtitle
    const info = document.createElement('div');
    info.className = 'tool-mgr-info';
    const titleLine = document.createElement('div');
    titleLine.className = 'tool-mgr-title';
    const b = document.createElement('b');
    b.textContent = tool.label;
    titleLine.appendChild(b);
    if (tool.smart) {
      const tag = document.createElement('span');
      tag.className = 'tool-mgr-meta';
      tag.textContent = 'مدل هوشمند';
      titleLine.appendChild(tag);
    }
    if (!tool.builtin) {
      const tag = document.createElement('span');
      tag.className = 'tool-mgr-meta is-custom';
      tag.textContent = 'سفارشی';
      titleLine.appendChild(tag);
    } else if (tool.kind === 'prompt' && (tool.system || '').trim()) {
      const tag = document.createElement('span');
      tag.className = 'tool-mgr-meta';
      tag.textContent = 'پرامپت ویرایش‌شده';
      titleLine.appendChild(tag);
    }
    const sub = document.createElement('small');
    sub.textContent = tool.sub || (tool.builtin ? '' : 'پرامپت اختصاصی کاربر');
    info.append(titleLine, sub);

    // Controls: visibility, up, down, edit, delete
    const actions = document.createElement('div');
    actions.className = 'tool-mgr-actions';

    const visLabel = document.createElement('label');
    visLabel.className = 'prov-switch tool-mgr-vis';
    visLabel.title = tool.hidden ? 'نمایش در منوی ابزارها' : 'مخفی کردن از منوی ابزارها';
    const visCb = document.createElement('input');
    visCb.type = 'checkbox';
    visCb.className = 'sr-only';
    visCb.checked = !tool.hidden;
    visCb.setAttribute('aria-label', 'نمایش ابزار ' + tool.label);
    visCb.addEventListener('change', () => {
      const list = Storage.getToolsConfig();
      const target = list.find(x => x.id === tool.id);
      if (!target) return;
      target.hidden = !visCb.checked;
      Storage.saveToolsConfig(list);
      renderToolsManagerList();
      onChanged();
    });
    const visTrack = document.createElement('span');
    visTrack.className = 'prov-track';
    visTrack.setAttribute('aria-hidden', 'true');
    visLabel.append(visCb, visTrack);

    const up = document.createElement('button');
    up.type = 'button';
    up.className = 'btn-ghost btn-xs';
    up.innerHTML = SVG_UP;
    up.disabled = idx === 0;
    up.title = 'انتقال به بالا';
    up.setAttribute('aria-label', 'انتقال به بالا ' + tool.label);
    up.addEventListener('click', () => {
      const list = Storage.getToolsConfig();
      if (idx <= 0 || idx >= list.length) return;
      [list[idx - 1], list[idx]] = [list[idx], list[idx - 1]];
      Storage.saveToolsConfig(list);
      renderToolsManagerList();
      renderSandboxTargetUI();
      onChanged();
    });

    const dn = document.createElement('button');
    dn.type = 'button';
    dn.className = 'btn-ghost btn-xs';
    dn.innerHTML = SVG_DN;
    dn.disabled = idx === tools.length - 1;
    dn.title = 'انتقال به پایین';
    dn.setAttribute('aria-label', 'انتقال به پایین ' + tool.label);
    dn.addEventListener('click', () => {
      const list = Storage.getToolsConfig();
      if (idx < 0 || idx >= list.length - 1) return;
      [list[idx], list[idx + 1]] = [list[idx + 1], list[idx]];
      Storage.saveToolsConfig(list);
      renderToolsManagerList();
      renderSandboxTargetUI();
      onChanged();
    });

    actions.append(visLabel, up, dn);

    if (tool.kind === 'prompt') {
      const editBtn = document.createElement('button');
      editBtn.type = 'button';
      editBtn.className = 'btn-ghost btn-xs';
      editBtn.innerHTML = SVG_EDIT;
      editBtn.title = 'ویرایش و تست پرامپت سیستمی';
      editBtn.setAttribute('aria-label', 'ویرایش ' + tool.label);
      editBtn.addEventListener('click', () => openToolEditor(tool.id));
      actions.appendChild(editBtn);
    }

    if (!tool.builtin) {
      const delBtn = document.createElement('button');
      delBtn.type = 'button';
      delBtn.className = 'btn-ghost btn-xs tool-mgr-del';
      delBtn.innerHTML = SVG_DEL;
      delBtn.title = 'حذف ابزار سفارشی';
      delBtn.setAttribute('aria-label', 'حذف ' + tool.label);
      delBtn.addEventListener('click', () => {
        const snapshot = Storage.getToolsConfig();
        const next = snapshot.filter(x => x.id !== tool.id);
        Storage.saveToolsConfig(next);
        if (editingId === tool.id) closeToolEditor();
        if (sandboxTargetId === tool.id) sandboxTargetId = 'stage-structure';
        renderToolsManagerList();
        renderSandboxTargetUI();
        onChanged();
        Logger.toast(`«${tool.label}» حذف شد`, 7000, {
          actionLabel: 'واگرد',
          onAction: () => {
            Storage.saveToolsConfig(snapshot);
            renderToolsManagerList();
            renderSandboxTargetUI();
            onChanged();
            Logger.toast(`«${tool.label}» برگردانده شد`);
          },
        });
      });
      actions.appendChild(delBtn);
    }

    row.append(pinBtn, info, actions);
    frag.appendChild(row);
  });
  box.replaceChildren(frag);
  if (scrollHost) scrollHost.scrollTop = prevScroll;
}

function openToolEditor(toolId = null) {
  const card = $('tool-editor-card');
  const titleEl = $('tool-editor-heading');
  const labelEl = $('tool-ed-label');
  const subEl = $('tool-ed-sub');
  const sysEl = $('tool-ed-system');
  const smartEl = $('tool-ed-smart');
  const toneEl = $('tool-ed-tone');
  const resetOneBtn = $('btn-tool-reset-one');
  if (!card) return;

  editorVisible = true;
  editingId = toolId;
  sandboxTargetId = '__editor__';
  card.hidden = false;

  if (toolId) {
    const tool = Storage.getToolsConfig().find(t => t.id === toolId);
    if (tool) {
      if (titleEl) titleEl.textContent = `ویرایش «${tool.label}»`;
      if (labelEl) labelEl.value = tool.label;
      if (subEl) subEl.value = tool.sub || '';
      if (sysEl) sysEl.value = effectivePromptFor(tool);
      if (smartEl) smartEl.checked = !!tool.smart;
      if (toneEl) toneEl.checked = tool.respectTone !== false;
      if (resetOneBtn) resetOneBtn.hidden = !tool.builtin;
    }
  } else {
    if (titleEl) titleEl.textContent = 'ساخت ابزار سفارشی جدید';
    if (labelEl) labelEl.value = '';
    if (subEl) subEl.value = '';
    if (sysEl) sysEl.value = 'You are a helpful multilingual assistant. Convert the input into the requested clear format in the EXACT SAME language as the input (never translate), preserving all facts and names. Return ONLY the final text without commentary.';
    if (smartEl) smartEl.checked = true;
    if (toneEl) toneEl.checked = true;
    if (resetOneBtn) resetOneBtn.hidden = true;
  }

  renderToolsManagerList();
  renderSandboxTargetUI();
  labelEl?.focus?.({ preventScroll: true });
}

function closeToolEditor() {
  const card = $('tool-editor-card');
  const sysEl = $('tool-ed-system');
  const wasEditing = editingId;
  editorVisible = false;
  editingId = null;
  if (sandboxTargetId === '__editor__') {
    sandboxTargetId = wasEditing || 'stage-structure';
  }
  if (sysEl) sysEl.value = '';
  if (card) card.hidden = true;
  renderToolsManagerList();
  renderSandboxTargetUI();
}

function saveToolFromEditor() {
  const label = ($('tool-ed-label')?.value || '').trim().slice(0, 48);
  const sub = ($('tool-ed-sub')?.value || '').trim().slice(0, 90);
  const systemRaw = ($('tool-ed-system')?.value || '').trim().slice(0, 4000);
  const smart = !!$('tool-ed-smart')?.checked;
  const respectTone = !!$('tool-ed-tone')?.checked;

  if (!label) { Logger.toast('نام ابزار را وارد کن'); $('tool-ed-label')?.focus?.({ preventScroll: true }); return; }
  if (!systemRaw) { Logger.toast('پرامپت سیستمی نمی‌تواند خالی باشد'); $('tool-ed-system')?.focus?.({ preventScroll: true }); return; }

  const list = Storage.getToolsConfig();
  let savedId = editingId;
  if (editingId) {
    const target = list.find(t => t.id === editingId);
    if (!target) return;
    target.label = label;
    target.sub = sub;
    target.smart = smart;
    target.respectTone = respectTone;
    if (target.builtin) {
      target.system = (systemRaw === (BUILTIN_PROMPTS[target.id] || '').trim()) ? '' : systemRaw;
    } else {
      target.system = systemRaw;
    }
    Storage.saveToolsConfig(list);
    Logger.toast(`تغییرات «${label}» ذخیره شد`);
  } else {
    const customCount = list.filter(t => !t.builtin).length;
    if (customCount >= 30) { Logger.toast('سقف ۳۰ ابزار سفارشی پر شده است'); return; }
    savedId = 'custom-' + Date.now().toString(36);
    list.push({
      id: savedId,
      builtin: false,
      kind: 'prompt',
      label,
      sub: sub || 'ابزار سفارشی',
      system: systemRaw,
      smart,
      respectTone,
      pinned: true,
      hidden: false,
    });
    Storage.saveToolsConfig(list);
    Logger.toast(`ابزار «${label}» ساخته شد و در نوار سریع پین شد`);
  }
  sandboxTargetId = savedId || 'stage-structure';
  closeToolEditor();
  onChanged();
}

function resetEditingBuiltinTool() {
  if (!editingId) return;
  const base = BUILTIN_TOOLS.find(t => t.id === editingId);
  if (!base) return;
  const list = Storage.getToolsConfig();
  const idx = list.findIndex(t => t.id === editingId);
  if (idx < 0) return;
  list[idx] = { ...base, pinned: list[idx].pinned, hidden: list[idx].hidden };
  Storage.saveToolsConfig(list);
  openToolEditor(editingId);
  onChanged();
  Logger.toast(`«${base.label}» به پرامپت پیش‌فرض برگشت`);
}

function renderSandboxModels() {
  const sel = $('tool-test-model');
  if (!sel) return;
  const prev = sel.value;
  const s = Storage.getSettings();
  const chain = Array.isArray(s.polishChain) ? s.polishChain : [];
  sel.innerHTML = '';

  const head = document.createElement('option');
  head.value = '';
  head.textContent = 'خودکار (مطابق اولویت ابزار)';
  sel.appendChild(head);

  const seen = new Set();
  for (const e of chain) {
    const id = entryIdOf(e), pid = providerIdOf(e, 'groq');
    const key = `${pid}:${id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const o = document.createElement('option');
    o.value = JSON.stringify({ id, providerId: pid });
    o.textContent = `${id} (${pid})${e.enabled === false ? ' — خاموش' : ''}`;
    sel.appendChild(o);
  }

  try {
    const catalog = Storage.getModelCatalog?.() || {};
    const providers = Storage.getProviders?.() || [];
    const activeSet = new Set(providers.filter(p => !p.disabled && p.hasKey).map(p => p.id));
    const extras = [];
    for (const [pid, info] of Object.entries(catalog)) {
      if (!activeSet.has(pid)) continue;
      for (const id of (info?.models || [])) {
        if (/whisper|transcrib|\bstt\b|embedding|tts|guard/i.test(id)) continue;
        const key = `${pid}:${id}`;
        if (seen.has(key)) continue;
        seen.add(key);
        extras.push({ id, pid, score: smartModelScore(id) });
      }
    }
    extras.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
    for (const it of extras.slice(0, 50)) {
      const o = document.createElement('option');
      o.value = JSON.stringify({ id: it.id, providerId: it.pid });
      o.textContent = `${it.id} (${it.pid})`;
      sel.appendChild(o);
    }
  } catch {}
  if (prev) sel.value = prev;
}

function syncSandboxToneNote() {
  const note = $('tool-test-tone-note');
  if (!note) return;
  const tone = Storage.getSettings().tonePref;
  note.textContent = tone === 'formal'
    ? 'لحن فعال: رسمی و کتابی (تب رفتار)'
    : 'لحن فعال: حفظ لحن خودمانی گوینده';
}

async function runPromptSandbox() {
  const inputEl = $('tool-test-input');
  const outEl = $('tool-test-output');
  const metaEl = $('tool-test-meta');
  const btn = $('btn-tool-test');
  const sampleText = (inputEl?.value || '').trim();

  if (!sampleText) {
    Logger.toast('یک متن آماده انتخاب کن یا متن دلخواهت را بنویس');
    inputEl?.focus?.({ preventScroll: true });
    return;
  }

  const spec = resolveSandboxSpec();
  const finalSystem = applyTonePreference(spec.baseSystem, { respectTone: spec.respectTone, text: sampleText });

  let prefer = null;
  const selVal = $('tool-test-model')?.value || '';
  if (selVal) {
    try { prefer = JSON.parse(selVal); } catch { prefer = null; }
  }

  if (btn) { btn.disabled = true; btn.textContent = `در حال تست «${spec.label}»…`; }
  if (outEl) { outEl.hidden = false; outEl.classList.remove('is-error'); outEl.textContent = `در حال اجرای «${spec.label}»…`; }
  if (metaEl) metaEl.textContent = '';

  const t0 = performance.now();
  try {
    const res = await Transcription.textChain(sampleText, {
      system: finalSystem,
      layer: spec.smart ? 'structure' : 'polish',
      smart: spec.smart,
      ...(prefer ? { prefer } : {}),
    });
    const sec = ((performance.now() - t0) / 1000).toFixed(1);
    const { text: cleanOut } = stripTimecodes(res.text);
    if (outEl) outEl.textContent = cleanOut;
    if (metaEl) metaEl.textContent = `ابزار: ${spec.label} · مدل: ${res.model} (${res.providerId}) · زمان: ${fa(sec)} ثانیه`;
  } catch (e) {
    if (outEl) {
      outEl.classList.add('is-error');
      outEl.textContent = `خطا در تست «${spec.label}»: ` + (e?.message || 'ناموفق');
    }
    if (metaEl) metaEl.textContent = '';
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = `اجرای تست «${resolveSandboxSpec().label}»`;
    }
  }
}

export function refreshToolsTab() {
  renderToolsManagerList();
  renderSandboxModels();
  syncSandboxToneNote();
  renderSandboxTargetUI();
}

export function mountToolsTab(deps = {}) {
  onChanged = deps.onToolsChanged || (() => {});
  if (!bound) {
    bound = true;
    $('btn-tool-new')?.addEventListener('click', () => openToolEditor(null));
    $('btn-tool-save')?.addEventListener('click', saveToolFromEditor);
    $('btn-tool-cancel')?.addEventListener('click', closeToolEditor);
    $('btn-tool-reset-one')?.addEventListener('click', resetEditingBuiltinTool);
    $('btn-tools-reset-all')?.addEventListener('click', () => {
      const prev = Storage.getToolsConfig();
      Storage.resetToolsConfig();
      closeToolEditor();
      sandboxTargetId = 'stage-structure';
      renderToolsManagerList();
      renderSandboxTargetUI();
      onChanged();
      Logger.toast('چیدمان و پرامپت ابزارها بازنشانی شد', 7000, {
        actionLabel: 'واگرد',
        onAction: () => {
          Storage.saveToolsConfig(prev);
          renderToolsManagerList();
          renderSandboxTargetUI();
          onChanged();
          Logger.toast('چیدمان قبلی برگردانده شد');
        },
      });
    });

    $('tool-test-target')?.addEventListener('change', (e) => {
      sandboxTargetId = e.target.value || 'stage-structure';
      renderSandboxTargetUI();
    });
    $('btn-sandbox-edit-target')?.addEventListener('click', () => {
      const spec = resolveSandboxSpec();
      if (spec.editToolId) openToolEditor(spec.editToolId);
    });
    ['tool-ed-label', 'tool-ed-system', 'tool-ed-tone', 'tool-ed-smart'].forEach(id => {
      $(id)?.addEventListener('input', () => { if (editorVisible) renderSandboxTargetUI(); });
      $(id)?.addEventListener('change', () => { if (editorVisible) renderSandboxTargetUI(); });
    });

    document.querySelectorAll('[data-sandbox-sample]').forEach(btn => {
      btn.addEventListener('click', () => {
        const key = btn.dataset.sandboxSample;
        const txt = SANDBOX_SAMPLES[key];
        const inp = $('tool-test-input');
        if (txt && inp) {
          inp.value = txt;
          renderSandboxTargetUI();
          inp.focus({ preventScroll: true });
        }
      });
    });

    const testInp = $('tool-test-input');
    if (testInp) {
      if (!testInp.value.trim()) testInp.value = SANDBOX_SAMPLES.casual;
      testInp.addEventListener('input', () => renderSandboxTargetUI());
    }

    $('btn-tool-test')?.addEventListener('click', runPromptSandbox);
  }
  refreshToolsTab();
}
