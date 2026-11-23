// Tools Studio Tab: custom & built-in tool manager (order, favorite pin, show/hide, prompt edit)
// + live system prompt sandbox with preset Persian samples or user-supplied text.
import { Storage, BUILTIN_TOOLS } from './storage.js';
import { Transcription, smartModelScore, applyTonePreference } from './transcription.js';
import { BUILTIN_PROMPTS } from './stagebar.js';
import { providerIdOf, entryIdOf } from './chains.js';
import { Logger } from './logger.js';
import { fa } from './format.js';
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
let bound = false;
let onChanged = () => {};

function effectivePromptFor(tool) {
  if (!tool) return '';
  const custom = (tool.system || '').trim();
  if (custom) return custom;
  return BUILTIN_PROMPTS[tool.id] || '';
}

function renderToolsManagerList() {
  const box = $('tools-manager-list');
  if (!box) return;
  const tools = Storage.getToolsConfig();
  box.innerHTML = '';

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
      onChanged();
    });

    actions.append(visLabel, up, dn);

    if (tool.kind === 'prompt') {
      const editBtn = document.createElement('button');
      editBtn.type = 'button';
      editBtn.className = 'btn-ghost btn-xs';
      editBtn.innerHTML = SVG_EDIT;
      editBtn.title = 'ویرایش نام و پرامپت سیستمی';
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
        renderToolsManagerList();
        onChanged();
        Logger.toast(`«${tool.label}» حذف شد`, 7000, {
          actionLabel: 'واگرد',
          onAction: () => {
            Storage.saveToolsConfig(snapshot);
            renderToolsManagerList();
            onChanged();
            Logger.toast(`«${tool.label}» برگردانده شد`);
          },
        });
      });
      actions.appendChild(delBtn);
    }

    row.append(pinBtn, info, actions);
    box.appendChild(row);
  });
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
  labelEl?.focus?.();
}

function closeToolEditor() {
  const card = $('tool-editor-card');
  const sysEl = $('tool-ed-system');
  editorVisible = false;
  editingId = null;
  if (sysEl) sysEl.value = '';
  if (card) card.hidden = true;
  renderToolsManagerList();
}

function saveToolFromEditor() {
  const label = ($('tool-ed-label')?.value || '').trim().slice(0, 48);
  const sub = ($('tool-ed-sub')?.value || '').trim().slice(0, 90);
  const systemRaw = ($('tool-ed-system')?.value || '').trim().slice(0, 4000);
  const smart = !!$('tool-ed-smart')?.checked;
  const respectTone = !!$('tool-ed-tone')?.checked;

  if (!label) { Logger.toast('نام ابزار را وارد کن'); $('tool-ed-label')?.focus?.(); return; }
  if (!systemRaw) { Logger.toast('پرامپت سیستمی نمی‌تواند خالی باشد'); $('tool-ed-system')?.focus?.(); return; }

  const list = Storage.getToolsConfig();
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
    const newId = 'custom-' + Date.now().toString(36);
    list.push({
      id: newId,
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
  head.textContent = 'خودکار (مطابق اولویت و Smart Routing)';
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
    ? 'حالت لحن فعلی: رسمی و کتابی (قابل تغییر در تب رفتار)'
    : 'حالت لحن فعلی: حفظ لحن خودمانی گوینده (پیش‌فرض)';
}

async function runPromptSandbox() {
  const inputEl = $('tool-test-input');
  const outEl = $('tool-test-output');
  const metaEl = $('tool-test-meta');
  const btn = $('btn-tool-test');
  const sysInput = editorVisible ? ($('tool-ed-system')?.value || '').trim() : '';
  const sampleText = (inputEl?.value || '').trim();

  if (!sampleText) {
    Logger.toast('یک متن آماده انتخاب کن یا متن دلخواهت را بنویس');
    inputEl?.focus?.();
    return;
  }

  const baseSystem = sysInput || BUILTIN_PROMPTS['stage-structure'];
  const respectTone = editorVisible ? !!$('tool-ed-tone')?.checked : true;
  const smart = editorVisible ? !!$('tool-ed-smart')?.checked : true;
  const finalSystem = applyTonePreference(baseSystem, { respectTone, text: sampleText });

  let prefer = null;
  const selVal = $('tool-test-model')?.value || '';
  if (selVal) {
    try { prefer = JSON.parse(selVal); } catch { prefer = null; }
  }

  if (btn) { btn.disabled = true; btn.textContent = 'در حال اجرای تست…'; }
  if (outEl) { outEl.hidden = false; outEl.classList.remove('is-error'); outEl.textContent = 'در حال دریافت پاسخ از مدل…'; }
  if (metaEl) metaEl.textContent = '';

  const t0 = performance.now();
  try {
    const res = await Transcription.textChain(sampleText, {
      system: finalSystem,
      layer: smart ? 'structure' : 'polish',
      smart,
      ...(prefer ? { prefer } : {}),
    });
    const sec = ((performance.now() - t0) / 1000).toFixed(1);
    if (outEl) outEl.textContent = res.text;
    if (metaEl) metaEl.textContent = `مدل: ${res.model} (${res.providerId}) · زمان: ${fa(sec)} ثانیه`;
  } catch (e) {
    if (outEl) {
      outEl.classList.add('is-error');
      outEl.textContent = 'خطا در اجرای تست: ' + (e?.message || 'ناموفق');
    }
    if (metaEl) metaEl.textContent = '';
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'اجرای تست پرامپت'; }
  }
}

export function refreshToolsTab() {
  renderToolsManagerList();
  renderSandboxModels();
  syncSandboxToneNote();
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
      renderToolsManagerList();
      onChanged();
      Logger.toast('چیدمان و پرامپت ابزارها بازنشانی شد', 7000, {
        actionLabel: 'واگرد',
        onAction: () => {
          Storage.saveToolsConfig(prev);
          renderToolsManagerList();
          onChanged();
          Logger.toast('چیدمان قبلی برگردانده شد');
        },
      });
    });

    document.querySelectorAll('[data-sandbox-sample]').forEach(btn => {
      btn.addEventListener('click', () => {
        const key = btn.dataset.sandboxSample;
        const txt = SANDBOX_SAMPLES[key];
        const inp = $('tool-test-input');
        if (txt && inp) {
          inp.value = txt;
          inp.focus();
        }
      });
    });

    const testInp = $('tool-test-input');
    if (testInp && !testInp.value.trim()) {
      testInp.value = SANDBOX_SAMPLES.casual;
    }

    $('btn-tool-test')?.addEventListener('click', runPromptSandbox);
  }
  refreshToolsTab();
}
