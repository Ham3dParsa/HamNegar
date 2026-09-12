# Ticket 42 — حذف سطح مرده و اعلام تکلیف پروتوتایپ (ref/cleanup)

## Question
`shell.js` چهار نام برای یک boolean دارد، خروجی‌های مرده seam فانتوم القا می‌کنند و `prototype-fallback.html` سومین پیاده‌سازی progress است. چطور تمیز شود بدون هیچ اثر رفتاری؟

## Scope — Seam: Shell + dead surface (دو فایل + یادداشت)
- `js/modules/shell.js`: نگه‌داشتن فقط `detectShell`؛ حذف `isTauri/isWeb/SHELL_MODES/getShellCapabilities`؛ `pill.js` فقط import را به‌روز کند (تک‌خط).
- `prototype-fallback.html`: فقط کامنت freeze («throwaway، هرگز به main برنمی‌گردد») — بدون تغییر منطق.
- `desktop/`: فقط یادداشت read-only mirror در همین تیکت (کد C# دست نمی‌خورد).
- همین فایل تیکت. هیچ منطقی جابه‌جا یا بازنویسی نشود.

## Files
- `js/modules/shell.js`، `js/modules/pill.js` (فقط import)، `prototype-fallback.html` (فقط کامنت)
- `tickets/42-ref-dead-cleanup.md` (این فایل)

## Spec
- حذف مکانیکی خالص؛ `grep -rn "isTauri|isWeb|SHELL_MODES|getShellCapabilities" js/` صفر شود.
- رفتار pill و بقیه بایت‌به‌بایت همان.

## Acceptance
- `node --check`؛ `git diff --check` تمیز؛ smoke لود pill.
- `hamnegar-reviewer` PASS. بدون VERSION bump (حذف کد مرده، الگوی تیکت 33).

## Type: task
## Wave: 1 · Track: REF-B
