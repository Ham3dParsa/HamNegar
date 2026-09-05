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
    if (progressLabel && label) progressLabel.textContent = label;
    if (progressStep && typeof index === 'number' && typeof total === 'number') {
      progressStep.textContent = `قدم ${index + 1} از ${total}`;
      if (progressBar) progressBar.style.width = `${Math.round(((index + 1) / total) * 100)}%`;
      if (progressBar) progressBar.parentElement.setAttribute('aria-valuenow', String(Math.round(((index + 1) / total) * 100)));
    }
    if (progressSteps && typeof index === 'number') {
      const items = [...progressSteps.children];
      items.forEach((li, i) => {
        li.classList.remove('is-trying', 'is-current', 'is-failed', 'is-done');
        if (i < index) li.classList.add('is-failed');
        if (i === index) {
          if (state === 'failed') li.classList.add('is-failed');
          else if (state === 'done') li.classList.add('is-done');
          else { li.classList.add('is-trying', 'is-current'); }
        }
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
    progressSteps.innerHTML = '';
    chain.forEach((entry, idx) => {
      const id = typeof entry === 'object' ? entry.id : entry;
      const li = document.createElement('li');
      li.className = 'chain-step';
      const rank = document.createElement('span');
      rank.className = 'rank' + (idx > 0 ? ' fallback' : '');
      rank.textContent = String(idx + 1);
      const label = document.createElement('span');
      label.textContent = id === 'groq' ? 'Groq' : id;
      label.style.fontSize = '12px';
      const icon = document.createElement('span');
      icon.className = 'step-icon';
      icon.setAttribute('aria-hidden', 'true');
      li.append(rank, label, icon);
      progressSteps.appendChild(li);
    });
  },
  dismissProgress(delay = 0) {
    const el = progressEl || document.getElementById('stt-progress');
    if (!el) return;
    const hide = () => { el.hidden = true; };
    if (delay) setTimeout(hide, delay); else hide();
  },
};
function esc(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
