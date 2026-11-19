// Bump CACHE whenever shell files are added/renamed, and add new files to SHELL.
const CACHE = 'work-timer-v3';
const SHELL = [
  './', './index.html', './manifest.webmanifest', './css/app.css',
  './js/app.js', './js/feedback.js', './js/store.js', './js/sync.js',
  './js/time.js', './js/timer.js', './icons/icon-180.png', './icons/icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

const NETWORK_TIMEOUT_MS = 2500;

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  if (new URL(req.url).origin !== self.location.origin) return;

  const network = fetch(req);
  // Always refresh the cache when the network eventually answers, even after a timeout.
  e.waitUntil(
    network
      .then((res) => (res && res.ok ? caches.open(CACHE).then((c) => c.put(req, res.clone())) : undefined))
      .catch(() => {})
  );
  const cached = () =>
    caches.match(req).then((hit) => hit || (req.mode === 'navigate' ? caches.match('./index.html') : undefined));
  const timeout = new Promise((resolve) => setTimeout(() => resolve(cached()), NETWORK_TIMEOUT_MS));
  const offline = network.catch(() => cached().then((hit) => hit || Response.error()));
  // Network wins if fast; after the timeout a cached copy wins; with no cache, keep waiting for the network.
  e.respondWith(Promise.race([offline, timeout.then((hit) => hit || offline)]));
});
