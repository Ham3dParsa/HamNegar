# Ticket 58 — BUG: ایمنی persist (draft، مهاجرت، خرابی، import)

## Question
آخرین keystrokeها با بستن می‌پرند، مهاجرت مدل پیش‌فرض را دور می‌ریزد، JSON خراب کل کانفیگ را نابود می‌کند و import بد کانفیگ سالم را می‌زند. چطور؟

## Scope — Seam: Storage/stats (پس از 39 و 40)
- باگ‌ها: S2 (flush draft روی `pagehide/beforeunload`)، S3 (allowlist مهاجرت باید پیش‌فرض shipped را بپذیرد)، S5 (قرنطینه: خوانش خراب → بکاپ raw + بازنویسی فقط پس از تأیید کاربر/ذخیره صریح)، S8 (`importPrefs` ورودی بد را reject کند، نه normalize-then-clobber)، S7 (مهاجرت quota: اعتبارسنج `_date` + tombstone/cleanup کلید legacy)، S6 (atomicity record: خوانش-اصلاح-نوشت یکجا یا merge — پس از 40).
- فایل‌ها: `storage.js`، `stats.js`، `app.js` (فقط flush).
- رفتار جدید: هیچ مسیر خوانش/import، داده سالم را نابود نکند.

## Files
- `js/modules/storage.js`، `js/modules/stats.js`، `js/app.js` (فقط flush)
- `tickets/58-bug-persist-safety.md` (این فایل)

## Spec
- import بد: صفر write (اعتبارسنجی کامل قبل از اولین write).
- JSON خراب: بکاپ `*.corrupt-<ts>` در همان storage + بنر/لاگ؛ بازنویسی خودکار ممنوع.
- مهاجرت quota: `_date` نامعتبر → امروز + warn؛ پس از مهاجرت موفق، کلید legacy پاک/مهر شود.
- stats دوم-تب: بدون از دست رفتن increment (تست دومرحله‌ای).

## Acceptance
- `node --check`؛ `git diff --check` تمیز؛ `stats.test.mjs` سبز + تست مهاجرت/import.
- smoke: بستن وسط تایپ، import خراب، زنجیره legacy با مدل پیش‌فرض، دو تب هم‌زمان.
- `hamnegar-reviewer` PASS (بازبینی کامل). VERSION bump + CHANGELOG.

## Type: bugfix
## Wave: BUG-B · Track: BUG-C · Depends on: 39, 40
