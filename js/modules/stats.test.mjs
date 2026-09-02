import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// mock localStorage before importing Stats
global.localStorage = (() => {
  let s = {};
  return {
    getItem(k){ return s[k] ?? null; },
    setItem(k,v){ s[k]=String(v); },
    removeItem(k){ delete s[k]; },
    clear(){ s={}; },
    _dump(){ return {...s}; }
  };
})();

const { Stats, LIMITS } = await import('./stats.js');
const { Storage } = await import('./storage.js');

function reset(){
  global.localStorage.clear();
}

describe('LIMITS - live-transcribe حذف شده', ()=>{
  it('live-transcribe نباید در LIMITS باشد', ()=>{
    assert.equal('live-transcribe' in LIMITS, false);
  });
  it('LIMITS باید groq و gemini ها را داشته باشد', ()=>{
    assert.ok('groq' in LIMITS);
    assert.ok('gemini-flash-lite-latest' in LIMITS);
  });
});

describe('Stats.record و getSummary(today)', ()=>{
  beforeEach(reset);
  it('یک record باید byModel و totals را بسازد', ()=>{
    Stats.record({model:'groq', durationMs:60000, words:130, chars:600});
    const s = Stats.getSummary('today');
    assert.equal(s.totals.count, 1);
    assert.equal(s.totals.words, 130);
    assert.equal(s.totals.minutes, 1);
    assert.equal(s.byModel[0].model, 'groq');
    assert.equal(s.favorite.model, 'groq');
  });
  it('چند record مرتب DESC', ()=>{
    Stats.record({model:'groq', durationMs:30000, words:60, chars:300});
    Stats.record({model:'groq', durationMs:30000, words:60, chars:300});
    Stats.record({model:'gemini-flash-lite-latest', durationMs:30000, words:60, chars:300});
    const s = Stats.getSummary('today');
    assert.equal(s.byModel[0].model, 'groq');
    assert.equal(s.byModel[0].count, 2);
    assert.equal(s.byModel[1].count, 1);
  });
});

describe('رنگ آستانه ای', ()=>{
  beforeEach(reset);
  it('<60 سبز (none)', ()=>{
    Stats.record({model:'groq', durationMs:1000, words:10, chars:50});
    // groq rpd 2000 => 1/2000=0.05% => <60
    const s = Stats.getSummary('today');
    const m = s.byModel.find(x=>x.model==='groq');
    assert.equal(m.color, 'none');
    assert.equal(m.isNearLimit, false);
  });
  it('80-95 نارنجی', ()=>{
    // need 1700/2000=85%
    for(let i=0;i<1700;i++) Stats.record({model:'groq', durationMs:1000, words:1, chars:5});
    const s = Stats.getSummary('today');
    const m = s.byModel.find(x=>x.model==='groq');
    assert.equal(m.pct, 85);
    assert.equal(m.color, 'warn-orange');
  });
  it('>95 قرمز danger', ()=>{
    for(let i=0;i<1920;i++) Stats.record({model:'groq', durationMs:1000, words:1, chars:5});
    const s = Stats.getSummary('today');
    const m = s.byModel.find(x=>x.model==='groq');
    assert.equal(m.pct, 96);
    assert.equal(m.color, 'danger');
    assert.equal(m.isNearLimit, true);
  });
});

describe('avgWpm و savedMinutes', ()=>{
  beforeEach(reset);
  it('WPM درست', ()=>{
    Stats.record({model:'groq', durationMs:60000, words:130, chars:600});
    const s = Stats.getSummary('today');
    assert.equal(s.avgWpm, 130);
    assert.equal(s.savedMinutes, Math.round(130/40));
    assert.match(s.speedBoost, /3\.3/);
  });
});

describe('week/month/all', ()=>{
  beforeEach(reset);
  it('getSeries باید آرایه برگرداند', ()=>{
    Stats.record({model:'groq', durationMs:10000, words:20, chars:100});
    const series = Stats.getSeries(7);
    assert.ok(Array.isArray(series));
    assert.ok(series.length>=1);
  });
  it('week باید داده امروز را شامل شود', ()=>{
    Stats.record({model:'groq', durationMs:10000, words:20, chars:100});
    const w = Stats.getSummary('week');
    assert.equal(w.totals.count, 1);
  });
});

describe('migration از QUOTA_USAGE', ()=>{
  beforeEach(reset);
  it('اگر STATS_HISTORY خالی و QUOTA_USAGE پر است، migrate کند', ()=>{
    Storage.saveQuotaRaw({_date:'2026-09-01', groq:3, 'gemini-flash-lite-latest':1});
    const s = Stats.getSummary('today');
    const hist = Storage.getStatsHistory();
    assert.ok(Array.isArray(hist));
    assert.equal(hist.length, 1);
    assert.equal(hist[0].date, '2026-09-01');
    assert.equal(hist[0].counts.groq, 3);
    assert.equal(hist[0].counts['gemini-flash-lite-latest'], 1);
  });
});
