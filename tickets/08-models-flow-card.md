# Ticket 08 — کارت یکپارچه جریان مدل‌ها (پورت variant B از دمو)

## Question
ثبت ارائه‌دهنده → کلید → افزودن → فیلتر → دریافت لیست در ۴ کارت جدا پخش است. چطور یکی شود؟ (پروتوتایپ B تأییدشده + `proto-flow3` + پورت دموی `port-b` + `converge` + `multi`)

## Scope — Seam: settings UI (Models tab)
- فقط `index.html` (تب‌ها/پنل‌های `tab-providers/tab-easyadd` → تب واحد «مدل‌ها»)، `js/app.js` (بخش settings/easy-add + `switchTab`)، `css/app.css` (بلوک مدل‌ها)
- `transcription`, `storage`, `audio`, `realtime`, `logger`, `quota` را دست نزن (فقط صدا بزن)
- پیش‌نیاز: Ticket 07 (listModels واقعی gemini + کپس دوگانه)

## Spec (وضع موجود در ریپو — مبنای حذف/ادغام)
- `index.html:67-70` تب‌ها (`tab-providers/tab-easyadd/tab-chains/tab-wave`)؛ `index.html:74-140` پنل `panel-providers` (کارت‌های `provider-card-groq/gemini/openrouter` + `custom-add-card`)؛ `index.html:141-155` پنل `panel-easyadd` (`easy-provider-select/btn-easy-refresh/easy-model-select/easy-model-input/easy-models-hint/easy-target-stt/polish/btn-easy-add`)؛ `js/app.js:455-469` نگاشت `switchTab`؛ `css/app.css:183-184` چیدمان پنل‌ها.
- حالت هدف: تب واحد «مدل‌ها» (ادغام providers+easyadd) با یک کارت جریان:
- یک ریل انتخاب‌گر (Groq | Google AI Studio | OpenRouter | ‎+سفارشی | همه) به‌عنوان single truth؛ کارت‌های `provider-card-*` موجود به زیر ریل منتقل و فقط کارت منتخب نمایش داده شود (`custom-add-card` ایستگاه آخر ریل).
- کارت کلید همان‌جا: ورودی موجود + تست + راهنما («کلید را از aistudio.google.com بگیر» + لینک docs) + «دریافت لیست مدل‌ها» (همان `fetchAndShowModels/loadEasyModels` روی `Transcription.listModels`) + endpoint نمایشی + خط حافظه + `<details>پیشرفته</details>` برای baseURL.
- یک سرچ + یک ردیف چیپ چندانتخابه (جدید): «همه All» (ریست) / «🎙 رونویسی STT» / «✍️ متنی T2T» / «🆓 رایگان Free» — ‏STT/T2T با OR، رایگان مادیفایر AND.
- لیست تخت مدل‌ها (جدید، روی `modelCache` + `renderModelCodes` فعلی): ردیف فشرده ~۴۷px (نام + کپس + تگ کم‌رنگ ارائه‌دهنده + دکمه کوچک افزودن/حذف)، بدون سرفصل گروهی در حالت «همه».
- کنترل مقصد STT/پالیش واحد (همان `easy-target-stt/polish` جابه‌جاشده)؛ شناسه دستی Gemini اکشن empty-state؛ `#m-nokey` انکر درون‌کارتی.
- حذف: تب جدا `tab-easyadd`/`panel-easyadd` (محتوا به کارت جریان منتقل می‌شود)، سلکت ارائه‌دهنده/مدل جدا (`easy-provider-select/easy-model-select`)، `btn-easy-refresh` جدا (ادغام در دکمه دریافت هر ارائه‌دهنده).
- همه قابلیت‌ها حفظ: کاستوم، baseURL، تست، کش listModels، undo زنجیره‌ها (تب Chains دست نخورد).

## Files
- `index.html:67-70,74-155` (تب‌ها + `panel-providers` + `panel-easyadd`)
- `js/app.js:28-33,455-469,650,667,689,706` + `renderModelCodes/fetchAndShowModels`
- `css/app.css:183-193` (بلوک مدل‌ها)

## Acceptance (آینه ۱۳ چک `port-b` دموی 1440/768/390)
- تعویض ریل → فیلتر لیست + کارت کلید؛ دریافت → پر شدن لیست + خط حافظه؛ سرچ+چیپ چندگانه درست فیلتر؛ «همه»+STT تخت با تگ هر ردیف و بدون هدر گروه؛ افزودن/حذف زنجیره را عوض کند؛ صفر خطای JS؛ بدون اورلپ.

## Type: implement
## Reference (شواهد تأیید در دموی git-ignored — برای پیاده‌سازی لازم نیست، spec بالا خودکفاست)
- رفتار مرجع در `temp/hamnegar-demo` (با `run-demo.bat`) و `temp/prototype-models-flow.html?v=b` دیده و با شات‌های `Temp\opencode\shots\` (`port-b-*`, `converge-*`, `multi-*`) راستی‌آزمایی شده؛ همه جزئیات لازم در Spec همین تیکت آمده. پس از پیاده‌سازی، همان چک‌لیست Acceptance را در ریپو واقعی تکرار کن.
