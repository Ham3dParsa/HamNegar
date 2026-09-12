# Ticket 54 — BUG: هسته ضبط (preview شبح، double-start، clear یتیم)

## Question
کنسل متن شبح به‌جا می‌گذارد، دابل‌کلیک میکروفون را یتیم می‌کند و Clear وسط ضبط بعداً متن را برمی‌گرداند. چطور؟

## Scope — Seam: Recording lifecycle (پس از 44 — در مالک جدید)
- باگ‌ها: R1 (revert پیش‌نمایش به `before+after` در همه مسیرهای پایانی)، R2 (گارد `isRecording` همگام + بستن stream قبلی در `Audio.start`)، R3 (Clear باید stop کامل + bump نسخه باشد)، R8 (شروع ساعت از قبل از `getUserMedia` — فقط accounting).
- فایل‌ها: `recording.js` (مالک جدید تیکت 44)، `audio.js` (گارد/rollback)، `app.js` (Clear).
- رفتار جدید: کنسل واقعاً کنسل؛ بدون میکروفون یتیم؛ Clear نهایی.

## Files
- `js/modules/recording.js`، `js/modules/audio.js`، `js/app.js` (فقط Clear)
- `tickets/54-bug-recording-core.md` (این فایل)

## Spec
- همه مسیرهای پایانی (cancel/empty/abort/error) خروجی را به `snap.before+snap.after` برگردانند.
- شروع دوم همگام بلاک شود؛ stream قبلی بدون صاحب نماند.
- Clear حین ضبط/ترنسکرایب = توقف کامل + بی‌اعتبار شدن snap درپرواز.

## Acceptance
- `node --check`؛ `git diff --check` تمیز.
- smoke: کنسل حین realtime، دابل‌کلیک میک، Clear وسط ضبط و وسط transcribe.
- `hamnegar-reviewer` PASS (بازبینی کامل). VERSION bump + CHANGELOG.

## Type: bugfix
## Wave: BUG-C · Track: BUG-C · Depends on: 44
