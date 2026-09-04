# Ticket 16 — نوار مراحل (پالایش/ترجمه) + گروه‌بندی لاگ هر اجرا

## Question
دکمه‌های پالایش ساده/پیشرفته/دستوری و ترجمه فقط در دمو هستند؛ در پروداکشن هیچ راه دستی برای اجرای عملیات روی متن نیست. و لاگ همه اجراها قاطی است. چرا؟ چون برای پورت stagebar هیچ‌وقت تیکت نوشته نشد (نقشه پوشش پروتوتایپ→پروداکشن وجود نداشت). این تیکت همان شکاف را می‌بندد.

## Scope — Seam: stagebar UI + transcription translate + logger run-groups
- `index.html` (نوار `#stagebar` بین رونوشت و سهمیه، مثل دمو)، `css/app.css` (بلوک stagebar)، `js/app.js` (runStage/runTranslate/ترکیب زبان/خام/scope)
- `js/modules/transcription.js` (تابع `translate(text, lang, entry?)` روی `queryChat/queryResponsesText` با `layer='translate'` + پرامپت ترجمه زبان‌خنثی؛ بدون دست‌زدن به STT/polish)
- `js/modules/logger.js` (تغییر کوچک: `groupRun(label)` + تگ خودکار `data-run` روی خطوط بعدی + `clearRun()`)
- `audio`, `realtime`, `storage`, `quota` دست نخورد

## Spec — stagebar (مرجع رفتار: `temp/hamnegar-demo/index.html:53-76` + `runStage/runTranslate` در `temp/hamnegar-demo/js/app.js`)
- دکمه‌ها با همان لیبل‌های قفل‌شده مالک: ✨ پالایش ساده / ✨ پالایش پیشرفته / 📝 پالایش دستوری / 🌐 EN⇄FA / 🌍 ترجمه… / ↩ خام + ⚙️ تنظیمات مراحل + دامنه.
- هر عملیات روی متن فعلی خروجی اجرا شود؛ خام به متن ورودی برگردد؛ ترجمه سریع جهت را از زبان متن حدس بزند، پنل ترجمه انتخاب زبان بدهد.
- translate از زنجیره پالیش/کلید موجود استفاده کند (entry قابل انتخاب؟ حداقل: همان مدل پالیش پیش‌فرض)؛ خطا با toast فارسی + لاگ لایه.

## Spec — لاگ جدای هر اجرا (نه فقط نام لایه)
- شروع هر عملیات (STT، هر stage، هر ترجمه): `Logger.groupRun('🎙 رونویسی #n' / '✨ پالایش ساده #n' / ...)` یک سطر جداکننده چاپ کند و همه لاگ‌های بعدی تا گروه بعدی `data-run=n` بگیرند.
- کلیک روی جداکننده = ایزوله کردن همان اجرا (فقط خطوط همان run + همیشه جداکننده‌ها)؛ کلیک دوباره = برگشت. با فیلتر سطح و سرچ موجود ترکیب شود.
- هیچ کلیدی در لاگ (همان sanitizeMsg)؛ سقف ۳۰۰ خط حفظ شود.

## Files
- `index.html` (stagebar)، `css/app.css` (بلوک stagebar)، `js/app.js` (stage wiring + run filter)
- `js/modules/transcription.js` (`translate`)، `js/modules/logger.js` (`groupRun` + تگ)

## Acceptance
- هر ۶ دکمه روی متن واقعی کار کند (با کلید معتبر)؛ خام برمی‌گرداند؛ ترجمه EN⇄FA درست جهت می‌گیرد.
- لاگ: هر اجرا زیر جداکننده خودش؛ کلیک جداکننده فقط همان اجرا را نشان دهد؛ سرچ «translate» فقط لایه ترجمه.
- صفر خطای JS؛ 1440/390 بدون اورلپ؛ `node --check` + `diff --check` تمیز.
- تست دستی توصیه‌شده: یک stage + یک ترجمه + پیست لاگ.

## Type: implement
