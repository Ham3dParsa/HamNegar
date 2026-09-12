---
name: bug-b
description: Bug wave B — needs refactor waves 1-2 (tickets 51-53, 56-59)
created: 2026-09-12
base_commit: 071429f
branch: ticket/audit-bug-diagnose
status: todo
---

# STATE: phase 0/7 — status: todo (blocked on 37, 39, 40, 43)

## Phases
1. T51 chain identity — status: todo, needs 37
2. T52 stt routing — status: todo, needs 37
3. T57 zen removal — status: todo, needs 37
4. T58 persist safety — status: todo, needs 39, 40
5. T53 polish paths — status: todo, needs 43
6. T56 error hints — status: todo, needs 43
7. T59 abort wiring — status: todo, needs 43

## Rules
- Same gates as bug-a. Order respects seam dependencies; 51 before 52 (same files).
