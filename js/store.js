// On-device storage (IndexedDB). Health data lives here and never leaves the
// device unless the astronaut chooses to share a report.

const DB_NAME = 'horizon';
const DB_VERSION = 1;
const STORES = {
  kv: { keyPath: 'k' },
  checkins: { keyPath: 'id', index: 'date' },
  games: { keyPath: 'id', index: 'game' },
  outbox: { keyPath: 'id' },
  inbox: { keyPath: 'id' },
  media: { keyPath: 'id' },
};

let dbp = null;
const memory = new Map(Object.keys(STORES).map((s) => [s, new Map()]));
let useMemory = false;

function open() {
  if (dbp) return dbp;
  dbp = new Promise((resolve) => {
    let req;
    try { req = indexedDB.open(DB_NAME, DB_VERSION); } catch { useMemory = true; return resolve(null); }
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const [name, cfg] of Object.entries(STORES)) {
        if (db.objectStoreNames.contains(name)) continue;
        const os = db.createObjectStore(name, { keyPath: cfg.keyPath });
        if (cfg.index) os.createIndex(cfg.index, cfg.index);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => { useMemory = true; resolve(null); };
    req.onblocked = () => { useMemory = true; resolve(null); };
  });
  return dbp;
}

function tx(db, store, mode, fn) {
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const os = t.objectStore(store);
    let result;
    const r = fn(os);
    if (r) r.onsuccess = () => { result = r.result; };
    t.oncomplete = () => resolve(result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

const listeners = new Set();
export function onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }
function changed(store) { listeners.forEach((fn) => { try { fn(store); } catch (e) { console.error(e); } }); }

export async function all(store) {
  const db = await open();
  if (useMemory || !db) return [...memory.get(store).values()];
  return tx(db, store, 'readonly', (os) => os.getAll());
}

export async function getOne(store, id) {
  const db = await open();
  if (useMemory || !db) return memory.get(store).get(id);
  return tx(db, store, 'readonly', (os) => os.get(id));
}

export async function put(store, obj) {
  const db = await open();
  if (useMemory || !db) memory.get(store).set(obj[STORES[store].keyPath], obj);
  else await tx(db, store, 'readwrite', (os) => os.put(obj));
  changed(store);
  return obj;
}

export async function putMany(store, objs) {
  const db = await open();
  if (useMemory || !db) objs.forEach((o) => memory.get(store).set(o[STORES[store].keyPath], o));
  else await tx(db, store, 'readwrite', (os) => { objs.forEach((o) => os.put(o)); return null; });
  changed(store);
}

export async function del(store, id) {
  const db = await open();
  if (useMemory || !db) memory.get(store).delete(id);
  else await tx(db, store, 'readwrite', (os) => os.delete(id));
  changed(store);
}

export async function clear(store) {
  const db = await open();
  if (useMemory || !db) memory.get(store).clear();
  else await tx(db, store, 'readwrite', (os) => os.clear());
  changed(store);
}

export async function get(k, fallback = undefined) {
  const row = await getOne('kv', k);
  return row === undefined ? fallback : row.v;
}

export async function set(k, v) {
  await put('kv', { k, v });
  return v;
}

export function uid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return 'id-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

// Ask the browser to keep our storage even when the device runs low on space.
export async function requestPersistence() {
  try { if (navigator.storage?.persist) return await navigator.storage.persist(); } catch { /* ignore */ }
  return false;
}

export async function exportAll() {
  const out = { exportedAt: new Date().toISOString(), app: 'Horizon' };
  for (const s of ['kv', 'checkins', 'games', 'outbox', 'inbox']) {
    out[s] = (await all(s)).map((r) => {
      const copy = { ...r };
      delete copy.blob;
      return copy;
    });
  }
  return out;
}

export async function wipeAll() {
  for (const s of Object.keys(STORES)) await clear(s);
}
