import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyDirectory, validateDirectory, mergeDirectoryState} from './directory-domain.js';
import {emptyState, defaultJob, validateState, validateEntry, calculateAll} from './domain.js';

// Entirely synthetic fixtures. Do not add values from a private user directory here.
function sampleDirectory() {
  return {...emptyDirectory(), company: 'Eksempelvirksomhed', department: 'Eksempelafdeling', source: {fileName: 'example.pdf', title: 'Syntetisk testliste', sha256: 'a'.repeat(64), pageCount: 2, referenceDate: '2026-01-01'}, importedAt: '2026-01-01T12:00:00.000Z', vehicles: [{id: 'vehicle-example', number: 'TEST-001', registrationNumber: 'TESTPLADE', makeModel: 'Testmodel', description: 'Eksempelbeskrivelse', driverIds: ['person-example'], requiresVerification: true, sourcePage: 1, sourceHighlight: null, notes: ''}], people: [{id: 'person-example', name: 'Testperson Eksempel', phone: '+00 000 000', extension: '007', roles: ['Testrolle'], sourcePages: [1], vehicleNumbers: ['TEST-001'], notes: ''}], issues: [{id: 'issue-example', vehicleId: 'vehicle-example', sourcePage: 2, message: 'Syntetisk kontrolpunkt', truncatedInSource: false}]};
}
function work(state, overrides = {}) {
  return {id: 'entry-example', date: '2026-01-05', jobId: state.jobs[0].id, type: 'work', scheme: '3', start: '06:00', end: '14:00', breakMinutes: 0, vehicle: 'TEST-001', route: '', crew: 'Alene', empties: 0, waste: [], extras: [], notes: '', ...overrides};
}

test('an empty manual directory is valid and returns an independent clone', () => {
  const source = emptyDirectory();
  const result = validateDirectory(source);
  assert.equal(result.ok, true); assert.notEqual(result.directory, source);
  result.directory.vehicles.push({}); assert.equal(source.vehicles.length, 0);
});
test('legacy backups migrate to directory null without changing payroll or records', () => {
  const old = emptyState(); delete old.directory;
  old.entries = [work(old)];
  const result = validateState(JSON.parse(JSON.stringify(old)));
  assert.equal(result.ok, true); assert.equal(result.state.directory, null);
  assert.deepEqual(result.state.entries, old.entries); assert.deepEqual(result.state.jobs, old.jobs);
  assert.deepEqual(calculateAll(result.state), calculateAll(old));
});
test('directory JSON and full application backup round-trip with formatted numbers', () => {
  const directory = sampleDirectory();
  const envelope = {kind: 'arbejde-directory', version: 1, directory};
  const parsed = JSON.parse(JSON.stringify(envelope));
  const checked = validateDirectory(parsed.directory);
  assert.equal(checked.ok, true); assert.deepEqual(checked.directory, directory);
  assert.equal(checked.directory.people[0].extension, '007');
  assert.equal(checked.directory.people[0].phone, '+00 000 000');
  const state = mergeDirectoryState(emptyState(), checked.directory);
  const backup = validateState(JSON.parse(JSON.stringify(state)));
  assert.equal(backup.ok, true); assert.deepEqual(backup.state.directory, directory);
});
test('directory merge adds each vehicle once and preserves existing records and contract rates', () => {
  const state = emptyState();
  state.jobs = [defaultJob({...state.jobs[0], hourlyRate: 123.45, overtimeRate: 234.56})];
  state.entries = [work(state, {driver: 'Historisk testnavn', colleague: 'Tidligere kollega'})];
  state.plans = [{id: 'plan-example', date: '2026-01-06', jobId: state.jobs[0].id, title: 'Syntetisk plan', start: '06:00', end: '14:00', vehicle: '', route: ''}];
  state.vehicles = ['LOCAL-ONLY', 'TEST-001']; state.routes = ['EXAMPLE-ROUTE'];
  const before = JSON.stringify(state);
  const merged = mergeDirectoryState(state, sampleDirectory());
  assert.notEqual(merged, state); assert.equal(JSON.stringify(state), before);
  assert.deepEqual(merged.vehicles, ['LOCAL-ONLY', 'TEST-001']);
  for (const key of ['jobs', 'entries', 'plans', 'routes', 'settings']) assert.deepEqual(merged[key], state[key]);
  assert.equal(merged.jobs[0].hourlyRate, 123.45); assert.equal(merged.jobs[0].overtimeRate, 234.56);
  assert.deepEqual(mergeDirectoryState(merged, sampleDirectory()).vehicles, merged.vehicles);
  assert.equal(validateState(merged).ok, true);
});
test('directory validation rejects missing person and vehicle references', () => {
  const driver = sampleDirectory(); driver.vehicles[0].driverIds = ['missing-person'];
  assert.equal(validateDirectory(driver).ok, false);
  const vehicle = sampleDirectory(); vehicle.people[0].vehicleNumbers = ['missing-vehicle'];
  assert.equal(validateDirectory(vehicle).ok, false);
  const issue = sampleDirectory(); issue.issues[0].vehicleId = 'missing-vehicle';
  assert.equal(validateDirectory(issue).ok, false);
});
test('directory validation rejects unknown keys, local source paths, and polluted objects', () => {
  assert.equal(validateDirectory({...sampleDirectory(), unknown: true}).ok, false);
  const source = sampleDirectory(); source.source.path = 'private/source.pdf';
  assert.equal(validateDirectory(source).ok, false);
  const path = sampleDirectory(); path.source.fileName = 'C:\\private\\source.pdf';
  assert.equal(validateDirectory(path).ok, false);
  const person = sampleDirectory(); person.people[0].unknown = 'not allowed';
  assert.equal(validateDirectory(person).ok, false);
  assert.equal(validateDirectory(Object.create(null)).ok, false);
  assert.equal(validateDirectory(JSON.parse('{"__proto__":{}}')).ok, false);
});
test('directory validation rejects duplicate IDs, duplicate vehicle numbers, and excess counts', () => {
  const ids = sampleDirectory(); ids.people.push({...ids.people[0]});
  assert.equal(validateDirectory(ids).ok, false);
  const numbers = sampleDirectory(); numbers.vehicles.push({...numbers.vehicles[0], id: 'another-id'});
  assert.equal(validateDirectory(numbers).ok, false);
  const tooMany = emptyDirectory(); tooMany.vehicles = Array.from({length: 1001}, () => ({}));
  assert.equal(validateDirectory(tooMany).ok, false);
  const tooManyAfterMerge = emptyState(); tooManyAfterMerge.vehicles = Array.from({length: 1000}, (_, index) => `local-${index}`);
  assert.throws(() => mergeDirectoryState(tooManyAfterMerge, sampleDirectory()));
});
test('directory validation handles malformed nested content and phone types without throwing', () => {
  for (const patch of [{source: null}, {vehicles: [null]}, {people: [null]}, {issues: [null]}, {importedAt: 1}]) assert.equal(validateDirectory({...sampleDirectory(), ...patch}).ok, false);
  const phone = sampleDirectory(); phone.people[0].phone = 123;
  assert.equal(validateDirectory(phone).ok, false);
  const page = sampleDirectory(); page.people[0].sourcePages = [99];
  assert.equal(validateDirectory(page).ok, false);
});
test('optional historical driver and colleague names validate independently of the directory', () => {
  const state = emptyState();
  const entry = work(state, {driver: 'Tidligere testchauffør', colleague: 'Tidligere testkollega'});
  assert.deepEqual(validateEntry(entry, state), []);
  state.entries = [entry]; state.directory = sampleDirectory();
  const result = validateState(state);
  assert.equal(result.ok, true); assert.equal(result.state.entries[0].driver, entry.driver);
  assert.ok(validateEntry({...entry, colleague: 'x'.repeat(201)}, state).length > 0);
  state.entries = [{...entry, driver: 12}]; assert.equal(validateState(state).ok, false);
});
test('invalid directory data is rejected by state validation and merge', () => {
  const bad = sampleDirectory(); bad.vehicles[0].driverIds = ['missing-person'];
  assert.equal(validateState({...emptyState(), directory: bad}).ok, false);
  assert.equal(validateState({...emptyState(), directory: undefined}).ok, false);
  assert.throws(() => mergeDirectoryState(emptyState(), bad));
});
