import {validateState} from './domain.js';

const MAX_ATTEMPTS = 4;
const DISPOSED = Object.freeze({state: 'idle', reason: 'disposed'});

function canonicalDocument(document) {
  const result = validateState(document);
  if (!result.ok) throw new Error('Synkroniseringen indeholder ugyldige arbejdsdata.');
  return JSON.stringify(result.state, (_key, value) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, value[key]]));
  });
}

async function fingerprint(canonical) {
  const bytes = new TextEncoder().encode(canonical);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

function validRevision(revision) {
  return (Number.isSafeInteger(revision) && revision >= 0) || (typeof revision === 'string' && revision.length > 0);
}

function readMetadata(storage, metaKey) {
  try {
    const value = JSON.parse(storage.getItem(metaKey));
    if (validRevision(value?.revision) && typeof value.fingerprint === 'string' && /^[a-f0-9]{64}$/.test(value.fingerprint)) {
      return {revision: value.revision, fingerprint: value.fingerprint};
    }
  } catch {
    // A missing or unreadable common base is handled as an initial sync.
  }
  return null;
}

function remoteSnapshot(row) {
  if (row === null) return null;
  if (!validRevision(row?.revision)) throw new Error('Skydata har en ugyldig revision.');
  return {revision: row.revision, canonical: canonicalDocument(row.document)};
}

export function createCloudSync({
  remote, storage, metaKey, readState, applyState, canApply = () => true,
  hasLocal = document => document != null, onStatus = () => {}, uploadPhotos = async () => {}
}) {
  let base = readMetadata(storage, metaKey);
  let conflict = null;
  let disposed = false;
  let queue = Promise.resolve();
  let pendingSync = null;
  let scheduled = null;

  function report(state, details = {}) {
    if (disposed) return DISPOSED;
    const status = {state, ...details};
    onStatus(status);
    return status;
  }

  function readLocal() {
    const document = readState();
    return {
      canonical: document == null ? null : canonicalDocument(document),
      present: document != null && Boolean(hasLocal(document))
    };
  }

  function sameLocal(left, right) {
    return left.canonical === right.canonical && left.present === right.present;
  }

  function saveBase(revision, hash) {
    base = {revision, fingerprint: hash};
    conflict = null;
    storage.setItem(metaKey, JSON.stringify(base));
  }

  function showConflict(local, cloud, reason = 'both-changed') {
    conflict = {local, cloud};
    return report('conflict', {revision: cloud.revision, reason});
  }

  function pull(local, cloud, hash) {
    if (!canApply()) return report('blocked', {reason: 'local-busy'});
    if (disposed) return DISPOSED;
    if (!sameLocal(local, readLocal())) return null;
    if (applyState(JSON.parse(cloud.canonical)) !== true) return report('blocked', {reason: 'local-write-failed'});
    if (disposed) return DISPOSED;
    saveBase(cloud.revision, hash);
    return report('synced', {revision: cloud.revision});
  }

  async function push(local, cloud, hash) {
    const document = JSON.parse(local.canonical);
    if (await uploadPhotos(document) === false) throw new Error('Billederne kunne ikke synkroniseres.');
    if (disposed) return DISPOSED;
    if (!sameLocal(local, readLocal())) return null;
    const row = await remote.write(document, cloud?.revision ?? null);
    if (disposed) return DISPOSED;
    if (row === null) return null;
    const written = remoteSnapshot(row);
    if (written.canonical !== local.canonical) throw new Error('Skyen bekræftede en anden udgave af arbejdsdataene.');
    saveBase(written.revision, hash);
    if (!sameLocal(local, readLocal())) return null;
    return report('synced', {revision: written.revision});
  }

  async function reconcile() {
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const local = readLocal();
      const row = await remote.read();
      if (disposed) return DISPOSED;
      const cloud = remoteSnapshot(row);
      const [localHash, cloudHash] = await Promise.all([
        local.canonical === null ? null : fingerprint(local.canonical),
        cloud === null ? null : fingerprint(cloud.canonical)
      ]);
      if (disposed) return DISPOSED;
      if (!sameLocal(local, readLocal())) continue;

      let result;
      if (cloud === null) {
        conflict = null;
        if (!local.present) return report('synced', {revision: null});
        result = await push(local, cloud, localHash);
      } else if (!local.present) {
        result = pull(local, cloud, cloudHash);
      } else if (localHash === cloudHash) {
        saveBase(cloud.revision, cloudHash);
        return report('synced', {revision: cloud.revision});
      } else if (base?.fingerprint === cloudHash) {
        result = await push(local, cloud, localHash);
      } else if (base?.fingerprint === localHash) {
        result = pull(local, cloud, cloudHash);
      } else {
        return showConflict(local, cloud, base ? 'both-changed' : 'no-common-base');
      }
      if (result) return result;
    }
    return report('blocked', {reason: 'state-changing'});
  }

  async function resolveConflict(choice, reviewed) {
    if (!reviewed) return report('blocked', {reason: 'no-conflict'});
    const local = readLocal();
    const row = await remote.read();
    if (disposed) return DISPOSED;
    const cloud = remoteSnapshot(row);
    if (!cloud || !sameLocal(local, reviewed.local) || cloud.revision !== reviewed.cloud.revision ||
        cloud.canonical !== reviewed.cloud.canonical) {
      return reconcile();
    }
    const hash = await fingerprint(choice === 'cloud' ? cloud.canonical : local.canonical);
    if (disposed) return DISPOSED;
    if (!sameLocal(local, readLocal())) return reconcile();
    const result = choice === 'cloud' ? pull(local, cloud, hash) : await push(local, cloud, hash);
    return result ?? reconcile();
  }

  function enqueue(operation) {
    const run = queue.then(async () => {
      if (disposed) return DISPOSED;
      report('syncing');
      if (disposed) return DISPOSED;
      try {
        return await operation();
      } catch (error) {
        return report('error', {error});
      }
    });
    queue = run.catch(() => {});
    return run;
  }

  function sync() {
    clearTimeout(scheduled);
    scheduled = null;
    if (disposed) return Promise.resolve(DISPOSED);
    if (!pendingSync) pendingSync = enqueue(() => {
      pendingSync = null;
      return reconcile();
    });
    return pendingSync;
  }

  function schedule() {
    if (disposed || scheduled !== null) return;
    scheduled = setTimeout(() => { void sync(); }, 250);
  }

  function resolve(choice) {
    const reviewed = conflict;
    return enqueue(() => {
      if (choice !== 'cloud' && choice !== 'device') throw new Error('Ugyldigt valg af data til synkronisering.');
      return resolveConflict(choice, reviewed);
    });
  }

  function dispose() {
    disposed = true;
    conflict = null;
    clearTimeout(scheduled);
    scheduled = null;
  }

  return {sync, schedule, resolve, dispose};
}
