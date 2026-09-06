# Changelog — هم‌نگار

همه تغییرات مهم این پروژه اینجا ثبت می‌شود. فرمت بر اساس [Keep a Changelog](https://keepachangelog.com/fa/1.0.0/) و نسخه‌گذاری `MAJOR.MINOR.PATCH`.

## [0.6.4] - 2026-09-06
### Changed
- **افزودن درون‌زنجیره‌ای (#76):** هر زنجیره دکمه بازشونده (`aria-expanded`) + پنل جست‌وجو زیر همان زنجیره دارد؛ افزودن بدون اسکرول، با اعلام و بدون بستن پنل. شیت انتخاب مدل و `activePickerTarget` حذف شدند؛ پنل STT مدل‌های متنی را پنهان می‌کند (پایان ردیف‌های میوت کاذب).

## [0.6.3] - 2026-09-06
### Fixed
- **ردیف‌های فشرده زنجیره (#75):** نام کامل، تک‌توکن وضعیت، منوی ⋮ (بدون تکثیر — زنجیره‌ها مجموعه‌اند).

## [0.6.2] - 2026-09-06
### Fixed
- **پیشرفت فشرده (#78):** فقط ۲ قرص جاری+بعدی، سرخط قدم و نام مدل، سقف ۱۱۰px.

## [0.6.1] - 2026-09-06
### Fixed
- **ترتیب عمق جزیره (#77):** `z-index` جزیره ۱۳۰ بالای نوار میانی، پارک اسکرول محتوا، سقف ارتفاع منوها. در حالت متن بلند ممکن است منو هنوز به جزیره برسد (با ترتیب رنگ درست) — پیگیری جدا.

## [0.6.0] - 2026-09-06
### Added
- **پایپ‌لاین هوشمند (#38، #39):** دو زبانه (پایپ‌لاین + موج صدا)، هاب ارائه‌دهندگان، زنجیره‌های STT/پالیش زیر هاب، کشوی بسته کلیدها و شیت انتخاب مدل با جست‌وجو.
- **شیت تأیید افزودن + هاب سفارشی (#58):** کلیک چیپ سفارشی کشو و فرم را باز و نام را فوکوس می‌کند.
- **گزارش استفاده تک‌زبانه (#66) + بازیابی آمار (#71):** دو/سه هیرو (درخواست، دقیقه/کلمه، سرعت)، اسپارک‌لاین بدون عدد، کارت هر مدل با خط فارسی، کپشن ذخیره.
- **کارت‌های مدل خلوت (#61):** فقط نام + توانایی + رایگان، دکمه سبز/قرمز عضویت، بلاک راهنما، idهای بلند wrap.
- **لیست‌ها با اسکرول داخلی + خطای نام‌دار (#62):** سقف ~۵/~۸ ردیف، `✕ <ارائه‌دهنده>:`، راهنمای دستی Zen.
- **meta viewport `viewport-fit=cover` (#42):** اینست‌های safe-area روی iOS واقعی شدند.
- **شواهد تصویری (#65 به بعد):** هر تیکت شات قبل/بعد زیر `docs/evidence/<issue>/` دارد.
### Changed
- **توکن‌های شیشه‌ای (#37):** متریال Liquid Glass، مدال شیشه‌ای، دکمه‌های کپسولی، فوکوس و reduced-motion.
- **جزیره شناور اکشن‌بار (#40) + گارد ناچ (#41):** شناور ۵۴۰px با blur، حاشیه safe-area، شیشه stagebar.
- **فوتر چسبان مدال + گرید زنجیره (#43):** ذخیره همیشه دیده، ردیف دومرحله‌ای تا ۴۸۰px، کنتراست سراسری.
- **حذف هاب (#63) و هدر (#65):** کشو-اول با auto-expand بی‌کلید؛ چرخ‌دنده در اکشن‌بار، رفتار+پالیش در مدال، موتور در scope.
- **شفافیت نوار ابزار (#67):** لیبل‌های صادقانه، پانوشت session-only، اسکرول ۳۹۰.
- **چیپ‌های رفتار فشرده (#70):** سوییچ استاندارد هم‌زبان chain-item.
- **اسلitter لاگ (#59):** پین زیر پنل با sticky.
### Fixed
- **میوت موج (#60):** resolve شیء زنده با id — رفت‌وبرگشت بی‌صدا/باصدا.
- **تاچ ۳۶px و wrap شناسه‌ها (#61، #43).**

## [0.5.0] - 2026-09-03
### Added
- **Wave personalization (ticket/50):** new 4th settings tab «موج صدا» — sticky live preview (mic test + fake + sensitivity), 10 starter cards (one-click stack fill), wave stack ≤5 with per-wave rows (title toggle + rename + quick controls + collapsed advanced: band/profile/overrides/c2), globals (sensitivity/attack/speed/intensity/smooth/particles/aurora), 🎲 random stack + reset. Persisted as stack JSON v3 under `hamnegar.wave.v3` (`Storage.getWave/saveWave`).
- **Wave engine (`js/modules/wave.js`):** standing-wave renderer (gate + floor-freeze hysteresis, perc loudness curve, near-still idle, no horizontal travel, thickness coupling, band drivers low/mid/high/rms, profiles flat/center/edges/bands, layered glow without per-frame `shadowBlur`, DPR-aware ≤60fps rAF, reduced-motion static). Main-page rec strip now runs on this engine with the user's saved stack.
- **Main redesign (ticket/51):** slim secondary top bar (brand-mini + version badge + engine chip + options drawer + gear), rec strip driven by `wave.js` + user stack (live via `Audio.getAnalyser()`, near-still idle), merged one-line status (dot + text + chars + words), autogrow transcript (cap ~60vh + grip resize), bottom sticky action bar with 88px round mic, collapsed quota strip (today numbers + worst-provider dot, auto-expand on 429 only), collapsed log (auto-expand on error with toast).

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
