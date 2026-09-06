// Module: dashboard (deep)
// Interface: Dashboard.ensureReportUI(), Dashboard.renderOverall()
// Depth: hides Tehran period state, segmented UI, three hero cards, 7/30-day series strip.
import { Quota } from './quota.js';

let activePeriod = 'today';

function esc(s){ const d=document.createElement('div'); d.textContent=s; return d.innerHTML; }

// view-only Persian-digit formatting (no stats-math change; mirrors quota.js)
function fa(v){ return String(v).replace(/\d/g, d=>'۰۱۲۳۴۵۶۷۸۹'[d]); }

export const Dashboard = {
  getPeriod(){ return activePeriod; },
  setPeriod(p){ activePeriod = p; },

  ensureReportUI(){
    if(document.getElementById('report-overall')) return;
    const quotaGrid = document.getElementById('quota-grid');
    const detail = document.getElementById('quota-detail');
    if(!quotaGrid || !detail) return;
    const sec=document.createElement('section');
    sec.id='report-overall';
    sec.className='report-overall';
    sec.innerHTML=`
    <div class="report-head">
      <h3>گزارش استفاده</h3>
      <div class="segmented" role="tablist" aria-label="بازه زمانی">
        <button data-period="today" class="active" role="tab" aria-selected="true">روز</button>
        <button data-period="week" role="tab">هفته</button>
        <button data-period="month" role="tab">ماه</button>
        <button data-period="all" role="tab">کل</button>
      </div>
    </div>
    <div class="overall-grid" id="overall-grid"></div>
    <p class="saved-note" id="saved-note"></p>
    <div class="series-strip" id="series-strip"></div>
  `;
    // single toggle lives outside: #quota-toggle ↔ #quota-detail (wired in app.js).
    // report section stays inside #quota-detail, always visible while expanded.
    detail.insertBefore(sec, quotaGrid);
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
  },

  renderOverall(){
    const grid=document.getElementById('overall-grid');
    const seriesStrip=document.getElementById('series-strip');
    if(!grid) return;
    const s=Quota.getSummary(activePeriod);
    const fmtMin=v=> fa(v<1 ? Math.round(v*60)+' ثانیه' : v.toFixed(1)+' دقیقه');
    const hasSpeed = s.avgWpm>0;
    grid.innerHTML=`
    <div class="overall-card"><span>درخواست</span><b>${fa(s.totals.count)}</b><small>${esc(s.rangeLabel)}</small></div>
    <div class="overall-card"><span>دقایق رونویسی</span><b>${fmtMin(s.totals.minutes)}</b><small>${fa(s.totals.words)} کلمه</small></div>
    <div class="overall-card"><span>میانگین سرعت</span><b>${hasSpeed ? fa(s.avgWpm)+' wpm' : '—'}</b><small>${hasSpeed ? fa(s.speedBoost)+' سریع‌تر' : '—'}</small></div>
  `;
    const savedNote=document.getElementById('saved-note');
    if(savedNote) savedNote.textContent=`≈${fa(s.savedMinutes)} دقیقه ذخیره‌شده نسبت به تایپ`;
    if(seriesStrip){
      const daysForStrip = activePeriod==='month' ? 30 : activePeriod==='all' ? 30 : 7;
      const series=Quota.getSeries(daysForStrip);
      if(!series.length){
        seriesStrip.innerHTML='<span class="series-empty">هنوز داده‌ای نیست</span>';
        return;
      }
      let todayStr='';
      try{ todayStr=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Tehran'}).format(new Date()); }catch{}
      const hasToday = !!todayStr && series.some(d=>d.date===todayStr);
      const max=Math.max(1, ...series.map(x=>x.count));
      seriesStrip.innerHTML=series.map((d,i)=>{
        const active = hasToday ? d.date===todayStr : i===series.length-1;
        const tip=`${esc(d.date)}: ${esc(String(d.count))}`;
        return `<div class="series-bar${active?' active':''}" role="img" aria-label="${tip}" title="${tip}" style="height:${Math.max(8, Math.round(d.count/max*100))}%"></div>`;
      }).join('');
    }
  }
};

// named exports for thin consumption
export const ensureReportUI = Dashboard.ensureReportUI.bind(Dashboard);
export const renderOverall = Dashboard.renderOverall.bind(Dashboard);
export const getPeriod = Dashboard.getPeriod.bind(Dashboard);
export const setPeriod = Dashboard.setPeriod.bind(Dashboard);
