# Ticket 59 — BUG: سیم abort رونویسی (لغو polish، sleep، تایم‌اوت testها)

## Question
کنسل حین polish تا ۲۵ ثانیه بی‌اثر است، sleepهای 429 جلوی shutdown را می‌گیرند و fetch مدل‌های custom/testها بی‌تایم‌اوت قفل می‌کنند. چطور؟

## Scope — Seam: Transcription abort (پس از 43)
- باگ‌ها: B1 (عبور signal به `queryChat/queryPolishViaGemini` + همه فراخوان‌ها)، B2 (sleep قطع‌پذیر + چک abort در حلقه polish؛ B8 گارد backoff ترمینال هم همین‌جا)، B5 (forwarder نام‌دار + حذف در `finally`)، B7 (تایم‌اوت 25s + signal برای branch دوم `listModels` و `testGroq/testGemini` + نگاشت 408)، B3 (حذف OR محیطی: فقط خود خطا معیار لغو باشد).
- فایل‌ها: `transcription.js` (عمده)، `app.js`/`pill.js` (فقط شرط `aborted` در B3).
- رفتار جدید: کنسل همیشه و سریع اثر کند؛ هیچ fetch بی‌تایم‌اوتی نماند.

## Files
- `js/modules/transcription.js`، `js/app.js` (B3)، `js/modules/pill.js` (B3)
- `tickets/59-bug-abort-wiring.md` (این فایل)

## Spec
- همه queryها `externalSignal` بپذیرند؛ همه sleepها `sleep(ms, signal)` باشند.
- `err.aborted === true` تنها معیار «لغو شد» در UI (نه state کنترلر).
- همه fetchها سقف 25s + `status:408` یکتا.

## Acceptance
- `node --check`؛ `git diff --check` تمیز؛ تست قرارداد cancel-mid-polish + timeout در `transcription.test.mjs`.
- smoke: کنسل حین polish/translate/429-sleep؛ settings با baseURL قفل.
- `hamnegar-reviewer` PASS (بازبینی کامل). VERSION bump + CHANGELOG.

## Type: bugfix
## Wave: BUG-C · Track: BUG-B · Depends on: 43
