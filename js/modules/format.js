// Module: format (ticket 38) — single home for text helpers.
// Interface: fa(v) (Persian digits), esc(s) (HTML-escape, union of prior variants).
// Depth: hides the digit map + DOM-based escaping behind two pure functions.
// `fa` is the exact quota.js regex; `esc` is the chains.js variant (textContent
// + quote-escape), so output is identical-or-safer for all 4 prior variants.
export function fa(v){ return String(v).replace(/\d/g, d=>'۰۱۲۳۴۵۶۷۸۹'[d]); }
export function esc(s){ const d=document.createElement('div'); d.textContent=s; return d.innerHTML.replace(/"/g,'&quot;'); }

export function scrubSecrets(text){
  return String(text ?? '')
    .replace(/gsk_[A-Za-z0-9_-]{8,}/g, '[redacted]')
    .replace(/sk-or-(?:v1-)?[A-Za-z0-9_-]{8,}/g, '[redacted]')
    .replace(/AIza[0-9A-Za-z_-]{10,}/g, '[redacted]')
    .replace(/AQ\.[0-9A-Za-z._-]{10,}/g, '[redacted]')
    .replace(/eyJ[A-Za-z0-9_-]{8,}(?:\.[A-Za-z0-9_-]+)*/g, '[redacted]')
    .replace(/Bearer\s+\S+/gi, 'Bearer [redacted]')
    .replace(/([?&](?:key|api_key|apikey|token|access_token|secret)=)[^&\s"'<>]+/gi, '$1[redacted]');
}

export function stripUrlSecret(url){
  const raw = String(url ?? '').trim();
  if(!raw) return '';
  try{
    const u = new URL(raw);
    return u.origin + u.pathname;
  }catch{
    return scrubSecrets(raw.split(/[?#]/)[0]);
  }
}

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
  const M5 = '[0-5۰-۵٠-٥]';
  const SEP = '[:：]';
  const CLOCK = `${D}{1,2}${SEP}${M5}${D}(?:${SEP}${M5}${D})?`;
  const TIME = `${CLOCK}(?:[.,]${D}{1,3})?`;
  const E = '[\\s\\u200C()\\[\\]{}«»"\'“”‘’،,;.!؟?—–\\-…/\\\\|]';

  // 1. Protect URLs first
  let s = s0.replace(/https?:\/\/[^\s<>"'\])]+/gi, keep);

  let strippedCount = 0;

  // 2. Bracketed / parenthesized timecodes & ranges and SRT/VTT cue arrows (always timecodes)
  const RANGE_SEP = '(?:-->|->|→|[-–—]|تا|to)';
  const bracketRe = new RegExp(`\\[\\s*${TIME}(?:\\s*${RANGE_SEP}\\s*${TIME})?\\s*\\][:：،,]?`, 'g');
  const parenRe = new RegExp(`\\(\\s*${TIME}(?:\\s*${RANGE_SEP}\\s*${TIME})?\\s*\\)[:：،,]?`, 'g');
  s = s.replace(bracketRe, () => { strippedCount++; return ''; });
  s = s.replace(parenRe, () => { strippedCount++; return ''; });

  const cueRe = new RegExp(`(^|${E})${TIME}\\s*(?:-->|->|→)\\s*${TIME}[:：،,]?(?=${E}|$)`, 'g');
  s = s.replace(cueRe, (_, lead) => { strippedCount++; return lead; });

  // 3. Protect unbracketed spoken clock times/ranges, time-of-day expressions, and numeric ratios
  s = s.replace(new RegExp(`(?:از|بین)[\\s\\u200C]+(?:ساعت(?:[\\s\\u200C]*${SEP})?[\\s\\u200C]+)?${CLOCK}[\\s\\u200C]*(?:تا|الی|و|[-–—])[\\s\\u200C]*${CLOCK}`, 'g'), keep);
  s = s.replace(new RegExp(`${CLOCK}[\\s\\u200C]+(?:تا|الی)[\\s\\u200C]+${CLOCK}`, 'g'), keep);
  s = s.replace(new RegExp(`ساعت(?:[\\s\\u200C]*${SEP})?[\\s\\u200C]*${CLOCK}`, 'g'), keep);
  s = s.replace(new RegExp(`${CLOCK}[\\s\\u200C]+(?:صبح|ظهر|بعدازظهر|بعد[\\s\\u200C]+از[\\s\\u200C]+ظهر|عصر|غروب|شب|بامداد|نصفه‌شب|AM|PM|am|pm)\\b`, 'g'), keep);
  s = s.replace(new RegExp(`(?:نسبت|ضریب)[\\s\\u200C]+${D}{1,2}${SEP}${D}{1,2}`, 'g'), keep);

  // 4. Unbracketed HH:MM:SS or MM:SS.ms anywhere
  const longTime = `${D}{1,2}${SEP}${M5}${D}${SEP}${M5}${D}(?:[.,]${D}{1,3})?`;
  const msTime = `${D}{1,2}${SEP}${M5}${D}[.,]${D}{1,3}`;
  const longRe = new RegExp(`(^|${E})(?:${longTime}|${msTime})[:：،,]?(?=${E}|$)`, 'g');
  s = s.replace(longRe, (_, lead) => { strippedCount++; return lead; });

  // 5. Short MM:SS at line start/end (e.g. "00:05: سلام") or zero-prefixed phantom markers (e.g. "0:24", "00:15")
  const lineEdgeRe = new RegExp(`(^|\\n)([ \\t]*)${CLOCK}[:：،,]?(?=[ \\t]+|\\n|$)`, 'g');
  s = s.replace(lineEdgeRe, (_, br, indent) => { strippedCount++; return br + indent; });
  const lineTrailRe = new RegExp(`([ \\t]+)${CLOCK}[،,]?(?=\\n|$)`, 'g');
  s = s.replace(lineTrailRe, () => { strippedCount++; return ''; });
  const zeroMarkerRe = new RegExp(`(^|${E})[0۰٠]{1,2}${SEP}${M5}${D}[:：،,]?(?=${E}|$)`, 'g');
  s = s.replace(zeroMarkerRe, (_, lead) => { strippedCount++; return lead; });

  // Restore protected spans
  s = s.replace(/\uE000(\d+)\uE001/g, (_, i) => kept[+i]);

  if(strippedCount === 0) return { text: s0, strippedCount: 0 };

  const origLines = s0.split('\n');
  s = s
    .split('\n')
    .map((line, i) => (line === origLines[i] ? line : line.replace(/[ \t]{2,}/g, ' ').trim()))
    .filter((line, i, arr) => line !== '' || (i > 0 && i < arr.length - 1 && arr[i - 1] !== ''))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return { text: s, strippedCount };
}
