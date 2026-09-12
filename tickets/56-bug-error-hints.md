# Ticket 56 — BUG: راهنمای خطا (autocopy، hint، تست‌ها)

## Question
کلیپ‌برد خالی با toast موفقیت، hint «کلید/اینترنت» برای timeout و خروجی خالی، و تست‌های settings بدون نگاشت hint. چطور؟

## Scope — Seam: Error taxonomy consumers (پس از 43)
- باگ‌ها: R6 (toast موفقیت فقط پس از کپی واقعی؛ در شکست toast خطا)، E1 (نگاشت hint برای 408/413/EMPTY/0 در `app.js:840`)، E6 (خطای typed در `testGroq/testGemini` + نگاشت hint در هندلرها).
- فایل‌ها: `app.js` (hint + autocopy هر دو پوسته؟ pill هم R6 دارد → `pill.js`)، `transcription.js` (typed در testها — اگر 43 نکرده).
- رفتار جدید: هر شکست، راهنمای درست خودش را نشان بدهد.

## Files
- `js/app.js`، `js/modules/pill.js`، `js/modules/transcription.js` (حداقلی)
- `tickets/56-bug-error-hints.md` (این فایل)

## Spec
- `catch` خالی کلیپ‌برد حذف؛ موفقیت فقط پس از write واقعی.
- جدول hint: `429→سهمیه`، `404→مدل`، `401/403→کلید`، `408→تایم‌اوت`، `413→ورودی طولانی`، `EMPTY→خروجی خالی`، `0→شبکه`.
- testهای settings خطای `status`دار بدهند و از همان جدول hint استفاده کنند.

## Acceptance
- `node --check`؛ `git diff --check` تمیز.
- smoke: autocopy روی file://، transcribe با timeout/empty، تست Groq با کلید خراب.
- `hamnegar-reviewer` PASS (بازبینی کامل). VERSION bump + CHANGELOG.

## Type: bugfix
## Wave: BUG-B · Track: BUG-B · Depends on: 43
