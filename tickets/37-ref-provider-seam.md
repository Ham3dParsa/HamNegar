# Ticket 37 — Seam هویت ارائه‌دهنده (ref/provider)

## Question
یک مفهوم (این ورودی زنجیره یعنی کدام ارائه‌دهنده و آیا کلید دارد؟) در سه ماژول سه نسخه دارد و `gemini` در برابر `google` واگراست. چطور یک مالک واحد بسازیم بدون اینکه کلید هیچ کاربری بپرد؟

## Scope — Seam: Provider identity (جدید `js/modules/provider.js`)
- `js/modules/provider.js` (جدید): `resolve(entry)->{providerId,model}`، `hasKey(entry)`، `displayPair(entry)`؛ مهاجرت `gemini→google` و حذف `zenspark` فقط اینجا.
- `js/modules/storage.js`: فقط مالک متریال کلید؛ inference تکراری حذف، به provider تفویض.
- `js/modules/transcription.js`: حذف `canonicalProviderId/hasKeyForProviderId` محلی، مصرف واسط.
- `js/modules/chains.js`: حذف `providerIdOf/hasKeyFor` محلی + ریل‌ها/دکمه‌های `zenspark`؛ `stagebar.js` و `settingsModal.js` فقط مصرف‌کننده.
- یادداشت قرارداد C3 (آینه `desktop/SttChain.cs`): همین تیکت فقط `ChainSpec` را مستند می‌کند، کد C# دست نمی‌خورد.
- همین فایل تیکت. رفتار transcribe/key-gate در معنا دست‌نخورده.

## Files
- `js/modules/provider.js` (جدید)، `js/modules/storage.js`، `js/modules/transcription.js`، `js/modules/chains.js`، `js/modules/stagebar.js`، `js/modules/settingsModal.js`
- `tickets/37-ref-provider-seam.md` (این فایل)

## Spec
- شناسه کانونیک همان قرارداد تیکت ۲۴: `groq|google|openrouter` + custom؛ `gemini→google`؛ `zenspark→dropped`.
- واسط ۳متده؛ هیچ فراخوان مستقیم `Storage.hasKeyForProvider` در UI نماند.
- `grep -in "zenspark" js/` فقط map مهاجرت + تست؛ لفظ `'gemini'` فقط در migrate و regex مدل.

## Acceptance
- `node --check` همه فایل‌ها؛ `git diff --check` تمیز.
- smoke: زنجیره legacy با `gemini`/`zenspark` فقط google/groq بماند؛ گیت کلید در STT و پالیش و بج‌ها یکسان.
- تست قرارداد: `normalizeSTTChain([{providerId:'gemini'}])→google`؛ `zenspark→dropped`.
- `hamnegar-reviewer` PASS. بدون VERSION bump (بدون تغییر رفتار).
- Rail-vocabulary note: نام‌های ریل/DOM (`gemini` در `flowProv`، `btnGeminiModels`، `provider-card-gemini`، `keyGemini`، `cache-gemini`) عمداً دست‌نخورده‌اند — واژگان فیلتر/نمایش‌اند و به `index.html` گره خورده‌اند (خارج از scope). همه منطق هویت کانونیک است: `fetchAndShowModels` ورودی rail را با `canonicalize()` به `google` می‌نگارد، `hasKeyFor` و `reset` با fallback کانونیک `'google'` کار می‌کنند.

## Type: task
## Wave: 1 · Track: REF-A
