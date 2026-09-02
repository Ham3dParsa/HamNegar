# Ticket 02 — فالبک هوشمند با لیست ترجیحی

## Question
فالبک الان فقط Groq↔Gemini یک مرحله است. چطور چند گزینه ترجیحی را به ترتیب تست کند؟

## Scope — Seam: transcription
- فقط `js/modules/transcription.js` و `js/modules/storage.js` (خواندن تنظیمات)
- `audio`, `realtime` را دست نزن

## Files
- `js/modules/transcription.js:43-65`
- `js/modules/storage.js:19`

## Spec
- PREFERENCE = ['groq', 'gemini-flash-latest', 'gemini-2.5-flash-lite', 'openrouter/inkling-small:free'] (قابل تنظیم در settings)
- حلقه: هر مدل را try، بر اساس status تصمیم:
  - 401/403 → برو بعدی اگر کلید دارد، وگرنه throw
  - 404 → بعدی مدل
  - 429 → بعدی (با Retry-After اگر بود)
  - 400 blob کوتاه → throw بدون retry
  - 500/0/408 → retry همان موتور یک بار، بعد بعدی
- خطاها جمع و در Logger

## Acceptance
- تست: groq 429 → gemini-flash-latest اوکی
- تست: gemini 404 → lite اوکی
- لاگ همه تلاش‌ها

## Type: task
