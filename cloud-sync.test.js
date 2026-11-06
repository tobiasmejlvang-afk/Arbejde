import test from 'node:test';
import assert from 'node:assert/strict';
import {createCloudSync} from './cloud-sync.js';
import {emptyState} from './domain.js';

const metaKey = 'test-cloud-base';
const template = emptyState();
function document(name) {
  const data = structuredClone(template);
  data.settings.name = name;
  return data;
}

function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return {promise, resolve};
}

function fixture(local, cloud = null, overrides = {}) {
  const saved = new Map();
  const history = [];
  const writes = [];
  let applications = 0;
  const storage = {
    getItem: key => saved.get(key) ?? null,
    setItem: (key, value) => saved.set(key, value)
  };
  const remote = {
    async read() { return structuredClone(cloud); },
    async write(data, expectedRevision) {
      writes.push({data, expectedRevision});
      if ((cloud?.revision ?? null) !== expectedRevision) return null;
      cloud = {document: structuredClone(data), revision: (cloud?.revision ?? 0) + 1};
      return structuredClone(cloud);
    }
  };
  const options = {
    remote, storage, metaKey, readState: () => local,
    applyState(data) { applications++; local = data; return true; },
    onStatus: status => history.push(status),
    ...overrides
  };
  return {
    sync: createCloudSync(options), remote, storage, options, history, writes,
    get applications() { return applications; },
    get local() { return local; }, set local(data) { local = data; },
    get cloud() { return cloud; }, set cloud(row) { cloud = row; }
  };
}

test('creates a cloud copy after uploading photos and stores only revision and SHA-256', async () => {
  const events = [];
  const fx = fixture(document('Ny enhed'), null, {
    uploadPhotos: async data => { assert.equal(data.settings.name, 'Ny enhed'); events.push('photos'); }
  });
  const write = fx.remote.write;
  fx.remote.write = async (...args) => { events.push('document'); return write(...args); };
  assert.deepEqual(await fx.sync.sync(), {state: 'synced', revision: 1});
  assert.deepEqual(events, ['photos', 'document']);
  assert.equal(fx.writes[0].expectedRevision, null);
  const metadata = JSON.parse(fx.storage.getItem(metaKey));
  assert.deepEqual(Object.keys(metadata).sort(), ['fingerprint', 'revision']);
  assert.match(metadata.fingerprint, /^[a-f0-9]{64}$/);
  assert.equal(metadata.revision, 1);
});

test('pulls the cloud copy into a fresh account and waits while local writes are blocked', async () => {
  let canApply = false, hasLocal = false;
  const fx = fixture(document('Tom konto'), {document: document('Eksisterende'), revision: 5}, {
    canApply: () => canApply, hasLocal: () => hasLocal
  });
  const original = fx.options.applyState;
  const sync = createCloudSync({...fx.options, applyState(data) { hasLocal = true; return original(data); }});
  assert.deepEqual(await sync.sync(), {state: 'blocked', reason: 'local-busy'});
  assert.equal(fx.applications, 0);
  assert.equal(fx.storage.getItem(metaKey), null);
  canApply = true;
  assert.equal((await sync.sync()).state, 'synced');
  assert.equal(fx.local.settings.name, 'Eksisterende');
  assert.equal(fx.writes.length, 0);
});

test('recognizes equivalent snapshots with differently ordered object fields and resumes from durable metadata', async () => {
  const local = document('Fælles');
  const cloud = Object.fromEntries(Object.entries(local).reverse());
  cloud.settings = Object.fromEntries(Object.entries(local.settings).reverse());
  const fx = fixture(local, {document: cloud, revision: 1});
  assert.equal((await fx.sync.sync()).state, 'synced');
  assert.equal(fx.writes.length, 0);
  assert.equal(fx.applications, 0);

  const reopened = createCloudSync(fx.options);
  fx.local = document('Kun på enheden');
  assert.equal((await reopened.sync()).state, 'synced');
  assert.equal(fx.writes[0].expectedRevision, 1);
  assert.equal(fx.cloud.document.settings.name, 'Kun på enheden');
  fx.cloud = {document: document('Kun i skyen'), revision: 3};
  assert.equal((await reopened.sync()).state, 'synced');
  assert.equal(fx.local.settings.name, 'Kun i skyen');
});

test('asks before overwriting different initial copies and supports both explicit choices', async () => {
  for (const choice of ['cloud', 'device']) {
    const fx = fixture(document('På enheden'), {document: document('I skyen'), revision: 7});
    assert.deepEqual(await fx.sync.sync(), {state: 'conflict', reason: 'no-common-base', revision: 7});
    assert.equal(fx.applications, 0);
    assert.equal(fx.writes.length, 0);
    assert.equal((await fx.sync.resolve(choice)).state, 'synced');
    assert.equal(fx.local.settings.name, choice === 'cloud' ? 'I skyen' : 'På enheden');
    assert.equal(fx.cloud.document.settings.name, fx.local.settings.name);
  }
});

test('detects changes on both sides after a common base and does not apply a stale conflict decision', async () => {
  const fx = fixture(document('Fælles'), {document: document('Fælles'), revision: 1});
  await fx.sync.sync();
  fx.local = document('Lokal ændring');
  fx.cloud = {document: document('Fjern ændring'), revision: 2};
  assert.equal((await fx.sync.sync()).reason, 'both-changed');
  fx.cloud = {document: document('Senere ændring'), revision: 3};
  const status = await fx.sync.resolve('cloud');
  assert.equal(status.state, 'conflict');
  assert.equal(status.revision, 3);
  assert.equal(fx.local.settings.name, 'Lokal ændring');
  assert.equal(fx.applications, 0);
  assert.equal((await fx.sync.resolve('cloud')).state, 'synced');
  assert.equal(fx.local.settings.name, 'Senere ændring');
});

test('rechecks a lost compare-and-swap before writing and preserves another device’s revision', async () => {
  const fx = fixture(document('Fælles'), {document: document('Fælles'), revision: 1});
  await fx.sync.sync();
  fx.local = document('Lokal ændring');
  const write = fx.remote.write;
  fx.remote.write = async (...args) => {
    fx.cloud = {document: document('Fjern ændring'), revision: 2};
    return write(...args);
  };
  assert.deepEqual(await fx.sync.sync(), {state: 'conflict', reason: 'both-changed', revision: 2});
  assert.equal(fx.writes.length, 1);
  assert.equal(fx.cloud.document.settings.name, 'Fjern ændring');
  assert.equal(fx.local.settings.name, 'Lokal ændring');
});

test('an edit during a pull is preserved even when the local copy was initially empty', async () => {
  const started = deferred(), release = deferred();
  const fx = fixture(null, {document: document('I skyen'), revision: 1});
  const read = fx.remote.read;
  fx.remote.read = async () => { started.resolve(); await release.promise; return read(); };
  const operation = fx.sync.sync();
  await started.promise;
  fx.local = document('Oprettet imens');
  release.resolve();
  assert.equal((await operation).state, 'conflict');
  assert.equal(fx.applications, 0);
  assert.equal(fx.local.settings.name, 'Oprettet imens');
});

test('retakes a snapshot changed during uploads and never writes stale photo references', async () => {
  const started = deferred(), release = deferred();
  const uploads = [];
  const fx = fixture(document('Tidlig'), null, {uploadPhotos: async data => {
    uploads.push(data.settings.name);
    started.resolve();
    await release.promise;
  }});
  const operation = fx.sync.sync();
  await started.promise;
  fx.local.settings.name = 'Senere';
  release.resolve();
  assert.equal((await operation).state, 'synced');
  assert.deepEqual(uploads, ['Tidlig', 'Senere']);
  assert.deepEqual(fx.writes.map(write => write.data.settings.name), ['Senere']);
});

test('retains edits made during an accepted write and follows with the new revision', async () => {
  const started = deferred(), release = deferred();
  const fx = fixture(document('Tidlig'));
  const write = fx.remote.write;
  fx.remote.write = async (...args) => { started.resolve(); await release.promise; return write(...args); };
  const operation = fx.sync.sync();
  await started.promise;
  fx.local = document('Senere');
  release.resolve();
  assert.deepEqual(await operation, {state: 'synced', revision: 2});
  assert.deepEqual(fx.writes.map(item => item.expectedRevision), [null, 1]);
  assert.equal(fx.cloud.document.settings.name, 'Senere');
});

test('failed photo uploads and failed local persistence do not advance the common base', async () => {
  const push = fixture(document('Enhed'), null, {uploadPhotos: async () => false});
  assert.equal((await push.sync.sync()).state, 'error');
  assert.equal(push.writes.length, 0);
  assert.equal(push.storage.getItem(metaKey), null);

  const pull = fixture(null, {document: document('Sky'), revision: 1}, {applyState: () => false});
  assert.deepEqual(await pull.sync.sync(), {state: 'blocked', reason: 'local-write-failed'});
  assert.equal(pull.storage.getItem(metaKey), null);
});

test('ignores late results after disposal and coalesces queued sync calls', async () => {
  const started = deferred(), release = deferred();
  const fx = fixture(document('Enhed'));
  let reads = 0;
  fx.remote.read = async () => { reads++; started.resolve(); await release.promise; return null; };
  const active = fx.sync.sync();
  assert.strictEqual(fx.sync.sync(), active);
  await started.promise;
  const queued = fx.sync.sync();
  fx.sync.schedule();
  fx.sync.dispose();
  release.resolve();
  assert.deepEqual(await active, {state: 'idle', reason: 'disposed'});
  assert.deepEqual(await queued, {state: 'idle', reason: 'disposed'});
  assert.equal(reads, 1);
  assert.equal(fx.writes.length, 0);
  assert.equal(fx.storage.getItem(metaKey), null);
  assert.deepEqual(fx.history.map(status => status.state), ['syncing']);
});
