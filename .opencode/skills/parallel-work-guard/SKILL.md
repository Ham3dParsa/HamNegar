---
name: parallel-work-guard
description: Guard parallel work on HamNegar — check seam claims before lock and isolate every implementation in its own git worktree so concurrent branches never collide.
---

# Parallel Work Guard — HamNegar

**Seam** is where a module's interface lives. A **claim** is a locked ticket's ownership of one or more seams. `SEAMS.md` is the canonical list — do not invent names.

Run this skill at every Contract Lock and before any branch/worktree.

## Worktree gate (always)

Every locked implementation runs in its own worktree — never in `main`.

- Before lock, confirm target branch has a worktree (`using-git-worktrees`).
- Never leave uncommitted changes in `main`.
- If `main` is dirty, treat it as read-only owned by another session — route work to your worktree and report it.

## Steps

1. **Locate claims file** — `git rev-parse --git-common-dir` → `<dir>/parallel-work-claims.json`. If missing, create `{"claims":[]}`. If malformed, stop and ask owner to repair.

2. **List seams** — from `SEAMS.md`, name every seam this ticket touches.

3. **Check overlap** — for each seam, scan claims for same seam held by another branch.
   - No overlap → proceed.
   - Overlap → stop. Report seam, claiming branch, resource. Ask owner: proceed or wait.

4. **Acquire on LOCKED** — `git branch --show-current` → `<branch>`, then:
   ```
   powershell scripts/claim_seam.ps1 -Command acquire -Branch <branch> -Seams <s1,s2> -RuleIds <r1,r2>
   ```
   Pass comma-separated strings, not arrays.

5. **Release on cleanup** — `powershell scripts/claim_seam.ps1 -Command release -Branch <branch>`

## Completion

Every seam in the contract has zero overlap or an explicit owner decision. Work is in an isolated worktree and `main` is clean.
