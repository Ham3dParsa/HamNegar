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
gh api repos/Ham3dParsa/HamNegar/pulls/<n>/reviews --jq '.[] | select(.user.login=="opencode-agent[bot]" or .user.login=="github-actions[bot]" or .user.login=="kilo-code-bot[bot]") | {id, state, h:(.body|length), user:.user.login}'
gh api repos/Ham3dParsa/HamNegar/pulls/<n>/comments --jq '.[] | select(.user.login=="opencode-agent[bot]" or .user.login=="github-actions[bot]" or .user.login=="kilo-code-bot[bot]") | {id, h:(.body|length), user:.user.login}'
gh api repos/Ham3dParsa/HamNegar/issues/<n>/comments --jq '.[] | select(.user.login=="opencode-agent[bot]" or .user.login=="kilo-code-bot[bot]") | {id, h:(.body|length), user:.user.login}'
```

Save `id->h` to `$env:TEMP/opencode/reviewer_seen_<n>.json`. Only fetch full body for new/changed `h`:

```powershell
gh api repos/Ham3dParsa/HamNegar/pulls/<n>/reviews/<id> --jq '.body // ""'
gh api repos/Ham3dParsa/HamNegar/pulls/comments/<id> --jq '.body // ""'
gh api repos/Ham3dParsa/HamNegar/issues/comments/<id> --jq '.body // ""'
# snippet امن حتی اگر body خالی باشد:
# $body = gh api ... --jq '.body // ""'; $snippet = if ([string]::IsNullOrEmpty($body)) { "" } else { $body.Substring(0, [Math]::Min(200,$body.Length)) }
```

If `gh api` fails, skip seen-update.

**Sleep is only while waiting for new comments/reviews.** After a new delta arrives, do **not** sleep waiting for green — immediately triage it (see Triage below). If it contains any `🔴 [critical]`/`🟡 [warning]` must-fix (or `state == "CHANGES_REQUESTED"`), fix the code in the PR branch (or apply valid `suggestion` blocks) and `git push` right away to trigger a re-review, then go back to polling. Reaching green requires this fix-and-push; waiting alone never turns `⚠️ REQUEST_CHANGES` into `✅ APPROVED`.

Sleep 90s between polls, timeout 30m total. Push fix commits to trigger re-review.

### 2. Poll CI

```powershell
gh pr checks <n> --repo Ham3dParsa/HamNegar
# یا از داخل پوشه HamNegar بدون --repo: gh pr checks <n>
```

Require `review` (opencode-review) and `Review Gate` `pass` (plus `Kilo Code Review` `pass` only if Kilo is enabled). Match with `(?m)^\s*review(?!\w)\s+pass` and `(?m)^\s*Review Gate\s+pass`.

On `fail`, `gh run view <run> --log-failed`, fix.

### 3. Conflict

If `CONFLICTING`: `git fetch origin; git rebase origin/main` → `GIT_EDITOR=true git rebase --continue`; `git push --force-with-lease`.

## Automation

```powershell
powershell -File scripts/oc_ci_loop.ps1 -PR <n>
```

## Triage & Resolution

- `opencode` `🔴 [critical]` / `🟡 [warning]` (or `[critical]`/`[warning]`, or `kilo CRITICAL/WARNING` if present) → blocking, must fix.
- `opencode` `🔵 [info]` (or `[info]`, or `kilo SUGGESTION`) → fix if ≤5 lines or clearly better, else defer with follow-up ticket.
- **Applying suggestions vs. rewriting/waiving:**
  - Valid, justified inline ```` ```suggestion ```` blocks → apply directly to the PR branch and push.
  - Findings requiring a custom rewrite or explicit ignore/waiver → implemented or documented by the executing worker subagent per `oc-ci-loop`.
  - **Escalation for significant behavioral changes:** If a finding could introduce a significant behavioral, UX, product, or contract change, the worker subagent **must escalate it to the main agent**; the main agent either resolves it per `AGENTS.md`/`REVIEW.md` or escalates to the **project owner**.
- **Resolve threads (never delete):** After a finding is fixed/applied or explicitly waived, mark its review thread resolved via GitHub GraphQL (`resolveReviewThread`) so it collapses cleanly without deleting review history:
  ```bash
  # List unresolved thread IDs on PR <n>
  gh api graphql -f query='query($o:String!,$r:String!,$n:Int!){repository(owner:$o,name:$r){pullRequest(number:$n){reviewThreads(first:50){nodes{id isResolved path line}}}}}' -F o=Ham3dParsa -F r=HamNegar -F n=<n>
  # Resolve a specific thread ID
  gh api graphql -f query='mutation($id:ID!){resolveReviewThread(input:{threadId:$id}){thread{id isResolved}}}' -F id=<threadId>
  ```
- Footnote (`> 🤖 **Reviewer:** ... · ⏱️ **Duration:** ...`) identifies which fallback model produced the review and exact wall-clock duration.
- Never silently ignore.

## Completion

Cycle ends only at **✅ APPROVED / suggestion: merge** — every `[critical]/[warning]` fixed or explicitly waived, every `[info]` triaged, all blocking review threads resolved, `gh pr checks` (`review` + `Review Gate`) `pass`, `mergeable == MERGEABLE`, and reviewer PR review `state == "APPROVED"` or summary contains `APPROVED` (with zero `REQUEST_CHANGES`). Do not stop at `⚠️ REQUEST_CHANGES` or at `pass` alone.
