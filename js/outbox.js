// Outbox: anything that needs to reach Earth (or the crew) waits here until
// there is a connection. Works fully offline.
import * as store from './store.js';
import { sendDelaySec } from './missions.js';

export async function queueReport({ level, summary, snapshot }) {
  const item = { id: store.uid(), type: 'report', createdAt: new Date().toISOString(), status: 'waiting', payload: { level, summary, snapshot, delay: sendDelaySec() } };
  await store.put('outbox', item);
  kick();
  return item;
}

export async function queueMessage({ kind, body = null, recipientId = null, openWhen = null, blob = null, mediaType = null, reportId = null }) {
  const id = store.uid();
  if (blob) await store.put('media', { id, blob, type: mediaType || blob.type, mine: true });
  const item = { id, type: 'message', createdAt: new Date().toISOString(), status: 'waiting', payload: { kind, body, recipientId, openWhen, mediaType: mediaType || blob?.type || null, hasMedia: !!blob, reportId, delay: sendDelaySec() } };
  await store.put('outbox', item);
  kick();
  return item;
}

export async function items() {
  return (await store.all('outbox')).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function remove(id) {
  await store.del('outbox', id);
}

// Ask the sync module to try sending, if a crew space exists.
export async function kick() {
  if (!navigator.onLine) return;
  if (!(await store.get('crew', null))) return;
  try { (await import('./sync.js')).flush(); } catch (e) { console.warn(e); }
}
