// Module: format (ticket 38) — single home for text helpers.
// Interface: fa(v) (Persian digits), esc(s) (HTML-escape, union of prior variants).
// Depth: hides the digit map + DOM-based escaping behind two pure functions.
// `fa` is the exact quota.js regex; `esc` is the chains.js variant (textContent
// + quote-escape), so output is identical-or-safer for all 4 prior variants.
export function fa(v){ return String(v).replace(/\d/g, d=>'۰۱۲۳۴۵۶۷۸۹'[d]); }
export function esc(s){ const d=document.createElement('div'); d.textContent=s; return d.innerHTML.replace(/"/g,'&quot;'); }

export function stripTimecodes(text){
  const s0 = String(text ?? '');
  if(!s0 || (s0.indexOf(':') < 0 && s0.indexOf('：') < 0)) return { text: s0, strippedCount: 0 };

  const kept = [];
  const keep = (m) => {
    const idx = kept.length;
    kept.push(m);
    return `\uE000${idx}\uE001`;
  };

  const D = '[0-9۰-۹٠-٩]';
  const SEP = '[:：]';
  const TIME = `${D}{1,2}${SEP}${D}{2}(?:${SEP}${D}{2})?(?:[.,]${D}{1,3})?`;
  const E = '[\\s\\u200C()\\[\\]{}«»"\'“”‘’،,;.!؟?—–\\-…/\\\\|]';

  // Protect URLs and clock times preceded by «ساعت»
  let s = s0.replace(/https?:\/\/[^\s<>"'\])]+/gi, keep);
  s = s.replace(new RegExp(`ساعت(?:\\s*${SEP})?\\s+${D}{1,2}${SEP}${D}{2}(?:${SEP}${D}{2})?`, 'g'), keep);

  let strippedCount = 0;

  // 1. Bracketed or parenthesized timecodes / ranges
  const RANGE_SEP = '(?:-->|->|→|[-–—]|تا|to)';
  const bracketRe = new RegExp(`\\[\\s*${TIME}(?:\\s*${RANGE_SEP}\\s*${TIME})?\\s*\\][،,]?`, 'g');
  const parenRe = new RegExp(`\\(\\s*${TIME}(?:\\s*${RANGE_SEP}\\s*${TIME})?\\s*\\)[،,]?`, 'g');
  s = s.replace(bracketRe, () => { strippedCount++; return ''; });
  s = s.replace(parenRe, () => { strippedCount++; return ''; });

  // 2. SRT/VTT cue arrows
  const cueRe = new RegExp(`(^|${E})${TIME}\\s*(?:-->|->|→)\\s*${TIME}(?=${E}|$)`, 'g');
  s = s.replace(cueRe, (_, lead) => { strippedCount++; return lead; });

  // 3. Standalone timecodes
  const loneRe = new RegExp(`(^|${E})${TIME}[،,]?(?=${E}|$)`, 'g');
  s = s.replace(loneRe, (_, lead) => { strippedCount++; return lead; });

  // Restore protected spans
  s = s.replace(/\uE000(\d+)\uE001/g, (_, i) => kept[+i]);

  if(strippedCount === 0) return { text: s0, strippedCount: 0 };

  s = s
    .split('\n')
    .map((line) => line.replace(/[ \t]{2,}/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return { text: s, strippedCount };
}
