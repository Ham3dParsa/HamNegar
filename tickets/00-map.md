# Map — هم‌نگار تایپ صوتی

## Destination
نسخه پایدار تایپ صوتی با فالبک هوشمند چندگزینه‌ای، آندو/ریدو 10 مرحله، لاگ پولیش، بدون وابستگی به Live Transcribe ناکارآمد.

## Notes
- Stack: vanilla JS modules (storage, transcription, audio, realtime, quota, logger)
- Seam discipline: هر تیکت فقط یک ماژول اصلی را لمس کند تا تداخل نداشته باشد
- Live Transcribe (gemini-3.5-transcribe-live) فعلا out of scope — فقط Web Speech realtime نگه داشته شود

## Decisions so far
- [Flash-Lite تحقیق](01-flash-lite.md) — لایت از generateContent پشتیبانی می‌کند و سهم 3x بیشتر
- [OpenRouter تحقیق](02-openrouter.md) — :free فقط via chat/completions با inkling/nemotron
- [Audit کود](audit.md) — ریشه باگ لایو: گلوبال rt* و selEnd ثابت

## Not yet specified
- تست E2E برای فالبک

## Out of scope
- Live Transcribe streaming (WebSocket BidiGenerateContent) — فعلا بیخیال
