# Evidence — PR #167: editable STT/polish chain editor (desktop)

## Headless (CI-safe, this checkout)
- `dotnet build desktop/src/HamNegar.Native.csproj`: 0 warnings, 0 errors.
- `git diff --check`: clean.
- Grep gates: `401` lands only in `desktop/src/ChainEngine.cs` (no fallback logic in the window);
  no user-facing literals outside `desktop/src/Lang.cs`
  (`SettingsWindow.xaml` carries no Persian/Latin label text; code-behind uses `Lang.Get(K.Chain*)`).

## OWNER VERIFY (real desktop, keys + mic required)
Full manual steps: `desktop/TODO.txt` phase 05 (chain editor UI adapter over ChainEngine):
1. Gear → Settings → "زنجیره رونویسی" / "Transcription chain": 4 rows with ☑ + ▲/▼;
   reorder → Save → reopen → order persists (`pill.settings.json` `sttChain`).
2. Restart persists; record → stop walks the saved order; single-engine and
   corrupt-`sttChain` fallback cases as in TODO.
3. "زنجیره پرداخت متن" / "Polish chain" + custom OpenAI-compatible provider
   (https-only validation); Theme/Lang live re-render of editor strings.
4. Manual 5-sec Persian transcription: record → stop → winner pair typed,
   engine chip shows the pair, history kept (transcription seam touched by reorder).

Screenshots (before/after Settings chain editor, FA + EN) to be attached here by the
owner from a real desktop run: `before-chain.png`, `after-chain-fa.png`, `after-chain-en.png`.
