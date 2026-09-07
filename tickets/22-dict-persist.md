# Ticket 22 — Dict persistence + prefs

## Question
دیکشنری شخصی کجا بماند که با QR و export هم سفر کند ولی کلیدها هرگز همراهش نیایند؟

## Scope — Seam: Storage
- فقط `js/modules/storage.js` و همین فایل تیکت
- `transcription`, `app.js`, منطق import/export موجود دست‌نخورده در رفتار.

## Files
- `js/modules/storage.js`
- `tickets/22-dict-persist.md` (این فایل)

## Spec
- `DICT_KEY = 'hamnegar.dict.v1'`؛ ورودی `{ from, to, enabled }`.
- `normalizeDictEntry`: trim، حذف خالی‌ها و `from === to`؛ `enabled` غایب یعنی true.
  `normalizeDict`: dedupe با `from` (اولی برنده)، سقف ۲۰۰ ورودی.
- `getDict()` → آرایه نرمال؛ خراب/غایب یعنی `[]`.
- `saveDict(arr)` → نرمال + persist، نرمال‌شده را برگرداند.
- `getPrefs()` یک کلید اضافه بگیرد: `dict: getDict()` (بقیه بایت‌به‌بایت).
  `importPrefs`: اگر `prefs.dict` آرایه بود از `saveDict` رد شود، وگرنه دیکشنری فعلی دست نخورد.
  خروجی export همچنان بدون هیچ ماده کلیدی.

## Acceptance
- `node --check` تمیز؛ round-trip persist؛ prefs round-trip شامل dict؛
  import بدون dict، dict فعلی را نگه دارد؛ سقف ۲۰۰.
- `git diff --check` تمیز؛ `hamnegar-reviewer` PASS.

## Type: task
