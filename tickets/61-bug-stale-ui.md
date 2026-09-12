# Ticket 61 — BUG: UI کهنه (خطای مدل‌ها، dot سهمیه، بنر file://)

## Question
خطای قدیمی fetch کنار لیست سالم می‌ماند، dot سهمیه روی 429 سبز می‌ماند و بنر file:// دقیقاً وقتی لازم است نمایش داده نمی‌شود. چطور؟ (بدون وابستگی — اول BUG-A)

## Scope — Seam: Small UI staleness (`chains.js` + `app.js`/`pill.js` + `index.html`)
- باگ‌ها: E7 (پاک‌شدن `dataset.failed` با هر رندر موفق/فیلتر — نه فقط fetch موفق)، R7 (refresh quota strip/dot در مسیر 429 هم)، E8 (shiv inline غیرماژول + CSS default-visible برای `#file-warning`).
- فایل‌ها: `chains.js` (E7)، `app.js` + `pill.js` (R7)، `index.html` (+CSS اگر لازم) برای E8.
- رفتار جدید: خطا فقط وقتی دیده شود که تازه باشد؛ dot همیشه صادق؛ بنر همیشه.

## Files
- `js/modules/chains.js`، `js/app.js`، `js/modules/pill.js`، `index.html`
- `tickets/61-bug-stale-ui.md` (این فایل)

## Spec
- E7: پرچم failed با رندر لیست تازه/فیلتر پاک شود؛ retry روی pid تازه گیت شود.
- R7: مسیر 429 هم `Quota.render/Dashboard.renderOverall/refreshQuotaDot` را صدا بزند.
- E8: بنر بدون اجرای هیچ ماژول JS دیده شود (shiv inline + CSS)؛ با لود موفق app مخفی شود.

## Acceptance
- `node --check`؛ `git diff --check` تمیز.
- smoke: fetch ناموفق→فیلتر، 429 واقعی، باز کردن با `file://` در کروم.
- `hamnegar-reviewer` PASS (بازبینی کامل). VERSION bump + CHANGELOG.

## Type: bugfix
## Wave: BUG-A · Track: BUG-D · Depends on: —
