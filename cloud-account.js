import {createCloudSync} from './cloud-sync.js';
import {readPhoto} from './photos.js';

export const CLOUD_URL = 'https://puywakntfvdnysvjynjt.supabase.co';
const PUBLISHABLE_KEY = 'sb_publishable_6gn7ozPfx1iWwgHZ1dmPdg_-Bt0uM1O';
const APP_URL = 'https://tobiasmejlvang-afk.github.io/Arbejde/';
const TABLE = 'arbejde_workspaces';
const BUCKET = 'arbejde-photos';
const PROJECT = new URL(CLOUD_URL).hostname.split('.')[0];

function failure(error) {
  if (['PGRST205', '42P01'].includes(error?.code)) return 'Projektet mangler appens datalager. Kør setup.sql i Supabase og prøv igen.';
  if (error?.code === 'invalid_credentials') return 'E-mail eller adgangskode blev ikke genkendt.';
  if (error?.code === 'email_not_confirmed') return 'Bekræft først din e-mail via linket i din indbakke.';
  if (error?.code === 'weak_password') return 'Vælg en stærkere adgangskode på mindst 8 tegn.';
  if (error?.status === 429) return 'Der er sendt for mange forsøg. Vent et øjeblik og prøv igen.';
  if (error?.message?.startsWith('Arbejde: ')) return error.message.slice(9);
  return 'Forbindelsen kunne ikke gennemføres. Kontrollér internetforbindelsen og prøv igen.';
}

export function createCloudAccount({switchWorkspace, readState, applyState, canApply, hasLocal, copyLocal, onSession, confirm, escape, storage}) {
  let client, engine, user, started = false, recovery = false, busy = false, notice = '', status = {state: 'idle'};
  let uploaded = new Set();
  let receivedAuthChange = false;
  const stateText = () => ({
    idle: 'Klargør synkronisering', syncing: 'Synkroniserer …', synced: 'Synkroniseret',
    blocked: 'Synkroniseringen fortsætter, når formularen er lukket.',
    conflict: 'Der er forskellige ændringer på denne enhed og på kontoen. Vælg hvilken version du vil beholde.',
    error: status.error?.message || 'Synkronisering afventer forbindelse.'
  })[status.state] || 'Klargør synkronisering';
  const panel = () => `<p role="status" class="settings-copy muted" data-cloud-status>${escape(user && !recovery ? stateText() : notice)}</p>${user && !recovery ? `<div class="backup-actions"><button class="button secondary" type="button" data-cloud="sync">Synkronisér nu</button>${status.state === 'conflict' ? '<button class="button secondary" type="button" data-cloud="use-cloud">Brug kontoens version</button><button class="button secondary" type="button" data-cloud="use-device">Brug enhedens version</button>' : ''}</div>` : ''}`;
  function refresh() {
    const target = document.querySelector('[data-cloud-status-panel]');
    if (target) target.innerHTML = panel();
  }
  function showMessage(message) { notice = message; refresh(); }
  function setStatus(next) {
    status = next.state === 'error' ? {...next, error: {message: failure(next.error)}} : next;
    refresh();
  }
  function pathFor(accountId, photoId) { return `${accountId}/${photoId}`; }
  function remoteFor(accountId, known) {
    return {
      async read() {
        const {data, error} = await client.from(TABLE).select('document,revision').eq('user_id', accountId).maybeSingle();
        if (error) throw error;
        if (Array.isArray(data?.document?.entries)) {
          for (const entry of data.document.entries) {
            if (Array.isArray(entry?.photos)) for (const photo of entry.photos) if (photo?.id) known.add(photo.id);
          }
        }
        return data;
      },
      async write(document, expectedRevision) {
        const row = {document, revision: (expectedRevision ?? 0) + 1, updated_at: new Date().toISOString()};
        const query = expectedRevision === null
          ? client.from(TABLE).insert({...row, user_id: accountId})
          : client.from(TABLE).update(row).eq('user_id', accountId).eq('revision', expectedRevision);
        const {data, error} = await query.select('document,revision').maybeSingle();
        if (error?.code === '23505' && expectedRevision === null) return null;
        if (error) throw error;
        return data;
      }
    };
  }
  async function uploadPhotos(accountId, document, known) {
    const ids = new Set(document.entries.flatMap(entry => (entry.photos || []).map(photo => photo.id)));
    for (const id of ids) {
      if (known.has(id)) continue;
      if (user?.id !== accountId) throw Error('Arbejde: Kontoen blev ændret under synkronisering.');
      const blob = await readPhoto(id);
      if (!blob) throw Error('Arbejde: En registrering henviser til et billede, som mangler på enheden. Åbn registreringen og tilføj billedet igen.');
      if (user?.id !== accountId) throw Error('Arbejde: Kontoen blev ændret under synkronisering.');
      const {error} = await client.storage.from(BUCKET).upload(pathFor(accountId, id), blob, {contentType: blob.type, upsert: false});
      if (error && ![409, '409'].includes(error.statusCode) && error.error !== 'Duplicate') throw error;
      known.add(id);
    }
  }
  function activate(session, event) {
    const next = session?.user;
    if (event === 'PASSWORD_RECOVERY') recovery = true;
    if (next?.id === user?.id) { if (event === 'PASSWORD_RECOVERY') onSession(); return; }
    engine?.dispose(); engine = null; user = next; status = {state: 'idle'}; uploaded = new Set();
    if (!user) recovery = false;
    const accountId = user?.id;
    switchWorkspace(accountId ? `${PROJECT}.${accountId}` : null);
    if (accountId) {
      const known = uploaded;
      engine = createCloudSync({remote: remoteFor(accountId, known), storage, metaKey: `arbejde.sync.${PROJECT}.${accountId}`,
        readState, applyState, canApply, hasLocal, onStatus: setStatus,
        uploadPhotos: document => uploadPhotos(accountId, document, known)});
      if (!recovery) engine.sync();
    }
    onSession();
  }
  async function submit(event) {
    const form = event.target.closest?.('[data-cloud-form]');
    if (!form) return;
    event.preventDefault();
    if (busy) return;
    if (!client) return showMessage('Login kunne ikke indlæses. Genindlæs appen og prøv igen.');
    const fields = new FormData(form);
    const action = event.submitter?.value || (recovery ? 'update' : 'login');
    const email = String(fields.get('email') || '').trim();
    const password = String(fields.get('password') || '');
    if (action !== 'update' && (!email || !form.elements.email.checkValidity())) return showMessage('Indtast din e-mailadresse.');
    if (['signup', 'update'].includes(action) && password.length < 8) return showMessage('Adgangskoden skal have mindst 8 tegn.');
    if (action === 'login' && !password) return showMessage('Indtast din adgangskode.');
    busy = true;
    for (const button of form.querySelectorAll('button')) button.disabled = true;
    showMessage('Forbinder …');
    try {
      let result;
      if (action === 'signup') result = await client.auth.signUp({email, password, options: {emailRedirectTo: APP_URL}});
      else if (action === 'reset') result = await client.auth.resetPasswordForEmail(email, {redirectTo: APP_URL});
      else if (action === 'update') result = await client.auth.updateUser({password});
      else result = await client.auth.signInWithPassword({email, password});
      if (result.error) throw result.error;
      if (form.elements.password) form.elements.password.value = '';
      if (action === 'reset') showMessage('Hvis e-mailen har en konto, sender Supabase et link til at vælge ny adgangskode.');
      else if (action === 'signup' && !result.data?.session) showMessage('Tjek din indbakke og bekræft e-mailen, før du logger ind.');
      else if (action === 'update') { recovery = false; onSession(); engine?.sync(); }
      else showMessage('Du er logget ind. Henter dine data …');
    } catch (error) { showMessage(failure(error)); }
    finally { busy = false; for (const button of form.querySelectorAll('button')) button.disabled = false; }
  }
  async function click(event) {
    const action = event.target.closest?.('[data-cloud]')?.dataset.cloud;
    if (!action || !client) return;
    if (action === 'sync') return engine?.sync();
    if (action === 'logout') {
      try {
        const {error} = await client.auth.signOut({scope: 'local'});
        if (error) showMessage(failure(error));
      } catch (error) { showMessage(failure(error)); }
      return;
    }
    if (action === 'copy-local') return confirm('Kopiér lokale data til kontoen?', 'Den lokale kopi erstatter kontoens nuværende registreringer, planer og indstillinger. Ændringen synkroniseres til dine andre enheder.', () => copyLocal());
    const selected = action === 'use-cloud' ? 'cloud' : 'device';
    if (['use-cloud', 'use-device'].includes(action)) {
      confirm('Vælg version', selected === 'cloud' ? 'Kontoens version erstatter de lokale data i dette arbejdsrum.' : 'Denne enheds version erstatter kontoens data og synkroniseres til andre enheder.', () => {
        const pending = engine; setTimeout(() => pending?.resolve(selected), 0);
      });
    }
  }
  return {
    get user() { return user; },
    start(root) {
      if (started) return;
      started = true;
      root.addEventListener('submit', submit); root.addEventListener('click', click);
      if (!globalThis.supabase?.createClient) return;
      try { client = globalThis.supabase.createClient(CLOUD_URL, PUBLISHABLE_KEY, {auth: {storageKey: `arbejde.auth.${PROJECT}`}}); }
      catch { showMessage('Login kunne ikke indlæses i denne browser.'); return; }
      client.auth.onAuthStateChange((event, session) => {
        if (event === 'INITIAL_SESSION' && receivedAuthChange) return;
        if (event !== 'INITIAL_SESSION') receivedAuthChange = true;
        setTimeout(() => activate(session, event), 0);
      });
      window.addEventListener('online', () => { if (!recovery) engine?.sync(); });
      document.addEventListener('visibilitychange', () => { if (!document.hidden && !recovery) engine?.sync(); });
      setInterval(() => { if (!document.hidden && !recovery) engine?.sync(); }, 20000);
    },
    schedule() { if (!recovery) engine?.schedule(); },
    sync() { if (!recovery) return engine?.sync(); },
    async readPhoto(meta) {
      const accountId = user?.id;
      if (!accountId || !client) return null;
      const {data, error} = await client.storage.from(BUCKET).download(pathFor(accountId, meta.id));
      if (user?.id !== accountId) return null;
      if (error) throw error;
      return data;
    },
    render() {
      const controls = recovery
        ? '<form class="form-grid cloud-form" data-cloud-form><label class="field">Ny adgangskode<input name="password" type="password" autocomplete="new-password" required minlength="8"></label><button class="button primary" type="submit" value="update">Gem ny adgangskode</button></form>'
        : user
          ? `<p class="settings-copy">Logget ind som <strong>${escape(user.email || 'din konto')}</strong></p><div class="backup-actions"><button class="button secondary" type="button" data-cloud="copy-local">Kopiér lokale data til kontoen</button><button class="button secondary" type="button" data-cloud="logout">Log ud</button></div>`
          : `<form class="form-grid cloud-form" data-cloud-form><label class="field">E-mail<input name="email" type="email" autocomplete="username" required maxlength="254"></label><label class="field">Adgangskode<input name="password" type="password" autocomplete="current-password" required maxlength="256"></label><div class="backup-actions full"><button class="button primary" type="submit" value="login">Log ind</button><button class="button secondary" type="submit" value="signup">Opret konto</button><button class="button secondary" type="submit" value="reset" formnovalidate>Glemt adgangskode</button></div></form>`;
      return `<section class="card settings-section cloud-card"><span class="surface-label">DIN KONTO</span><h2>Login og synkronisering</h2><p class="settings-copy muted">Brug samme konto på dine enheder. Gemte registreringer, billeder, arbejdsplaner og indstillinger synkroniseres automatisk.</p>${controls}<div data-cloud-status-panel>${panel()}</div></section>`;
    }
  };
}
