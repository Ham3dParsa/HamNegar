# Ticket 31 — Settings modal extraction (arch 3/4)

## Question
مدال تنظیمات (فوکوس‌ترپ، باز/بسته، ذخیره، تاگل‌ها) هم باید از `app.js` برود.
مرزش با wave و chains کجاست؟

## Scope — Seam: Logger/UI (vitrin regions: settings only)
- `js/app.js` (فقط: settings wiring ~195-300، tabs ~301-317،
  modal block ~909-960: focusables/openModal/closeModal/Esc-trap/Tab-trap،
  دکمه‌های save/close/reset، تاگل‌های realtime/vad/autocopy)
  و فایل تازه `js/modules/settingsModal.js` + همین فایل تیکت
- wave tab، chains، بقیه `app.js`، `index.html`، `css` دست‌نخورده.

## Files
- `js/app.js` (حذف نواحی + import و فراخوانی نازک)
- `js/modules/settingsModal.js` (new: verbatim + import/export)
- `tickets/31-settings-extract.md` (این فایل)

## Spec
- انتقال verbatim؛ وابستگی‌های بیرونی (waveEnsure/wavePrevStart/mainWaveSync/...،
  chainPanelOpen/setChainPanel، setSttChain/setPolishChain، renderAllChains،
  persistChains، STT_DEFAULTS/POLISH_DEFAULTS، saveSettings/loadSettings) فقط از
  طریق تزریق (deps/getter زنده، الگوی تیکت ۲۹/۳۰) — نه کپی، نه snapshot.
- `app.js` فقط import + `mountSettingsModal({...})` + فراخوانی نازک؛ بدون تعریف تکراری.
- شناسه‌های DOM در `index.html` موجود باشند؛ ترتیب Esc/Tab-trap و بازگشت فوکوس preserved.

## Acceptance
- `node --check` هر دو؛ `git diff --check` تمیز؛ `app.js` سبک‌تر؛
  تعریف تکراری صفر؛ smoke مرورگر (باز/بسته مدال، ذخیره، Esc بدون ذخیره، تاگل‌ها).
- `hamnegar-reviewer` PASS. بدون VERSION bump (ریفکتور خالص).

## Type: task
