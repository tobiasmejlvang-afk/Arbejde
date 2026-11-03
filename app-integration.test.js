import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {emptyState, demoState, calculateAll} from './domain.js';
import {createDataStore} from './data-store.js';

// Exercise the real application functions without starting its browser shell.
// All form values and storage snapshots in this file are synthetic.
const source = (await readFile(new URL('./app.js', import.meta.url), 'utf8')).replace(/\r\n/g, '\n');
function functionSource(name) {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `Application function ${name} exists`);
  // Compile progressively at line boundaries so template strings and nested
  // callbacks are parsed by JavaScript rather than duplicated in the fixture.
  for (let end = source.indexOf('\n', start); end >= 0; end = source.indexOf('\n', end + 1)) {
    const candidate = source.slice(start, end);
    try { new vm.Script(`(${candidate})`); return candidate; } catch { /* Function continues. */ }
  }
  throw new Error(`Could not extract ${name}`);
}

class FormDataStub {
  constructor(form) { this.form = form; }
  get(name) {
    const field = this.form.fields?.[name];
    return field && !field.disabled ? field.value : null;
  }
  getAll(name) { const value = this.get(name); return value ? [value] : []; }
}
function dialogStub() {
  return {
    open: false, form: null, closed: 0,
    set innerHTML(value) {
      this.html = value;
      const submit = {disabled: false}, error = {hidden: true, textContent: '', scrollIntoView() {}}, close = {}, cancel = {};
      this.form = {fields: {}, submit, error, close, cancel, querySelector: selector => selector === 'button[type="submit"]' ? submit : null};
    },
    querySelector(selector) {
      if (selector === 'form') return this.form;
      if (selector === '#form-errors') return this.form?.error;
      if (selector === '#close-editor') return this.form?.close;
      if (selector === '#cancel-editor') return this.form?.cancel;
      if (selector === 'button[type="submit"]') return this.form?.submit;
      return null;
    },
    close() { this.open = false; this.closed++; },
    replaceChildren() { this.form = null; },
    showModal() { this.open = true; }
  };
}
function harness() {
  const state = emptyState(), editor = dialogStub(), toasts = [], reconciled = [], listeners = new Map();
  let rendered = 0;
  const storage = {raw: JSON.stringify(state), getItem() {return this.raw;}, setItem(key, value) {this.raw = value;}};
  const dataStore = createDataStore(storage); dataStore.load();
  const sandbox = {
    state, realState: null, demoMode: false, dataEpoch: 0, storageProblem: '', dataStore,
    editor, FormData: FormDataStub, emptyState, demoState,
    escape: String, icon: () => '', toast: value => toasts.push(value), render: () => rendered++,
    uid: () => 'synthetic-entry', timer: {reconcile: entries => reconciled.push(entries)},
    calcs: [], view: 'overblik', calendarDate: '2028-03-06', periodMode: 'month', periodDate: '2028-03-06', jobFilter: '', menuOpen: true,
    navigate() {}, openEntry() {}, openPlannedEntry() {}, save() {return true;},
    renderDailyTools: ctx => `daily:${ctx.state.settings.name}`, renderDaySummary: ctx => `summary:${ctx.state.settings.name}`,
    isAppInstalled: () => false, selectedRows: () => [], periodRange: () => ({}), activeJob: () => null, entryTable() {},
    types: {}, schemes: {},
    location: {hash: '#daglig'},
    window: {addEventListener: (name, callback) => listeners.set(name, callback), scrollTo() {}},
    document: {querySelector: () => null, querySelectorAll: () => []},
    installApp() {}, timerAction() {}
  };
  const context = vm.createContext(sandbox);
  for (const name of ['closeModal', 'formError', 'modal', 'showConfirm', 'ctx', 'applyStoredData', 'readEntry']) vm.runInContext(functionSource(name), context);
  return {context, editor, storage, dataStore, toasts, reconciled, listeners, renders: () => rendered};
}
const submitEvent = () => ({preventDefault() {}});

test('saving sickness retains a disabled five-day scheme and its actual sick-pay norm', () => {
  const {context} = harness();
  context.state.jobs[0].scheme = '3'; context.state.jobs[0].sickPayPercent = 100;
  const fields = {type: {value: 'sick'}, date: {value: '2028-03-06'}, jobId: {value: context.state.jobs[0].id}, scheme: {value: '5', disabled: true}};
  const entry = context.readEntry({fields, elements: fields, querySelectorAll: () => []});
  assert.equal(entry.scheme, '5');
  assert.equal(calculateAll({...context.state, entries: [entry]})[0].paidHours, 7.4);
});

test('a pending modal submission runs once despite a second submit event', async () => {
  const {context, editor} = harness();
  let calls = 0, finish;
  context.modal('Synthetic form', '', () => {calls++; return new Promise(resolve => {finish = resolve;});});
  const form = editor.form, first = form.onsubmit(submitEvent());
  await form.onsubmit(submitEvent());
  assert.equal(calls, 1); assert.equal(form.submit.disabled, true);
  finish(false); await first;
  assert.equal(editor.form, form); assert.equal(editor.open, true); assert.equal(form.submit.disabled, false);
});

test('showConfirm preserves a dialog when its callback returns false', async () => {
  const {context, editor} = harness();
  let calls = 0;
  context.showConfirm('Synthetic confirmation', 'Synthetic description', async () => {calls++; return false;});
  const form = editor.form;
  await form.onsubmit(submitEvent());
  assert.equal(calls, 1); assert.equal(editor.form, form); assert.equal(editor.open, true);
});

test('an external data epoch change blocks a stale modal before its callback runs', async () => {
  const {context, editor} = harness();
  let calls = 0;
  context.modal('Synthetic form', '', () => {calls++; return true;});
  const form = editor.form; context.dataEpoch++;
  await form.onsubmit(submitEvent());
  assert.equal(calls, 0); assert.equal(editor.open, true); assert.equal(form.error.hidden, false);
  assert.match(form.error.textContent, /ændret/); assert.equal(form.submit.disabled, false);
});

test('completion of an old submit does not close a replacement dialog', async () => {
  const {context, editor} = harness();
  context.modal('First form', '', () => {context.modal('Replacement form', '', () => false); return true;});
  const first = editor.form;
  await first.onsubmit(submitEvent());
  assert.notEqual(editor.form, first); assert.equal(editor.open, true);
});

test('retained contexts follow storage updates, recovery state and demo changes', () => {
  const {context, storage, dataStore} = harness(), retained = context.ctx();
  const incoming = emptyState(); incoming.settings.name = 'REMOTE EXAMPLE';
  storage.raw = JSON.stringify(incoming); context.applyStoredData(storage.raw);
  assert.equal(retained.state.settings.name, 'REMOTE EXAMPLE'); assert.equal(retained.dailyToolsHTML, 'daily:REMOTE EXAMPLE');
  context.demoMode = true; assert.equal(retained.isDemo, true);
  context.applyStoredData('{invalid synthetic JSON');
  assert.equal(retained.needsRecovery, true); assert.equal(dataStore.rawRecovery, '{invalid synthetic JSON');
  assert.equal(retained.state.settings.name, 'REMOTE EXAMPLE');
});

test('storage received during demo is restored on exit instead of reviving the old snapshot', () => {
  const {context, storage} = harness(), buttons = new Map();
  for (const action of ['demo', 'exit-demo']) buttons.set(`[data-action="${action}"]`, {addEventListener(name, callback) {this.click = callback;}});
  context.document.querySelector = selector => buttons.get(selector) || null;
  vm.runInContext(functionSource('bindRoot'), context); context.bindRoot();
  const original = context.state;
  buttons.get('[data-action="demo"]').click();
  const displayedDemo = context.state;
  assert.equal(context.demoMode, true); assert.equal(context.realState, original);
  const incoming = emptyState(); incoming.settings.name = 'LATEST REMOTE EXAMPLE';
  storage.raw = JSON.stringify(incoming); context.applyStoredData(storage.raw);
  assert.equal(context.state, displayedDemo); assert.equal(context.realState.settings.name, 'LATEST REMOTE EXAMPLE');
  buttons.get('[data-action="exit-demo"]').click();
  assert.equal(context.demoMode, false); assert.equal(context.state.settings.name, 'LATEST REMOTE EXAMPLE');
  assert.equal(context.dataEpoch, 3);
});

test('external clear replaces the real snapshot and invalidates existing form epochs', () => {
  const {context, reconciled, storage} = harness();
  const previous = context.state;
  previous.entries.push({id: 'synthetic-old-entry', date: '2028-03-06', jobId: previous.jobs[0].id, type: 'work', scheme: '3', start: '06:00', end: '14:00', breakMinutes: 0, vehicle: '', route: '', crew: 'Alene', empties: 0, waste: [], extras: [], notes: ''});
  storage.raw = null; context.applyStoredData(null);
  assert.notEqual(context.state, previous); assert.equal(context.state.entries.length, 0);
  assert.equal(context.dataEpoch, 1); assert.equal(reconciled.at(-1).length, 0);
});

test('native hash navigation closes the existing dialog before rendering the destination', () => {
  const {context, editor, listeners, renders} = harness();
  context.modal('Synthetic form', '', () => false);
  const registration = source.split('\n').find(line => line.startsWith("window.addEventListener('hashchange'"));
  assert.ok(registration); vm.runInContext(registration, context);
  listeners.get('hashchange')();
  assert.equal(editor.open, false); assert.equal(editor.form, null); assert.equal(context.view, 'daglig');
  assert.equal(context.menuOpen, false); assert.equal(renders(), 1);
});
