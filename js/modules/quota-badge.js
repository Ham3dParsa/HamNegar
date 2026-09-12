// Module: quota-badge (ticket 38) — single worst-color rule for quota indicators.
// Interface: worstOf(summary) -> 'err' | 'warn' | '' (dot/badge class suffix).
// Depth: hides the danger=3 / warn-orange=2 / warn=1 ranking shared by the
// app.js quota strip and the pill quota dot. Output mapping is unchanged:
// danger -> 'err', warn-orange|warn -> 'warn', anything else -> ''.
export function worstOf(summary){
  let worst = 0;
  for (const m of (summary?.byModel || [])){
    const r = m.color === 'danger' ? 3 : m.color === 'warn-orange' ? 2 : m.color === 'warn' ? 1 : 0;
    if (r > worst) worst = r;
  }
  return worst >= 3 ? 'err' : worst >= 1 ? 'warn' : '';
}
