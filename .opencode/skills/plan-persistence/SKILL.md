---
name: plan-persistence
description: Persist locked plans for HamNegar to .opencode/plans/<theme>/ with STATE, index and evidence gate so work resumes after compaction.
---

# Plan Persistence — HamNegar

Persist every locked plan. Update after each phase.

## Layout

- Theme folder: `.opencode/plans/<theme>/` (`transcription/`, `realtime/`, `ui/`)
- Theme index: `.opencode/plans/<theme>/index.md` — table Plans, Phases, Depends On, Status
- Plan: `.opencode/plans/<theme>/plan-<slug>.md` with frontmatter and top `STATE: phase N/M — status: in-progress|blocked|complete`

## Rules

- Frontmatter: `name, description, created, base_commit, branch, status`
- `STATE` line is first thing a resuming agent reads.
- Mark `complete` only with evidence: `commit: <sha>`, `test: ...`, `file: js/...`
- If `blocked`, add `## Blocked Questions` with date and owner decision.

## Resume

1. Read `index.md` → find active plan
2. Read `STATE`
3. Continue that phase — do not re-plan
