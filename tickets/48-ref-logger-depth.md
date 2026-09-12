# Ticket 48 — تعمیق لاجر: فیلتر + بچینگ + toast نسلی (ref/logger)

## Question
نصف منطق دیده‌شدن لاگ در app.js است، هر خط یک layout اجباری می‌سازد و toastهای fallback روی هم می‌افتند. چطور همه پشت seam لاجر برود؟

## Scope — Seam: Logger (`js/modules/logger.js` فقط + حذف کد از `app.js`)
- `js/modules/logger.js`: `setFilter/toggleRunIsolation/resolveDisplayName` (انتقال `passes/applyFilters/buildFilterUI` از app.js)؛ بچینگ با DocumentFragment + فلاش rAF؛ ساخت خط با textContent؛ throttle روی scrollTop؛ آپدیت pillها درجا با `data-idx`؛ شمارنده نسل برای toast (F3-toast).
- `js/app.js`: فقط حذف کد منتقل‌شده + mount؛ هیچ منطق تازه‌ای نه.
- همین فایل تیکت.

## Files
- `js/modules/logger.js`، `js/app.js` (فقط حذف/سیم‌کشی)
- `tickets/48-ref-logger-depth.md` (این فایل)

## Spec
- فیلترها (level/query/run) و isolation خروجی یکسان قبل/بعد؛ progress دو-pill درجا به‌روز شود.
- toast جدید تایمر مخفی قبلی را باطل کند.

## Acceptance
- `node --check` هر دو؛ `git diff --check` تمیز.
- smoke: پنل لاگ + فیلترها + isolation؛ burst fallback و toastهای روی‌هم‌نیفتاده.
- `hamnegar-reviewer` PASS. بدون VERSION bump.

## Type: task
## Wave: 3 · Track: REF-E
