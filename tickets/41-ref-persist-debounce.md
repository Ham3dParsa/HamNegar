# Ticket 41 — debounce persistهای wave و chains (ref/persist)

## Question
درگ اسلایدر موج ده‌ها write همگام در ثانیه می‌زند و هر میکروویرایش زنجیره کل save + آبشار رندر را اجرا می‌کند. چطور persist را debounce کنیم بدون از دست رفتن داده هنگام بستن؟

## Scope — Seam: Persistence timing (`waveTab.js` + `chains.js`)
- `js/modules/waveTab.js`: پیش‌نمایش فوری با `setConfig`؛ persist با debounce ~۲۰۰-۳۰۰ms trailing + فلاش روی `change`/بستن مودال/تعویض تب.
- `js/modules/chains.js`: جهش آزاد در state درون‌حافظه‌ای؛ `persistChains` با debounce ~۳۰۰ms trailing + فلاش روی بستن مودال؛ یک رندر واحد در هر فلاش.
- `saveWave` تنها محل normalize می‌ماند. همین فایل تیکت.

## Files
- `js/modules/waveTab.js`، `js/modules/chains.js`
- `tickets/41-ref-persist-debounce.md` (این فایل)

## Spec
- در پایان هر ژست (pointer-up، بستن مودال) دقیقاً یک write تمیز نشسته باشد؛ رفرش از دست نرود.
- پیش‌نمایش بصری حین درگ فوری و بدون تغییر بماند.

## Acceptance
- `node --check` هر دو؛ `git diff --check` تمیز.
- smoke: درگ اسلایدر روان + persist نهایی درست؛ toggle/جابه‌جایی/drag زنجیره + بستن مودال بدون از دست رفتن.
- `hamnegar-reviewer` PASS. بدون VERSION bump.

## Type: task
## Wave: 1 · Track: REF-C
