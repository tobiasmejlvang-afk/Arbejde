import { uid, todayISO } from './domain.js';
import { emptyDirectory, validateDirectory, mergeDirectoryState } from './directory-domain.js';

const ui = { tab: 'vehicles', query: '', verifyOnly: false };
const escape = (ctx, value) => ctx.escape(String(value ?? ''));
const selected = value => value ? ' checked' : '';
const icon = (name, size = 48, className = 'panel-icon') => `<img class="${className}" src="assets/brand/${name}.png" alt="" width="${size}" height="${size}" decoding="async">`;
const currentDirectory = ctx => ctx.state.directory || null;
const findVehicle = (directory, id) => directory?.vehicles.find(vehicle => vehicle.id === id);
const findPerson = (directory, id) => directory?.people.find(person => person.id === id);
const vehicleIssues = (directory, id) => directory.issues.filter(issue => issue.vehicleId === id);
const personVehicles = (directory, personId) => directory.vehicles.filter(vehicle => vehicle.driverIds.includes(personId));
const searchText = value => String(value ?? '').trim().toLocaleLowerCase('da-DK');
const clone = value => JSON.parse(JSON.stringify(value));

function textField(ctx, label, name, value = '', { required = false, max = 160, full = false, placeholder = '' } = {}) {
  return `<label class="field${full ? ' full' : ''}"><span>${label}</span><input name="${name}" value="${escape(ctx, value)}" maxlength="${max}"${required ? ' required' : ''}${placeholder ? ` placeholder="${escape(ctx, placeholder)}"` : ''}></label>`;
}

function notesField(ctx, name, value, label = 'Noter') {
  return `<label class="field full"><span>${label}</span><textarea name="${name}" maxlength="4000" rows="3">${escape(ctx, value)}</textarea></label>`;
}

function phoneLink(ctx, person) {
  const value = String(person.phone || '').trim();
  if (!value) return '<span class="muted">Telefon ikke angivet</span>';
  const display = escape(ctx, value);
  // Preserve the printed number. Only a recognizable single number becomes a dial link.
  if (!/^[+()\d .-]+$/.test(value) || !/\d/.test(value)) return `<span class="directory-phone">${display}</span>`;
  let target = value.replace(/[() .-]/g, '');
  if (!/^\+?\d+$/.test(target)) return `<span class="directory-phone">${display}</span>`;
  const extension = String(person.extension || '').trim();
  if (/^\d+$/.test(extension)) target += `;ext=${extension}`;
  return `<a class="directory-phone" href="tel:${escape(ctx, target)}">${display}</a>`;
}

function sourceReference(ctx, directory, page) {
  const parts = [];
  if (directory.source?.fileName) parts.push(escape(ctx, directory.source.fileName));
  if (Number(page) > 0) parts.push(`side ${Number(page)}`);
  return parts.length ? `<span class="directory-source-note">${parts.join(' · ')}</span>` : '<span class="directory-source-note">Tilføjet manuelt</span>';
}

function status(ctx, vehicle) {
  return vehicle.requiresVerification
    ? '<span class="badge directory-status directory-warning">Kontrollér kilde</span>'
    : '<span class="badge directory-status">Ingen kontrolmarkering</span>';
}

function driverChips(ctx, directory, vehicle) {
  return vehicle.driverIds.length ? vehicle.driverIds.map(id => {
    const person = findPerson(directory, id);
    return person ? `<button class="directory-person-chip" type="button" data-directory-action="person-details" data-id="${escape(ctx, person.id)}">${escape(ctx, person.name)}</button>` : '';
  }).join('') : '<span class="muted">Ingen chauffør tilknyttet</span>';
}

function matchesVehicle(ctx, directory, vehicle) {
  const people = vehicle.driverIds.map(id => findPerson(directory, id)).filter(Boolean);
  const text = [vehicle.number, vehicle.registrationNumber, vehicle.makeModel, vehicle.description, vehicle.notes, ...people.flatMap(person => [person.name, person.phone, person.phone.replace(/\D/g, ''), person.extension])].join(' ');
  return (!ui.verifyOnly || vehicle.requiresVerification) && searchText(text).includes(searchText(ui.query));
}

function vehicleCards(ctx, directory) {
  const vehicles = directory.vehicles.filter(vehicle => matchesVehicle(ctx, directory, vehicle));
  return `<div class="directory-count" aria-live="polite">${vehicles.length} af ${directory.vehicles.length} vogne</div>${vehicles.length ? `<div class="directory-grid">${vehicles.map(vehicle => `<article class="card directory-card"><div class="directory-card-head"><button class="directory-vehicle-number" type="button" data-directory-action="vehicle-details" data-id="${escape(ctx, vehicle.id)}"><span class="surface-label">VOGN</span><strong>${escape(ctx, vehicle.number)}</strong></button>${status(ctx, vehicle)}</div><div class="directory-card-meta"><strong>${escape(ctx, vehicle.registrationNumber || 'Registrering ikke angivet')}</strong><span class="muted">${escape(ctx, vehicle.makeModel || 'Model ikke angivet')}</span></div><p class="directory-description muted">${escape(ctx, vehicle.description || 'Ingen beskrivelse tilføjet.')}</p><div class="directory-driver-list">${driverChips(ctx, directory, vehicle)}</div><div class="directory-card-actions"><button class="button secondary" type="button" data-directory-action="vehicle-details" data-id="${escape(ctx, vehicle.id)}">Se vogn</button><button class="button subtle" type="button" data-directory-action="vehicle-work" data-id="${escape(ctx, vehicle.id)}">Registrér arbejde</button></div></article>`).join('')}</div>` : emptyResults('Ingen vogne matcher din søgning. Prøv et andet navn eller vognnummer.')}`;
}

function peopleCards(ctx, directory) {
  const people = directory.people.filter(person => searchText([person.name, person.phone, person.phone.replace(/\D/g, ''), person.extension, ...person.roles, ...personVehicles(directory, person.id).map(vehicle => vehicle.number)].join(' ')).includes(searchText(ui.query)));
  return `<div class="directory-count" aria-live="polite">${people.length} af ${directory.people.length} kollegaer</div>${people.length ? `<div class="directory-grid">${people.map(person => `<article class="card directory-card"><div class="directory-card-head"><button class="directory-person-name" type="button" data-directory-action="person-details" data-id="${escape(ctx, person.id)}">${escape(ctx, person.name)}</button></div><div class="directory-role-list">${person.roles.map(role => `<span class="badge">${escape(ctx, role)}</span>`).join('')}</div><div class="directory-card-meta">${phoneLink(ctx, person)}${person.extension ? `<span class="muted">Lokalnummer ${escape(ctx, person.extension)}</span>` : ''}</div><div class="directory-driver-list">${personVehicles(directory, person.id).map(vehicle => `<button class="directory-person-chip" type="button" data-directory-action="vehicle-details" data-id="${escape(ctx, vehicle.id)}">Vogn ${escape(ctx, vehicle.number)}</button>`).join('') || '<span class="muted">Ingen vogn tilknyttet</span>'}</div><div class="directory-card-actions"><button class="button secondary" type="button" data-directory-action="person-details" data-id="${escape(ctx, person.id)}">Se kollega</button><button class="button subtle" type="button" data-directory-action="edit-person" data-id="${escape(ctx, person.id)}">Ret oplysninger</button></div></article>`).join('')}</div>` : emptyResults('Ingen kollegaer matcher din søgning. Prøv et navn, telefonnummer eller vognnummer.')}`;
}

function issueCards(ctx, directory) {
  const issues = directory.issues.filter(issue => {
    const vehicle = findVehicle(directory, issue.vehicleId);
    const people = (vehicle?.driverIds || []).map(id => findPerson(directory, id)?.name || '');
    return (!ui.verifyOnly || vehicle?.requiresVerification) && searchText([vehicle?.number, vehicle?.registrationNumber, issue.message, ...people].join(' ')).includes(searchText(ui.query));
  });
  return `<div class="directory-count" aria-live="polite">${issues.length} kildepunkter</div><p class="directory-source-note">Punkterne stammer fra den importerede kilde og bevares, når du retter oplysninger. En markering som kontrolleret gælder vognens nuværende oplysninger.</p>${issues.length ? `<div class="directory-issue-list">${issues.map(issue => {
    const vehicle = findVehicle(directory, issue.vehicleId);
    return `<article class="card directory-issue-card"><div class="directory-card-head"><h3>Vogn ${escape(ctx, vehicle?.number || '—')}</h3><span class="badge directory-warning">Kontrollér kilde</span></div><p>${escape(ctx, issue.message)}</p>${issue.truncatedInSource ? '<p class="directory-warning">Oplysningerne er afkortet i kilden. Kontrollér originaldokumentet.</p>' : ''}<div class="directory-card-meta">${sourceReference(ctx, directory, issue.sourcePage)}${vehicle && !vehicle.requiresVerification ? '<span class="muted">Vognens kontrolmarkering er slået fra. Det oprindelige kildepunkt bevares.</span>' : ''}</div><div class="directory-card-actions"><button class="button secondary" type="button" data-directory-action="vehicle-details" data-id="${escape(ctx, issue.vehicleId)}">Se vogn & kildepunkt</button><button class="button subtle" type="button" data-directory-action="edit-vehicle" data-id="${escape(ctx, issue.vehicleId)}">Ret vognoplysninger</button></div></article>`;
  }).join('')}</div>` : emptyResults('Ingen kildepunkter matcher dine filtre.')}`;
}

function emptyResults(message) {
  return `<div class="directory-empty empty-state"><h3>Ingen resultater</h3><p>${message}</p></div>`;
}

function renderContent(ctx, directory) {
  return ui.tab === 'people' ? peopleCards(ctx, directory) : ui.tab === 'issues' ? issueCards(ctx, directory) : vehicleCards(ctx, directory);
}

export function renderDirectory(ctx) {
  const directory = currentDirectory(ctx);
  const heading = `<div class="page-heading directory-heading"><div class="page-intro">${icon('vehicle', 64, 'page-title-icon')}<div class="page-heading-copy"><span class="section-label">DIT PRIVATE ARBEJDSREGISTER</span><h1>Vogne & kollegaer</h1><p class="muted">Find vognen, de rette oplysninger og dine kollegaer ét sted.</p></div></div><div class="heading-actions directory-heading-actions"><button class="button secondary" type="button" data-directory-action="import">Importér register</button>${directory ? '<button class="button primary" type="button" data-directory-action="add-vehicle">+ Tilføj vogn</button>' : ''}</div></div>`;
  const input = '<input id="directory-file" type="file" accept="application/json,.json" hidden>';
  if (!directory) return `${heading}${input}<section class="card directory-empty empty-state">${icon('vehicle', 112, 'empty-art')}<h2>Dit register starter med din kopi</h2><p>Importér den private JSON-kopi for at samle vogne og kollegaer her. Registeret gemmes lokalt sammen med resten af dine data.</p><div class="directory-card-actions"><button class="button primary" type="button" data-directory-action="import">Importér privat register</button><button class="button secondary" type="button" data-directory-action="add-vehicle">Tilføj vogn manuelt</button><button class="button subtle" type="button" data-directory-action="add-person">Tilføj kollega</button></div><p class="muted directory-source-note">Vælg en fil med typen arbejde-directory. Der sendes ingen oplysninger til en server.</p></section>`;
  const tabs = [['vehicles', 'Vogne', directory.vehicles.length], ['people', 'Kollegaer', directory.people.length], ['issues', 'Kontrolpunkter', directory.issues.length]];
  return `${heading}${input}<section class="card directory-source"><div class="panel-title-group">${icon('job', 40)}<div><span class="surface-label">${escape(ctx, directory.name || 'ARBEJDSREGISTER')}</span><h2>${escape(ctx, [directory.company, directory.department].filter(Boolean).join(' · ') || 'Dit lokale register')}</h2><div class="directory-source-meta">${sourceReference(ctx, directory, 0)}${directory.source?.referenceDate ? `<span>Reference: ${escape(ctx, directory.source.referenceDate)}</span>` : ''}</div></div></div><div class="directory-card-actions"><button class="button subtle" type="button" data-directory-action="add-person">+ Tilføj kollega</button><button class="button secondary" type="button" data-directory-action="export">Download register</button></div></section>
    <div class="directory-toolbar"><div class="directory-tabs" role="tablist" aria-label="Vis register">${tabs.map(([key, label, count]) => `<button id="directory-tab-${key}" type="button" role="tab" aria-selected="${ui.tab === key}" aria-controls="directory-content" class="${ui.tab === key ? 'active' : ''}" data-directory-action="tab" data-tab="${key}">${label}<span class="directory-tab-count">${count}</span></button>`).join('')}</div><div class="directory-search"><label class="sr-only" for="directory-search">Søg i registeret</label><input id="directory-search" type="search" maxlength="160" data-directory-search placeholder="Søg efter vogn, navn eller telefon…" value="${escape(ctx, ui.query)}"></div>${ui.tab !== 'people' ? `<label class="directory-filter-toggle"><input type="checkbox" data-directory-verify${selected(ui.verifyOnly)}><span>Kun til kontrol</span></label>` : ''}</div><section id="directory-content" class="directory-content" role="tabpanel" aria-labelledby="directory-tab-${ui.tab}" tabindex="0">${renderContent(ctx, directory)}</section>`;
}

function infoModal(ctx, title, html) {
  ctx.modal(title, html, () => true);
  const dialog = document.querySelector('dialog[open]');
  const submit = dialog?.querySelector('button[type="submit"]');
  if (submit) submit.textContent = 'Luk';
  const cancel = dialog?.querySelector('#cancel-editor');
  if (cancel) cancel.hidden = true;
  if (dialog) bindActions(ctx, dialog);
}

function showVehicle(ctx, id) {
  const directory = currentDirectory(ctx), vehicle = findVehicle(directory, id);
  if (!vehicle) return;
  const issues = vehicleIssues(directory, id);
  infoModal(ctx, `Vogn ${vehicle.number}`, `<div class="directory-details"><div class="directory-card-head">${status(ctx, vehicle)}${sourceReference(ctx, directory, vehicle.sourcePage)}</div><dl class="directory-detail-grid"><div><dt>Registreringsnummer</dt><dd>${escape(ctx, vehicle.registrationNumber || 'Ikke angivet')}</dd></div><div><dt>Mærke / model</dt><dd>${escape(ctx, vehicle.makeModel || 'Ikke angivet')}</dd></div><div class="full"><dt>Beskrivelse</dt><dd>${escape(ctx, vehicle.description || 'Ikke angivet')}</dd></div></dl><section class="directory-form-section"><h3>Tilknyttede kollegaer</h3><div class="directory-driver-list">${vehicle.driverIds.map(personId => {
    const person = findPerson(directory, personId);
    return person ? `<div class="directory-driver-card"><button class="directory-person-name" type="button" data-directory-action="person-details" data-id="${escape(ctx, person.id)}">${escape(ctx, person.name)}</button>${phoneLink(ctx, person)}${person.extension ? `<span class="muted">Lokalnummer ${escape(ctx, person.extension)}</span>` : ''}</div>` : '';
  }).join('') || '<p class="muted">Ingen chauffør tilknyttet.</p>'}</div></section>${vehicle.notes ? `<section class="directory-form-section"><h3>Noter</h3><p class="directory-source-note">${escape(ctx, vehicle.notes)}</p></section>` : ''}${issues.length ? `<section class="directory-form-section"><h3>Kontrollér kilde</h3><div class="directory-issue-list">${issues.map(issue => `<div class="directory-issue-card directory-warning"><p>${escape(ctx, issue.message)}</p>${issue.truncatedInSource ? '<p>Oplysningerne er afkortet i originalkilden.</p>' : ''}${sourceReference(ctx, directory, issue.sourcePage)}</div>`).join('')}</div></section>` : ''}<div class="directory-card-actions"><button class="button secondary" type="button" data-directory-action="edit-vehicle" data-id="${escape(ctx, id)}">Ret vogn</button><button class="button primary" type="button" data-directory-action="vehicle-work" data-id="${escape(ctx, id)}">Registrér arbejde på vognen</button></div></div>`);
}

function showPerson(ctx, id) {
  const directory = currentDirectory(ctx), person = findPerson(directory, id);
  if (!person) return;
  infoModal(ctx, person.name, `<div class="directory-details"><div class="directory-role-list">${person.roles.map(role => `<span class="badge">${escape(ctx, role)}</span>`).join('')}</div><dl class="directory-detail-grid"><div><dt>Telefon</dt><dd>${phoneLink(ctx, person)}</dd></div><div><dt>Lokalnummer</dt><dd>${escape(ctx, person.extension || 'Ikke angivet')}</dd></div></dl><section class="directory-form-section"><h3>Tilknyttede vogne</h3><div class="directory-driver-list">${personVehicles(directory, id).map(vehicle => `<button class="directory-person-chip" type="button" data-directory-action="vehicle-details" data-id="${escape(ctx, vehicle.id)}">Vogn ${escape(ctx, vehicle.number)}</button>`).join('') || '<p class="muted">Ingen vogn tilknyttet.</p>'}</div></section>${person.notes ? `<section class="directory-form-section"><h3>Noter</h3><p class="directory-source-note">${escape(ctx, person.notes)}</p></section>` : ''}<div class="directory-source-meta">${person.sourcePages.map(page => sourceReference(ctx, directory, page)).join('') || '<span class="directory-source-note">Tilføjet manuelt</span>'}</div><div class="directory-card-actions"><button class="button secondary" type="button" data-directory-action="edit-person" data-id="${escape(ctx, id)}">Ret kollega</button></div></div>`);
}

function persist(ctx, directory, message) {
  const checked = validateDirectory(directory);
  if (!checked.ok) { ctx.toast(checked.errors.slice(0, 2).join(' ') || 'Kontrollér registerets oplysninger.'); return false; }
  try {
    Object.assign(ctx.state, mergeDirectoryState(ctx.state, checked.directory));
    ctx.closeModal();
    ctx.save();
    ctx.toast(message);
    return true;
  } catch (error) { ctx.toast(error.message || 'Registeret kunne ikke gemmes.'); return false; }
}

function editVehicle(ctx, id) {
  const directory = currentDirectory(ctx) || emptyDirectory();
  const existing = id ? findVehicle(directory, id) : null;
  if (id && !existing) return;
  const vehicle = existing || { id: uid(), number: '', registrationNumber: '', makeModel: '', description: '', driverIds: [], requiresVerification: true, sourcePage: 0, sourceHighlight: null, notes: '' };
  ctx.modal(existing ? `Ret vogn ${vehicle.number}` : 'Tilføj vogn', `<div class="form-grid">${textField(ctx, 'Vognnummer', 'number', vehicle.number, { required: true, max: 60 })}${textField(ctx, 'Registreringsnummer', 'registrationNumber', vehicle.registrationNumber, { max: 40 })}${textField(ctx, 'Mærke / model', 'makeModel', vehicle.makeModel, { max: 120, full: true })}${notesField(ctx, 'description', vehicle.description, 'Beskrivelse')}<fieldset class="field full directory-driver-picker"><legend>Tilknyttede kollegaer</legend>${directory.people.length ? directory.people.map(person => `<label class="directory-check-label"><input type="checkbox" name="driverIds" value="${escape(ctx, person.id)}"${selected(vehicle.driverIds.includes(person.id))}><span>${escape(ctx, person.name)}</span></label>`).join('') : '<p class="muted">Tilføj en kollega i registeret for at kunne tilknytte personen her.</p>'}</fieldset>${notesField(ctx, 'notes', vehicle.notes)}<label class="directory-check-label full"><input type="checkbox" name="verified"${selected(!vehicle.requiresVerification)}><span>Jeg har kontrolleret vognoplysningerne mod kilden</span></label><p class="directory-source-note full">Oprindelige kildepunkter bevares. Markeringen gælder de vognoplysninger, du gemmer her.</p></div>`, data => {
    const next = clone(directory);
    const updated = { ...vehicle, number: String(data.get('number') || '').trim(), registrationNumber: String(data.get('registrationNumber') || '').trim(), makeModel: String(data.get('makeModel') || '').trim(), description: String(data.get('description') || '').trim(), driverIds: data.getAll('driverIds').map(String), requiresVerification: !data.has('verified'), notes: String(data.get('notes') || '').trim() };
    if (!updated.number) { ctx.toast('Indtast et vognnummer.'); return false; }
    if (next.vehicles.some(item => item.id !== vehicle.id && searchText(item.number) === searchText(updated.number))) { ctx.toast('Vognnummeret findes allerede i registeret.'); return false; }
    if (existing) next.vehicles = next.vehicles.map(item => item.id === id ? updated : item);
    else next.vehicles.push(updated);
    next.people = next.people.map(person => ({ ...person, vehicleNumbers: [...new Set([...person.vehicleNumbers.filter(value => value !== vehicle.number && value !== updated.number), ...(updated.driverIds.includes(person.id) ? [updated.number] : [])])] }));
    return persist(ctx, next, existing ? 'Vognoplysningerne er opdateret.' : 'Vognen er tilføjet.');
  });
}

function editPerson(ctx, id) {
  const directory = currentDirectory(ctx) || emptyDirectory();
  const existing = id ? findPerson(directory, id) : null;
  if (id && !existing) return;
  const person = existing || { id: uid(), name: '', phone: '', extension: '', roles: [], sourcePages: [], vehicleNumbers: [], notes: '' };
  ctx.modal(existing ? 'Ret kollega' : 'Tilføj kollega', `<div class="form-grid">${textField(ctx, 'Navn', 'name', person.name, { required: true, max: 160, full: true })}${textField(ctx, 'Telefon', 'phone', person.phone, { max: 80 })}${textField(ctx, 'Lokalnummer', 'extension', person.extension, { max: 40 })}${textField(ctx, 'Roller · adskilt med komma', 'roles', person.roles.join(', '), { max: 1000, full: true, placeholder: 'Fx chauffør, afløser' })}${notesField(ctx, 'notes', person.notes)}<p class="directory-source-note full">Tilknyt kollegaen til en vogn ved at redigere vognens oplysninger. Telefon og lokalnummer gemmes med den ordlyd, du skriver.</p></div>`, data => {
    const next = clone(directory);
    const updated = { ...person, name: String(data.get('name') || '').trim(), phone: String(data.get('phone') || '').trim(), extension: String(data.get('extension') || '').trim(), roles: [...new Set(String(data.get('roles') || '').split(',').map(role => role.trim()).filter(Boolean))], notes: String(data.get('notes') || '').trim() };
    if (!updated.name) { ctx.toast('Indtast kollegaens navn.'); return false; }
    if (updated.roles.length > 20 || updated.roles.some(role => role.length > 80)) { ctx.toast('Brug højst 20 roller med op til 80 tegn i hver.'); return false; }
    if (existing) next.people = next.people.map(item => item.id === id ? updated : item);
    else next.people.push(updated);
    return persist(ctx, next, existing ? 'Kollegaens oplysninger er opdateret.' : 'Kollegaen er tilføjet.');
  });
}

function exportDirectory(ctx) {
  const directory = currentDirectory(ctx);
  if (!directory) return;
  const result = validateDirectory(directory);
  if (!result.ok) { ctx.toast('Registeret skal kontrolleres, før det kan eksporteres.'); return; }
  const data = { kind: 'arbejde-directory', version: 1, directory: result.directory };
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `arbejde-privat-register-${todayISO()}.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  ctx.toast('Den private kopi af registeret er downloadet.');
}

async function importDirectory(ctx, file) {
  if (!file) return;
  if (file.size > 10 * 1024 * 1024) { ctx.toast('Vælg en JSON-kopi under 10 MB.'); return; }
  try {
    const data = JSON.parse(await file.text());
    if (data.kind !== 'arbejde-directory' || data.version !== 1 || !data.directory) { ctx.toast('Vælg en privat kopi med typen arbejde-directory og version 1.'); return; }
    const result = validateDirectory(data.directory);
    if (!result.ok) { ctx.toast(result.errors.slice(0, 2).join(' ') || 'Registerfilen har et ugyldigt format.'); return; }
    const directory = result.directory;
    const description = `Kopien indeholder ${directory.vehicles.length} vogne, ${directory.people.length} kollegaer og ${directory.issues.length} kildepunkter.${currentDirectory(ctx) ? ' Den erstatter det nuværende register. Gem eventuelt en kopi først.' : ' Oplysningerne gemmes lokalt på denne enhed.'} Dine arbejdsregistreringer beholdes.`;
    ctx.showConfirm('Importér privat register?', description, () => {
      ui.query = ''; ui.verifyOnly = false; ui.tab = 'vehicles';
      persist(ctx, directory, 'Det private register er importeret.');
    });
  } catch { ctx.toast('Filen kunne ikke læses. Vælg en gyldig JSON-kopi af det private register.'); }
}

function registerVehicleWork(ctx, id) {
  const directory = currentDirectory(ctx), vehicle = findVehicle(directory, id);
  if (!vehicle) return;
  ctx.closeModal();
  ctx.openEntry(null, { type: 'work', vehicle: vehicle.number });
}

function act(ctx, button) {
  const { directoryAction: action, id, tab } = button.dataset;
  if (action === 'tab' && ['vehicles', 'people', 'issues'].includes(tab)) { ui.tab = tab; ctx.render(); return; }
  if (action === 'import') { document.querySelector('#directory-file')?.click(); return; }
  if (action === 'export') return exportDirectory(ctx);
  if (action === 'vehicle-details') return showVehicle(ctx, id);
  if (action === 'person-details') return showPerson(ctx, id);
  if (action === 'add-vehicle') return editVehicle(ctx);
  if (action === 'edit-vehicle') return editVehicle(ctx, id);
  if (action === 'add-person') return editPerson(ctx);
  if (action === 'edit-person') return editPerson(ctx, id);
  if (action === 'vehicle-work') return registerVehicleWork(ctx, id);
}

function bindActions(ctx, scope) {
  scope.querySelectorAll('[data-directory-action]').forEach(button => button.addEventListener('click', () => act(ctx, button)));
}

export function bindDirectory(ctx) {
  bindActions(ctx, document);
  const refreshResults = () => {
    const directory = currentDirectory(ctx), content = document.querySelector('#directory-content');
    if (!directory || !content) return;
    content.innerHTML = renderContent(ctx, directory);
    bindActions(ctx, content);
  };
  document.querySelector('[data-directory-search]')?.addEventListener('input', event => { ui.query = event.target.value; refreshResults(); });
  document.querySelector('[data-directory-verify]')?.addEventListener('change', event => { ui.verifyOnly = event.target.checked; refreshResults(); });
  document.querySelector('#directory-file')?.addEventListener('change', event => { const file = event.target.files?.[0]; event.target.value = ''; importDirectory(ctx, file); });
}
