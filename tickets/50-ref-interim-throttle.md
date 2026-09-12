# Ticket 50 — interim افزایشی و throttle شمارش (ref/realtime)

## Question
هندلر interim کل finals را هر رویداد بازمی‌چسباند (O(n²)) و هر keystroke کل `output.value` + word-count را بازنویسی می‌کند. چطور خطی شود بدون تغییر متن نهایی؟

## Scope — Seam: Realtime interim (`realtime.js` + مصرف `app.js`)
- `js/modules/realtime.js`: finals افزایشی با `resultIndex` به‌جای rescan کامل.
- `js/app.js`: `makeOnInterim` فقط delta را اعمال کند؛ `updateCounts()` با throttle (~۵۰۰ms یا فقط روی final).
- همین فایل تیکت. متن نهایی و merge با batch در معنا دست‌نخورده.

## Files
- `js/modules/realtime.js`، `js/app.js` (فقط `makeOnInterim`/`updateCounts`)
- `tickets/50-ref-interim-throttle.md` (این فایل)

## Spec
- متن نهایی دیکته طولانی کاراکتربه‌کاراکتر همان (تست مقایسه‌ای با rescan قدیم روی transcript بلند).
- اگر `resultIndex` مرورگر نامعتبر بود، fallback به rescan کامل (رفتار امروز) — نه crash.

## Acceptance
- `node --check` هر دو؛ `git diff --check` تمیز.
- smoke: دیکته طولانی زنده بدون jank رشدیابنده؛ شمارش کلمات درست.
- `hamnegar-reviewer` PASS. بدون VERSION bump.

## Type: task
## Wave: 3 · Track: REF-D
