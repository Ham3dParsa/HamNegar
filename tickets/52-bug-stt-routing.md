# Ticket 52 — BUG: مسیریابی STT (مدل بی‌provider، 401 تکراری، لیست zen)

## Question
مدل groq تک‌کلمه‌ای به google می‌رود، کلید خراب N بار 401 می‌سوزاند و لیست مدل‌ها ورودی‌های همیشه‌مرده دارد. چطور؟

## Scope — Seam: Transcription/chains (پس از 37)
- باگ‌ها: G3 (`polishTargetOf` fallback اشتباه برای id تک‌کلمه‌ای → باید `groq` مثل storage)، G7 (پرش از siblingهای هم‌provider پس از 401/403 همان کلید)، G4 (حذف ردیف‌های `muse-spark-*` همیشه-مرده از لیست).
- فایل‌ها: `transcription.js` (fallback + skip-same-provider)، `chains.js` (حذف seed zen).
- رفتار جدید: مسیریابی صحیح، بدون 401 تکراری، بدون ردیف مرده.

## Files
- `js/modules/transcription.js`، `js/modules/chains.js`
- `tickets/52-bug-stt-routing.md` (این فایل)

## Spec
- fallback مدل بی‌provider با `storage` یکسان شود (`groq`).
- پس از 401/403 یک provider، ورودی‌های بعدی همان provider در همان گذر skip شوند.
- ردیف‌های zen از `allFlowModels` حذف؛ هیچ fetch/btn zen نماند.

## Acceptance
- `node --check`؛ `git diff --check` تمیز.
- smoke: translate مدل تک‌کلمه‌ای با کلید groq؛ زنجیره دو-گوگلی با کلید خراب فقط یک 401؛ تب مدل‌ها بدون zen.
- `hamnegar-reviewer` PASS (بازبینی کامل). VERSION bump + CHANGELOG.

## Type: bugfix
## Wave: BUG-B · Track: BUG-A · Depends on: 37
