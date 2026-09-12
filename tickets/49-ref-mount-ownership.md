# Ticket 49 — مالکیت mountها: chains و waveTab (ref/mounts)

## Question
`chains.js` و `waveTab.js` استخراج verbatim با state قرضی از app.js‌اند و باگ در wiring پنهان می‌شود. چطور مالک واقعی شوند بدون تغییر رفتار؟

## Scope — Seam: App wiring (`chains.js` بعد `waveTab.js`، قدم‌به‌قدم)
- `js/modules/chains.js`: `mountChains(subsetEls)` بسازد/مالک DOM slice + chain state + persistence شود؛ فقط `{onRendered}` برگرداند؛ `app.js` تزریق `saveSettings/updateBadge/...` را رها کند.
- `js/modules/waveTab.js`: `mountWaveTab` مالک `waveCfg`/renderer lifecycle؛ `syncMain()` به‌جای گرفتن `getMainWave`.
- دو قدم جدا در یک تیکت (اول chains، بعد waveTab) ولی یک PR فقط اگر تداخل نداشت؛ وگرنه دو PR.
- همین فایل تیکت.

## Files
- `js/modules/chains.js`، `js/modules/waveTab.js`، `js/app.js` (فقط سیم‌کشی)
- `tickets/49-ref-mount-ownership.md` (این فایل)

## Spec
- ترتیب رندر و رفتار persistence زنجیره‌ها و تب موج در معنا همان؛ فقط مالکیت جابه‌جا می‌شود.
- هیچ getter/setter زنده بین app و ماژول‌ها نماند (grep `getSttChain|getMainWave` در `app.js` صفر).

## Acceptance
- `node --check` هر سه؛ `git diff --check` تمیز.
- smoke: تب مدل‌ها (toggle/جابه‌جایی/undo) + تب موج (اسلایدر/starter) بدون stale.
- `hamnegar-reviewer` PASS (بازبینی کامل: بزرگ‌ترین جابه‌جایی). بدون VERSION bump.

## Type: task
## Wave: 3 · Track: REF-F · Depends on: 37, 41, 46
