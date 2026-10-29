import { defaultJob, uid, todayISO, addDays, payPeriod, money, hours, validateState } from './domain.js';

const typeLabels = { work: 'Arbejdsdag', sick: 'Sygdom', off: 'Fridag', holiday: 'Ferie', freeHoliday: 'Feriefridag', absence: 'Fravær' };
const weekdays = ['Mandag', 'Tirsdag', 'Onsdag', 'Torsdag', 'Fredag', 'Lørdag', 'Søndag'];
const ui = { month: null, work: { query: '', job: '', type: '', month: '' } };
const safeDate = value => new Date(`${String(value).slice(0, 10)}T12:00:00`);
const isoDate = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const schemeLabel = scheme => Number(scheme) === 3 ? '3 dage · 12,33 t/dag' : Number(scheme) === 4 ? '4 dage · 9,25 t/dag' : '5 dage · 7,4 / 7,0 t';
const attr = (ctx, value) => ctx.escape(String(value ?? ''));
const selected = (a, b) => String(a ?? '') === String(b ?? '') ? ' selected' : '';
const checked = value => value ? ' checked' : '';
const getJob = (ctx, id) => ctx.state.jobs.find(job => job.id === id);
const jobName = (ctx, id) => getJob(ctx, id)?.name || 'Intet job';
const dateText = value => value ? safeDate(value).toLocaleDateString('da-DK', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
const number = value => Number.isFinite(Number(value)) ? Number(value) : 0;
const rowsFor = ctx => (ctx.calcs || []).map(row => row.entry ? row : { entry: row, actualHours: 0, overtimeHours: 0, grossPay: 0 });

function field(ctx, label, name, value = '', options = {}) {
  const { type = 'text', required = false, min, max, step, hint, full = false, placeholder = '' } = options;
  return `<label class="field${full ? ' full' : ''}"><span>${label}</span><input name="${name}" type="${type}" value="${attr(ctx, value)}"${required ? ' required' : ''}${min !== undefined ? ` min="${min}"` : ''}${max !== undefined ? ` max="${max}"` : ''}${step !== undefined ? ` step="${step}"` : ''}${placeholder ? ` placeholder="${attr(ctx, placeholder)}"` : ''}>${hint ? `<small class="field-hint muted">${hint}</small>` : ''}</label>`;
}

function selectField(ctx, label, name, value, options, full = false) {
  return `<label class="field${full ? ' full' : ''}"><span>${label}</span><select name="${name}">${options.map(([key, text]) => `<option value="${attr(ctx, key)}"${selected(value, key)}>${attr(ctx, text)}</option>`).join('')}</select></label>`;
}

function schemeField(ctx, value) {
  return selectField(ctx, 'Arbejdsuge', 'scheme', value, [[3, '3 dage · akkord · 12,33 timer pr. dag'], [4, '4 dage · akkord · 9,25 timer pr. dag'], [5, '5 dage · timeløn · 7,4 / 7,0 timer']]);
}

function download(filename, content, type) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function calendarMonth(ctx) {
  const incoming = ctx.calendarDate instanceof Date ? isoDate(ctx.calendarDate) : ctx.calendarDate;
  const value = ui.month || incoming || todayISO();
  const date = safeDate(value);
  return new Date(date.getFullYear(), date.getMonth(), 1, 12);
}

function plansOn(ctx, date) {
  const weekday = safeDate(date).getDay() || 7;
  return (ctx.state.plans || []).filter(plan => plan.date ? plan.date === date : date >= plan.from && date <= plan.to && (plan.weekdays || []).map(Number).includes(weekday));
}

function paydaysIn(ctx, from, to) {
  const result = new Map();
  for (const job of ctx.state.jobs) {
    const found = new Set();
    // A payday can follow its pay period, so inspect preceding periods as well.
    for (let date = addDays(from, -75); date <= to; date = addDays(date, 7)) {
      const period = payPeriod(job, date);
      if (period?.payday && period.payday >= from && period.payday <= to && !found.has(period.payday)) {
        found.add(period.payday);
        if (!result.has(period.payday)) result.set(period.payday, []);
        result.get(period.payday).push(job);
      }
    }
  }
  return result;
}

export function renderCalendar(ctx) {
  const month = calendarMonth(ctx);
  const monthISO = isoDate(month);
  const first = addDays(monthISO, -((month.getDay() + 6) % 7));
  const last = addDays(first, 41);
  const paydays = paydaysIn(ctx, first, last);
  const byDate = new Map();
  for (const entry of ctx.state.entries) {
    if (!byDate.has(entry.date)) byDate.set(entry.date, []);
    byDate.get(entry.date).push(entry);
  }
  const calcMap = new Map(rowsFor(ctx).map(row => [row.entry.id, row]));
  const monthLabel = month.toLocaleDateString('da-DK', { month: 'long', year: 'numeric' });
  return `<div class="page-heading"><div><span class="section-label">DIN ARBEJDSPLAN</span><h1>Kalender</h1><p class="muted">Arbejdsdage, fravær og lønudbetalinger samlet ét sted.</p></div><button class="button primary" data-panel-action="new-plan">+ Tilføj arbejdsplan</button></div>
    <section class="card"><div class="panel-head calendar-head"><div class="toolbar"><button class="icon-button" aria-label="Forrige måned" data-panel-action="prev-month">‹</button><h2>${attr(ctx, monthLabel)}</h2><button class="icon-button" aria-label="Næste måned" data-panel-action="next-month">›</button></div><button class="button secondary" data-panel-action="current-month">I dag</button></div>
    <div class="calendar-legend"><span><i class="legend-dot"></i>Registreret</span><span><i class="legend-dot plan-dot"></i>Planlagt</span><span><i class="legend-dot payday-dot"></i>Løndag</span></div>
    <div class="calendar-scroll"><div class="calendar-weekdays">${weekdays.map(day => `<span>${day.slice(0, 3)}</span>`).join('')}</div><div class="calendar-grid">${Array.from({ length: 42 }, (_, index) => {
      const date = addDays(first, index);
      const entries = byDate.get(date) || [];
      const plans = plansOn(ctx, date).filter(plan => !entries.some(entry => entry.jobId === plan.jobId));
      const dailyPaydays = paydays.get(date) || [];
      const outside = date.slice(0, 7) !== monthISO.slice(0, 7);
      return `<div class="calendar-cell${outside ? ' outside' : ''}${date === todayISO() ? ' today' : ''}"><button class="calendar-day-number" data-panel-action="calendar-add" data-date="${date}" aria-label="Registrer ${attr(ctx, dateText(date))}">${safeDate(date).getDate()}</button>
        ${dailyPaydays.map(job => `<span class="calendar-chip calendar-payday" title="${attr(ctx, `Løndag · ${job.name}`)}"><span aria-hidden="true">●</span> Løndag</span>`).join('')}
        ${entries.map(entry => `<button class="calendar-chip calendar-entry ${entry.type === 'work' ? '' : 'calendar-absence'}" data-panel-action="edit-entry" data-id="${attr(ctx, entry.id)}" title="${attr(ctx, `${typeLabels[entry.type] || 'Registrering'} · ${jobName(ctx, entry.jobId)}`)}">${entry.type === 'work' ? `${attr(ctx, entry.start || '')}–${attr(ctx, entry.end || '')}<small>${attr(ctx, hours(calcMap.get(entry.id)?.actualHours || 0))}${number(calcMap.get(entry.id)?.overtimeHours) > 0 ? ' · OT' : ''}</small>` : attr(ctx, typeLabels[entry.type] || 'Fravær')}</button>`).join('')}
        ${plans.map(plan => `<button class="calendar-chip calendar-plan" data-panel-action="register-plan" data-id="${attr(ctx, plan.id)}" data-date="${date}" title="Opret registrering fra ${attr(ctx, plan.title || 'arbejdsplan')}">${attr(ctx, plan.start || 'Planlagt')}–${attr(ctx, plan.end || '')}<small>${attr(ctx, plan.title || jobName(ctx, plan.jobId))}</small></button>`).join('')}
      </div>`;
    }).join('')}</div></div><p class="muted field-hint">Tryk på en dato for at registrere, en registrering for at rette eller en plan for at bruge den som udgangspunkt. Lønningsdage følger dine jobindstillinger.</p></section>
    <section class="card"><div class="panel-head"><div><span class="section-label">PLANLÆGNING</span><h2>Arbejdsplaner</h2></div><button class="button secondary" data-panel-action="new-plan">+ Opret plan</button></div>${ctx.state.plans.length ? `<div class="table-wrap"><table class="data-table"><thead><tr><th>Plan</th><th>Periode</th><th>Arbejdsdage</th><th>Tid</th><th><span class="sr-only">Handlinger</span></th></tr></thead><tbody>${ctx.state.plans.map(plan => `<tr><td><strong>${attr(ctx, plan.title || 'Arbejdsplan')}</strong><small class="muted">${attr(ctx, jobName(ctx, plan.jobId))}</small></td><td>${plan.date ? dateText(plan.date) : `${dateText(plan.from)} – ${dateText(plan.to)}`}</td><td>${(plan.weekdays || [safeDate(plan.date).getDay() || 7]).map(day => weekdays[Number(day) - 1]?.slice(0, 3)).join(', ')}</td><td>${attr(ctx, plan.start)}–${attr(ctx, plan.end)}</td><td class="row-actions"><button class="button subtle" data-panel-action="edit-plan" data-id="${attr(ctx, plan.id)}">Ret</button><button class="button subtle danger" data-panel-action="delete-plan" data-id="${attr(ctx, plan.id)}">Slet</button></td></tr>`).join('')}</tbody></table></div>` : `<div class="empty-state"><span class="empty-icon" aria-hidden="true">▦</span><h3>Giv arbejdsugen en plan</h3><p>Vælg ugedage og arbejdstider. Planlagte dage vises i kalenderen og kan bruges til en registrering.</p><button class="button primary" data-panel-action="new-plan">Opret første arbejdsplan</button></div>`}</section>`;
}

export function renderJobs(ctx) {
  return `<div class="page-heading"><div><span class="section-label">DIT ARBEJDSLIV</span><h1>Job & kontrakter</h1><p class="muted">Lønsatser og aftaler, som dine registreringer beregnes ud fra.</p></div><button class="button primary" data-panel-action="new-job">+ Opret job</button></div>
    <div class="job-grid">${ctx.state.jobs.map(job => `<section class="card job-card"><div class="panel-head"><div><span class="section-label">${attr(ctx, job.employer || 'ARBEJDSPLADS')}</span><h2>${attr(ctx, job.name)}</h2><p class="muted">${attr(ctx, job.role || job.employment || 'Din arbejdsaftale')}</p></div>${job.id === ctx.state.settings.defaultJobId ? '<span class="badge">Standard</span>' : ''}</div><div class="contract-summary"><div><span class="muted">Timeløn</span><strong>${money(job.hourlyRate)}<small>/time</small></strong></div><div><span class="muted">Fuld overarbejdsløn</span><strong>${money(job.overtimeRate)}<small>/time</small></strong></div></div>
    <dl class="job-details"><div><dt>Arbejdsuge</dt><dd>${schemeLabel(job.scheme)}</dd></div><div><dt>Lønperiode</dt><dd>${job.periodType === '14days' ? '14 dage' : 'Månedlig'}</dd></div><div><dt>Pension, dig / arbejdsgiver</dt><dd>${number(job.pensionEmployee).toLocaleString('da-DK')} / ${number(job.pensionEmployer).toLocaleString('da-DK')} %</dd></div><div><dt>Frivalgsopsparing</dt><dd>${number(job.choicePercent).toLocaleString('da-DK')} %</dd></div><div><dt>Ferie / feriefridage</dt><dd>${number(job.holidayDays)} / ${number(job.freeHolidayDays)} dage</dd></div></dl>${!number(job.hourlyRate) ? '<p class="notice">Tilføj dine satser for at se et lønoverslag.</p>' : ''}<div class="toolbar"><button class="button secondary" data-panel-action="edit-job" data-id="${attr(ctx, job.id)}">Ret kontrakt</button><button class="button subtle danger" data-panel-action="delete-job" data-id="${attr(ctx, job.id)}">Slet job</button></div></section>`).join('')}</div>
    ${!ctx.state.jobs.length ? `<section class="card empty-state"><span class="empty-icon" aria-hidden="true">▣</span><h2>Dit første job starter her</h2><p>Opret din kontrakt, så timer og løn kan hænge sammen i hele appen.</p><button class="button primary" data-panel-action="new-job">Opret job</button></section>` : ''}
    <div class="card info-card"><h3>Sådan bruges din kontrakt</h3><p class="muted">3- og 4-dages uger giver aftalte timer på de første arbejdsdage, også når den faktiske arbejdstid er kortere. Ekstra dage i ugen og tid over dagsnormen beregnes som overarbejde. Ved 5-dages uge betales de faktisk arbejdede timer. Retter du en kontrakt, genberegnes de tilknyttede registreringer.</p><p class="muted">Løn er et overslag før skat. Pension, feriepenge og frivalg vises særskilt og erstatter ikke en lønseddel.</p></div>`;
}

function filteredRows(ctx) {
  const { query, job, type, month } = ui.work;
  const search = query.trim().toLocaleLowerCase('da-DK');
  return rowsFor(ctx).filter(row => {
    const entry = row.entry;
    const haystack = [entry.date, entry.vehicle, entry.route, entry.notes, entry.note, entry.partner, jobName(ctx, entry.jobId), typeLabels[entry.type]].join(' ').toLocaleLowerCase('da-DK');
    return (!job || entry.jobId === job) && (!type || entry.type === type) && (!month || entry.date.startsWith(month)) && (!search || haystack.includes(search));
  }).sort((a, b) => b.entry.date.localeCompare(a.entry.date) || String(b.entry.start || '').localeCompare(String(a.entry.start || '')));
}

function workTable(ctx) {
  const rows = filteredRows(ctx);
  if (!rows.length) return `<div class="empty-state"><span class="empty-icon" aria-hidden="true">≡</span><h3>Ingen registreringer fundet</h3><p>Prøv et andet filter, eller opret en ny arbejdsdag.</p><button class="button primary" data-panel-action="new-work">+ Registrer arbejdsdag</button></div>`;
  return `<div class="table-wrap"><table class="data-table"><thead><tr><th>Dato & job</th><th>Registrering</th><th>Vogn / tur</th><th>Arbejdet</th><th>Overarbejde</th><th>Lønoverslag</th><th><span class="sr-only">Handlinger</span></th></tr></thead><tbody>${rows.map(row => {
    const entry = row.entry;
    return `<tr><td><strong>${dateText(entry.date)}</strong><small class="muted">${attr(ctx, jobName(ctx, entry.jobId))}</small></td><td><span class="badge${entry.type === 'work' ? '' : ' neutral'}">${typeLabels[entry.type] || 'Fravær'}</span>${entry.type === 'work' ? `<small class="muted">${attr(ctx, entry.start || '')}–${attr(ctx, entry.end || '')}</small>` : ''}</td><td>${entry.vehicle ? `Vogn ${attr(ctx, entry.vehicle)}` : '—'}<small class="muted">${entry.route ? `Tur ${attr(ctx, entry.route)}` : ''}</small></td><td>${hours(row.actualHours || 0)}</td><td>${number(row.overtimeHours) > 0 ? `<strong class="accent-text">${hours(row.overtimeHours)}</strong>` : '—'}</td><td>${row.rateMissing ? '<span class="muted">Sats mangler</span>' : money(row.grossPay || 0)}</td><td><div class="row-actions"><button class="button subtle" data-panel-action="edit-entry" data-id="${attr(ctx, entry.id)}">Ret</button><button class="button subtle danger" data-panel-action="delete-entry" data-id="${attr(ctx, entry.id)}">Slet</button></div></td></tr>`;
  }).join('')}</tbody><tfoot><tr><td colspan="3">${rows.length} registreringer</td><td>${hours(rows.reduce((sum, row) => sum + number(row.actualHours), 0))}</td><td>${hours(rows.reduce((sum, row) => sum + number(row.overtimeHours), 0))}</td><td>${money(rows.reduce((sum, row) => sum + number(row.grossPay), 0))}</td><td></td></tr></tfoot></table></div>`;
}

export function renderWork(ctx) {
  return `<div class="page-heading"><div><span class="section-label">ALLE DINE REGISTRERINGER</span><h1>Arbejde</h1><p class="muted">Find, ret og eksportér dine arbejdsdage og dit fravær.</p></div><div class="toolbar"><button class="button secondary" data-panel-action="export-csv">Eksportér CSV</button><button class="button primary" data-panel-action="new-work">+ Registrer arbejde</button></div></div>
    <section class="card"><div class="work-filters form-grid"><label class="field"><span>Søg</span><input type="search" data-work-filter="query" placeholder="Job, vogn, tur eller note…" value="${attr(ctx, ui.work.query)}"></label><label class="field"><span>Job</span><select data-work-filter="job"><option value="">Alle job</option>${ctx.state.jobs.map(job => `<option value="${attr(ctx, job.id)}"${selected(ui.work.job, job.id)}>${attr(ctx, job.name)}</option>`).join('')}</select></label><label class="field"><span>Type</span><select data-work-filter="type"><option value="">Alle registreringer</option>${Object.entries(typeLabels).map(([key, label]) => `<option value="${key}"${selected(ui.work.type, key)}>${label}</option>`).join('')}</select></label><label class="field"><span>Måned</span><input type="month" data-work-filter="month" value="${attr(ctx, ui.work.month)}"></label></div><div class="toolbar filter-toolbar"><span class="muted" id="work-result-count" aria-live="polite">${filteredRows(ctx).length} registreringer</span><button class="button subtle" data-panel-action="reset-filters">Nulstil filtre</button></div><div id="work-table">${workTable(ctx)}</div></section>`;
}

export function renderSettings(ctx) {
  const settings = ctx.state.settings;
  return `<div class="page-heading"><div><span class="section-label">GØR APPEN TIL DIN</span><h1>Indstillinger</h1><p class="muted">Din profil, genveje og sikkerhedskopier.</p></div></div>
    <div class="settings-layout"><section class="card"><div class="panel-head"><div><span class="section-label">PERSONLIGT</span><h2>Profil & standardvalg</h2></div></div><form id="settings-form" class="form-grid">${field(ctx, 'Dit navn', 'name', settings.name, { placeholder: 'Dit navn' })}${selectField(ctx, 'Standardjob', 'defaultJobId', settings.defaultJobId, [['', 'Vælg job'], ...ctx.state.jobs.map(job => [job.id, job.name])])}<div class="full"><button class="button primary" type="submit">Gem indstillinger</button></div></form><p class="muted field-hint">Standardjobbet vælges automatisk, når du opretter en registrering.</p></section>
    <section class="card"><div class="panel-head"><div><span class="section-label">SIKKERHEDSKOPI</span><h2>Gem en kopi af dit arbejde</h2></div></div><p class="muted">Data gemmes lokalt i denne browser på denne enhed. Eksportér jævnligt en sikkerhedskopi. Importér kopien på en anden enhed for at flytte dine data.</p><div class="toolbar"><button class="button primary" data-panel-action="backup">Download sikkerhedskopi</button><button class="button secondary" data-panel-action="import">Importér kopi</button><input id="backup-file" type="file" accept="application/json,.json" hidden></div><p class="muted field-hint">Import erstatter de nuværende data efter din bekræftelse. Automatisk synkronisering mellem enheder er ikke aktiveret.</p></section>
    ${[['vehicles', 'Vogne', 'Vognnummer', 'Vælg dine faste vogne ved registrering.'], ['routes', 'Ture', 'Turnummer', 'Hold dine faste ture klar til næste arbejdsdag.']].map(([key, title, label, description]) => `<section class="card"><div class="panel-head"><div><span class="section-label">HURTIGERE REGISTRERING</span><h2>${title}</h2><p class="muted">${description}</p></div><button class="button secondary" data-panel-action="new-list-item" data-list="${key}">+ Tilføj</button></div>${ctx.state[key].length ? `<ul class="settings-list">${ctx.state[key].map((value, index) => `<li><span><span class="muted">${label}</span> <strong>${attr(ctx, value)}</strong></span><div class="row-actions"><button class="button subtle" data-panel-action="edit-list-item" data-list="${key}" data-index="${index}" aria-label="Ret ${label.toLowerCase()} ${attr(ctx, value)}">Ret</button><button class="button subtle danger" data-panel-action="delete-list-item" data-list="${key}" data-index="${index}" aria-label="Fjern ${label.toLowerCase()} ${attr(ctx, value)}">Fjern</button></div></li>`).join('')}</ul>` : `<div class="empty-state compact"><p>Ingen ${title.toLowerCase()} tilføjet endnu.</p><button class="button secondary" data-panel-action="new-list-item" data-list="${key}">Tilføj ${label.toLowerCase()}</button></div>`}<p class="muted field-hint">Ændringer i listen ændrer ikke tidligere registreringer eller arbejdsplaner.</p></section>`).join('')}</div>
    <section class="card info-card"><h3>Installer på din computer eller tablet</h3><p class="muted">Når appen åbnes via HTTPS, kan du vælge “Installer app” eller “Føj til startskærm” i Edge eller Chrome. Brug samme browserprofil til dine lokale data, og gem en sikkerhedskopi inden du rydder browserdata.</p></section>`;
}

export function renderCreate(ctx) {
  const choices = [
    ['work', '◷', 'Arbejdsdag', 'Arbejdstid, tur, tømninger og ekstra opgaver.'],
    ['sick', '♡', 'Sygdom', 'Registrer en sygedag på dit job.'],
    ['off', '☕', 'Fridag', 'En planlagt fridag i din kalender.'],
    ['holiday', '☀', 'Ferie', 'Hold styr på dine feriedage.'],
    ['freeHoliday', '✦', 'Feriefridag', 'Registrer fri med dine feriefridage.'],
    ['absence', '◌', 'Andet fravær', 'Tilføj fravær og en forklarende note.'],
    ['job', '▣', 'Job & kontrakt', 'Tilføj lønsatser og dine ansættelsesvilkår.'],
    ['plan', '▦', 'Arbejdsplan', 'Planlæg gentagne dage og arbejdstider.']
  ];
  return `<div class="page-heading"><div><span class="section-label">ALT STARTER HER</span><h1>Opret</h1><p class="muted">Vælg, hvad du vil tilføje. Alt hænger sammen i dit overblik.</p></div></div><div class="create-grid">${choices.map(([type, icon, title, description]) => `<button class="card create-card" data-panel-action="create" data-panel-type="${type}"><span class="create-icon" aria-hidden="true">${icon}</span><span><strong>${title}</strong><span class="muted">${description}</span></span><span class="create-arrow" aria-hidden="true">↗</span></button>`).join('')}</div>`;
}

function editJob(ctx, id) {
  const job = id ? getJob(ctx, id) : defaultJob({ name: '', hourlyRate: 0, overtimeRate: 0 });
  if (!job) return;
  const html = `<div class="form-grid">${field(ctx, 'Jobnavn', 'name', job.name, { required: true, placeholder: 'Fx renovationsmedarbejder' })}${field(ctx, 'Arbejdsgiver', 'employer', job.employer)}${field(ctx, 'Stilling / arbejdsområde', 'role', job.role)}${field(ctx, 'Ansættelsesforhold', 'employment', job.employment, { placeholder: 'Fx fastansat, 37 timer' })}${field(ctx, 'Ansættelsesdato', 'startDate', job.startDate, { type: 'date', required: true })}${schemeField(ctx, job.scheme)}
    <div class="full form-section-title"><h3>Løn & lønperiode</h3><p class="muted">Indtast de samlede bruttosatser pr. time fra din kontrakt.</p></div>${field(ctx, 'Normal timeløn · kr.', 'hourlyRate', job.hourlyRate, { type: 'number', required: true, min: 0, step: 0.01 })}${field(ctx, 'Fuld overarbejdsløn · kr.', 'overtimeRate', job.overtimeRate, { type: 'number', required: true, min: 0, step: 0.01, hint: 'Hele timelønnen ved overarbejde, inklusive tillæg.' })}${selectField(ctx, 'Lønperiode', 'periodType', job.periodType, [['month', 'Kalendermåned'], ['14days', '14 dage']])}${field(ctx, 'Første dag i en 14-dages periode', 'periodAnchor', job.periodAnchor, { type: 'date', required: true, hint: 'Bruges kun ved 14-dages lønperiode.' })}${field(ctx, 'Løndag i måneden', 'payday', job.payday, { type: 'number', required: true, min: 1, max: 31, step: 1, hint: 'Bruges ved månedsløn. 31 betyder sidste dag i korte måneder.' })}${field(ctx, 'Dage fra periodens slutning til løndag', 'paydayOffset', job.paydayOffset, { type: 'number', required: true, min: 0, max: 60, step: 1, hint: 'Bruges ved 14-dages lønperiode.' })}
    <div class="full form-section-title"><h3>Pension, opsparing & fravær</h3></div>${field(ctx, 'Pension · eget bidrag %', 'pensionEmployee', job.pensionEmployee, { type: 'number', min: 0, max: 100, step: 0.01 })}${field(ctx, 'Pension · arbejdsgiver %', 'pensionEmployer', job.pensionEmployer, { type: 'number', min: 0, max: 100, step: 0.01 })}${field(ctx, 'Frivalgsopsparing %', 'choicePercent', job.choicePercent, { type: 'number', min: 0, max: 100, step: 0.01 })}${field(ctx, 'Feriepenge / ferieopsparing %', 'holidayPercent', job.holidayPercent, { type: 'number', min: 0, max: 100, step: 0.01 })}${field(ctx, 'Feriedage pr. år', 'holidayDays', job.holidayDays, { type: 'number', min: 0, max: 100, step: 0.5 })}${field(ctx, 'Feriefridage pr. år', 'freeHolidayDays', job.freeHolidayDays, { type: 'number', min: 0, max: 100, step: 0.5 })}${field(ctx, 'Løn ved sygdom %', 'sickPayPercent', job.sickPayPercent, { type: 'number', min: 0, max: 100, step: 0.01, hint: 'Andel af dagsnorm og timeløn ved en sygedag.' })}<label class="field full"><span>Kontraktnoter</span><textarea name="notes" rows="3" placeholder="Supplerende aftaler om ferie, sygdom eller ansættelse">${attr(ctx, job.notes || '')}</textarea></label><p class="muted field-hint full">Ændringer anvendes på alle registreringer tilknyttet dette job. Opret et nyt job ved en ny satsperiode, hvis tidligere lønberegninger skal beholde deres satser.</p></div>`;
  ctx.modal(id ? 'Ret job & kontrakt' : 'Opret job & kontrakt', html, data => {
    const name = String(data.get('name') || '').trim();
    if (!name) { ctx.toast('Giv jobbet et navn.'); return false; }
    const updated = { ...job, id: job.id || uid(), name };
    for (const key of ['employer', 'role', 'employment', 'startDate', 'periodType', 'periodAnchor', 'notes']) updated[key] = String(data.get(key) || '').trim();
    updated.scheme = String(data.get('scheme'));
    for (const key of ['hourlyRate', 'overtimeRate', 'payday', 'paydayOffset', 'pensionEmployee', 'pensionEmployer', 'choicePercent', 'holidayPercent', 'holidayDays', 'freeHolidayDays', 'sickPayPercent']) updated[key] = number(data.get(key));
    if (updated.periodType === '14days' && !updated.periodAnchor) { ctx.toast('Vælg første dag i en 14-dages lønperiode.'); return false; }
    const jobs = id ? ctx.state.jobs.map(item => item.id === id ? updated : item) : [...ctx.state.jobs, updated];
    const validation = validateState({ ...ctx.state, jobs, settings: { ...ctx.state.settings, defaultJobId: ctx.state.settings.defaultJobId || updated.id } });
    if (!validation.ok) { ctx.toast(validation.errors[0] || 'Kontrollér oplysningerne i kontrakten.'); return false; }
    ctx.state.jobs = jobs;
    if (!ctx.state.settings.defaultJobId) ctx.state.settings.defaultJobId = updated.id;
    ctx.closeModal(); ctx.save(); ctx.toast(id ? 'Kontrakten er opdateret.' : 'Dit job er oprettet.');
  });
}

function editPlan(ctx, id) {
  if (!ctx.state.jobs.length) { ctx.toast('Opret et job, før du laver en arbejdsplan.'); ctx.navigate('job'); return; }
  const jobId = ctx.state.settings.defaultJobId || ctx.state.jobs[0].id;
  const job = getJob(ctx, jobId);
  let plan = id ? ctx.state.plans.find(item => item.id === id) : { id: uid(), title: '', jobId, from: todayISO(), to: addDays(todayISO(), 27), weekdays: Number(job?.scheme) === 3 ? [1, 2, 3] : Number(job?.scheme) === 4 ? [1, 2, 3, 4] : [1, 2, 3, 4, 5], scheme: job?.scheme || '3', start: '06:00', end: '14:00', vehicle: '', route: '' };
  if (!plan) return;
  if (plan.date) plan = { ...plan, from: plan.date, to: plan.date, weekdays: [safeDate(plan.date).getDay() || 7], scheme: plan.scheme || getJob(ctx, plan.jobId)?.scheme || '3' };
  const listSelect = (label, name, values, value) => selectField(ctx, label, name, value, [['', 'Ikke valgt'], ...Array.from(new Set([...values, ...(value ? [value] : [])])).map(text => [text, text])]);
  ctx.modal(id ? 'Ret arbejdsplan' : 'Tilføj arbejdsplan', `<div class="form-grid">${field(ctx, 'Navn på planen', 'title', plan.title, { required: true, placeholder: 'Fx fast ugeplan' })}${selectField(ctx, 'Job', 'jobId', plan.jobId, ctx.state.jobs.map(item => [item.id, item.name]))}${field(ctx, 'Fra dato', 'from', plan.from, { type: 'date', required: true })}${field(ctx, 'Til og med', 'to', plan.to, { type: 'date', required: true })}<fieldset class="field full weekday-picker"><legend>Arbejdsdage</legend><div class="check-group">${weekdays.map((day, index) => `<label><input type="checkbox" name="weekdays" value="${index + 1}"${checked(plan.weekdays.map(Number).includes(index + 1))}><span>${day.slice(0, 3)}</span></label>`).join('')}</div></fieldset>${schemeField(ctx, plan.scheme)}${listSelect('Vognnummer', 'vehicle', ctx.state.vehicles, plan.vehicle)}${listSelect('Turnummer', 'route', ctx.state.routes, plan.route)}${field(ctx, 'Starttid', 'start', plan.start, { type: 'time', required: true })}${field(ctx, 'Sluttid', 'end', plan.end, { type: 'time', required: true })}<p class="muted field-hint full">Planen vises i kalenderen. Timer og løn tæller først med, når du gemmer dagen som en registrering.</p></div>`, data => {
    const chosenDays = data.getAll('weekdays').map(Number);
    const from = String(data.get('from'));
    const to = String(data.get('to'));
    if (!chosenDays.length) { ctx.toast('Vælg mindst én arbejdsdag.'); return false; }
    if (to < from) { ctx.toast('Slutdatoen skal være på eller efter startdatoen.'); return false; }
    if (String(data.get('start')) === String(data.get('end'))) { ctx.toast('Start og slut må ikke være ens.'); return false; }
    const updated = { ...plan, title: String(data.get('title') || '').trim(), jobId: String(data.get('jobId')), from, to, weekdays: chosenDays, scheme: String(data.get('scheme')), start: String(data.get('start')), end: String(data.get('end')), vehicle: String(data.get('vehicle') || ''), route: String(data.get('route') || '') };
    delete updated.date;
    const plans = id ? ctx.state.plans.map(item => item.id === id ? updated : item) : [...ctx.state.plans, updated];
    const validation = validateState({ ...ctx.state, plans });
    if (!validation.ok) { ctx.toast(validation.errors[0] || 'Kontrollér oplysningerne i arbejdsplanen.'); return false; }
    ctx.state.plans = plans;
    ctx.closeModal(); ctx.save(); ctx.toast(id ? 'Arbejdsplanen er opdateret.' : 'Arbejdsplanen er tilføjet.');
  });
}

function editListItem(ctx, key, index) {
  if (!['vehicles', 'routes'].includes(key)) return;
  const editing = index !== undefined && index !== null && index !== '';
  const old = editing ? ctx.state[key][Number(index)] : '';
  const label = key === 'vehicles' ? 'Vognnummer' : 'Turnummer';
  ctx.modal(`${editing ? 'Ret' : 'Tilføj'} ${label.toLowerCase()}`, field(ctx, label, 'value', old, { required: true, full: true, placeholder: key === 'vehicles' ? 'Fx 142' : 'Fx 21A' }), data => {
    const value = String(data.get('value') || '').trim();
    if (!value) { ctx.toast(`Indtast et ${label.toLowerCase()}.`); return false; }
    if (ctx.state[key].some((item, itemIndex) => item.toLocaleLowerCase() === value.toLocaleLowerCase() && itemIndex !== Number(editing ? index : -1))) { ctx.toast('Nummeret findes allerede på listen.'); return false; }
    if (editing) ctx.state[key][Number(index)] = value;
    else ctx.state[key].push(value);
    ctx.closeModal(); ctx.save(); ctx.toast(`${label} er gemt.`);
  });
}

function exportCSV(ctx) {
  const rows = filteredRows(ctx);
  if (!rows.length) { ctx.toast('Der er ingen registreringer at eksportere med de valgte filtre.'); return; }
  const decimal = value => number(value).toFixed(2).replace('.', ',');
  const csvCell = value => {
    let text = String(value ?? '');
    if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
    return `"${text.replaceAll('"', '""')}"`;
  };
  const data = [['Dato', 'Job', 'Type', 'Start', 'Slut', 'Vogn', 'Tur', 'Arbejdet timer', 'Normale løntimer', 'Overarbejde timer', 'Løntimer i alt', 'Bruttoløn kr.', 'Pension eget bidrag kr.', 'Pension arbejdsgiver kr.', 'Frivalgsopsparing kr.', 'Ferieopsparing kr.', 'Note'], ...rows.map(row => [row.entry.date, jobName(ctx, row.entry.jobId), typeLabels[row.entry.type], row.entry.start, row.entry.end, row.entry.vehicle, row.entry.route, decimal(row.actualHours), decimal(row.baseHours), decimal(row.overtimeHours), decimal(row.paidHours), decimal(row.grossPay), decimal(row.pensionEmployee), decimal(row.pensionEmployer), decimal(row.choice), decimal(row.holidayAccrual), row.entry.notes || row.entry.note || ''])];
  download(`arbejde-registreringer-${todayISO()}.csv`, '\uFEFF' + data.map(row => row.map(csvCell).join(';')).join('\r\n'), 'text/csv;charset=utf-8');
  ctx.toast(`${rows.length} registreringer er eksporteret.`);
}

async function importBackup(ctx, file) {
  if (!file) return;
  if (file.size > 10 * 1024 * 1024) { ctx.toast('Filen er for stor. Vælg en sikkerhedskopi under 10 MB.'); return; }
  try {
    const data = JSON.parse(await file.text());
    const validation = validateState(data);
    if (!validation.ok) { ctx.toast(`Kopien kunne ikke indlæses: ${(validation.errors || []).slice(0, 2).join(' ') || 'Ugyldigt dataformat.'}`); return; }
    const incoming = validation.state;
    ctx.showConfirm('Importér sikkerhedskopi?', `Kopien indeholder ${incoming.entries.length} registreringer, ${incoming.jobs.length} job og ${incoming.plans.length} arbejdsplaner. Den erstatter alle nuværende data på denne enhed. Download gerne en sikkerhedskopi først.`, () => {
      Object.assign(ctx.state, incoming);
      ui.work = { query: '', job: '', type: '', month: '' };
      ctx.save(); ctx.toast('Din sikkerhedskopi er importeret.');
    });
  } catch { ctx.toast('Filen kunne ikke læses. Vælg en gyldig JSON-sikkerhedskopi fra Arbejde.'); }
}

function act(ctx, button) {
  const { panelAction: action, id, panelType: type, date, list, index } = button.dataset;
  if (action === 'new-job' || (action === 'create' && type === 'job')) return editJob(ctx);
  if (action === 'edit-job') return editJob(ctx, id);
  if (action === 'new-plan' || (action === 'create' && type === 'plan')) return editPlan(ctx);
  if (action === 'edit-plan') return editPlan(ctx, id);
  if (action === 'new-work') return ctx.openEntry(null, { type: 'work', date: todayISO() });
  if (action === 'create') return ctx.openEntry(null, { type, date: todayISO() });
  if (action === 'edit-entry') return ctx.openEntry(id);
  if (action === 'calendar-add') return ctx.openEntry(null, { type: 'work', date });
  if (action === 'register-plan') {
    const plan = ctx.state.plans.find(item => item.id === id);
    if (plan) ctx.openEntry(null, { type: 'work', date, jobId: plan.jobId, scheme: plan.scheme || getJob(ctx, plan.jobId)?.scheme || '3', start: plan.start, end: plan.end, vehicle: plan.vehicle || '', route: plan.route || '' });
    return;
  }
  if (action === 'prev-month' || action === 'next-month' || action === 'current-month') {
    const current = action === 'current-month' ? safeDate(todayISO()) : calendarMonth(ctx);
    if (action !== 'current-month') current.setMonth(current.getMonth() + (action === 'prev-month' ? -1 : 1));
    ui.month = isoDate(new Date(current.getFullYear(), current.getMonth(), 1, 12));
    ctx.render(); return;
  }
  if (action === 'delete-plan') return ctx.showConfirm('Slet arbejdsplan?', 'Planlagte dage fra denne plan fjernes fra kalenderen. Allerede gemte registreringer beholdes.', () => { ctx.state.plans = ctx.state.plans.filter(plan => plan.id !== id); ctx.save(); ctx.toast('Arbejdsplanen er slettet.'); });
  if (action === 'delete-entry') {
    const entry = ctx.state.entries.find(item => item.id === id);
    return ctx.showConfirm('Slet registrering?', `${entry ? dateText(entry.date) : 'Registreringen'} fjernes fra kalender, timer og lønoversigt.`, () => { ctx.state.entries = ctx.state.entries.filter(item => item.id !== id); ctx.save(); ctx.toast('Registreringen er slettet.'); });
  }
  if (action === 'delete-job') {
    if (ctx.state.entries.some(entry => entry.jobId === id) || ctx.state.plans.some(plan => plan.jobId === id)) { ctx.toast('Jobbet bruges af registreringer eller arbejdsplaner. Flyt eller slet dem, før jobbet slettes.'); return; }
    return ctx.showConfirm('Slet job?', `Kontrakten “${jobName(ctx, id)}” fjernes.`, () => { ctx.state.jobs = ctx.state.jobs.filter(job => job.id !== id); if (ctx.state.settings.defaultJobId === id) ctx.state.settings.defaultJobId = ctx.state.jobs[0]?.id || ''; ctx.save(); ctx.toast('Jobbet er slettet.'); });
  }
  if (action === 'new-list-item') return editListItem(ctx, list);
  if (action === 'edit-list-item') return editListItem(ctx, list, index);
  if (action === 'delete-list-item' && ['vehicles', 'routes'].includes(list)) return ctx.showConfirm('Fjern fra listen?', `“${ctx.state[list][Number(index)]}” fjernes som valgmulighed. Tidligere registreringer og planer beholdes.`, () => { ctx.state[list].splice(Number(index), 1); ctx.save(); ctx.toast('Valgmuligheden er fjernet.'); });
  if (action === 'export-csv') return exportCSV(ctx);
  if (action === 'reset-filters') { ui.work = { query: '', job: '', type: '', month: '' }; ctx.render(); return; }
  if (action === 'backup') { download(`arbejde-sikkerhedskopi-${todayISO()}.json`, JSON.stringify(ctx.state, null, 2), 'application/json'); ctx.toast('Sikkerhedskopien er downloadet.'); return; }
  if (action === 'import') document.querySelector('#backup-file')?.click();
}

export function bindPanels(ctx) {
  document.querySelectorAll('[data-panel-action]').forEach(button => button.addEventListener('click', () => act(ctx, button)));
  document.querySelectorAll('[data-work-filter]').forEach(input => input.addEventListener(input.type === 'search' ? 'input' : 'change', () => {
    ui.work[input.dataset.workFilter] = input.value;
    const table = document.querySelector('#work-table');
    if (table) { table.innerHTML = workTable(ctx); table.querySelectorAll('[data-panel-action]').forEach(button => button.addEventListener('click', () => act(ctx, button))); }
    const count = document.querySelector('#work-result-count');
    if (count) count.textContent = `${filteredRows(ctx).length} registreringer`;
  }));
  document.querySelector('#settings-form')?.addEventListener('submit', event => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    ctx.state.settings.name = String(data.get('name') || '').trim();
    ctx.state.settings.defaultJobId = String(data.get('defaultJobId') || '');
    ctx.save(); ctx.toast('Dine indstillinger er gemt.');
  });
  document.querySelector('#backup-file')?.addEventListener('change', event => { importBackup(ctx, event.target.files?.[0]); event.target.value = ''; });
}

