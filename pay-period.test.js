import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyState, defaultJob, calculateAll, summarize, validateState, validateEntry, isPlannedRestDay, overtimeRates} from './domain.js';

function fixture(overrides = {}) {
  const state = emptyState();
  const job = defaultJob({id: 'job', scheme: '4', hourlyRate: 198.9, overtimeRate: 44.54, overtimeRate2: 109.4,
    overtimeRateType: 'supplement', overtimeRule: 'atlFixed', sickPayPercent: 100, ...overrides});
  state.jobs = [job];
  state.settings.defaultJobId = job.id;
  return state;
}

function work(overrides = {}) {
  return {id: 'work', jobId: 'job', date: '2026-11-09', scheme: '4', type: 'work', start: '06:00', end: '19:15',
    breakMinutes: 0, waste: [], extras: [], empties: 0, crew: 'Alene', overtimeBasis: 'actualStart', ...overrides};
}

function restPlan(overrides = {}) {
  return {id: 'rest', jobId: 'job', scheme: '4', date: '2026-11-09', kind: 'off', restDay: true,
    title: 'Ugentlig fridag', start: '', end: '', ...overrides};
}

test('supplements add ordinary hourly pay to every overtime hour exactly once', () => {
  const state = fixture();
  state.entries = [work()];
  assert.equal(validateState(state).ok, true);
  const row = calculateAll(state)[0];
  assert.deepEqual(overtimeRates(state.jobs[0]), {type: 'supplement', tier1: 243.44, tier2: 308.3});
  assert.equal(row.baseHours, 9.25);
  assert.equal(row.overtimeTier1Hours, 3);
  assert.equal(row.overtimeTier2Hours, 1);
  assert.equal(row.overtimeTier1Pay, 730.32);
  assert.equal(row.overtimeTier2Pay, 308.3);
  assert.equal(row.overtimeBasePay, 795.6);
  assert.equal(row.overtimeTier1SupplementPay, 133.62);
  assert.equal(row.overtimeTier2SupplementPay, 109.4);
  assert.equal(row.grossPay, 2878.45);
  const full = fixture({overtimeRateType: 'total', overtimeRate: 243.44, overtimeRate2: 308.3});
  full.entries = state.entries;
  assert.equal(calculateAll(full)[0].grossPay, row.grossPay);
  delete full.jobs[0].overtimeRateType;
  assert.equal(calculateAll(full)[0].grossPay, row.grossPay);
});

test('low total rates require review instead of silently presenting a complete wage', () => {
  const state = fixture({overtimeRateType: 'total'});
  state.entries = [work()];
  const row = calculateAll(state)[0];
  assert.equal(row.overtimeAllocationMode, 'needsReview');
  assert.match(row.overtimeWarnings.join(' '), /tillæg/);
});

test('displayed overtime base and supplements sum to the same rounded pay at minute boundaries', () => {
  const state = fixture({hourlyRate: 100.5});
  state.entries = [work({restDay: true, end: '06:02', overtimeTier2Minutes: 1})];
  const row = calculateAll(state)[0];
  assert.equal(Math.round((row.overtimeBasePay + row.overtimeTier1SupplementPay + row.overtimeTier2SupplementPay) * 100), Math.round(row.overtimePay * 100));
});

test('fixed scheduled hours pay the hour before normal start in addition to accord guarantee', () => {
  const state = fixture();
  state.entries = [work({start: '05:00', end: '14:00', overtimeBasis: 'fixedSchedule', normalStart: '06:00', normalEnd: '15:15'})];
  assert.equal(validateState(state).ok, true);
  const row = calculateAll(state)[0];
  assert.equal(row.overtimeTier1Hours, 1);
  assert.equal(row.baseHours, 9.25);
  assert.equal(row.guaranteeHours, 1.25);
  assert.equal(validateState({...state, entries: [{...state.entries[0], normalStart: '', normalEnd: ''}]}).ok, false);
});

test('calendar rest plans reclassify previously saved work and keep all normal accord days available', () => {
  const state = fixture({restDayOvertimeRule: 'tier2'});
  state.plans = [restPlan()];
  state.entries = [work({end: '12:15', restDay: false})];
  assert.equal(isPlannedRestDay(state, 'job', '2026-11-09'), true);
  assert.equal(isPlannedRestDay(state, 'other', '2026-11-09'), false);
  const row = calculateAll(state)[0];
  assert.equal(row.baseHours, 0);
  assert.equal(row.guaranteeHours, 0);
  assert.equal(row.dayIndex, null);
  assert.equal(row.overtimeTier2Hours, 6.25);
  assert.equal(row.grossPay, 1926.88);
  state.plans = [];
  assert.equal(calculateAll(state)[0].baseHours, 9.25);
});

test('recurring rest plans and split shifts use the same effective day classification', () => {
  const state = fixture({restDayOvertimeRule: 'first3'});
  const plan = restPlan({from: '2026-11-01', to: '2026-11-30', weekdays: [1]});
  delete plan.date;
  state.plans = [plan];
  state.entries = [work({id: 'first', end: '08:00', restDay: false}), work({id: 'second', start: '10:00', end: '14:00', restDay: true})];
  assert.equal(validateState(state).ok, true, validateState(state).errors.join('\n'));
  assert.deepEqual(validateEntry(state.entries[1], state), []);
  const total = summarize(calculateAll(state));
  assert.equal(total.baseHours, 0);
  assert.equal(total.overtimeTier1Hours, 3);
  assert.equal(total.overtimeTier2Hours, 3);
  assert.equal(isPlannedRestDay(state, 'job', '2026-12-07'), false);
  assert.equal(isPlannedRestDay(state, 'job', '2026-11-10'), false);
});

test('a fixed overnight shift uses the planned rest date of its normal workday', () => {
  const state = fixture({restDayOvertimeRule: 'tier2'});
  state.plans = [restPlan({date: '2026-11-10'})];
  state.entries = [work({start: '23:00', end: '04:00', overtimeBasis: 'fixedSchedule', normalDate: '2026-11-10', normalStart: '06:00', normalEnd: '15:15'})];
  assert.equal(validateState(state).ok, true, validateState(state).errors.join('\n'));
  const row = calculateAll(state)[0];
  assert.equal(row.baseHours, 0);
  assert.equal(row.guaranteeHours, 0);
  assert.equal(row.overtimeTier2Hours, 5);
});

test('unconfirmed weekday-rest rate allocation requests review, Sunday stays highest rate', () => {
  const state = fixture();
  state.plans = [restPlan()];
  state.entries = [work({end: '12:15'})];
  const rest = calculateAll(state)[0];
  assert.equal(rest.overtimeHours, 6.25);
  assert.equal(rest.overtimeAllocationMode, 'needsReview');
  assert.match(rest.overtimeWarnings.join(' '), /satsfordelingen/);
  state.entries = [work({date: '2026-11-15', end: '12:15'})];
  assert.equal(calculateAll(state)[0].overtimeTier2Hours, 6.25);
});

test('earlier ATL entries on a Sunday also pay the highest tier without an accord guarantee', () => {
  const state = fixture();
  const entry = work({date: '2026-11-15', end: '11:00'});
  delete entry.overtimeBasis;
  state.entries = [entry];
  const row = calculateAll(state)[0];
  assert.equal(row.baseHours, 0);
  assert.equal(row.overtimeHours, 5);
  assert.equal(row.overtimeTier2Hours, 5);
  assert.equal(row.overtimeAllocationMode, 'automatic');
  assert.deepEqual(row.overtimeWarnings, []);
});

test('an explicitly chosen rest-day rate rule also applies to older saved rest-day entries', () => {
  const state = fixture({restDayOvertimeRule: 'first3'});
  const entry = work({restDay: true, end: '11:00'});
  delete entry.overtimeBasis;
  state.entries = [entry];
  const split = calculateAll(state)[0];
  assert.equal(split.overtimeTier1Hours, 3);
  assert.equal(split.overtimeTier2Hours, 2);
  assert.equal(split.overtimeAllocationMode, 'automatic');
  state.jobs[0].restDayOvertimeRule = 'tier2';
  const allHigh = calculateAll(state)[0];
  assert.equal(allHigh.overtimeTier2Hours, 5);
  assert.deepEqual(allHigh.overtimeWarnings, []);
  state.entries[0].overtimeTier2Minutes = 60;
  assert.equal(calculateAll(state)[0].overtimeTier2Hours, 1);
});

test('sickness is visible as its own paid-hours and wage amount within the period', () => {
  const state = fixture();
  state.entries = [{id: 'sick', jobId: 'job', date: '2026-11-10', scheme: '4', type: 'sick'}];
  const summary = summarize(calculateAll(state));
  assert.equal(summary.sickDays, 1);
  assert.equal(summary.sickHours, 9.25);
  assert.equal(summary.sickPaidHours, 9.25);
  assert.equal(summary.sickPay, 1839.83);
  assert.equal(summary.actualHours, 0);
  assert.equal(summary.normalWorkPay, 0);
  state.plans = [restPlan({date: '2026-11-10'})];
  assert.equal(summarize(calculateAll(state)).sickPay, 0);
});

test('the five-day daily overtime limit follows the configured contract hours and supports earlier settings', () => {
  const state = fixture({weekdayHours: 7.5, fridayHours: 7});
  state.entries = [work({scheme: '5', end: '14:00'})];
  assert.equal(validateState(state).ok, true);
  assert.equal(calculateAll(state)[0].baseHours, 7.5);
  assert.equal(calculateAll(state)[0].overtimeHours, .5);
  state.entries[0].date = '2026-11-13';
  assert.equal(calculateAll(state)[0].baseHours, 7);
  assert.equal(calculateAll(state)[0].overtimeHours, 1);
  delete state.jobs[0].weekdayHours;
  state.entries[0].date = '2026-11-09';
  assert.equal(calculateAll(state)[0].baseHours, 7.4);
  for (const weekdayHours of [-1, 0, 25, '7.5']) {
    assert.equal(validateState({...state, jobs: [{...state.jobs[0], weekdayHours}]}).ok, false);
  }
});

test('actual payroll records preserve payslip øre and optional illness without guessing from year-to-date values', () => {
  const state = fixture();
  const slip = {id: 'pay-1', jobId: 'job', periodStart: '2026-10-26', periodEnd: '2026-11-08', payday: '2026-11-12',
    grossPay: 10876.54, netPay: 7890.12, notes: 'Ferieberettiget løn som sammenligningsgrundlag'};
  state.payslips = [slip];
  const checked = validateState(JSON.parse(JSON.stringify(state)));
  assert.equal(checked.ok, true, checked.errors.join('\n'));
  assert.deepEqual(checked.state.payslips, [slip]);
  for (const invalid of [{...slip, netPay: -1}, {...slip, periodEnd: '2026-10-01'}, {...slip, jobId: 'other'}, {...slip, sickHours: '9.25'}]) {
    assert.equal(validateState({...state, payslips: [invalid]}).ok, false);
  }
  assert.equal(validateState({...state, payslips: [slip, {...slip, id: 'other'}]}).ok, false);
  assert.equal(validateState({...state, payslips: []}).ok, true);
  delete state.payslips;
  assert.equal(validateState(state).ok, true);
});
