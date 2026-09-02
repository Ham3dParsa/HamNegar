# Seam Registry — HamNegar

| # | Module | Path | Interface |
|---|---|---|---|
| 1 | Storage | js/modules/storage.js | getSettings/saveSettings, getDraft/saveDraft, getHeights |
| 2 | Transcription | js/modules/transcription.js | transcribe(blob), testGroq/testGemini (+ OpenRouter) |
| 3 | Audio | js/modules/audio.js | start/stop, getAnalyser |
| 4 | Realtime | js/modules/realtime.js | start/stop, isSupported |
| 5 | Quota | js/modules/quota.js | record, render, LIMITS |
| 6 | Logger/UI | js/modules/logger.js + css/app.css | log/setStatus/toast |
