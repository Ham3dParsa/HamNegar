# Ticket 19 — Personal dictionary core (pure)

## Question
کاربر اسم‌ها و اصطلاح‌های خودش را می‌خواهد همیشه درست تایپ شود (مثل «هم نگار» → «هم‌نگار»).
چطور این را پشت یک واسط کوچک و خالص بگذاریم که بعداً به خط پالیش وصل شود؟

## Scope — Seam: Transcription
- فقط `js/modules/transcription.js` و همین فایل تیکت
- `storage`, `audio`, `realtime`, `quota`, `app.js`, `index.html` را دست نزن.
- هیچ call-siteای عوض نمی‌شود (سیم‌کشی به خط پالیش تیکت بعدی است، بعد از مرج 93).

## Files
- `js/modules/transcription.js` (افزودن تابع خالص، بدون دست‌زدن به fetch/زنجیره)
- `tickets/19-personal-dict.md` (این فایل)

## Spec
- `applyPersonalDictionary(text, entries)` خالص export شود:
  - `text` غیررشته‌ای → `String(text ?? '')`.
  - ورودی‌ها `{ from, to, enabled }`: trim، خالی‌ها حذف، `from === to` حذف،
    `enabled === false` رد شود. بقیه (غایب بودن enabled یعنی روشن).
  - مرتب‌سازی longest-`from`-first تا جایگزینی کوتاه، بلند را نبلعد.
  - جایگزینی literal سراسری (escape regex)، case-sensitive، بدون DOM و بدون I/O.
  - برگرداند `{ text, count }` (تعداد جایگزینی‌ها).
- هیچ خواندن/نوشتن storage، هیچ fetch، هیچ لاگ کلیدی.

## Acceptance
- `node --check js/modules/transcription.js` تمیز؛ رفتار transcribe موجود بایت‌به‌بایت.
- smoke: «هم نگار» → «هم‌نگار» با نیم‌فاصله؛ longest-first
  (دو ورودی هم‌پوشان، بلند برنده)؛ disabled رد شود؛ entries خالی متن را دست‌نخورده با count صفر برگرداند.
- `git diff --check` تمیز؛ `hamnegar-reviewer` PASS.

## Type: task
