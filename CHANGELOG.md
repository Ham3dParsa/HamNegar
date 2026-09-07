# Changelog — هم‌نگار

همه تغییرات مهم این پروژه اینجا ثبت می‌شود. فرمت بر اساس [Keep a Changelog](https://keepachangelog.com/fa/1.0.0/) و نسخه‌گذاری `MAJOR.MINOR.PATCH`.

## [0.6.19] - 2026-09-07
### Fixed
- **سقف زنجیره (#112 T3/3):** `.chain-list` سقف گرفت — موبایل `240px` (حدود ۳ سطر + لبهٔ سطر ۴ به‌عنوان affordance اسکرول، قد واقعی سطر ۶۶–۹۹px)، دسکتاپ `≥1024px` دقیق ۶ سطر (`calc(6 * 66px + 5 * 6px)` = ‏۴۲۶px)؛ اسکرول داخلی `overflow-y:auto` mirror الگوی add-list (‏`css/app.css:682`) پس دنبالهٔ ۸ سطری بدون اسکرول مدال در دسترس است؛ سطرها، منوی ⋮ و سوییچ‌ها دست‌نخورده. شواهد: `docs/evidence/112/t3-*`.

## [0.6.18] - 2026-09-07
### Changed
- **سربرگ فشرده لاگ T2/2 (#90):** هدر موبایل `≤640px` دوسطری شد — سطر ۱ تک‌سطر (سربرگ ellipsis + اکشن‌های آیکونی ۴۴×۴۴ با `title`/`aria-label`؛ متن دسکتاپ سر جاست)، سطر ۲ نوار فیلترها (nowrap + اسکرول افقی، `min-height:28px`)؛ جستجو همچنان اورلی صفرپیکسل؛ `#log-body` در پنل پیش‌فرض 180px حدود ۳٫۱ سطر (کف: ۳ در ۳۹۰، ۲٫۵ در ۳۶۰)؛ دسکتاپ ۱۴۴۰ پیکسل‌به‌پیکسل (سطر ۴۳px). تکمیل T1: نگه‌دارنده containing-block اورلی + `stopPropagation` در Esc جستجو.

## [0.6.17] - 2026-09-07
### Changed
- **نوار اصلی صدا زنده شد (#91 T1):** `.rec-strip` قد ۴۸→۶۸px (‏`flex-shrink:0` و `overflow:hidden` سر جاست، هاله بریده نمی‌شود)؛ نوار اصلی بدون میک با fake می‌تپد (‏`setFakeEnabled(true)` تا analyser بنشیند — اتصال analyser اولویت دارد، رفتار full-level و خط ثابت `reduced-motion` دست‌نخورده). حاشیه‌های recording/transcribing دست‌نخورده.

## [0.6.16] - 2026-09-07
### Fixed
- **خوانایی قدم‌های STT در موبایل (#91 T2):** پنل `#stt-progress` کف `96px` با `flex-shrink:0` گرفت (سقف ۱۱۰px و `hidden` سر جاست) + محافظ شرینک نوار؛ نام‌های نمایشی انسانی (`Groq`، `Flash-Lite 3.5`…) با ارقام فارسی (شمارندهٔ `قدم i از n` همیشه پیدا، بدون ellipsis در ۳۶۰)؛ سربرگ ۱۳px؛ هدر لاگ در `≤640px` تک‌سطر شد (اسکرول افقی درون‌خطی) تا `#log-body` در ۳۹۰ حداقل ۵ سطر جا بدهد. شکل فراخوانی‌های `transcription.js` دست‌نخورده.

## [0.6.15] - 2026-09-07
### Changed
- **جستجوی لاگ آیکونی T1/2 (#90):** `#log-search` همیشه‌روشن حذف شد؛ دکمهٔ 🔍 در `#log-actions` (‏۴۴×۴۴، `aria-expanded`/`aria-controls`، حلقهٔ فوکوس) فیلد را به‌صورت اورلی باز می‌کند؛ Esc/✕ می‌بندد، کوئری و فوکوس حفظ می‌شود؛ هدر موبایل `≤640px` تک‌سطر (‏۵۷px در ۳۹۰) و دسکتاپ ۴۳px بدون تغییر؛ رفتار `Logger.log` و `hidden` دست‌نخورده.

## [0.6.14] - 2026-09-07
### Changed
- **شیت راهنما در موبایل (#94):** دیالوگ راهنما در `≤640px` شیت تمام‌عرض چسبیده به کف شد (`align-end`، `85dvh`، شعاع بالای ۲۰px، زبانه‌های چسبان + دکمهٔ تمام‌عرض بستن — هم‌ارز شیت بازبینی)؛ جدول میانبرها به سطرهای انباشتهٔ کارتی شکست؛ ترتیب Esc و یادداشت Enter آکاردئون (`details` بومی، بدون تغییر JS)؛ دسکتاپ تا ۶۴۰px عریض شد؛ `prefers-reduced-motion` رعایت شد؛ تله/aria/بستن با تپ پس‌زمینه دست‌نخورده.

## [0.6.13] - 2026-09-07
### Fixed
- **لمس تغییراندازه رونوشت (#93):** `.grip` حالا `touch-action:none` با هدف لمسی ≥۴۴px، مدیریت `pointercancel`/capture به‌علاوهٔ فallback لمسی `touchstart` (الگوی splitter)؛ پرچم manual-override (درگ می‌نشاند؛ autogrow فقط رشد می‌دهد، هرگز ارتفاع کاربر را کوچک نمی‌کند؛ دابل‌تپ بازنشانی می‌کند)؛ `@media(pointer:coarse){#output{resize:none}}` (دسکتاپ هندل native را نگه می‌دارد). `Storage.saveHeights({out})` دست‌نخورده. درگ لمسی واقعی ±۶۰px در هر سه ویوپورت بدون دزدیدن اسکرول، بدون خطای کنسول.

## [0.6.12] - 2026-09-07
### Added
- **محتوای واقعی راهنما (#95):** دیالوگ راهنما ۴ تب شد (میانبرها + ابزارها/تنظیمات/سهمیه) با تک‌منبع حقیقت = مپ `GUIDE` در `js/app.js` (هر درایه `{id,title,body,ref}` به شناسهٔ موجود؛ خروجی زبانهٔ میانبرها دست‌نخورده)؛ `title` کنترل‌های مقید از همان مپ می‌آید + قانون ضدپوسیدگی (هر PR روی stagebar/settings/quota باید مپ را لمس کند).

## [0.6.11] - 2026-09-07
### Fixed
- **لنگر splitter لاگ (#92):** حذف `position:sticky;bottom:0;z-index:5` از قانون `#log-splitter` (فقط `order:5` می‌ماند) — دستگیره حالا خواهرِ static-flow لبه پنل است، نه سنجاق‌شده به کف اسکرول‌پورت موبایل. شکاف `splitter.top − panel.bottom` در هر سه ویوپورت (۳۶۰/۳۹۰/۱۴۴۰) هم در scrollTop صفر و هم در انتها ۸px است؛ درگ لمسی ±۸۰px پنل و دستگیره را با هم حرکت می‌دهد؛ جمع‌شدن پنل دستگیره را پنهان می‌کند. ریاضی درگ/کلَمپ/ذخیره‌سازی دست‌نخورده.

## [0.6.10] - 2026-09-07
### Added
- **نوع ستونی اکولایزر + پیش‌نمایش زنده استارترها (#57):** نوع هفتم `bars` کنار ۶ نوع خطی (ستون‌های عمودی مرکز-آینه با همان سطوح باند، شکل گرد/مربع/سوزنی، تعداد ۸–۴۸، فاصله ۰–۸؛ ذخیره‌سازی با پیش‌فرض امن برای ورودی‌های قدیمی) + استارتر یازدهم «اکولایزر ستونی»؛ کارت‌های استارتر حالا بوم‌های زنده (~۱۲۰×۴۸) با یک rAF مشترک ~۱۶fps، ساعت مصنوعی مشترک، توقف با IntersectionObserver و `document.hidden`، و فریم ثابت `renderOnce()` زیر `prefers-reduced-motion`.

## [0.6.9] - 2026-09-07
### Changed
- **پیش‌نمایش و لغزنده‌های موج (#56):** پیش‌نمایش بلندتر (۲۰۰px دسکتاپ / ۱۵۰px موبایل) با جاگذاری عمودی (`ampOf` ۰٫۵۲→۰٫۴۰) ضد برش قله؛ نوار چسبان خلوت (فقط پیش‌نمایش + شمار) و کنترل‌های منبع زیر تاخوردگی؛ یک سازنده `waveSlider()` با شست قطره‌ای، حباب مقدار، تیک‌ها و دابل‌کلیک بازنشانی — جای هک `min=-1` چیپ «همگام با سراسری» + ترک ۰–۱۰۰؛ سراسری‌ها شیشه‌ای متمایز از رونوشت‌های هر موج.

## [0.6.8] - 2026-09-07
### Changed
- **تفاوت چهارحالته شیت بازبینی:** حذف‌شده قرمز خط‌خورده، افزوده خالص آبی، جایگزینی (DEL+INS چسبیده) زرد/کهربایی با زیرخط، دست‌نخورده سفید. توکنایزر نقطه‌گذاری را از واژه جدا می‌کند (نیم‌فاصله نمی‌شکند) تا نقطه‌گذاریِ عوض‌شده پس از واژه سالم، تنها هایلایت شود.

## [0.6.7] - 2026-09-06
### Added
- **راهنمای میانبرهای درون‌برنامه (#51):** دکمه `؟` در نوار اقدام + کلید `؟/?` بیرون از ورودی‌های متن، دیالوگ راهنما را باز می‌کند. تک‌منبع حقیقت = مپ `SHORTCUTS` در `js/app.js` (رندر در دیالوگ + `title`/`aria-keyshortcuts` روی کنترل‌های مقید)؛ محتوا دقیقاً بایندینگ‌های واقعی + ترتیب لایه‌ای Esc (راهنما → پنل ترجمه → شیت بازبینی → مدال → لغو ضبط) + یادداشت «Enter همیشه زمینه‌ای، هرگز سراسری».

## [0.6.6] - 2026-09-06
### Fixed
- **حوزه شورت‌کات‌ها (#50):** Ctrl/Cmd+Z/Y فقط با فوکوس `#output` (بقیه ورودی‌ها undo بومی + گارد چیدمان فارسی via `e.code`)؛ درج رونویسی صریح `editorHistory.push()` می‌کند (پایان data-loss)؛ Esc لایه‌ای با consumption (پنل ترجمه → شیت diff → مدال → لغو ضبط در آخر).

## [0.6.5] - 2026-09-06
### Added
- **شیت تأیید تفاوت (#49):** هر پالایش/ترجمه حالا اول شیت پایین (متن اصلی/نتیجه با هایلایت کلمه‌ای، شمار تغییرات، اعمال/دورریختن) را باز می‌کند؛ اعمال همان مسیر قبلی (`stagePushRaw`+`stageApply`، سهمیه فقط روی اعمال)، دورریختن هیچ پشته‌ای را لمس نمی‌کند. Enter=اعمال، Esc=دورریختن.

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
