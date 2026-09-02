---
name: oc-ci-loop
description: Poll OpenCode (and optionally Kilo) reviews + CI checks after PR push — delta fetch, triage, and rebase until MERGEABLE. Kilo is optional.
---

# OC CI Loop — HamNegar (Kilo optional)

Loop that turns a pushed PR into `MERGEABLE`. Primary reviewer is `opencode-agent[bot]`; `kilo-code-bot[bot]` is optional if `KILO_API_KEY` is set.

## When

- After `gh pr create` / `git push` on PR
- Before `gh pr merge --squash`
- When `mergeable == CONFLICTING`

## Steps

### 1. Poll reviewer delta (token-tight)

```powershell
gh api repos/Ham3dParsa/HamNegar/pulls/<n>/comments --jq '.[] | select(.user.login=="opencode-agent[bot]" or .user.login=="kilo-code-bot[bot]") | {id, h:(.body|length), user:.user.login}'
gh api repos/Ham3dParsa/HamNegar/issues/<n>/comments --jq '.[] | select(.user.login=="opencode-agent[bot]" or .user.login=="kilo-code-bot[bot]") | {id, h:(.body|length), user:.user.login}'
```

Save `id->h` to `$env:TEMP/opencode/reviewer_seen_<n>.json`. Only fetch full body for new/changed `h`:

```powershell
gh api repos/Ham3dParsa/HamNegar/pulls/comments/<id> --jq '.body'
gh api repos/Ham3dParsa/HamNegar/issues/comments/<id> --jq '.body'
```

If `gh api` fails, skip seen-update. Sleep 90s, timeout 30m. Push fix commits to trigger re-review.

### 2. Poll CI

```powershell
gh pr checks <n>
```

Require `review` (opencode-review) `pass` and `Kilo Code Review` `pass` only if Kilo is enabled; otherwise require only `review`. Match with `(?m)^\s*review(?!\w)\s+pass`.

On `fail`, `gh run view <run> --log-failed`, fix.

### 3. Conflict

If `CONFLICTING`: `git fetch origin; git rebase origin/main` → `GIT_EDITOR=true git rebase --continue`; `git push --force-with-lease`.

## Automation

```powershell
powershell -File scripts/oc_ci_loop.ps1 -PR <n>
```

## Triage

- `opencode [critical]/[warning]` (+ `kilo CRITICAL/WARNING` if present) → blocking, must fix
- `opencode [info]` (+ `kilo SUGGESTION`) → fix if ≤5 lines or clearly better, else defer with follow-up ticket
- Never silently ignore

Done when deltas triaged, required checks `pass`, `mergeable == MERGEABLE`.
