import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { runInNewContext } from 'node:vm';

const source = await readFile(new URL('./sw.js', import.meta.url), 'utf8');
const scope = 'https://example.test/Arbejde/';
const previous = 'arbejde-/Arbejde/-v6-20261107';
const current = 'arbejde-/Arbejde/-v7-20261107';
const otherScope = 'arbejde-/other/-v7-20261107';

function createWorker() {
  const handlers = new Map();
  const stores = new Map([[previous, new Map()], [otherScope, new Map()]]);
  const networkRequests = [];
  let online = true;
  let release = '3.1.1';
  let failedPath = '';
  let claims = 0;
  let skips = 0;
  const network = async request => {
    networkRequests.push(request.url);
    if (!online) throw Error('Offline');
    const path = new URL(request.url).pathname;
    const response = new Response(release + ':' + path, { status: failedPath === path ? 503 : 200 });
    Object.defineProperty(response, 'type', { value: 'basic' });
    return response;
  };
  const caches = {
    async open(name) {
      if (!stores.has(name)) stores.set(name, new Map());
      const store = stores.get(name);
      return {
        async addAll(requests) {
          const responses = await Promise.all(requests.map(async request => {
            assert.equal(request.cache, 'reload');
            const response = await network(request);
            if (!response.ok) throw Error('Precache failed');
            return [request.url, response];
          }));
          for (const [url, response] of responses) store.set(url, response);
        },
        async match(url) { return store.get(url)?.clone(); },
        async put(url, response) { store.set(url, response); }
      };
    },
    async keys() { return [...stores.keys()]; },
    async delete(name) { return stores.delete(name); }
  };
  const self = {
    registration: { scope },
    clients: { claim: async () => { claims++; } },
    skipWaiting: async () => { skips++; },
    addEventListener: (type, handler) => handlers.set(type, handler)
  };
  runInNewContext(source, { self, caches, fetch: network, URL, Request, Response });
  return {
    stores, networkRequests,
    network({ available = true, version = release, fail = '' } = {}) {
      online = available;
      release = version;
      failedPath = fail;
    },
    dispatch(type) {
      let result;
      handlers.get(type)({ waitUntil: promise => { result = promise; } });
      return result;
    },
    fetch(path, options = {}) {
      let result;
      const request = new Request(new URL(path, scope), options);
      if (options.navigate) Object.defineProperty(request, 'mode', { value: 'navigate' });
      handlers.get('fetch')({ request, respondWith: promise => { result = promise; } });
      return result;
    },
    get claims() { return claims; },
    get skips() { return skips; }
  };
}

test('a complete install snapshot keeps the shell and scripts on one release', async () => {
  const worker = createWorker();
  await worker.dispatch('install');
  const precached = worker.networkRequests.length;
  worker.network({ version: '3.1.2', fail: '/Arbejde/app.js' });
  assert.match(await (await worker.fetch('?opened=1', { navigate: true })).text(), /^3\.1\.1:.*index\.html$/);
  assert.match(await (await worker.fetch('app.js')).text(), /^3\.1\.1:.*app\.js$/);
  worker.network({ available: false });
  for (const path of ['manifest.webmanifest?v=3.1.1', 'icon-192.png?v=3.1.1', 'photos.js', 'photos.css', 'assets/supabase/supabase.js', 'assets/pdfjs/pdf.worker.min.mjs']) {
    assert.match(await (await worker.fetch(path)).text(), /^3\.1\.1:/);
  }
  assert.equal(worker.networkRequests.length, precached);
  for (const url of worker.stores.get(current).keys()) await readFile(new URL(url.slice(scope.length), import.meta.url));
});

test('install keeps the prior release until activation and never skips waiting', async () => {
  const worker = createWorker();
  await worker.dispatch('install');
  assert.equal(worker.skips, 0);
  assert.equal(worker.claims, 0);
  assert.ok(worker.stores.has(previous));
  await worker.dispatch('activate');
  assert.equal(worker.claims, 1);
  assert.equal(worker.stores.has(previous), false);
  assert.ok(worker.stores.has(current));
  assert.ok(worker.stores.has(otherScope));
});

test('a failed precache leaves the previous release available', async () => {
  const worker = createWorker();
  worker.network({ fail: '/Arbejde/app.js' });
  await assert.rejects(worker.dispatch('install'), /Precache failed/);
  assert.ok(worker.stores.has(previous));
  assert.equal(worker.stores.get(current).size, 0);
  assert.equal(worker.claims, 0);
});

test('optional PDF resources remain usable offline after loading, without caching external requests', async () => {
  const worker = createWorker();
  await worker.dispatch('install');
  const cmap = 'assets/pdfjs/cmaps/Identity-H.bcmap';
  assert.equal((await worker.fetch(cmap)).status, 200);
  worker.network({ available: false });
  assert.equal((await worker.fetch(cmap)).status, 200);
  assert.equal((await worker.fetch('assets/pdfjs/cmaps/unloaded.bcmap')).status, 503);
  assert.equal(worker.fetch('https://storage.example.test/photo.png'), undefined);
  assert.equal(worker.fetch('app.js', { headers: { range: 'bytes=0-10' } }), undefined);
  assert.equal(worker.fetch('app.js', { method: 'POST' }), undefined);
  assert.equal(worker.fetch('../other/index.html', { navigate: true }), undefined);
});
