---
name: model-config-redesign
description: Tabbed model/provider config — custom providers, easy-add wizard, unified chains
created: 2026-09-03
base_commit: 13f84f0
branch: ticket/ui-model-config
status: in-progress
---

STATE: phase 5/5 — status: complete (merged 054984f, 2026-09-03; commit: 054984f, test: review+Kilo pass, files: index.html css/app.css js/app.js js/modules/storage.js js/modules/transcription.js)

# Plan: Model Config Redesign (hybrid A+B+C)

Locked direction: tabbed modal (A skeleton) + provider cards/rows (B skin) + undo/live-region/keyboard (C behavior).

## Phase 1 — storage (seam: storage)
- Add `customProviders: [{id,name,baseURL,key}]`; keep Groq/Gemini/OpenRouter built-ins fixed.
- Unify both chains to `{id, providerId, enabled}`; STT gains `providerId`.
- One-time migration: legacy `string[]` STT, `{id,provider}` polish, `:free` ids.
- Acceptance: `node --check` clean, migration keeps existing chains, `git diff --check` clean.

## Phase 2 — transcription (seam: transcription)
- Generic OpenAI-compatible `queryChat(providerId,text)` + `querySTT(providerId,blob)` reused by Groq/OpenRouter/custom; https-only + confirm on untrusted host (extend `assertTrustedBase`).
- Single `listModels(providerId)` replacing `listGroqModels/listOpenRouterModels`; delete `detectPolishProvider` heuristic downstream.
- Keep: `reasoning_format hidden` for qwen, `cleanPolishOutput` + `validatePolishOutput` via shared helper.
- Acceptance: Groq polish still works, custom provider needs zero new network code.

## Phase 3 — ui structure (seam: ui)
- Modal tabs: providers / easy-add / chains. Keys editable only in providers tab (read-only badge in chains).
- Providers tab: status cards (dot + name + pill + test), collapsible body (key, BaseURL, model list), custom provider add form.
- Easy-add tab: provider select → model select (from cache) → target STT/Polish → add; duplicate blocked.
- Chains tab: ranked rows (rank, provider dot, label, switch, remove, arrows), master all-on/off, reset.
- Acceptance: each task has exactly one path; no datalist+Enter, no chip-click, no drag-only reorder.

## Phase 4 — ui behavior (seam: ui)
- Delete with 8s undo (no confirm dialog); single `role=status` live region for chain/model changes (Persian announcements); keyboard reorder (`Ctrl+Arrow`); focus trap + focus return; `prefers-reduced-motion` disables transitions; 44px targets.
- Acceptance: keyboard-only walkthrough passes (open → add provider → load models → add → reorder → toggle → delete → undo → Esc).

## Phase 5 — gate
- `hamnegar-reviewer` PASS, `git diff --check` clean, manual 5s Persian transcription + pasted log, PR to main.

## Rules (locked)
- R1 explicit target selector per add; no name-sniffing for provider.
- R2 reorder = arrows primary, drag bonus (kept, not removed).
- R3 keys only in providers tab; never in logs.
- R4 custom BaseURL: https enforced, confirm on untrusted host at fetch time.

## Evidence
- Phase 1: commit `<sha>`, files `js/modules/storage.js`
- Phase 2: commit `<sha>`, files `js/modules/transcription.js`
- Phase 3: commit `<sha>`, files `index.html`, `css/app.css`, `js/app.js`
- Phase 4: commit `<sha>`, files `js/app.js`, `css/app.css`
- Phase 5: reviewer PASS + PR URL
