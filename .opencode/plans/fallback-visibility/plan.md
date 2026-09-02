# Plan: Fallback Visibility — mic lock + dock progress + toast

STATE: LOCKED
Branch: ticket/fallback-visibility
Seams: logger, transcription, app-vitrine (js/app.js + index.html + css/app.css), tooling (.opencode/agents|skills)

## CONTRACT LOCK TEMPLATE

Rule #1 — mic busy lock
Decision: disable mic during transcribe, show breathing + spinner
Option Chosen: A) disabled+breathing+spinner+cancel (recommended)
Alternatives Rejected: B) queue second record (complex MediaRecorder parallel), C) no lock just toast (data loss remains)
Trade-offs: A prevents stale discard with minimal code, B adds queue complexity, C doesn't fix race
Owner Confirmation: "خوبه پروتوتایپ رو دوس داشتم. پیاده کن." (implicit proceed)
GATE STATUS: LOCKED

Rule #2 — progress dock
Decision: dock under .status-bar with stepper + bar, persistent while trying
Option Chosen: A) dock under status-bar (eye path near mic, always visible)
Alternatives Rejected: B) above output (pushes layout), C) modal only (hidden, against spec)
Trade-offs: A minimal layout shift, reuses tokens
Owner Confirmation: same
GATE STATUS: LOCKED

Rule #3 — toast policy
Decision: single replacing toast (id=stt-fallback) via Logger.toast + progress sync
Option Chosen: A) single updating toast with cause
Alternatives Rejected: B) stack (covers mic), C) no toast (dock enough but no cause)
Trade-offs: A keeps pill visible 2-4s, explains 429/404
Owner Confirmation: same
GATE STATUS: LOCKED

Rule #4 — cancel/abort
Decision: cancel button aborts transcribe via AbortController, shake on tap while busy
Option Chosen: A) AbortController per transcribe, cancel button + Escape
Alternatives Rejected: B) no cancel (user stuck), C) kill all fetch (too broad)
Trade-offs: A respects fetch signal, needs plumbing into queryGroq/Gemini
Owner Confirmation: same
GATE STATUS: LOCKED

## Files
- js/modules/logger.js — add setProgress/dismissProgress + toastProgress
- js/modules/transcription.js — plumb signal + Logger.setProgress calls
- js/app.js — isTranscribing guard, setMicBusy, dock rendering, stale prevention
- css/app.css — dock + mic animations (breathe, spin, shake, prefers-reduced-motion)
- index.html — dock section + mic-group wrapper + cancel button
- prototype-fallback.html — reference (keep)

## Dependencies
No new callback prefixes, no schema migration.

<SYSTEM_GATE> Contract lock required before proceeding </SYSTEM_GATE>
