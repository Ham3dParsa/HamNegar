import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// Mock localStorage before dynamically importing transcription.js
globalThis.localStorage = (() => {
  let store = {};
  return {
    getItem(k){ return store[k] ?? null; },
    setItem(k, v){ store[k] = String(v); },
    removeItem(k){ delete store[k]; },
    clear(){ store = {}; },
  };
})();

const { stripTimecodes } = await import('./format.js');
const { extractGeminiCandidate } = await import('./transcription.js');

describe('stripTimecodes', () => {
  it('strips bracketed start timecode [00:00] سلام', () => {
    const res = stripTimecodes('[00:00] سلام');
    assert.equal(res.text, 'سلام');
    assert.equal(res.strippedCount, 1);
  });

  it('strips bracketed ranges in Latin and Persian digits', () => {
    const r1 = stripTimecodes('[00:01 - 00:05] متن فارسی');
    assert.equal(r1.text, 'متن فارسی');
    assert.equal(r1.strippedCount, 1);

    const r2 = stripTimecodes('[۰۰:۰۱ تا ۰۰:۰۵] متن فارسی');
    assert.equal(r2.text, 'متن فارسی');
    assert.equal(r2.strippedCount, 1);

    const r3 = stripTimecodes('[01:02:03.45] شروع');
    assert.equal(r3.text, 'شروع');
    assert.equal(r3.strippedCount, 1);
  });

  it('strips parenthesized timecode (0:24) تست', () => {
    const res = stripTimecodes('(0:24) تست');
    assert.equal(res.text, 'تست');
    assert.equal(res.strippedCount, 1);
  });

  it('strips SRT/VTT cue arrows and preserves multi-line structure', () => {
    const r1 = stripTimecodes('00:00:01 --> 00:00:04\nسلام');
    assert.equal(r1.text, 'سلام');
    assert.equal(r1.strippedCount, 1);

    const r2 = stripTimecodes('00:01.200 --> 00:04.500\nخط اول\n\n00:05.000 --> 00:08.000\nخط دوم');
    assert.equal(r2.text, 'خط اول\n\nخط دوم');
    assert.equal(r2.strippedCount, 2);
  });

  it('strips standalone Latin, Persian, and Arabic-Indic timecodes', () => {
    const r1 = stripTimecodes('۰:۲۴ سلام');
    assert.equal(r1.text, 'سلام');
    assert.equal(r1.strippedCount, 1);

    const r2 = stripTimecodes('متن ٠١:٠٥ پایان');
    assert.equal(r2.text, 'متن پایان');
    assert.equal(r2.strippedCount, 1);

    const r3 = stripTimecodes('00:15, سلام 01:02:03');
    assert.equal(r3.text, 'سلام');
    assert.equal(r3.strippedCount, 2);
  });

  it('preserves real clock times preceded by ساعت', () => {
    const r1 = stripTimecodes('ساعت ۱۲:۳۰ جلسه‌ داریم');
    assert.equal(r1.text, 'ساعت ۱۲:۳۰ جلسه‌ داریم');
    assert.equal(r1.strippedCount, 0);

    const r2 = stripTimecodes('[00:00] ساعت 10:15 جلسه‌ داریم');
    assert.equal(r2.text, 'ساعت 10:15 جلسه‌ داریم');
    assert.equal(r2.strippedCount, 1);
  });

  it('preserves URLs and normal punctuation', () => {
    const url = 'https://example.com:8080/test';
    const r1 = stripTimecodes(url);
    assert.equal(r1.text, url);
    assert.equal(r1.strippedCount, 0);

    const r2 = stripTimecodes('مورد اول: سلام\nلینک: https://example.com:8080/test');
    assert.equal(r2.text, 'مورد اول: سلام\nلینک: https://example.com:8080/test');
    assert.equal(r2.strippedCount, 0);
  });

  it('reduces timecode-only output to empty string', () => {
    const res = stripTimecodes('00:00:01 --> 00:00:04');
    assert.equal(res.text, '');
    assert.equal(res.strippedCount, 1);
  });

  it('returns accurate strippedCount across mixed formats', () => {
    const res = stripTimecodes('[00:00] سلام (0:24)\n00:30 متن ۰:۴۵');
    assert.equal(res.text, 'سلام\nمتن');
    assert.equal(res.strippedCount, 4);
  });
});

describe('extractGeminiCandidate', () => {
  it('extracts normal visible part', () => {
    const out = extractGeminiCandidate({
      candidates: [{ content: { parts: [{ text: 'سلام دنیا' }] } }],
    });
    assert.equal(out.text, 'سلام دنیا');
    assert.equal(out.thoughtLen, 0);
    assert.equal(out.thoughtPreview, '');
  });

  it('separates thought parts from visible text', () => {
    const out = extractGeminiCandidate({
      candidates: [{
        content: {
          parts: [
            { thought: true, text: 'Let me transcribe carefully...' },
            { text: 'این یک آزمایش است' },
          ],
        },
      }],
    });
    assert.equal(out.text, 'این یک آزمایش است');
    assert.ok(out.thoughtLen > 0);
    assert.equal(out.thoughtPreview, 'Let me transcribe carefully...');
  });

  it('never leaks thought when visible text is empty', () => {
    const out = extractGeminiCandidate({
      candidates: [{
        content: {
          parts: [
            { thought: true, text: 'Internal reasoning only' },
          ],
        },
      }],
    });
    assert.equal(out.text, '');
    assert.ok(out.thoughtLen > 0);
    assert.equal(out.thoughtPreview, 'Internal reasoning only');
  });

  it('handles empty or missing candidates gracefully', () => {
    assert.deepEqual(extractGeminiCandidate({}), { text: '', thoughtLen: 0, thoughtPreview: '' });
    assert.deepEqual(extractGeminiCandidate({ candidates: [] }), { text: '', thoughtLen: 0, thoughtPreview: '' });
    assert.deepEqual(extractGeminiCandidate(null), { text: '', thoughtLen: 0, thoughtPreview: '' });
  });
});
