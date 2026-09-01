// Module: logger
// Interface: log(level,msg,data) + setStatus(text,type) + toast(msg)
// Depth: hides DOM creation, truncation, timestamps, console mirroring, status dot and toast animation behind 3 calls.
let logBody, statusText, statusDot, toastEl;
export const Logger = {
  init({ logBodyEl, statusTextEl, statusDotEl, toastEl: t }) {
    logBody = logBodyEl; statusText = statusTextEl; statusDot = statusDotEl; toastEl = t;
  },
  log(level, msg, data) {
    if (!logBody) return;
    const time = new Date().toLocaleTimeString('fa-IR');
    const line = document.createElement('div');
    line.className = 'log-line ' + level;
    let detail = '';
    if (data !== undefined) {
      try { detail = typeof data === 'string' ? data : JSON.stringify(data, null, 2); } catch { detail = String(data); }
      if (detail.length > 900) detail = detail.slice(0, 900) + ' …';
    }
    line.innerHTML = `<span class="log-time">${time}</span> [${level.toUpperCase()}] ${esc(msg)}${detail ? `<details style="margin-top:4px"><summary style="cursor:pointer;color:var(--muted)">جزئیات</summary><pre style="white-space:pre-wrap;word-break:break-all;font-size:11px;margin-top:4px">${esc(detail)}</pre></details>` : ''}`;
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
};
function esc(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
