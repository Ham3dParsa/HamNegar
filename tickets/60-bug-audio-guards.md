# Ticket 60 — BUG: گاردهای صوتی (double-start، mic یتیم، VAD شبح)

## Question
دابل‌کلیک میکروفون stream را یتیم می‌کند، خطای میانی میک را باز می‌گذارد و VAD شبح ضبط بعدی را قطع می‌کند. چطور؟ (بدون وابستگی — اول BUG-A)

## Scope — Seam: Audio guards (`audio.js` + گاردهای فراخوان)
- باگ‌ها: T1 (گارد `isRecording`/in-flight در `startRecording` + بستن stream قبلی در `Audio.start`)، T2 (گارد pending در mic-test موج)، T3 (rollback با try/finally در `Audio.start` + `Audio.stop()` در catch فراخوان)، T4 (clear قبل از re-arm در `startVAD`)، T8 (hygiene: disconnect + close awaited + ref تازه).
- فایل‌ها: `audio.js` (عمده)، `app.js` (گاردها)، `waveTab.js` (mic-test).
- رفتار جدید: هرگز بیش از یک stream زنده؛ هرگز mic بازِ بی‌UI.

## Files
- `js/modules/audio.js`، `js/app.js` (گاردها)، `js/modules/waveTab.js` (mic-test)
- `tickets/60-bug-audio-guards.md` (این فایل)

## Spec
- `Audio.start` reentrant-safe: فراخوان دوم یا بلاک شود یا قبلی را تمیز ببندد.
- شکست میانی: همه trackها بسته + ctx بسته؛ فراخوان `Audio.stop()` را هم صدا بزند.
- `startVAD` تایمر قبلی را clear کند؛ `stop` سورس را disconnect و close را await کند.

## Acceptance
- `node --check`؛ `git diff --check` تمیز.
- smoke: دابل‌کلیک میک، دابل‌کلیک mic-test، شبیه‌سازی خطای MediaRecorder (stub)، VAD پس از double-start.
- `hamnegar-reviewer` PASS (بازبینی کامل). VERSION bump + CHANGELOG.

## Type: bugfix
## Wave: BUG-A · Track: BUG-D · Depends on: —
