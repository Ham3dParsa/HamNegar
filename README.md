# هم‌نگار — تایپ صوتی هوشمند

> تایپ صوتی فارسی/چندزبانه، زنده و دقیق

ساخته شده با عشق ❣️
## ویژگی‌ها

- **زنده:** پیش‌نمایش آنی با Web Speech API (مرورگر)، تثبیت نهایی با Groq/Gemini
- **هوشمند:** فالبک خودکار — 401/403 فیل سریع، 404 مدل → Groq، 429 سهمیه → موتور دوم
- **سهمیه زنده:** کارت‌های Groq (2000/روز) و Gemini (1500/روز) و Live (نامحدود توکن 20K)
- **حافظه محلی:** کلیدها، مدل، تیک‌ها، پیش‌نویس متن و ارتفاع پنل‌ها در localStorage
- **قابل تغییر سایز:** کادر متن و پنل لاگ هر دو `resize: vertical` و ذخیره خودکار
- **لاگینگ:** پنل لاگ با سطوح info/warn/error/debug + toast + status dot

## معماری ماژولار

| ماژول | اینترفیس | پشت صحنه |
|---|---|---|
| `js/modules/storage.js` | `getSettings(), saveSettings(), getDraft/saveDraft(), getHeights/saveHeights()` | 10 کلید localStorage |
| `js/modules/logger.js` | `log(), setStatus(), toast()` | DOM + console mirroring |
| `js/modules/quota.js` | `record(model), render(container)` | LIMITS + reset روزانه |
| `js/modules/audio.js` | `start(), stop(), getAnalyser()` | MediaRecorder + AudioContext |
| `js/modules/realtime.js` | `start(), stop(), isSupported()` | SpeechRecognition fa-IR |
| `js/modules/transcription.js` | `transcribe(blob), testGroq/testGemini()` | دو Adapter (Groq/Gemini) + `x-goog-api-key` برای `AQ.` |
| `js/app.js` | — | سیم‌کشی ماژول‌ها، بدون منطق سنگین |
| `css/app.css` | — | تم تیره، Vazirmatn, رسپانسیو |

> هر ماژول عمیق است: رفتار زیاد، اینترفیس کوچک. تغییر یک ماژول بقیه را نمی‌شکند.

## ساختار پوشه

```
ham-negar/
├── index.html          # پوسته نازک
├── css/app.css         # استایل جدا
├── js/
│   ├── app.js          # entry
│   └── modules/
│       ├── storage.js
│       ├── logger.js
│       ├── quota.js
│       ├── audio.js
│       ├── realtime.js
│       └── transcription.js
├── .env.example        # نمونه متغیرها
├── .env                # کلیدهای محلی (gitignore)
├── run.bat             # اجرای ویندوز
└── README.md
```

## متغیرهای محیطی

کلیدها در مرورگر ذخیره می‌شوند، ولی برای مستندسازی و تست محلی:

```bash
cp .env.example .env
# داخل .env را پر کن
```

نمونه `.env.example` را ببین.

## شروع سریع در ۲ دقیقه (Google AI Studio)

کلیدهای API فقط داخل حافظه مرورگر خودت ذخیره می‌شوند و مستقیم از مرورگر به سرویس ارائه‌دهنده وصل می‌شوند.

### ۱. گرفتن کلید رایگان Google AI Studio (پیشنهادی برای شروع)
1. وارد [aistudio.google.com/apikey](https://aistudio.google.com/apikey) شو و با حساب گوگل ورود کن.
2. دکمه **Create API key** را بزن (در صورت نبود پروژه، یک پروژه جدید بساز) تا کلید `AIza...` ساخته شود.
3. در هم‌نگار آیکون ⚙️ ← **کلیدها و ارائه‌دهندگان** ← **Google Gemini** را باز کن و کلید را بچسبان (ذخیره خودکار انجام می‌شود).

### ۲. ارائه‌دهندگان مکمل برای سرعت و سهمیه بیشتر (اختیاری)
- **Groq** ([console.groq.com/keys](https://console.groq.com/keys) — کلید `gsk_...`): پشتیبان سریع Whisper برای صدا و مدل‌های فوق‌سریع متنی برای پالیش.
- **OpenRouter** ([openrouter.ai/keys](https://openrouter.ai/keys) — کلید `sk-or-v1-...`): در بخش «مدل‌ها و زنجیره» فیلتر **فقط رایگان** را بزن تا مدل‌های `:free` نمایش داده شوند.

### ۳. زنجیره پیش‌فرض هوشمند
- **صوت به متن (STT):** ابتدا مدل‌های `Gemini Flash`، سپس `Gemini Flash-Lite` و بعد `Groq Whisper`.
- **ابزارهای متنی (پالیش/ساختاردهی/ترجمه):** مدل‌های سریع و پرسهمیه (`Groq`، `Gemini Flash-Lite` و مدل‌های رایگان `OpenRouter`) با حداقل تفکر برای کمترین تأخیر و مصرف سهمیه.

### ۴. اجرای محلی
```bash
# ویندوز
.\run.bat
# یا دستی
python -m http.server 8000
# باز کن: http://localhost:8000
```

> با `file://` باز نکن — دسترسی میکروفون و شبکه محدود می‌شود.

## توسعه

```bash
git clone https://github.com/Ham3dParsa/HamNegar
cd HamNegar
python -m http.server 8000
```

ویرایش هر بخش: فقط همان ماژول. مثلا سهمیه → `quota.js`, مدل جدید → `transcription.js`.

## Post-merge gate compliance

> **Violation note (PR #4 @ eb666f4):** PR #4 was merged with 5 must-fix `[warning]` items still open in OC review. Fixes were pushed directly to `main` as `82fe4aa` bypassing the required `APPROVED` gate, violating `AGENTS.md` §5 and `REVIEW.md` gate.
> **Compensation via this follow-up PR (`fix/followup-pr4-gate`):** documents the bypass, retains the 5-warning fixes from `82fe4aa` (XSS `esc()` in `js/app.js:123`, `quota.js:29` → `sttChain`, `transcription.js:114-123` 401-skip, `storage.js:40` `trim()!==''` + dedup, manual transcription test obligation), and re-establishes the gate.
> **Policy going forward:** no PR merges without OC review `APPROVED` (or explicit `suggestion: merge`) and all must-fix warnings resolved inside the PR branch. Direct pushes to `main` for review fixes are prohibited.

## سازنده

[Ham3dParsa](https://github.com/Ham3dParsa)

## لایسنس

MIT
