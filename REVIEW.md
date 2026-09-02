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
