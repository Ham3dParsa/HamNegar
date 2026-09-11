# Ticket 33 — Dead wiring removal (reviewer-locked follow-ups)

## Question
دو خرده‌ریز ثبت‌شده در ریویوها: importهای مرده موج در `app.js` و سیم مرده `#prov-rail`.
چطور پاک شوند بدون هیچ اثر رفتاری؟

## Scope — Seam: Logger/UI (dead code only, two files)
- `js/app.js` (فقط خط ۲-۳ import: نگه‌داشتن `Storage, STT_DEFAULTS, POLISH_DEFAULTS`
  و `createWaveRenderer`؛ حذف بقیه نام‌های موج)
- `js/modules/chains.js` (فقط حذف `syncRailAria` + listenerهای `#prov-rail` که
  در `index.html` وجود ندارد + فراخوانی‌اش؛ رفتار no-op می‌ماند چون query خالی بود)
- همین فایل تیکت. هیچ فایل دیگری.

## Files
- `js/app.js`, `js/modules/chains.js`
- `tickets/33-dead-wire.md` (این فایل)

## Spec
- حذف مکانیکی خالص؛ هیچ منطقی جابه‌جا یا بازنویسی نشود.
- بعدش `grep` هر هفت نام موج در `app.js` فقط `createWaveRenderer` را در خط ۴۷۲ نشان بدهد؛
  `prov-rail|syncRailAria` در کل `js/` صفر شود.

## Acceptance
- `node --check` هر دو؛ `git diff --check` تمیز؛ smoke کوتاه (لود تمیز، تب مدل‌ها).
- `hamnegar-reviewer` PASS. بدون VERSION bump (حذف کد مرده، بدون تغییر رفتار).

## Type: task
