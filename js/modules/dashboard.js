// Module: dashboard (deep)
// Interface: Dashboard.ensureReportUI(), Dashboard.renderOverall()
// Depth: hides Tehran period state, segmented UI, overall cards, fun row, 7/30-day series bar generation.
import { Quota } from './quota.js';
import { Storage } from './storage.js';

let activePeriod = 'today';

function esc(s){ const d=document.createElement('div'); d.textContent=s; return d.innerHTML; }

export const Dashboard = {
  getPeriod(){ return activePeriod; },
  setPeriod(p){ activePeriod = p; },

  ensureReportUI(){
    if(document.getElementById('report-overall')) return;
    const quotaGrid = document.getElementById('quota-grid');
    if(!quotaGrid) return;
    const sec=document.createElement('section');
    sec.id='report-overall';
    sec.className='report-overall';
    sec.innerHTML=`
    <div class="report-head">
      <h3 style="font-size:13px">📊 گزارش استفاده</h3>
      <div class="segmented" role="tablist" aria-label="بازه زمانی">
        <button data-period="today" class="active" role="tab" aria-selected="true">روز</button>
        <button data-period="week" role="tab">هفته</button>
        <button data-period="month" role="tab">ماه</button>
        <button data-period="all" role="tab">کل</button>
      </div>
    </div>
    <div class="report-summary" id="report-summary"><span id="report-summary-text">—</span><button class="btn-ghost btn-sm" id="btn-toggle-report" aria-expanded="false">نمایش جزئیات ▾</button></div>
    <div id="report-details" hidden>
      <div class="overall-grid" id="overall-grid"></div>
      <div class="fun-row" id="fun-row"></div>
      <div class="series-strip" id="series-strip"></div>
    </div>
  `;
    quotaGrid.parentNode.insertBefore(sec, quotaGrid);
    // move quota-grid inside details to avoid floating outside report
    const detailsEl = sec.querySelector('#report-details');
    if (detailsEl && quotaGrid) detailsEl.appendChild(quotaGrid);
    sec.querySelectorAll('[data-period]').forEach(btn=>{
      btn.addEventListener('click', ()=>{
        sec.querySelectorAll('[data-period]').forEach(b=>{ b.classList.remove('active'); b.setAttribute('aria-selected','false'); });
        btn.classList.add('active'); btn.setAttribute('aria-selected','true');
        activePeriod=btn.dataset.period;
        Dashboard.renderOverall();
        const qg = document.getElementById('quota-grid');
        if(qg) Quota.render(qg, { period: activePeriod });
      });
    });
    const details=document.getElementById('report-details');
    const toggleBtn=document.getElementById('btn-toggle-report');
    const startCollapsed = Storage.getSettings().reportCollapsed;
    function applyReportCollapsed(collapsed){
      details.hidden=collapsed;
      toggleBtn.textContent= collapsed ? 'نمایش جزئیات ▾' : 'پنهان‌سازی ▴';
      toggleBtn.setAttribute('aria-expanded', String(!collapsed));
      Storage.saveSettings({ reportCollapsed: collapsed });
    }
    applyReportCollapsed(startCollapsed);
    toggleBtn.addEventListener('click', ()=>{
      const willShow=details.hidden;
      applyReportCollapsed(!willShow);
    });
  },

  renderOverall(){
    const grid=document.getElementById('overall-grid');
    const funRow=document.getElementById('fun-row');
    const seriesStrip=document.getElementById('series-strip');
    const summaryText=document.getElementById('report-summary-text');
    if(!grid) return;
    const s=Quota.getSummary(activePeriod);
    const fmtMin=v=> v<1 ? Math.round(v*60)+' ثانیه' : v.toFixed(1)+' دقیقه';
    if(summaryText){
      const fav=s.favorite? s.favorite.label : '—';
      summaryText.textContent=`${s.totals.count} درخواست ${s.rangeLabel} — ${fav} • ${fmtMin(s.totals.minutes)}`;
    }
    grid.innerHTML=`
    <div class="overall-card"><span>درخواست</span><b>${s.totals.count}</b><small>${s.rangeLabel}</small></div>
    <div class="overall-card"><span>دقایق رونویسی</span><b>${fmtMin(s.totals.minutes)}</b><small>${s.totals.words} کلمه</small></div>
    <div class="overall-card"><span>میانگین سرعت</span><b>${s.avgWpm||'—'} wpm</b><small>${s.speedBoost} سریع‌تر</small></div>
    <div class="overall-card accent"><span>⏱ زمان ذخیره‌شده</span><b>${s.savedMinutes} دقیقه</b><small>نسبت به تایپ ۴۰ کلمه/دقیقه</small></div>
  `;
    if(funRow){
      const favRaw = s.favorite ? `⭐ محبوب: ${s.favorite.label} (${s.favorite.count} بار)` : '—';
      const longestRaw = s.fun.longestSessionMin ? `⏳ طولانی‌ترین: ${s.fun.longestSessionMin} دقیقه` : '';
      const streakRaw = s.fun.streakDays ? `🔥 تداوم: ${s.fun.streakDays} روز` : '';
      const busyRaw = s.fun.busiestDay ? `📌 شلوغ: ${s.fun.busiestDay.date}` : '';
      funRow.innerHTML=`<span>${esc(favRaw)}</span><span>${esc(busyRaw)}</span><span>${esc(longestRaw)}</span><span>${esc(streakRaw)}</span>`;
    }
    if(seriesStrip){
      const daysForStrip = activePeriod==='month' ? 30 : activePeriod==='all' ? 30 : activePeriod==='week' ? 7 : 7;
      const series=Quota.getSeries(daysForStrip);
      const max=Math.max(1, ...series.map(x=>x.count));
      seriesStrip.innerHTML=series.map(d=> `<div class="series-bar" title="${esc(d.date)}: ${esc(String(d.count))}" style="height:${Math.max(8, Math.round(d.count/max*100))}%"><span>${esc(String(d.count))}</span></div>`).join('') || '<span style="color:var(--muted);font-size:11px">هنوز داده‌ای نیست</span>';
    }
  }
};

// named exports for thin consumption
export const ensureReportUI = Dashboard.ensureReportUI.bind(Dashboard);
export const renderOverall = Dashboard.renderOverall.bind(Dashboard);
export const getPeriod = Dashboard.getPeriod.bind(Dashboard);
export const setPeriod = Dashboard.setPeriod.bind(Dashboard);
