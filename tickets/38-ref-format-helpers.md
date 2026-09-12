# Ticket 38 — هلپرهای متن و دام (ref/format)

## Question
`fa` در ۵ فایل، `esc` در ۴ نسخه ناسازگار، `$` در ۶ فایل و قانون بدترین‌رنگ در ۲ فایل کپی است. چطور یک خانه واحد بسازیم بدون تغییر رفتار؟

## Scope — Seam: Format/DOM utilities (جدید)
- `js/modules/format.js` (جدید): `fa`، `esc` (یک نسخه: اجتماع escapeها — امن‌ترین).
- `js/modules/dom.js` (جدید): `$`، `el`.
- `js/modules/quota-badge.js` (جدید): `worstOf(summary)->class`.
- جایگزینی مکانیکی در: `app.js`، `pill.js`، `quota.js`، `dashboard.js`، `chains.js`، `logger.js` (+ `stagebar.js`/`settingsModal.js`/`waveTab.js` فقط برای `$`).
- همین فایل تیکت. هیچ منطقی بازنویسی نشود.

## Files
- `js/modules/format.js`، `js/modules/dom.js`، `js/modules/quota-badge.js` (جدید) + فایل‌های مصرف‌کننده بالا
- `tickets/38-ref-format-helpers.md` (این فایل)

## Spec
- دقیقاً یک تعریف برای هر هلپر؛ import در همه مصرف‌کننده‌ها.
- `esc` نسخه اجتماع باشد (خروجی برای ورودی‌های قبلیِ هر ۴ نسخه یکسان یا امن‌تر).
- قانون رنگ `danger=3, warn-orange=2, warn=1` فقط در `worstOf`.

## Acceptance
- `grep` تعریف دوم `fa|esc|worst-color` در `js/` صفر؛ `node --check` تمیز؛ `git diff --check` تمیز.
- smoke: strip سهمیه، ارقام فارسی، رندر لاگ بدون تغییر بصری.
- `hamnegar-reviewer` PASS. بدون VERSION bump.

## Type: task
## Wave: 1 · Track: REF-B
