# Ticket 10 — نگهبان خروجی پالیش + لاگ جدای لایه متنی

## Question
مدل متنی به‌جای متن، جمله متا («متن اصلی انگلیسی است و نیازی به ویرایش فارسی ندارد») برگرداند و جای متن اصلی نشست؛ و لایه پالیش در لاگ هیچ ردی ندارد. چرا؟

## Root cause
- `transcription.js:120` (پرامپت Gemini) و `:81` (سیستم پیش‌فرض): حالت «متن فارسی نیست» پوشش ندارد → مدل نظر می‌دهد.
- `transcription.js:127-128` — ‏مسیر Gemini برخلاف `queryChat` (:113) از `validatePolishOutput` رد نمی‌شود: نه گارد خالی/طول، نه گارد متا؛ خروجی خام مستقیم commit می‌شود (`:265`).
- سکوت لاگ: `queryChat` (:112) و `queryPolishViaGemini` (:126) فقط خطا را لاگ می‌کنند؛ مسیر موفق هیچ لاگی ندارد (برخلاف `Gemini raw` در STT).

## Scope — Seam: transcription (polish path only)
- فقط `js/modules/transcription.js` (پرامپت‌ها، `validatePolishOutput`، لاگ debug مسیر موفق)
- `audio`, `realtime`, `storage`, `logger`, `quota` را دست نزن

## Spec
- هر دو پرامپت: «اگر متن فارسی نیست یا اصلاحی لازم ندارد، عین متن را بدون هیچ کلمه اضافه برگردان؛ هرگز نظر یا توضیح نده.»
- `validatePolishOutput`: گارد meta-commentary (الگوهای «نیازی به ویرایش/اصلاح»، عذرخواهی، `as an AI`) → ‏`warn` + throw 500 تا فالبک بعدی یا قانون محلی؛ لاگ فقط برش ۱۲۰ کاراکتری، بدون کلید.
- مسیر Gemini هم از `validatePolishOutput` رد شود.
- لاگ debug مسیر موفق هر دو آداپتر با نام لایه (`<provider> polish raw` / `Gemini polish raw` + مدل و طول‌ها) تا با سرچ «polish» لایه جدا شود.

## Files
- `js/modules/transcription.js:75,81,113,115,120`

## Acceptance
- ورودی انگلیسی → خروجی پالیش عین ورودی (نه جمله متا)؛ ورودی متا → رد + فالبک/قانون محلی + warn در لاگ.
- سرچ «polish» در لاگ، درخواست/پاسخ لایه متنی را جدا نشان دهد.
- تست دستی توصیه‌شده (seam رونویسی): فایل ۵ثانیه فارسی + پیست لاگ.

## Type: implement
