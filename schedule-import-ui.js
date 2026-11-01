import { dateLabel, validateState } from './domain.js';
import { extractPdf } from './pdf-reader.js';
import { parseSchedule } from './schedule-parser.js';
import { prepareScheduleImport, applyScheduleImport } from './schedule-domain.js';

const ui = {
  files: [], candidates: [], warnings: [], busy: false, controller: null, run: 0,
  progress: 0, progressText: '', error: '', notice: '', jobId: '',
  mode: 'person', target: '', search: '', selected: null, acknowledge: false,
  replaceImported: false, useDefaultTimes: false, defaultStart: '', defaultEnd: '',
  yearHint: '', weekHint: '', rememberTarget: true, completed: null, pendingCommit: null
};
const kindLabels = { work: 'Arbejde', off: 'Fridag', holiday: 'Ferie', freeHoliday: 'Feriefridag', sick: 'Sygdom', absence: 'Fravær', unassigned: 'Ingen bemanding', unknown: 'Uafklaret' };
const statusLabels = { new: 'Ny vagt', duplicate: 'Findes allerede', conflict: 'Konflikt', invalid: 'Skal rettes' };
const norm = value => String(value ?? '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('da-DK').replace(/\s+/g, ' ').trim();
const escape = (ctx, value) => ctx.escape(String(value ?? ''));
const checked = value => value ? ' checked' : '';
const icon = (name, size = 48, className = 'panel-icon') => `<img class="${className}" src="assets/brand/${name}.png" alt="" width="${size}" height="${size}" decoding="async">`;
const warningText = value => typeof value === 'string' ? value : value?.message || String(value || '');
const vehicleLabel = value => /^\d+$/.test(String(value || '').trim()) ? `Vogn ${value}` : String(value || '');
let latestContext = null;
let keyListenerInstalled = false;

function currentJob(ctx) {
  return ctx.state.jobs.find(job => job.id === ui.jobId);
}

function candidateNames(candidate) {
  const names = Array.isArray(candidate.people) ? candidate.people.filter(value => typeof value === 'string' && value.trim()) : [];
  if (names.length) return names;
  return candidate.status === 'unassigned' || candidate.status === 'unknown' || !candidate.person ? [] : [String(candidate.person)];
}

function targets(ctx) {
  const options = new Map();
  for (const candidate of ui.candidates) {
    const values = ui.mode === 'vehicle' ? [candidate.vehicle].filter(Boolean) : candidateNames(candidate);
    for (const value of values) {
      const key = norm(value);
      if (!key) continue;
      if (!options.has(key)) options.set(key, { value: String(value), count: 0 });
      options.get(key).count++;
    }
  }
  return [...options.values()].map(option => {
    const exact = ui.mode === 'vehicle'
      ? (ctx.state.directory?.vehicles || []).filter(vehicle => norm(vehicle.number) === norm(option.value))
      : (ctx.state.directory?.people || []).filter(person => norm(person.name) === norm(option.value));
    const register = exact.length || ui.mode === 'vehicle' ? exact : (ctx.state.directory?.people || []).filter(person => norm(person.name).startsWith(`${norm(option.value)} `));
    return { ...option, register, matchesRegister: exact.length === 1, possibleMatches: exact.length ? 0 : register.length };
  }).sort((a, b) => Number(b.matchesRegister) - Number(a.matchesRegister) || a.value.localeCompare(b.value, 'da-DK', { numeric: true }));
}

function preview(ctx) {
  if (!ui.candidates.length || !ui.target || !currentJob(ctx)) return { items: [], counts: {} };
  try {
    return prepareScheduleImport(ctx.state, ui.candidates, {
      jobId: ui.jobId, scheme: currentJob(ctx).scheme,
      defaultStart: ui.defaultStart, defaultEnd: ui.defaultEnd, useDefaultTimes: ui.useDefaultTimes,
      target: { mode: ui.mode, value: ui.target }
    });
  } catch (error) {
    return { items: [], counts: {}, error: error.message || 'Planen kunne ikke klargøres. Kontrollér dit valg.' };
  }
}

function isEligible(item) {
  return item.status === 'new' || (item.status === 'conflict' && (item.batchConflictOnly === true || (item.canReplace === true && ui.replaceImported)));
}

function reconcileSelection(result) {
  if (ui.selected === null) ui.selected = new Set(result.items.filter(item => item.status === 'new' && !item.needsReview).map(item => item.id));
  const available = new Set(result.items.filter(isEligible).map(item => item.id));
  ui.selected = new Set([...ui.selected].filter(id => available.has(id)));
}

function selectedItems(result) {
  return result.items.filter(item => ui.selected?.has(item.id) && isEligible(item));
}

function updateProgressDOM() {
  const progress = document.querySelector('#schedule-progress');
  const label = document.querySelector('#schedule-progress-label');
  if (progress) { progress.value = ui.progress; progress.setAttribute('aria-valuetext', ui.progressText); }
  if (label) label.textContent = ui.progressText;
}

function summaryDates(items) {
  const dates = [...new Set(items.map(item => item.plan?.date || item.candidate?.date).filter(Boolean))].sort();
  if (!dates.length) return 'Datoer skal kontrolleres';
  if (dates.length === 1) return dateLabel(dates[0], { year: 'numeric' });
  return `${dateLabel(dates[0], { year: 'numeric' })} – ${dateLabel(dates.at(-1), { year: 'numeric' })}`;
}

function uploadPanel(ctx) {
  return `<section class="card schedule-upload-card"><div class="panel-head"><div class="panel-title-group">${icon('export')}<div><span class="surface-label">01 · VÆLG DINE ARBEJDSPLANER</span><h2>Fra PDF til din kalender</h2></div></div>${ui.candidates.length && !ui.busy && !ui.pendingCommit ? '<button class="button subtle" type="button" data-schedule-action="reset">Start forfra</button>' : ''}</div><div class="schedule-upload-body"><input id="schedule-pdf-files" type="file" accept="application/pdf,.pdf" multiple hidden><div class="schedule-dropzone${ui.busy ? ' is-busy' : ''}" id="schedule-dropzone" role="group" aria-label="Vælg eller slip PDF-filer"><div>${icon('calendar', 76, 'schedule-upload-art')}<h3>${ui.busy ? 'Læser dine arbejdsplaner…' : 'Slip dine PDF-filer her'}</h3><p>Vælg op til to arbejdsplaner. Højst 20 MB pr. fil.</p><button class="button primary" type="button" data-schedule-action="choose"${ui.busy || ui.pendingCommit ? ' disabled' : ''}>${ui.candidates.length ? 'Vælg andre PDF-filer' : 'Vælg PDF-filer'}</button></div></div>${ui.busy ? `<div class="schedule-progress-region"><div class="schedule-progress-heading"><span id="schedule-progress-label" role="status" aria-live="polite">${escape(ctx, ui.progressText)}</span><button class="button secondary" type="button" data-schedule-action="cancel">Afbryd læsning</button></div><progress id="schedule-progress" max="100" value="${ui.progress}" aria-label="Læsning af arbejdsplaner" aria-valuetext="${escape(ctx, ui.progressText)}"></progress><p class="muted">Du kan også trykke Escape. Intet bliver tilføjet, mens filerne læses.</p></div>` : ''}${ui.files.length ? `<ul class="schedule-file-list">${ui.files.map(file => `<li><span><strong>${escape(ctx, file.name)}</strong><small>${(file.size / 1024 / 1024).toLocaleString('da-DK', { maximumFractionDigits: 1 })} MB${file.pageCount ? ` · ${file.pageCount} sider` : ''}${file.rowCount !== undefined ? ` · ${file.rowCount} rækker fundet` : ''}</small></span><span class="badge${file.error ? ' schedule-danger' : ''}">${file.error ? 'Kunne ikke læses' : file.rowCount !== undefined ? 'Læst lokalt' : 'Valgt'}</span>${file.error ? `<p class="schedule-error">${escape(ctx, file.error)}</p>` : ''}</li>`).join('')}</ul>` : ''}<details class="schedule-date-hints"><summary>Hvis år eller ugenummer mangler i filen</summary><p>Angiv kun de oplysninger, du kender fra planen. De bruges ved næste filvalg.</p><div class="form-grid"><label class="field"><span>Årstal · valgfrit</span><input type="number" min="2000" max="2100" step="1" data-schedule-option="yearHint" value="${escape(ctx, ui.yearHint)}" placeholder="Fx 2026"${ui.busy || ui.pendingCommit ? ' disabled' : ''}></label><label class="field"><span>Ugenummer · valgfrit</span><input type="number" min="1" max="53" step="1" data-schedule-option="weekHint" value="${escape(ctx, ui.weekHint)}" placeholder="1–53"${ui.busy || ui.pendingCommit ? ' disabled' : ''}></label></div></details><div class="schedule-privacy-note"><span class="status-dot"></span><p>Filerne læses lokalt på din enhed. PDF-filerne gemmes ikke i appen. Først dit gennemsete udvalg bliver gemt som kalenderplaner.</p></div></div></section>`;
}

function selectionPanel(ctx) {
  const all = targets(ctx);
  const hasWorkplaces = ui.candidates.some(candidate => candidate.vehicle && !/^\d+$/.test(String(candidate.vehicle).trim()));
  const unitLabel = hasWorkplaces ? 'Vogn / arbejdssted' : 'Vogn';
  const shown = all.filter(option => norm([option.value, ...option.register.flatMap(record => [record.name, record.number, record.registrationNumber])].filter(Boolean).join(' ')).includes(norm(ui.search)));
  return `<section class="card schedule-selection-card"><div class="panel-head"><div><span class="surface-label">02 · FIND DIT EGET UDSNIT</span><h2>Hvem skal planen gælde for?</h2><p>Vælg én person eller én vogn. Dine kollegaers øvrige vagter bliver ikke importeret.</p></div></div><div class="schedule-selection-body"><label class="field"><span>Job, som planen skal tilhøre</span><select id="schedule-job" required><option value="">Vælg job</option>${ctx.state.jobs.map(job => `<option value="${escape(ctx, job.id)}"${job.id === ui.jobId ? ' selected' : ''}>${escape(ctx, job.name)}</option>`).join('')}</select></label>${!ctx.state.jobs.length ? '<p class="schedule-warning">Opret et job, før du kan importere vagter. <button class="text-button" type="button" data-schedule-action="new-job">Opret job</button></p>' : ''}<div class="schedule-target-controls"><div class="segmented" role="group" aria-label="Udvælg vagter efter"><button type="button" data-schedule-action="mode" data-mode="person" aria-pressed="${ui.mode === 'person'}" class="${ui.mode === 'person' ? 'active' : ''}">Person</button><button type="button" data-schedule-action="mode" data-mode="vehicle" aria-pressed="${ui.mode === 'vehicle'}" class="${ui.mode === 'vehicle' ? 'active' : ''}">${unitLabel}</button></div><label class="field schedule-target-search"><span class="sr-only">Søg i fundne personer eller vogne</span><input type="search" id="schedule-target-search" maxlength="160" placeholder="${ui.mode === 'person' ? 'Søg navn fra PDF eller register…' : hasWorkplaces ? 'Søg vognnummer eller arbejdssted…' : 'Søg vognnummer…'}" value="${escape(ctx, ui.search)}"></label></div><div class="schedule-target-list" role="group" aria-label="${ui.mode === 'person' ? 'Personer fundet i PDF-filerne' : 'Vogne fundet i PDF-filerne'}">${shown.length ? shown.map(option => `<button type="button" class="schedule-target${norm(option.value) === norm(ui.target) ? ' is-selected' : ''}" data-schedule-action="target" data-value="${escape(ctx, option.value)}" aria-pressed="${norm(option.value) === norm(ui.target)}"><span><strong>${escape(ctx, ui.mode === 'vehicle' ? vehicleLabel(option.value) : option.value)}</strong><small>${option.count} rækker i PDF${option.matchesRegister ? ' · Findes i dit register' : option.possibleMatches ? ` · Muligt registermatch: ${escape(ctx, option.register.map(record => record.name).join(', '))}` : ''}</small></span><span class="schedule-target-marker" aria-hidden="true"></span></button>`).join('') : `<p class="muted">${all.length ? 'Ingen match. Prøv en anden søgning.' : `Der blev ikke fundet ${ui.mode === 'person' ? 'personnavne' : 'vognnumre'} i filerne. Prøv den anden udvælgelse, eller vælg en anden PDF.`}</p>`}</div><label class="schedule-check schedule-remember-target"><input type="checkbox" data-schedule-option="rememberTarget"${checked(ui.rememberTarget)}${!ui.target ? ' disabled' : ''}><span>Brug dette valg til min daglige visning</span></label><details class="schedule-default-times"><summary>Tilføj standardtider · valgfrit</summary><p>Hvis PDF-filen ikke har tider, bliver vagten som udgangspunkt en heldagsplan. Tilføj kun standardtider, hvis de passer til dit arbejde.</p><label class="schedule-check"><input type="checkbox" data-schedule-option="useDefaultTimes"${checked(ui.useDefaultTimes)}><span>Brug mine standardtider på vagter uden tid</span></label><div class="form-grid"><label class="field"><span>Starttid</span><input type="time" data-schedule-option="defaultStart" value="${escape(ctx, ui.defaultStart)}"></label><label class="field"><span>Sluttid</span><input type="time" data-schedule-option="defaultEnd" value="${escape(ctx, ui.defaultEnd)}"></label></div></details></div></section>`;
}

function confidenceLabel(value) {
  return value === 'high' ? 'Tydelig kilde' : value === 'medium' ? 'Kontrollér læsning' : 'Usikker læsning';
}

function reviewRow(ctx, item) {
  const candidate = item.candidate || {}, plan = item.plan || {};
  const rowWarnings = [...new Set([...(candidate.warnings || []), ...(item.warnings || []), ...(item.errors || [])].map(warningText).filter(Boolean))];
  const source = candidate.source || {};
  const selected = ui.selected?.has(item.id) && isEligible(item);
  const sourceTime = candidate.start && candidate.end ? `${candidate.start}–${candidate.end}` : 'Tid ikke angivet';
  const plannedTime = plan.start && plan.end ? `${plan.start}–${plan.end}` : '';
  return `<tr class="schedule-row schedule-row-${escape(ctx, item.status)}${selected ? ' is-selected' : ''}"><td><label class="schedule-row-select"><input type="checkbox" data-schedule-row="${escape(ctx, item.id)}"${checked(selected)}${!isEligible(item) ? ' disabled' : ''}><span class="sr-only">Vælg vagt ${escape(ctx, plan.date || candidate.date || 'uden dato')} for ${escape(ctx, candidate.person || candidate.vehicle)}</span></label></td><td><strong>${escape(ctx, dateLabel(plan.date || candidate.date, { weekday: 'short', year: 'numeric' }))}</strong><small>${source.week ? `Uge ${Number(source.week)}` : ''}</small></td><td><strong>${escape(ctx, candidate.person || 'Ikke angivet')}</strong><small>${candidate.vehicle ? escape(ctx, vehicleLabel(candidate.vehicle)) : 'Vogn / arbejdssted ikke angivet'}</small></td><td><strong>${escape(ctx, candidate.task || plan.title || 'Ikke angivet')}</strong><small>${candidate.route ? `Tur ${escape(ctx, candidate.route)}` : ''}</small><span class="schedule-kind">${escape(ctx, kindLabels[plan.kind || candidate.kind] || 'Uafklaret')}</span></td><td><span>${escape(ctx, sourceTime)}</span>${plannedTime && plannedTime !== sourceTime ? `<small>Din standardtid: ${escape(ctx, plannedTime)}</small>` : !plannedTime ? '<small>Gemmes som heldagsplan</small>' : ''}</td><td><span class="badge schedule-status-${escape(ctx, item.status)}">${statusLabels[item.status] || 'Kontrollér'}</span><small class="schedule-confidence${item.needsReview ? ' schedule-warning-text' : ''}">${confidenceLabel(candidate.confidence)}</small>${item.needsReview ? '<span class="schedule-review-flag">Vælg aktivt og bekræft kontrollen</span>' : ''}${rowWarnings.length ? `<details class="schedule-row-warnings"><summary>${rowWarnings.length} opmærksomhedspunkter</summary><ul>${rowWarnings.map(message => `<li>${escape(ctx, message)}</li>`).join('')}</ul></details>` : ''}<small class="schedule-source-ref">${escape(ctx, source.fileName || '')}${source.page ? ` · side ${Number(source.page)}` : ''}${source.row !== undefined ? ` · række ${escape(ctx, source.row)}` : ''}</small></td><td><button class="button subtle" type="button" data-schedule-action="edit-row" data-id="${escape(ctx, candidate.id || item.id)}">Kontrollér / ret</button></td></tr>`;
}

function reviewPanel(ctx) {
  const result = preview(ctx);
  reconcileSelection(result);
  const chosen = selectedItems(result);
  const flagged = chosen.filter(item => item.needsReview).length;
  const counts = Object.fromEntries(['new', 'duplicate', 'conflict', 'invalid'].map(status => [status, result.items.filter(item => item.status === status).length]));
  const replaceable = result.items.some(item => item.status === 'conflict' && item.canReplace);
  const defaultsInvalid = ui.useDefaultTimes && (!ui.defaultStart || !ui.defaultEnd || ui.defaultStart === ui.defaultEnd);
  const canCommit = chosen.length > 0 && (!flagged || ui.acknowledge) && !defaultsInvalid && currentJob(ctx);
  const otherPeople = new Set(ui.candidates.flatMap(candidateNames).filter(name => ui.mode !== 'person' || norm(name) !== norm(ui.target))).size;
  return `<section class="card schedule-review-card" id="schedule-review"><div class="panel-head"><div><span class="surface-label">03 · GENNEMSE FØR DU GEMMER</span><h2>Dine vagter til kalenderen</h2><p>${ui.target ? `${escape(ctx, ui.mode === 'person' ? ui.target : vehicleLabel(ui.target))} · ${escape(ctx, currentJob(ctx)?.name || 'Vælg job')}` : 'Vælg en person eller vogn for at se dit udsnit.'}</p></div><span class="badge">${chosen.length} valgt</span></div>${result.error ? `<p class="schedule-error">${escape(ctx, result.error)}</p>` : ''}${ui.target && currentJob(ctx) ? `<div class="schedule-review-summary"><span><b>${result.items.length}</b> rækker i dit udsnit</span><span><b>${ui.candidates.length - result.items.length}</b> øvrige rækker fra filerne</span><span><b>${otherPeople}</b> øvrige navne i filerne</span><span>${escape(ctx, summaryDates(result.items))}</span></div><div class="schedule-status-summary"><span>${counts.new} nye</span><span>${counts.duplicate} findes allerede</span><span>${counts.conflict} konflikter</span><span>${counts.invalid} skal rettes</span></div>${result.items.length ? `<div class="schedule-review-actions"><button class="button subtle" type="button" data-schedule-action="select-clear">Fravælg alle</button><button class="button secondary" type="button" data-schedule-action="select-clear-source">Vælg tydelige, nye vagter</button><p class="muted">Usikre navnematch og andre rækker til kontrol vælges altid aktivt af dig.</p></div><div class="table-wrap schedule-table-wrap"><table class="data-table schedule-review-table"><thead><tr><th><span class="sr-only">Vælg</span></th><th>Dato</th><th>Kilde: person & vogn / arbejdssted</th><th>Opgave / type</th><th>Tid fra PDF</th><th>Kontrol & kilde</th><th><span class="sr-only">Ret række</span></th></tr></thead><tbody>${result.items.map(item => reviewRow(ctx, item)).join('')}</tbody></table></div>` : '<div class="empty-state"><h3>Ingen vagter i dette udsnit</h3><p>Vælg en anden person eller vogn, eller kontrollér navnene i filen.</p></div>'}${replaceable ? `<label class="schedule-check schedule-replace-check"><input type="checkbox" data-schedule-option="replaceImported"${checked(ui.replaceImported)}><span>Jeg vil kunne erstatte tidligere PDF-vagter, der er i konflikt. Manuelle planer og gemte arbejdsregistreringer bliver ikke erstattet.</span></label>` : ''}${counts.conflict ? '<p class="schedule-conflict-note">Konflikter med manuelt oprettede planer eller gemte registreringer er blokeret. Der bliver ikke overskrevet noget uden dit valg.</p>' : ''}${defaultsInvalid ? '<p class="schedule-error">Angiv både start og slut for standardtider, og vælg to forskellige tider. Du kan også slå standardtider fra og gemme heldagsplaner.</p>' : ''}<div class="schedule-commit-area">${flagged ? `<label class="schedule-check schedule-acknowledgement"><input type="checkbox" data-schedule-option="acknowledge"${checked(ui.acknowledge)}><span>Jeg har kontrolleret datoer, navne og indhold for de ${flagged} valgte rækker, som kræver gennemgang.</span></label>` : ''}<div class="schedule-commit-actions"><p><strong>${chosen.length} vagter valgt</strong><span>Gemmes som planer. Timer og løn tæller først, når arbejdsdagen registreres.</span></p><button class="button primary" type="button" data-schedule-action="commit"${!canCommit ? ' disabled' : ''}>Tilføj ${chosen.length} vagter</button></div></div>` : '<div class="schedule-pick-first"><p>Vælg job og derefter den person eller vogn, du vil importere for. Hele holdets plan bliver ikke tilføjet.</p></div>'}</section>`;
}

function recoveryPanel() {
  const pending = ui.pendingCommit;
  return `<section class="card schedule-save-recovery" role="alert"><div><span class="surface-label">IMPORTEN ER IKKE GEMT ENDNU</span><h2>${pending.added} vagter er kun i hukommelsen</h2><p>Planerne og dit eventuelle daglige standardvalg er klar i appen, men browseren kunne ikke gemme dem. Gennemgangen er beholdt, så du ikke behøver læse PDF-filerne igen.</p><p>Hold denne side åben. Prøv at gemme igen, eller åbn backup og download en sikkerhedskopi af oplysningerne i hukommelsen.</p></div><div class="schedule-recovery-actions"><button class="button primary" type="button" data-schedule-action="retry-save">Prøv at gemme igen</button><button class="button secondary" type="button" data-schedule-action="open-backup">Åbn backup</button></div></section>`;
}

export function renderScheduleImport(ctx) {
  if (!ctx.state.jobs.some(job => job.id === ui.jobId)) ui.jobId = ctx.state.settings.defaultJobId || ctx.state.jobs[0]?.id || '';
  return `<div id="schedule-import"><div class="page-heading"><div class="page-intro">${icon('calendar', 64, 'page-title-icon')}<div class="page-heading-copy"><span class="section-label">DIN PLAN, UDEN GENINDTASTNING</span><h1>Importér arbejdsplan</h1><p class="muted">Læs PDF-filerne lokalt. Vælg dit eget udsnit, og gennemse vagterne før de lægges i kalenderen.</p></div></div></div>${ui.error ? `<div class="notice error-notice" role="alert">${escape(ctx, ui.error)}</div>` : ''}${ui.notice ? `<div class="notice" role="status">${escape(ctx, ui.notice)}</div>` : ''}${ui.pendingCommit ? recoveryPanel() : ''}${ui.completed ? `<section class="card schedule-complete"><div>${icon('calendar', 76)}<span class="surface-label">PLANEN ER KLAR</span><h2>${ui.completed.added} vagter tilføjet</h2><p>${ui.completed.replaced ? `${ui.completed.replaced} tidligere PDF-vagter blev erstattet. ` : ''}${ui.completed.skipped ? `${ui.completed.skipped} rækker blev sprunget over. ` : ''}Åbn kalenderen for at se planen og registrere dagen, når du har arbejdet.</p></div><button class="button primary" type="button" data-schedule-action="calendar">Åbn kalender</button><button class="button secondary" type="button" data-schedule-action="reset">Importér en ny plan</button></section>` : ''}${uploadPanel(ctx)}${ui.warnings.length && !ui.busy ? `<details class="card schedule-file-warnings"><summary>${ui.warnings.length} beskeder fra læsningen</summary><ul>${ui.warnings.map(message => `<li>${escape(ctx, warningText(message))}</li>`).join('')}</ul></details>` : ''}${ui.candidates.length && !ui.busy && !ui.completed && !ui.pendingCommit ? `<div class="schedule-workspace">${selectionPanel(ctx)}${reviewPanel(ctx)}</div>` : ''}</div>`;
}

function resetSelection() {
  ui.selected = null; ui.acknowledge = false; ui.completed = null; ui.error = '';
}

function renderWithFocus(ctx, attribute, value) {
  ctx.render();
  const node = [...document.querySelectorAll(`[${attribute}]`)].find(element => element.getAttribute(attribute) === String(value));
  node?.focus({ preventScroll: true });
}

function resetImport() {
  ui.controller?.abort();
  ui.run++;
  Object.assign(ui, { files: [], candidates: [], warnings: [], busy: false, controller: null, progress: 0, progressText: '', error: '', notice: '', target: '', search: '', selected: null, acknowledge: false, replaceImported: false, rememberTarget: true, completed: null, pendingCommit: null });
}

function cancelReading(ctx) {
  if (!ui.busy) return;
  ui.progressText = 'Afbryder læsningen…';
  updateProgressDOM();
  ui.controller?.abort();
}

async function readFiles(ctx, fileList) {
  if (ctx.isDemo) { ctx.toast('Skift til dine egne data for at importere din arbejdsplan.'); return; }
  const files = Array.from(fileList || []);
  if (!files.length) return;
  if (ui.pendingCommit) { ctx.toast('Gem den klargjorte import, før du vælger nye PDF-filer. Din gennemgang er beholdt.'); return; }
  if (ui.busy) { ctx.toast('Afbryd den igangværende læsning, før du vælger nye filer.'); return; }
  if (files.length > 2) { ui.error = 'Vælg højst to PDF-filer ad gangen.'; ctx.render(); return; }
  if (files.some(file => !/\.pdf$/i.test(file.name) && file.type !== 'application/pdf')) { ui.error = 'Vælg PDF-filer med dine arbejdsplaner.'; ctx.render(); return; }
  if (files.some(file => file.size > 20 * 1024 * 1024)) { ui.error = 'Hver PDF-fil må højst fylde 20 MB.'; ctx.render(); return; }
  if (ui.yearHint && (!/^\d{4}$/.test(ui.yearHint) || Number(ui.yearHint) < 2000 || Number(ui.yearHint) > 2100)) { ui.error = 'Angiv et gyldigt årstal mellem 2000 og 2100, eller lad feltet være tomt.'; ctx.render(); return; }
  if (ui.weekHint && (!/^\d{1,2}$/.test(ui.weekHint) || Number(ui.weekHint) < 1 || Number(ui.weekHint) > 53)) { ui.error = 'Angiv et ugenummer fra 1 til 53, eller lad feltet være tomt.'; ctx.render(); return; }
  resetImport();
  const run = ui.run;
  ui.controller = new AbortController();
  const signal = ui.controller.signal;
  ui.files = files.map(file => ({ name: file.name, size: file.size }));
  ui.busy = true; ui.progressText = 'Gør klar til lokal læsning…';
  ctx.render();
  const candidates = [], warnings = [];
  try {
    for (let index = 0; index < files.length; index++) {
      if (signal.aborted) throw new DOMException('Afbrudt', 'AbortError');
      const file = files[index];
      try {
        const extracted = await extractPdf(file, { signal, onProgress: progress => {
          if (run !== ui.run || signal.aborted) return;
          const percent = Number.isFinite(progress.percent) ? progress.percent : progress.total ? progress.completed / progress.total * 100 : 0;
          ui.progress = Math.max(0, Math.min(100, (index + percent / 100) / files.length * 100));
          ui.progressText = `${file.name} · ${progress.message || `Fil ${index + 1} af ${files.length}`}`;
          updateProgressDOM();
        } });
        if (signal.aborted) throw new DOMException('Afbrudt', 'AbortError');
        const parsed = parseSchedule(extracted.pages, { fileName: extracted.filename || file.name, fingerprint: extracted.fingerprint, ...(ui.yearHint ? { year: Number(ui.yearHint) } : {}), ...(ui.weekHint ? { week: Number(ui.weekHint) } : {}) });
        const rows = Array.isArray(parsed.candidates) ? parsed.candidates : [];
        for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
          const row = rows[rowIndex];
          candidates.push({ ...row, id: `pdf-${run}-${index}-${rowIndex}`, source: { ...row.source, fileName: row.source?.fileName || file.name, fileHash: extracted.fingerprint || row.source?.fileHash || '' } });
        }
        ui.files[index] = { ...ui.files[index], pageCount: extracted.pageCount, rowCount: rows.length };
        warnings.push(...[...(extracted.warnings || []), ...(parsed.warnings || [])].map(warning => `${file.name}: ${warningText(warning)}`));
      } catch (error) {
        if (signal.aborted || error.name === 'AbortError' || error.code === 'ABORTED') throw error;
        ui.files[index] = { ...ui.files[index], error: error.message || 'PDF-filen kunne ikke læses.' };
        warnings.push(`${file.name}: ${error.message || 'Filen kunne ikke læses.'}`);
      }
    }
    if (run !== ui.run) return;
    ui.candidates = candidates;
    ui.warnings = [...new Set(warnings)];
    if (!candidates.length) ui.error = 'Der blev ikke fundet vagter, som kan gennemgås. Kontrollér, at PDF-filen indeholder søgbar tekst og en arbejdsplan.';
    else {
      if (!candidates.some(candidate => candidateNames(candidate).length) && candidates.some(candidate => candidate.vehicle)) ui.mode = 'vehicle';
      ui.notice = `${candidates.length} rækker er læst. Vælg nu den person eller vogn, du vil importere for.`;
    }
  } catch (error) {
    if (run !== ui.run) return;
    ui.candidates = [];
    ui.warnings = [];
    if (signal.aborted || error.name === 'AbortError' || error.code === 'ABORTED') ui.notice = 'Læsningen er afbrudt. Der er ikke tilføjet noget til kalenderen.';
    else ui.error = error.message || 'PDF-filerne kunne ikke læses.';
  } finally {
    if (run === ui.run) { ui.busy = false; ui.controller = null; ctx.render(); }
  }
}

function editRow(ctx, id) {
  const candidate = ui.candidates.find(row => row.id === id);
  if (!candidate) return;
  const item = preview(ctx).items.find(row => row.candidate?.id === id);
  const value = name => escape(ctx, candidate[name] || '');
  ctx.modal('Kontrollér række fra arbejdsplanen', `<div class="form-grid"><p class="muted full">Ret kun oplysninger, du kan bekræfte i kilden. Rækken er stadig til gennemgang, og dit valg skal bekræftes før import.</p><label class="field"><span>Dato</span><input type="date" name="date" value="${value('date')}" required></label><label class="field"><span>Type</span><select name="kind">${Object.entries(kindLabels).map(([kind, label]) => `<option value="${kind}"${kind === (candidate.kind || item?.plan?.kind || 'unknown') ? ' selected' : ''}>${label}</option>`).join('')}</select></label><label class="field"><span>Person(er) fra planen</span><input name="person" value="${value('person')}" maxlength="400"></label><label class="field"><span>Vogn / arbejdssted</span><input name="vehicle" value="${value('vehicle')}" maxlength="100"></label><label class="field full"><span>Opgave</span><input name="task" value="${value('task')}" maxlength="500"></label><label class="field"><span>Turnummer · hvis angivet</span><input name="route" value="${value('route')}" maxlength="100"></label><div></div><label class="field"><span>Starttid · valgfrit</span><input type="time" name="start" value="${value('start')}"></label><label class="field"><span>Sluttid · valgfrit</span><input type="time" name="end" value="${value('end')}"></label><p class="field-hint full">Begge tidsfelter må være tomme. Så gemmes rækken som en heldagsplan. Navneændringer kan flytte rækken ud af det valgte udsnit.</p><p class="schedule-source-ref full">${escape(ctx, candidate.source?.fileName || '')}${candidate.source?.page ? ` · side ${Number(candidate.source.page)}` : ''}${candidate.source?.row !== undefined ? ` · række ${escape(ctx, candidate.source.row)}` : ''}</p></div>`, data => {
    const start = String(data.get('start') || ''), end = String(data.get('end') || '');
    if (Boolean(start) !== Boolean(end) || (start && start === end)) { ctx.toast('Angiv både start og slut, eller lad begge være tomme. Tiderne må ikke være ens.'); return false; }
    const person = String(data.get('person') || '').trim();
    const updated = { ...candidate, date: String(data.get('date') || ''), kind: String(data.get('kind')), person, vehicle: String(data.get('vehicle') || '').trim(), task: String(data.get('task') || '').trim(), route: String(data.get('route') || '').trim(), start, end, needsReview: true, warnings: [...new Set([...(candidate.warnings || []).map(warningText), 'Rækken er rettet manuelt før import.'])] };
    if (person !== candidate.person) updated.people = person ? [person] : [];
    ui.candidates = ui.candidates.map(row => row.id === id ? updated : row);
    ui.acknowledge = false;
    ctx.closeModal(); ctx.render(); ctx.toast('Rækken er opdateret. Kontrollér den i dit udsnit.');
    return true;
  });
}

function savePreparedImport(ctx) {
  if (!ui.pendingCommit) return false;
  const present = ui.pendingCommit.planIds.filter(id => ctx.state.plans.some(plan => plan.id === id)).length;
  if (present < ui.pendingCommit.added) {
    ui.pendingCommit = null;
    ui.selected = new Set(); ui.acknowledge = false;
    ui.error = 'De klargjorte planer er blevet ændret eller fjernet i de aktuelle data. Gennemgå dit udvalg igen. De læste PDF-rækker er beholdt.';
    ctx.render();
    return false;
  }
  let saved = false;
  try { saved = ctx.save() !== false; }
  catch (error) { ui.error = error.message || 'Browseren kunne ikke gemme importen.'; }
  if (!saved) {
    ui.completed = null;
    ui.notice = '';
    ctx.render();
    ctx.toast('Importen er kun i hukommelsen. Prøv at gemme igen, eller download en backup.');
    return false;
  }
  const pending = ui.pendingCommit;
  const retained = pending.planIds.filter(id => ctx.state.plans.some(plan => plan.id === id)).length;
  ui.completed = { added: Math.min(pending.added, retained), skipped: pending.skipped, replaced: pending.replaced };
  ui.pendingCommit = null;
  ui.candidates = []; ui.selected = null; ui.warnings = []; ui.target = ''; ui.notice = ''; ui.error = '';
  ctx.render();
  ctx.toast(`${ui.completed.added} vagter er gemt i kalenderen.`);
  return true;
}

function commit(ctx) {
  if (ctx.isDemo) { ctx.toast('Skift til dine egne data for at gemme arbejdsplanen.'); return; }
  if (ui.pendingCommit) { savePreparedImport(ctx); return; }
  const result = preview(ctx);
  reconcileSelection(result);
  const selected = selectedItems(result);
  if (!selected.length) { ctx.toast('Vælg mindst én ny vagt, der kan importeres.'); return; }
  if (selected.some(item => item.needsReview) && !ui.acknowledge) { ctx.toast('Bekræft, at du har gennemgået de valgte rækker til kontrol.'); return; }
  if (ui.useDefaultTimes && (!ui.defaultStart || !ui.defaultEnd || ui.defaultStart === ui.defaultEnd)) { ctx.toast('Ret standardtiderne, eller slå dem fra.'); return; }
  try {
    const applied = applyScheduleImport(ctx.state, result, selected.map(item => item.id), { replaceImported: ui.replaceImported, acknowledgeWarnings: ui.acknowledge });
    if (ui.rememberTarget) {
      const settings = { ...applied.state.settings, defaultDriver: ui.mode === 'person' ? ui.target : '', defaultVehicle: ui.mode === 'vehicle' ? ui.target : '' };
      const checked = validateState({ ...applied.state, settings });
      if (!checked.ok) throw new Error(checked.errors[0] || 'Valget til din daglige visning kunne ikke gemmes.');
      applied.state = checked.state;
    }
    ui.pendingCommit = { added: applied.added || 0, skipped: applied.skipped || 0, replaced: applied.replaced || 0, planIds: selected.map(item => item.plan.id) };
    ui.error = '';
    Object.assign(ctx.state, applied.state);
    savePreparedImport(ctx);
  } catch (error) { ui.error = error.message || 'Vagterne kunne ikke tilføjes. Kontrollér de valgte rækker.'; ctx.render(); }
}

function act(ctx, button) {
  const { scheduleAction: action, mode, value, id } = button.dataset;
  if (action === 'choose') { if (ui.pendingCommit) { ctx.toast('Gem den klargjorte import først.'); return; } document.querySelector('#schedule-pdf-files')?.click(); return; }
  if (action === 'cancel') return cancelReading(ctx);
  if (action === 'reset') { if (ui.pendingCommit) { ctx.toast('Gem den klargjorte import, før du starter forfra. Din gennemgang er beholdt.'); return; } resetImport(); ctx.render(); return; }
  if (action === 'retry-save') return savePreparedImport(ctx);
  if (action === 'open-backup') return ctx.navigate('eksport');
  if (action === 'new-job') return ctx.navigate('job');
  if (action === 'calendar') return ctx.navigate('kalender');
  if (action === 'mode' && ['person', 'vehicle'].includes(mode)) { ui.mode = mode; ui.target = ''; ui.search = ''; resetSelection(); renderWithFocus(ctx, 'data-mode', mode); return; }
  if (action === 'target') { ui.target = value; resetSelection(); renderWithFocus(ctx, 'data-value', value); return; }
  if (action === 'select-clear') { ui.selected = new Set(); ui.acknowledge = false; renderWithFocus(ctx, 'data-schedule-action', action); return; }
  if (action === 'select-clear-source') { const result = preview(ctx); ui.selected = new Set(result.items.filter(item => item.status === 'new' && !item.needsReview).map(item => item.id)); ui.acknowledge = false; renderWithFocus(ctx, 'data-schedule-action', action); return; }
  if (action === 'edit-row') return editRow(ctx, id);
  if (action === 'commit') return commit(ctx);
}

function bindActions(ctx, scope = document) {
  scope.querySelectorAll('[data-schedule-action]').forEach(button => button.addEventListener('click', () => act(ctx, button)));
}

export function bindScheduleImport(ctx) {
  latestContext = ctx;
  bindActions(ctx);
  document.querySelector('#schedule-pdf-files')?.addEventListener('change', event => { const files = Array.from(event.target.files || []); event.target.value = ''; readFiles(ctx, files); });
  const zone = document.querySelector('#schedule-dropzone');
  if (zone) {
    zone.addEventListener('dragover', event => { event.preventDefault(); if (!ui.busy && !ui.pendingCommit) zone.classList.add('is-dragging'); });
    zone.addEventListener('dragleave', () => zone.classList.remove('is-dragging'));
    zone.addEventListener('drop', event => { event.preventDefault(); zone.classList.remove('is-dragging'); readFiles(ctx, event.dataTransfer?.files); });
  }
  document.querySelector('#schedule-job')?.addEventListener('change', event => { ui.jobId = event.target.value; resetSelection(); renderWithFocus(ctx, 'id', 'schedule-job'); });
  document.querySelector('#schedule-target-search')?.addEventListener('input', event => {
    ui.search = event.target.value;
    const panel = document.querySelector('.schedule-selection-card');
    if (!panel) return;
    const temporary = document.createElement('div');
    temporary.innerHTML = selectionPanel(ctx);
    const replacement = temporary.querySelector('.schedule-target-list');
    const list = panel.querySelector('.schedule-target-list');
    if (list && replacement) { list.innerHTML = replacement.innerHTML; bindActions(ctx, list); }
  });
  document.querySelectorAll('[data-schedule-option]').forEach(input => input.addEventListener('change', () => {
    const option = input.dataset.scheduleOption;
    ui[option] = input.type === 'checkbox' ? input.checked : input.value;
    ui.error = '';
    if (option !== 'acknowledge') ui.acknowledge = false;
    if (option === 'yearHint' || option === 'weekHint') return;
    renderWithFocus(ctx, 'data-schedule-option', option);
  }));
  document.querySelectorAll('[data-schedule-row]').forEach(input => input.addEventListener('change', () => {
    ui.selected ||= new Set();
    if (input.checked) ui.selected.add(input.dataset.scheduleRow); else ui.selected.delete(input.dataset.scheduleRow);
    ui.acknowledge = false; ui.error = '';
    renderWithFocus(ctx, 'data-schedule-row', input.dataset.scheduleRow);
  }));
  if (!keyListenerInstalled) {
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && ui.busy && document.querySelector('#schedule-import')) { event.preventDefault(); cancelReading(latestContext); }
    });
    keyListenerInstalled = true;
  }
}

export function startSchedulePDFImport(ctx) {
  if (ui.busy || ui.pendingCommit) { ctx.navigate('planimport'); if (ui.pendingCommit) ctx.toast('Din klargjorte import venter på at blive gemt.'); return; }
  ctx.navigate('planimport');
  const input = document.createElement('input');
  input.type = 'file'; input.accept = 'application/pdf,.pdf'; input.multiple = true;
  input.addEventListener('change', () => readFiles(ctx, Array.from(input.files || [])), { once: true });
  input.click();
}
