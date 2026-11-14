import { uid } from './domain.js';
import { mergeWasteCentres, validateWasteCentres } from './waste-centres.js';

let importSequence = 0;
let activeState;
let query = '';
const records = ctx => ctx.state.wasteCentres || [];
const escape = (ctx, value) => ctx.escape(String(value ?? ''));
const normalize = value => String(value ?? '').normalize('NFC').trim().toLocaleLowerCase('da-DK');
const text = (data, key) => String(data.get(key) ?? '').trim();

function field(ctx, label, name, value, { max, required = false, full = false } = {}) {
  return `<label class="field${full ? ' full' : ''}"><span>${label}</span><input name="${name}" value="${escape(ctx, value)}" maxlength="${max}"${required ? ' required' : ''}></label>`;
}

function instructionsField(ctx, label, value) {
  return `<label class="field full"><span>${label}</span><textarea name="instructions" rows="4" maxlength="4000">${escape(ctx, value)}</textarea></label>`;
}

function action(ctx, label, name, { centre, item, style = 'subtle', aria } = {}) {
  return `<button type="button" class="button ${style}" data-waste-action="${name}"${centre ? ` data-centre-id="${escape(ctx, centre.id)}"` : ''}${item ? ` data-item-id="${escape(ctx, item.id)}"` : ''}${aria ? ` aria-label="${escape(ctx, aria)}"` : ''}>${label}</button>`;
}

function customerList(ctx, centre) {
  const numbers = centre.customerNumbers || [];
  return `<section class="waste-centre-section"><div class="waste-centre-section-heading"><h3>Kundenumre</h3>${action(ctx, 'Tilføj kundenummer', 'add-customer', { centre, style: 'secondary' })}</div>
    ${centre.customerNumber ? `<p class="waste-customer-primary"><span class="muted">Standard</span> <strong>${escape(ctx, centre.customerNumber)}</strong></p>` : ''}
    ${numbers.length ? `<ul class="settings-list waste-customer-list">${numbers.map(item => `<li><span><span class="muted">${escape(ctx, item.company || 'Konto')}</span> <strong>${escape(ctx, item.number)}</strong></span><div class="row-actions">${action(ctx, 'Ret', 'edit-customer', { centre, item, aria: `Ret kundenummer ${item.number}` })}${action(ctx, 'Slet', 'delete-customer', { centre, item, style: 'subtle danger', aria: `Slet kundenummer ${item.number}` })}</div></li>`).join('')}</ul>` : centre.customerNumber ? '' : '<p class="muted">Ingen kundenumre tilføjet.</p>'}
  </section>`;
}

function codeList(ctx, centre) {
  const codes = centre.codes || [];
  return `<section class="waste-centre-section"><div class="waste-centre-section-heading"><h3>Varekoder</h3>${action(ctx, 'Tilføj varekode', 'add-code', { centre, style: 'secondary' })}</div>
    ${codes.length ? `<div class="table-wrap"><table class="data-table waste-code-table"><thead><tr><th scope="col">Varekode</th><th scope="col">Affald</th><th scope="col"><span class="sr-only">Handlinger</span></th></tr></thead><tbody>${codes.map(item => `<tr><td><strong>${escape(ctx, item.code)}</strong></td><td>${escape(ctx, item.label)}${item.instructions ? `<small class="muted waste-code-instructions">${escape(ctx, item.instructions)}</small>` : ''}</td><td><div class="row-actions">${action(ctx, 'Ret', 'edit-code', { centre, item, aria: `Ret varekode ${item.code}, ${item.label}` })}${action(ctx, 'Slet', 'delete-code', { centre, item, style: 'subtle danger', aria: `Slet varekode ${item.code}, ${item.label}` })}</div></td></tr>`).join('')}</tbody></table></div>` : '<p class="muted">Ingen varekoder tilføjet.</p>'}
  </section>`;
}

function centreCard(ctx, centre) {
  return `<article class="card waste-centre-card"><header class="waste-centre-header"><div><h2>${escape(ctx, centre.name)}</h2>${centre.address ? `<p class="muted waste-centre-address">${escape(ctx, centre.address)}</p>` : ''}</div><div class="row-actions">${action(ctx, 'Ret center', 'edit-centre', { centre, style: 'secondary', aria: `Ret ${centre.name}` })}${action(ctx, 'Slet', 'delete-centre', { centre, style: 'subtle danger', aria: `Slet ${centre.name}` })}</div></header>
    ${centre.instructions ? `<section class="waste-centre-section waste-centre-instructions"><h3>Aflæsningsinstruktioner</h3><p>${escape(ctx, centre.instructions)}</p></section>` : ''}
    ${customerList(ctx, centre)}${codeList(ctx, centre)}</article>`;
}

function searchResults(ctx) {
  const tokens = normalize(query).split(/\s+/).filter(Boolean);
  const centres = records(ctx).filter(centre => {
    const haystack = normalize([centre.name, centre.address, centre.customerNumber, centre.instructions,
      ...(centre.customerNumbers || []).flatMap(item => [item.company, item.number]),
      ...(centre.codes || []).flatMap(item => [item.code, item.label, item.instructions])].join(' '));
    return tokens.every(token => haystack.includes(token));
  });
  const count = centres.length === 1 ? '1 center' : `${centres.length} centre`;
  const body = centres.map(centre => centreCard(ctx, centre)).join('') || `<section class="card empty-state"><h2>${tokens.length ? 'Ingen centre matcher din søgning' : 'Ingen affaldscentre endnu'}</h2><p>${tokens.length ? 'Prøv et navn, et kundenummer eller en varekode.' : 'Tilføj et center, eller importér en liste.'}</p></section>`;
  return `<span id="waste-centre-count" class="muted waste-centre-count" aria-live="polite">${count}</span><div class="waste-centre-list">${body}</div>`;
}

export function renderWasteCentres(ctx) {
  if (activeState !== ctx.state) { activeState = ctx.state; query = ''; }
  return `<div class="page-heading"><div class="page-intro"><img class="page-title-icon" src="assets/brand/vehicle.png" alt="" width="64" height="64" decoding="async"><div class="page-heading-copy"><h1>Affaldscentre</h1><p class="muted">Find kundenumre, varekoder og aflæsningsinstruktioner.</p></div></div><div class="heading-actions">
    ${action(ctx, 'Importér liste (JSON)', 'import', { style: 'secondary' })}${action(ctx, 'Tilføj center', 'add-centre', { style: 'primary' })}</div></div>
    <input id="waste-centres-file" type="file" accept="application/json,.json" hidden>
    <label class="field waste-centre-search"><span>Søg blandt affaldscentre</span><input type="search" id="waste-centres-search" value="${escape(ctx, query)}" placeholder="Navn, kundenummer, varekode eller affald" maxlength="200"></label>
    <div id="waste-centres-results">${searchResults(ctx)}</div>`;
}

function saveCentres(ctx, centres, message) {
  const checked = validateWasteCentres(centres);
  if (!checked.ok) { ctx.toast(checked.errors[0] || 'Kontrollér oplysningerne i registret.'); return false; }
  const state = ctx.state;
  const previous = state.wasteCentres;
  state.wasteCentres = checked.centres;
  let saved = false;
  try { saved = ctx.save() !== false; } catch { /* The validated change can be retried in the dialog. */ }
  if (!saved) {
    if (previous === undefined) delete state.wasteCentres; else state.wasteCentres = previous;
    ctx.render();
    ctx.toast('Ændringen kunne ikke gemmes. Prøv igen.');
    return false;
  }
  ctx.toast(ctx.isDemo ? 'Ændringen vises kun i demovisningen.' : message);
  return true;
}

function editCentre(ctx, centre) {
  const initial = centre || { id: uid(), name: '', address: '', customerNumber: '', instructions: '', customerNumbers: [], codes: [] };
  const html = `<div class="form-grid">${field(ctx, 'Centernavn', 'name', initial.name, { max: 200, required: true })}${field(ctx, 'Standardkundenummer', 'customerNumber', initial.customerNumber, { max: 80 })}${field(ctx, 'Adresse', 'address', initial.address, { max: 400, full: true })}${instructionsField(ctx, 'Aflæsningsinstruktioner', initial.instructions)}</div>`;
  ctx.modal(centre ? 'Ret affaldscenter' : 'Tilføj affaldscenter', html, data => {
    const updated = { ...initial, name: text(data, 'name'), address: text(data, 'address'), customerNumber: text(data, 'customerNumber'), instructions: text(data, 'instructions') };
    const next = centre ? records(ctx).map(record => record.id === centre.id ? updated : record) : [...records(ctx), updated];
    return saveCentres(ctx, next, centre ? 'Affaldscentret er opdateret.' : 'Affaldscentret er tilføjet.');
  });
}

function editItem(ctx, centre, key, item) {
  const isCode = key === 'codes';
  const label = isCode ? 'varekode' : 'kundenummer';
  const id = item?.id || uid();
  const fields = isCode
    ? field(ctx, 'Varekode', 'code', item?.code, { max: 80, required: true }) + field(ctx, 'Affald', 'label', item?.label, { max: 200, required: true }) + instructionsField(ctx, 'Aflæsningsinstruktioner for denne varekode', item?.instructions)
    : field(ctx, 'Firma eller konto', 'company', item?.company, { max: 200 }) + field(ctx, 'Kundenummer', 'number', item?.number, { max: 80, required: true });
  ctx.modal(`${item ? 'Ret' : 'Tilføj'} ${label}`, `<div class="form-grid"><p class="muted full">${escape(ctx, centre.name)}</p>${fields}</div>`, data => {
    const current = records(ctx).find(record => record.id === centre.id);
    if (!current) return false;
    const nextItem = isCode ? { id, code: text(data, 'code'), label: text(data, 'label'), instructions: text(data, 'instructions') }
      : { id, company: text(data, 'company'), number: text(data, 'number') };
    const items = current[key] || [];
    const updated = item ? items.map(value => value.id === id ? nextItem : value) : [...items, nextItem];
    const next = records(ctx).map(record => record.id === centre.id ? { ...current, [key]: updated } : record);
    return saveCentres(ctx, next, 'Oplysningen er gemt.');
  });
}

function removeItem(ctx, centre, key, item) {
  const label = key === 'codes' ? 'varekoden' : 'kundenummeret';
  ctx.showConfirm(`Slet ${label}?`, `“${item.code || item.number}” fjernes fra ${centre.name}.`, () => {
    const next = records(ctx).map(record => record.id === centre.id ? { ...record, [key]: record[key].filter(value => value.id !== item.id) } : record);
    return saveCentres(ctx, next, 'Oplysningen er slettet.');
  });
}

const hasChanges = review => review.addedCentres + review.addedCodes + review.addedCustomerNumbers + review.filledFields > 0;

function showImportReview(ctx, state, incoming) {
  const before = JSON.stringify(records(ctx));
  const preview = mergeWasteCentres(records(ctx), incoming);
  const summary = `<dl class="waste-import-summary"><div><dt>Nye centre</dt><dd>${preview.addedCentres}</dd></div><div><dt>Nye kundenumre</dt><dd>${preview.addedCustomerNumbers}</dd></div><div><dt>Nye varekoder</dt><dd>${preview.addedCodes}</dd></div><div><dt>Tomme felter udfyldes</dt><dd>${preview.filledFields}</dd></div><div><dt>Allerede i registret</dt><dd>${preview.skipped}</dd></div></dl>`;
  const conflicts = preview.conflicts.length ? `<h3>Eksisterende oplysninger beholdes</h3><ul class="waste-import-conflicts">${preview.conflicts.map(conflict => `<li>${escape(ctx, conflict)}</li>`).join('')}</ul>` : '';
  const changed = hasChanges(preview);
  const added = changed ? `<ul class="waste-import-centres">${incoming.centres.map(centre => `<li>${escape(ctx, centre.name)}</li>`).join('')}</ul>` : '<p class="muted">Filen tilføjer ingen nye oplysninger.</p>';
  ctx.modal('Gennemgå affaldscentre', summary + added + conflicts, () => {
    if (!changed) return true;
    if (ctx.isDemo || ctx.needsRecovery || ctx.state !== state || JSON.stringify(records(ctx)) !== before) {
      ctx.toast('Registret er ændret. Vælg filen igen for at sammenligne med de aktuelle data.');
      return false;
    }
    return saveCentres(ctx, preview.centres, 'Listen er føjet til registret over affaldscentre.');
  }, { submitLabel: changed ? 'Flet listen' : 'Luk' });
}

async function importFile(ctx, file, input) {
  if (!file || ctx.isDemo || ctx.needsRecovery) return;
  const read = ++importSequence;
  const state = ctx.state;
  if (file.size > 2 * 1024 * 1024) { ctx.toast('Vælg en JSON-liste på højst 2 MB.'); return; }
  const current = () => read === importSequence && ctx.state === state && !ctx.isDemo && document.querySelector('#waste-centres-file') === input;
  try {
    const value = JSON.parse((await file.text()).replace(/^\uFEFF/, ''));
    if (!current()) return;
    if (value?.kind !== 'arbejde-waste-centres') { ctx.toast('Vælg en Arbejde-liste med affaldscentre.'); return; }
    const validation = validateWasteCentres(value);
    if (!validation.ok) { ctx.toast(validation.errors[0] || 'Listen er ugyldig.'); return; }
    showImportReview(ctx, state, { kind: 'arbejde-waste-centres', version: 1, centres: validation.centres });
  } catch (error) {
    if (current()) ctx.toast(error instanceof SyntaxError ? 'Filen indeholder ikke gyldig JSON.' : (error.message || 'Listen kunne ikke læses.'));
  }
}

function handleAction(ctx, button) {
  const { wasteAction: name, centreId, itemId } = button.dataset;
  if (ctx.needsRecovery) return ctx.toast('Gendan dine data, før du ændrer registret.');
  if (name === 'import') {
    if (ctx.isDemo) return ctx.toast('Skift til dine egne data, før du importerer listen.');
    return document.querySelector('#waste-centres-file')?.click();
  }
  if (name === 'add-centre') return editCentre(ctx);
  const centre = records(ctx).find(record => record.id === centreId);
  if (!centre) return;
  if (name === 'edit-centre') return editCentre(ctx, centre);
  if (name === 'delete-centre') {
    return ctx.showConfirm('Slet affaldscenter?', `“${centre.name}” og dets kundenumre, varekoder og instruktioner slettes.`, () =>
      saveCentres(ctx, records(ctx).filter(record => record.id !== centre.id), 'Affaldscentret er slettet.'));
  }
  const key = name.endsWith('-code') ? 'codes' : 'customerNumbers';
  if (name.startsWith('add-')) return editItem(ctx, centre, key);
  const item = centre[key]?.find(record => record.id === itemId);
  if (!item) return;
  if (name.startsWith('edit-')) return editItem(ctx, centre, key, item);
  if (name.startsWith('delete-')) return removeItem(ctx, centre, key, item);
}

export function bindWasteCentres(ctx) {
  const results = document.querySelector('#waste-centres-results');
  if (!results) return;
  results.addEventListener('click', event => {
    const button = event.target.closest('[data-waste-action]');
    if (button) handleAction(ctx, button);
  });
  document.querySelectorAll('.heading-actions [data-waste-action]').forEach(button => {
    button.addEventListener('click', () => handleAction(ctx, button));
  });
  document.querySelector('#waste-centres-search')?.addEventListener('input', event => {
    query = event.currentTarget.value;
    results.innerHTML = searchResults(ctx);
  });
  document.querySelector('#waste-centres-file')?.addEventListener('change', event => {
    const input = event.currentTarget;
    importFile(ctx, input.files?.[0], input);
    input.value = '';
  });
}
