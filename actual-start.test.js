import test from 'node:test';
import assert from 'node:assert/strict';
import {defaultJob, emptyState, calculateAll, summarize, validateEntry, validateState} from './domain.js';

const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} ≠ ${expected}`);
function fixture(scheme = '5', overrides = {}) {
  const job = defaultJob({id: 'job', scheme, hourlyRate: 200, overtimeRate: 300, overtimeRate2: 450, overtimeRule: 'atlFixed', ...overrides});
  return {...emptyState(), jobs: [job], settings: {name: '', defaultJobId: job.id}};
}
function work(overrides = {}) {
  return {id: 'shift', date: '2026-11-09', jobId: 'job', type: 'work', scheme: '5', start: '06:00', end: '18:00', breakMinutes: 0,
    vehicle: '', route: '', crew: 'alone', empties: 0, waste: [], extras: [], notes: '', overtimeBasis: 'actualStart', ...overrides};
}
function rowsFor(state, entries) {
  state.entries = entries;
  const validated = validateState(state);
  assert.equal(validated.ok, true, validated.errors.join('\n'));
  return calculateAll(validated.state);
}

test('new work validates and round-trips without normal start, end, or date', () => {
  const state = fixture(), entry = work();
  assert.deepEqual(validateEntry(entry, state), []);
  state.entries = [entry];
  const restored = validateState(JSON.parse(JSON.stringify(state)));
  assert.equal(restored.ok, true);
  assert.equal(restored.state.entries[0].overtimeBasis, 'actualStart');
  assert.equal(Object.hasOwn(restored.state.entries[0], 'normalStart'), false);
  assert.equal(Object.hasOwn(restored.state.entries[0], 'normalEnd'), false);
  assert.equal(validateState({...state, entries: [{...entry, overtimeBasis: 'other'}]}).ok, false);
});

test('ordinary capacity follows actual duration for early and late starts in every scheme', () => {
  for (const [scheme, norm, endEarly, endLate, actual] of [
    ['3', 12.33, '19:00', '22:00', 14],
    ['4', 9.25, '15:00', '18:00', 10],
    ['5', 7.4, '13:00', '16:00', 8]
  ]) {
    for (const [start, end] of [['05:00', endEarly], ['08:00', endLate]]) {
      const [row] = rowsFor(fixture(scheme, {normalStart: '06:00', normalEnd: '13:24'}), [work({scheme, start, end})]);
      near(row.actualHours, actual);
      near(row.baseHours, norm);
      near(row.overtimeHours, actual - norm);
      near(row.overtimeTier1Hours, actual - norm);
      assert.equal(row.overtimeTier2Hours, 0);
      assert.equal(row.overtimeAllocationMode, 'automatic');
      assert.deepEqual(row.overtimeWarnings, []);
    }
  }
});

test('Friday keeps its seven-hour limit while Monday uses 7.4 hours', () => {
  const state = fixture();
  const [monday, friday] = rowsFor(state, [work({id: 'monday', end: '14:00'}), work({id: 'friday', date: '2026-11-13', end: '14:00'})]);
  near(monday.overtimeHours, .6);
  assert.equal(friday.baseHours, 7);
  assert.equal(friday.overtimeHours, 1);
});

test('first three overtime hours use tier one and later worked time uses tier two', () => {
  const [row] = rowsFor(fixture(), [work()]);
  near(row.baseHours, 7.4);
  near(row.overtimeHours, 4.6);
  assert.equal(row.overtimeTier1Hours, 3);
  near(row.overtimeTier2Hours, 1.6);
  near(row.overtimePay, 1620);
});

test('overnight thresholds follow elapsed work across midnight', () => {
  const [row] = rowsFor(fixture(), [work({start: '21:00', end: '08:24'})]);
  near(row.actualHours, 11.4);
  near(row.baseHours, 7.4);
  assert.equal(row.overtimeTier1Hours, 3);
  assert.equal(row.overtimeTier2Hours, 1);
  assert.deepEqual(row.overtimeWarnings, []);
});

test('located pauses before, across, and after the normal boundary never consume paid capacity', () => {
  for (const breakStart of ['10:00', '13:15', '16:00']) {
    const [row] = rowsFor(fixture(), [work({breakMinutes: 30, breakStart})]);
    near(row.actualHours, 11.5);
    near(row.baseHours, 7.4);
    assert.equal(row.overtimeTier1Hours, 3, breakStart);
    near(row.overtimeTier2Hours, 1.1);
    assert.equal(row.overtimeAllocationMode, 'automatic');
    assert.deepEqual(row.overtimeWarnings, []);
  }
});

test('unknown pause location preserves hours and requests review when rates differ', () => {
  const [row] = rowsFor(fixture(), [work({breakMinutes: 30})]);
  near(row.actualHours, 11.5);
  near(row.baseHours, 7.4);
  assert.equal(row.overtimeTier1Hours, 3);
  near(row.overtimeTier2Hours, 1.1);
  assert.equal(row.overtimeAllocationMode, 'needsReview');
  assert.match(row.overtimeWarnings.join(' '), /Pausens placering/);
  assert.doesNotMatch(row.overtimeWarnings.join(' '), /Normale start-/);
});

test('gaps between split shifts do not advance normal or overtime thresholds', () => {
  const rows = rowsFor(fixture(), [work({id: 'early', end: '10:00'}), work({id: 'late', start: '14:00', end: '22:00'})]);
  assert.equal(rows[0].overtimeHours, 0);
  near(rows[1].baseHours, 3.4);
  assert.equal(rows[1].overtimeTier1Hours, 3);
  near(rows[1].overtimeTier2Hours, 1.6);
  const summary = summarize(rows);
  assert.equal(summary.workDays, 1);
  near(summary.actualHours, 12);
  near(summary.baseHours, 7.4);
  near(summary.overtimeHours, 4.6);
});

test('later split shifts retain already consumed tier-one overtime', () => {
  const rows = rowsFor(fixture(), [work({id: 'early', end: '17:00'}), work({id: 'late', start: '19:00', end: '21:00'})]);
  assert.equal(rows[0].overtimeTier1Hours, 3);
  near(rows[0].overtimeTier2Hours, .6);
  assert.equal(rows[1].baseHours, 0);
  assert.equal(rows[1].overtimeTier1Hours, 0);
  assert.equal(rows[1].overtimeTier2Hours, 2);
});

test('split accord shifts share one guarantee and do not turn a gap into overtime', () => {
  const rows = rowsFor(fixture('4'), [work({id: 'early', scheme: '4', end: '10:00'}), work({id: 'late', scheme: '4', start: '14:00', end: '18:00'})]);
  const summary = summarize(rows);
  assert.equal(summary.actualHours, 8);
  assert.equal(summary.baseHours, 9.25);
  assert.equal(summary.guaranteeHours, 1.25);
  assert.equal(summary.overtimeHours, 0);
  assert.equal(summary.workDays, 1);
});

test('weekly rest work is fully overtime without consuming a normal accord day', () => {
  const state = fixture('3');
  const rows = rowsFor(state, [work({scheme: '3', restDay: true, end: '11:00'}),
    ...['2026-11-10', '2026-11-11', '2026-11-12'].map(date => work({id: date, date, scheme: '3', end: '14:00'}))]);
  const rest = rows[0];
  assert.equal(rest.baseHours, 0);
  assert.equal(rest.guaranteeHours, 0);
  assert.equal(rest.overtimeHours, 5);
  assert.equal(rest.overtimeTier1Hours, 3);
  assert.equal(rest.overtimeTier2Hours, 2);
  assert.equal(rest.dayIndex, null);
  assert.deepEqual(rows.slice(1).map(row => row.dayIndex), [1, 2, 3]);
  assert.ok(rows.slice(1).every(row => row.baseHours === 12.33 && row.overtimeHours === 0));
});

test('Sunday keeps automatic holiday classification with actual-start registrations', () => {
  const [row] = rowsFor(fixture('4'), [work({date: '2026-11-15', scheme: '4', start: '06:00', end: '11:00', breakMinutes: 30, breakStart: '08:00'})]);
  assert.equal(row.baseHours, 0);
  assert.equal(row.overtimeTier1Hours, 0);
  assert.equal(row.overtimeTier2Hours, 4.5);
  assert.equal(row.dayIndex, null);
  assert.deepEqual(row.overtimeWarnings, []);
});

test('weekly-rest plans round-trip and reject an inconsistent work kind', () => {
  const state = fixture();
  const plan = {id: 'weekly-off', from: '2026-11-09', to: '2026-11-30', weekdays: [3], jobId: 'job', scheme: '5', title: 'Ugentlig fridag', kind: 'off', restDay: true, start: '', end: ''};
  state.plans = [plan];
  const restored = validateState(JSON.parse(JSON.stringify(state)));
  assert.equal(restored.ok, true, restored.errors.join('\n'));
  assert.deepEqual(restored.state.plans[0], plan);
  assert.equal(validateState({...state, plans: [{...plan, kind: 'work'}]}).ok, false);
  assert.equal(validateState({...state, plans: [{...plan, restDay: 'true'}]}).ok, false);
});

test('legacy normal hours and explicit manual allocation retain their earlier results', () => {
  const state = fixture();
  const legacyFixed = work({start: '05:00', end: '17:24', normalStart: '06:00', normalEnd: '13:24'});
  delete legacyFixed.overtimeBasis;
  const [legacy] = rowsFor(state, [legacyFixed]);
  assert.equal(legacy.overtimeTier1Hours, 4);
  assert.equal(legacy.overtimeTier2Hours, 1);
  const [actual] = rowsFor(state, [{...legacyFixed, overtimeBasis: 'actualStart'}]);
  assert.equal(actual.overtimeTier1Hours, 3);
  assert.equal(actual.overtimeTier2Hours, 2);
  const oldManual = work({start: '06:00', end: '15:00', overtimeTier2Minutes: 30});
  delete oldManual.overtimeBasis;
  const [manual] = rowsFor(state, [oldManual]);
  near(manual.overtimeTier1Hours, 1.1);
  assert.equal(manual.overtimeTier2Hours, .5);
  assert.match(manual.overtimeWarnings.join(' '), /Normale start-/);
});
