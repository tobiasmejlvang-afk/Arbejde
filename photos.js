const MAX_BYTES = 5 * 1024 * 1024;
const MAX_PHOTOS = 6;
const STORE = 'photos';
let database;

function openDatabase() {
  if (!database) {
    database = new Promise((resolve, reject) => {
      if (!globalThis.indexedDB) { reject(Error('Browseren understøtter ikke billedlager.')); return; }
      const request = indexedDB.open('arbejde.photos.v1', 1);
      request.onupgradeneeded = () => request.result.createObjectStore(STORE);
      request.onsuccess = () => {
        const result = request.result;
        result.onversionchange = () => { result.close(); database = undefined; };
        resolve(result);
      };
      request.onerror = request.onblocked = () => reject(Error('Billedlageret kunne ikke åbnes.'));
    }).catch(error => { database = undefined; throw error; });
  }
  return database;
}

async function transaction(mode, action) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const request = action(tx.objectStore(STORE));
    tx.oncomplete = () => resolve(request.result);
    tx.onerror = tx.onabort = () => reject(Error('Billedet kunne ikke gemmes eller læses på denne enhed.'));
  });
}

async function imageMime(blob) {
  if (!blob || !blob.size || blob.size > MAX_BYTES) throw Error('Billedet må fylde højst 5 MB.');
  const header = new Uint8Array(await blob.slice(0, 12).arrayBuffer());
  if ([255,216,255].every((byte,index) => header[index] === byte)) return 'image/jpeg';
  if ([137,80,78,71,13,10,26,10].every((byte,index) => header[index] === byte)) return 'image/png';
  const type = String.fromCharCode(...header);
  if (type.startsWith('RIFF') && type.slice(8,12) === 'WEBP') return 'image/webp';
  throw Error('Vælg et billede i JPEG-, PNG- eller WebP-format.');
}

export async function readPhoto(id) {
  return (await transaction('readonly', store => store.get(id))) || null;
}

export async function writePhoto(meta, blob) {
  if (!/^(?:[a-f0-9]{32}|[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12})$/i.test(meta.id) ||
      blob.size !== meta.size || await imageMime(blob) !== meta.mime) throw Error('Billedets oplysninger passer ikke til filen.');
  const image = blob.type === meta.mime ? blob : new Blob([blob], {type: meta.mime});
  await transaction('readwrite', store => store.put(image, meta.id));
}

async function prepare(file) {
  const mime = await imageMime(file);
  const id = crypto.randomUUID?.() || Array.from(crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2,'0')).join('');
  const name = String(file.name || 'Billede').trim().slice(0,150) || 'Billede';
  return {meta: {id, name, mime, size: file.size}, blob: file.type === mime ? file : new Blob([file], {type: mime})};
}

export function bindEntryPhotos(form, existing = [], {readRemote, onError = () => {}} = {}) {
  const root = form.querySelector('[data-entry-photos]');
  const photos = [...existing];
  const drafts = new Map();
  const urls = new Map();
  const loading = new Map();
  let disposed = false;
  let pending = false;
  root.innerHTML = `<fieldset class="entry-photo-group"><legend>Billeder</legend>
    <label class="field">Tilføj billeder<input type="file" accept="image/jpeg,image/png,image/webp" multiple></label>
    <p class="muted small">Op til 6 billeder på højst 5 MB hver. Vælg JPEG, PNG eller WebP.</p>
    <p class="muted small" role="status" data-photo-status></p><div class="entry-photo-list"></div></fieldset>`;
  const picker = root.querySelector('input');
  const list = root.querySelector('.entry-photo-list');
  const status = root.querySelector('[data-photo-status]');

  function revoke(id) {
    const url = urls.get(id);
    if (url) URL.revokeObjectURL(url);
    urls.delete(id);
  }

  async function thumbnail(meta) {
    if (urls.has(meta.id)) return urls.get(meta.id);
    if (!loading.has(meta.id)) {
      const promise = (async () => {
        let blob = drafts.get(meta.id);
        if (!blob) blob = await readPhoto(meta.id).catch(() => null);
        if (!blob && readRemote && !disposed) {
          blob = await readRemote(meta).catch(() => null);
          if (blob) {
            if (await imageMime(blob) !== meta.mime || blob.size !== meta.size) return null;
            await writePhoto(meta, blob).catch(() => {});
          }
        }
        if (!blob || disposed || !photos.some(photo => photo.id === meta.id)) return null;
        const url = URL.createObjectURL(blob);
        urls.set(meta.id, url);
        return url;
      })().catch(() => null).finally(() => loading.delete(meta.id));
      loading.set(meta.id, promise);
    }
    return loading.get(meta.id);
  }

  function render() {
    picker.disabled = pending || photos.length >= MAX_PHOTOS;
    status.textContent = pending ? 'Læser billeder …' : `${photos.length} af ${MAX_PHOTOS} billeder valgt`;
    list.replaceChildren();
    for (const photo of photos) {
      const card = document.createElement('article');
      card.className = 'entry-photo-card';
      const preview = document.createElement('span');
      preview.textContent = 'Henter billede …';
      const name = document.createElement('strong'); name.textContent = photo.name;
      const remove = document.createElement('button');
      remove.type = 'button'; remove.className = 'button secondary'; remove.textContent = 'Fjern billede';
      remove.setAttribute('aria-label', `Fjern billede ${photo.name}`);
      remove.onclick = () => { photos.splice(photos.indexOf(photo),1); drafts.delete(photo.id); revoke(photo.id); render(); };
      card.append(preview,name,remove); list.append(card);
      thumbnail(photo).then(url => {
        if (disposed || !list.contains(card)) return;
        if (!url) { preview.textContent = 'Billedet kunne ikke hentes.'; return; }
        const link = document.createElement('a'); link.href = url; link.target = '_blank'; link.rel = 'noopener';
        const image = document.createElement('img'); image.src = url; image.alt = photo.name;
        link.append(image); preview.replaceChildren(link);
      });
    }
  }

  picker.addEventListener('change', async () => {
    const selected = Array.from(picker.files || []);
    picker.value = '';
    if (!selected.length || pending || disposed) return;
    pending = true; render();
    for (const file of selected) {
      if (photos.length >= MAX_PHOTOS) { onError('Der kan højst vedhæftes 6 billeder.'); break; }
      try {
        const {meta,blob} = await prepare(file);
        if (disposed) return;
        photos.push(meta); drafts.set(meta.id,blob);
      } catch (error) { onError(error.message); }
    }
    pending = false; render();
  });
  render();
  return {
    async save() {
      if (pending) throw Error('Vent, til billederne er læst, og prøv igen.');
      const selected = photos.map(photo => ({...photo}));
      for (const meta of selected) {
        const blob = drafts.get(meta.id);
        if (blob) await writePhoto(meta, blob);
      }
      return selected;
    },
    dispose() { disposed = true; for (const id of urls.keys()) revoke(id); drafts.clear(); }
  };
}
