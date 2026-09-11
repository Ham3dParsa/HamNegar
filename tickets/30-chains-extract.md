# Ticket 30 — Chains UI extraction (arch 2/4)

## Question
بعد از stagebar، بزرگ‌ترین تکه مانده در `app.js` همین زنجیره‌ها و کارت مدل‌هاست.
چطور بیرون برود بدون اینکه یک پیکسل رفتار عوض شود؟

## Scope — Seam: Logger/UI (vitrin regions: chains only)
- `js/app.js` (فقط سه ناحیه: ~181-481 preference chains UI + a11y،
  ~603-1071 models flow card + wiring + custom providers + manual id،
  ~1665-1745 per-chain inline add panels)
  و فایل تازه `js/modules/chains.js` + همین فایل تیکت
- settings wiring/modal، wave، بقیه `app.js`، `index.html`، `css` دست‌نخورده.

## Files
- `js/app.js` (حذف نواحی + import و فراخوانی نازک)
- `js/modules/chains.js` (new: کد منتقل‌شده verbatim + import/export)
- `tickets/30-chains-extract.md` (این فایل)

## Spec
- انتقال verbatim: منطق، ترتیب، رشته‌ها، aria، فوکوس بعد از mutation؛ فقط wrapper
  import/export و تزریق وابستگی (Storage/Transcription/Logger مستقیم import؛
  mutables مشترک app.js اگر هست با getter زنده، نه snapshot).
- `app.js` فقط import + فراخوانی نازک؛ هیچ تعریف تکراری نماند.
- همه شناسه‌های DOM مصرفی در `index.html` موجود باشند (قبل و بعد یکی).
- ترتیب listenerها و Esc و undo-حذف با بازگشت preserved.

## Acceptance
- `node --check` هر دو؛ `git diff --check` تمیز؛ `app.js` به‌وضوح سبک‌تر؛
  هیچ تابعی در هر دو فایل تعریف نشده باشد؛ smoke مرورگر (زبانه مدل‌ها، زنجیره‌ها، افزودن).
- `hamnegar-reviewer` PASS. بدون VERSION bump (ریفکتور خالص، بدون تغییر رفتار).

## Type: task
