import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { emptyState, defaultJob, validateState } from './domain.js';

// Public synthetic fixtures only. The reader seam avoids a browser/PDF worker;
// the real parser, import domain, renderers and event handlers are exercised.
let serial = 0;
const escape = value => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const formData = values => { const data = new FormData(); for (const [key, value] of Object.entries(values)) for (const item of Array.isArray(value) ? value : [value]) data.append(key, String(item)); return data; };
const item = (text, x, y) => ({ text, x, y, width: text.length * 5, height: 10 });
function syntheticDocument(alternative = false) {
  return { filename: 'synthetic_week_10_2028.pdf', fingerprint: 'a'.repeat(64), pageCount: 2, warnings: [], pages: [
    { pageNumber: 1, width: 800, height: 600, items: [item('Uge: 10 2028', 500, 10), ...['Vogn nr', 'Mandag', 'Tirsdag', 'Onsdag', 'Torsdag', 'Fredag', 'Bemærkninger'].map((text, index) => item(text, index * 100, 30)), item('Vogn 999', 0, 60), item('Maria', 100, 60), item('Marria', 200, 60), item('Ingen', 300, 60), item('???', 400, 60), ...(alternative ? [item('Værksted', 0, 80), item('Maria', 100, 80)] : [])] },
    { pageNumber: 2, width: 800, height: 600, items: [item('Hold A', 100, 30), item('Hold B', 400, 30), item('Maria', 100, 60), item('Ole', 100, 80), item('Lise', 100, 100)] }
  ] };
}
function element(dataset = {}, extra = {}) {
  return { dataset, handlers: {}, addEventListener(name, callback) { this.handlers[name] = callback; }, emit(name, event = {}) { return this.handlers[name]?.(event); }, getAttribute(name) { return name.startsWith('data-') ? this.dataset[name.slice(5).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())] ?? null : this[name] ?? null; }, focus() {}, ...extra };
}
function harness(t, module, schedule = false) {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'document');
  const groups = { actions: [], options: [], rows: [], panelActions: [] };
  const nodes = { '#schedule-pdf-files': element(), '#backup-file': element({}, { clicks: 0, click() { this.clicks++; } }) };
  let state = emptyState(), demo = false, durable = true, calendarDate = '2028-03-01';
  const ctx = { get state() { return state; }, get isDemo() { return demo; }, escape, toasts: [], saves: 0, saveOptions: [], html: '', timer: { snapshot: () => null }, modalValue: null, confirmValue: null,
    toast(message) { this.toasts.push(message); }, closeModal() { if (this.modalValue) this.modalValue.closed = true; },
    modal(title, html, submit) { this.modalValue = { title, html, closed: false, submit }; },
    showConfirm(title, description, submit) { this.confirmValue = { title, description, submit }; },
    save(options) { this.saves++; this.saveOptions.push(options); this.render(); return durable; },
    render() { if (schedule) { this.html = module.renderScheduleImport(this); module.bindScheduleImport(this); } },
    get calendarDate() { return calendarDate; }, setCalendarDate(value) { calendarDate = value; this.render(); }, navigate(value) { this.page = value; }, openEntry() {}, openPlannedEntry() {}
  };
  const document = { querySelector(selector) { if (selector === '#schedule-import') return schedule ? element() : null; return nodes[selector] || null; }, querySelectorAll(selector) {
    if (selector === '[data-schedule-action]') return groups.actions;
    if (selector === '[data-schedule-option]') return groups.options;
    if (selector === '[data-schedule-row]') return groups.rows;
    if (selector === '[data-panel-action]') return groups.panelActions;
    if (selector === '[data-value]') return groups.actions.filter(node => node.dataset.value);
    return [];
  }, addEventListener() {} };
  Object.defineProperty(globalThis, 'document', { value: document, configurable: true, writable: true });
  t.after(() => { if (previous) Object.defineProperty(globalThis, 'document', previous); else delete globalThis.document; });
  const bind = () => schedule ? module.bindScheduleImport(ctx) : module.bindPanels(ctx);
  return { ctx, groups, nodes, setDurable(value) { durable = value; }, setDemo(value) { demo = value; ctx.render(); }, replaceState(value) { state = value; ctx.render(); },
    act(action, rest = {}) { const button = element(schedule ? { scheduleAction: action, ...rest } : { panelAction: action, ...rest }); groups[schedule ? 'actions' : 'panelActions'] = [button]; bind(); button.emit('click'); },
    option(name, value) { const input = element({ scheduleOption: name }, { type: typeof value === 'boolean' ? 'checkbox' : 'text', checked: value, value }); groups.options = [input]; bind(); input.emit('change'); },
    row(id, value) { const input = element({ scheduleRow: id }, { type: 'checkbox', checked: value }); groups.rows = [input]; bind(); input.emit('change'); },
    async submit(values) { const current = ctx.modalValue; const result = await current.submit(formData(values)); if (result !== false) current.closed = true; return result; },
    async files(files) { bind(); nodes['#schedule-pdf-files'].emit('change', { target: { files, value: 'selected' } }); await settle(); },
    rowData() { return [...ctx.html.matchAll(/<input type="checkbox" data-schedule-row="([^"]+)"([^>]*)>/g)].map(match => ({ id: match[1], selected: / checked/.test(match[2]), disabled: / disabled/.test(match[2]) })); }
  };
}
async function settle() { for (let index = 0; index < 8; index++) await new Promise(resolve => setImmediate(resolve)); }
async function panels() { return import(new URL(`./panels.js?handler-test=${++serial}`, import.meta.url)); }
async function schedule(reader) {
  const key = `__syntheticReader${++serial}`;
  globalThis[key] = reader;
  let source = await fs.readFile(new URL('./schedule-import-ui.js', import.meta.url), 'utf8');
  source = source.replace("import { extractPdf } from './pdf-reader.js';", `const extractPdf=globalThis[${JSON.stringify(key)}];`);
  source = source.replace(/from '(\.\/[^']+)'/g, (_, relative) => `from '${new URL(relative, import.meta.url).href}'`);
  const module = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
  delete globalThis[key];
  return module;
}
const file = { name: 'synthetic_week_10_2028.pdf', size: 1000, type: 'application/pdf' };
const jobValues = job => Object.fromEntries(Object.entries(job).filter(([key]) => key !== 'id'));

test('job creation keeps its form and stable id when storage fails, then retries without duplicates', async t => {
  const h = harness(t, await panels());
  h.act('new-job');
  const values = { ...jobValues(defaultJob()), name: 'Synthetic job' };
  h.setDurable(false);
  assert.equal(await h.submit(values), false);
  assert.equal(h.ctx.modalValue.closed, false);
  assert.equal(h.ctx.state.jobs.length, 2);
  assert.match(h.ctx.toasts.at(-1), /kun i hukommelsen/);
  h.setDurable(true);
  assert.equal(await h.submit({ ...values, name: 'Synthetic job revised' }), true);
  assert.equal(h.ctx.state.jobs.length, 2);
  assert.equal(h.ctx.state.jobs[1].name, 'Synthetic job revised');
  assert.equal(validateState(h.ctx.state).ok, true);
});

test('editing a single-day untimed PDF plan preserves its date shape and provenance', async t => {
  const h = harness(t, await panels());
  const plan = { id: 'synthetic-plan', date: '2028-03-06', jobId: h.ctx.state.jobs[0].id, scheme: '3', title: 'Synthetic plan', start: '', end: '', vehicle: '999', route: '', notes: '', driver: 'Maria', colleague: '', crew: 'Alene', people: ['Maria'], kind: 'work', source: { type: 'pdf', fileName: file.name, fileHash: 'a'.repeat(64), page: 1, row: 1, importedAt: '2028-03-01T00:00:00Z', week: 10, year: 2028 } };
  h.ctx.state.plans.push(plan);
  h.act('edit-plan', { id: plan.id });
  assert.doesNotMatch(h.ctx.modalValue.html, /name="weekdays"/);
  h.setDurable(false);
  const values = { title: 'Synthetic plan revised', jobId: plan.jobId, scheme: '3', from: '2028-03-07', start: '', end: '', vehicle: '999', route: '' };
  assert.equal(await h.submit(values), false);
  h.setDurable(true);
  assert.equal(await h.submit(values), true);
  assert.equal(h.ctx.state.plans.length, 1);
  const saved = h.ctx.state.plans[0];
  assert.equal(saved.date, '2028-03-07'); assert.equal(saved.start, ''); assert.equal(saved.end, '');
  assert.equal('weekdays' in saved, false); assert.equal('from' in saved, false);
  assert.deepEqual(saved.source, plan.source);
  assert.equal(validateState(h.ctx.state).ok, true);
});

test('quick-list validation and failed-save retries cannot corrupt or delete the next item', async t => {
  const h = harness(t, await panels()); h.ctx.state.vehicles = ['101', '102'];
  h.act('new-list-item', { list: 'vehicles' });
  assert.equal(await h.submit({ value: 'x'.repeat(101) }), false);
  assert.deepEqual(h.ctx.state.vehicles, ['101', '102']);
  h.setDurable(false); assert.equal(await h.submit({ value: '103' }), false);
  h.setDurable(true); assert.equal(await h.submit({ value: '103' }), true);
  assert.deepEqual(h.ctx.state.vehicles, ['101', '102', '103']);
  h.act('delete-list-item', { list: 'vehicles', index: '0' });
  h.setDurable(false); assert.equal(h.ctx.confirmValue.submit(), false);
  assert.deepEqual(h.ctx.state.vehicles, ['102', '103']);
  h.setDurable(true); assert.equal(h.ctx.confirmValue.submit(), true);
  assert.deepEqual(h.ctx.state.vehicles, ['102', '103']);
});

test('saved route retries preserve one template and deletion clears its default reference', async t => {
  const module = await panels();
  const h = harness(t, module);
  h.ctx.state.routes = ['Historisk tur'];
  h.act('new-route-template');
  const values = { name: 'Øst <1>', weekday: 2, weekParity: 'even', vehicle: '999', waste: ['Mad', 'Rest'], empties: 315 };
  assert.equal(await h.submit({ ...values, empties: -1 }), false);
  assert.deepEqual(h.ctx.state.routeTemplates, []);
  h.setDurable(false);
  assert.equal(await h.submit(values), false);
  const { id } = h.ctx.state.routeTemplates[0];
  h.setDurable(true);
  assert.equal(await h.submit(values), true);
  assert.deepEqual(h.ctx.state.routeTemplates, [{ ...values, id }]);
  h.ctx.state.settings.preferences.defaultRouteId = id;
  const routes = module.renderRoutes(h.ctx);
  assert.match(routes, /Øst &lt;1&gt;/);
  assert.match(routes, /Tirsdag · Lige uger/);
  assert.match(routes, /Historisk tur/);
  const settings = module.renderSettings(h.ctx);
  assert.match(settings, /data-nav="ture">Åbn ture/);
  assert.doesNotMatch(settings, /data-panel-action="new-route-template"/);
  assert.match(settings, /<option[^>]+selected>Øst/);
  h.act('edit-route-template', { id });
  assert.equal(await h.submit({ ...values, empties: 300 }), true);
  assert.equal(h.ctx.state.routeTemplates[0].empties, 300);
  h.act('delete-route-template', { id });
  assert.equal(h.ctx.confirmValue.submit(), true);
  assert.deepEqual(h.ctx.state.routeTemplates, []);
  assert.equal(h.ctx.state.settings.preferences.defaultRouteId, '');
  assert.deepEqual(h.ctx.state.routes, ['Historisk tur']);
  assert.equal(validateState(h.ctx.state).ok, true);
});

test('backup restore and job deletion protect an active timer, and restore is blocked in demo', async t => {
  const h = harness(t, await panels());
  h.ctx.timer.snapshot = () => ({ jobId: h.ctx.state.jobs[0].id });
  h.act('import'); h.act('delete-job', { id: h.ctx.state.jobs[0].id });
  assert.equal(h.nodes['#backup-file'].clicks, 0); assert.equal(h.ctx.confirmValue, null);
  h.ctx.timer.snapshot = () => null; h.setDemo(true); h.act('import');
  assert.equal(h.nodes['#backup-file'].clicks, 0);
  h.setDemo(false); h.act('import'); assert.equal(h.nodes['#backup-file'].clicks, 1);
});

test('calendar navigation respects an external date after navigating locally', async t => {
  const module = await panels(), h = harness(t, module);
  module.renderCalendar(h.ctx); h.act('prev-month');
  h.ctx.setCalendarDate('2099-01-01');
  assert.match(module.renderCalendar(h.ctx), /januar 2099/);
});

test('only an explicitly confirmed valid backup uses the recovery-save exception', async t => {
  const h = harness(t, await panels());
  h.ctx.needsRecovery = true;
  h.act('import');
  const incoming = emptyState(); incoming.settings.name = 'Synthetic restored profile';
  h.nodes['#backup-file'].emit('change', { target: { value: 'selected', files: [{ size: 1000, text: async () => JSON.stringify(incoming) }] } });
  await settle();
  assert.match(h.ctx.confirmValue.description, /oprindelige data/);
  assert.equal(h.ctx.saves, 0);
  assert.equal(h.ctx.confirmValue.submit(), true);
  assert.deepEqual(h.ctx.saveOptions.at(-1), { restoreBackup: true });
  assert.equal(h.ctx.state.settings.name, 'Synthetic restored profile');
  h.act('new-job');
  await h.submit({ ...jobValues(defaultJob()), name: 'Synthetic normal save' });
  assert.equal(h.ctx.saveOptions.at(-1), undefined);
});

test('PDF review requires explicit fuzzy selection and acknowledgement, then recovers a failed save without reapplying', async t => {
  const module = await schedule(async () => syntheticDocument()), h = harness(t, module, true);
  h.ctx.render(); await h.files([file]); h.act('target', { value: 'Maria' });
  const rows = h.rowData(); assert.equal(rows.length, 2);
  assert.equal(rows.filter(row => row.selected).length, 1);
  assert.equal(h.ctx.state.plans.length, 0); assert.equal(h.ctx.state.settings.defaultDriver, undefined);
  h.row(rows.find(row => !row.selected).id, true); h.act('commit');
  assert.equal(h.ctx.saves, 0);
  h.option('acknowledge', true); h.setDurable(false); h.act('commit');
  assert.equal(h.ctx.state.plans.length, 2); assert.equal(h.ctx.state.entries.length, 0);
  assert.match(h.ctx.html, /schedule-save-recovery/); assert.doesNotMatch(h.ctx.toasts.at(-1), /er gemt/);
  const ids = h.ctx.state.plans.map(plan => plan.id);
  h.act('reset'); assert.match(h.ctx.html, /schedule-save-recovery/);
  h.setDemo(true); h.act('retry-save'); assert.equal(h.ctx.saves, 1);
  h.setDemo(false); h.setDurable(true); h.act('retry-save');
  assert.deepEqual(h.ctx.state.plans.map(plan => plan.id), ids);
  assert.ok(h.ctx.state.plans.every(plan => plan.start === '' && plan.end === ''));
  assert.equal(h.ctx.state.settings.defaultDriver, 'Maria');
  assert.match(h.ctx.toasts.at(-1), /er gemt/);
  h.act('calendar'); assert.equal(h.ctx.page, 'kalender'); assert.equal(h.ctx.calendarDate, '2028-03-06');
});

test('PDF picker cancellation preserves review; abort discards only the pending read', async t => {
  let reading = false;
  const module = await schedule((_file, { signal }) => reading ? new Promise((_, reject) => signal.addEventListener('abort', () => reject(Object.assign(new Error('Synthetic abort'), { name: 'AbortError' })))) : Promise.resolve(syntheticDocument()));
  const h = harness(t, module, true); h.ctx.render(); await h.files([file]); h.act('target', { value: 'Maria' });
  const ids = h.rowData().map(row => row.id); await h.files([]);
  assert.deepEqual(h.rowData().map(row => row.id), ids);
  h.act('reset'); reading = true; await h.files([file]); assert.match(h.ctx.html, /schedule-progress-region/);
  h.act('cancel'); await settle(); assert.match(h.ctx.html, /Læsningen er afbrudt/);
  assert.equal(h.ctx.state.plans.length, 0); assert.equal(h.ctx.state.settings.defaultDriver, undefined);
});

test('unknown vehicle cells stay unchecked/informational and a batch alternative can be explicitly chosen alone', async t => {
  const module = await schedule(async () => syntheticDocument(true)), h = harness(t, module, true);
  h.ctx.render(); await h.files([file]); h.act('mode', { mode: 'vehicle' }); h.act('target', { value: '999' });
  assert.equal(h.rowData().filter(row => row.selected).length, 1);
  assert.match(h.ctx.html, /Ingen bemanding/); assert.match(h.ctx.html, /Uafklaret/);
  h.act('mode', { mode: 'person' }); h.act('target', { value: 'Maria' });
  const rowBlocks = [...h.ctx.html.matchAll(/<tr class="schedule-row schedule-row-([^" ]+)[^"]*">([\s\S]*?)<\/tr>/g)];
  const alternative = rowBlocks.find(match => match[1] === 'conflict' && match[2].includes('Værksted'));
  assert.ok(alternative); const id = alternative[2].match(/data-schedule-row="([^"]+)"/)[1];
  assert.doesNotMatch(alternative[2].match(/data-schedule-row="[^"]+"([^>]*)>/)[1], /checked|disabled/);
  h.act('select-clear'); h.row(id, true); h.option('acknowledge', true); h.act('commit');
  assert.equal(h.ctx.state.plans.length, 1); assert.equal(h.ctx.state.plans[0].vehicle, 'Værksted');
});

test('changing the active data object clears stale PDF selections and acknowledgement', async t => {
  const module = await schedule(async () => syntheticDocument()), h = harness(t, module, true);
  h.ctx.render(); await h.files([file]); h.act('target', { value: 'Maria' });
  h.row(h.rowData().find(row => !row.selected).id, true); h.option('acknowledge', true);
  h.replaceState(emptyState()); h.act('commit');
  assert.equal(h.ctx.saves, 0); assert.equal(h.ctx.state.plans.length, 0);
  assert.ok(h.rowData().every(row => !row.selected));
});
