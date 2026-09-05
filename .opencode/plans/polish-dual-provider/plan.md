# Plan: Polish Dual Provider — Groq + OpenRouter with custom BaseURL, model listing, per-model toggle

STATE: LOCKED
Branch: ticket/polish-dual-provider
Seams: storage, transcription, logger/ui (app.js + index.html + css/app.css)
Owner Confirmation: A+B / configurable fallback chain / a+B / A+B with add/remove — 2026-09-02

## CONTRACT LOCK TEMPLATE

Rule #1 — Storage schema (A+B hybrid)
Decision: جدا + قابل توسعه — groqKey/groqBaseURL + openrouterKey/openrouterBaseURL + providers[] برای custom
Option Chosen: A (دو فیلد جدا) + B (generic برای custom) — hybrid
Alternatives Rejected: C (کلید مشترک — ناامن)
Trade-offs: جداسازی امن، migration ساده، custom از طریق providers اضافه می‌شود بدون شکستن قدیمی
GATE STATUS: LOCKED

Rule #2 — Provider routing per model
Decision: هر ورودی زنجیره {id, provider, enabled} و زنجیره قابل چیدمان — fallback قابل تنظیم
Option Chosen: configurable fallback chain (A به شکل {id,provider})
Alternatives Rejected: B (:free heuristic مبهم)، C (Groq اول ثابت — کنترل کم)
Trade-offs: کاربر دقیقاً می‌بیند کدام کلید برای هر مدل استفاده می‌شود، ترتیب فالبک با drag + toggle
GATE STATUS: LOCKED

Rule #3 — Model listing /v1/models
Decision: دکمه refresh + کش 5دقیقه + auto در اولین باز شدن پنل
Option Chosen: A+B
Alternatives Rejected: C (هاردکد قدیمی می‌شود)
Trade-offs: a+B = اولین باز شدن auto fetch (با کش) + دکمه دستی؛ خطا toast
GATE STATUS: LOCKED

Rule #4 — Enable/disable per model + master
Decision: سوییچ کنار هر ردیف + هدر 'همه روشن/خاموش' + دکمه حذف/افزودن مدل
Option Chosen: A+B with add/remove
Alternatives Rejected: B (drag حذف مبهم)، C (دو ستون جاگیر)
Trade-offs: مدل خاموش از chain محاسبه نمی‌شود اما در لیست می‌ماند (خاکستری)، add از لیست کشف‌شده
GATE STATUS: LOCKED

Rule #5 — Custom BaseURL + Custom key (Groq)
Decision: برای هر پرووایدر فیلد BaseURL قابل ویرایش (default https://api.groq.com/openai/v1) + کلید جدا؛ اگر خالی → fallback به OpenRouter/Gemini
Option Chosen: BaseURL پر پرووایدر + کلید کاستوم
Trade-offs: با مستندات Groq سازگار، /models از همان BaseURL خوانده می‌شود
GATE STATUS: LOCKED

Rule #6 — Rate limits display (from screenshot)
Decision: نمایش Current Limits Groq در پنل (30 RPM/1K-14K RPD/8K-70K TPM) فقط informational + توجه به 429 با toast و retry 500ms قبلی
Option Chosen: نمایش + 429 handling موجود
Trade-offs: بدون throttle پیچیده، کاربر می‌بیند qwen/oss 1K RPD است
GATE STATUS: LOCKED

Rule #7 — Settings panel polish
Decision: گروه‌بندی: Groq box / OpenRouter box / Gemini box هر کدام key + BaseURL + تست + لیست مدل‌ها؛ زنجیره STT جدا از زنجیره پالیش؛ فاصله و chip-toggle ها مرتب
Option Chosen: grouping + polish
GATE STATUS: LOCKED

## Files
- js/modules/storage.js — add groqBaseURL, openrouterBaseURL, polishChain with {id,provider,enabled}, migration از string[] قدیمی
- js/modules/transcription.js — queryPolishViaGroq (OpenAI-compatible), queryPolish dispatcher بر اساس provider, hasKeyFor گسترش، chain filtering بر اساس enabled
- js/app.js — renderChain با toggle + provider badge + add/remove + master toggle + fetchModels() (Groq/OpenRouter /v1/models)
- index.html — پنل تنظیمات: هر پرووایدر box با key + BaseURL + تست + دکمه 'خواندن لیست مدل‌ها' + quota Limits table
- css/app.css — polish پنل، chain toggle states، Limits table
- js/modules/logger.js — no change (keep 5-call)
- tickets/07-polish-dual-provider.md — spec

## Migration
old polishChain: ['qwen/qwen3-30b-a3b:free', ...] → [{id:'qwen/qwen3.6-27b', provider:'groq', enabled:true}, ...] mapping :free→groq ids per Groq table (qwen3.6/3.8 + oss-120b/20b/safeguard)
old STT chain string[] → keep, new polish respects enabled

## Dependencies
No callback new prefix; no schema DB; quota.js read-only display

<SYSTEM_GATE> Contract lock required before proceeding </SYSTEM_GATE>
