// Increment this version whenever app files change before publishing a release.
const SCOPE = new URL(self.registration.scope);
const PREFIX = 'arbejde-' + SCOPE.pathname + '-';
const CACHE = PREFIX + 'v4-20261101';
const ASSETS = ["index.html","app.js","styles.css","brand.css","experience.js","domain.js","directory-domain.js","directory-ui.js","panels.js","manifest.webmanifest","icon-192.png","icon-512.png","assets/brand/absence.png","assets/brand/app-icon.png","assets/brand/calendar.png","assets/brand/export.png","assets/brand/job.png","assets/brand/logo-horizontal.png","assets/brand/monogram.png","assets/brand/overview.png","assets/brand/pay.png","assets/brand/settings.png","assets/brand/statistics.png","assets/brand/symbol.png","assets/brand/time.png","assets/brand/vehicle.png","assets/fonts/InterVariable.woff2","pdf-reader.js","schedule-parser.js","schedule-domain.js","schedule-import-ui.js","schedule-import.css","daily-tools.js","daily-tools.css","timer-domain.js","timer-controller.js","assets/pdfjs/pdf.min.mjs","assets/pdfjs/pdf.worker.min.mjs","assets/pdfjs/standard_fonts/FoxitDingbats.pfb","assets/pdfjs/standard_fonts/FoxitFixed.pfb","assets/pdfjs/standard_fonts/FoxitFixedBold.pfb","assets/pdfjs/standard_fonts/FoxitFixedBoldItalic.pfb","assets/pdfjs/standard_fonts/FoxitFixedItalic.pfb","assets/pdfjs/standard_fonts/FoxitSerif.pfb","assets/pdfjs/standard_fonts/FoxitSerifBold.pfb","assets/pdfjs/standard_fonts/FoxitSerifBoldItalic.pfb","assets/pdfjs/standard_fonts/FoxitSerifItalic.pfb","assets/pdfjs/standard_fonts/FoxitSymbol.pfb","assets/pdfjs/standard_fonts/LiberationSans-Bold.ttf","assets/pdfjs/standard_fonts/LiberationSans-BoldItalic.ttf","assets/pdfjs/standard_fonts/LiberationSans-Italic.ttf","assets/pdfjs/standard_fonts/LiberationSans-Regular.ttf"];
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
  const isCMap = url.pathname.startsWith(new URL('assets/pdfjs/cmaps/', scope).pathname) && url.pathname.endsWith('.bcmap');
  if (!isNavigation && !assetURLs.has(canonical) && !isCMap) return;
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
