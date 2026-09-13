// Module: shell — Shell detection (web vs Tauri), pure, zero imports, zero side effects.
export function detectShell() {
  if (typeof window === 'undefined') return 'web';
  return Boolean(window.__TAURI__ || window.__TAURI_INTERNALS__) ? 'tauri' : 'web';
}
