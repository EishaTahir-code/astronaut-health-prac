import * as store from './store.js';
import { dayKey, addDays } from './ui.js';
import { INDICATORS, evaluateReaction } from './health.js';

export async function checkins() {
  return (await store.all('checkins')).sort((a, b) => a.at.localeCompare(b.at));
}

export async function games(kind) {
  const rows = (await store.all('games')).sort((a, b) => a.at.localeCompare(b.at));
  return kind ? rows.filter((g) => g.game === kind) : rows;
}

export async function todayCheckin() {
  const key = dayKey();
  const list = (await checkins()).filter((c) => c.date === key);
  return list.at(-1) || null;
}

// Latest status for each indicator, from the most recent check-in that has it.
export async function latestStatuses() {
  const list = await checkins();
  const out = {};
  for (const ind of INDICATORS) {
    for (let i = list.length - 1; i >= 0; i--) {
      const s = list[i].statuses?.[ind.id];
      if (s) { out[ind.id] = { ...s, at: list[i].at, values: list[i].values, today: list[i].date === dayKey() }; break; }
    }
  }
  return out;
}

export async function latestReaction() {
  const all = await games('signal');
  if (!all.length) return null;
  const last = all.at(-1);
  const prev = all.slice(0, -1);
  return { result: last, status: evaluateReaction(last, prev) };
}

export async function streak() {
  const days = new Set((await checkins()).filter((c) => !c.sample).map((c) => c.date));
  const sampleDays = new Set((await checkins()).map((c) => c.date));
  const source = days.size ? days : sampleDays;
  let n = 0;
  let d = new Date();
  if (!source.has(dayKey(d))) d = addDays(d, -1);
  while (source.has(dayKey(d))) { n++; d = addDays(d, -1); }
  return n;
}

export const BADGES = [
  { id: 'first', name: 'First check-in', test: (c) => c.length >= 1 },
  { id: 'week', name: '7-day streak', test: (c, g, s) => s >= 7 },
  { id: 'month', name: '30-day streak', test: (c, g, s) => s >= 30 },
  { id: 'sleep', name: '7 nights logged', test: (c) => c.filter((x) => x.values?.sleep != null).length >= 7 },
  { id: 'reflex', name: '10 reaction tests', test: (c, g) => g.filter((x) => x.game === 'signal').length >= 10 },
  { id: 'all3', name: 'All three games', test: (c, g) => ['signal', 'debris', 'stars'].every((k) => g.some((x) => x.game === k)) },
];

export async function badges() {
  const c = await checkins();
  const g = await games();
  const s = await streak();
  return BADGES.map((b) => ({ ...b, earned: b.test(c, g, s) }));
}

export async function tasksToday() {
  const key = dayKey();
  const c = (await checkins()).some((x) => x.date === key);
  const g = await games();
  const signal = g.some((x) => x.game === 'signal' && x.date === key);
  const ex = (await checkins()).some((x) => x.date === key && x.values?.exercise != null);
  const outbox = await store.all('outbox');
  return [
    { id: 'checkin', label: 'Morning check-in', href: '#/check-in', done: c },
    { id: 'signal', label: 'Reaction test (1 minute)', href: '#/games/signal', done: signal },
    { id: 'exercise', label: 'Log yesterday’s exercise', href: '#/check-in', done: ex },
    { id: 'outbox', label: outbox.length ? `Send ${outbox.length} waiting ${outbox.length === 1 ? 'item' : 'items'}` : 'Messages up to date', href: '#/messages', done: outbox.length === 0 },
  ];
}
