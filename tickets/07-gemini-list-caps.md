# Ticket 07 — لیست مدل‌های Google AI Studio + قابلیت دوگانه Gemini

## Question
مدل‌های Gemini برای متن‌به‌متن هم کار می‌کنند ولی اپ فقط STT اجازه می‌دهد و دکمه «دریافت لیست» برای Gemini وجود ندارد. چرا؟

## Root cause
- `js/modules/transcription.js:289` — ‏`listModels('gemini')` همیشه throw می‌کند («پشتیبانی نمی‌شود»).
- `js/app.js:675,691` — ‏easy-add برای gemini به ورودی دستی short-circuit می‌کند (چون listModels ندارد).
- `js/app.js:712` — ‏اعتبارسنجی target به اسم gemini گره خورده، نه به قابلیت واقعی.

## Scope — Seam: transcription + settings wiring
- `js/modules/transcription.js` (فقط `listModels`)
- `js/app.js` (فقط `refreshEasyModels`, `loadEasyModels`, اعتبارسنجی `btn-easy-add`, لیبل‌های نمایشی)
- شناسه `gemini` در Storage/زنجیره‌ها/پیش‌فرض‌ها دست نخورد (فقط نمایش → «Google AI Studio»)
- `audio`, `realtime`, `logger`, `quota` را دست نزن

## Spec
- `listModels('gemini')`: ‏`GET https://generativelanguage.googleapis.com/v1beta/models` با هدر `x-goog-api-key` (هرگز در لاگ خام)؛ نگاشت `j.models[].name` با حذف پیشوند `models/`؛ خطا با همان `parseErr/fmt`.
- حذف short-circuit ‏gemini در `refreshEasyModels`/`loadEasyModels` (لیست واقعی + همان fallback ورودی دستی).
- نمایش: «Google AI Studio»، راهنما «کلید را از aistudio.google.com بگیر» + لینک `https://ai.google.dev/gemini-api/docs/models`.
- مدل Gemini با رادیو مقصد به هر دو زنجیره STT و پالیش اضافه شود؛ قانون اسم-gemini فقط برای target=stt بماند.

## Files
- `js/modules/transcription.js:288`
- `js/app.js:667,689,706`

## Acceptance
- «دریافت لیست» برای Google AI Studio لیست واقعی برمی‌گرداند (با کلید معتبر).
- مدل `gemini-2.0-flash` هم به STT هم به پالیش اضافه می‌شود.
- تست دستی اجباری (seam رونویسی لمس شد): فایل ۵ثانیه فارسی → رونویسی + پیست لاگ.

## Type: implement (transcription seam)
