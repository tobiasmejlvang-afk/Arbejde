import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyState, calculateAll, payPeriod, money, validateState} from './domain.js';
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
  const values = {jobId: ctx.job.id, periodStart: ctx.range.start, periodEnd: ctx.range.end, payday: ctx.range.payday, grossPay: 18000, netPay: 12000};
  ctx.save = () => false;
  assert.equal(ctx.dialog.submit(data(values)), false);
  assert.equal(ctx.state.payslips?.length || 0, 0);
  ctx.save = () => true;
  assert.equal(ctx.dialog.submit(data(values)), true);
  assert.equal(ctx.state.payslips.length, 1);
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

test('payout file review imports once, rejects changed amounts and handles malformed rows', async t => {
  const {ctx, act, data, fileInput} = harness(t);
  act('new-payslip');
  const item = {id: 'source-slip', periodStart: ctx.range.start, periodEnd: ctx.range.end, payday: ctx.range.payday, grossPay: 18000, netPay: 12000};
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
  const before = ctx.dialog;
  await read([null]);
  assert.equal(ctx.dialog, before);
  assert.match(ctx.toasts.at(-1), /Vælg en fil/);
});
