# HamNegar Agent Guidance

برای عامل‌ها و مشارکت‌کنندگان هم‌نگار (تایپ صوتی فارسی).

## 1. ماژولار
هر دامنه یک ماژول عمیق: `storage`, `logger`, `quota`, `audio`, `realtime`, `transcription`. اینترفیس کوچک، پیاده‌سازی عمیق. یک تیکت فقط یک Seam را لمس کند.

## 2. ویترین
- `index.html` پوسته نازک، `css/app.css` جدا، `js/app.js` سیم‌کشی.
- فارسی با Vazirmatn، راست‌به‌چپ.

## 3. قرارداد
- تغییر دامنه قبل از کد: `grep -rn` روی `services` قدیم — اینجا روی `js/modules`.
- تست دستی: هر PR باید یک فایل صوتی 5 ثانیه فارسی را رونویسی کند و لاگ را پیست کند.

## 4. امنیت
- کلیدها فقط در `Storage` و هدر `x-goog-api-key`، هرگز در لاگ خام.
- `file://` بنر اجباری.

## 5. گیت
- برنچ `ticket/xx-desc`، کامیت Conventional Commits، `git add file` (نه `git add .` برای فایل‌های بزرگ)، PR به `main`.
