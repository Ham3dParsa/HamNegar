// Module: logger
// Interface: log(level,msg,data) + setStatus(text,type) + toast(msg) + setProgress/dismissProgress + groupRun(label)/clearRun — small surface, hides DOM/progress behind calls.
// Depth: hides DOM creation, truncation, timestamps, console mirroring, STT progress dock, per-run grouping behind calls.
let logBody, statusText, statusDot, toastEl;

// Per-run groups (ticket/16): groupRun(label) opens run #n with a clickable separator;
// every later log line is tagged data-run=n until the next groupRun/clearRun.
let runSeq = 0;
let currentRun = 0;

let progressEl = null;
let progressBar = null;
let progressLabel = null;
let progressStep = null;
let progressSteps = null;

// Compact live progress (ticket/compact-live-progress): full chain stored here,
// but only a max-2-pill window (current + next) is rendered into #progress-steps.
let progressChain = [];
let progressIndex = 0;

// Display names for STT engines (ticket/stt-steps-readable, issue #91 T2):
// raw chain ids (e.g. gemini-flash-lite-latest) never reach the progress UI.
const STT_DISPLAY_NAMES = {
  groq: 'Groq',
  'gemini-flash-lite-latest': 'Flash-Lite',
  'gemini-3.5-flash-lite': 'Flash-Lite 3.5',
  'gemini-3.1-flash-lite': 'Flash-Lite 3.1',
  'gemini-2.5-flash': 'Flash 2.5',
  'gemini-2.0-flash': 'Flash 2.0',
  'gemini-1.5-flash': 'Flash 1.5',
  'gemini-flash-latest': 'Flash',
  'groq-whisper-2': 'Groq Whisper 2',
};
const FA_DIGITS = '۰۱۲۳۴۵۶۷۸۹';
function faNum(n) { return String(n).replace(/[0-9]/g, (d) => FA_DIGITS[Number(d)]); }
function progressEntryLabel(id) {
  if (Object.prototype.hasOwnProperty.call(STT_DISPLAY_NAMES, id)) return STT_DISPLAY_NAMES[id];
  return String(id ?? '').replace(/^gemini-/i, '').replace(/-/g, ' ').trim() || '—';
}
// setProgress labels are built in transcription.js (call shapes frozen) — humanize
// any raw id embedded in the label here so the head row never shows a raw id.
function humanizeLabel(text) {
  let out = String(text ?? '');
  for (const [id, name] of Object.entries(STT_DISPLAY_NAMES).sort((a, b) => b[0].length - a[0].length)) {
    if (id === 'groq') {
      // standalone 'groq' only — never inside 'groq-whisper-2' (handled above by length order)
      out = out.replace(/(?<![-\w])groq(?![-\w])/g, name);
    } else if (out.includes(id)) {
      out = out.split(id).join(name);
    }
  }
  return out;
}
function renderProgressWindow() {
  if (!progressSteps) progressSteps = document.getElementById('progress-steps');
  if (!progressSteps) return;
  progressSteps.innerHTML = '';
  const n = progressChain.length;
  if (!n) return;
  let start = Math.max(0, Math.min(progressIndex, n - 1));
  if (start >= n - 1 && n >= 2) start = n - 2; // last step: show prev + current
  const end = Math.min(start + 2, n);
  for (let idx = start; idx < end; idx++) {
    const li = document.createElement('li');
    li.className = 'chain-step';
    li.dataset.idx = String(idx);
    const rank = document.createElement('span');
    rank.className = 'rank' + (idx > 0 ? ' fallback' : '');
    rank.textContent = faNum(idx + 1);
    const label = document.createElement('span');
    label.textContent = progressChain[idx].label;
    label.style.fontSize = '12px';
    const icon = document.createElement('span');
    icon.className = 'step-icon';
    icon.setAttribute('aria-hidden', 'true');
    li.append(rank, label, icon);
    progressSteps.appendChild(li);
  }
}

export const Logger = {
  init({ logBodyEl, statusTextEl, statusDotEl, toastEl: t }) {
    logBody = logBodyEl; statusText = statusTextEl; statusDot = statusDotEl; toastEl = t;
    progressEl = document.getElementById('stt-progress');
    progressBar = document.getElementById('progress-bar');
    progressLabel = document.getElementById('progress-label');
    progressStep = document.getElementById('progress-step');
    progressSteps = document.getElementById('progress-steps');
  },
  log(level, msg, data) {
    if (!logBody) return;
    const time = new Date().toLocaleTimeString('fa-IR');
    const line = document.createElement('div');
    line.className = 'log-line ' + level;
    line.dataset.level = level;
    let detail = '';
    if (data !== undefined) {
      try { detail = typeof data === 'string' ? data : JSON.stringify(data, null, 2); } catch { detail = String(data); }
      if (detail.length > 900) detail = detail.slice(0, 900) + ' …';
    }
    line.innerHTML = `<span class="log-time">${time}</span> [${esc(level).toUpperCase()}] ${esc(msg)}${detail ? `<details style="margin-top:4px"><summary style="cursor:pointer;color:var(--muted)">جزئیات</summary><pre style="white-space:pre-wrap;word-break:break-all;font-size:11px;margin-top:4px">${esc(detail)}</pre></details>` : ''}`;
    if (currentRun) line.dataset.run = String(currentRun);
    logBody.appendChild(line);
    if (logBody.children.length > 300) logBody.removeChild(logBody.firstChild);
    logBody.scrollTop = logBody.scrollHeight;
    const fn = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
    fn(`[${level}] ${msg}`, data ?? '');
  },
  // Open a per-run group: prints a clickable separator (app.js isolates the run on click)
  // and tags all following lines with data-run=n. Labels are code constants — never keys.
  groupRun(label) {
    runSeq += 1;
    currentRun = runSeq;
    const safe = esc(String(label ?? '').slice(0, 80));
    if (logBody) {
      const time = new Date().toLocaleTimeString('fa-IR');
      const sep = document.createElement('div');
      sep.className = 'log-line log-sep';
      sep.dataset.level = 'info';
      sep.dataset.run = String(currentRun);
      sep.tabIndex = 0;
      sep.setAttribute('role', 'button');
      sep.setAttribute('aria-pressed', 'false');
      sep.setAttribute('aria-label', `ایزوله کردن اجرای ${currentRun}`);
      sep.innerHTML = `<span class="log-time">${time}</span> <b>${safe} #${currentRun}</b> <span class="run-hint">(کلیک: فقط همین اجرا)</span>`;
      logBody.appendChild(sep);
      if (logBody.children.length > 300) logBody.removeChild(logBody.firstChild);
      logBody.scrollTop = logBody.scrollHeight;
    }
    console.log(`[run #${currentRun}] ${label}`);
    return currentRun;
  },
  // End the current run: following lines stay untagged until the next groupRun.
  clearRun() {
    currentRun = 0;
  },
  setStatus(text, type = 'info') {
    if (statusText) statusText.textContent = text;
    if (statusDot) statusDot.className = 'dot' + (type === 'error' ? ' err' : type === 'warn' ? ' warn' : type === 'rec' ? ' rec' : '');
    this.log(type === 'error' ? 'error' : type === 'warn' ? 'warn' : 'info', text);
  },
  toast(msg, ms = 2600) {
    if (!toastEl) return;
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    setTimeout(() => toastEl.classList.remove('show'), ms);
  },
  setProgress({ state, index, total, label, engine }) {
    if (!progressEl) progressEl = document.getElementById('stt-progress');
    if (!progressEl) return;
    if (!progressBar) progressBar = document.getElementById('progress-bar');
    if (!progressLabel) progressLabel = document.getElementById('progress-label');
    if (!progressStep) progressStep = document.getElementById('progress-step');
    if (!progressSteps) progressSteps = document.getElementById('progress-steps');
    progressEl.hidden = false;
    if (progressLabel && label) progressLabel.textContent = humanizeLabel(label);
    if (progressStep && typeof index === 'number' && typeof total === 'number') {
      progressStep.textContent = `قدم ${faNum(index + 1)} از ${faNum(total)}`;
      if (progressBar) progressBar.style.width = `${Math.round(((index + 1) / total) * 100)}%`;
      if (progressBar) progressBar.parentElement.setAttribute('aria-valuenow', String(Math.round(((index + 1) / total) * 100)));
    }
    if (progressSteps && typeof index === 'number') {
      const hasChain = progressChain.length > 0;
      if (hasChain) {
        progressIndex = Math.max(0, Math.min(index, progressChain.length - 1));
        renderProgressWindow();
      }
      const items = [...progressSteps.children];
      items.forEach((li, i) => {
        li.classList.remove('is-trying', 'is-current', 'is-failed', 'is-done');
        // Compact window: pills carry data-idx; static fallback (no rebuild yet) matches by position.
        const pos = hasChain ? Number(li.dataset.idx ?? -1) : i;
        const cur = hasChain ? progressIndex : index;
        if (!hasChain && pos < cur) li.classList.add('is-failed');
        if (pos !== cur) return;
        if (state === 'failed') li.classList.add('is-failed');
        else if (state === 'done') li.classList.add('is-done');
        else { li.classList.add('is-trying', 'is-current'); }
      });
    }
    // sync dot
    if (state === 'trying' && statusDot) statusDot.className = 'dot warn';
    if (state === 'done' && statusDot) statusDot.className = 'dot';
    if (state === 'failed' && statusDot) statusDot.className = 'dot warn';
  },
  rebuildProgress(chain) {
    if (!progressSteps) progressSteps = document.getElementById('progress-steps');
    if (!progressSteps || !Array.isArray(chain)) return;
    // Store the full chain internally; render only the max-2-pill window
    // (current + next). Full-chain detail stays in log lines only.
    progressChain = chain.map((entry) => {
      const id = typeof entry === 'object' ? entry.id : entry;
      return { id, label: progressEntryLabel(id) };
    });
    progressIndex = 0;
    renderProgressWindow();
  },
  dismissProgress(delay = 0) {
    const el = progressEl || document.getElementById('stt-progress');
    if (!el) return;
    const hide = () => { el.hidden = true; };
    if (delay) setTimeout(hide, delay); else hide();
  },
};
function esc(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
