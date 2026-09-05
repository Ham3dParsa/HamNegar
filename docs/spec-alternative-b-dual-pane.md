# Alternative B — Dual-Pane Fallback Builder

> **برای زنجیرهٔ پالیش (۳ آیتم) و STT (۴ آیتم). جایگزین لیست فعلی + دو دراپ‌داون + دکمهٔ افزودنِ گیج‌کننده**

| وضعیت | موضوع | Seam |
|------|-------|------|
| Draft | `storage` → شکل `polishChain` عوض نمی‌شود؛ فقط UI builder جدید | `js/modules/storage.js:8` |
| Draft | `app.js` → رندر دو ستونه + DnD + فیلتر | `js/app.js:155` |
| Draft | `css/app.css` → گرید دو ستونه، کارت‌های Available/Active | `css/app.css:136` |

---

## 1. مشکل فعلی (Polish به‌عنوان نمونه)

`index.html:118-148` — یک `div#polish-chain` عمودی + در پایین دو `<select>` (مدل + provider) + دکمهٔ «➕ افزودن مدل» که:

* کشف‌پذیری پایین است (کاربر نمی‌فهمد مدل از کجا می‌آید).
* خطا ساکت است (مدل تکراری → فقط Toast «قبلاً هست»).
* ترتیب و on/off در یک ستون قاطی شده.
* STT چهارتایی همین الگو را تکرار می‌کند بدون reuse.

---

## 2. هدف Alternative B

یک سازندهٔ (Builder) دو ستونه که ذهن کاربر را با استعارهٔ آشنا جفت کند:

> **«از انبار بردار، به زنجیره بچین» — مثل سبد خرید.**

* سمت **راست** (در RTL ستون اصلی): **Available — مدل‌های موجود**
* سمت **چپ**: **Active — زنجیرهٔ فعال (مرتب، قابل درگ)**

کاربر یا **کلیک +** می‌کند یا **می‌کشد** (drag). حذف = برگشت به انبار.

---

## 3. Wireframe

### 3.1 دسکتاپ (‎≥768px) — RTL

```
┌─ هم‌نگار / تنظیمات / زنجیرهٔ پالیش فارسی ─────────────────────────────┐
│ ✨ زنجیرهٔ پالیش فارسی (Groq/OpenRouter)   [ ] پالیش نهایی روشن       │
│ ─────────────────────────────────────────────────────────────────── │
│ ┌─ Available (موجود) ──────────────┐ ┌─ Active (زنجیرهٔ فعال) ──────┐│
│ │ 🔍 [ جستجو مدل…         ][×]      │ │ [ همه روشن | همه خاموش ]  ۳/۵ ││
│ │ فیلتر: [همه ▾] [Groq][OpenRouter] │ │ ───────────────────────────  ││
│ │ ────────────────────────────────  │ │ ① ┌─────────────────────┐   ││
│ │ ▼ Groq  (۳) ─ کلید ✓             │ │   │ ⋮⋮  qwen/qwen3.6-27b │   ││
│ │   ┌─────────────────────────┐    │ │   │     Groq  [● روشن] [▲][▼][×]│
│ │   │ qwen/qwen3.6-27b    [+] │    │ │   └─────────────────────┘   ││
│ │   │ Groq • 1K RPD            │    │ │ ② ┌─────────────────────┐   ││
│ │   └─────────────────────────┘    │ │   │ ⋮⋮  gpt-oss-20b     │   ││
│ │   ┌─────────────────────────┐    │ │   │     OpenRouter [○ خاموش]  ││
│ │   │ allam-2-7b          [+] │    │ │   └─────────────────────┘   ││
│ │   └─────────────────────────┘    │ │ ── منطقهٔ رها کردن ───────  ││
│ │ ▼ OpenRouter (۲) ─ بی‌کلید ⚠     │ │  مدل‌ها را اینجا رها کن یا  ││
│ │   ┌─────────────────────────┐    │ │  روی + در سمت راست بزن      ││
│ │   │ gpt-oss-20b :free   [+] │ ···│ │                              ││
│ │   └─────────────────────────┘    │ │ [ بازنشانی پالیش ] [ذخیره]  ││
│ └─────────────────────────────────┘ └─────────────────────────────┘│
└─────────────────────────────────────────────────────────────────────┘
```

### 3.2 موبایل (<768px) — انباشته

```
┌─ Active ──────────────┐
│ ① qwen …  [●] [×] ⋮⋮ │
│ ② gpt-oss … [○]      │
│ [+ افزودن مدل] (باز کردن Available به‌صورت Bottom Sheet) │
└───────────────────────┘
┌─ Available (Sheet) ───┐
│ 🔍 جستجو…  [Groq][همه]│
│ Groq / OpenRouter ... │
└───────────────────────┘
```
> در موبایل Active بالا می‌ماند (اولویت ویرایش)؛ Available با دکمهٔ «افزودن مدل» به‌صورت Sheet باز می‌شود تا اسکرول عمودی دوبل نشود.

### 3.3 حالت خالی

* Active خالی → کارت dashed با متن «زنجیره خالی است — از سمت راست یک مدل اضافه کن» + دکمهٔ «افزودن پیشنهادی‌ها».
* Available فیلتر بی‌نتیجه → «چیزی یافت نشد — فیلتر را پاک کن».

---

## 4. موجودیت‌ها و داده

### 4.1 منبع Available

```js
// js/modules/storage.js:8  POLISH_DEFAULTS — همیشه موجود
// + fetch زنده:
GET {groqBaseURL}/models        → header x-goog-api-key / Authorization
GET {openrouterBaseURL}/models  → فیلتر qwen|gpt-oss|allam|llama (حداکثر ۳۰)
```

ادغام: `defaults` اول (ترتیب پیشنهادی)، بعد `remote` یکتا بر اساس `provider:id`. هر کارت:

```ts
type AvailableCard = {
  id: string;              // "qwen/qwen3.6-27b"
  provider: "groq"|"openrouter"|"gemini";
  source: "default"|"remote";
  hasKey: boolean;         // Storage.getSettings() → groqKey/openrouterKey
  inActive: boolean;       // آیا الان در Active هست؟
}
```

گروه‌بندی: `<details open>` per provider با هدر `Groq (۳) ✓ کلید` / `OpenRouter (۲) ⚠ بی‌کلید` (وضعیت کلید از `js/app.js:128 hasKeyFor`).

### 4.2 مدل Active

بدون تغییر اسکیما — همان `POLISH_DEFAULTS` در `js/modules/storage.js:8`:

```ts
type ChainEntry = { id: string; provider: string; enabled: boolean }
```

ذخیره اتمیک با `Storage.saveSettings({polishChain})` در `js/modules/storage.js:155`.

---

## 5. تعامل (Interaction)

| عمل | موس | کیبورد | لمس | بازخورد |
|-----|-----|--------|-----|---------|
| افزودن | کلیک `+` روی کارت Available | Tab تا `+` → Enter/Space | تپ `+` | کارت در Available به `✓ در زنجیره` تبدیل، Toast «افزوده شد: qwen… (Groq)» |
| افزودن با درگ | drag کارت Available → drop روی Active | — | long-press + drag | Active zone با `border-color: var(--accent)` و `aria-dropeffect` |
| حذف | `×` روی آیتم Active | Focus `×` → Enter | تپ `×` | انیمیشن 150ms، کارت به Available برمی‌گردد |
| جابه‌جایی ترتیب | drag ⋮⋮ داخل Active | `▲/▼` روی هر آیتم | drag handle | `rank` (①②③) زنده به‌روزرسانی، `aria-live="polite"` اعلام «qwen به جایگاه ۱ رفت» |
| روشن/خاموش تکی | سوییچ `●/○` | Space روی سوییچ | تپ | `polish-off` opacity .45 در `css/app.css:140` |
| همه روشن/خاموش | دکمهٔ Master بالای Active | — | تپ | همهٔ `enabled` toggle، Toast «همه روشن» |
| جستجو | تایپ در `🔍` | — | — | فیلتر client-side روی `id` + `label`، debounce 150ms |
| فیلتر provider | چیپ‌های `[همه][Groq][OpenRouter]` | — | — | گروه‌های نامربوط `hidden` |

**قوانین:**

* افزودن تکراری (`provider:id` یکسان) → دکمهٔ `+` disabled + Tooltip «قبلاً در زنجیره است» (به‌جای Toast خطا).
* درگ از Active به Available = حذف (drop روی Available pane).
* ترتیب فقط داخل Active معنا دارد؛ Available همیشه الفبایی/گروه‌بندی ثابت می‌ماند.
* ذخیره خودکار پس از هر تغییر (`persistChains()` در `js/app.js:249`) + دکمهٔ «ذخیره» صرفاً بستن مودال است.

---

## 6. حالت‌ها و لبه‌ها

* بی‌کلید: کارت Available با `⚠ بی‌کلید` و border dashed؛ افزودن مجاز است ولی badge در Active هم `⚠ بی‌کلید` می‌ماند (هشدار نه مانع).
* STT: همین کامپوننت با `provider=gemini|groq` و بدون سوییچ per-item (STT همیشه enabled؛ فقط ترتیب مهم است). عنوان ستون‌ها همان می‌ماند.
* خطای `/v1/models`: بنر داخل Available «لیست زنده بار نشد — پیش‌فرض‌ها نمایش داده می‌شود [تلاش دوباره]».
* حداکثر طول: Active برای Polish بی‌سقف ولی هشدار بالای ۵ آیتم «زنجیرهٔ طولانی = تاخیر بیشتر».

---

## 7. Pros / Cons

| Pros | Cons | کاهش اثر |
|------|------|----------|
| **کشف‌پذیری**: کاربر همهٔ مدل‌ها را می‌بیند، نه فقط ۲ گزینهٔ dropdown | فضای عمودی بیشتر (دو ستونه) | در موبایل به Sheet تبدیل می‌شود |
| **Mental model واضح**: Available vs Active مثل سبد خرید | پیاده‌سازی DnD + فیلتر کمی سنگین‌تر | reuse یک کامپوننت برای STT + Polish (یک Seam) |
| **جلوگیری از خطا**: تکراری از مبدا disabled، نه پس از کلیک | نیاز به fetch `/v1/models` (وابسته به کلید) | fallback به defaults اگر fetch شکست |
| **ترتیب لمس‌پذیر**: درگ + دکمه‌های ▲▼ هم‌زمان | دو پنل = دو `aria-label` برای SR | برچسب‌های فارسی + `aria-describedby` |
| **Master toggle** در یک نگاه | — | — |
| **گروه‌بندی per-provider** کلید/بی‌کلید را شفاف می‌کند | — | — |

**چه زمانی Alternative B نبریم؟** اگر آمار نشان دهد ۹۰٪ کاربران هرگز مدل اضافه نمی‌کنند (فقط ترتیب defaults را می‌خواهند) — آنگاه inline reorder ساده کافی است. اما برای HamNegar که Groq/OpenRouter/Gemini سه‌تایی است، B برنده است.

---

## 8. دسترسی‌پذیری (a11y) — WCAG 2.2 AA

* `dir="rtl"` + `lang="fa"` روی `<html>` حفظ شود (`index.html:2`).
* هر پنل `role="region"` با `aria-labelledby` فارسی: «مدل‌های موجود» / «زنجیرهٔ فعال (۳ مدل)».
* کارت Available: `role="button"` برای `+` با `aria-label="افزودن qwen/qwen3.6-27b (Groq) به زنجیره"`؛ وقتی `inActive` است `aria-disabled="true"`.
* آیتم Active: `role="listitem"` + `aria-posinset`/`aria-setsize` + `aria-label="جایگاه ۱ از ۳: qwen… Groq، روشن"`.
* سوییچ: `<input type="checkbox" role="switch" aria-checked>` — نه div کلیک‌خور.
* درگ: `draggable="true"` + `aria-grabbed` + راه جایگزین کیبورد (▲▼) اجباری؛ `prefers-reduced-motion` انیمیشن را قطع می‌کند (`css/app.css:182`).
* Focus: حلقهٔ Tab منطقی — جستجو → چیپ فیلتر → کارت‌های Available → Master toggle → آیتم‌های Active. `focus-visible` با `outline: 2px solid var(--accent)`.
* Live region: `<div aria-live="polite" aria-atomic="true" class="sr-only" id="chain-live">` برای اعلام «به زنجیره اضافه شد / حذف شد / جابه‌جا شد».
* کنتراست: badgeها همان پالت `css/app.css:1` (AA روی `#1e1f22` پاس می‌کند).
* صفحه‌کلید کامل: هیچ عملی فقط-drag نیست.

---

## 9. فارسی‌سازی

* فونت `Vazirmatn` از `css/app.css:2` — وزن 400 برای بدنه، 600 برای rank/label.
* برچسب‌ها: «مدل‌های موجود»، «زنجیرهٔ فعال»، «جستجو مدل…»، «همه روشن / همه خاموش»، «بکش تا جابه‌جا شود»، «در زنجیره»، «بی‌کلید».
* اعداد فارسی اختیاری: rank با `toLocaleString('fa-IR')` یا همان ①②③ (فعلی).
* ` :focus` و ` :hover` در RTL درست چیده شده (gap و border-inline).

---

## 10. HTML/CSS/JS Snippet (قابل چسباندن به `index.html`)

> کلاس‌ها عمداً روی `css/app.css` موجود سوار است — بدون CSS تکراری.

```html
<section class="pref-section" aria-labelledby="polish-title">
  <div class="pref-head">
    <h4 id="polish-title">✨ زنجیرهٔ پالیش فارسی</h4>
    <label class="chip chip-toggle"><input type="checkbox" id="toggle-polish" checked> پالیش نهایی روشن</label>
  </div>

  <!-- Dual-pane builder -->
  <div class="dual-pane" dir="rtl">
    <!-- Available -->
    <div class="pane pane--available" role="region" aria-labelledby="avail-title">
      <div class="pane-head">
        <h5 id="avail-title">مدل‌های موجود</h5>
        <span class="hint-inline" id="avail-count">۱۲ مدل</span>
      </div>
      <div class="pane-toolbar">
        <input id="avail-search" type="search" placeholder="🔍 جستجو مدل…" aria-label="جستجو در مدل‌های موجود">
        <div class="segmented" role="group" aria-label="فیلتر ارائه‌دهنده">
          <button class="active" data-filter="all">همه</button>
          <button data-filter="groq">Groq</button>
          <button data-filter="openrouter">OpenRouter</button>
        </div>
      </div>
      <div id="avail-list" class="pane-body" role="list" aria-label="مدل‌های موجود">
        <!-- گروه Groq -->
        <details open class="provider-group" data-provider="groq">
          <summary>Groq <span class="chain-badge ok">✓ کلید</span> <span class="hint-inline">۳ مدل</span></summary>
          <div class="avail-card" role="listitem" draggable="true" data-id="qwen/qwen3.6-27b" data-provider="groq">
            <div><b>qwen/qwen3.6-27b</b><small>Groq • 1K RPD</small></div>
            <button class="chain-btn" aria-label="افزودن qwen/qwen3.6-27b (Groq) به زنجیره">＋</button>
          </div>
          <!-- ... -->
        </details>
        <!-- گروه OpenRouter -->
        <details open class="provider-group" data-provider="openrouter">
          <summary>OpenRouter <span class="chain-badge missing">⚠ بی‌کلید</span></summary>
          <div class="avail-card is-in-chain" role="listitem" aria-disabled="true">
            <div><b>openai/gpt-oss-20b</b><small>OpenRouter • رایگان</small></div>
            <span class="chain-badge">✓ در زنجیره</span>
          </div>
        </details>
      </div>
    </div>

    <!-- Active -->
    <div class="pane pane--active" role="region" aria-labelledby="active-title">
      <div class="pane-head">
        <h5 id="active-title">زنجیرهٔ فعال</h5>
        <div class="chain-actions">
          <button class="btn-ghost btn-sm" id="btn-polish-all-on">همه روشن</button>
          <button class="btn-ghost btn-sm" id="btn-polish-all-off">همه خاموش</button>
        </div>
      </div>
      <div id="polish-chain" class="chain-list pane-body" role="list" aria-label="زنجیره پالیش">
        <div class="chain-item" role="listitem" draggable="true" aria-posinset="1" aria-setsize="3">
          <span class="drag-handle" aria-hidden="true">⋮⋮</span>
          <span class="rank">۱</span>
          <div style="flex:1"><span class="chain-label">qwen/qwen3.6-27b</span><small style="color:var(--muted)">Groq</small></div>
          <span class="chain-badge ok">Groq</span>
          <label class="chip" style="padding:4px 8px"><input type="checkbox" role="switch" checked aria-label="روشن"> روشن</label>
          <button class="chain-btn" aria-label="بالا" disabled>▲</button>
          <button class="chain-btn" aria-label="پایین">▼</button>
          <button class="chain-btn" aria-label="حذف">✕</button>
        </div>
      </div>
      <div class="pane-drop-hint" aria-hidden="true">مدل‌ها را اینجا رها کن یا روی ＋ بزن</div>
      <div class="chain-foot">
        <span class="hint-inline">ترتیب از بالا به پایین = اولویت فالبک</span>
        <button class="btn-ghost btn-sm" id="btn-reset-polish">بازنشانی</button>
      </div>
    </div>
  </div>
  <div id="chain-live" class="sr-only" aria-live="polite" aria-atomic="true"></div>
</section>
```

```css
/* Add to css/app.css */
.dual-pane{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.pane{background:var(--surface2);border:1px solid var(--border);border-radius:12px;display:flex;flex-direction:column;min-height:320px;overflow:hidden}
.pane-head{display:flex;align-items:center;justify-content:space-between;padding:10px 12px;border-bottom:1px solid var(--border);background:var(--surface)}
.pane-head h5{font-size:13px;font-weight:700}
.pane-toolbar{padding:8px 10px;display:flex;flex-direction:column;gap:8px;border-bottom:1px solid var(--border)}
.pane-toolbar input[type="search"]{background:#111113;border:1px solid var(--border);color:#fff;padding:8px 10px;border-radius:999px;font-size:13px;outline:none;width:100%}
.pane-toolbar input[type="search"]:focus{border-color:var(--accent)}
.pane-body{flex:1;overflow:auto;padding:8px;display:flex;flex-direction:column;gap:6px;min-height:160px}
.provider-group summary{font-size:12px;font-weight:700;color:var(--muted);cursor:pointer;padding:6px 4px;list-style:none;display:flex;align-items:center;gap:6px}
.provider-group[open] summary{color:var(--text)}
.avail-card{display:flex;align-items:center;justify-content:space-between;gap:8px;background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:8px 10px}
.avail-card.is-in-chain{opacity:.55;border-style:dashed}
.avail-card b{font-size:13px;display:block}
.avail-card small{font-size:11px;color:var(--muted)}
.pane--active .chain-list{padding:8px}
.pane-drop-hint{margin:0 8px 8px;border:1px dashed var(--border);border-radius:10px;padding:10px;text-align:center;color:var(--muted);font-size:12px}
.pane--active.drag-over{border-color:var(--accent);box-shadow:0 0 0 2px rgba(26,115,232,.15)}
.sr-only{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0)}
@media(max-width:768px){.dual-pane{grid-template-columns:1fr} .pane--available{order:2} .pane--active{order:1}}
@media(prefers-reduced-motion:reduce){.chain-item{transition:none}}
```

```js
// js/app.js — wiring sketch (reuses hasKeyFor, persistChains, renderAllChains)
const availSearch = document.getElementById('avail-search');
availSearch?.addEventListener('input', e=>{
  const q = e.target.value.trim().toLowerCase();
  document.querySelectorAll('.avail-card').forEach(c=>{
    c.hidden = q && !c.dataset.id.toLowerCase().includes(q);
  });
});
document.querySelectorAll('.segmented [data-filter]').forEach(btn=>{
  btn.addEventListener('click', ()=>{
    document.querySelectorAll('.segmented [data-filter]').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    const f = btn.dataset.filter;
    document.querySelectorAll('.provider-group').forEach(g=>{
      g.hidden = f!=='all' && g.dataset.provider!==f;
    });
  });
});
// +  → move to Active
document.getElementById('avail-list')?.addEventListener('click', e=>{
  const btn = e.target.closest('button');
  if(!btn) return;
  const card = btn.closest('.avail-card');
  polishChainState.push({id: card.dataset.id, provider: card.dataset.provider, enabled:true});
  persistChains(); renderAllChains();
  document.getElementById('chain-live').textContent = `${card.dataset.id} به زنجیره اضافه شد`;
});
```

---

## 11. تست دستی (طبق `AGENTS.md:3`)

1. کلید Groq را بگذار → «لیست مدل‌ها» → Available پر می‌شود (Groq ✓، OpenRouter ⚠).
2. روی `＋` دو مدل بزن → Active ۲ آیتم، rank ۱/۲.
3. یکی را drag کن جای ۱ → Toast + live region فارسی.
4. سوییچ یکی را خاموش → opacity کم، badge «خاموش».
5. «همه خاموش» → همه سوییچ‌ها off.
6. جستجو `qwen` → فقط qwenها می‌مانند.
7. حذف با `×` → به Available برمی‌گردد با تیک «✓ در زنجیره» برداشته.
8. فایل ۵ ثانیه فارسی را ضبط کن → لاگ باید «پالیش qwen… نشست» را نشان دهد.

---

## 12. تصمیم

*این Spec آمادهٔ تبدیل به تیکت `ticket/xx-dual-pane-builder` است.* تغییر فقط یک Seam را لمس می‌کند (`app.js` + `css`) و اسکیمای `Storage` دست نمی‌خورد — migration لازم نیست.
