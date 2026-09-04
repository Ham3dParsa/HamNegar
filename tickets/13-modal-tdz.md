# Ticket 13 — کرش نصب تازه: openModal قبل از lastModalFocus (TDZ)

## Question
روی پروفایل تازه (بدون کلید)، مودال تنظیمات خودکار باز نمی‌شود و خطای fresh-install در کنسول است. چرا؟

## Root cause (گزارش دو بازبین مستقل روی تیکت ۰۸، تأیید با `git show main:js/app.js`)
- `loadSettings()` اول صدا می‌شود و وقتی هیچ کلیدی نیست `openModal()` را صدا می‌کند.
- ولی `let lastModalFocus = null` چند خط پایین‌تر تعریف شده و `openModal()` به آن assign می‌کند → ‏`ReferenceError` (TDZ) → مودال هرگز باز نمی‌شود.
- روی پروفایل دارای کلید دیده نمی‌شود (مسیر `else`).

## Scope — Seam: settings modal wiring
- فقط `js/app.js` (ترتیب تعریف/صدا: `lastModalFocus` قبل از `loadSettings()` یا گارد در `openModal`)
- بقیه سیم‌ها دست نخورد

## Spec
- جابه‌جایی حداقلی که ترتیب را درست کند، بدون تغییر رفتار (مودال همان‌موقع و همان‌طور باز شود).
- بدون تغییر `storage`/`transcription`/دیگر سیم‌ها.

## Files
- `js/app.js` (حوالی `loadSettings()` / `let lastModalFocus` / `openModal()`)

## Acceptance
- پروفایل تازه (localStorage خالی): مودال خودکار باز می‌شود، بدون خطای کنسول.
- پروفایل دارای کلید: بدون تغییر رفتار.
- `node --check` + `git diff --check` تمیز.

## Type: implement (bug)
