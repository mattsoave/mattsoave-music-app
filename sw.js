const CACHE = 'piano-practice-v3';
const SHELL = [
  './', 'index.html', 'app.js', 'theory.js', 'srs.js', 'store.js', 'chart.js', 'audio.js', 'ui.js', 'feedback.js',
  'views/notes.js', 'views/keys.js', 'views/ear.js', 'views/metronome.js', 'views/songs.js',
  'vendor/material.js', 'vendor/vexflow.js', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png',
];

self.addEventListener('install', (e) => {
  // cache: 'reload' skips the browser's HTTP cache, so a new version never fills its cache with old files
  e.waitUntil(caches.open(CACHE).then((c) => Promise.all(SHELL.map((u) => c.add(new Request(u, { cache: 'reload' }))))));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE && k !== 'shared-files').map((k) => caches.delete(k)))));
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);

  // A file shared to the app from another app (the Android share sheet)
  if (e.request.method === 'POST' && url.pathname.endsWith('/share-target')) {
    e.respondWith((async () => {
      const form = await e.request.formData();
      const file = form.get('file');
      const cache = await caches.open('shared-files');
      if (file) {
        await cache.put('shared-file', new Response(file, { headers: { 'x-file-name': file.name || 'shared file' } }));
      }
      return Response.redirect('./?shared=1', 303);
    })());
    return;
  }

  if (e.request.method !== 'GET') return;
  // Cache first, then network; fall back to the cached page when offline
  e.respondWith(
    caches.match(e.request, { ignoreSearch: true }).then((hit) => hit || fetch(e.request).catch(() => caches.match('index.html'))),
  );
});
