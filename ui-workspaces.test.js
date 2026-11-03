import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyState, defaultJob, calculateAll, monthRange, money, validateState} from './domain.js';
import {emptyDirectory} from './directory-domain.js';
import {renderDirectory, bindDirectory} from './directory-ui.js';
import {renderOverview, renderStatisticsWorkspace, renderAbsenceWorkspace, renderExportWorkspace, periodToolbar} from './experience.js';

const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));

function workspaceContext() {
  const state = emptyState();
  const a = defaultJob({id:'job-a', name:'Example A', scheme:'5', hourlyRate:100, choicePercent:10, periodType:'14days', periodAnchor:'2026-11-02'});
  const b = defaultJob({id:'job-b', name:'Example B', scheme:'5', hourlyRate:300, choicePercent:50});
  state.jobs = [a, b]; state.settings.defaultJobId = a.id;
  const entry = (id, jobId, date, waste) => ({id, jobId, date, type:'work', scheme:'5', start:'08:00', end:'10:00', breakMinutes:0, vehicle:'', route:'', crew:'Alene', empties:1, waste:[waste], extras:[], notes:''});
  state.entries = [entry('a-now', a.id, '2026-11-03', 'Mad'), entry('a-later', a.id, '2026-11-20', 'Rest'), entry('b-now', b.id, '2026-11-03', 'Glas'), entry('a-old', a.id, '2026-06-02', 'Metal')];
  assert.equal(validateState(state).ok,true,'workspace fixture is a valid app dataset');
  const calcs = calculateAll(state), range = monthRange('2026-11-03');
  return {state, calcs, range, periodDate:'2026-11-03', periodMode:'month', jobFilter:'', job:a, rows:calcs.filter(row=>row.entry.date>=range.start&&row.entry.date<=range.end), escape, icon:()=>'', entryTable:()=>'<table data-test="entries"></table>', types:{work:'Arbejdsdag', holiday:'Ferie', off:'Fridag', sick:'Sygdom', freeHoliday:'Feriefridag', absence:'Fraværsdag'}};
}

test('payday card uses its own job and pay period while overview totals remain month-wide', () => {
  const ctx = workspaceContext();
  const html = renderOverview(ctx), card = html.match(/<aside class="card payday-card">([\s\S]*?)<\/aside>/)[1];
  assert.ok(card.includes('Example A'));
  assert.ok(card.includes(money(20)), 'choice savings from job A in its fortnight');
  assert.ok(!card.includes(money(340)), 'must not use all month/all job choice savings');
  assert.ok(!card.includes(money(40)), 'must not include the later fortnight of job A');
  assert.ok(html.includes(money(1000)), 'monthly overview still includes both jobs');
});

test('statistics honors the selected historical month and job, with waste counts limited to the shown period', () => {
  const ctx = workspaceContext();
  ctx.jobFilter = 'job-a';
  ctx.periodDate = '2026-06-15'; ctx.range = monthRange(ctx.periodDate);
  ctx.rows = ctx.calcs.filter(row=>row.entry.jobId==='job-a'&&row.entry.date>=ctx.range.start&&row.entry.date<=ctx.range.end);
  const html = renderStatisticsWorkspace(ctx);
  assert.ok(html.includes('januar 2026'));
  assert.ok(html.includes('juni 2026'));
  assert.ok(!html.includes('november 2026'));
  assert.ok(html.includes(`<td>${money(200)}`));
  assert.ok(html.includes('<span>Metal</span><b>1</b>'));
  assert.ok(html.includes('<span>Glas</span><b>0</b>'));
  assert.ok(html.includes('id="overview-job"'));
});

test('period controls expose selected state and absence/export empty states describe the correct workflow', () => {
  const ctx = workspaceContext();
  assert.match(periodToolbar(ctx), /data-period="month" aria-pressed="true"/);
  assert.match(periodToolbar(ctx), /data-period="pay" aria-pressed="false"/);
  assert.ok(renderAbsenceWorkspace(ctx).includes('Ingen fraværsregistreringer'));
  const exports = renderExportWorkspace(ctx);
  assert.ok(exports.includes('under Registreringer'));
  assert.ok(exports.includes('timer, som endnu ikke er gemt'));
  assert.ok(exports.includes('data-panel-action="backup"'));
  assert.ok(exports.includes('id="backup-file"'));
});

function directoryHarness(t, saveResult = true) {
  const previousDocument = globalThis.document;
  t.after(()=>{globalThis.document=previousDocument;});
  const state = emptyState(); state.directory = emptyDirectory(); state.vehicles = ['existing'];
  const calls = {toasts:[], closes:0, saves:0, renders:0, confirmations:[], focused:[], links:[]};
  const buttons = ['vehicles','people','issues'].map(tab=>({dataset:{directoryAction:'tab',tab},focus(){calls.focused.push(tab);}}));
  buttons.push(...['add-person','add-vehicle','export'].map(directoryAction=>({dataset:{directoryAction}})));
  const input = {isConnected:true};
  const nodes = new Map([['#directory-file', input], ...buttons.filter(button=>button.dataset.tab).map(button=>['#directory-tab-'+button.dataset.tab,button])]);
  globalThis.document = {
    querySelector:selector=>nodes.get(selector)||null,
    querySelectorAll:selector=>selector==='[data-directory-action]'?buttons:[],
    body:{appendChild(link){link.attached=true;}},
    createElement:()=>({attached:false,click(){assert.equal(this.attached,true);calls.links.push(this);},remove(){this.attached=false;}})
  };
  let modal;
  const ctx = {state,escape,toast:message=>calls.toasts.push(message),closeModal(){calls.closes++;},save(){calls.saves++;ctx.render();return saveResult;},render(){calls.renders++;},modal(title,html,submit){modal={title,html,submit};},showConfirm(title,description,submit){calls.confirmations.push({title,description,submit});}};
  bindDirectory(ctx);
  return {ctx,calls,buttons,input,modal:()=>modal,action:name=>buttons.find(button=>button.dataset.directoryAction===name)};
}

test('failed register persistence rolls back data and keeps the edit dialog open without a success toast', t => {
  const h = directoryHarness(t, false), before = structuredClone(h.ctx.state);
  h.action('add-person').onclick();
  const form = new FormData(); form.set('name','Example Person');
  assert.equal(h.modal().submit(form),false);
  assert.deepEqual(h.ctx.state,before);
  assert.equal(h.calls.closes,0);
  assert.equal(h.calls.saves,1);
  assert.ok(h.calls.toasts.some(message=>message.includes('ikke gemt')));
  assert.ok(!h.calls.toasts.includes('Kollegaen er tilføjet.'));
});

test('successful register import preserves jobs and work data and download contains a valid independent register', async t => {
  const h = directoryHarness(t), before = structuredClone(h.ctx.state);
  const directory = emptyDirectory();
  directory.vehicles.push({id:'sample-vehicle',number:'example-vehicle',registrationNumber:'',makeModel:'',description:'',driverIds:[],requiresVerification:false,sourcePage:0,sourceHighlight:null,notes:''});
  const file = new File([JSON.stringify({kind:'arbejde-directory',version:1,directory})],'register.json',{type:'application/json'});
  await h.input.onchange({target:{files:[file],value:'selected'}});
  assert.equal(h.calls.confirmations.length,1);
  assert.equal(h.calls.confirmations[0].submit(),true);
  for (const key of ['jobs','entries','plans','routes','settings']) assert.deepEqual(h.ctx.state[key],before[key]);
  assert.ok(h.ctx.state.vehicles.includes('existing'));
  assert.ok(h.ctx.state.vehicles.includes('example-vehicle'));
  h.action('export').onclick();
  assert.equal(h.calls.links.length,1);
  const exported = await (await fetch(h.calls.links[0].href)).json();
  assert.equal(exported.kind,'arbejde-directory');
  assert.deepEqual(exported.directory,h.ctx.state.directory);
  assert.ok(!Object.hasOwn(exported,'jobs'));
});

test('a slow older register file cannot replace the newest import selection', async t => {
  const h = directoryHarness(t);
  let finishFirst;
  const first = h.input.onchange({target:{files:[{size:100,text:()=>new Promise(resolve=>{finishFirst=resolve;})}],value:'first'}});
  const next = {kind:'arbejde-directory',version:1,directory:emptyDirectory()};
  await h.input.onchange({target:{files:[new File([JSON.stringify(next)],'second.json')],value:'second'}});
  assert.equal(h.calls.confirmations.length,1);
  finishFirst(JSON.stringify(next)); await first;
  assert.equal(h.calls.confirmations.length,1);
  await h.input.onchange({target:{files:[new File(['null'],'null.json')],value:'null'}});
  assert.ok(h.calls.toasts.at(-1).includes('arbejde-directory'));
});

test('register tabs keep focus and support arrow/Home/End navigation after repeated binding', t => {
  const h = directoryHarness(t);
  bindDirectory(h.ctx);
  const vehicles = h.buttons.find(button=>button.dataset.tab==='vehicles');
  vehicles.onclick();
  let prevented = false;
  vehicles.onkeydown({key:'ArrowRight',preventDefault(){prevented=true;}});
  assert.equal(prevented,true);
  assert.equal(h.calls.focused.at(-1),'people');
  assert.match(renderDirectory(h.ctx),/id="directory-tab-people"[^>]*aria-selected="true" tabindex="0"/);
  const people=h.buttons.find(button=>button.dataset.tab==='people');
  people.onkeydown({key:'End',preventDefault(){}});
  assert.equal(h.calls.focused.at(-1),'issues');
});
