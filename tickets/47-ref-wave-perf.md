# Ticket 47 — پرف موتور موج (ref/wave-perf)

## Question
هر فریم اشیای یک‌بارمصرف می‌سازد، analyser دو بار خوانده می‌شود و استریپ idle هم ۶۰fps بیدار است. چطور ارزان شود بدون تغییر حتی یک پیکسل خروجی؟

## Scope — Seam: Wave engine (`wave.js` + `audio.js` sampler + خواب app/waveTab)
- `js/modules/wave.js`: بافر فرکانس کش‌شده، گرادیان کش بر `(W,H,c1,c2)`، مسیر scratch قابل‌استفاده‌مجدد، `fit()` فقط روی resize-observer (D1)؛ `attachLive/setLiveEnabled` مالک اتصال live (B4).
- `js/modules/audio.js`: سمپلر واحد `getLevel/getBands` با کش ~۱۰-۱۵Hz؛ موج و VAD فقط کش (D2).
- `js/app.js` + `js/modules/waveTab.js`: `stop()+renderOnce()` در idle؛ start فقط روی live/visible با `document.hidden + IntersectionObserver` (D3).
- همین فایل تیکت. خروجی بصری فریم‌به‌فریم همان.

## Files
- `js/modules/wave.js`، `js/modules/audio.js`، `js/app.js` (فقط خواب/بیداری)، `js/modules/waveTab.js` (فقط خواب/بیداری)
- `tickets/47-ref-wave-perf.md` (این فایل)

## Spec
- خروجی رندر برای کانفیگ یکسان پیکسل‌به‌پیکسل همان (اسکرین‌شات قبل/بعد در PR).
- آستانه VAD و رفتار live در معنا همان.

## Acceptance
- `node --check`؛ `git diff --check` تمیز؛ شاهد پروفایل (`__waveStarterStats` ticks/draws + allocation timeline) قبل/بعد در PR.
- smoke: ضبط زنده با موج، idle بدون CPU، تب پس‌زمینه خاموش.
- `hamnegar-reviewer` PASS. بدون VERSION bump.

## Type: task
## Wave: 3 · Track: REF-E · Depends on: 46
