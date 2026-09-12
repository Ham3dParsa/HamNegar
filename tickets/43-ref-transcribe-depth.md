# Ticket 43 — تعمیق رونویسی: runChain + abort + خطای typed (ref/transcription)

## Question
حلقه fallback سه‌تاست، Cancel حین polish بی‌اثر است، لیستنر abort نشت می‌کند، مسیرهای خطا دریفت دارند و `applyPersonalDictionary` خالص بی‌تست است. چطور یک‌جا پشت همان seam درست شود؟

## Scope — Seam: Transcription (`js/modules/transcription.js` فقط + تست)
- کمک‌تابع خصوصی `runChain(entries,{resolveKey,dispatch,onEmpty})`؛ متدهای عمومی فقط پیکربندی سیاست (A2).
- عبور `signal` از `queryChat/queryPolishViaGemini/textChain/translate/polishText/transcribe`؛ forwarder نام‌دار با حذف در `finally`؛ `sleep(ms, signal)` قطع‌پذیر (F1).
- هلپر خطای typed (همیشه `status`) + `isRetryableNext(status)` مشترک؛ typedکردن `test*/listModels` (F4).
- encode تکه‌ای `arrayBuffer→base64` بدون پیشوند data-URL + آزادسازی ref (D5-blob).
- `js/modules/transcription.test.mjs` (جدید، الگوی `stats.test.mjs`): dictionary + قرارداد abort/retry.
- همین فایل تیکت. رفتار موفق در معنا دست‌نخورده.

## Files
- `js/modules/transcription.js`، `js/modules/transcription.test.mjs` (جدید)
- `tickets/43-ref-transcribe-depth.md` (این فایل)

## Spec
- Cancel حین polish با `aborted:true` reject شود و fetch بعدی نیاید.
- `401→next`، `429→backoff یک‌بار` در STT و textChain یکسان؛ `polishText` دیگر catch برهنه نداشته باشد.
- `listModels('zenspark')` همان خطای 400 تایپ‌دار تیکت ۲۵ را بدهد.

## Acceptance
- `node --test js/modules/transcription.test.mjs` + `stats.test.mjs` سبز؛ `node --check`؛ `git diff --check` تمیز.
- smoke: transcribe موفق، لغو حین STT و حین polish، fallback 401/429 (با stub، بدون کلید واقعی).
- `hamnegar-reviewer` PASS (بازبینی کامل ساب‌ایجنت: تغییر رفتاری در مسیر لغو). بدون VERSION bump مگر رفتار موفق عوض شده باشد.

## Type: task
## Wave: 2 · Track: REF-D
