# Ticket 32 — Wave tab extraction (arch 4/4)

## Question
آخرین تکه بزرگ `app.js`: تب موج و اسلایدرها و پیش‌نمایش‌ها و همگام‌سازی نوار اصلی.
آخرین استخراج معماری همین است.

## Scope — Seam: Logger/UI (vitrin region: wave only, ~218-808)
- `js/app.js` (فقط ناحیه wave: تب، اسلایدرها، استارترها/پیش‌نمایش زنده،
  فهرست و سراسری‌ها، mainWaveSync و waveEnsure و helperهای لمسی آن)
  و فایل تازه `js/modules/waveTab.js` + همین فایل تیکت
- موتور `wave.js`، `storage.js`، بقیه `app.js`، `index.html`، `css` دست‌نخورده.

## Files
- `js/app.js` (حذف ناحیه + import و فراخوانی نازک)
- `js/modules/waveTab.js` (new: verbatim + import/export)
- `tickets/32-wave-extract.md` (این فایل)

## Spec
- انتقال verbatim؛ وابستگی‌های بیرون ناحیه (els، میکروفون، ضبط، مدال) فقط با
  تزریق deps/getter زنده (الگوی تیکت ۲۹/۳۰/۳۱)؛ موتور `wave.js` مستقیم import.
- `app.js` فقط import + `mountWaveTab({...})` + فراخوانی نازک؛ بدون تعریف تکراری.
- شناسه‌های DOM در `index.html` موجود باشند؛ rAF و IntersectionObserver و
  reduced-motion و همگام‌سازی نوار اصلی preserved.

## Acceptance
- `node --check` هر دو؛ `git diff --check` تمیز؛ تعریف تکراری صفر؛
  smoke مرورگر (تب موج، اسلایدر، استارتر، نوار اصلی زنده) با کنسول تمیز.
- `hamnegar-reviewer` PASS. بدون VERSION bump (ریفکتور خالص).

## Type: task
