# Ticket 21 — 111: long-input empty fix (chunk guard)

## Question
ورودی طولانی به ابزارها چرا پاسخ خالی می‌دهد؟ (ریشه در پروب: سقف ثابت ۲۰۰۰ توکن +
برش وسط `<think>` + strip حریص که کل پاسخ را پاک می‌کند → throw خالی → ته‌کشیدن زنجیره.)

## Scope — Seam: Transcription
- فقط `js/modules/transcription.js` و همین فایل تیکت
- `storage`, `app.js`, `index.html`, `css`, زنجیره STT، رفتار ورودی کوتاه بایت‌به‌بایت.

## Files
- `js/modules/transcription.js` (`queryChat`, `queryPolishViaGemini`, `cleanPolishOutput`)
- `tickets/21-chunk-guard.md` (این فایل)

## Spec
- بودجه خروجی از طول ورودی مقیاس بگیرد نه ثابت ۲۰۰۰ — در `queryChat` (`max_tokens`)
  و `queryPolishViaGemini` (`maxOutputTokens`) با clamp بین ۲۰۰۰ و سقف مدل.
- سیگنال برش طول (`finish_reason === 'length'` / `finishReason === 'MAX_TOKENS'`)
  خطای متمایز «متن طولانی» بدهد، نه اینکه برش ناقص به‌عنوان نتیجه کامل قبول شود.
- strip حریص `cleanPolishOutput` باریک شود: بلوک `<think>` نابسته تهی فقط وقتی پاک شود
  که متن قابل‌استفاده قبلش باشد؛ هیچ‌وقت پاسخ را به `''` نرساند وقتی تنها عیب برش است.
- پیام‌های فارسی موجود و تایپ خطاها (`status`) حفظ شود؛ مسیر `app.js` دست نمی‌خورد
  (callerها خطای تایپ‌دار را از قبل به toast/status می‌برند).

## Acceptance
- `node --check` تمیز؛ ورودی کوتاه رفتار قبلی؛ ورودی طولانی یا نتیجه کامل یا خطای
  «متن طولانی» (نه «پالیش خالی برگشت» کاذب).
- `git diff --check` تمیز؛ `hamnegar-reviewer` PASS.

## Type: task
