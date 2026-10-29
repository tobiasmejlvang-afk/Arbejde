import test from 'node:test';
import assert from 'node:assert/strict';
import {defaultJob, emptyState, demoState, calculateAll, summarize, validateEntry, validateState, weekStart, addDays, monthRange, payPeriod} from './domain.js';

function fixture(scheme = '3') {
  const job = defaultJob({id: 'job', scheme, hourlyRate: 200, overtimeRate: 300, pensionEmployee: 2, pensionEmployer: 10, choicePercent: 9, holidayPercent: 12.5});
  return {...emptyState(), jobs: [job], settings: {name: '', defaultJobId: 'job'}};
}
function work(date, overrides = {}) {
  return {id: date, date, jobId: 'job', type: 'work', scheme: '3', start: '05:00', end: '15:00', breakMinutes: 0, vehicle: '', route: '', crew: 'alone', empties: 0, waste: [], extras: [], notes: '', ...overrides};
}
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} ≠ ${expected}`);

test('three-day accord pays guarantee, then entire fourth day as overtime', () => {
  const state = fixture();
  state.entries = ['2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22'].map(date => work(date));
  const rows = calculateAll(state);
  near(rows[0].baseHours, 12.33); near(rows[0].guaranteeHours, 2.33);
  assert.equal(rows[3].baseHours, 0); assert.equal(rows[3].overtimeHours, 10);
  near(summarize(rows).paidHours, 46.99);
});
test('four-day accord pays 9.25-hour norm and treats a fifth day as overtime', () => {
  const state = fixture('4');
  state.entries = [19, 20, 21, 22, 23].map(day => work(`2026-10-${day}`, {scheme: '4', end: '13:00'}));
  const rows = calculateAll(state);
  assert.equal(rows[0].baseHours, 9.25); assert.equal(rows[4].overtimeHours, 8);
});
test('weekly classification is computed before dashboard filtering', () => {
  const state = fixture();
  state.entries = ['2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01'].map(date => work(date));
  const october = calculateAll(state).filter(row => row.entry.date >= '2026-10-01');
  assert.equal(october[0].dayIndex, 4); assert.equal(october[0].overtimeHours, 10);
});
test('several shifts share one daily guarantee and count as one workday', () => {
  const state = fixture();
  state.entries = [work('2026-10-19', {id: 'a', start: '05:00', end: '09:00'}), work('2026-10-19', {id: 'b', start: '10:00', end: '14:00'})];
  const summary = summarize(calculateAll(state));
  near(summary.baseHours, 12.33); near(summary.guaranteeHours, 4.33); assert.equal(summary.workDays, 1);
});
test('long accord day pays only excess as overtime', () => {
  const state = fixture(); state.entries = [work('2026-10-19', {end: '19:00', breakMinutes: 30})];
  const row = calculateAll(state)[0]; near(row.actualHours, 13.5); near(row.overtimeHours, 1.17); near(row.paidHours, 13.5);
});
test('included extra tasks reclassify once and preserve accord guarantee', () => {
  const state = fixture(); state.entries = [work('2026-10-19', {extras: [{id: 'x', kind: 'task', task: 'Vask', minutes: 60, paidOvertime: true}]})];
  const row = calculateAll(state)[0]; assert.equal(row.actualHours, 10); near(row.baseHours, 12.33); near(row.overtimeHours, 1); near(row.paidHours, 13.33);
});
test('explicit overtime and natural excess are not counted twice', () => {
  const state = fixture(); state.entries = [work('2026-10-19', {end: '19:00', extras: [{id: 'x', kind: 'task', task: 'Vask', minutes: 60, paidOvertime: true}]})];
  near(calculateAll(state)[0].overtimeHours, 1.67);
});
test('ordinary hourly scheme has no guarantee and uses Friday/weekend limits', () => {
  const state = fixture('5');
  state.entries = [work('2026-10-22', {scheme: '5', end: '11:00'}), work('2026-10-23', {scheme: '5', end: '13:00'}), work('2026-10-24', {scheme: '5', end: '13:00'})];
  const rows = calculateAll(state);
  assert.equal(rows[0].paidHours, 6); assert.equal(rows[1].baseHours, 7); assert.equal(rows[1].overtimeHours, 1); assert.equal(rows[2].baseHours, 0); assert.equal(rows[2].overtimeHours, 8);
});
test('overnight shifts and pauses calculate correctly', () => {
  const state = fixture('5'); state.entries = [work('2026-10-19', {scheme: '5', start: '22:00', end: '06:00', breakMinutes: 30})];
  const row = calculateAll(state)[0]; assert.equal(row.actualHours, 7.5); near(row.overtimeHours, .1);
});
test('sickness follows configured percentage while vacation consumes days only', () => {
  const state = fixture('4'); state.jobs[0].sickPayPercent = 80;
  state.entries = [work('2026-10-19', {scheme: '4', type: 'sick'}), work('2026-10-20', {type: 'holiday'})];
  const rows = calculateAll(state); near(rows[0].paidHours, 7.4); assert.equal(rows[1].grossPay, 0); assert.equal(summarize(rows).holidayDays, 1);
});
test('missing overtime rate marks amount incomplete without falling back to base rate', () => {
  const state = fixture(); state.jobs[0].overtimeRate = 0; state.entries = [work('2026-10-19', {end: '19:00'})];
  const row = calculateAll(state)[0]; assert.equal(row.rateMissing, true); assert.equal(row.overtimePay, 0); assert.deepEqual(row.missingRates, ['overtimeRate']);
});
test('pension and savings are separate percentages of known gross wage', () => {
  const state = fixture('5'); state.entries = [work('2026-10-19', {scheme: '5', end: '11:00'})];
  const row = calculateAll(state)[0]; assert.equal(row.grossPay, 1200); assert.equal(row.pensionEmployee, 24); assert.equal(row.pensionEmployer, 120); assert.equal(row.choice, 108); assert.equal(row.holidayAccrual, 150);
});
test('date helpers cross month, year, and daylight-saving boundaries', () => {
  assert.equal(weekStart('2027-01-01'), '2026-12-28'); assert.equal(addDays('2026-10-24', 2), '2026-10-26'); assert.deepEqual(monthRange('2028-02-12'), {start: '2028-02-01', end: '2028-02-29'});
});
test('monthly paydays clamp to month length; fortnight works before anchor', () => {
  const job = defaultJob({periodType: 'month', payday: 31}); assert.equal(payPeriod(job, '2028-02-10').payday, '2028-02-29');
  const period = payPeriod({...job, periodType: '14days', periodAnchor: '2026-10-19', paydayOffset: 7}, '2026-10-18');
  assert.equal(period.start, '2026-10-05'); assert.equal(period.end, '2026-10-18'); assert.equal(period.payday, '2026-10-25');
});
test('validation catches overnight overlap and allows touching boundaries', () => {
  const state = fixture(); state.entries = [work('2026-10-19', {id: 'night', start: '22:00', end: '06:00'})];
  assert.ok(validateEntry(work('2026-10-20', {start: '05:00', end: '08:00'}), state).some(error => error.includes('overlapper')));
  assert.deepEqual(validateEntry(work('2026-10-20', {start: '06:00', end: '08:00'}), state), []);
});
test('validation rejects duplicate absence, impossible dates, invalid extras and mixed daily schemes', () => {
  const state = fixture(); state.entries = [work('2026-10-19')];
  assert.ok(validateEntry(work('2026-10-19', {id: 'holiday', type: 'holiday'}), state).some(error => error.includes('allerede')));
  assert.ok(validateEntry(work('2026-02-30'), state).some(error => error.includes('dato')));
  assert.ok(validateEntry(work('2026-10-19', {id: 'b', scheme: '4', start: '16:00', end: '18:00'}), state).some(error => error.includes('samme arbejdsuge')));
  assert.ok(validateEntry(work('2026-10-20', {extras: [{id: 'x', kind: 'task', task: 'Test', minutes: 1000, paidOvertime: true}]}), state).some(error => error.includes('overstige')));
});
test('backup validation accepts generated states and rejects untrusted keys and missing references', () => {
  assert.equal(validateState(emptyState()).ok, true); assert.equal(validateState(demoState()).ok, true);
  const state = fixture(); state.entries = [work('2026-10-19')];
  assert.equal(validateState(state).ok, true);
  assert.equal(validateState({...state, unknown: 'no'}).ok, false);
  assert.equal(validateState({...state, entries: [{...state.entries[0], jobId: 'missing'}]}).ok, false);
  const polluted = JSON.parse(JSON.stringify(state)); polluted.jobs[0].__proto__ = null;
  assert.equal(validateState(polluted).ok, false);
});
test('backup validation rejects malformed nested objects without throwing', () => {
  const state = fixture();
  for (const patch of [{jobs: [null]}, {entries: [null]}, {plans: [null]}, {settings: null}]) assert.equal(validateState({...state, ...patch}).ok, false);
  state.entries = [work('2026-10-19', {extras: [null]})];
  assert.equal(validateState(state).ok, false);
});
test('backup validates recurring plans and rejects invalid weekdays or reversed dates', () => {
  const state = fixture();
  const plan = {id: 'plan', from: '2026-10-01', to: '2026-10-31', weekdays: [1, 2, 3], jobId: 'job', scheme: '3', title: 'Daghold', start: '05:00', end: '15:00', vehicle: '', route: ''};
  state.plans = [plan]; assert.equal(validateState(state).ok, true);
  state.plans = [{...plan, weekdays: [0]}]; assert.equal(validateState(state).ok, false);
  state.plans = [{...plan, to: '2026-09-01'}]; assert.equal(validateState(state).ok, false);
});
test('backup catches overlaps across midnight using batch interval validation', () => {
  const state = fixture();
  state.entries = [work('2026-10-19', {start: '22:00', end: '06:00'}), work('2026-10-20', {start: '05:00', end: '10:00'})];
  assert.equal(validateState(state).ok, false);
});
test('overnight work conflicts with an absence on the following calendar day', () => {
  const state = fixture(); state.entries = [work('2026-10-19', {start: '22:00', end: '06:00'})];
  const holiday = work('2026-10-20', {type: 'holiday', extras: []});
  assert.ok(validateEntry(holiday, state).some(error => error.includes('overlapper')));
  assert.equal(validateState({...state, entries: [...state.entries, holiday]}).ok, false);
});
test('contract dates may be blank for monthly wages and Danish crew labels round-trip', () => {
  const state = fixture(); state.jobs[0].startDate = ''; state.jobs[0].periodAnchor = '';
  state.entries = [work('2026-10-19', {crew: 'Med kollega'})];
  assert.equal(validateState(state).ok, true);
});
test('unknown contract benefits default to zero and sickness does not assume wage', () => {
  const job = defaultJob({id: 'job', hourlyRate: 200});
  assert.equal(job.holidayDays, 0); assert.equal(job.freeHolidayDays, 0); assert.equal(job.sickPayPercent, 0);
  const state = fixture(); state.jobs = [job]; state.entries = [work('2026-10-19', {type: 'sick'})];
  assert.equal(calculateAll(state)[0].grossPay, 0);
});
