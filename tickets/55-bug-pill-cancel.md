# Ticket 55 — BUG: کنسل pill در شکاف sending

## Question
کنسل pill بین stop و رسیدن blob هیچ‌کار نمی‌کند و باید دوبار زد. چطور؟

## Scope — Seam: Pill cancel (پس از 44)
- باگ‌ها: R5 (تایمر در stop فریز + گپ `sending` با `aborter==null`)، B4 (همان گپ از لنز abort — یک ریشه).
- فایل‌ها: `pill.js` (و `recording.js` فقط اگر adapter مشترک شد).
- رفتار جدید: کنسل در هر لحظه پس از stop اثر کند (abort یا discard صف‌شده)؛ تایمر زمان transcribe را نشمرد.
- بیرون scope: B6 (تغییر affordance اصلی pill) — تصمیم UX مالک، تیکت جدا ندارد.

## Files
- `js/modules/pill.js`
- `tickets/55-bug-pill-cancel.md` (این فایل)

## Spec
- یا ساخت همگام aborter در stop، یا صف‌کردن cancel تا رسیدن blob؛ در هر دو، یک کلیک کافی باشد.
- `timerStop` در stop؛ `durationMs` همان مبنای نمایشی شود.

## Acceptance
- `node --check`؛ `git diff --check` تمیز.
- smoke: stop→کنسل فوری (یک کلیک)، Esc در شکاف، تطابق تایمر با duration.
- `hamnegar-reviewer` PASS (بازبینی کامل). VERSION bump + CHANGELOG.

## Type: bugfix
## Wave: BUG-C · Track: BUG-C · Depends on: 44
