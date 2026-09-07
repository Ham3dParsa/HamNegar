# Ticket 27 — Dict coverage in transcribe loop (W2 follow-up)

## Question
خروجی نهایی STT که از حلقه داخلی polish می‌گذرد چرا دیکشنری نگیرد؟ (هشدار W2 ریویو #122.)

## Scope — Seam: Transcription
- فقط `js/modules/transcription.js` و همین فایل تیکت
- `storage.js`, `app.js`, زنجیره STT، بودجه/413 دست‌نخورده در رفتار.

## Files
- `js/modules/transcription.js` (حلقه polish داخلی `transcribe` + `polishText` اگر همان الگوست)
- `tickets/27-transcribe-dict.md` (این فایل)

## Spec
- همان الگوی تیکت ۲۳: بعد از validate موفق، خروجی لایه polish از
  `applyPersonalDictionary(out, Storage.getDict())` رد شود؛ لایه translate هرگز.
- دیکشنری خالی → no-op بایت‌به‌بایت؛ بدون لاگ و پیام اضافه.
- اگر `polishText` مسیر جداست و همان قرارداد را می‌پذیرد، همان‌جا هم اعمال شود؛
  اگر شکلش فرق دارد، فقط `transcribe` و ذکر دلیل در گزارش.

## Acceptance
- `node --check` تمیز؛ smoke با stub: خروجی STT شامل «هم نگار» + dict ست‌شده →
  نهایی «هم‌نگار»؛ dict خالی → دقیقاً مثل قبل.
- `git diff --check` تمیز؛ `hamnegar-reviewer` PASS.

## Type: task
