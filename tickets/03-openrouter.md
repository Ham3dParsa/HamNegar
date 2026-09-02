# Ticket 03 — مدل‌های رایگان OpenRouter جایگزین جمینای

## Question
کدام مدل‌های رایگان OpenRouter در حد جمینای برای STT هستند و چطور اضافه شوند؟

## Scope — Seam: transcription (adapter جدید)
- فقط `js/modules/transcription.js` (adapter openrouter) + `css` نه
- وابستگی: Ticket 02 تمام شود

## Research done
- :free فقط via `chat/completions` با `input_audio`
- سه گزینه: `thinkingmachines/inkling-small:free`, `inkling:free`, `nvidia/nemotron-3-nano-omni:free` — 20 RPM, 50/1000 RPD

## Files
- `js/modules/transcription.js` — افزودن queryOpenRouter()
- `js/modules/storage.js` — کلید OPENROUTER_KEY

## Acceptance
- آداپتور OpenRouter با format wav/webm
- تست با 5 ثانیه صدا فارسی → متن برگردد

## Type: research + task
