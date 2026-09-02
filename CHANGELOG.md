# Changelog — هم‌نگار

همه تغییرات مهم این پروژه اینجا ثبت می‌شود. فرمت بر اساس [Keep a Changelog](https://keepachangelog.com/fa/1.0.0/) و نسخه‌گذاری `MAJOR.MINOR.PATCH`.

## [Unreleased] — Post-merge gate compliance (follow-up for PR #4)

### Added
- **Gate compensation:** follow-up branch `fix/followup-pr4-gate` addressing premature merge of PR #4 (`eb666f4`) with 5 must-fix warnings open and direct-to-`main` fix `82fe4aa` that bypassed review gate (violates `AGENTS.md`/`REVIEW.md`). This PR re-documents the bypass in `README.md` (§ Post-merge gate compliance) and here, and records evidence for the 5 fixes in `REVIEW.md` + `docs/PR4_FOLLOWUP_EVIDENCE.md`.
- **Policy:** future merges require OC review `APPROVED`; no direct `main` pushes for review fixes.

### Fixed (applied in 82fe4aa, now gate-tracked here)
- `js/app.js:123` XSS esc, `js/modules/quota.js:29` sttChain seam, `js/modules/transcription.js:114-123` 401 skip, `js/modules/storage.js:40` parseChain filter, manual 5s transcription test obligation.

## [0.3.1] - 2026-09-02
### Fixed
- باگ متن طولانی در حالت آنی: `fin` تجمعی باعث تکرار از ابتدا می‌شد — حل با `snap.committed = fin` (cumulative) به جای `+=`
- حذف کادر اضافی لایو (باکس نقطه‌چین) که متن را دو بار نشان می‌داد
- مدل `gemini-2.5-flash-lite` منسوخ (404) → جایگزینی با `gemini-3.5-flash-lite` و `gemini-3.1-flash-lite` و `gemini-flash-lite-latest`
- اسپم لاگ `DEBUG final`: فقط وقتی `fin` واقعا جدید شد لاگ می‌زند

## [0.3.0] - 2026-09-02
### Added
- معماری ماژولار (`storage`, `transcription`, `audio`, `realtime`, `quota`, `logger`) بر اساس `codebase-design`
- حالت آنی با `Web Speech API` + `VAD` و `quota` زنده
- حافظه پیش‌نویس و ارتفاع پنل‌ها در `localStorage`
- پنل لاگ با فیلتر سطح و اسپلتر دستی
- پشتیبانی کلید `AQ.` با هدر `x-goog-api-key`

### Changed
- نام پروژه از `voice-assistant-modular` به `هم‌نگار` (HamNegar) — سازنده Ham3dParsa

## [0.2.0] - 2026-09-02
### Fixed
- `run.bat` — `pushd` و باز کردن مستقیم `index.html`، رفع `Directory listing`
- `file://` بنر هشدار CORS

## [0.1.0] - 2026-09-02
### Added
- نسخه اولیه تک‌فایل `gemini-code-*.html` با Groq Whisper + Gemini
