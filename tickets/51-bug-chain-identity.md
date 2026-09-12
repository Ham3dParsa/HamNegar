# Ticket 51 — BUG: هویت زنجیره (gemini/google، :free، گیت بی‌provider)

## Question
مدل داخل زنجیره «افزودن» نشان می‌دهد، لیبل‌ها می‌پرند و گیت کلید UI با runtime فرق دارد. چطور با ریشه واحد درست شود؟

## Scope — Seam: Provider/chains (پس از 37)
- باگ‌ها: G1 (gemini در برابر google در `chainLoc`/dup)، G2 (`:free` strip در برابر label)، G8 (fallback گیت UI `groq` در برابر runtime)، S4 (همان ریشه G1 از لنز persist).
- فایل‌ها: `chains.js` (chainLoc/dup/label)، `transcription.js` (فقط `polishTargetOf` fallback یکتا)، `storage.js` (فقط اگر normalize کم دارد).
- رفتار جدید موردانتظار: عضویت، dedup، لیبل و گیت در UI و runtime یکسان.

## Files
- `js/modules/chains.js`، `js/modules/transcription.js`، `js/modules/storage.js` (حداقلی)
- `tickets/51-bug-chain-identity.md` (این فایل)

## Spec
- `chainLoc` و dup-check روی شناسه کانونیکال (پس از strip و migrate) مقایسه کنند.
- `labelOf` برای idهای stripشده همان لیبل `:free` را بدهد.
- fallback provider بی‌provider در UI و runtime یکتا شود (همان `polishTargetOf`).
- تست قرارداد: عضو تکراری با pid متفاوت اضافه نشود؛ گیت UI==runtime.

## Acceptance
- `node --check`؛ `git diff --check` تمیز.
- smoke: افزودن/حذف مدل gemini و `:free`، ریلود، گیت کلید صحیح.
- `hamnegar-reviewer` PASS (بازبینی کامل: رفتاری). VERSION bump + CHANGELOG (باگ‌فیکس رفتاری).

## Type: bugfix
## Wave: BUG-B · Track: BUG-A · Depends on: 37
