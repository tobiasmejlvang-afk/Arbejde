import test from 'node:test';
import assert from 'node:assert/strict';
import {defaultJob, defaultPreferences, emptyState, demoState, calculateAll, summarize, validateEntry, validateState, weekStart, addDays, monthRange, payPeriod} from './domain.js';

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
test('three-day accord pays rest-day work entirely as overtime without using a normal day slot', () => {
  const state = fixture();
  state.entries = [19, 20, 21, 22, 23].map(day => work(`2026-10-${day}`, {restDay: day === 19}));
  state.entries[0].extras = [{id: 'rest-extra', kind: 'task', task: 'Vask', minutes: 60, paidOvertime: true}];
  const rows = calculateAll(state);
  const [rest, first, , third, fourth] = rows;
  assert.equal(rest.actualHours, 10); assert.equal(rest.overtimeHours, 10);
  assert.equal(rest.baseHours, 0); assert.equal(rest.guaranteeHours, 0); assert.equal(rest.paidHours, 10); assert.equal(rest.grossPay, 3000);
  assert.equal(rest.dayIndex, null); assert.equal(rest.nominalHours, 0);
  assert.equal(first.dayIndex, 1); near(third.baseHours, 12.33); assert.equal(fourth.dayIndex, 4); assert.equal(fourth.overtimeHours, 10);
  assert.equal(summarize(rows).workDays, 5);
});
test('split shifts on a rest day get no four-day guarantee and later normal days keep all four slots', () => {
  const state = fixture('4');
  state.entries = [work('2026-10-19', {id: 'rest-early', scheme: '4', restDay: true, end: '09:00'}), work('2026-10-19', {id: 'rest-late', scheme: '4', restDay: true, start: '10:00', end: '14:00'}), ...[20, 21, 22, 23, 24].map(day => work(`2026-10-${day}`, {scheme: '4', end: '13:00'}))];
  assert.equal(validateState(state).ok, true);
  const rows = calculateAll(state);
  assert.equal(summarize(rows.slice(0, 2)).overtimeHours, 8);
  assert.equal(summarize(rows.slice(0, 2)).baseHours, 0);
  assert.deepEqual(rows.slice(2, 6).map(row => row.dayIndex), [1, 2, 3, 4]);
  assert.ok(rows.slice(2, 6).every(row => row.baseHours === 9.25));
  assert.equal(rows[6].overtimeHours, 8);
});
test('a marked weekday in the five-day schedule is fully overtime after the unpaid break', () => {
  const state = fixture('5');
  state.entries = [work('2026-10-23', {scheme: '5', restDay: true, end: '13:00', breakMinutes: 30})];
  const row = calculateAll(state)[0];
  assert.equal(row.actualHours, 7.5); assert.equal(row.overtimeHours, 7.5);
  assert.equal(row.baseHours, 0); assert.equal(row.guaranteeHours, 0); assert.equal(row.grossPay, 2250);
  state.jobs[0].overtimeRate = 0;
  assert.deepEqual(calculateAll(state)[0].missingRates, ['overtimeRate']);
});
test('legacy shifts default to ordinary days and split shifts require consistent boolean rest-day flags', () => {
  const state = fixture();
  const first = work('2026-10-19', {id: 'first', end: '09:00'});
  state.entries = [first];
  const late = work('2026-10-19', {id: 'late', start: '10:00', end: '14:00', restDay: false});
  assert.deepEqual(validateEntry(late, state), []);
  assert.equal(validateState({...state, entries: [first, late]}).ok, true);
  assert.ok(validateEntry({...late, restDay: true}, state).some(error => error.includes('samme hviledagsmarkering')));
  assert.equal(validateState({...state, entries: [first, {...late, restDay: true}]}).ok, false);
  assert.equal(validateState({...state, entries: [{...first, restDay: 'false'}]}).ok, false);
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
test('malformed JSON text fields return validation errors without invoking object coercion', () => {
  const state = fixture();
  for (const patch of [{start: {toString: 'not a function'}}, {end: ['15:00']}, {extras: [{id: 'extra-example', kind: 'task', minutes: 1, task: {toString: 'not a function'}, paidOvertime: false}]}]) {
    const candidate = work('2026-10-19', patch);
    assert.ok(validateEntry(candidate, state).length > 0);
    assert.equal(validateState({...state, entries: [candidate]}).ok, false);
  }
});
test('legacy backups without route templates and preferences remain valid without filling fields', () => {
  const legacy = emptyState(); delete legacy.routeTemplates; delete legacy.settings.preferences;
  const restored = validateState(JSON.parse(JSON.stringify(legacy)));
  assert.equal(restored.ok, true); assert.deepEqual(restored.state, legacy);
  const defaults = defaultPreferences(); defaults.compact = true;
  assert.equal(defaultPreferences().compact, false);
});
test('route templates and preferences round-trip with an overnight default shift', () => {
  const state = emptyState();
  state.routeTemplates = [{id: 'example-route', name: 'Eksempelrute', weekParity: 'odd', weekday: 1, waste: ['Mad', 'Rest'], empties: 40}];
  state.settings.preferences = {...defaultPreferences(), compact: true, reduceMotion: true, defaultStart: '22:00', defaultEnd: '06:00', defaultBreakMinutes: 30, defaultRouteId: 'example-route'};
  const result = validateState(JSON.parse(JSON.stringify(state)));
  assert.equal(result.ok, true); assert.deepEqual(result.state, state);
  assert.equal(validateState({...state, routeTemplates: []}).ok, false);
});
test('route templates reject invalid weekdays, duplicate ids, waste and quantities', () => {
  const state = emptyState(), route = {id: 'example-route', name: 'Eksempelrute', weekParity: 'all', weekday: 7, vehicle: '', waste: [], empties: 100000};
  assert.equal(validateState({...state, routeTemplates: [route]}).ok, true);
  assert.equal(validateState({...state, routeTemplates: [route, {...route}]}).ok, false);
  for (const changes of [{weekParity: 'alternating'}, {weekday: 0}, {name: ' '}, {waste: ['Rest', 'Rest']}, {waste: ['Ukendt']}, {empties: -1}, {empties: 100001}, {unexpected: true}]) assert.equal(validateState({...state, routeTemplates: [{...route, ...changes}]}).ok, false);
});
test('preferences reject incomplete shift times, impossible pauses and unknown keys', () => {
  const state = emptyState();
  for (const changes of [{defaultEnd: ''}, {defaultStart: '06:00', defaultEnd: '06:00'}, {defaultStart: '22:00', defaultEnd: '06:00', defaultBreakMinutes: 480}, {defaultBreakMinutes: 1.5}, {defaultBreakMinutes: 1440}, {defaultRouteId: 'missing-route'}, {reduceMotion: 'false'}, {unknown: true}]) {
    const settings = {...state.settings, preferences: {...defaultPreferences(), ...changes}};
    assert.equal(validateState({...state, settings}).ok, false);
  }
});
test('photo metadata is portable in state backups for work and absence without changing payroll', () => {
  const state = fixture();
  const photo = {id: 'a'.repeat(32), name: 'eksempel.jpg', mime: 'image/jpeg', size: 5242880};
  const second = {id: '12345678-1234-4123-8123-123456789abc', name: 'eksempel.webp', mime: 'image/webp', size: 1};
  state.entries = [work('2026-10-19', {photos: [photo]}), work('2026-10-20', {type: 'off', photos: [second]})];
  const result = validateState(JSON.parse(JSON.stringify(state)));
  assert.equal(result.ok, true); assert.deepEqual(result.state.entries, state.entries);
  const withoutPhotos = {...state, entries: state.entries.map(({photos, ...entry}) => entry)};
  assert.deepEqual(summarize(calculateAll(result.state)), summarize(calculateAll(withoutPhotos)));
});
test('photo validation rejects excess, duplicate or embedded image records before saving', () => {
  const state = fixture();
  const photo = {id: 'b'.repeat(32), name: 'eksempel.png', mime: 'image/png', size: 512};
  const tooMany = Array.from({length: 7}, (_, index) => ({...photo, id: String(index).repeat(32)}));
  for (const photos of [[photo, photo], tooMany, [{...photo, data: 'encoded-image'}], [{...photo, id: 'bad-id'}], [{...photo, name: 'x'.repeat(151)}], [{...photo, mime: 'image/svg+xml'}], [{...photo, size: 0}], [{...photo, size: 5242881}]]) {
    const entry = work('2026-10-19', {photos});
    assert.ok(validateEntry(entry, state).length > 0);
    assert.equal(validateState({...state, entries: [entry]}).ok, false);
  }
});
