# Ticket 18 — Shared schema v1 (prefs vs secrets)

## Question
وب و شناور و QR انتقال باید یک شکل واحد از تنظیمات بفهمند. چطور سلیقه قابل‌سینک را از کلید حساس جدا کنیم بدون اینکه رفتار فعلی عوض شود؟

## Scope — Seam: Storage
- فقط `js/modules/storage.js` و همین فایل تیکت
- `transcription`, `audio`, `realtime`, `quota`, `app.js`, `index.html` را دست نزن

## Files
- `js/modules/storage.js` (خواندن/نوشتن موجود دست‌نخورده)
- `tickets/18-shared-schema.md` (این فایل)

## Spec
- `SCHEMA_VERSION = 1` export شود.
- `getPrefs()` برگرداند `{ version: 1, prefs }` که prefs فقط این‌هاست:
  `sttChain, polishChain, polishEnabled, realtime, vad, autocopy` (از `getSettings`)
  به‌علاوه `wave` (از `getWave()`). هیچ کلیدی، هیچ baseURLای، هیچ customProvidersای.
- `exportPrefs()` همان را `JSON.stringify` کند.
- `importPrefs(json)`:
  - parse ناموفق یا `version !== 1` → throw با `{ status: 400 }` و هیچ persistای.
  - زنجیره‌ها از نرمالایزرهای موجود (`normalizeSTTChain/normalizePolishChain` داخلی) رد شوند؛
    خالی/نامعتبر → همان دیفالت‌های فعلی.
  - بولی‌ها فقط وقتی بنشیند که واقعاً boolean باشند.
  - `wave` از `saveWave` موجود رد شود (نرمالایز همان).
  - بقیه را با `saveSettings` موجود persist کند و prefs نهایی را برگرداند.
- `getSecretsMeta()` فقط بولی برگرداند: `{ groq, gemini, openrouter, zenspark }`
  از `hasKeyForProvider` موجود — هرگز مقدار کلید نه.

## Acceptance
- `node --check js/modules/storage.js` تمیز؛ رفتار `getSettings/saveSettings` بایت‌به‌بایت.
- smoke با `localStorage` stub: round-trip `exportPrefs → importPrefs` زنجیره‌ها را حفظ کند؛
  خروجی export هیچ‌جا شامل ماده کلید نباشد؛ version غریبه throw بدهد.
- `git diff --check` تمیز؛ `hamnegar-reviewer` PASS.

## Type: task
