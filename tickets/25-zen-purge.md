# Ticket 25 — Zen purge + polish defaults (transcription)

## Question
ارائه‌دهنده‌ای به نام ذن دیگر وجود ندارد. چطور از سیم رونویسی کامل پاک شود و
پیش‌فرض پالیش از لیست واقعی و رایگان امروز بیاید؟

## Scope — Seam: Transcription
- فقط `js/modules/transcription.js` و همین فایل تیکت
- `storage.js`, `app.js`, زنجیره STT، بودجه/413، دیکشنری دست‌نخورده در رفتار.

## Files
- `js/modules/transcription.js`
- `tickets/25-zen-purge.md` (این فایل)

## Spec (قرارداد مشترک با تیکت ۲۴)
- حذف کامل: `queryResponsesText`، شاخه zen در `listModels`، `testZenspark`،
  شناسه‌های `muse-spark-*`، هر branch با `providerId === 'zenspark'`.
- `listModels(providerId)` برای شناسه ناشناس (از جمله zenspark باقی‌مانده در UI تا موج بعد)
  خطای تایپ‌دار 400 بدهد، نه crash — تا UI قدیمی graceful بماند.
- providerId کانونیک `google` در همه branchها (endpoint و هدر `x-goog-api-key` همان).
- حذف هاردکد بیخود: مدل‌های منسوخ خانواده 2/2.5 اگر لفظاً هستند، ارجاع قدیمی ذن،
  کامنت مرده. (`STT_DEFAULTS`/`POLISH_DEFAULTS` مال storage است — دست نزن.)
- پیش‌فرض پالیش از لیست زنده Groq امروز (رایگان): ترتیب
  `groq/openai-gpt-oss-120b`؟ نه — شناسه‌ها عین API:
  `openai/gpt-oss-120b`، `qwen/qwen3.8-27b`، `qwen/qwen3.6-27b`، `openai/gpt-oss-20b`
  — ولی این لیست در کجاست؟ اگر `POLISH_DEFAULTS` در storage است، اینجا فقط مصرف‌کننده بمان
  و چیزی هاردکد نکن. اگر لفظ مدل ذن یا لیست fallback داخل این فایل است، پاک شود.
- نمایش در لاگ همان خط به شکل `providerId/modelId` اگر با یک تغییر کوچک ممکن است؛
  بدون تغییر شکل لاگ‌های دیگر.

## Acceptance
- `node --check` تمیز؛ `grep -in "zen\|spark" ` در فایل صفر؛
  `listModels('zenspark')` خطای 400 تایپ‌دار بدهد نه crash؛
  مسیر groq/google/openrouter smoke شود (با stub، بدون کلید واقعی).
- `git diff --check` تمیز؛ `hamnegar-reviewer` PASS.

## Type: task
