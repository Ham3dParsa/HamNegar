// Module: format (ticket 38) — single home for text helpers.
// Interface: fa(v) (Persian digits), esc(s) (HTML-escape, union of prior variants).
// Depth: hides the digit map + DOM-based escaping behind two pure functions.
// `fa` is the exact quota.js regex; `esc` is the chains.js variant (textContent
// + quote-escape), so output is identical-or-safer for all 4 prior variants.
export function fa(v){ return String(v).replace(/\d/g, d=>'۰۱۲۳۴۵۶۷۸۹'[d]); }
export function esc(s){ const d=document.createElement('div'); d.textContent=s; return d.innerHTML.replace(/"/g,'&quot;'); }
