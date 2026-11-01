import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareScheduleImport, applyScheduleImport} from './schedule-domain.js';

test('PDF.js fallback fingerprints import when Web Crypto is unavailable', () => {
  const state = emptyState();
  const input = candidate({source: {...candidate().source, fileHash: 'pdfjs:' + 'a'.repeat(32)}});
  const preview = prepareScheduleImport(state, [input], {jobId: state.jobs[0].id, target: {mode: 'person', value: 'Maria'}});
  assert.equal(preview.counts.new, 1);
  const result = applyScheduleImport(state, preview, preview.items.map(item => item.id), {acknowledgeWarnings: true});
  assert.equal(result.state.plans[0].source.fileHash, input.source.fileHash);
});
import {emptyState, validateState, validateEntry} from './domain.js';

// Synthetic data only. Never put actual imported schedules or private identities here.
function setup() {
  const state = emptyState(); state.jobs[0].hourlyRate = 123.45; state.jobs[0].overtimeRate = 234.56;
  state.routes = ['TEST-ROUTE']; state.vehicles = ['TEST-001'];
  const options = {jobId: state.jobs[0].id, scheme: '3', target: {mode: 'person', value: 'Maria'}};
  return {state, options};
}
function candidate(overrides = {}) {
  return {id: 'candidate-example', date: '2028-03-06', person: 'Maria', people: ['Maria'], vehicle: 'TEST-001', task: '', route: '', start: '', end: '', kind: 'work', warnings: [], needsReview: false, source: {fileName: 'synthetic.pdf', fileHash: 'a'.repeat(64), page: 1, row: 1, week: 10, year: 2028}, ...overrides};
}
function entry(state, overrides = {}) {
  return {id: 'entry-example', date: '2028-03-07', jobId: state.jobs[0].id, type: 'work', scheme: '3', start: '06:00', end: '14:00', breakMinutes: 0, vehicle: 'TEST-001', route: '', driver: 'Maria', colleague: '', crew: 'Alene', empties: 0, waste: [], extras: [], notes: '', ...overrides};
}
const importAll = (state, preview, options) => applyScheduleImport(state, preview, preview.items.map(item => item.id), options);

test('all-day plans remain untimed, and repeat import is idempotent even with a renamed PDF', () => {
  const {state, options} = setup();
  const preview = prepareScheduleImport(state, [candidate()], options);
  assert.equal(preview.items[0].status, 'new'); assert.equal(preview.items[0].plan.start, ''); assert.equal(preview.items[0].plan.end, '');
  const first = importAll(state, preview); assert.equal(first.added, 1); assert.equal(first.state.entries.length, 0);
  const renamed = candidate({source: {...candidate().source, fileName: 'renamed.pdf', fileHash: 'b'.repeat(64)}});
  const repeated = prepareScheduleImport(first.state, [renamed], options);
  assert.equal(repeated.items[0].status, 'duplicate');
  const second = importAll(first.state, repeated); assert.equal(second.added, 0); assert.equal(second.skipped, 1); assert.equal(second.state.plans.length, 1);
});
test('duplicates inside one batch are added once, including repeated stable candidate IDs', () => {
  const {state, options} = setup();
  const preview = prepareScheduleImport(state, [candidate(), candidate()], options);
  assert.deepEqual(preview.items.map(item => item.status), ['new', 'duplicate']);
  const result = importAll(state, preview); assert.equal(result.added, 1); assert.equal(result.skipped, 1);
});
test('revised PDF plans replace only old imported plans after explicit choice', () => {
  const {state, options} = setup();
  const first = importAll(state, prepareScheduleImport(state, [candidate()], options)).state;
  first.plans.push({id: 'manual-later', date: '2028-03-08', jobId: options.jobId, scheme: '3', title: 'Manuel plan', start: '', end: '', vehicle: 'TEST-001', route: '', notes: ''});
  const revised = candidate({id: 'revised-example', start: '08:00', end: '16:00'});
  const preview = prepareScheduleImport(first, [revised], options);
  assert.equal(preview.items[0].status, 'conflict'); assert.equal(preview.items[0].canReplace, true);
  assert.throws(() => importAll(first, preview));
  const result = importAll(first, preview, {replaceImported: true});
  assert.equal(result.replaced, 1); assert.equal(result.added, 1);
  assert.ok(result.state.plans.some(plan => plan.id === 'manual-later'));
  assert.equal(result.state.plans.find(plan => plan.source)?.start, '08:00');
});
test('manual recurring plans and actual entries block replacement', () => {
  const {state, options} = setup();
  state.plans = [{id: 'manual-example', from: '2028-03-01', to: '2028-03-31', weekdays: [1], jobId: options.jobId, scheme: '3', title: 'Manuel ugeplan', start: '', end: '', vehicle: 'TEST-001', route: '', notes: ''}];
  const manual = prepareScheduleImport(state, [candidate()], options);
  assert.equal(manual.items[0].status, 'conflict'); assert.equal(manual.items[0].canReplace, false);
  assert.throws(() => importAll(state, manual, {replaceImported: true}));
  state.plans = []; state.entries = [entry(state, {date: '2028-03-06'})];
  const actual = prepareScheduleImport(state, [candidate()], options);
  assert.equal(actual.items[0].status, 'conflict'); assert.equal(actual.items[0].canReplace, false);
  assert.throws(() => importAll(state, actual, {replaceImported: true}));
});
test('fuzzy names require acknowledgement and never become an extra colleague', () => {
  const {state, options} = setup();
  const preview = prepareScheduleImport(state, [candidate({person: 'Marria', people: ['Marria']})], options);
  assert.equal(preview.items[0].needsReview, true); assert.equal(preview.items[0].plan.driver, 'Maria'); assert.equal(preview.items[0].plan.colleague, '');
  assert.deepEqual(preview.items[0].plan.people, ['Marria']);
  assert.throws(() => importAll(state, preview));
  assert.equal(importAll(state, preview, {acknowledgeWarnings: true}).added, 1);
});
test('overnight conflicts cross dates; touching shift boundaries do not overlap', () => {
  const {state, options} = setup();
  state.plans = [{id: 'night-example', date: '2028-03-05', jobId: options.jobId, title: 'Natteplan', start: '22:00', end: '06:00', vehicle: 'TEST-001', driver: 'Maria'}];
  assert.equal(prepareScheduleImport(state, [candidate({start: '05:00', end: '08:00'})], options).items[0].status, 'conflict');
  assert.equal(prepareScheduleImport(state, [candidate({start: '06:00', end: '08:00'})], options).items[0].status, 'new');
  state.plans = []; state.entries = [entry(state, {date: '2028-03-05', start: '22:00', end: '06:00'})];
  assert.equal(prepareScheduleImport(state, [candidate({start: '05:00', end: '08:00'})], options).items[0].canReplace, false);
});
test('default times are applied only after explicit opt-in; invalid times and dates are blocked', () => {
  const {state, options} = setup();
  assert.equal(prepareScheduleImport(state, [candidate()], {...options, defaultStart: '06:00', defaultEnd: '14:00'}).items[0].plan.start, '');
  assert.equal(prepareScheduleImport(state, [candidate()], {...options, useDefaultTimes: true, defaultStart: '06:00', defaultEnd: '14:00'}).items[0].plan.start, '06:00');
  assert.equal(prepareScheduleImport(state, [candidate()], {...options, useDefaultTimes: true, defaultStart: 'bad', defaultEnd: '14:00'}).items[0].status, 'invalid');
  assert.equal(prepareScheduleImport(state, [candidate({date: '2028-02-31'})], options).items[0].status, 'invalid');
});
test('vehicle filtering preserves source people without assuming a primary driver', () => {
  const {state, options} = setup();
  const preview = prepareScheduleImport(state, [candidate({people: ['Maria', 'Ole']}), candidate({id: 'other-example', vehicle: 'OTHER'})], {...options, target: {mode: 'vehicle', value: 'test-001'}});
  assert.equal(preview.items.length, 1); assert.equal(preview.items[0].plan.driver, ''); assert.equal(preview.items[0].plan.colleague, '');
  assert.deepEqual(preview.items[0].plan.people, ['Maria', 'Ole']);
  assert.equal(preview.items[0].plan.title, 'Arbejdsplan · TEST-001');
});
test('import preserves rates, actual entries, directory, routes, settings and input objects', () => {
  const {state, options} = setup(); state.entries = [entry(state)];
  state.settings.defaultDriver = 'Maria'; state.settings.defaultVehicle = 'TEST-001';
  const before = JSON.stringify(state), preview = prepareScheduleImport(state, [candidate()], options);
  const result = importAll(state, preview);
  assert.equal(JSON.stringify(state), before);
  for (const key of ['jobs', 'entries', 'directory', 'routes', 'vehicles', 'settings']) assert.deepEqual(result.state[key], state[key]);
  assert.equal(result.state.jobs[0].hourlyRate, 123.45);
});
test('nested source schema, optional historical references, timer uniqueness and legacy settings validate', () => {
  const {state, options} = setup();
  const imported = importAll(state, prepareScheduleImport(state, [candidate()], options)).state;
  imported.entries = [entry(imported, {planId: 'historical-plan', timerId: 'timer-example'})];
  assert.equal(validateState(imported).ok, true);
  assert.ok(validateEntry(entry(imported, {id: 'another-entry', date: '2028-03-09', timerId: 'timer-example'}), imported).length > 0);
  const duplicateTimer = {...imported, entries: [...imported.entries, entry(imported, {id: 'another-entry', date: '2028-03-09', timerId: 'timer-example'})]};
  assert.equal(validateState(duplicateTimer).ok, false);
  const source = imported.plans[0].source;
  for (const patch of [{unknown: true}, {fileName: 'C:\\private\\source.pdf'}, {fileHash: 'not-a-fingerprint'}, {page: 0}, {importedAt: '2028-02-31T00:00:00Z'}]) {
    const bad = {...imported, plans: [{...imported.plans[0], source: {...source, ...patch}}]};
    assert.equal(validateState(bad).ok, false);
  }
  assert.equal(validateState(emptyState()).ok, true);
});
test('batch conflicts cannot silently replace another selected candidate', () => {
  const {state, options} = setup();
  const preview = prepareScheduleImport(state, [candidate(), candidate({id: 'another-example', vehicle: 'OTHER'})], options);
  assert.equal(preview.items[1].status, 'conflict'); assert.equal(preview.items[1].canReplace, false);
  assert.throws(() => importAll(state, preview, {replaceImported: true}));
  assert.equal(state.plans.length, 0);
});
test('a batch-only alternative can be chosen alone while simultaneous alternatives are rejected', () => {
  const {state, options} = setup();
  const preview = prepareScheduleImport(state, [candidate(), candidate({id: 'alternative-example', vehicle: 'OTHER'})], options);
  assert.equal(preview.items[1].batchConflictOnly, true);
  const chosen = applyScheduleImport(state, preview, ['alternative-example']);
  assert.equal(chosen.added, 1); assert.equal(chosen.state.plans[0].vehicle, 'OTHER');
  assert.throws(() => applyScheduleImport(state, preview, preview.items.map(item => item.id)));
  state.entries = [entry(state, {date: '2028-03-06'})];
  const blocked = prepareScheduleImport(state, [candidate(), candidate({id: 'alternative-example', vehicle: 'OTHER'})], options);
  assert.equal(blocked.items[1].batchConflictOnly, false);
  assert.throws(() => applyScheduleImport(state, blocked, ['alternative-example']));
});
