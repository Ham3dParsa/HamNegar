// Module: quota (thin view)
// Interface: record(model, meta), render(container, opts), LIMITS (re-export from stats)
// Depth: hiding removed — delegates to Stats. View only.
import { Storage } from './storage.js';
import { Stats, LIMITS } from './stats.js';

export { LIMITS };

function esc(s){ const d=document.createElement('div'); d.textContent=s; return d.innerHTML; }

export const Quota = {
  record(model, meta={}) {
    if (!model) return;
    // dual write: keep legacy QUOTA_USAGE for migrate, plus Stats history
    try{
      const q = Storage.getQuotaRaw();
      const today = Stats._tehranDate();
      if (q._date !== today) { q._date = today; Object.keys(LIMITS).forEach(k => q[k]=0); }
      q[model]=(q[model]||0)+1;
      Storage.saveQuotaRaw(q);
    }catch{}
    Stats.record({ model, durationMs: meta.durationMs, words: meta.words, chars: meta.chars, success:true, kind:'stt' });
  },
  render(container, opts={}) {
    if (!container) return;
    const period = opts.period || 'today';
    const expanded = !!opts.expanded;
    const summary = Stats.getSummary(period);
    let byModel = summary.byModel;

    // fallback when no history yet: show chain first item with 0
    if (byModel.length===0){
      const s = Storage.getSettings();
      const chain = s.sttChain?.length ? s.sttChain : [s.primary, s.model];
      const first = chain[0] || 'groq';
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
      const cardCls = m.color==='danger' ? 'quota-card danger pulse' : 'quota-card';
      const favBadge = m.isFavorite ? ' <span class="fav">⭐ محبوب</span>' : '';
      const warnIcon = m.isNearLimit ? ' ⚠' : '';
      const badge = typeof lim.rpd==='number' ? lim.rpd+' /روز' : 'نامحدود';
      container.innerHTML += `<div class="${cardCls}" data-model="${esc(m.model)}"><h4>${esc(m.label)} <span class="badge">${esc(badge)}</span>${favBadge}</h4><div class="bar"><i class="${barCls}" style="width:${pct}%"></i></div><div class="meta"><span>امروز: <b>${m.count}</b> (${pct}٪)${warnIcon}</span><span>${esc(String(lim.rpm))} /دقیقه • ${esc(String(lim.tpm))} /دقیقه</span></div></div>`;
    });

    if (!expanded && byModel.length>3){
      container.insertAdjacentHTML('beforeend', `<button class="btn-ghost btn-sm" data-expand-quota>نمایش همه (${byModel.length})</button>`);
      const btn = container.querySelector('[data-expand-quota]');
      if (btn) btn.addEventListener('click', ()=> Quota.render(container, { ...opts, expanded:true }));
    }
  },
  // for dashboard / tests
  getSummary(period){ return Stats.getSummary(period); },
  getSeries(days){ return Stats.getSeries(days); },
};
