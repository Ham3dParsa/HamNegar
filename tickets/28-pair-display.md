# Ticket 28 — provider/model pair display in transcription logs

## Question
نام ارائه‌دهنده تنها کافی نیست (دستور مالک). چطور همه‌جا جفت `providerId/modelId`
دیده شود بدون اینکه شکل لاگ‌ها به‌هم بریزد؟

## Scope — Seam: Transcription
- فقط `js/modules/transcription.js` و همین فایل تیکت
- `storage.js`, `app.js`, رفتار شبکه و زنجیره دست‌نخورده.

## Files
- `js/modules/transcription.js` (رشته‌های نمایشی لاگ/استاتوس همان خط‌ها)
- `tickets/28-pair-display.md` (این فایل)

## Spec
- هر جا لاگ، استاتوس یا بج، مدل یا ارائه‌دهنده را جدا نشان می‌دهد
  (`groq` تنها، `Flash` تنها، شناسه خام مدل)، به شکل `providerId/modelId` دربیاید،
  مثل `groq/qwen3.6-27b` و `google/gemini-flash-lite-latest`.
- فقط رشته نمایشی؛ هیچ تغییری در منطق انتخاب، fallback، کلید و endpoint.
- بیرون اسکوپ (مستند): `listModels`/`testGroq`/`testGemini` چون تک‌مدل ندارند جفت نمی‌شوند؛
  داک پیشرفت (`logger.js`، قرص‌های STT) هم سیم جدا دارد و تیکت بعدی است.
- اگر همان خط از `STT_DISPLAY_NAMES` یا helper نمایشی استفاده می‌کند، همان‌جا متمرکز شود
  (یک تابع `pairLabel(providerId, model)` و استفاده در همه خط‌ها) تا دوباره پخش نشود.

## Acceptance
- `node --check` تمیز؛ smoke با stub: خروجی لاگ‌ها شامل `/` جفتی باشد و هیچ
  ارائه‌دهنده‌تنهایی در مسیرهای STT/polish/translate نماند.
- `git diff --check` تمیز؛ `hamnegar-reviewer` PASS.

## Type: task
