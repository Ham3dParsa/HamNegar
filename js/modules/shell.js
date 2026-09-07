// Module: shell — Shell detection (web vs Tauri), pure, zero imports, zero side effects.
export const SHELL_MODES = ['web', 'tauri'];

export function isTauri() {
  if (typeof window === 'undefined') return false;
  return Boolean(window.__TAURI__ || window.__TAURI_INTERNALS__);
}

export function isWeb() {
  return !isTauri();
}

export function detectShell() {
  return isTauri() ? 'tauri' : 'web';
}

export function getShellCapabilities() {
  // Honest false defaults: shape of the contract only, no false claims
  // until the real Tauri bridge lands.
  return {
    globalShortcut: false,
    autoPaste: false,
    alwaysOnTop: false,
    transparent: false,
  };
}
