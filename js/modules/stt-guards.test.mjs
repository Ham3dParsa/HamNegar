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

const { stripTimecodes, scrubSecrets, stripUrlSecret } = await import('./format.js');
const { extractGeminiCandidate, audioFilenameForBlob } = await import('./transcription.js');

describe('stripTimecodes', () => {
  it('strips bracketed start timecode [00:00] سلام and [00:05]: سلام', () => {
    const r1 = stripTimecodes('[00:00] سلام');
    assert.equal(r1.text, 'سلام');
    assert.equal(r1.strippedCount, 1);

    const r2 = stripTimecodes('[00:05]: سلام');
    assert.equal(r2.text, 'سلام');
    assert.equal(r2.strippedCount, 1);
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

  it('strips phantom Latin, Persian, and Arabic-Indic timecodes', () => {
    const r1 = stripTimecodes('۰:۲۴ سلام');
    assert.equal(r1.text, 'سلام');
    assert.equal(r1.strippedCount, 1);

    const r2 = stripTimecodes('متن ٠۰:٠٥ پایان');
    assert.equal(r2.text, 'متن پایان');
    assert.equal(r2.strippedCount, 1);

    const r3 = stripTimecodes('00:15, سلام 01:02:03');
    assert.equal(r3.text, 'سلام');
    assert.equal(r3.strippedCount, 2);

    const r4 = stripTimecodes('00:05: سلام دنیا');
    assert.equal(r4.text, 'سلام دنیا');
    assert.equal(r4.strippedCount, 1);
  });

  it('preserves real spoken clock times, ranges, ZWNJ, and numeric ratios', () => {
    const r1 = stripTimecodes('ساعت ۱۲:۳۰ جلسه‌ داریم');
    assert.equal(r1.text, 'ساعت ۱۲:۳۰ جلسه‌ داریم');
    assert.equal(r1.strippedCount, 0);

    const r2 = stripTimecodes('[00:00] ساعت 10:15 جلسه‌ داریم');
    assert.equal(r2.text, 'ساعت 10:15 جلسه‌ داریم');
    assert.equal(r2.strippedCount, 1);

    const r3 = stripTimecodes('از ساعت ۱۰:۳۰ تا ۱۱:۴۵ جلسه داریم');
    assert.equal(r3.text, 'از ساعت ۱۰:۳۰ تا ۱۱:۴۵ جلسه داریم');
    assert.equal(r3.strippedCount, 0);

    const r4 = stripTimecodes('از ۹:۰۰ تا ۱۲:۳۰ در دفترم');
    assert.equal(r4.text, 'از ۹:۰۰ تا ۱۲:۳۰ در دفترم');
    assert.equal(r4.strippedCount, 0);

    const r5 = stripTimecodes('ساعت\u200C۱۰:۱۵ و ۸:۳۰ صبح و نسبت ۱:۲۰');
    assert.equal(r5.text, 'ساعت\u200C۱۰:۱۵ و ۸:۳۰ صبح و نسبت ۱:۲۰');
    assert.equal(r5.strippedCount, 0);

    const r6 = stripTimecodes('عدد 99:99 نامعتبر است');
    assert.equal(r6.text, 'عدد 99:99 نامعتبر است');
    assert.equal(r6.strippedCount, 0);
  });

  it('preserves indentation on untouched lines and URLs', () => {
    const url = 'https://example.com:8080/test';
    const r1 = stripTimecodes(url);
    assert.equal(r1.text, url);
    assert.equal(r1.strippedCount, 0);

    const r2 = stripTimecodes('[00:00] سلام\n  خط تورفته\nلینک: https://example.com:8080/test');
    assert.equal(r2.text, 'سلام\n  خط تورفته\nلینک: https://example.com:8080/test');
    assert.equal(r2.strippedCount, 1);
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

describe('scrubSecrets & stripUrlSecret', () => {
  it('scrubs Groq, OpenRouter, Google, Bearer, JWT, and query keys', () => {
    const dirty = 'key=gsk_abc123456789 sk-or-v1-deadbeef99 AIzaSyAbCdEfGhIjKlMnOp AQ.AbCdEf123456 Bearer secret_tok ?api_key=xyz123';
    const clean = scrubSecrets(dirty);
    assert.equal(clean.includes('gsk_abc'), false);
    assert.equal(clean.includes('sk-or-v1'), false);
    assert.equal(clean.includes('AIzaSy'), false);
    assert.equal(clean.includes('AQ.AbCd'), false);
    assert.equal(clean.includes('secret_tok'), false);
    assert.equal(clean.includes('xyz123'), false);
    assert.ok(clean.includes('[redacted]'));
  });

  it('strips query strings and hashes from custom base URLs', () => {
    assert.equal(stripUrlSecret('https://proxy.example.com/v1?token=secret#frag'), 'https://proxy.example.com/v1');
  });
});

describe('audioFilenameForBlob', () => {
  it('maps flac, aac, and empty-MIME File names accurately', () => {
    assert.equal(audioFilenameForBlob({ type: 'audio/flac' }), 'speech.flac');
    assert.equal(audioFilenameForBlob({ type: 'audio/aac' }), 'speech.aac');
    assert.equal(audioFilenameForBlob({ type: '', name: 'voice.m4a' }), 'speech.m4a');
    assert.equal(audioFilenameForBlob({ type: 'application/octet-stream', name: 'clip.FLAC' }), 'speech.flac');
    assert.equal(audioFilenameForBlob({ type: 'audio/webm;codecs=opus' }), 'speech.webm');
    assert.equal(audioFilenameForBlob({}), 'speech.webm');
  });
});
