# Ticket 36 — Pill Tauri bridge (contract for shell P1)

## Question
قرص چطور با پوسته ویندوزی حرف بزند بدون اینکه مسیر وب ذره‌ای عوض شود؟

## Scope — pill.js only (no other files)
- فقط `js/modules/pill.js` و همین فایل تیکت
- قرارداد ثابت هر دو سمت:
  - Rust→قرص: رویداد `hamnegar-toggle-record` (همان منطق کلید M).
  - قرص→Rust: `invoke('hamnegar_paste', { text })` بعد از موفقیت، فقط در حالت tauri.

## Files
- `js/modules/pill.js`
- `tickets/36-pill-bridge.md` (این فایل)

## Spec
- `toggleMic()` از منطق شاخه M بیرون کشیده شود (idle/success/error→start؛
  recording→stop؛ sending→toast)؛ bindKeys و bridge هر دو همان را صدا بزنند.
- `tauriBridge()` در init: فقط اگر `detectShell() === 'tauri'` و
  `window.__TAURI__?.event?.listen` هست، روی `hamnegar-toggle-record` بنشیند؛
  همه‌چیز در try/catch، هرگز throw به بیرون نرود.
- `tauriPaste(text)` بعد از موفقیت (کنار autocopy): فقط در tauri و فقط اگر
  `core.invoke` هست؛ true/false برگرداند؛ روی false همان رفتار وب؛ هیچ لاگ کلیدی.
- مسیر وب بایت‌به‌بایت (گارد نبودن `__TAURI__` در همه شاخه‌ها).

## Acceptance
- `node --check`؛ smoke وب بدون `__TAURI__` دقیقاً مثل قبل؛
  smoke با stub ویندو (`event.listen` صدا شود، `invoke` با `{text}` صدا شود).
- `git diff --check` تمیز؛ `hamnegar-reviewer` PASS.

## Type: task
