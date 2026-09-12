---
name: wave-1
description: Refining wave 1 — high leverage, low risk (tickets 37-42)
created: 2026-09-12
base_commit: 5624781
branch: ticket/audit-refining-report
status: todo
---

# STATE: phase 0/6 — status: todo

## Phases
1. T37 provider seam (`tickets/37-ref-provider-seam.md`) — status: todo
2. T38 format helpers (`tickets/38-ref-format-helpers.md`) — status: todo
3. T39 storage cache (`tickets/39-ref-storage-cache.md`) — status: todo
4. T40 stats load (`tickets/40-ref-stats-load.md`) — status: todo
5. T41 persist debounce (`tickets/41-ref-persist-debounce.md`) — status: todo
6. T42 dead cleanup (`tickets/42-ref-dead-cleanup.md`) — status: todo

## Rules
- One ticket = one PR = one seam. No behavior change → no VERSION bump.
- Each phase: `node --check` + `git diff --check` + `hamnegar-reviewer` PASS + smoke.
- Order: 37 → 38 → 39 → 40 → 41 → 42 (44 depends on 37; 45 on 38 — next wave).
