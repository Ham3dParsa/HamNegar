# Ticket 45 — facade واحد گزارش مصرف (ref/usage)

## Question
پنج فراخوان باید رقص `Quota.render + Dashboard.renderOverall` را حفظ کنند و سه ماژول روی هم pass-through‌اند. چطور یک درِ واحد بسازیم بدون تغییر اعداد؟

## Scope — Seam: Usage reporting (`quota.js` عمیق‌شده)
- `js/modules/quota.js`: مالک `record(event)` و `renderUsage(container,{period})` (یا `renderReport`)؛ ریاضیات Stats جزئیات داخلی؛ `Dashboard.renderOverall` به view خصوصی/ادغام.
- هر ۵ محل فراخوان (`app.js` ×2، `settingsModal.js`، `chains.js`، `stagebar.js`) تک‌فراخوانی شوند.
- `fa` تکراری با تیکت 38 یکی شود (اگر 38 اول مرج شد فقط مصرف). همین فایل تیکت.

## Files
- `js/modules/quota.js`، `js/modules/dashboard.js`، `js/modules/stats.js` (فقط داخلی‌سازی، بدون تغییر ریاضی)، ۵ فایل فراخوان
- `tickets/45-ref-usage-facade.md` (این فایل)

## Spec
- اعداد گزارش (today/overall/series/رنگ/WPM) برای داده یکسان بایت‌به‌بایت همان.
- `stats.test.mjs` بدون تغییر سبز بماند.

## Acceptance
- `node --test js/modules/stats.test.mjs` سبز؛ `node --check`؛ `git diff --check` تمیز.
- smoke: strip سهمیه و گزارش مودال بعد از زنجیره/تنظیمات تازه‌اند (بدون stale).
- `hamnegar-reviewer` PASS. بدون VERSION bump.

## Type: task
## Wave: 2 · Track: REF-E · Depends on: 38 (fa واحد)
