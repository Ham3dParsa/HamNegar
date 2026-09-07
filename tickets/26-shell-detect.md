# Ticket 26 — Shell detection module (new file)

## Question
قرص آینده چطور بفهمد در Tauri است یا وب، بدون اینکه به هیچ سیم فعلی دست بزند؟

## Scope — Seam: none (new module, zero existing files touched)
- فقط فایل تازه `js/modules/shell.js` و همین فایل تیکت
- هیچ فایل موجودی (حتی `app.js`) دست نمی‌خورد؛ سیم‌کشی تیکت بعدی است.

## Files
- `js/modules/shell.js` (new)
- `tickets/26-shell-detect.md` (این فایل)

## Spec
- خالص و بدون side-effect، بدون import از ماژول‌های دیگر (تا چرخه وابستگی نسازد).
- `isTauri()` → true وقتی `window.__TAURI__` یا `window.__TAURI_INTERNALS__` هست؛
  در Node (window غایب) false بدون throw.
- `isWeb()` → `!isTauri()`.
- `getShellCapabilities()` → `{ globalShortcut, autoPaste, alwaysOnTop, transparent }`
  که در وب همه false و در Tauri از روی `isTauri()` همان‌طور false می‌ماند تا پل واقعی بیاید
  (فقط شکل قرارداد، نه ادعای دروغ).
- `SHELL_MODES = ['web', 'tauri']` و `detectShell()` → `'tauri' | 'web'`.

## Acceptance
- `node --check js/modules/shell.js` تمیز؛ smoke در Node (false/web) و با stub window
  (true/tauri)؛ `git status` فقط همین دو فایل.
- `git diff --check` تمیز؛ `hamnegar-reviewer` PASS.

## Type: task
