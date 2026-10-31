// Increment this version whenever app files change before publishing a release.
const SCOPE = new URL(self.registration.scope);
const PREFIX = 'arbejde-' + SCOPE.pathname + '-';
const CACHE = PREFIX + 'v3-20261031';
const ASSETS = ["index.html","app.js","styles.css","brand.css","experience.js","domain.js","directory-domain.js","directory-ui.js","panels.js","manifest.webmanifest","icon-192.png","icon-512.png","assets/brand/absence.png","assets/brand/app-icon.png","assets/brand/calendar.png","assets/brand/export.png","assets/brand/job.png","assets/brand/logo-horizontal.png","assets/brand/monogram.png","assets/brand/overview.png","assets/brand/pay.png","assets/brand/settings.png","assets/brand/statistics.png","assets/brand/symbol.png","assets/brand/time.png","assets/brand/vehicle.png","assets/fonts/InterVariable.woff2"];
const scope = SCOPE;
const indexURL = new URL('index.html', scope).href;
const assetURLs = new Set(ASSETS.map(path => new URL(path, scope).href));

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll([...assetURLs].map(url => new Request(url, { cache: 'reload' })));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key.startsWith(PREFIX) && key !== CACHE).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== scope.origin || !url.pathname.startsWith(scope.pathname) || request.headers.has('range')) return;
  const canonical = new URL(url.pathname, scope.origin).href;
  const isNavigation = request.mode === 'navigate' && (url.pathname === scope.pathname || canonical === indexURL);
  if (!isNavigation && !assetURLs.has(canonical)) return;
  // Network first gives online sessions the latest files; offline sessions use the last successful version.
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    try {
      const response = await fetch(request, { cache: 'no-cache' });
      if (response.ok && response.type === 'basic' && (!isNavigation || response.headers.get('content-type')?.includes('text/html'))) {
        const key = isNavigation ? indexURL : canonical;
        await cache.put(key, response.clone());
      }
      return response;
    } catch {
      const cached = await cache.match(isNavigation ? indexURL : canonical);
      return cached || new Response('Arbejde er ikke tilgængelig offline endnu. Åbn appen med internet én gang.', {
        status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' }
      });
    }
  })());
});
