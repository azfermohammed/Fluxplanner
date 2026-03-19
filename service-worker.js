/* ── FLUX PLANNER · Service Worker ── */
const CACHE = 'flux-v3';
const OFFLINE_URLS = [
  '/Fluxplanner/',
  '/Fluxplanner/index.html',
  '/Fluxplanner/public/css/styles.css',
  '/Fluxplanner/public/css/login.css',
  '/Fluxplanner/public/js/app.js',
  '/Fluxplanner/public/js/splash.js',
  '/Fluxplanner/manifest.json',
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(OFFLINE_URLS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  // Don't cache Supabase/API calls
  if (e.request.url.includes('supabase.co') ||
      e.request.url.includes('groq.com') ||
      e.request.url.includes('googleapis.com') ||
      e.request.method !== 'GET') return;

  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(res => {
        if (res && res.status === 200 && res.type === 'basic') {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
        }
        return res;
      }).catch(() => caches.match('/Fluxplanner/index.html'));
    })
  );
});
