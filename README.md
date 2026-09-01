# دستیار صوتی هوشمند — Voice Assistant Modular

تبدیل گفتار به متن زنده و دقیق با Groq Whisper + Gemini Live. معماری ماژولار بر اساس `codebase-design` — هر بخش پشت یک اینترفیس کوچک و عمیق.

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
voice-assistant-modular/
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

نمونه `.env.example` را ببین. **هرگز `.env` را کامیت نکن.**

## راه‌اندازی

### 1. کلید بگیر
- Groq: https://console.groq.com/keys → `gsk_...`
- Gemini: https://aistudio.google.com/apikey → `AQ....` (جدید) یا `AIza...` (قدیمی)

### 2. اجرا
```bash
# ویندوز
.\run.bat
# یا دستی
python -m http.server 8000
# باز کن: http://localhost:8000
```

> با `file://` باز نکن — CORS بسته می‌شود.

### 3. تنظیم
آیکون ⚙️ → کلیدها → تست → ذخیره. موتور و مدل را همانجا عوض کن.

## توسعه

```bash
git clone <repo>
cd voice-assistant-modular
python -m http.server 8000
```

ویرایش هر بخش: فقط همان ماژول. مثلا سهمیه → `quota.js`, مدل جدید → `transcription.js`.

## لایسنس

MIT
