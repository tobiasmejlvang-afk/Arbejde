// Increment this version whenever app files change before publishing a release.
const SCOPE = new URL(self.registration.scope);
const PREFIX = 'arbejde-' + SCOPE.pathname + '-';
const CACHE = PREFIX + 'v9-20261113';
const ASSETS = ["index.html","app.js","styles.css","brand.css","experience.js","domain.js","directory-domain.js","directory-ui.js","panels.js","manifest.webmanifest","icon-192.png","icon-512.png","assets/brand/absence.png","assets/brand/app-icon.png","assets/brand/calendar.png","assets/brand/export.png","assets/brand/job.png","assets/brand/logo-horizontal.png","assets/brand/monogram.png","assets/brand/overview.png","assets/brand/pay.png","assets/brand/settings.png","assets/brand/statistics.png","assets/brand/symbol.png","assets/brand/time.png","assets/brand/vehicle.png","assets/fonts/InterVariable.woff2","pdf-reader.js","schedule-parser.js","schedule-domain.js","schedule-import-ui.js","schedule-import.css","daily-tools.js","daily-tools.css","timer-domain.js","timer-controller.js","assets/pdfjs/pdf.min.mjs","assets/pdfjs/pdf.worker.min.mjs","assets/pdfjs/standard_fonts/FoxitDingbats.pfb","assets/pdfjs/standard_fonts/FoxitFixed.pfb","assets/pdfjs/standard_fonts/FoxitFixedBold.pfb","assets/pdfjs/standard_fonts/FoxitFixedBoldItalic.pfb","assets/pdfjs/standard_fonts/FoxitFixedItalic.pfb","assets/pdfjs/standard_fonts/FoxitSerif.pfb","assets/pdfjs/standard_fonts/FoxitSerifBold.pfb","assets/pdfjs/standard_fonts/FoxitSerifBoldItalic.pfb","assets/pdfjs/standard_fonts/FoxitSerifItalic.pfb","assets/pdfjs/standard_fonts/FoxitSymbol.pfb","assets/pdfjs/standard_fonts/LiberationSans-Bold.ttf","assets/pdfjs/standard_fonts/LiberationSans-BoldItalic.ttf","assets/pdfjs/standard_fonts/LiberationSans-Italic.ttf","assets/pdfjs/standard_fonts/LiberationSans-Regular.ttf","data-store.js","cloud-sync.js","cloud-account.js","photos.js","entry-options.css","assets/supabase/supabase.js","photos.css","preferences.css"];
const scope = SCOPE;
const indexURL = new URL('index.html', scope).href;
const assetURLs = new Set(ASSETS.map(path => new URL(path, scope).href));
const cmapPath = new URL('assets/pdfjs/cmaps/', scope).pathname;
const offline = () => new Response('Arbejde er ikke tilgængelig offline endnu. Åbn appen med internet én gang.', {
  status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' }
});

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll([...assetURLs].map(url => new Request(url, { cache: 'reload' })));
    // Keep the previous worker in control until its tabs close.
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
  const core = isNavigation || assetURLs.has(canonical);
  const isCMap = url.pathname.startsWith(cmapPath) && url.pathname.endsWith('.bcmap');
  if (!core && !isCMap) return;
  event.respondWith((async () => {
    const key = isNavigation ? indexURL : canonical;
    let cache;
    try {
      cache = await caches.open(CACHE);
      const cached = await cache.match(key);
      if (cached) return cached;
    } catch {
      // Storage can be unavailable even while the network is working.
    }
    try {
      const response = await fetch(request);
      // The install snapshot stays intact. Only optional PDF resources are cached here.
      if (isCMap && cache && response.ok && response.type === 'basic') {
        try {
          await cache.put(key, response.clone());
        } catch {
          // Return a successful download even if it cannot be cached.
        }
      }
      return response;
    } catch {
      return offline();
    }
  })());
});
