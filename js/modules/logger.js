// Module: logger
// Interface: log(level,msg,data) + setStatus(text,type) + toast(msg) + setProgress/dismissProgress — small surface, hides DOM/progress behind calls.
// Depth: hides DOM creation, truncation, timestamps, console mirroring, STT progress dock behind 5 calls.
let logBody, statusText, statusDot, toastEl;

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
    logBody.appendChild(line);
    if (logBody.children.length > 300) logBody.removeChild(logBody.firstChild);
    logBody.scrollTop = logBody.scrollHeight;
    const fn = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
    fn(`[${level}] ${msg}`, data ?? '');
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
        if (i === index && state === 'done') li.classList.add('is-done');
      });
    }
    // sync dot
    if (state === 'trying' && statusDot) statusDot.className = 'dot warn';
    if (state === 'done' && statusDot) statusDot.className = 'dot';
    if (state === 'failed' && statusDot) statusDot.className = 'dot warn';
  },
  dismissProgress(delay = 0) {
    const el = progressEl || document.getElementById('stt-progress');
    if (!el) return;
    const hide = () => { el.hidden = true; };
    if (delay) setTimeout(hide, delay); else hide();
  },
};
function esc(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
