---
name: hamnegar-reviewer
description: Independent pre-PR code review for HamNegar — assume wrong until proven, check REVIEW.md traps, seam integrity, and contract compliance before any commit/PR. Load before committing or creating a PR; delegates to hamnegar-reviewer subagent.
license: MIT
compatibility: opencode
metadata:
  category: validation
  gate: pre-commit
  subagent: hamnegar-reviewer
author: Ham3dParsa
author_url: https://github.com/Ham3dParsa
---

# HamNegar Reviewer Skill

## When to load
- Immediately before any `git commit` or `gh pr create`
- After implementation completes, before PR — mandatory for behavioral changes (AGENTS.md §1 modular, §5 git)
- When user says "review", "pre-PR check", "is this safe to merge"

## Gate Protocol

### 1. Locate target
```powershell
git worktree list
git rev-parse --show-toplevel
git status
git diff --staged --check
git diff --check
```

### 2. Delegate to subagent
Launch `hamnegar-reviewer` as read-only reviewer:

```
Task(subagent_type="hamnegar-reviewer", prompt="Review the diff in this worktree against the locked contract and REVIEW.md traps. Assume wrong until proven. Report 0 or list confirmed findings with file:line.")
```

The skill itself does NOT edit files — only the subagent reports.

### 3. Required checks (subagent covers)

| Check | Command / Evidence |
|---|---|
| Gemini Auth | `grep -rn "x-goog-api-key" js/` must show `queryGemini`; `grep -rn "\?key=" js/` must be 0 |
| Storage seam | `grep -rn "localStorage" js/ --include="*.js" | grep -v "storage.js"` must be 0 |
| Audio guard | every `fetch` in `transcription.js` preceded by `blob.size < 800` |
| Realtime race | `snap` passed to `handleTranscription`, `id/version` check present, no global `rtBefore` |
| Fallback 401 | chain loop checks `hasKeyFor(next)` before throw (transcription.js:112-130, 145-170) |
| file:// banner | `location.protocol === 'file:'` in `js/app.js` |
| .env | `git diff --staged --name-only` must not contain `.env` |
| One seam per ticket | diff touches only declared seam(s) from contract lock |

### 4. Gate Verdict
- `PASS` = subagent reports `0 confirmed findings` — proceed to `pre-commit` checks (`git diff --check`, secret scan, Conventional Commits, explicit `git add file`)
- `FAIL` = any confirmed finding — do NOT commit/PR. Fix, then re-run reviewer until `0 confirmed findings` and re-verify.

### 5. Keywords
Include before commit/PR:
```
<SYSTEM_GATE> Independent review required before commit </SYSTEM_GATE>
```

## Behavior
- Run read-only checks first, then delegate — never edit during review
- Return consolidated `PASS`/`FAIL` with file:line citations
- On `FAIL`, list actionable fixes ordered by severity (Critical > Warning)

## Notes
- Lightweight path: docs/skills/plans-only changes skip full behavioral checks — still run `git diff --check` + storage/grep scans
- CI will re-run `opencode-review`; local gate is cheaper — fix here first
- Mirrors `#T-Bot/HamZaban` `hamzaban-reviewer` (§6.3 Independent Review Gate) adapted to HamNegar seams: `storage`, `logger`, `quota`, `audio`, `realtime`, `transcription`
