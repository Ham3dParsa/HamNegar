# Ticket 06 — پولیش لاگ و ریسایز واقعی

## Question
لاگ الان زمخت و ریسایز روی flex گیر می‌کند. چطور تمیز شود؟

## Scope — Seam: logger + ui
- فقط `css/app.css`, `js/modules/logger.js`, `js/app.js` (toggle)
- `transcription`, `storage` را دست نزن

## Spec
- لاگ: فیلتر سطح، سرچ، کپی انتخابی
- ریسایز: اسپلتر دستی به جای resize:vertical روی flex (drag handle بین output و log)
- ارتفاع در Storage ذخیره

## Files
- `css/app.css:61`
- `js/modules/logger.js`
- `js/app.js:50`

## Acceptance
- اسپلتر بکش → ارتفاع عوض، رفرش بماند
- فیلتر error فقط errorها

## Type: prototype
