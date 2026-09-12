# REVIEW.md — HamNegar automated-review guidance

Guidance for the automated reviewers (`kilo-code-bot`, `opencode-agent`) on PRs in this repo.
This file is the shared source of truth for repo-specific traps. Kilo reads it from the
PR base branch (`origin/main`); keep it under 10,000 characters.

HamNegar is a Persian voice-typing web app: thin `index.html` shell, `css/app.css`,
`js/app.js` wiring, deep modules under `js/modules/` (`storage`, `logger`, `quota`,
`audio`, `realtime`, `transcription`). One ticket touches one seam (AGENTS.md §1).

## Review style

Be STRICT: flag all potential issues, prioritize quality and security.
Gate threshold is "Warnings and above" — fail the check on any `[critical]` or `[warning]`.

- `[critical]` — security hole, data loss, broken auth/fallback, secret leak. Must fix.
- `[warning]` — bug, race, wasted API cost, seam violation, wrong fallback. Must fix.
- `[info]` — nit, style preference, optional polish. Never blocks merge.

Set `APPROVED` only with zero `[critical]`/`[warning]`. Otherwise `REQUEST_CHANGES`.

## What to focus on

- Security: XSS via `innerHTML` (must escape/`textContent`), key exposure in logs/DOM,
  `file://` CORS banner, `https://`-only BaseURLs, untrusted custom hosts (confirm gate).
- Performance: audio `blob` size guard before `fetch`, timeout/abort handling,
  polish output budget, 429 backoff (`setTimeout 500-600ms`).
- Bugs: realtime race (`rtBefore`/`rtAfter`), STT/polish fallback chains
  (401/403 skip keyless, 404 next model, 429 next engine), chain normalization
  (trim/dedup/allowlist), `finish_reason === 'length'` handling.
- Style: modular seam discipline — one module per file, small interface, no cross-seam logic.
- Tests: manual 5-second Persian transcription note required when the transcription
  seam is touched; no automated test CI exists, so the reviewer is the only gate.
- Docs: Persian UI strings (Vazirmatn, RTL), no English-only user-facing text.

## Mandatory traps

1. **Gemini Auth `AQ.`** — `AQ....` keys must go via `x-goog-api-key` header, never
   `?key=` query. Positive: `headers: { 'x-goog-api-key': k }` in `queryGemini`,
   `queryPolishViaGemini`, `listModels`, `testGemini`.
2. **file:// CORS** — `location.protocol === 'file:'` must show a warning banner and
   log `warn`, requiring `http://localhost` (never silent).
3. **Audio guard** — every transcription path before `fetch` must throw on
   `blob.size < 800` (status 400/TOO_SHORT) to avoid wasted API cost.
4. **Storage seam** — only `storage.js` may touch `localStorage` directly. All other
   modules use `Storage.getSettings()` / `Storage.saveSettings()` (plus typed
   helpers `getDraft`/`saveHeights`/`getQuotaRaw`). No raw `KEY_...` strings elsewhere.
5. **Realtime race** — `rtBefore`/`rtAfter`/base-pos must be a closure `snap` passed to
   `handleTranscription(blob, snap)`, with an `id`/`version` check discarding stale
   results. No overwritable globals.
6. **Fallback 401/403** — never unconditional `throw` on 401/403. Skip the keyless or
   rejected entry (`hasKeyFor`/`hasKeyForPolish` pre-flight + `continue` with warn log)
   and try the next chain entry. Same for polish/text chains.
7. **Secrets** — never commit `.env` (only `.env.example` with empty placeholders).
   Never log key material (`pairLabel` is display-only). `git diff --check` must be clean.
8. **No Live Transcribe** — do not add `BidiGenerateContent`/Live WebSocket. Realtime
   preview is Web Speech API only; finalization is Groq/Gemini REST.

## Verify (run, don't guess)

- `grep -rn "localStorage" js/ --include="*.js" | grep -v "storage.js"` → must be empty
- `grep -rn "?key=" js/ --include="*.js"` → must be empty
- every `fetch(` in `transcription.js` reachable only after a `blob.size < 800` guard
- `grep -rn "BidiGenerateContent" js/ --include="*.js"` → must be empty

## Don't duplicate / skip

No lint/test CI exists in this repo (only `opencode-review` + `opencode` workflows),
so do NOT assume CI catches anything — flag style, types, and logic yourself.
Skip and never comment on:

- `docs/evidence/**` PNGs, `temp/`, `.worktrees/`, `desktop/` binaries, lockfiles
- Bot-authored PRs (dependabot/renovate/`*[bot]`) — ignored by default
- Whitespace-only or single-file typo fixes — reply `lgtm` and nothing else

## Sub-agent usage

Sub-agents are read-only: no posting, no edits. Each returns path, line, severity,
rationale, confidence. The main reviewer verifies every finding, dedups, and posts.

- 0 sub-agents: docs-only, formatting-only, evidence-PNG-only, or single-file typo.
- 1 sub-agent: focused change (<300 lines, one seam) touching a risky area —
  auth/keys, fallback chains, storage migration, realtime race.
- 3 sub-agents: PR spanning 2-3 seams (e.g. storage + transcription + UI):
  1. data/seam reviewer (keys, chains, migration, quota), 2. UI reviewer
  (Persian strings, banner, progress/toast, a11y), 3. test/docs reviewer
  (manual-test note, CHANGELOG/VERSION per AGENTS.md §7 if behavioral).
- 6 sub-agents: only for >800 changed lines or security-sensitive cross-cutting work.
  Shard by independent seams, never all on the same files.

## Output format

```text
Status: REQUEST_CHANGES | APPROVED — N [warning/critical] must be fixed, M [info] optional
Must fix before merge:
- [ ] file_path:line_number [severity] description — positive fix
Optional / defer:
- [ ] file_path:line_number [info] description — defer reason
Traps checked: 1..8 pass/fail (or "none relevant" for docs-only)
```

Post inline comments on exact diff lines; suggestions are suggestions, the human decides.
If the PR is clean against everything above, comment `lgtm` (maps to `APPROVED`).
