# Ticket 23 — Dict wiring into polish line

## Question
دیکشنری شخصی کی اعمال شود که همیشه بگیرد ولی وقتی خالی است رفتار ذره‌ای عوض نشود؟

## Scope — Seam: Transcription
- فقط `js/modules/transcription.js` و همین فایل تیکت
- `storage.js` (فایل)، `app.js`، زنجیره STT، بودجه/413 دست‌نخورده.

## Files
- `js/modules/transcription.js` (`textChain` فقط)
- `tickets/23-dict-wire.md` (این فایل)

## Spec
- در `textChain`، روی لایه `polish` (نه `translate`): بعد از validate موفق هر entry،
  خروجی از `applyPersonalDictionary(out, Storage.getDict())` رد شود و همان برگردد.
- دیکشنری خالی → تابع خالص no-op است؛ رفتار بایت‌به‌بایت.
- خواندن دیکشنری فقط از واسط عمومی `Storage.getDict()` (الگوی `getSettings` موجود).
- لاگ و پیام اضافه نه (قرارداد نمایش جفتی `providerId/modelId` در تیکت جدا می‌آید).

## Acceptance
- `node --check` تمیز؛ dict خالی → خروجی و مدل و خطا دقیقاً مثل قبل؛
  dict با «هم نگار»→«هم‌نگار» → در خروجی نهایی اعمال شده.
- `git diff --check` تمیز؛ `hamnegar-reviewer` PASS.

## Type: task
