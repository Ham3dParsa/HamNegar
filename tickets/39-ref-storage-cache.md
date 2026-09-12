# Ticket 39 — کش settings و normalize-on-write (ref/storage)

## Question
هر `getSettings` یعنی ~۱۵ getItem همگام + ۲ parse + سه normalize، و aliasهای legacy روی هر خوانش بازمحاسبه می‌شوند. چطور خوانش را ارزان کنیم بدون تغییر API و بدون شکست self-heal؟

## Scope — Seam: Storage (`js/modules/storage.js` فقط)
- فقط `js/modules/storage.js` و همین فایل تیکت.
- کش درون‌حافظه‌ای settings + dirty flag؛ `saveSettings` write-through با refresh کش.
- `hasKeyForProvider` خوانش از کش (یا fast-path سه کلید داخلی).
- قانون «write نرمال می‌کند، read اعتبارسنجی می‌کند»: normalize کامل روی write؛ روی read فقط shape-check ارزان و normalize در mismatch؛ مهر نسخه کنار زنجیره‌ها/wave و مهاجرت یک‌باره (E5).
- رفتار migrate تیکت ۲۴ در معنا دست‌نخورده.

## Files
- `js/modules/storage.js`
- `tickets/39-ref-storage-cache.md` (این فایل)

## Spec
- شکل خروجی `getSettings/getWave/hasKeyForProvider` بایت‌به‌بایت همان.
- داده legacy/corrupt همچنان self-heal شود (تست با زنجیره `gemini`/`zenspark` قدیمی).
- بدون تغییر API عمومی.

## Acceptance
- `node --check`؛ `git diff --check` تمیز.
- smoke: رندر زنجیره ۳۰ردیفه، transcribe، باز/بسته مودال؛ داده legacy بعد خواندن تمیز persist شود.
- `hamnegar-reviewer` PASS. بدون VERSION bump.

## Type: task
## Wave: 1 · Track: REF-C
