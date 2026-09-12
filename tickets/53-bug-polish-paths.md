# Ticket 53 — BUG: مسیرهای پالیش (زنجیره خالی، بلع خطا)

## Question
حذف کل زنجیره پالیش فیکس‌های قطعی فارسی را هم می‌پرد و خطای polish دستی بی‌صدا گم می‌شود. چطور؟

## Scope — Seam: Transcription (پس از 43)
- باگ‌ها: G5 (زنجیره خالی باید مثل all-off رفتار کند: `ruleFixed` اعمال شود)، G6 (`polishText` باید لاگ + backoff ‏429 مثل بقیه مسیرها داشته باشد).
- فایل‌ها: `transcription.js` فقط.
- رفتار جدید: خالی == همه-خاموش؛ خطای polish دستی با شواهد لاگ.

## Files
- `js/modules/transcription.js`
- `tickets/53-bug-polish-paths.md` (این فایل)

## Spec
- گارد `407` طوری شود که زنجیره خالی هم وارد بلوک شود و `ruleFixed` بگیرد (یا صریحاً مستند اگر مالک خلافش را خواست — پیش‌فرض: اعمال).
- `polishText` در `catch` لاگ بزند و روی 429 backoff بگیرد (مثل `textChain`).

## Acceptance
- `node --check`؛ `git diff --check` تمیز؛ تست `transcription.test.mjs` برای هر دو.
- smoke: transcribe با زنجیره خالی در برابر همه-خاموش یکسان؛ polish دستی با 429/401 و لاگ قابل‌تشخیص.
- `hamnegar-reviewer` PASS (بازبینی کامل). VERSION bump + CHANGELOG.

## Type: bugfix
## Wave: BUG-B · Track: BUG-B · Depends on: 43
