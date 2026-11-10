// Sends the outbox and pulls new messages whenever there is a connection.
import * as store from './store.js';
import * as supa from './supa.js';

let timer = null;
let running = false;
const listeners = new Set();
export const state = { lastSync: null, error: null, code: null, busy: false };

export function onSync(fn) { listeners.add(fn); return () => listeners.delete(fn); }
function notify() { listeners.forEach((fn) => { try { fn(state); } catch (e) { console.error(e); } }); }

export function start() {
  if (timer) return;
  window.addEventListener('online', () => flush());
  document.addEventListener('visibilitychange', () => { if (!document.hidden) flush(); });
  timer = setInterval(() => { if (!document.hidden) flush(); }, 15000);
  flush();
}

export async function flush() {
  if (running || !navigator.onLine) return;
  const crew = await store.get('crew', null);
  if (!crew) return;
  running = true; state.busy = true; notify();
  try {
    await supa.ensureSession();
    await refreshMembership(crew);
    const fresh = await store.get('crew', null);
    if (fresh?.status === 'approved') {
      await sendOutbox(fresh);
      await pull(fresh);
    }
    state.error = null; state.code = null; state.lastSync = new Date().toISOString();
  } catch (e) {
    console.warn('Sync failed', e);
    state.error = e.message; state.code = e.code || null;
  } finally {
    running = false; state.busy = false; notify();
  }
}

async function refreshMembership(crew) {
  const me = await supa.myMembership(crew.id);
  const info = await supa.crewInfo(crew.id);
  const next = { ...crew, status: me?.status || 'removed', role: me?.role || crew.role, name: info?.name || crew.name, mission: info?.mission || crew.mission };
  if (me?.status === 'approved') {
    const list = await supa.members(crew.id);
    const prev = await store.get('members', []);
    if (JSON.stringify(prev) !== JSON.stringify(list)) await store.set('members', list);
  }
  if (JSON.stringify(next) !== JSON.stringify(crew)) await store.set('crew', next);
}

async function sendOutbox(crew) {
  const items = (await store.all('outbox')).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  for (const item of items) {
    try {
      if (item.type === 'report') {
        const row = await supa.insertReport({ crew_id: crew.id, level: item.payload.level, summary: item.payload.summary, snapshot: item.payload.snapshot, delay_seconds: item.payload.delay });
        await store.put('inbox', { id: row.id, kind: 'report', mine: true, level: row.level, body: row.summary, sent_at: row.created_at, deliver_at: row.deliver_at });
      } else {
        const p = item.payload;
        let media_path = null;
        if (p.hasMedia) {
          const m = await store.getOne('media', item.id);
          if (m?.blob) media_path = await supa.uploadMedia(crew.id, item.id, m.blob);
        }
        const row = await supa.insertMessage({ crew_id: crew.id, recipient_id: p.recipientId, kind: p.kind, body: p.body, media_path, media_type: p.mediaType, open_when: p.openWhen, report_id: p.reportId, delay_seconds: p.delay });
        if (p.hasMedia) {
          const m = await store.getOne('media', item.id);
          if (m) { await store.put('media', { ...m, id: row.id }); await store.del('media', item.id); }
        }
        await store.put('inbox', { ...row, mine: true });
      }
      await store.del('outbox', item.id);
    } catch (e) {
      await store.put('outbox', { ...item, status: 'failed', error: e.message });
      throw e;
    }
  }
}

async function pull(crew) {
  const uid = await supa.userId();
  const rows = await supa.fetchMessages(crew.id);
  const existing = new Map((await store.all('inbox')).map((r) => [r.id, r]));
  const fresh = [];
  for (const row of rows) {
    const prev = existing.get(row.id);
    const rec = { ...prev, ...row, mine: row.sender_id === uid };
    if (!prev || prev.opened_at !== row.opened_at || prev.deliver_at !== row.deliver_at) fresh.push(rec);
  }
  if (fresh.length) await store.putMany('inbox', fresh);
  // Save media for offline viewing.
  for (const row of rows) {
    if (!row.media_path) continue;
    const have = await store.getOne('media', row.id);
    if (have) continue;
    try {
      const blob = await supa.downloadMedia(row.media_path);
      await store.put('media', { id: row.id, blob, type: row.media_type || blob.type, mine: row.sender_id === uid });
    } catch (e) { console.warn('Media download failed', e); }
  }
  const crewRole = crew.role;
  if (crewRole === 'surgeon' || crewRole === 'astronaut') {
    const reports = await supa.fetchReports(crew.id);
    const prevReports = await store.get('reports', []);
    if (JSON.stringify(prevReports) !== JSON.stringify(reports)) await store.set('reports', reports);
  }
}
