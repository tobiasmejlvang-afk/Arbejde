import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyState, calculateAll, payPeriod, money, hours, validateState} from './domain.js';
import {renderPeriodSummary, renderCalendar, bindPanels} from './panels.js';
import {renderWageWorkspace} from './experience.js';

const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));

function context() {
  const state = emptyState();
  const job = state.jobs[0];
  Object.assign(job, {id: 'period-job', name: 'Example', scheme: '4', hourlyRate: 200, sickPayPercent: 100, periodType: '14days', periodAnchor: '2026-11-02'});
  state.settings.defaultJobId = job.id;
  const range = payPeriod(job, '2026-11-03');
  return {state, job, range, calendarDate: '2026-11-03', periodDate: '2026-11-03', periodMode: 'pay', jobFilter: job.id, rows: [], calcs: [], escape, icon: () => '', render() {}, toasts: [], toast(message) { this.toasts.push(message); }, save() { return true; }};
}

test('calendar work chips show the actual truck with complete accessible times and escaped vehicle text', () => {
  const ctx = context();
  const longVehicle = 'Et langt arbejdssted med <special>&tegn '.repeat(2);
  const entry = {id: 'vehicle-day', jobId: ctx.job.id, type: 'work', date: '2026-11-03', scheme: '4', start: '06:00', end: '14:00', breakMinutes: 0, vehicle: '73', crew: 'Alene', empties: 0, waste: [], extras: []};
  ctx.state.entries = [entry, {...entry, id: 'named-vehicle-day', date: '2026-11-04', vehicle: longVehicle}];
  ctx.calcs = calculateAll(ctx.state);
  const html = renderCalendar(ctx);
  const numericChip = html.match(/<button[^>]*data-id="vehicle-day"[^>]*>[\s\S]*?<\/button>/)?.[0];
  assert.ok(numericChip, 'the registered workday is present');
  assert.match(numericChip, /calendar-chip-compact" aria-hidden="true">V73<\/span>/);
  assert.match(numericChip, /calendar-entry-vehicle">Vogn 73<\/small>/);
  assert.match(numericChip, /aria-label="[^\"]*06:00–14:00[^\"]*Vogn 73/);
  assert.match(numericChip, /data-panel-action="edit-entry"/);
  const namedChip = html.match(/<button[^>]*data-id="named-vehicle-day"[^>]*>[\s\S]*?<\/button>/)?.[0];
  assert.ok(namedChip.includes(escape(longVehicle.trim())));
  assert.ok(!namedChip.includes('<special>'));
  assert.match(namedChip, /calendar-chip-compact" aria-hidden="true">Vagt<\/span>/);
});

function harness(t) {
  const ctx = context();
  const previousDocument = globalThis.document;
  let buttons = [];
  const fileInput = {addEventListener(name, callback) { this[name] = callback; }};
  globalThis.document = {
    querySelector: selector => selector === '#payslips-file' ? fileInput : null,
    querySelectorAll: selector => selector === '[data-panel-action]' ? buttons : []
  };
  t.after(() => { globalThis.document = previousDocument; });
  ctx.modal = (title, html, submit) => { ctx.dialog = {title, html, submit}; };
  ctx.showConfirm = (title, description, submit) => { ctx.confirmation = {title, description, submit}; };
  ctx.openEntry = (id, preset) => { ctx.openedEntry = {id, preset}; };
  const act = (panelAction, rest = {}) => {
    const button = {dataset: {panelAction, ...rest}, addEventListener(name, callback) { this[name] = callback; }};
    buttons = [button];
    bindPanels(ctx);
    button.click();
  };
  const data = values => {
    const form = new FormData();
    for (const [key, value] of Object.entries(values)) form.set(key, value);
    return form;
  };
  return {ctx, act, data, fileInput};
}

test('calendar shows the recorded Timemap duration when minute-rounded clock times differ', () => {
  const ctx = context();
  ctx.state.entries = [{id: 'source-duration', jobId: ctx.job.id, type: 'work', date: '2026-11-03', scheme: '4', start: '06:00', end: '14:00', breakMinutes: 0, recordedWorkMinutes: 479, workTimeSource: 'timemap', vehicle: '42', crew: 'Alene', empties: 0, waste: [], extras: []}];
  ctx.calcs = calculateAll(ctx.state);
  const html = renderCalendar(ctx);
  const chip = html.match(/<button[^>]*data-id="source-duration"[^>]*>[\s\S]*?<\/button>/)[0];
  assert.equal(ctx.calcs[0].actualHours, 479 / 60);
  assert.ok(chip.includes(`<small>${hours(479 / 60)} t. · Timemap</small>`));
  assert.ok(chip.includes(`Arbejdstid fra Timemap: ${hours(479 / 60)} timer`));
  assert.ok(chip.includes('06:00–14:00'), 'the source clocks remain visible alongside the recorded net duration');
  assert.ok(!chip.includes(`<small>${hours(8)} t.`), 'clock subtraction must not replace the recorded Timemap duration');
});

test('selected payroll summary keeps sickness, estimates and recorded net payouts in their own period and job', () => {
  const ctx = context();
  ctx.state.entries = [{id: 'sick-day', jobId: ctx.job.id, date: '2026-11-03', type: 'sick', scheme: '4', notes: ''}];
  ctx.state.payslips = [
    {id: 'selected-slip', jobId: ctx.job.id, periodStart: ctx.range.start, periodEnd: ctx.range.end, payday: ctx.range.payday, grossPay: 18000, netPay: 11111.11},
    {id: 'other-slip', jobId: 'other-job', periodStart: ctx.range.start, periodEnd: ctx.range.end, payday: ctx.range.payday, grossPay: 23000, netPay: 22222.22},
    {id: 'older-slip', jobId: ctx.job.id, periodStart: '2026-10-19', periodEnd: '2026-11-01', payday: '2026-11-08', grossPay: 5000, netPay: 3333.33}
  ];
  ctx.calcs = ctx.rows = calculateAll(ctx.state);
  const html = renderPeriodSummary(ctx);
  assert.match(html, /1 dag/);
  assert.ok(html.includes(money(1850)), 'calculated sick pay is visible');
  assert.ok(html.includes(money(11111.11)), 'actual net pay is visible');
  assert.ok(!html.includes(money(22222.22)), 'other jobs are excluded');
  assert.ok(!html.includes(money(3333.33)), 'other pay periods are excluded');
  assert.match(html, /Udbetalt efter skat/);
  assert.match(html, /Ferieberettiget løn/);
  assert.match(html, /Sammenligning af lønperioden/);
  assert.ok(html.includes(money(-16150)), 'comparison uses this period and this job only');
  const wage = renderWageWorkspace(ctx);
  assert.ok(wage.includes('Sygeløn'));
  assert.ok(wage.includes('data-panel-action="new-payslip"'));
  ctx.periodMode = 'month';
  ctx.range = {start: '2026-11-01', end: '2026-11-30'};
  assert.ok(!renderPeriodSummary(ctx).includes('Sammenligning af lønperioden'), 'month mode does not compare different earning periods');
});

test('recording and editing a payout validates the full dataset, prevents duplicates and restores failed saves', t => {
  const {ctx, act, data} = harness(t);
  act('new-payslip');
  const values = {jobId: ctx.job.id, periodStart: ctx.range.start, periodEnd: ctx.range.end, payday: ctx.range.payday, grossPay: 18000, netPay: 12000, baseHours: 60, overtimeTier1Hours: 4, overtimeTier2Hours: 0};
  assert.match(ctx.dialog.html, /name="baseHours"/);
  assert.match(ctx.dialog.html, /name="overtimeTier2Hours"/);
  ctx.save = () => false;
  assert.equal(ctx.dialog.submit(data(values)), false);
  assert.equal(ctx.state.payslips?.length || 0, 0);
  ctx.save = () => true;
  assert.equal(ctx.dialog.submit(data(values)), true);
  assert.equal(ctx.state.payslips.length, 1);
  assert.equal(ctx.state.payslips[0].baseHours, 60);
  assert.equal(ctx.state.payslips[0].overtimeTier1Hours, 4);
  assert.equal(ctx.state.payslips[0].overtimeTier2Hours, 0);
  assert.equal(validateState(ctx.state).ok, true);
  act('new-payslip');
  assert.equal(ctx.dialog.submit(data(values)), false);
  assert.equal(ctx.state.payslips.length, 1);
  const id = ctx.state.payslips[0].id;
  act('edit-payslip', {id});
  assert.equal(ctx.dialog.submit(data({...values, netPay: 12500})), true);
  assert.equal(ctx.state.payslips[0].id, id);
  assert.equal(ctx.state.payslips[0].netPay, 12500);
  act('delete-job', {id: ctx.job.id});
  assert.equal(ctx.confirmation, undefined, 'a job linked to a payment cannot be deleted');
  assert.match(ctx.toasts.at(-1), /lønudbetalinger/);
});

test('wage lines emphasize hours and include overtime base once while sickness and supplements stay separate', () => {
  const ctx = context();
  Object.assign(ctx.job, {overtimeRule: 'manual', overtimeRateType: 'supplement', overtimeRate: 40, overtimeRate2: 100});
  ctx.state.entries = [
    {id: 'work', jobId: ctx.job.id, type: 'work', date: '2026-11-03', scheme: '4', start: '06:00', end: '17:30', breakMinutes: 0, overtimeTier2Minutes: 60, vehicle: '', crew: 'Alene', empties: 0, waste: [], extras: []},
    {id: 'sick', jobId: ctx.job.id, type: 'sick', date: '2026-11-04', scheme: '4'}
  ];
  ctx.rows = ctx.calcs = calculateAll(ctx.state);
  const html = renderPeriodSummary(ctx);
  const line = key => html.match(new RegExp(`<div data-pay-line="${key}">([\\s\\S]*?)<\\/div>`))[1];
  assert.ok(line('baseHours').includes(`<strong>${hours(11.5)} t.</strong><small>${money(2300)}</small>`), 'normal wage line includes overtime base but excludes sickness');
  assert.ok(line('sickHours').includes(`<strong>${hours(9.25)} t.</strong><small>${money(1850)}</small>`));
  assert.ok(line('overtimeTier1Hours').includes(`<strong>${hours(1.25)} t.</strong><small>${money(50)}</small>`), 'supplement amount excludes its base wage');
  assert.ok(line('overtimeTier2Hours').includes(`<strong>${hours(1)} t.</strong><small>${money(100)}</small>`));
  assert.ok(html.includes(`<dt>Betalte timer i alt</dt><dd><strong>${hours(20.75)} t.</strong>`), 'supplement hours are not added again to paid hours');
  assert.ok(html.includes(`<dt>Brutto i alt</dt><dd>${money(4300)}</dd>`));
  const workspace = renderWageWorkspace(ctx);
  assert.ok(workspace.includes(`<div class="gross-hour-total">${hours(20.75)} <span>timer</span>`));
  assert.ok(workspace.includes(`<span>Normal løn<b>${hours(11.5)} t.</b><small>${money(2300)}</small>`));
  assert.ok(workspace.includes(`<span>Overtidstillæg · sats 1<b>${hours(1.25)} t.</b><small>${money(50)}</small>`));
});

test('payslip hour comparisons preserve zero and avoid showing partial legacy hours as complete totals', () => {
  const ctx = context();
  const slip = {id: 'first', jobId: ctx.job.id, periodStart: ctx.range.start, periodEnd: '2026-11-08', payday: ctx.range.payday, grossPay: 3000, netPay: 2000, baseHours: 12, sickHours: 0, overtimeTier1Hours: 2, overtimeTier2Hours: 0};
  ctx.state.payslips = [slip];
  const row = (html, key) => html.match(new RegExp(`<tr data-pay-hours="${key}">([\\s\\S]*?)<\\/tr>`))[1];
  let html = renderPeriodSummary(ctx);
  assert.ok(row(html, 'baseHours').includes(`<td>${hours(12)} t.</td>`));
  assert.ok(row(html, 'overtimeTier2Hours').includes(`<td>${hours(0)} t.</td>`));
  assert.ok(!row(html, 'overtimeTier2Hours').includes('Ikke oplyst'), 'recorded zero is an actual quantity');
  ctx.state.payslips.push({...slip, id: 'legacy', periodStart: '2026-11-09', periodEnd: ctx.range.end, baseHours: 5, overtimeTier1Hours: undefined});
  html = renderPeriodSummary(ctx);
  assert.ok(row(html, 'baseHours').includes(`<td>${hours(17)} t.</td>`));
  assert.match(row(html, 'overtimeTier1Hours'), /<td>Ikke oplyst<\/td>/);
  assert.ok(!row(html, 'overtimeTier1Hours').includes(`<td>${hours(2)} t.</td>`), 'incomplete field sums must not look like the full period');
});

test('a partial first payslip is included within its normal pay period while a boundary-spanning slip is excluded', () => {
  const ctx = context();
  ctx.state.payslips = [
    {id: 'partial-first', jobId: ctx.job.id, periodStart: '2026-11-05', periodEnd: ctx.range.end, payday: ctx.range.payday, grossPay: 6000, netPay: 4444.44},
    {id: 'outside-period', jobId: ctx.job.id, periodStart: '2026-10-31', periodEnd: ctx.range.end, payday: ctx.range.payday, grossPay: 8000, netPay: 5555.55}
  ];
  const html = renderPeriodSummary(ctx);
  assert.ok(html.includes(money(4444.44)));
  assert.ok(!html.includes(money(5555.55)));
  assert.match(html, /Sammenligning af lønperioden/);
});

test('calendar rest-day mode saves a reusable editable marker and reclassifies existing work as overtime', t => {
  const {ctx, act, data} = harness(t);
  ctx.state.entries = [{id: 'work-on-day', jobId: ctx.job.id, date: '2026-11-03', type: 'work', scheme: '4', start: '06:00', end: '11:00', breakMinutes: 0, vehicle: '', route: '', waste: [], empties: 0, crew: 'Alene', extras: [], notes: ''}];
  act('calendar-off-mode');
  assert.match(renderCalendar(ctx), /calendar-off-mode" aria-pressed="true"/);
  act('calendar-add', {date: '2026-11-03'});
  assert.equal(ctx.dialog.title, 'Ugentlig fridag');
  const form = data({date: '2026-11-03', jobId: ctx.job.id, scheme: '4'});
  ctx.save = () => false;
  assert.equal(ctx.dialog.submit(form), false);
  assert.equal(ctx.state.plans.length, 0);
  ctx.save = () => true;
  assert.equal(ctx.dialog.submit(form), true);
  assert.equal(ctx.state.plans.length, 1);
  assert.equal(ctx.state.plans[0].restDay, true);
  assert.equal(calculateAll(ctx.state)[0].overtimeHours, 5);
  assert.equal(calculateAll(ctx.state)[0].baseHours, 0);
  assert.match(renderCalendar(ctx), /Ugentlig fridag/);
  assert.equal(ctx.dialog.submit(form), false);
  assert.equal(ctx.state.plans.length, 1);
  act('calendar-work-mode');
  act('calendar-add', {date: '2026-11-03'});
  assert.equal(ctx.openedEntry.preset.type, 'work');
});

test('payout file review imports once, rejects changed amounts or hours and handles malformed rows', async t => {
  const {ctx, act, data, fileInput} = harness(t);
  act('new-payslip');
  const item = {id: 'source-slip', periodStart: ctx.range.start, periodEnd: ctx.range.end, payday: ctx.range.payday, grossPay: 18000, netPay: 12000, baseHours: 60, overtimeTier1Hours: 4, overtimeTier2Hours: 0};
  const read = async rows => {
    const file = new File([JSON.stringify({kind: 'arbejde-payslips', version: 1, payslips: rows})], 'payouts.json', {type: 'application/json'});
    await fileInput.change({target: {files: [file], value: 'selected'}});
  };
  await read([item]);
  assert.equal(ctx.dialog.title, 'Gennemgå lønudbetalinger');
  assert.equal(ctx.state.payslips?.length || 0, 0, 'review happens before saving');
  assert.equal(ctx.dialog.submit(data({jobId: ctx.job.id})), true);
  assert.equal(ctx.state.payslips.length, 1);
  await read([item]);
  assert.equal(ctx.dialog.submit(data({jobId: ctx.job.id})), true);
  assert.equal(ctx.state.payslips.length, 1, 'repeat import is idempotent');
  await read([{...item, netPay: 12500}]);
  assert.equal(ctx.dialog.submit(data({jobId: ctx.job.id})), false);
  assert.equal(ctx.state.payslips[0].netPay, 12000, 'conflicting amounts are preserved');
  await read([{...item, overtimeTier1Hours: 5}]);
  assert.equal(ctx.dialog.submit(data({jobId: ctx.job.id})), false);
  assert.equal(ctx.state.payslips[0].overtimeTier1Hours, 4, 'conflicting hours are preserved');
  const before = ctx.dialog;
  await read([null]);
  assert.equal(ctx.dialog, before);
  assert.match(ctx.toasts.at(-1), /Vælg en fil/);
});
