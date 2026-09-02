# Changelog — هم‌نگار

همه تغییرات مهم این پروژه اینجا ثبت می‌شود. فرمت بر اساس [Keep a Changelog](https://keepachangelog.com/fa/1.0.0/) و نسخه‌گذاری `MAJOR.MINOR.PATCH`.

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
