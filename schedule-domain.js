import {validateState, addDays} from './domain.js';
import {matchSchedulePerson} from './schedule-parser.js';

const DAY = 86400000;
const kinds = ['work', 'off', 'holiday', 'freeHoliday', 'sick', 'absence', 'unknown', 'unassigned'];
const normalize = value => String(value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/ø/gi, 'o').replace(/æ/gi, 'ae').toLowerCase().replace(/\s+/g, ' ').trim();
const exactName = value => typeof value === 'string' ? value.trim().normalize('NFC').toLocaleLowerCase('da-DK') : '';
const unique = values => [...new Set(values.filter(Boolean))];
const time = value => typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value) ? Number(value.slice(0, 2)) * 60 + Number(value.slice(3)) : null;
const dateValid = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value + 'T00:00:00Z')) && new Date(value + 'T00:00:00Z').toISOString().slice(0, 10) === value;
const jsonClone = value => JSON.parse(JSON.stringify(value));
const people = plan => unique([plan.driver, ...String(plan.colleague || '').split(','), ...(plan.people || [])].map(normalize));
const replaceablePdf = plan => plan.source?.type === 'pdf' && dateValid(plan.date);

function calendarIdentity(options) {
  const person = String(options.target?.value || '').trim();
  const aliases = options.aliases ?? [];
  if (!person || person.length > 200 || /[,\r\n]/.test(person) || options.target?.mode !== 'person' || !Array.isArray(aliases) || aliases.length > 20 ||
      aliases.some(alias => typeof alias !== 'string' || !alias.trim() || alias.length > 200 || /[,\r\n]/.test(alias))) {
    throw new Error('Kalenderimporten indeholder et ugyldigt navn eller en ugyldig stavevariant.');
  }
  return {person, aliases: unique(aliases.map(exactName)).filter(alias => alias !== exactName(person)), jobId: options.jobId};
}

function canonicalName(value, identity) {
  return identity.aliases.includes(exactName(value)) ? identity.person : value;
}

function canonicalPlan(plan, identity) {
  if (!identity.aliases.length || plan.jobId !== identity.jobId) return plan;
  const driver = canonicalName(plan.driver, identity);
  const names = plan.people?.map(name => canonicalName(name, identity));
  const colleague = typeof plan.colleague === 'string' ? plan.colleague.replace(/[^,]+/g, name => {
    const trimmed = name.trim();
    const canonical = canonicalName(trimmed, identity);
    return canonical === trimmed ? name : name.replace(trimmed, canonical);
  }) : plan.colleague;
  const namesChanged = names?.some((name, index) => name !== plan.people[index]);
  if (driver === plan.driver && colleague === plan.colleague && !namesChanged) return plan;
  const next = {...plan};
  if (driver !== plan.driver) next.driver = driver;
  if (colleague !== plan.colleague) next.colleague = colleague;
  if (namesChanged) next.people = unique(names);
  return next;
}

function renameCalendarAliases(state, identity) {
  const plans = state.plans.map(plan => ['pdf', 'calendar'].includes(plan.source?.type) ? canonicalPlan(plan, identity) : plan);
  const defaultDriver = canonicalName(state.settings.defaultDriver, identity);
  const changedDriver = defaultDriver !== state.settings.defaultDriver;
  const changedPlans = plans.filter((plan, index) => plan !== state.plans[index]).length;
  return {plans, settings: changedDriver ? {...state.settings, defaultDriver} : state.settings, count: changedPlans + Number(changedDriver)};
}
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
const exactPeople = plan => unique([plan.driver, ...String(plan.colleague || '').split(','), ...(plan.people || [])].map(exactName));

function calendarDuplicate(plan, other) {
  return other.date === plan.date && other.jobId === plan.jobId && (other.kind || 'work') === (plan.kind || 'work') &&
    exactPeople(other).includes(exactName(plan.driver)) && normalize(other.vehicle) === normalize(plan.vehicle) &&
    (!(plan.start && plan.end) || (plan.start === other.start && plan.end === other.end));
}

function calendarPlanConflict(plan, other) {
  if (other.jobId !== plan.jobId) return false;
  const matchingDate = planDatesNear(other, plan.date).includes(plan.date);
  const names = exactPeople(other);
  return overlaps(plan, other) || (matchingDate && (!names.length || names.includes(exactName(plan.driver))));
}

function calendarEntryConflict(plan, entry, identity) {
  if (entry.jobId !== plan.jobId) return false;
  if (entry.date !== plan.date) return overlaps(plan, entry);
  if (entry.type !== 'work' || (entry.vehicle && normalize(entry.vehicle) !== normalize(plan.vehicle))) return true;
  const named = exactPeople(entry).map(name => exactName(canonicalName(name, identity)));
  return named.length > 0 && !named.includes(exactName(plan.driver));
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
  const plan = {id: '', date: candidate.date || '', jobId: options.jobId || '', scheme: String(options.scheme || job?.scheme || ''), title: candidate.title || candidate.task || (vehicle ? `Arbejdsplan · ${vehicleLabel}` : 'Arbejdsplan'), start, end, vehicle, route: String(candidate.route || ''), notes: String(candidate.notes || ''), driver, colleague, crew: listed.length > 1 ? 'Med kollega' : listed.length === 1 || driver ? 'Alene' : '', people: listed, kind: candidate.kind || (candidate.status === 'unassigned' || candidate.status === 'unknown' ? candidate.status : 'work'), source: {type: source.type === 'calendar' ? 'calendar' : 'pdf', fileName: String(source.fileName || ''), fileHash: source.fileHash || '', page: source.page, row: source.row, importedAt, week: source.week ?? null, year: source.year ?? null}};
  let suffix = 2166136261;
  for (const character of key(plan)) { suffix ^= character.charCodeAt(0); suffix = Math.imul(suffix, 16777619); }
  plan.id = `pdf-${candidate.id || ''}-${(suffix >>> 0).toString(36)}`;
  return plan;
}

export function prepareScheduleImport(state, candidates, options = {}) {
  const job = state.jobs.find(job => job.id === options.jobId);
  const importedAt = new Date().toISOString(), items = [], accepted = [];
  const sourceCandidates = Array.isArray(candidates) ? candidates : [];
  const calendar = sourceCandidates.some(candidate => candidate?.source?.type === 'calendar');
  if (calendar && sourceCandidates.some(candidate => candidate?.source?.type !== 'calendar')) throw new Error('Importer kalenderfilen separat fra andre arbejdsplaner.');
  const identity = calendar ? calendarIdentity(options) : null;
  const calendarPlans = identity ? state.plans.map(plan => canonicalPlan(plan, identity)) : [];
  const existingKeys = new Map(state.plans.filter(plan => plan.date).map(plan => [key(plan), plan]));
  const ids = new Map();
  for (const candidate of sourceCandidates) {
    if (!candidate || typeof candidate !== 'object') continue;
    const isCalendar = candidate.source?.type === 'calendar';
    const target = options.target || {};
    const listed = isCalendar && Array.isArray(candidate.people) ? candidate.people : [];
    const candidateNames = [...listed, candidate.person].filter(Boolean);
    const calendarName = isCalendar && candidateNames.find(name => exactName(canonicalName(name, identity)) === exactName(identity.person));
    const match = isCalendar ? {match: Boolean(calendarName), kind: 'exact', needsReview: false, matchedName: calendarName}
      : target.mode === 'person' ? matchSchedulePerson(candidate, target.value) : {match: normalize(candidate.vehicle) === normalize(target.value), kind: 'exact', needsReview: false};
    if (!target.value || !match.match) continue;
    const normalizedCandidate = isCalendar ? {...candidate, people: unique(listed.map(name => canonicalName(name, identity)))} : candidate;
    const plan = makePlan(normalizedCandidate, options, job, importedAt, match);
    const errors = candidateErrors(candidate, plan, job, options);
    if (ids.has(candidate.id) && ids.get(candidate.id) !== key(plan)) errors.push('Kandidat-id bruges til forskellige planer i importen.');
    ids.set(candidate.id, key(plan));
    const warnings = [...(candidate.warnings || [])];
    if (match.kind === 'similar') warnings.push('Navnet ligner det valgte navn, men identiteten skal bekræftes.');
    if (match.kind === 'contains') warnings.push('Navnet er et delvist match og skal bekræftes.');
    const item = {id: candidate.id, candidate, plan, status: 'new', errors, warnings: unique(warnings), needsReview: Boolean(candidate.needsReview || match.needsReview || plan.kind === 'unknown' || plan.kind === 'unassigned'), existingPlanIds: [], canReplace: false, batchConflictOnly: false};
    if (errors.length) item.status = 'invalid';
    else {
      const duplicate = isCalendar
        ? [...calendarPlans, ...accepted].find(other => calendarDuplicate(plan, other))
        : existingKeys.get(key(plan)) || accepted.find(other => key(other) === key(plan));
      if (duplicate) { item.status = 'duplicate'; item.existingPlanIds = [duplicate.id]; }
      else {
        const conflicts = isCalendar ? calendarPlanConflict : overlaps;
        const oldPlans = (isCalendar ? calendarPlans : state.plans).filter(other => conflicts(plan, other));
        const batch = accepted.filter(other => conflicts(plan, other));
        const actual = state.entries.filter(other => isCalendar ? calendarEntryConflict(plan, other, identity) : overlaps(plan, other));
        if (oldPlans.length || batch.length || actual.length) {
          item.status = 'conflict';
          item.existingPlanIds = oldPlans.map(plan => plan.id);
          item.batchConflictOnly = batch.length > 0 && !oldPlans.length && !actual.length;
          item.canReplace = !isCalendar && !actual.length && !batch.length && oldPlans.length > 0 && oldPlans.every(replaceablePdf);
          item.warnings.push(actual.length ? 'Der er en konflikt med registreret arbejde eller fravær.' : batch.length ? 'En anden kandidat i denne import overlapper.' : item.canReplace ? 'En tidligere PDF-plan overlapper og kan erstattes efter dit valg.' : 'En eksisterende arbejdsplan overlapper og bevares.');
        }
      }
      if (item.status === 'new' || item.status === 'conflict') accepted.push(plan);
    }
    items.push(item);
  }
  const counts = {new: 0, duplicate: 0, conflict: 0, invalid: 0, total: items.length, needsReview: 0};
  for (const item of items) { counts[item.status]++; if (item.needsReview) counts.needsReview++; }
  return {items, counts, calendarIdentity: identity, renameCount: identity ? renameCalendarAliases(state, identity).count : 0};
}

export function applyScheduleImport(state, preview, selectedIds, {replaceImported = false, acknowledgeWarnings = false, renameAliases = false} = {}) {
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
    const plan = jsonClone(item.plan), isCalendar = plan.source.type === 'calendar';
    const current = state.plans.filter(plan => !removed.has(plan.id));
    const comparable = isCalendar ? current.map(other => canonicalPlan(other, preview.calendarIdentity)) : current;
    const matches = isCalendar ? calendarDuplicate : (a, b) => b.date && key(a) === key(b);
    const conflictsWith = isCalendar ? calendarPlanConflict : overlaps;
    if ([...comparable, ...incoming].some(other => matches(plan, other))) { skipped++; continue; }
    if (state.entries.some(other => isCalendar ? calendarEntryConflict(plan, other, preview.calendarIdentity) : overlaps(plan, other))) throw new Error('Planen overlapper en faktisk registrering, som altid bevares.');
    if (incoming.some(other => conflictsWith(plan, other))) throw new Error('De valgte planer overlapper hinanden.');
    const conflicts = comparable.filter(other => conflictsWith(plan, other));
    if (conflicts.length) {
      if (isCalendar || !replaceImported || conflicts.some(other => !replaceablePdf(other))) throw new Error('Planen overlapper en manuel, gentaget eller ubekræftet plan.');
      conflicts.forEach(other => removed.add(other.id));
    }
    // Same content in a newly named PDF is still duplicate; provenance is preserved.
    plan.source.importedAt = importedAt;
    incoming.push(plan); added++;
  }
  const renames = renameAliases && preview.calendarIdentity ? renameCalendarAliases(state, preview.calendarIdentity) : null;
  const next = {...state, settings: renames?.settings || state.settings, plans: [...(renames?.plans || state.plans).filter(plan => !removed.has(plan.id)), ...incoming]};
  const checked = validateState(next);
  if (!checked.ok) throw new Error(checked.errors.join(' '));
  return {state: checked.state, added, skipped, replaced: removed.size, renamed: renames?.count || 0};
}
