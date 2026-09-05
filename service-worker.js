/* ── FLUX PLANNER · Service Worker (B5.4) ──
 * Auto-versioned: build-web-bundles.mjs stamps BUILD with the combined
 * content hash of the bundles on every `npm run build:web`. Never bump by
 * hand. Strategies:
 *   - navigations / index.html  → network-first (navigation preload enabled),
 *                                 cached index as offline fallback
 *   - hashed bundles            → cache-first (content-hashed = immutable)
 *   - other same-origin assets  → stale-while-revalidate
 */
const BUILD = 'd5eb68c3';
const STATIC = 'flux-static-' + BUILD;
/** Directory of this script (e.g. /Fluxplanner/ or /) — works on GitHub Pages and local dev */
const APP_BASE = self.location.pathname.replace(/\/[^/]+$/, '/');
const APP_ORIGIN = self.location.origin;
const INDEX_HTML = APP_ORIGIN + APP_BASE + 'index.html';

const PRECACHE = [
  APP_ORIGIN + APP_BASE,
  INDEX_HTML,
  APP_ORIGIN + APP_BASE + 'manifest.json',
];

// Content-hashed bundle outputs, e.g. /public/bundles/flux-core.ab12cd34.js
const HASHED_RE = /\/bundles\/flux(-\w+)?\.[0-9a-f]{8}\.(js|css)$/;

// On install — precache the shell + every hashed bundle from the generated
// manifest. no-store so install never picks a stale copy from HTTP cache.
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(STATIC)
      .then(async c => {
        const urls = [...PRECACHE];
        try {
          const res = await fetch(APP_ORIGIN + APP_BASE + 'public/bundles/precache-manifest.json', { cache: 'no-store' });
          if (res.ok) {
            const man = await res.json();
            (man.assets || []).forEach(rel => urls.push(APP_ORIGIN + APP_BASE + rel));
          }
        } catch (_) { /* manifest missing — shell precache still proceeds */ }
        await Promise.all(
          urls.map(url =>
            fetch(url, { cache: 'no-store' }).then(res => {
              if (!res.ok) throw new Error('precache failed ' + url + ' ' + res.status);
              return c.put(url, res);
            })
          )
        );
      })
      .then(() => self.skipWaiting())
  );
});

// On activate — navigation preload on, delete old caches, claim clients.
self.addEventListener('activate', e => {
  e.waitUntil(
    Promise.all([
      self.registration.navigationPreload ? self.registration.navigationPreload.enable().catch(() => {}) : Promise.resolve(),
      caches.keys().then(keys => Promise.all(keys.filter(k => k !== STATIC).map(k => caches.delete(k)))),
    ]).then(() => self.clients.claim())
  );
});

function isCacheableScheme(url) {
  try {
    return /^https?:$/i.test(new URL(url).protocol);
  } catch (_) {
    return false;
  }
}

function putInCache(request, response) {
  if (response && response.status === 200) {
    const clone = response.clone();
    caches.open(STATIC).then(c => c.put(request, clone).catch(() => {}));
  }
  return response;
}

self.addEventListener('fetch', e => {
  const url = e.request.url;
  // Cache API only supports http(s). Skip chrome-extension:, chrome:, blob:, etc.
  if (!isCacheableScheme(url)) return;

  // Never touch cross-origin requests. Third-party fetches (notebook web search
  // & URL import, Wikipedia, etc.) must reach the network untouched — otherwise
  // the fallbacks below could replace a failed third-party response with our
  // own index.html, corrupting results.
  try { if (new URL(url).origin !== APP_ORIGIN) return; } catch (_) { return; }

  // Never intercept: API calls, Supabase, Groq, Google, POST requests
  if (
    e.request.method !== 'GET' ||
    url.includes('supabase.co') ||
    url.includes('groq.com') ||
    url.includes('googleapis.com') ||
    url.includes('fonts.g') ||
    url.includes('cdn.jsdelivr')
  ) return;

  const isDocument =
    e.request.mode === 'navigate' || e.request.destination === 'document' || url.includes('.html');

  // 1. Navigations / documents — network-first, riding the preload response.
  if (isDocument) {
    e.respondWith((async () => {
      try {
        const preloaded = e.preloadResponse ? await e.preloadResponse : null;
        if (preloaded) return putInCache(e.request, preloaded);
        const res = await fetch(e.request, { cache: 'no-store' });
        return putInCache(e.request, res);
      } catch (_) {
        const cached = await caches.match(e.request);
        return cached || caches.match(INDEX_HTML);
      }
    })());
    return;
  }

  // 2. Content-hashed bundles — immutable, cache-first.
  if (HASHED_RE.test(new URL(url).pathname)) {
    e.respondWith(
      caches.match(e.request).then(cached =>
        cached || fetch(e.request).then(res => putInCache(e.request, res))
      )
    );
    return;
  }

  // 3. Everything else (fonts, icons, unhashed js/css) — stale-while-revalidate.
  e.respondWith((async () => {
    const cached = await caches.match(e.request);
    const refresh = fetch(e.request)
      .then(res => putInCache(e.request, res))
      .catch(() => cached || caches.match(INDEX_HTML));
    return cached || refresh;
  })());
});

/* ── C7: Web Push (flag enable_web_push) ──
 * These fire only for users who opted in from Settings → Alerts (the flag
 * gates subscription creation; quiet hours + panic mode are enforced
 * server-side in the notify-push function before anything is sent). */
self.addEventListener('push', e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (_) {}
  e.waitUntil(self.registration.showNotification(d.title || 'Flux Planner', {
    body: d.body || '',
    tag: d.tag || 'flux-due-soon',
    icon: APP_ORIGIN + APP_BASE + 'icons/icon-192.png',
    badge: APP_ORIGIN + APP_BASE + 'icons/icon-192.png',
    data: { url: d.url || (APP_ORIGIN + APP_BASE) },
  }));
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || (APP_ORIGIN + APP_BASE);
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const c of list) {
        if (c.url.startsWith(APP_ORIGIN + APP_BASE) && 'focus' in c) return c.focus();
      }
      return self.clients.openWindow(url);
    })
  );
});
