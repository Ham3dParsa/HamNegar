# Ticket 05 — آندو/ریدو 10 مرحله

## Question
دکمه‌های آندو/ریدو که 10 مرحله ذخیره کنند چطور بدون تداخل با لایو اضافه شوند؟

## Scope — Seam: storage + ui
- فقط `js/modules/storage.js` و `js/app.js` و `index.html` (دکمه‌ها)
- `transcription`, `audio` را دست نزن

## Spec
- storage: HISTORY_STACK (JSON array max 10), HIST_PTR
- pushHistory(text) — سقف 10، شاخه redo را ببر، debounce 800ms + push اجباری قبل هر transcribe و clear
- onInterim history ننویسد
- UI: دو دکمه کنار کپی/پاک (index.html:15), Ctrl+Z/Y
- undo()/redo() → output.value + saveDraft + updateCounts

## Files
- `js/modules/storage.js:39`
- `js/app.js:61` draft handling
- `index.html:15` toolbar
- `css/app.css` استایل دکمه

## Acceptance
- 10 تایپ → 10 undo برگردد
- بعد undo تایپ جدید → redo branch پاک
- لاگ history نریزد

## Type: task
