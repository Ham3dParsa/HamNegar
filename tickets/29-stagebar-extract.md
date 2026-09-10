# Ticket 29 — Stagebar extraction (arch 1/4)

## Question
`app.js` سه هزار خط شده و هر تیکت UI همین یک فایل را می‌خواهد. چطور اولین تکه
(stagebar) بیرون برود بدون اینکه یک پیکسل رفتار عوض شود؟

## Scope — Seam: Logger/UI (vitrin region: stagebar block only)
- `js/app.js` (فقط بلوک stagebar ~2239-2412: SYS_*، stageScope، runStage/runTranslate، سیم‌کشی)
  و فایل تازه `js/modules/stagebar.js` + همین فایل تیکت
- بقیه `app.js`، `index.html`، `css`، ماژول‌های دیگر دست‌نخورده.

## Files
- `js/app.js` (حذف بلوک + import و فراخوانی نازک)
- `js/modules/stagebar.js` (new: کد منتقل‌شده verbatim + import/export)
- `tickets/29-stagebar-extract.md` (این فایل)

## Spec
- انتقال verbatim: منطق، ترتیب، رشته‌ها، aria و تایمرها عیناً؛ فقط wrapper import/export
  و تزریق وابستگی (Transcription/Logger/Storage را مثل app.js مستقیم import کن؛
  els را داخل ماژول با getElementById بگیر یا از caller بگیر — یک راه، نه هر دو).
- `app.js` بعدش فقط `import { mountStagebar }` (یا named exports) + یک خط فراخوانی؛
  هیچ کپی از توابع منتقل‌شده در `app.js` نماند (grep نام‌ها فقط در stagebar.js).
- همه شناسه‌های DOM مصرفی باید در `index.html` موجود باشند (قبل و بعد یکی).
- بدون تغییر رفتار: ترتیب listenerها، گارد race شیت دیف، مصرف Esc، undo اسلایسی.

## Acceptance
- `node --check` هر دو فایل؛ `git diff --check` تمیز؛
  `app.js` حداقل ۱۵۰ خط سبک‌تر؛ هیچ تابعی هم در app.js هم در stagebar.js تعریف نشده باشد؛
  smoke دستی در مرورگر (سه دکمه stage + ترجمه) یا گزارش دلیل اگر نشد.
- `hamnegar-reviewer` PASS.

## Type: task
