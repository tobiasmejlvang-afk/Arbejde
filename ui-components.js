import {UI_COMPONENT_TARGETS, UI_COMPONENT_TYPES, UI_COMPONENT_SIZES, UI_COMPONENT_VARIANTS, UI_COMPONENT_COLORS, UI_COMPONENT_ICONS, UI_COMPONENT_LAYOUTS, validateUIComponents, sanitizeSVG, parseUIComponentsImport, serializeUIComponents} from './ui-components-domain.js';
import {renderComponentIcon} from './ui-component-icons.js';

const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[char]));
const options = (values, selected, escape) => Object.entries(values).map(([value, label]) => `<option value="${value}"${value === selected ? ' selected' : ''}>${escape(label)}</option>`).join('');
const targetOptions = (selected, escape) => UI_COMPONENT_TARGETS.map(target => `<option value="${target.id}"${target.id === selected ? ' selected' : ''}>${escape(target.label)}</option>`).join('');
const targetLabel = target => UI_COMPONENT_TARGETS.find(item => item.id === target)?.label || '';
const PRESETS = Object.freeze({
  driver: {label: 'Chaufførkort', target: 'driver-card', title: 'Chauffør', items: ['Navn: —', 'Telefon: —', 'E-mail: —']},
  vehicle: {label: 'Vognkort', target: 'vehicle-card', title: 'Vogn', items: ['Vognnummer: —', 'Registreringsnummer: —', 'Model: —']},
  route: {label: 'Turkort', target: 'route-card', title: 'Tur', items: ['Turnummer: —', 'Område: —', 'Ugedage: —']},
  waste: {label: 'Affaldsbeholder', target: 'vehicles-routes', title: 'Affaldsbeholder', items: ['Affaldstype: —', 'Beholdertype: —', 'Tømninger: —']},
  calendar: {label: 'Kalender', target: 'driving-crew', title: 'Kalender', items: ['Dato: —', 'Arbejdsplan: —', 'Bemanding: —']}
});

function renderComponent(component, escape) {
  const title = escape(component.title), value = escape(component.value);
  let content;
  if (component.type === 'field') content = `<dl><dt>${title}</dt><dd>${value || '—'}</dd></dl>`;
  else content = `${component.type === 'svg' ? `<div class="ui-component-vector" aria-hidden="true">${component.svg}</div>` : ''}<h3>${title}</h3>${component.value ? `<p>${value}</p>` : ''}${component.items.length ? `<ul>${component.items.map(item => `<li>${escape(item)}</li>`).join('')}</ul>` : ''}`;
  const icon = component.icon !== 'none' ? renderComponentIcon(component.icon) : '';
  return `<article class="ui-component ui-component-${component.type} ui-component-size-${component.size} ui-component-variant-${component.variant} ui-component-color-${component.color} ui-component-layout-${component.layout || 'wide'} ${icon ? 'ui-component-has-icon' : 'ui-component-no-icon'}">${icon ? `<div class="ui-component-emblem" aria-hidden="true">${icon}</div>` : ''}<div class="ui-component-body">${content}</div></article>`;
}

export function renderUIComponentTarget(components, target, escape = escapeHTML, entityId = '') {
  const checked = validateUIComponents(components || []);
  if (!checked.ok) return '';
  const matches = checked.components.filter(component => component.target === target && (!component.entityId || component.entityId === entityId));
  return matches.length ? `<div class="ui-component-grid" aria-label="${escape(targetLabel(target))}: egne komponenter">${matches.map(component => renderComponent(component, escape)).join('')}</div>` : '';
}

function downloadFile(text) {
  const url = URL.createObjectURL(new Blob([text], {type: 'application/json'}));
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'arbejde-ui-komponenter.json'; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function createUIComponents({getState, save, escape = escapeHTML, uid = () => globalThis.crypto.randomUUID(), rerender = () => {}, notify = () => {}, download = downloadFile}) {
  let editingId = '', draftSVG = '', deleteId = '', preview = null, message = '', sequence = 0, formDraft = null;
  let observedState = getState();
  const boundRoots = new WeakMap();
  function current() {
    const state = getState();
    if (state !== observedState) {
      observedState = state; editingId = ''; draftSVG = ''; deleteId = ''; preview = null; message = ''; formDraft = null; sequence++;
    }
    return state.uiComponents || [];
  }
  function entityOptions(target, selected = '') {
    const state = getState();
    const items = target === 'driver-card' ? (state.directory?.people || []).map(item => [item.id, item.name]) : target === 'vehicle-card' ? (state.directory?.vehicles || []).map(item => [item.id, 'Vogn ' + item.number]) : target === 'route-card' ? (state.routeTemplates || []).map(item => [item.id, item.name]) : [];
    if (selected && !items.some(([id]) => id === selected)) items.push([selected, 'Tidligere valgt kort (ikke i dette register)']);
    return '<option value="">Alle kort af typen</option>' + items.map(([id, label]) => '<option value="' + escape(id) + '"' + (id === selected ? ' selected' : '') + '>' + escape(label) + '</option>').join('');
  }
  const report = text => { message = text; notify(text); };
  function persist(components, success) {
    const checked = validateUIComponents(components);
    if (!checked.ok) { report(checked.errors[0]); rerender(); return false; }
    const result = save(checked.components);
    if (result === false || result?.ok === false) { report(result?.error || 'Komponenterne kunne ikke gemmes. Prøv igen.'); rerender(); return false; }
    observedState = getState();
    report(success); editingId = ''; draftSVG = ''; deleteId = ''; preview = null; formDraft = null; sequence++; rerender(); return true;
  }
  function renderManager() {
    const components = current(), editing = components.find(item => item.id === editingId);
    const component = formDraft || editing || {target: 'driver-card', type: 'box', title: '', value: '', items: [], size: 'medium', variant: 'outline', color: 'orange', svg: '', icon: 'none', layout: 'wide'};
    const cards = components.map(item => `<div class="ui-component-manager-item">${renderComponent(item, escape)}<p class="muted">${escape(targetLabel(item.target))}</p><div class="backup-actions"><button class="button secondary" type="button" data-ui-component-action="edit" data-ui-component-id="${escape(item.id)}">Redigér</button><button class="button subtle" type="button" data-ui-component-action="delete" data-ui-component-id="${escape(item.id)}">Slet</button></div>${deleteId === item.id ? `<div class="ui-component-confirm" role="alert"><p>Slet denne komponent?</p><button class="button danger" type="button" data-ui-component-action="confirm-delete" data-ui-component-id="${escape(item.id)}">Slet komponent</button><button class="button secondary" type="button" data-ui-component-action="cancel-delete">Behold</button></div>` : ''}</div>`).join('');
    return `<section class="card settings-section ui-component-manager" data-ui-components-manager><span class="surface-label">EGNE KOMPONENTER</span><h2>Lister, felter, bokse og vektorgrafik</h2><p class="settings-copy muted">Tilføj redigerbart indhold til kort og sider. Vælg størrelse, farve og udseende. Vælg om indholdet vises på alle kort af typen eller ét bestemt chauffør-, vogn- eller turkort. Dine komponenter følger med i backup og kontosynkronisering.</p><p class="settings-copy" role="status" data-ui-component-message>${escape(message)}</p><div class="backup-actions"><label class="button secondary ui-component-file-label">Importér komponenter (JSON)<input type="file" accept=".json,application/json" data-ui-component-file="json"></label><button class="button secondary" type="button" data-ui-component-action="export"${components.length ? '' : ' disabled'}>Eksportér komponenter</button></div>${preview ? `<div class="ui-component-import-preview"><h3>Gennemgå import</h3><p>${preview.imported} komponenter bliver tilføjet. Eksisterende komponenter bevares.</p><ul>${preview.components.slice(-preview.imported).map(item => `<li>${escape(item.title)} · ${escape(targetLabel(item.target))}</li>`).join('')}</ul><button class="button primary" type="button" data-ui-component-action="confirm-import">Tilføj komponenter</button><button class="button secondary" type="button" data-ui-component-action="cancel-import">Annullér</button></div>` : ''}<div class="ui-component-presets"><span class="field-label">Start med en kortskabelon</span><div class="backup-actions">${Object.entries(PRESETS).map(([key,preset]) => `<button class="button secondary" type="button" data-ui-component-action="preset" data-ui-component-id="${key}">${renderComponentIcon(key)}${escape(preset.label)}</button>`).join('')}</div></div><div class="ui-component-editor"><h3>${editing ? 'Redigér komponent' : 'Opret komponent'}</h3><div class="ui-component-draft-preview" data-ui-component-preview aria-label="Forhåndsvisning">${renderComponent(component, escape)}</div><form class="form-grid" data-ui-component-form><input type="hidden" name="id" value="${escape(editing?.id || '')}"><label class="field"><span>Placering</span><select name="target">${targetOptions(component.target, escape)}</select></label><label class="field" data-ui-component-entity${['driver-card', 'vehicle-card', 'route-card'].includes(component.target) ? '' : ' hidden'}><span>Vis på</span><select name="entityId">${entityOptions(component.target, component.entityId || '')}</select></label><label class="field"><span>Type</span><select name="type">${options(UI_COMPONENT_TYPES, component.type, escape)}</select></label><label class="field full"><span>Titel eller feltnavn</span><input name="title" value="${escape(component.title)}" required maxlength="160"></label><label class="field full"><span>Værdi eller beskrivelse</span><textarea name="value" rows="3" maxlength="4000">${escape(component.value)}</textarea></label><label class="field full"><span>Listeindhold (én oplysning pr. linje)</span><textarea name="items" rows="4">${escape(component.items.join('\n'))}</textarea></label><label class="field"><span>Størrelse</span><select name="size">${options(UI_COMPONENT_SIZES, component.size, escape)}</select></label><label class="field"><span>Udseende</span><select name="variant">${options(UI_COMPONENT_VARIANTS, component.variant, escape)}</select></label><label class="field"><span>Farve</span><select name="color">${options(UI_COMPONENT_COLORS, component.color, escape)}</select></label><label class="field"><span>Ikon</span><select name="icon">${options(UI_COMPONENT_ICONS, component.icon || 'none', escape)}</select></label><label class="field"><span>Kortformat</span><select name="layout">${options(UI_COMPONENT_LAYOUTS, component.layout || 'wide', escape)}</select></label><label class="field full"><span>Importér vektorgrafik (SVG, højst 64 KiB)</span><input type="file" accept=".svg,image/svg+xml" data-ui-component-file="svg"><span class="muted" data-ui-component-svg-status>${draftSVG || component.svg ? 'Vektorgrafik klar. Vælg typen Vektorgrafik for at vise den.' : 'SVG kan indeholde former og kurver. Tilføj tekst i felterne ovenfor.'}</span></label><div class="backup-actions full"><button class="button primary" type="submit">${editing ? 'Gem ændringer' : 'Opret komponent'}</button>${editing ? '<button class="button secondary" type="button" data-ui-component-action="cancel-edit">Annullér</button>' : ''}</div></form></div>${components.length ? `<div class="ui-component-manager-grid">${cards}</div>` : '<p class="muted">Du har endnu ingen egne komponenter.</p>'}</section>`;
  }
  function click(event) {
    const button = event.target.closest?.('[data-ui-component-action]');
    if (!button) return false;
    current();
    const action = button.dataset.uiComponentAction, id = button.dataset.uiComponentId;
    if (action === 'preset' && Object.hasOwn(PRESETS, id)) { sequence++; editingId = ''; draftSVG = ''; deleteId = ''; formDraft = {type: 'box', title: PRESETS[id].title, target: PRESETS[id].target, items: [...PRESETS[id].items], value: '', size: 'medium', variant: 'metallic', color: 'orange', svg: '', icon: id, layout: 'wide'}; report('Tilpas kortets oplysninger, og vælg Opret komponent for at gemme.'); rerender(); }
    else if (action === 'edit') { sequence++; formDraft = null; editingId = id; draftSVG = current().find(item => item.id === id)?.svg || ''; message = ''; rerender(); }
    else if (action === 'cancel-edit') { sequence++; formDraft = null; editingId = ''; draftSVG = ''; rerender(); }
    else if (action === 'delete') { deleteId = id; rerender(); }
    else if (action === 'cancel-delete') { deleteId = ''; rerender(); }
    else if (action === 'confirm-delete') persist(current().filter(item => item.id !== id), 'Komponenten er slettet.');
    else if (action === 'export') { download(serializeUIComponents(current())); report('Komponentfilen er downloadet.'); rerender(); }
    else if (action === 'cancel-import') { sequence++; preview = null; rerender(); }
    else if (action === 'confirm-import' && preview) {
      if (preview.base !== JSON.stringify(current())) { preview = null; report('Komponenterne er ændret. Importér filen igen for at gennemgå den aktuelle import.'); rerender(); }
      else persist(preview.components, 'Komponenterne er importeret.');
    }
    return true;
  }
  function submit(event) {
    const form = event.target.closest?.('[data-ui-component-form]');
    if (!form) return false;
    event.preventDefault();
    current();
    const fields = new FormData(form), id = String(fields.get('id') || '');
    if (id && !current().some(item => item.id === id)) { report('Komponenten findes ikke længere. Opret en ny komponent.'); rerender(); return true; }
    const component = {id: id || uid(), target: String(fields.get('target') || ''), type: String(fields.get('type') || ''), title: String(fields.get('title') || '').trim(), value: String(fields.get('value') || '').trim(), items: String(fields.get('items') || '').split(/\r?\n/).map(line => line.trim()).filter(Boolean), size: String(fields.get('size') || ''), variant: String(fields.get('variant') || ''), color: String(fields.get('color') || ''), svg: draftSVG || current().find(item => item.id === id)?.svg || ''};
    component.entityId = ['driver-card','vehicle-card','route-card'].includes(component.target) ? String(fields.get('entityId') || '') : '';
    component.icon = String(fields.get('icon') || 'none');
    component.layout = String(fields.get('layout') || 'wide');
    formDraft = component;
    persist(id ? current().map(item => item.id === id ? component : item) : [...current(), component], id ? 'Komponenten er opdateret.' : 'Komponenten er oprettet.');
    return true;
  }
  async function change(event) {
    const input = event.target.closest?.('[data-ui-component-file]');
    if (!input) return false;
    const file = input.files?.[0];
    if (!file) return true;
    current();
    const sourceState = getState(), sourceEditingId = editingId;
    const kind = input.dataset.uiComponentFile, attempt = ++sequence;
    const isCurrent = () => attempt === sequence && getState() === sourceState && editingId === sourceEditingId && input.isConnected !== false;
    if (file.size > (kind === 'svg' ? 65536 : 1048576)) { report(kind === 'svg' ? 'SVG-filen må højst være 64 KiB.' : 'JSON-filen må højst være 1 MiB.'); if (kind === 'svg') { const status = input.closest('label')?.querySelector('[data-ui-component-svg-status]'); if (status) status.textContent = message; } else rerender(); return true; }
    try {
      const text = await file.text();
      if (!isCurrent()) return true;
      if (kind === 'svg') {
        const result = sanitizeSVG(text);
        if (!result.ok) report(result.error);
        else { draftSVG = result.svg; input.closest('[data-ui-component-form]')?.dispatchEvent?.(new Event('input', {bubbles:true})); report('Vektorgrafikken er klar. Vælg typen Vektorgrafik og gem komponenten.'); }
        const status = input.closest('label')?.querySelector('[data-ui-component-svg-status]'); if (status) status.textContent = message;
      } else {
        const result = parseUIComponentsImport(text, current(), uid);
        if (!result.ok) { preview = null; report(result.errors[0]); }
        else if (!result.imported) { preview = null; report('Filen indeholder ingen komponenter.'); }
        else { preview = {...result, base: JSON.stringify(current())}; message = ''; }
        rerender();
      }
    } catch { if (!isCurrent()) return true; report('Filen kunne ikke læses. Prøv igen.'); if (kind === 'json') rerender(); }
    input.value = '';
    return true;
  }
  function input(event) {
    const form = event.target.closest?.('[data-ui-component-form]');
    if (!form) return;
    current();
    if (event.target.name === 'target') {
      const scope = form.querySelector('[data-ui-component-entity]');
      scope.hidden = !['driver-card','vehicle-card','route-card'].includes(event.target.value);
      form.elements.entityId.innerHTML = entityOptions(event.target.value);
    }
    const data = new FormData(form);
    formDraft = {id: String(data.get('id') || 'preview'), target: String(data.get('target')), type: String(data.get('type')), title: String(data.get('title') || 'Dit kort'), value: String(data.get('value') || ''), items: String(data.get('items') || '').split(/\r?\n/).map(line => line.trim()).filter(Boolean), size: String(data.get('size')), variant: String(data.get('variant')), color: String(data.get('color')), icon: String(data.get('icon') || 'none'), layout: String(data.get('layout') || 'wide'), entityId: ['driver-card','vehicle-card','route-card'].includes(String(data.get('target'))) ? String(data.get('entityId') || '') : '', svg: draftSVG || current().find(item => item.id === data.get('id'))?.svg || ''};
    const checked = validateUIComponents([formDraft]);
    const previewNode = form.closest('[data-ui-components-manager]')?.querySelector('[data-ui-component-preview]');
    if (previewNode && checked.ok) previewNode.innerHTML = renderComponent(checked.components[0], escape);
  }
  function bind(root) {
    if (boundRoots.has(root)) return boundRoots.get(root);
    const onClick = event => click(event), onSubmit = event => submit(event), onChange = event => { void change(event); };
    root.addEventListener('click', onClick); root.addEventListener('submit', onSubmit); root.addEventListener('change', onChange); root.addEventListener('input', input);
    const unbind = () => { root.removeEventListener('click', onClick); root.removeEventListener('submit', onSubmit); root.removeEventListener('change', onChange); root.removeEventListener('input', input); boundRoots.delete(root); };
    boundRoots.set(root, unbind);
    return unbind;
  }
  return {renderManager, renderTarget: (target, entityId = '') => renderUIComponentTarget(current(), target, escape, entityId), click, submit, change, bind};
}
