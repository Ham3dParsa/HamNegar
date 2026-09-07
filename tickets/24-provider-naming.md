# Ticket 24 — Canonical provider ids (groq/google/openrouter)

## Question
«موتور gemini» حرف ما بود نه حرف توسعه‌دهنده. چطور شناسه‌ها کانونیک شود بدون اینکه کلید ذخیره‌شده هیچ کاربری بپرد؟

## Scope — Seam: Storage
- فقط `js/modules/storage.js` و همین فایل تیکت
- `transcription.js`, `app.js`, رفتار زنجیره‌ها دست‌نخورده در معنا.

## Files
- `js/modules/storage.js`
- `tickets/24-provider-naming.md` (این فایل)

## Spec (قرارداد مشترک با تیکت ۲۵)
- شناسه‌های کانونیک: `groq | google | openrouter` + شناسه‌های custom. `gemini`→`google`.
  `zenspark` کلاً حذف (ورودی‌های زنجیره‌اش در نرمالایز دور ریخته شوند).
- `KEYS` اسلات‌های groq/google/openrouter بایت‌به‌بایت — کلید ذخیره‌شده کاربر نباید بپرد
  (مقدار `KEY_GEMINI` حالا کلید `google` است، فقط providerId عوض می‌شود)؛
  فقط اکسسور `KEY_ZEN` حذف می‌شود و مقدار خامش یتیم می‌ماند (بدون delete مخرب).
- `BUILTIN_PROVIDER_IDS = ['groq','google','openrouter']`.
- `getProviders()`: `{id:'google', name:'Google', ...}`؛ هیچ ردیفی برای zenspark.
- `hasKeyForProvider('google')` جایگزین `'gemini'`؛ صدای legacy `'gemini'` هم قبول شود
  (map به google) تا کالرهای قدیمی تا موج UI نشکنند.
- `inferSTTProviderId`: `groq`→`groq`، `^gemini`→`google`، `:free`→`openrouter`.
- `STT_DEFAULTS` همان مدل‌ها با provider درست: groq + سه‌تای lite روی google.
- `POLISH_DEFAULTS` از لیست زنده Groq امروز (همه رایگان، بهتر به‌اول):
  `openai/gpt-oss-120b`، `qwen/qwen3.8-27b`، `qwen/qwen3.6-27b`، `openai/gpt-oss-20b`
  هر چهارتا با `providerId: 'groq'`.
- ورودی‌های زنجیره ذخیره‌شده با providerId قدیمی در خواندن migrate شوند
  (`gemini`→`google`، `zenspark`→حذف) و با save بعدی تمیز persist شوند.

## Acceptance
- `node --check` تمیز؛ در فایل فقط دو لفظ مجاز از گذشته بماند:
  `migrateProviderId` (map legacy) و regex تشخیص نام مدل `^gemini`؛
  هیچ provider-literal دیگری از `zenspark`/`'gemini'`.
- smoke: زنجیره legacy با `gemini`/`zenspark` بعد migrate فقط google/groq بماند؛
  کلید ذخیره‌شده با همان localStorage key خوانده شود.
- `git diff --check` تمیز؛ `hamnegar-reviewer` PASS.

## Type: task
