import { icon } from './icons.js';
import { toast } from './ui.js';
import * as store from './store.js';
import { loadSettings, settings, onSettings } from './missions.js';
import { hasSample, loadSample } from './sample.js';

const PAGES = {
  today: { title: 'Today', icon: 'today', load: () => import('./pages/today.js') },
  'check-in': { title: 'Check-in', icon: 'checkin', load: () => import('./pages/checkin.js') },
  body: { title: 'Body', icon: 'body', load: () => import('./pages/body.js') },
  trends: { title: 'Trends', icon: 'trends', load: () => import('./pages/trends.js') },
  messages: { title: 'Messages', icon: 'messages', load: () => import('./pages/messages.js') },
  games: { title: 'Games', icon: 'games', load: () => import('./pages/games.js') },
  surgeon: { title: 'Reports', icon: 'surgeon', load: () => import('./pages/surgeon.js') },
  learn: { title: 'Learn', icon: 'learn', load: () => import('./pages/learn.js') },
  settings: { title: 'Settings', icon: 'settings', load: () => import('./pages/settings.js') },
};

const NAV = {
  astronaut: { tabs: ['today', 'check-in', 'body', 'trends', 'messages'], more: ['games', 'learn', 'settings'] },
  family: { tabs: ['today', 'messages', 'learn', 'settings'], more: [] },
  surgeon: { tabs: ['today', 'surgeon', 'messages', 'learn', 'settings'], more: [] },
};
const ALLOWED = {
  astronaut: Object.keys(PAGES).filter((p) => p !== 'surgeon'),
  family: ['today', 'messages', 'learn', 'settings'],
  surgeon: ['today', 'surgeon', 'messages', 'learn', 'settings'],
};

const main = document.getElementById('main');
let cleanup = null;
let renderToken = 0;

function parseHash() {
  const raw = (location.hash || '#/today').replace(/^#\/?/, '');
  const [path, query = ''] = raw.split('?');
  const parts = path.split('/').filter(Boolean);
  return { page: parts[0] || 'today', rest: parts.slice(1), query: new URLSearchParams(query) };
}

function navLink(id, cls = '') {
  const p = PAGES[id];
  return `<li><a href="#/${id}" data-page="${id}" class="${cls}">${icon(p.icon)}<span>${p.title}</span></a></li>`;
}

function renderNav() {
  const role = settings().role;
  const nav = NAV[role] || NAV.astronaut;
  document.getElementById('nav-tabs').innerHTML = nav.tabs.map((id) => navLink(id)).join('');
  document.querySelector('.tabbar ul').style.gridTemplateColumns = `repeat(${nav.tabs.length}, 1fr)`;
  document.getElementById('nav-main').innerHTML = nav.tabs.map((id) => navLink(id)).join('');
  document.getElementById('nav-more').innerHTML = nav.more.map((id) => navLink(id)).join('');
  document.querySelector('.rail-section').hidden = nav.more.length === 0;
  const sheetItems = [...nav.more, ...(nav.more.length ? [] : [])];
  document.getElementById('nav-sheet').innerHTML = (sheetItems.length ? sheetItems : ['learn', 'settings']).map((id) => navLink(id)).join('');
  const roleName = { astronaut: 'Astronaut view', family: 'Family view', surgeon: 'Flight surgeon view' }[role];
  document.getElementById('rail-foot').innerHTML = `<span>${roleName}</span><span>Works offline. Not a medical device.</span>`;
  markCurrent();
}

function markCurrent() {
  const { page } = parseHash();
  document.querySelectorAll('[data-page]').forEach((a) => {
    if (a.dataset.page === page) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
}

async function route() {
  const token = ++renderToken;
  const { page, rest, query } = parseHash();
  const role = settings().role;
  const allowed = ALLOWED[role] || ALLOWED.astronaut;
  const id = PAGES[page] && allowed.includes(page) ? page : 'today';
  if (id !== page) { location.replace('#/today'); return; }
  closeSheet();
  if (cleanup) { try { cleanup(); } catch (e) { console.error(e); } cleanup = null; }
  document.body.classList.remove('hero-on', 'hero-still');
  document.body.dataset.page = id;
  markCurrent();
  let mod;
  try {
    mod = await PAGES[id].load();
  } catch (e) {
    console.error(e);
    main.innerHTML = '<div class="page"><div class="page-head"><h1>This page did not load</h1><p>Reload the app. If you are offline, open it once with a connection so it can be saved on this device.</p></div></div>';
    return;
  }
  if (token !== renderToken) return;
  main.innerHTML = '';
  window.scrollTo(0, 0);
  document.title = `${PAGES[id].title} · Horizon`;
  try {
    cleanup = (await mod.render(main, { rest, query })) || null;
  } catch (e) {
    console.error(e);
    main.innerHTML = `<div class="page"><div class="page-head"><h1>Something went wrong</h1><p>${String(e.message || e)}</p></div></div>`;
  }
  if (token === renderToken && document.activeElement?.closest('.tabbar, .rail, .sheet')) main.focus({ preventScroll: true });
}

// Menu sheet (phones)
const sheet = document.getElementById('more-sheet');
const menuBtn = document.getElementById('menu-btn');
function openSheet() { sheet.hidden = false; menuBtn.setAttribute('aria-expanded', 'true'); sheet.querySelector('a, button')?.focus(); }
function closeSheet() { if (sheet.hidden) return; sheet.hidden = true; menuBtn.setAttribute('aria-expanded', 'false'); }
menuBtn.addEventListener('click', () => (sheet.hidden ? openSheet() : closeSheet()));
sheet.addEventListener('click', (e) => { if (e.target.closest('[data-close]')) { closeSheet(); menuBtn.focus(); } });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeSheet(); });

// Keep the install prompt so Settings can offer an Install button.
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); window.__installPrompt = e; });

// Connection status
const pill = document.getElementById('net-pill');
function netStatus() {
  const on = navigator.onLine;
  pill.textContent = on ? 'Online' : 'Offline';
  pill.classList.toggle('offline', !on);
}
window.addEventListener('online', () => { netStatus(); toast('Back online. Sending anything that was waiting.', 'satellite'); });
window.addEventListener('offline', () => { netStatus(); toast('Offline. Everything still works; messages will wait in your outbox.', 'wifiOff'); });

async function boot() {
  await loadSettings();
  if (!(await store.get('firstRunDone', false))) {
    await loadSample();
    await store.set('firstRunDone', true);
  } else if (!(await hasSample()) && !(await store.all('checkins')).length) {
    // nothing to show yet; trends will explain how to start
  }
  store.requestPersistence();
  netStatus();
  renderNav();
  onSettings(() => { renderNav(); });
  window.addEventListener('hashchange', route);
  await route();
  // Background sync for messages, only once a crew space exists.
  if (await store.get('crew', null)) import('./sync.js').then((m) => m.start()).catch(() => {});
  registerSW();
}

function registerSW() {
  if (!('serviceWorker' in navigator) || location.protocol === 'file:') return;
  navigator.serviceWorker.register('sw.js').then((reg) => {
    reg.addEventListener('updatefound', () => {
      const w = reg.installing;
      w?.addEventListener('statechange', () => {
        if (w.state === 'installed' && navigator.serviceWorker.controller) toast('A new version of Horizon is ready. Reload to use it.', 'refresh', 8000);
      });
    });
  }).catch((e) => console.warn('Service worker not registered', e));
}

export function rerender() { route(); }

boot();
