# Ticket 44 — چرخه ضبط واحد برای app و pill (ref/recording)

## Question
دو خط لوله کامل ضبط→رونویسی→درج که روی گیت کلید واگرا شده‌اند. چطور یکی شود بدون اینکه تفاوت درج (ویرایشگر در برابر حباب) از دست برود؟

## Scope — Seam: Recording lifecycle (جدید `js/modules/recording.js`)
- `js/modules/recording.js` (جدید): مالک key-gate (مصرف واسط تیکت 37)، تایمر، `Audio.start/stop`، `Transcription.transcribe`، discard/abort، duration؛ واسط = `onText(text,engine)` + status sink.
- `js/app.js` و `js/modules/pill.js`: فقط adapter نازک (تزریق `onText` و sink)؛ منطق مشترک حذف شود.
- همین فایل تیکت. ترتیب حالت‌ها `idle|recording|sending|success|error` در معنا دست‌نخورده.

## Files
- `js/modules/recording.js` (جدید)، `js/app.js`، `js/modules/pill.js`
- `tickets/44-ref-recording.md` (این فایل)

## Spec
- گیت کلید هر دو پوسته دقیقاً همان خروجی واسط provider را مصرف کند (پایان واگرایی سه‌نسخه‌ای).
- `blob.size<800`، `discardRecording`، تایمر ۲۵۰ms+ارقام فارسی، autocopy و quota-refresh در مالک واحد.

## Acceptance
- `node --check` هر سه؛ `git diff --check` تمیز.
- smoke هر دو پوسته: ضبط موفق، لغو، keyless، blob کوچک؛ درج app در ویرایشگر و pill در حباب.
- `hamnegar-reviewer` PASS (بازبینی کامل: رفتار مرزی keyless). بدون VERSION bump مگر رفتار عوض شده باشد.

## Type: task
## Wave: 2 · Track: REF-D · Depends on: 37
