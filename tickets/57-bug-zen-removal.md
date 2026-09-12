# Ticket 57 — BUG: حذف بقایای zen از UI (کلید، تست، pill)

## Question
کلید zen هر ریلود می‌پرد، دکمه تستش همیشه TypeError می‌دهد و pillها stale می‌مانند. درستش حذف است نه تعمیر (zenspark purge شده). چطور؟

## Scope — Seam: Settings UI (پس از 37)
- باگ‌ها: S1 (ذخیره `zenKey` بی‌اثر — به‌جای slot، حذف مسیر zen)، E3 (`btn-test-zen` → تابع ناموجود)، E4 (pill id اشتباه `google` در برابر `#pill-gemini` + pill یتیم zenspark).
- فایل‌ها: `settingsModal.js` (حذف خوانش/ذخیره zen + فیکس id)، `index.html` (حذف `#pill-zenspark` + rename `#pill-gemini→#pill-google`؟ یا updater به id موجود — کم‌ریسک‌ترین)، `app.js` (حذف هندلر تست zen).
- رفتار جدید: هیچ اثری از zen در UI؛ pill گوگل با کلید به‌روز شود.

## Files
- `js/modules/settingsModal.js`، `js/app.js` (فقط هندلر)، `index.html` (فقط pillها)
- `tickets/57-bug-zen-removal.md` (این فایل)

## Spec
- `grep -in "zen" js/ index.html` فقط migrate/تست قرارداد بماند.
- pill گوگل با افزودن/حذف کلید به‌روز شود (smoke).

## Acceptance
- `node --check`؛ `git diff --check` تمیز.
- smoke: ورود/حذف کلید گوگل و pill؛ نبود هیچ ردیف/دکمه zen.
- `hamnegar-reviewer` PASS (بازبینی کامل). VERSION bump + CHANGELOG.

## Type: bugfix
## Wave: BUG-B · Track: BUG-A · Depends on: 37
