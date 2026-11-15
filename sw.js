const CACHE = 'piano-practice-v1';
const SHELL = [
  './', 'index.html', 'app.js', 'theory.js', 'srs.js', 'store.js', 'chart.js', 'audio.js', 'ui.js',
  'views/notes.js', 'views/keys.js', 'views/ear.js', 'views/metronome.js', 'views/songs.js',
  'vendor/material.js', 'vendor/vexflow.js', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png',
];

self.addEventListener('install', (e) => {
  // cache: 'reload' skips the browser's HTTP cache, so a new version never fills its cache with old files
  e.waitUntil(caches.open(CACHE).then((c) => Promise.all(SHELL.map((u) => c.add(new Request(u, { cache: 'reload' }))))));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))));
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  // Cache first, then network; fall back to the cached page when offline
  e.respondWith(
    caches.match(e.request, { ignoreSearch: true }).then((hit) => hit || fetch(e.request).catch(() => caches.match('index.html'))),
  );
});
