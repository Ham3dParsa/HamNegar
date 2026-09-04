# Ticket 15 — پورت اکشن‌بار variant A تأییدشده + نام OpenCode_Zen

## Question
پروتوتایپ اکشن‌بار variant A تأیید و در دمو پیاده شد ولی هرگز به پروداکشن نیامد (پروداکشن هنوز دکمه‌های ایموجی بدون تایمر دارد). چرا؟ جا افتاده — الان پورت می‌شود. هم‌زمان نام ارائه‌دهنده باید `OpenCode_Zen` شود (Muse ارائه‌دهنده نیست، نام مدل است).

## Scope — Seam: actionbar (vitrin) + provider display rename
- `index.html` (فقط `<footer class="actionbar">` + انتقال undo/redo از output-meta)، `css/app.css` (بلوک اکشن‌بار)، `js/app.js` (سیم‌کشی همان IDها + تایمر)
- `transcription`, `storage` (به‌جز هیچ)، `audio`, `realtime`, `logger`, `quota` دست نخورد
- مرجع رفتار: `temp/hamnegar-demo/index.html:89-96` + بلوک `.demo-actionbar/.cbtn/.hero/.copy-tick/.pulse-ring/.stop-sq/.rec-timer` در `temp/hamnegar-demo/css/app.css` + تایمر/اکشن‌ها در `temp/hamnegar-demo/js/app.js` (demoTimerStart/Stop، syncActionbar، کلاس ok روی کپی)

## Spec — actionbar
- دکمه‌های دایره‌ای SVG: کپی (با copy-tick سبز ✓)، پاک، میک hero ‏۸۸px با مورف مربع-توقف + crossfade، تایمر بزرگ `mic-timer` کنار میک، لغو ضبط موقع rec/transcribing، واگرد/ازنو داخل نوار.
- IDها حفظ: `btn-copy/btn-mic/btn-cancel-stt/btn-clear/btn-undo/btn-redo/mic-timer`. کلاس‌های رفتاری پروداکشن (`recording/transcribing/realtime-active/shake/disabled`) باید با ظاهر جدید کار کنند (مورف + اسپینر + نفس‌کشیدن طبق variant A).
- undo/redo با همان IDها به نوار منتقل؛ `updateHistoryButtons` دست نخورد.

## Spec — rename (display-only، شناسه `zenspark` می‌ماند)
- ارائه‌دهنده: `Muse Spark (Zen)` → `OpenCode_Zen` در ریل، کارت، `flowScopeLabel`، `getProviders`، دکمه تست و status/toastها.
- مدل: `fa` در `capsFor` → ‏`muse spark 1.3 contributor (رایگان)` / ‏`muse spark 1.2 contributor (رایگان)` بر اساس نسخه شناسه.
- endpoint/لینک داکس و hint حریم خصوصی دست نخورد.

## Files
- `index.html` (actionbar + output-meta)، `css/app.css` (بلوک actionbar)، `js/app.js` (تایمر + اکشن‌ها + rename رشته‌ها)

## Acceptance
- نوار با variant A موبه‌مو: تایمر حین ضبط، تیک سبز کپی، مورف میک، لغو فقط موقع rec/transcribing، undo/redo فعال/غیرفعال.
- ریل و کارت `OpenCode_Zen`؛ ردیف‌ها `muse spark 1.3 contributor`.
- صفر خطای JS؛ 1440/390 بدون اورلپ؛ `node --check` + `diff --check` تمیز.

## Type: implement
