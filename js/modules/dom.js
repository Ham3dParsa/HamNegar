// Module: dom (ticket 38) — single getElementById shorthand.
// Interface: $(id). No `el` helper: no shared createElement pattern exists
// in the codebase (only ad-hoc document.createElement calls), so keep minimal.
export const $ = (id) => document.getElementById(id);
