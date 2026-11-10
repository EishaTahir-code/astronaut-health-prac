// Service worker: keeps the whole app on the device so it runs with no connection.
const VERSION = 'horizon-v3';
const SHELL = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/app.css',
  'js/app.js',
  'js/icons.js',
  'js/ui.js',
  'js/store.js',
  'js/missions.js',
  'js/health.js',
  'js/sample.js',
  'js/data.js',
  'js/charts.js',
  'js/hero.js',
  'js/sync.js',
  'js/outbox.js',
  'js/supa.js',
  'js/config.js',
  'js/qr.js',
  'js/pages/today.js',
  'js/pages/checkin.js',
  'js/pages/body.js',
  'js/pages/trends.js',
  'js/pages/messages.js',
  'js/pages/games.js',
  'js/pages/surgeon.js',
  'js/pages/learn.js',
  'js/pages/settings.js',
  'vendor/three.module.min.js',
  'vendor/supabase.js',
  'vendor/591.supabase.js',
  'vendor/qrcode.mjs',
  'assets/fonts/bodoni-moda-latin-400-normal.woff2',
  'assets/fonts/bodoni-moda-latin-500-normal.woff2',
  'assets/fonts/bodoni-moda-latin-400-italic.woff2',
  'assets/fonts/ibm-plex-sans-latin-400-normal.woff2',
  'assets/fonts/ibm-plex-sans-latin-500-normal.woff2',
  'assets/fonts/ibm-plex-sans-latin-600-normal.woff2',
  'assets/textures/earth-day.jpg',
  'assets/textures/earth-night.jpg',
  'assets/textures/earth-clouds.jpg',
  'assets/textures/earth-bump.jpg',
  'assets/textures/earth-spec.jpg',
  'assets/textures/milkyway.jpg',
  'assets/textures/moon.jpg',
  'assets/textures/mars.jpg',
  'assets/icons/icon-192.png',
  'assets/icons/icon-512.png',
  'assets/icons/icon-maskable-512.png',
  'assets/icons/apple-touch-icon.png',
  'assets/icons/favicon-32.png',
];

self.addEventListener('install', (event) => {
  // cache: 'reload' skips the browser's HTTP cache, so an update never saves stale files.
  event.waitUntil(
    caches.open(VERSION)
      .then((c) => c.addAll(SHELL.map((u) => new Request(u, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim())
  );
});

// App code (pages, scripts, styles) changes with every release: network first,
// asking the server whether it changed, and the saved copy only when offline.
// Big files that rarely change (textures, fonts, libraries, icons): cache first.
const isCode = (url) => url.pathname.endsWith('/') || /\.(html|js|css|webmanifest)$/.test(url.pathname) && !url.pathname.includes('/vendor/');

async function networkFirst(req, cacheKey = req) {
  const cache = await caches.open(VERSION);
  try {
    const res = await fetch(req, { cache: 'no-cache' });
    if (res.ok) cache.put(cacheKey, res.clone());
    return res;
  } catch (e) {
    const hit = await cache.match(cacheKey, { ignoreSearch: true });
    if (hit) return hit;
    throw e;
  }
}

async function cacheFirst(req) {
  const cache = await caches.open(VERSION);
  const hit = await cache.match(req, { ignoreSearch: true });
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) cache.put(req, res.clone());
  return res;
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // Supabase and anything else go straight to the network
  if (req.mode === 'navigate') { event.respondWith(networkFirst(req, 'index.html')); return; }
  event.respondWith(isCode(url) ? networkFirst(req) : cacheFirst(req));
});
