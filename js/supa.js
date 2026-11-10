// Thin wrapper around the Supabase client. Loaded only when messaging is used.
import { SUPABASE_URL, SUPABASE_ANON_KEY, MEDIA_BUCKET } from './config.js';

let clientP = null;

function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (window.supabase?.createClient) return resolve();
    const s = document.createElement('script');
    s.src = src; s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Could not load the messaging library'));
    document.head.append(s);
  });
}

export function client() {
  if (!clientP) {
    clientP = loadScript('vendor/supabase.js').then(() => window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, storageKey: 'horizon-auth' },
    }));
  }
  return clientP;
}

export class SetupError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}

export async function ensureSession() {
  const sb = await client();
  const { data } = await sb.auth.getSession();
  if (data?.session) return data.session;
  const { data: d2, error } = await sb.auth.signInAnonymously();
  if (error) {
    if (/anonymous/i.test(error.message)) throw new SetupError('anon-disabled', 'Anonymous sign-in is switched off for this Supabase project.');
    throw new SetupError('auth', error.message);
  }
  return d2.session;
}

export async function userId() {
  const s = await ensureSession();
  return s.user.id;
}

function check({ data, error }) {
  if (error) throw new Error(error.message);
  return data;
}

export async function createCrew(name, mission, displayName) {
  await ensureSession();
  const sb = await client();
  return check(await sb.rpc('create_crew', { p_name: name, p_mission: mission, p_display_name: displayName }));
}

export async function createInvite(crewId, role = 'family') {
  const sb = await client();
  await ensureSession();
  return check(await sb.rpc('create_invite', { p_crew: crewId, p_role: role }));
}

export async function joinCrew(code, displayName, relationship) {
  await ensureSession();
  const sb = await client();
  const rows = check(await sb.rpc('join_crew', { p_code: code, p_display_name: displayName, p_relationship: relationship || null }));
  return rows?.[0] || null;
}

export async function myMembership(crewId) {
  const sb = await client();
  const uid = await userId();
  const rows = check(await sb.from('crew_members').select('crew_id, role, status, display_name').eq('crew_id', crewId).eq('user_id', uid));
  return rows?.[0] || null;
}

export async function crewInfo(crewId) {
  const sb = await client();
  const rows = check(await sb.from('crews').select('id, name, mission').eq('id', crewId));
  return rows?.[0] || null;
}

export async function members(crewId) {
  const sb = await client();
  return check(await sb.from('crew_members').select('user_id, role, display_name, relationship, status, joined_at').eq('crew_id', crewId).order('joined_at'));
}

export async function setMemberStatus(crewId, userIdToSet, status) {
  const sb = await client();
  return check(await sb.rpc('set_member_status', { p_crew: crewId, p_user: userIdToSet, p_status: status }));
}

export async function updateMission(crewId, mission) {
  const sb = await client();
  return check(await sb.from('crews').update({ mission }).eq('id', crewId));
}

export async function uploadMedia(crewId, id, blob) {
  const sb = await client();
  const ext = (blob.type.split('/')[1] || 'webm').split(';')[0];
  const path = `${crewId}/${id}.${ext}`;
  check(await sb.storage.from(MEDIA_BUCKET).upload(path, blob, { contentType: blob.type.split(';')[0], upsert: true }));
  return path;
}

export async function downloadMedia(path) {
  const sb = await client();
  return check(await sb.storage.from(MEDIA_BUCKET).download(path));
}

export async function insertMessage(row) {
  const sb = await client();
  const rows = check(await sb.from('messages').insert(row).select());
  return rows[0];
}

export async function fetchMessages(crewId) {
  const sb = await client();
  return check(await sb.from('messages').select('*').eq('crew_id', crewId).order('sent_at', { ascending: false }).limit(100));
}

export async function markOpened(id) {
  const sb = await client();
  return check(await sb.from('messages').update({ opened_at: new Date().toISOString() }).eq('id', id));
}

export async function insertReport(row) {
  const sb = await client();
  const rows = check(await sb.from('reports').insert(row).select());
  return rows[0];
}

export async function fetchReports(crewId) {
  const sb = await client();
  return check(await sb.from('reports').select('*').eq('crew_id', crewId).order('created_at', { ascending: false }).limit(50));
}

export async function signOut() {
  const sb = await client();
  await sb.auth.signOut();
}
