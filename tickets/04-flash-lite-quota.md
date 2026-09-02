# Ticket 04 — پشتیبانی flash-lite و سهمیه بیشتر

## Question
آیا flash-lite سهم بیشتری می‌دهد و چطور فعال شود؟

## Scope — Seam: quota + transcription
- `js/modules/quota.js:6` LIMITS
- `js/modules/transcription.js` مدل انتخاب
- `index.html` select

## Research done
- lite از generateContent پشتیبانی می‌کند (1M context)
- سهم: lite 30 RPM / 1500 RPD / 1M TPM vs flash 10/500/250K

## Acceptance
- select شامل gemini-2.5-flash-lite, gemini-3.1-flash-lite
- Quota کارت‌ها اعداد درست
- تست: انتخاب lite → transcribe اوکی

## Type: task
