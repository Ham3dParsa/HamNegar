---
name: bug-a
description: Bug wave A — independent guards (tickets 60-61)
created: 2026-09-12
base_commit: 071429f
branch: ticket/audit-bug-diagnose
status: todo
---

# STATE: phase 0/2 — status: todo (no dependencies — can start immediately)

## Phases
1. T60 audio guards (`tickets/60-bug-audio-guards.md`) — status: todo
2. T61 stale UI (`tickets/61-bug-stale-ui.md`) — status: todo

## Rules
- Bugfix PRs: VERSION bump + CHANGELOG entry (AGENTS.md §7).
- Each phase: `node --check` + `git diff --check` + `hamnegar-reviewer` PASS (full) + smoke of the exact trigger.
