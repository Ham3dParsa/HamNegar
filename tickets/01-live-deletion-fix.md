# Ticket 01 — فیکس لایو که متن قبلی را پاک می‌کند

## Question
چرا حالت آنی گاهی متن قبلی را کامل پاک می‌کند؟

## Answer needed
الگوریتم فعلی rtBefore/rtAfter گلوبال و selEnd ثابت است (app.js:58,89,92). دو ضبط پشت هم race می‌دهد.

## Scope — Seam: realtime + app orchestration
- فقط `js/app.js` و `js/modules/realtime.js`
- `storage`, `transcription`, `quota` را دست نزن

## Files
- `js/app.js:88-96` onInterim
- `js/app.js:118-135` start/stop
- `js/app.js:145` handleTranscription
- `js/modules/realtime.js:15`

## Acceptance
- اسنپ‌شات به صورت closure پاس شود، نه گلوبال قابل بازنویسی
- دو ضبط پشت هم نهایی‌سازی را دوبار ننویسد (id/version)
- ویرایش دستی وسط ضبط پاک نشود یا diff-merge شود

## Type: task — AFK
