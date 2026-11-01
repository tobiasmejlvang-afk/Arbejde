import {validateState, addDays} from './domain.js';
import {matchSchedulePerson} from './schedule-parser.js';

const DAY = 86400000;
const kinds = ['work', 'off', 'holiday', 'freeHoliday', 'sick', 'absence', 'unknown', 'unassigned'];
const normalize = value => String(value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/ø/gi, 'o').replace(/æ/gi, 'ae').toLowerCase().replace(/\s+/g, ' ').trim();
const unique = values => [...new Set(values.filter(Boolean))];
const time = value => typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value) ? Number(value.slice(0, 2)) * 60 + Number(value.slice(3)) : null;
const dateValid = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value + 'T00:00:00Z')) && new Date(value + 'T00:00:00Z').toISOString().slice(0, 10) === value;
const jsonClone = value => JSON.parse(JSON.stringify(value));
const people = plan => unique([plan.driver, plan.colleague, ...(plan.people || [])].map(normalize));
function interval(plan, date = plan.date) {
  if (!dateValid(date)) return null;
  const stamp = Date.parse(date + 'T00:00:00Z'), start = time(plan.start), end = time(plan.end);
  if (start === null || end === null || (plan.type && plan.type !== 'work')) return [stamp, stamp + DAY];
  return [stamp + start * 60000, stamp + (end <= start ? end + 1440 : end) * 60000];
}
function sharesResource(a, b) {
  const aPeople = people(a), bPeople = people(b);
  if (aPeople.some(person => bPeople.includes(person))) return true;
  if (normalize(a.vehicle) && normalize(a.vehicle) === normalize(b.vehicle)) return true;
  // A personal plan with no identity/resource cannot safely be assumed unrelated.
  return (!aPeople.length && !a.vehicle) || (!bPeople.length && !b.vehicle);
}
function planDatesNear(plan, date) {
  if (plan.date) return [plan.date];
  if (!dateValid(plan.from) || !dateValid(plan.to) || !Array.isArray(plan.weekdays)) return [];
  return [-1, 0, 1].map(offset => addDays(date, offset)).filter(day => day >= plan.from && day <= plan.to && plan.weekdays.includes(((new Date(day + 'T00:00:00Z').getUTCDay() + 6) % 7) + 1));
}
function overlaps(a, b) {
  if (a.jobId !== b.jobId || !sharesResource(a, b)) return false;
  const span = interval(a);
  if (!span) return false;
  return planDatesNear(b, a.date).some(date => {
    const other = interval(b, date);
    return other && span[0] < other[1] && span[1] > other[0];
  });
}
function key(plan) {
  return JSON.stringify([plan.date, plan.jobId, people(plan).sort(), normalize(plan.vehicle), plan.kind || 'work', normalize(plan.title), plan.start || '', plan.end || '']);
}
function candidateErrors(candidate, plan, job, options) {
  const errors = [];
  if (!candidate || typeof candidate !== 'object' || typeof candidate.id !== 'string' || !candidate.id || candidate.id.length > 180) errors.push('Kandidaten mangler et gyldigt id.');
  if (!job) errors.push('Vælg et eksisterende job.');
  if (!dateValid(plan.date)) errors.push('Vælg en gyldig dato.');
  if (!['3', '4', '5'].includes(plan.scheme)) errors.push('Vælg en gyldig arbejdsuge.');
  if (!kinds.includes(plan.kind)) errors.push('Plantypen er ugyldig.');
  if (typeof plan.title !== 'string' || !plan.title.trim()) errors.push('Planen mangler en titel.');
  if ((plan.start || plan.end) && (time(plan.start) === null || time(plan.end) === null || plan.start === plan.end)) errors.push('Angiv både en gyldig starttid og sluttid, eller lad begge være tomme.');
  if (options.useDefaultTimes && (time(options.defaultStart) === null || time(options.defaultEnd) === null || options.defaultStart === options.defaultEnd)) errors.push('Standardtiderne skal have en gyldig start- og sluttid.');
  for (const value of [plan.driver, plan.colleague, plan.vehicle, plan.route]) if (typeof value !== 'string' || value.length > 200) errors.push('Bemanding, vogn og tur skal være tekst på højst 200 tegn.');
  if (plan.people.length > 20 || plan.people.some(person => typeof person !== 'string' || !person.trim() || person.length > 200)) errors.push('Kontrollér personlisten (højst 20 navne).');
  const source = plan.source;
  if (!source.fileName || source.fileName.length > 255 || /[<>:"/\\|?*]/.test(source.fileName)) errors.push('Kildefilnavnet er ugyldigt.');
  if (typeof source.fileHash !== 'string' || (source.fileHash && !/^(?:pdfjs:)?[a-f0-9]{16,128}$/i.test(source.fileHash))) errors.push('Kildefingeraftrykket er ugyldigt.');
  if (!Number.isInteger(source.page) || source.page < 1 || source.page > 10000 || !((Number.isInteger(source.row) && source.row >= 0) || (typeof source.row === 'string' && source.row.length > 0 && source.row.length <= 200))) errors.push('Kildens side eller række er ugyldig.');
  if (source.week !== null && (!Number.isInteger(source.week) || source.week < 1 || source.week > 53)) errors.push('Kildens uge er ugyldig.');
  if (source.year !== null && (!Number.isInteger(source.year) || source.year < 1900 || source.year > 2199)) errors.push('Kildens år er ugyldigt.');
  return unique(errors);
}
function makePlan(candidate, options, job, importedAt, match) {
  const source = candidate.source || {};
  const listed = unique((Array.isArray(candidate.people) ? candidate.people : []).filter(person => typeof person === 'string' && person.trim()));
  const driver = options.target?.mode === 'person' ? String(options.target.value || '') : String(candidate.driver || '');
  const colleague = driver ? listed.filter(person => normalize(person) !== normalize(driver) && normalize(person) !== normalize(match?.matchedName)).join(', ') : '';
  const start = candidate.start || (options.useDefaultTimes ? options.defaultStart : '') || '';
  const end = candidate.end || (options.useDefaultTimes ? options.defaultEnd : '') || '';
  const vehicle = String(candidate.vehicle || '');
  const vehicleLabel = /^\d+$/.test(vehicle) ? `Vogn ${vehicle}` : vehicle;
  const plan = {id: '', date: candidate.date || '', jobId: options.jobId || '', scheme: String(options.scheme || job?.scheme || ''), title: candidate.title || candidate.task || (vehicle ? `Arbejdsplan · ${vehicleLabel}` : 'Arbejdsplan'), start, end, vehicle, route: String(candidate.route || ''), notes: String(candidate.notes || ''), driver, colleague, crew: listed.length > 1 ? 'Med kollega' : listed.length === 1 || driver ? 'Alene' : '', people: listed, kind: candidate.kind || (candidate.status === 'unassigned' || candidate.status === 'unknown' ? candidate.status : 'work'), source: {type: 'pdf', fileName: String(source.fileName || ''), fileHash: source.fileHash || '', page: source.page, row: source.row, importedAt, week: source.week ?? null, year: source.year ?? null}};
  let suffix = 2166136261;
  for (const character of key(plan)) { suffix ^= character.charCodeAt(0); suffix = Math.imul(suffix, 16777619); }
  plan.id = `pdf-${candidate.id || ''}-${(suffix >>> 0).toString(36)}`;
  return plan;
}

export function prepareScheduleImport(state, candidates, options = {}) {
  const job = state.jobs.find(job => job.id === options.jobId);
  const importedAt = new Date().toISOString(), items = [], accepted = [];
  const existingKeys = new Map(state.plans.filter(plan => plan.date).map(plan => [key(plan), plan]));
  const ids = new Map();
  for (const candidate of Array.isArray(candidates) ? candidates : []) {
    if (!candidate || typeof candidate !== 'object') continue;
    const target = options.target || {}, match = target.mode === 'person' ? matchSchedulePerson(candidate, target.value) : {match: normalize(candidate.vehicle) === normalize(target.value), kind: 'exact', needsReview: false};
    if (!target.value || !match.match) continue;
    const plan = makePlan(candidate, options, job, importedAt, match);
    const errors = candidateErrors(candidate, plan, job, options);
    if (ids.has(candidate.id) && ids.get(candidate.id) !== key(plan)) errors.push('Kandidat-id bruges til forskellige planer i importen.');
    ids.set(candidate.id, key(plan));
    const warnings = [...(candidate.warnings || [])];
    if (match.kind === 'similar') warnings.push('Navnet ligner det valgte navn, men identiteten skal bekræftes.');
    if (match.kind === 'contains') warnings.push('Navnet er et delvist match og skal bekræftes.');
    const item = {id: candidate.id, candidate, plan, status: 'new', errors, warnings: unique(warnings), needsReview: Boolean(candidate.needsReview || match.needsReview || plan.kind === 'unknown' || plan.kind === 'unassigned'), existingPlanIds: [], canReplace: false, batchConflictOnly: false};
    if (errors.length) item.status = 'invalid';
    else {
      const duplicate = existingKeys.get(key(plan)) || accepted.find(other => key(other) === key(plan));
      if (duplicate) { item.status = 'duplicate'; item.existingPlanIds = [duplicate.id]; }
      else {
        const oldPlans = state.plans.filter(other => overlaps(plan, other));
        const batch = accepted.filter(other => overlaps(plan, other));
        const actual = state.entries.filter(other => overlaps(plan, other));
        if (oldPlans.length || batch.length || actual.length) {
          item.status = 'conflict';
          item.existingPlanIds = oldPlans.map(plan => plan.id);
          item.batchConflictOnly = batch.length > 0 && !oldPlans.length && !actual.length;
          item.canReplace = !actual.length && !batch.length && oldPlans.length > 0 && oldPlans.every(plan => plan.source?.type === 'pdf');
          item.warnings.push(actual.length ? 'Der findes allerede faktisk registreret arbejde eller fravær.' : batch.length ? 'En anden kandidat i denne import overlapper.' : item.canReplace ? 'En tidligere PDF-plan overlapper og kan erstattes efter dit valg.' : 'En manuel arbejdsplan overlapper og bevares.');
        }
      }
      if (item.status === 'new' || item.status === 'conflict') accepted.push(plan);
    }
    items.push(item);
  }
  const counts = {new: 0, duplicate: 0, conflict: 0, invalid: 0, total: items.length, needsReview: 0};
  for (const item of items) { counts[item.status]++; if (item.needsReview) counts.needsReview++; }
  return {items, counts};
}

export function applyScheduleImport(state, preview, selectedIds, {replaceImported = false, acknowledgeWarnings = false} = {}) {
  const selected = new Set(selectedIds || []), items = preview?.items || [];
  if ([...selected].some(id => !items.some(item => item.id === id))) throw new Error('Valget er ændret; klargør importen igen.');
  let added = 0, skipped = 0;
  const importedAt = new Date().toISOString();
  const removed = new Set(), incoming = [];
  for (const item of items.filter(item => selected.has(item.id))) {
    if (item.status === 'duplicate') { skipped++; continue; }
    if (item.status === 'invalid') throw new Error(item.errors.join(' ') || 'Importen indeholder en ugyldig plan.');
    if (item.needsReview && !acknowledgeWarnings) throw new Error('Bekræft, at du har kontrolleret advarsler og navneforslag.');
    if (item.status === 'conflict' && !item.batchConflictOnly && (!item.canReplace || !replaceImported)) throw new Error('Konflikten kan ikke importeres uden en udtrykkelig tilladt erstatning.');
    const plan = jsonClone(item.plan), current = state.plans.filter(plan => !removed.has(plan.id));
    if ([...current, ...incoming].some(other => other.date && key(other) === key(plan))) { skipped++; continue; }
    if (state.entries.some(other => overlaps(plan, other))) throw new Error('Planen overlapper en faktisk registrering, som altid bevares.');
    if (incoming.some(other => overlaps(plan, other))) throw new Error('De valgte planer overlapper hinanden.');
    const conflicts = current.filter(other => overlaps(plan, other));
    if (conflicts.length) {
      if (!replaceImported || conflicts.some(other => other.source?.type !== 'pdf')) throw new Error('Planen overlapper en manuel eller ubekræftet plan.');
      conflicts.forEach(other => removed.add(other.id));
    }
    // Same content in a newly named PDF is still duplicate; provenance is preserved.
    plan.source.importedAt = importedAt;
    incoming.push(plan); added++;
  }
  const next = {...state, plans: [...state.plans.filter(plan => !removed.has(plan.id)), ...incoming]};
  const checked = validateState(next);
  if (!checked.ok) throw new Error(checked.errors.join(' '));
  return {state: checked.state, added, skipped, replaced: removed.size};
}
