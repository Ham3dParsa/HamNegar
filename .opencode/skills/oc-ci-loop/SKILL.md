---
name: oc-ci-loop
description: Gate PRs from push to MERGEABLE. Trigger after gh pr create or git push, on CONFLICTING state, or before gh pr merge.
---

# OC Merge Loop — HamNegar

Deterministic PR merge gate. Never treat `gh pr checks` passing alone as merge-ready.

## Merge-Ready Definition (All 5 Gates Required)

A PR is ready to merge **only** when every gate below passes on the latest `headRefOid`:
1. **Checks (`gh pr checks <n>`):** `review` is `pass` AND `Review Gate` is `pass` (and `Kilo Code Review` is `pass` only if present).
2. **PR Review State (`pulls/<n>/reviews`):** Latest formal review from `github-actions[bot]` or `opencode-agent[bot]` is `APPROVED` (or `COMMENT` containing `### ✅ تایید شده` / `### ✅ APPROVED`), with **zero** active `CHANGES_REQUESTED` reviews.
3. **Review Threads (GraphQL `reviewThreads`):** Every blocking (`🔴`/`🟡`) and triaged (`🔵`) thread has `isResolved == true`.
4. **GitHub Mergeability (`gh pr view`):** `mergeable == "MERGEABLE"` and `reviewDecision != "CHANGES_REQUESTED"`.
5. **No Unhandled Findings:** Every `[critical]`/`[warning]` is fixed or explicitly waived, and every `[info]` is triaged.

## Steps

### 1. Inspect PR State, Checks, and Reviews
Run all four checks for PR `<n>` (do not skip `reviews` or `reviewThreads`):

```bash
gh pr view <n> --repo Ham3dParsa/HamNegar --json headRefOid,mergeable,reviewDecision
gh pr checks <n> --repo Ham3dParsa/HamNegar
gh api repos/Ham3dParsa/HamNegar/pulls/<n>/reviews --jq '.[] | select(.user.login=="github-actions[bot]" or .user.login=="opencode-agent[bot]" or .user.login=="kilo-code-bot[bot]") | {id, state, commit_id, body_head:(.body[0:120])}'
gh api graphql -f query='query($o:String!,$r:String!,$n:Int!){repository(owner:$o,name:$r){pullRequest(number:$n){reviewThreads(first:50){nodes{id isResolved path line comments(first:1){nodes{body}}}}}}}' -F o=Ham3dParsa -F r=HamNegar -F n=<n>
```

- **Done when:** Current `headRefOid`, check statuses (`review`, `Review Gate`), formal review `state`, and all unresolved `reviewThreads` are accounted for.
- If checks are still `pending` / `in_progress`, wait 90s (max 30m total) and re-run Step 1. As soon as any `CHANGES_REQUESTED`, `action_required`, or `failure` appears, move immediately to Step 2 — waiting never turns `CHANGES_REQUESTED` into `APPROVED`.
- If `opencode-review` fails in `0s` on `push` (`workflow file issue`), inspect the workflow YAML/expressions immediately (e.g. `${{ runner.* }}` used in `jobs.<id>.env`) — `pull_request` will not trigger until fixed.

### 2. Triage, Fix or Escalate, and Resolve Threads
For every finding in `pulls/<n>/reviews` and `reviewThreads`:
- **Valid inline `suggestion` (no behavioral risk):** Batch multiple suggestions into a single commit (**Add suggestion to batch → Commit suggestions** in GitHub UI, or one combined local fix commit) so `opencode-review` (`cancel-in-progress: true`) runs once instead of burning free-tier API quota per suggestion. Applying suggestions **must** re-trigger review so `review` and `Review Gate` flip to `APPROVED` (`[bot]` commits stay skipped by the anti-loop guard).
- **Needs custom rewrite or justified waiver:** Executing worker subagent implements the rewrite or documents the waiver.
- **Significant behavioral, UX, product, or contract change:** Worker subagent **must escalate to the main agent**; the main agent resolves it per `AGENTS.md`/`REVIEW.md` or escalates to the **project owner**. Never silently ship a breaking behavioral change.
- **Reply & resolve every handled thread (never delete, never resolve silently):**
  - **Fixed / suggestion applied:** Reply on the thread with the fix commit SHA, then resolve it.
  - **Waived / deferred:** Reply on the thread with the explicit reason (or follow-up ticket), then resolve it.
  ```bash
  gh api graphql -f query='mutation($id:ID!,$body:String!){addPullRequestReviewThreadReply(input:{pullRequestReviewThreadId:$id,body:$body}){comment{id}}}' -F id=<threadId> -F body="Fixed in <sha> (or: Waived — <reason>)."
  gh api graphql -f query='mutation($id:ID!){resolveReviewThread(input:{threadId:$id}){thread{id isResolved}}}' -F id=<threadId>
  ```
- **Done when:** Every `[critical]`/`[warning]` is fixed or escalated, every `[info]` is triaged, all addressed/waived threads have an explicit reply + `isResolved == true`, and any fix commit is pushed to re-trigger review.

### 3. Resolve Conflicts
If `mergeable == "CONFLICTING"`:
```bash
git fetch origin && git rebase origin/main
# resolve conflicts, then:
git push --force-with-lease
```
- **Done when:** `mergeable == "MERGEABLE"` on the rebased head.

### 4. Final Verification Gate
Re-run Step 1 after the final push and confirm all 5 gates in **Merge-Ready Definition** pass simultaneously.
- **Done when:** `review` = `pass`, `Review Gate` = `pass`, zero active `CHANGES_REQUESTED` reviews, zero unresolved blocking `reviewThreads`, and `mergeable == "MERGEABLE"`. Only then report **READY TO MERGE**.
