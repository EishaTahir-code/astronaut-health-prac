import * as store from './store.js';

// Mission settings change gravity notes, signal delay and the home horizon.
// Delays are one-way light time. Mars varies with orbital positions.
export const MISSIONS = {
  station: {
    id: 'station', name: 'Space station', inSentence: 'space station', place: 'in low Earth orbit', world: 'earth',
    gravity: 'Microgravity', gravityShort: '0 g',
    delayText: 'under 1 second', delaySec: 1, demoDelaySec: 1,
    liveCall: 'Live video calls work most of the time.',
    gravityNote: 'With almost no gravity, bones and muscles are barely loaded, and body fluids shift toward the head.',
  },
  spacecraft: {
    id: 'spacecraft', name: 'Spacecraft', inSentence: 'spacecraft', place: 'on the way to the Moon', world: 'earth-far',
    gravity: 'Microgravity', gravityShort: '0 g',
    delayText: 'up to about 1.3 seconds', delaySec: 2, demoDelaySec: 2,
    liveCall: 'Live calls work, with a short lag that grows as you travel.',
    gravityNote: 'In transit there is no gravity, and the cabin is small, so exercise time is limited.',
  },
  moon: {
    id: 'moon', name: 'Moon base', inSentence: 'Moon base', place: 'on the lunar surface', world: 'moon',
    gravity: 'About 1/6 of Earth gravity', gravityShort: '0.17 g',
    delayText: 'about 1.3 seconds', delaySec: 2, demoDelaySec: 2,
    liveCall: 'Live calls work, with a noticeable pause before each reply.',
    gravityNote: 'Lunar gravity is about one sixth of Earth’s. It is not yet known how well that protects bone and muscle.',
  },
  mars: {
    id: 'mars', name: 'Mars base', inSentence: 'Mars base', place: 'on the Martian surface', world: 'mars',
    gravity: 'About 3/8 of Earth gravity', gravityShort: '0.38 g',
    delayText: 'about 4 to 24 minutes', delaySec: 12 * 60, demoDelaySec: 20,
    liveCall: 'Live calls are not possible. A question and its answer can take 45 minutes.',
    gravityNote: 'Mars gravity is about three eighths of Earth’s, after a long trip in microgravity to get there.',
  },
};

export const ROLES = {
  astronaut: { id: 'astronaut', name: 'Astronaut' },
  family: { id: 'family', name: 'Family member' },
  surgeon: { id: 'surgeon', name: 'Flight surgeon' },
};

const SETTINGS_VERSION = 2;
const DEFAULTS = {
  v: SETTINGS_VERSION,
  mission: 'station',
  role: 'astronaut',
  name: 'Commander Ana Reyes',
  missionStart: null, // ISO date; set on first run so the demo opens on day 142
  demoDelays: true,
  homeCity: { name: 'Lahore', tz: 'Asia/Karachi', lat: 31.55, lon: 74.34 },
  motion: 'auto',
};

let cache = null;
const subs = new Set();

export async function loadSettings() {
  const saved = await store.get('settings', {});
  cache = { ...DEFAULTS, ...saved };
  if ((saved.v || 1) < SETTINGS_VERSION) {
    // v2: Earth is the default world for the home screen.
    cache.mission = 'station';
    cache.v = SETTINGS_VERSION;
    await store.set('settings', cache);
  }
  if (!cache.missionStart) {
    const start = new Date();
    start.setDate(start.getDate() - 141);
    cache.missionStart = start.toISOString().slice(0, 10);
    await store.set('settings', cache);
  }
  applyMotion();
  return cache;
}

export function settings() { return cache || { ...DEFAULTS }; }

export async function updateSettings(patch) {
  cache = { ...settings(), ...patch };
  await store.set('settings', cache);
  applyMotion();
  subs.forEach((fn) => fn(cache));
  return cache;
}

export function onSettings(fn) { subs.add(fn); return () => subs.delete(fn); }

function applyMotion() {
  const m = cache?.motion || 'auto';
  if (m === 'reduced') document.documentElement.dataset.motion = 'reduced';
  else delete document.documentElement.dataset.motion;
}

export function mission() { return MISSIONS[settings().mission] || MISSIONS.mars; }

export function missionDay() {
  const start = new Date(settings().missionStart + 'T00:00:00');
  const now = new Date();
  const d = Math.floor((new Date(now.getFullYear(), now.getMonth(), now.getDate()) - start) / 86400000) + 1;
  return Math.max(1, d);
}

// Seconds a message is held before delivery for the current mission.
export function sendDelaySec() {
  const m = mission();
  return settings().demoDelays ? m.demoDelaySec : m.delaySec;
}

export function homeTime() {
  const c = settings().homeCity;
  try {
    const now = new Date();
    const time = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: c.tz });
    const hour = Number(now.toLocaleString('en-GB', { hour: '2-digit', hour12: false, timeZone: c.tz }));
    const awake = hour >= 7 && hour < 23;
    const daylight = hour >= 6 && hour < 19;
    return { city: c.name, time, awake, daylight, hour };
  } catch {
    return { city: c.name, time: '', awake: true, daylight: true, hour: 12 };
  }
}
