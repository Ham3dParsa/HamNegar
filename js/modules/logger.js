// Module: logger
// Interface: log(level,msg,data) + setStatus(text,type) + toast(msg) — keeps 3-call surface small.
// Depth: hides DOM creation, truncation, timestamps, console mirroring, filter/search, highlighting, highlight truncation.
let logBody, statusText, statusDot, toastEl;
let currentFilter = 'all';
let searchQuery = '';

function passes(level, text) {
  if (currentFilter !== 'all' && level !== currentFilter) return false;
  if (searchQuery && !text.toLowerCase().includes(searchQuery.toLowerCase())) return false;
  return true;
}

function applyFilters() {
  if (!logBody) return;
  for (const el of logBody.children) {
    const lvl = el.dataset.level || 'info';
    const ok = passes(lvl, el.innerText);
    el.classList.toggle('hidden', !ok);
  }
}

function buildFilterUI() {
  const header = document.getElementById('log-header');
  if (!header || header.querySelector('.log-filters')) return;
  // insert filters before actions div
  const actions = header.querySelector('#log-actions') || header.lastElementChild;
  const filtersWrap = document.createElement('div');
  filtersWrap.className = 'log-filters';
  filtersWrap.setAttribute('role', 'group');
  filtersWrap.setAttribute('aria-label', 'فیلتر سطح لاگ');
  const levels = [
    ['all', 'همه'],
    ['info', 'info'],
    ['warn', 'warn'],
    ['error', 'error'],
    ['debug', 'debug'],
  ];
  for (const [lvl, label] of levels) {
    const btn = document.createElement('button');
    btn.className = 'log-filter' + (lvl === 'all' ? ' active' : '');
    btn.dataset.level = lvl;
    btn.textContent = label;
    btn.type = 'button';
    btn.addEventListener('click', () => {
      currentFilter = lvl;
      filtersWrap.querySelectorAll('.log-filter').forEach(b => b.classList.toggle('active', b.dataset.level === lvl));
      applyFilters();
    });
    filtersWrap.appendChild(btn);
  }
  const search = document.createElement('input');
  search.id = 'log-search';
  search.type = 'search';
  search.placeholder = 'جستجو…';
  search.setAttribute('aria-label', 'جستجو در لاگ');
  search.addEventListener('input', () => {
    searchQuery = search.value.trim();
    applyFilters();
  });
  // inject: header flex wrap — place filters+search before actions
  // ensure actions container exists
  let actionsDiv = header.querySelector('#log-actions');
  if (!actionsDiv) {
    // wrap existing buttons into #log-actions if not present
    const btns = header.querySelector('div');
    if (btns) { btns.id = 'log-actions'; actionsDiv = btns; }
  }
  header.insertBefore(search, actionsDiv);
  header.insertBefore(filtersWrap, search);
}

export const Logger = {
  init({ logBodyEl, statusTextEl, statusDotEl, toastEl: t }) {
    logBody = logBodyEl; statusText = statusTextEl; statusDot = statusDotEl; toastEl = t;
    buildFilterUI();
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
    line.innerHTML = `<span class="log-time">${time}</span> [${level.toUpperCase()}] ${esc(msg)}${detail ? `<details style="margin-top:4px"><summary style="cursor:pointer;color:var(--muted)">جزئیات</summary><pre style="white-space:pre-wrap;word-break:break-all;font-size:11px;margin-top:4px">${esc(detail)}</pre></details>` : ''}`;
    // apply current filter immediately
    const textForFilter = line.innerText;
    if (!passes(level, textForFilter)) line.classList.add('hidden');
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
  // small extras kept minimal — used by splitter/filter UI internally
  setFilter(level) { currentFilter = level; applyFilters(); },
  getFilter() { return currentFilter; },
};
function esc(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
