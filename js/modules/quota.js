// Module: quota (thin view)
// Interface: record(model, meta), render(container, opts), LIMITS (re-export from stats)
// Depth: hiding removed — delegates to Stats. View only.
import { Storage } from './storage.js';
import { Stats, LIMITS } from './stats.js';

export { LIMITS };

function esc(s){ const d=document.createElement('div'); d.textContent=s; return d.innerHTML; }

// view-only Persian-digit formatting for the single meta line (no stats-math change)
function fa(v){ return String(v).replace(/\d/g, d=>'۰۱۲۳۴۵۶۷۸۹'[d]); }

// keep expanded state per container so period switch doesn't collapse unexpectedly
const expandedMap = new WeakMap();

export const Quota = {
  record(model, meta={}) {
    if (!model) return;
    const words = meta.words||0;
    const chars = meta.chars||0;
    // skip empty payload to avoid polluting totals (Kilo suggestion)
    if (!words && !chars) return;
    // drop dual-write drift: Stats is source of truth; QUOTA_USAGE is legacy read-only for migrateIfNeeded
    // do not write legacy on new records — migration is one-way
    Stats.record({ model, durationMs: meta.durationMs, words, chars, success: meta.success!==false, kind: meta.kind||'stt' });
  },
  render(container, opts={}) {
    if (!container) return;
    const period = opts.period || 'today';
    // persist expanded across period switches unless explicitly collapsed
    let expanded = !!opts.expanded;
    if (opts.expanded === undefined && expandedMap.has(container)) {
      expanded = expandedMap.get(container);
    }
    expandedMap.set(container, expanded);
    const summary = Stats.getSummary(period);
    // view-side desc sort (Stats already sorts; defensive copy, no math change)
    let byModel = [...summary.byModel].sort((a,b)=> b.count-a.count);

    // fallback when no history yet: show chain first item with 0
    if (byModel.length===0){
      const s = Storage.getSettings();
      const chain = s.sttChain?.length ? s.sttChain : [s.primary, s.model];
      const raw = chain[0] || 'groq';
      const first = typeof raw==='object' ? raw.id : raw;
      const lim = LIMITS[first] || { label:first, rpd:'—', rpm:'—', tpm:'—' };
      byModel = [{ model:first, label: lim.label, count:0, pct:0, color:'none', isFavorite:false, isNearLimit:false }];
    }

    const visible = expanded ? byModel : byModel.slice(0,3);
    container.innerHTML = '';

    visible.forEach(m=>{
      const lim = LIMITS[m.model] || { label:m.model, rpd:'—', rpm:'—', tpm:'—' };
      const pct = m.pct || 0;
      let barCls='';
      if (m.color==='warn') barCls='warn';
      else if (m.color==='warn-orange') barCls='warn-orange';
      else if (m.color==='danger') barCls='danger';
      const cardCls = (m.color==='danger' ? 'quota-card danger pulse' : 'quota-card') + ' quota-card--minimal' + (m.isFavorite?' is-fav':'');
      // rank 1 only: inline muted outline chip, no absolute positioning
      const topChip = m.isFavorite ? '<span class="fav-chip">پراستفاده</span>' : '';
      const warnIcon = m.isNearLimit ? ' ⚠' : '';
      const badge = typeof lim.rpd==='number' ? 'سقف '+lim.rpd+'/روز' : 'نامحدود';
      const meta = typeof lim.rpd==='number'
        ? `${fa(m.count)} از ${fa(lim.rpd)} (${fa(pct)}٪)`
        : `${fa(m.count)} درخواست`;
      container.innerHTML += `<div class="${cardCls}" data-model="${esc(m.model)}"><h4><span class="model-name">${esc(m.label)}</span>${topChip}<span class="badge">${esc(badge)}</span></h4><div class="bar"><i class="${barCls}" style="width:${pct}%"></i></div><div class="meta"><span>${meta}${warnIcon}</span></div></div>`;
    });

    if (!expanded && byModel.length>3){
      container.insertAdjacentHTML('beforeend', `<button class="btn-ghost btn-sm" data-expand-quota>نمایش همه (${byModel.length})</button>`);
      const btn = container.querySelector('[data-expand-quota]');
      if (btn) btn.addEventListener('click', ()=> Quota.render(container, { period, expanded:true }));
    } else if (expanded && byModel.length>3) {
      container.insertAdjacentHTML('beforeend', `<button class="btn-ghost btn-sm" data-collapse-quota>نمایش کمتر</button>`);
      const btn2 = container.querySelector('[data-collapse-quota]');
      if (btn2) btn2.addEventListener('click', ()=> Quota.render(container, { period, expanded:false }));
    }
  },
  // for dashboard / tests
  getSummary(period){ return Stats.getSummary(period); },
  getSeries(days){ return Stats.getSeries(days); },
};
