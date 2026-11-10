// Service worker: keeps the whole app on the device so it runs with no connection.
const VERSION = 'horizon-v1';
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
  'assets/textures/moon.jpg',
  'assets/textures/mars.jpg',
  'assets/icons/icon-192.png',
  'assets/icons/icon-512.png',
  'assets/icons/icon-maskable-512.png',
  'assets/icons/apple-touch-icon.png',
  'assets/icons/favicon-32.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // Supabase and anything else go straight to the network

  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(VERSION).then((c) => c.put('index.html', copy));
        return res;
      }).catch(() => caches.match('index.html'))
    );
    return;
  }

  // Cache first, then refresh in the background (stale-while-revalidate).
  event.respondWith(
    caches.match(req, { ignoreSearch: true }).then((hit) => {
      const net = fetch(req).then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); }
        return res;
      }).catch(() => hit);
      return hit || net;
    })
  );
});
