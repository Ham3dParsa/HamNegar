// Module: voiceQueue
// Interface: save(entry), list(), get(id), remove(id), updateReason(id, reason, statusCode), clear()
// Depth: persists failed/offline audio Blobs in IndexedDB so recordings survive network
// drops and page reloads, with automatic in-memory fallback when IndexedDB is unavailable.

const DB_NAME = 'hamnegar-voice-vault';
const DB_VERSION = 1;
const STORE_NAME = 'pending';
const MAX_ITEMS = 20;

let dbPromise = null;
const memoryFallback = new Map();

function hasIDB() {
  try {
    return typeof indexedDB !== 'undefined' && !!indexedDB;
  } catch {
    return false;
  }
}

function openDB() {
  if (!hasIDB()) return Promise.resolve(null);
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
          store.createIndex('createdAt', 'createdAt', { unique: false });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return dbPromise;
}

function makeId() {
  return 'v_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
}

function txDone(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error('IndexedDB transaction failed'));
    tx.onabort = () => reject(tx.error || new Error('IndexedDB transaction aborted'));
  });
}

function reqPromise(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('IndexedDB request failed'));
  });
}

async function pruneIfNeeded(db) {
  const all = await listFromDB(db);
  if (all.length <= MAX_ITEMS) return;
  const excess = all.slice(MAX_ITEMS);
  const tx = db.transaction(STORE_NAME, 'readwrite');
  const store = tx.objectStore(STORE_NAME);
  for (const item of excess) store.delete(item.id);
  await txDone(tx);
}

async function listFromDB(db) {
  const tx = db.transaction(STORE_NAME, 'readonly');
  const rows = await reqPromise(tx.objectStore(STORE_NAME).getAll());
  return (rows || []).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
}

export const VoiceQueue = {
  async save({ id, blob, durationMs = 0, name = '', reason = '', statusCode = 0, createdAt = Date.now() }) {
    if (!blob) throw new Error('blob is required');
    const item = {
      id: id || makeId(),
      blob,
      mimeType: blob.type || 'audio/webm',
      size: blob.size || 0,
      durationMs: Math.max(0, Number(durationMs) || 0),
      name: String(name || '').slice(0, 120),
      reason: String(reason || '').slice(0, 200),
      statusCode: Number(statusCode) || 0,
      createdAt,
    };
    const db = await openDB();
    if (!db) {
      memoryFallback.set(item.id, item);
      while (memoryFallback.size > MAX_ITEMS) {
        const oldest = [...memoryFallback.values()].sort((a, b) => a.createdAt - b.createdAt)[0];
        if (oldest) memoryFallback.delete(oldest.id);
        else break;
      }
      return item;
    }
    try {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put(item);
      await txDone(tx);
      await pruneIfNeeded(db);
      return item;
    } catch {
      memoryFallback.set(item.id, item);
      return item;
    }
  },

  async list() {
    const db = await openDB();
    if (!db) {
      return [...memoryFallback.values()].sort((a, b) => b.createdAt - a.createdAt);
    }
    try {
      const rows = await listFromDB(db);
      if (!memoryFallback.size) return rows;
      const merged = new Map(rows.map((r) => [r.id, r]));
      for (const [k, v] of memoryFallback) merged.set(k, v);
      return [...merged.values()].sort((a, b) => b.createdAt - a.createdAt);
    } catch {
      return [...memoryFallback.values()].sort((a, b) => b.createdAt - a.createdAt);
    }
  },

  async get(id) {
    if (!id) return null;
    if (memoryFallback.has(id)) return memoryFallback.get(id);
    const db = await openDB();
    if (!db) return null;
    try {
      const tx = db.transaction(STORE_NAME, 'readonly');
      return (await reqPromise(tx.objectStore(STORE_NAME).get(id))) || null;
    } catch {
      return null;
    }
  },

  async updateReason(id, reason, statusCode = 0) {
    const item = await this.get(id);
    if (!item) return null;
    item.reason = String(reason || '').slice(0, 200);
    item.statusCode = Number(statusCode) || 0;
    return this.save(item);
  },

  async remove(id) {
    if (!id) return;
    memoryFallback.delete(id);
    const db = await openDB();
    if (!db) return;
    try {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).delete(id);
      await txDone(tx);
    } catch {}
  },

  async clear() {
    memoryFallback.clear();
    const db = await openDB();
    if (!db) return;
    try {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).clear();
      await txDone(tx);
    } catch {}
  },
};
