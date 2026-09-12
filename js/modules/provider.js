// Module: provider — single owner of provider identity (ticket 37).
// Interface: canonicalize(pid), resolve(entry, fallback)->providerId|null,
// hasKey(entry, fallback)->bool, hasKeyById(providerId)->bool,
// displayPair(providerId, model)->string.
// Depth: hides legacy migration (gemini→google, zenspark→null), id inference
// (groq/^gemini/:free rules) and key-material lookup behind three verbs, so
// chains/stagebar/settingsModal/transcription never branch on raw ids.
// Canonical ids: groq|google|openrouter (+ custom ids). No behavior change vs
// the scattered copies it replaces: every branch below mirrors the legacy
// chains.providerIdOf + Storage.hasKeyForProvider end-to-end mapping exactly
// (verified case-by-case: explicit raw honored, zenspark→false, gemini→google).
// Never logs keys.
import { Storage, migrateProviderId } from './storage.js';

export function canonicalize(pid){
  return migrateProviderId(pid);
}

// Canonical chain entry: {id, providerId, enabled}. Legacy `provider` alias +
// bare strings tolerated on read (same tolerance the old chains copy had).
export function resolve(entry, fallback = ''){
  if(entry && typeof entry === 'object'){
    const explicit = (typeof entry.providerId === 'string' && entry.providerId.trim())
      ? entry.providerId.trim()
      : (typeof entry.provider === 'string' && entry.provider.trim() ? entry.provider.trim() : '');
    if(explicit) return migrateProviderId(explicit);
  }
  const id = (entry && typeof entry === 'object') ? entry.id : entry;
  if(id === 'groq') return 'groq';
  if(typeof id === 'string' && /^gemini/i.test(id)) return 'google';
  if(typeof id === 'string' && id.includes(':free')) return 'openrouter';
  // Legacy providerIdOf returned `fallback || 'groq'` (groq-default) while
  // migrate maps purged ids (zenspark) to null: preserve both — purge stays
  // null, empty/blank falls back to groq.
  const m = migrateProviderId(fallback);
  return m === null ? null : (m || 'groq');
}

export function hasKey(entry, fallback = ''){
  const pid = resolve(entry, fallback);
  if(pid === null || !pid) return false;
  return Storage.hasKeyForProvider(pid);
}

export function hasKeyById(providerId){
  const pid = migrateProviderId(providerId);
  if(pid === null || !pid) return false;
  return Storage.hasKeyForProvider(pid);
}

// Single display-string helper — every user-facing provider/model readout
// renders as `providerId/modelId` (e.g. groq/qwen3.6-27b,
// google/gemini-flash-lite-latest). Display only: never used for selection,
// fallback, keys, or endpoints. (Moved verbatim from transcription.js.)
export function displayPair(providerId, model){
  let pid = canonicalize(providerId);
  pid = (typeof pid === 'string' ? pid.trim() : String(pid ?? '').trim());
  if(/^(groq|google|openrouter)$/i.test(pid)) pid = pid.toLowerCase();
  const mid = (typeof model === 'string' ? model.trim() : String(model ?? '').trim());
  if(pid && mid) return `${pid}/${mid}`;
  return pid || mid;
}
