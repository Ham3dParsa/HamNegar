# Ticket 12 — Muse Spark رایگان (Zen) فقط برای متن، نه گفتار

## Question
آیا می‌شود از `muse-spark-1.3-contributor-free` و `muse-spark-1.2-contributor-free` برای گفتار (STT) و متن (پالیش/ترجمه) استفاده کرد؟ کیفیت صوت فارسی‌شان چقدر است؟

## Research (2026-09-04, https://opencode.ai/docs/zen)
- اندپوینت این دو مدل `https://opencode.ai/zen/v1/responses` است — یعنی **Responses API**، نه `chat/completions` (مسیر فعلی `queryChat` با آن حرف نمی‌زند).
- هر دو **text-only** هستند (خانواده متنی Muse) — ورودی صوتی ندارند. سؤال «کیفیت صوت فارسی» منتفی است: برای STT **قابل استفاده نیستند**.
- رایگان‌اند ولی **contributor tier**: پرامپت و completionها برای آموزش مدل‌های بعدی متا استفاده می‌شود — باید در UI هشدار حریم خصوصی باشد.
- احراز هویت (فرض — تأیید با curl موقع پیاده‌سازی؛ اگر docs خلافش گفت آداپتر همان را دنبال کند): کلید Zen در هدر `Authorization: Bearer`.
- لیست مدل‌ها: `GET https://opencode.ai/zen/v1/models` (با کلید؛ در پیاده‌سازی با fallback دستی).

## Scope — Seam: transcription-provider (`zenspark`)
- `js/modules/transcription.js` (آداپتر Responses جدا، نه دست‌کاری `queryChat`)
- پشتیبان (established provider-add slice مثل تیکت‌های 03/07): کلید `zenKey` در `js/modules/storage.js` + `hasKeyForProvider('zenspark')` + کارت/تست/لیست در `index.html` و `js/app.js`
- `audio`, `realtime`, `logger`, `quota` را دست نزن
- پیش‌نیاز UI: Ticket 08 (نمایش در جریان یکپارچه) — آداپتر/استوریج می‌تواند زودتر بنشیند

## Spec
- آداپتر `queryResponsesText(text, {system, model, layer})`: `POST https://opencode.ai/zen/v1/responses` با `{model, input}` و کلید Zen؛ استخراج متن strict از شکل `output[]` (آیتم message با `output_text`)؛ شکل ناشناخته → لاگ debug پاسخ خام + throw 500 (همان مسیر فالبک)؛ خروجی از همان `validatePolishOutput(..., layer)` رد شود.
- مدل‌ها فقط t2t: اعتبارسنجی افزودن به زنجیره STT باید آن‌ها را رد کند (الگوی قانون `okStt` در easy-add)؛ مقصد polish/translate آزاد.
- تست اتصال: فراخوانی سبک (لیست مدل‌ها یا responses کوتاه) + پیام خطای فارسی.
- هشدار حریم خصوصی در کارت و hint: «رایگان contributor — متن‌ها برای آموزش استفاده می‌شود؛ حرف حساس نفرست.»
- لاگ با `layer` موجود (translate/polish)؛ هرگز کلید در لاگ.

## Files
- `js/modules/transcription.js` (آداپتر + سیم‌کشی `queryPolish` برای providerId `zenspark`)
- `js/modules/storage.js` (`zenKey`, `hasKeyForProvider`)
- `index.html` (کارت ارائه‌دهنده) + `js/app.js` (تست/لیست/افزودن)

## Acceptance
- پالیش فارسی با `muse-spark-1.3-contributor-free` از Zen جواب می‌دهد و لاگ لایه جدا دارد.
- افزودن به زنجیره STT رد می‌شود با پیام روشن.
- تست دستی توصیه‌شده: متن فارسی کوتاه → پالیش + پیست لاگ (بدون فایل صوتی — STT در کار نیست).

## Type: implement
