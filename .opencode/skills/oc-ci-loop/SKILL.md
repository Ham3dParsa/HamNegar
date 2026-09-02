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
# --repo تا بیرون از .git هم کار کند؛ // "" تا body خالی Substring نترکد
gh api repos/Ham3dParsa/HamNegar/pulls/<n>/comments --jq '.[] | select(.user.login=="opencode-agent[bot]" or .user.login=="kilo-code-bot[bot]") | {id, h:(.body|length), user:.user.login}'
gh api repos/Ham3dParsa/HamNegar/issues/<n>/comments --jq '.[] | select(.user.login=="opencode-agent[bot]" or .user.login=="kilo-code-bot[bot]") | {id, h:(.body|length), user:.user.login}'
```

Save `id->h` to `$env:TEMP/opencode/reviewer_seen_<n>.json`. Only fetch full body for new/changed `h`:

```powershell
gh api repos/Ham3dParsa/HamNegar/pulls/comments/<id> --jq '.body // ""'
gh api repos/Ham3dParsa/HamNegar/issues/comments/<id> --jq '.body // ""'
# snippet امن حتی اگر body خالی باشد:
# $body = gh api ... --jq '.body // ""'; $snippet = if ([string]::IsNullOrEmpty($body)) { "" } else { $body.Substring(0, [Math]::Min(200,$body.Length)) }
```

If `gh api` fails, skip seen-update.

**Sleep is only while waiting for new comments.** After a new delta arrives, do **not** sleep waiting for green — immediately triage it (see Triage below). If it contains any `[critical]/[warning]` must-fix, fix the code in the PR branch and `git push` right away to trigger a re-review, then go back to polling. Reaching green requires this fix-and-push; waiting alone never turns `REQUEST_CHANGES` into `APPROVED`.

Sleep 90s between polls, timeout 30m total. Push fix commits to trigger re-review.

### 2. Poll CI

```powershell
gh pr checks <n> --repo Ham3dParsa/HamNegar
# یا از داخل پوشه HamNegar بدون --repo: gh pr checks <n>
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

## Completion

Cycle ends only at **suggestion: merge / Approved** — every `[critical]/[warning]` fixed or explicitly waived, every `[info]` triaged, `gh pr checks` all `pass`, `mergeable == MERGEABLE` and reviewer summary is `APPROVED` (or `suggestion: merge`). Do not stop at `REQUEST_CHANGES` or at `pass` alone.
