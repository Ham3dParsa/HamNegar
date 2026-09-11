# Ticket 34 — Pill collapsed circle + record (no existing files touched)

## Question
قرص شناور واقعی (نه ماکت) که ضبط کند، بدون اینکه به هیچ فایل موجود دست بزنیم
(همسایه روی `app.js` است)؟

## Scope — Seam: Storage (fav key only) + new files
- فقط فایل‌های تازه: `pill.html`، `pill.css`، `js/modules/pill.js`
  و `js/modules/storage.js` (فقط `getFavTools/saveFavTools` برای تیکت ۳۵؛ اگر اضافه‌ست، همین‌جا)
  و همین فایل تیکت
- `index.html`، `css/app.css`، `js/app.js` و بقیه ماژول‌ها: صفر تغییر (read-only import).

## Files
- `pill.html`, `pill.css`, `js/modules/pill.js` (new)
- `js/modules/storage.js` (فقط fav key، الگوی dict)
- `tickets/34-pill-mode.md` (این فایل)

## Spec (from locked-decision + owner: A-animation, cancel, fav)
- دایره ۶۴px قابل‌درگ، RTL، Vazirmatn، توکن‌های `--bg/--accent/...` (کپی مقادیر، نه import از app.css).
- حالت‌ها: idle آبی → recording قرمز با پالس A + تایمر فارسی + موج زنده
  (موتور `wave.js` + `Audio.getAnalyser()`) → sending کهربایی → ok سبز / خطا قرمز + toast.
- دکمه کنسل (حین ضبط و ارسال) + Esc = کنسل؛ M = تاگل میک؛ H = پنهان/نمایش.
- ضبط واقعی: `Audio.start/stop` + `Transcription.transcribe` + زنجیره STT موجود؛
  بج موتور `providerId/modelId`؛ نقطه سهمیه از `Quota` (فقط خواندن).
- نتیجه در حباب کوچک + کپی خودکار (autocopy موجود)؛ پنل ابزارها تیکت ۳۵ است، نه اینجا.
- هرگز فوکوس نمی‌دزدد (در وب: بدون `focus()` صریح؛ `focusable:false` مال Tauri بعداً).

## Acceptance
- `node --check` فایل‌ها؛ `git status` فقط ۴-۵ فایل تازه/موردنظر؛
  smoke مرورگر واقعی: ضبط با میک (اگر میک نبود: گارد خطای تمیز)، کنسل، تایمر، بج جفتی.
- `hamnegar-reviewer` PASS. رفتار تازه → VERSION + CHANGELOG در همین PR.

## Type: task
