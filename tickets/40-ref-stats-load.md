# Ticket 40 — تک‌بارگذاری تاریخچه آمار (ref/stats)

## Question
هر `record` دو بار history را parse و کل آرایه ۳۶۵روزه را stringify می‌کند؛ هر `aggregate` هم دو parse دیگر. چطور IO را نصف کنیم بدون دست‌زدن به سقف ۳۶۵ و معنای تهران؟

## Scope — Seam: Stats (`js/modules/stats.js` فقط)
- فقط `js/modules/stats.js` و همین فایل تیکت.
- `migrateIfNeeded(hist)` با history آماده به‌جای خوانش دوباره؛ تک‌بارگذاری در هر فراخوان.
- کش کوتاه‌مدت درون‌حافظه‌ای با dirty flag در burst رندر/record.
- سقف `slice(-365)` و منطق تهران و `LIMITS` دست‌نخورده.

## Files
- `js/modules/stats.js`
- `tickets/40-ref-stats-load.md` (این فایل)

## Spec
- خروجی `record/aggregate/getSummary/getSeries` برای ورودی یکسان بایت‌به‌بایت همان.
- `stats.test.mjs` بدون تغییر سبز بماند (و اگر لازم شد فقط − همان فایل تست).

## Acceptance
- `node --test js/modules/stats.test.mjs` سبز؛ `node --check`؛ `git diff --check` تمیز.
- smoke: ثبت یک رونویسی و رندر quota/dashboard با اعداد یکسان قبل/بعد.
- `hamnegar-reviewer` PASS. بدون VERSION bump.

## Type: task
## Wave: 1 · Track: REF-C
