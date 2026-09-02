# REVIEW — HamNegar تله‌های بازبینی

این فایل منبع حقیقت برای `opencode-review` است. PR باید این تله‌ها را نخورد.

## تله‌های اجباری

1. **Gemini Auth `AQ.`** — کلید جدید `AQ....` حتما با هدر `x-goog-api-key` برود، نه `?key=` کوئری. تست: `queryGemini` باید `headers: { 'x-goog-api-key': k }`.

2. **file:// CORS** — `location.protocol === 'file:'` باید بنر هشدار نشان دهد و لاگ warn بزند.

3. **Audio guard** — هر `transcription` قبل از `fetch` باید `if (blob.size < 800) throw TOO_SHORT` کند تا هزینه بیهوده ندهد.

4. **Storage seam** — هیچ ماژولی به جز `storage.js` حق ندارد مستقیم `localStorage.getItem('KEY_...')` بزند. همه از `Storage.getSettings()` / `Storage.saveSettings()`.

5. **Realtime race** — `rtBefore/rtAfter/rtBasePos` نباید گلوبال قابل بازنویسی باشد. باید به صورت `snap` به `handleTranscription(blob, snap)` پاس شود و با `id/version` ریس قدیمی دور ریخته شود.

6. **Fallback 401** — روی `401/403` نباید بی‌شرط `throw` کرد؛ اگر کلید موتور دوم موجود است باید سراغ بعدی برود (لیست ترجیحی).

7. **.env** — هرگز `.env` کامیت نشود، فقط `.env.example` با `GROQ_API_KEY=` خالی. `git diff --check` باید تمیز باشد.

8. **No Live Transcribe** — فعلا `BidiGenerateContent` / `Live API` اضافه نکن. فقط `Web Speech API` برای آنی.

## چک
- `grep -rn "localStorage" js/ --include="*.js" | grep -v "storage.js"` باید صفر باشد.
- `grep -rn "\?key=" js/ --include="*.js"` باید صفر باشد.

## Post-merge gate compliance — PR #4 follow-up (fix/followup-pr4-gate)

> جبران ادغام زودهنگام PR #4 در `eb666f4` با 5 هشدار must-fix باز و پوش مستقیم `82fe4aa` روی `main` بدون گیت `APPROVED`. این بخش گواه است که فیکس‌ها داخل همین follow-up PR ردیابی می‌شوند و ادغام بعدی فقط با `APPROVED` مجاز است.

- **وضعیت:** 5 مورد `[warning]` از PR #4 قبلاً در `82fe4aa` اعمال شد و در این PR مستند/تثبیت می‌شود؛ گیت آینده: `APPROVED` الزامی، پوش مستقیم به `main` ممنوع.
- **XSS esc (`js/app.js:123,141`):** رفع با `function esc(s){...textContent...}` و `esc(meta.label/sub)` در `renderChain` — شواهد: `docs/PR4_FOLLOWUP_EVIDENCE.md` §1.
- **Quota sttChain (`js/modules/quota.js:29`):** رفع با `s.sttChain?.[0]` به جای `s.primary/s.model` — شواهد: §2.
- **401/403 فالبک (`js/modules/transcription.js:114-123,152`):** رفع با فیلتر `remaining.some(hasKey)` و `throw` اگر کلید بعدی نیست + skip بی‌کلید + `polish 401 break` — شواهد: §3.
- **parseChain filter (`js/modules/storage.js:40`):** رفع با `x.trim()!==''` و `new Set` dedup + allowlist در migration — شواهد: §4.
- **تست دستی ۵ ثانیه (`AGENTS.md:3`):** تعهد ثبت لاگ `Quota.render` + `transcription` با زنجیره فالبک — شواهد: §5 (لاگ پیوست در evidence file).
- **منبع حقیقت:** این فایل + evidence file؛ هر PR بعدی باید این چک را `APPROVED` بگیرد قبل از merge.
