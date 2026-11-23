// Module: dashboard (deep)
// Interface: Dashboard.ensureReportUI(), Dashboard.renderOverall()
// Depth: hides Tehran period state, segmented UI, three hero cards, fixed-slot vertical bar chart.
import { Quota } from './quota.js';
import { fa, esc } from './format.js';

let activePeriod = 'today';

const tehranCaFmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tehran' });
const tehranFaShortFmt = new Intl.DateTimeFormat('fa-IR-u-ca-persian', {
  timeZone: 'Asia/Tehran',
  month: 'short',
  day: 'numeric',
});
const tehranDayNumFmt = new Intl.DateTimeFormat('fa-IR-u-ca-persian', {
  timeZone: 'Asia/Tehran',
  day: 'numeric',
});

function buildFixedCalendarSeries(windowDays) {
  const raw = Quota.getSeries(Math.max(windowDays, 30));
  const byDate = new Map(raw.map(item => [item.date, item]));
  const now = Date.now();
  const out = [];
  for (let i = windowDays - 1; i >= 0; i--) {
    const dt = new Date(now - i * 86400000);
    let iso = '';
    try { iso = tehranCaFmt.format(dt); } catch { iso = dt.toISOString().slice(0, 10); }
    let shortDay = '';
    let faDate = iso;
    try {
      shortDay = tehranDayNumFmt.format(dt);
      faDate = tehranFaShortFmt.format(dt);
    } catch {
      shortDay = iso.slice(-2);
    }
    const match = byDate.get(iso);
    out.push({
      date: iso,
      faDate,
      shortDay,
      count: match ? match.count : 0,
      words: match ? match.words : 0,
      isToday: i === 0,
    });
  }
  return out;
}

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
    <div class="series-chart" id="series-strip"></div>
  `;
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
      const windowDays = (activePeriod==='month' || activePeriod==='all') ? 14 : 7;
      const slots = buildFixedCalendarSeries(windowDays);
      const totalInWindow = slots.reduce((sum, x) => sum + x.count, 0);
      if (totalInWindow === 0) {
        seriesStrip.innerHTML = `<div class="series-chart__head"><span>روند ${fa(windowDays)} روز اخیر</span><span class="series-chart__peak">بدون ثبت</span></div><div class="series-empty">هنوز درخواستی در این بازه ثبت نشده است</div>`;
        return;
      }
      const peak = Math.max(1, ...slots.map(x => x.count));
      const todaySlot = slots[slots.length - 1];
      const defaultReadout = `${todaySlot.faDate} (امروز): ${fa(todaySlot.count)} درخواست`;
      const colsHtml = slots.map((d, i) => {
        const pct = d.count > 0 ? Math.max(14, Math.round((d.count / peak) * 100)) : 0;
        const showLbl = windowDays <= 7 || i === 0 || i === slots.length - 1 || i % 3 === 0;
        const lblText = d.isToday ? 'امروز' : (showLbl ? d.shortDay : '');
        const tip = `${d.faDate}: ${fa(d.count)} درخواست · ${fa(d.words)} کلمه`;
        return `<button type="button" class="series-col${d.isToday ? ' is-today' : ''}${d.count === 0 ? ' is-zero' : ''}" data-tip="${esc(tip)}" aria-label="${esc(tip)}" title="${esc(tip)}"><span class="series-col__track"><span class="series-col__bar" style="height:${pct}%"></span></span><span class="series-col__lbl">${esc(lblText)}</span></button>`;
      }).join('');

      seriesStrip.innerHTML = `
        <div class="series-chart__head">
          <span>روند ${fa(windowDays)} روز اخیر</span>
          <span class="series-chart__peak" id="series-readout">${esc(defaultReadout)} · اوج ${fa(peak)}</span>
        </div>
        <div class="series-cols" data-cols="${windowDays}">${colsHtml}</div>
      `;

      const readout = seriesStrip.querySelector('#series-readout');
      seriesStrip.querySelectorAll('.series-col').forEach((col) => {
        const show = () => { if (readout && col.dataset.tip) readout.textContent = col.dataset.tip; };
        col.addEventListener('mouseenter', show);
        col.addEventListener('focus', show);
        col.addEventListener('click', () => {
          seriesStrip.querySelectorAll('.series-col.is-picked').forEach(x => x.classList.remove('is-picked'));
          col.classList.add('is-picked');
          show();
        });
      });
    }
  }
};

export const ensureReportUI = Dashboard.ensureReportUI.bind(Dashboard);
export const renderOverall = Dashboard.renderOverall.bind(Dashboard);
export const getPeriod = Dashboard.getPeriod.bind(Dashboard);
export const setPeriod = Dashboard.setPeriod.bind(Dashboard);
