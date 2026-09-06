---
name: graphify-index
description: Build and query the HamNegar code knowledge graph with the graphify CLI — local AST extraction (tree-sitter, no API key), then query/path/explain against graphify-out/graph.json instead of reading all of js/app.js. Load when tracing wiring across js/app.js, js/modules/*, index.html, or reducing context reads for spec-to-ticket.
license: MIT
compatibility: opencode
metadata:
  category: indexing
  tool: graphifyy
author: Ham3dParsa
author_url: https://github.com/Ham3dParsa
---

# Graphify Index Skill — HamNegar

## When to load

- Tracing how `js/app.js` wiring reaches `js/modules/*` (e.g. btn-mic to transcribe to quota)
- Answering structural questions ("what connects X to Y?") without reading all of `js/app.js`
- Mapping a spec to tickets: which seam each behavior lives behind
- Reducing context-read overhead before touching a seam

## Install (one-time)

```bash
uv tool install graphifyy
```

## Build / Update

```bash
# Full AST index (code-only, no API key, fully local)
graphify . --code-only

# Incremental re-extract after code changes (offline, no LLM)
graphify update .
```

## Query (no LLM cost — pure graph traversal)

```bash
graphify query "how does btn-mic route to transcribe?"   # BFS, default 2000-token budget
graphify query "..." --budget 1000
graphify path "Storage" "Transcription"      # shortest path between two nodes
graphify explain "sttChain"                  # plain-language node + neighbors
```

## Repo-specific usage

- Graph output: `graphify-out/graph.json` (gitignored, never commit)
- `.graphify_analysis.json` written alongside
- **After meaningful code changes**, run `graphify update .` before structural queries
- Reserve `read`/`grep` for symbol-level details the graph can't answer
  (exact logic, literals, CSS values, Persian strings)

## Token-savings guidance

Prefer `graphify query "..."` over reading all of `js/app.js` when the
question is structural. `js/modules/*` are small — read them directly.
`js/app.js` is thousands of lines — query the graph first, then read
only the nodes it returns.

## Revert

- Uninstall: `uv tool uninstall graphifyy`
- Graph artifacts are gitignored; remove `graphify-out/` to clean disk
