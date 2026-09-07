# Ticket 20 — 109-T1: persistent waveIdle flag

## Question
خاموش/روشن سراسری انیمیشن موج باید بماند، نه اینکه با ریلود برگردد. چطور یک پرچم ماندگار
پشت سیم Storage بگذاریم بدون اینکه رفتار فعلی عوض شود؟

## Scope — Seam: Storage
- فقط `js/modules/storage.js` و همین فایل تیکت
- `wave.js`, `transcription`, `app.js`, `index.html`, `css` را دست نزن.
- هیچ call-siteای عوض نمی‌شود (سیم‌کشی به تب موج و نوار اصلی تیکت بعدی است).

## Files
- `js/modules/storage.js` (افزودن خالص)
- `tickets/20-waveidle.md` (این فایل)

## Spec
- `WAVE_IDLE_KEY = 'hamnegar.wave.idle'` (کلید جدا، بیرون کانفیگ موج).
- `getWaveIdle()` → boolean؛ غایب/خراب یعنی `true` (رفتار فعلی: حرکت idle روشن).
- `saveWaveIdle(v)` → فقط boolean واقعی را به `'1'/'0'` persist کند، مقدار نهایی را برگرداند؛
  ورودی غیربولی نادیده گرفته شود (مقدار قبلی برمی‌گردد).
- `getWave/saveWave/getPrefs/exportPrefs/importPrefs` بایت‌به‌بایت دست‌نخورده.
  (اتصال prefs به این پرچم عمداً خارج از اسکوپ است — وقتی سیم‌کشی آمد، همان تیکت تصمیم می‌گیرد.)

## Acceptance
- `node --check js/modules/storage.js` تمیز.
- smoke با `localStorage` stub: دیفالت true؛ save(true/false) رفت‌وبرگشت؛
  ورودی غیربولی نادیده؛ مقدار خراب دستی در store یعنی true.
- `git diff --check` تمیز؛ `hamnegar-reviewer` PASS.

## Type: task
