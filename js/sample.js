// Clearly labelled sample data for a fictional crew member, so trends are
// populated on first open. Every record carries sample: true.
import * as store from './store.js';
import { evaluateCheckin } from './health.js';
import { dayKey, addDays } from './ui.js';

function rng(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export async function hasSample() {
  return (await store.get('sampleLoaded', false)) === true;
}

export async function loadSample() {
  const r = rng(142);
  const n = (mid, spread) => mid + (r() - 0.5) * 2 * spread;
  const days = 30;
  const checkins = [];
  const games = [];
  const today = new Date();
  for (let i = days; i >= 1; i--) {
    const d = addDays(today, -i);
    d.setHours(7, 30, 0, 0);
    const late = i <= 4; // the last few days drift: shorter sleep, slower reactions
    let sleep = Math.round(n(7.3, 0.6) * 4) / 4;
    if (i === 3) sleep = 6.25;
    if (i === 2) sleep = 6.5;
    if (i === 1) sleep = 5.5;
    const values = {
      sys: Math.round(n(late ? 124 : 114, 5)),
      dia: Math.round(n(late ? 81 : 74, 4)),
      hr: Math.round(n(late ? 68 : 61, 4)),
      glucose: Math.round(n(90, 7)),
      temp: Math.round(n(36.75, 0.25) * 10) / 10,
      sleep,
      mood: late ? (i === 1 ? 3 : 4) : Math.max(3, Math.min(5, Math.round(n(4.2, 0.9)))),
      exercise: Math.round(n(late ? 80 : 115, 20) / 5) * 5,
    };
    const hist = checkins.slice(-14);
    const { statuses, overall } = evaluateCheckin(values, hist, []);
    checkins.push({ id: `sample-${dayKey(d)}`, at: d.toISOString(), date: dayKey(d), values, statuses, overall, symptoms: [], sample: true });

    if (i % 7 !== 0) {
      const slow = i <= 3 ? [0, 52, 34, 22][i] : 0;
      const median = Math.round(n(252, 9) + slow);
      games.push({ id: `sample-signal-${dayKey(d)}`, game: 'signal', at: new Date(d.getTime() + 20 * 60000).toISOString(), date: dayKey(d), medianMs: median, meanMs: median + Math.round(n(14, 5)), lapses: i <= 2 ? 2 : Math.round(r() * 1.2), falseStarts: Math.round(r() * 1.4), trials: 14, sample: true });
    }
    if (i % 3 === 0) {
      games.push({ id: `sample-debris-${dayKey(d)}`, game: 'debris', at: new Date(d.getTime() + 40 * 60000).toISOString(), date: dayKey(d), hitRate: Math.min(1, n(0.95, 0.04)), falseTaps: Math.round(r() * 2), meanMs: Math.round(n(420, 25)), trials: 36, sample: true });
    }
    if (i % 4 === 0) {
      games.push({ id: `sample-stars-${dayKey(d)}`, game: 'stars', at: new Date(d.getTime() + 50 * 60000).toISOString(), date: dayKey(d), span: Math.round(n(6, 1)), sample: true });
    }
  }
  await store.putMany('checkins', checkins);
  await store.putMany('games', games);
  await store.set('sampleLoaded', true);
}

export async function removeSample() {
  for (const s of ['checkins', 'games']) {
    const rows = await store.all(s);
    for (const row of rows) if (row.sample) await store.del(s, row.id);
  }
  await store.set('sampleLoaded', false);
}
