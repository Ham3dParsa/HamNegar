# Ticket 46 — مالکیت state موج (ref/wave-store)

## Question
«اسلایدر → persist + repaint» چهار مالک دارد، enum لیبل دو جاست و تایمر follow بعد بستن تب می‌ماند. چطور state یک مالک پیدا کند؟

## Scope — Seam: Wave state (`wave.js` + `waveTab.js`)
- `js/modules/wave.js`: `WaveStore.get/update/reset` + `renderer.setConfig` تنها seam؛ مالک لیبل‌ها (`WAVE_FA`؛ حذف تعریف دوم در storage — storage فقط اسکیما/اعتبارسنجی).
- `js/modules/waveTab.js`: حذف کپی mutable (`waveCfg` به store تفویض)؛ ۵ بلوک سگمنت به جدول داده‌محور روی `waveSeg/waveSlider`؛ `waveFollowStop+waveStarterPause` روی stop/hide + remove-قبل‌از-add برای `waveStarterVis` (F3-تایمر).
- `app.js` فقط مصرف `WaveStore` (sync). همین فایل تیکت.

## Files
- `js/modules/wave.js`، `js/modules/waveTab.js`، `js/modules/storage.js` (فقط بخش wave)، `js/app.js` (فقط sync)
- `tickets/46-ref-wave-store.md` (این فایل)

## Spec
- رفتار follow-global (`ov==null`) و clamp و starter-apply در معنا همان، فقط در یک‌جا.
- بعد از بستن/مخفی تب هیچ poll/listener نماند (تست قرارداد تک-لیستنر).

## Acceptance
- `node --check`؛ `git diff --check` تمیز.
- smoke: اسلایدر→persist→repaint استریپ اصلی و thumbs؛ بستن تب و شمارش listenerها.
- `hamnegar-reviewer` PASS. بدون VERSION bump.

## Type: task
## Wave: 2 · Track: REF-E
