// All dates are date-only ISO values and all arithmetic uses UTC to avoid DST drift.
// Contract assumptions are explicit: 12.33 × 3 = 36.99 h and 4 × 7.4 + 7 = 36.6 h,
// although the supplied contract says 37 h/week. We preserve the supplied daily norms.
export const WASTE_TYPES = ['Mad', 'Rest', 'Pap/Papir', 'Plast', 'Glas', 'Metal', 'Haveaffald', 'Storskrald'];
export const ENTRY_TYPES = ['work', 'sick', 'off', 'holiday', 'freeHoliday', 'absence'];
const DAY = 86400000;
const validDate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value + 'T00:00:00Z')) && new Date(value + 'T00:00:00Z').toISOString().slice(0, 10) === value;
const stamp = date => Date.parse(date + 'T00:00:00Z');
const iso = value => new Date(value).toISOString().slice(0, 10);
const round = (value, precision = 2) => Math.round((value + Number.EPSILON) * 10 ** precision) / 10 ** precision;
const numeric = value => typeof value === 'number' && Number.isFinite(value);
const timeValue = value => /^([01]\d|2[0-3]):[0-5]\d$/.test(value || '') ? Number(value.slice(0, 2)) * 60 + Number(value.slice(3)) : null;
const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
const record = value => !!value && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;

export function todayISO() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}
export function uid() { return globalThis.crypto?.randomUUID?.() || `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 11)}`; }
export function addDays(date, days) { return iso(stamp(date) + days * DAY); }
export function weekStart(date) { return addDays(date, -((new Date(stamp(date)).getUTCDay() + 6) % 7)); }
export function monthRange(date = todayISO()) {
  const d = new Date(stamp(date));
  return {start: iso(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)), end: iso(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0))};
}
export function dateLabel(date, options = {}) {
  if (!validDate(date)) return '—';
  return new Intl.DateTimeFormat('da-DK', {day: 'numeric', month: 'short', ...options, timeZone: 'UTC'}).format(new Date(stamp(date)));
}
export function money(value) { return new Intl.NumberFormat('da-DK', {style: 'currency', currency: 'DKK', maximumFractionDigits: 2}).format(Number(value) || 0); }
export function hours(value) { return new Intl.NumberFormat('da-DK', {minimumFractionDigits: 2, maximumFractionDigits: 2}).format(Number(value) || 0); }

export function defaultJob(overrides = {}) {
  return {id: uid(), name: 'Mit arbejde', employer: '', role: 'Renovationsmedarbejder', employment: '', startDate: '', scheme: '3', hourlyRate: 0, overtimeRate: 0, periodType: 'month', periodAnchor: weekStart(todayISO()), payday: 31, paydayOffset: 7, pensionEmployee: 0, pensionEmployer: 0, holidayPercent: 0, choicePercent: 0, holidayDays: 0, freeHolidayDays: 0, sickPayPercent: 0, notes: '', ...overrides};
}
export function emptyState() {
  const job = defaultJob();
  return {version: 1, jobs: [job], entries: [], plans: [], vehicles: [], routes: [], settings: {name: '', defaultJobId: job.id}};
}
export function demoState() {
  const state = emptyState();
  state.settings.name = 'Tobias';
  state.jobs[0] = defaultJob({id: state.jobs[0].id, name: 'Renovation · 3 dages uge', employer: 'Eksempelvirksomhed', employment: 'Fastansat · eksempel', startDate: '2026-01-01', hourlyRate: 185, overtimeRate: 277.50, pensionEmployee: 2, pensionEmployer: 10, holidayPercent: 12.5, choicePercent: 9, holidayDays: 25, freeHolidayDays: 5, sickPayPercent: 100});
  state.vehicles = ['104', '112', '127']; state.routes = ['Rute 12', 'Rute 24', 'Rute 38'];
  const monday = weekStart(todayISO());
  state.entries = [0, 1, 2].map((day, index) => ({id: uid(), date: addDays(monday, day), jobId: state.jobs[0].id, type: 'work', scheme: '3', start: '05:30', end: index === 2 ? '18:30' : '15:00', breakMinutes: 0, vehicle: '104', route: 'Rute 12', crew: 'Alene', empties: 286 + index * 18, waste: ['Mad', 'Rest'], extras: [], notes: ''}));
  state.plans = [{id: uid(), from: monday, to: addDays(monday, 27), weekdays: [1, 2, 3], jobId: state.jobs[0].id, scheme: '3', title: 'Planlagt tur', start: '05:30', end: '15:00', vehicle: '112', route: 'Rute 24', notes: ''}];
  return state;
}

export function payPeriod(job, date = todayISO()) {
  if (job.periodType === '14days') {
    const anchor = validDate(job.periodAnchor) ? job.periodAnchor : weekStart(date);
    const start = addDays(anchor, Math.floor((stamp(date) - stamp(anchor)) / DAY / 14) * 14);
    const end = addDays(start, 13);
    return {start, end, payday: addDays(end, Number(job.paydayOffset) || 0), label: `${dateLabel(start)} – ${dateLabel(end)}`};
  }
  const {start, end} = monthRange(date);
  const payday = `${start.slice(0, 8)}${String(Math.max(1, Math.min(Number(job.payday) || 31, Number(end.slice(-2))))).padStart(2, '0')}`;
  return {start, end, payday, label: new Intl.DateTimeFormat('da-DK', {month: 'long', year: 'numeric', timeZone: 'UTC'}).format(new Date(stamp(date)))};
}

function shiftMinutes(entry) {
  const start = timeValue(entry.start), end = timeValue(entry.end);
  if (start === null || end === null || start === end) return 0;
  return Math.max(0, (end < start ? end + 1440 : end) - start - (Number(entry.breakMinutes) || 0));
}
function dailyNorm(scheme, date) {
  if (scheme === '3') return 12.33;
  if (scheme === '4') return 9.25;
  const day = new Date(stamp(date)).getUTCDay();
  return day === 0 || day === 6 ? 0 : day === 5 ? 7 : 7.4;
}

export function calculateAll(state) {
  const jobs = new Map(state.jobs.map(job => [job.id, job]));
  const sorted = [...state.entries].sort((a, b) => a.date.localeCompare(b.date) || (a.start || '').localeCompare(b.start || '') || a.id.localeCompare(b.id));
  const days = new Map();
  const weekDays = new Map();
  for (const entry of sorted) {
    if (entry.type !== 'work' || !jobs.has(entry.jobId)) continue;
    const key = `${entry.jobId}/${entry.date}`;
    if (!days.has(key)) {
      const weekKey = `${entry.jobId}/${weekStart(entry.date)}`;
      const dayIndex = (weekDays.get(weekKey) || 0) + 1;
      weekDays.set(weekKey, dayIndex);
      days.set(key, {entries: [], dayIndex});
    }
    days.get(key).entries.push(entry);
  }
  const allocation = new Map();
  for (const group of days.values()) {
    const first = group.entries[0], job = jobs.get(first.jobId), scheme = first.scheme || job.scheme;
    const norm = dailyNorm(scheme, first.date);
    const extraDay = scheme === '3' ? group.dayIndex > 3 : scheme === '4' ? group.dayIndex > 4 : norm === 0;
    const guaranteed = (scheme === '3' || scheme === '4') && !extraDay;
    // Extra tasks are part of the shift; only explicitly paid overtime is reclassified.
    // A guaranteed accord day keeps its base guarantee while paid extras become overtime.
    let baseCapacity = extraDay ? 0 : norm;
    let remainingGuarantee = guaranteed ? norm : 0;
    for (let index = 0; index < group.entries.length; index++) {
      const entry = group.entries[index], actual = shiftMinutes(entry) / 60;
      const explicitOT = Math.min(actual, (entry.extras || []).filter(extra => extra.paidOvertime).reduce((sum, extra) => sum + (Number(extra.minutes) || 0) / 60, 0));
      const ordinary = Math.min(baseCapacity, Math.max(0, actual - explicitOT));
      baseCapacity = Math.max(0, baseCapacity - ordinary);
      remainingGuarantee = Math.max(0, remainingGuarantee - ordinary);
      const guarantee = guaranteed && index === group.entries.length - 1 ? remainingGuarantee : 0;
      allocation.set(entry.id, {actualHours: actual, baseHours: ordinary + guarantee, overtimeHours: actual - ordinary, guaranteeHours: guarantee, dayIndex: group.dayIndex, nominalHours: norm, extraDay});
    }
  }
  return sorted.map(entry => {
    const job = jobs.get(entry.jobId);
    const scheme = entry.scheme || job?.scheme || '3';
    let calculated = allocation.get(entry.id) || {actualHours: 0, baseHours: 0, overtimeHours: 0, guaranteeHours: 0, dayIndex: null, nominalHours: dailyNorm(scheme, entry.date), extraDay: false};
    if (entry.type === 'sick') calculated = {...calculated, baseHours: calculated.nominalHours * (Number(job?.sickPayPercent) || 0) / 100};
    const basePay = round(calculated.baseHours * (Number(job?.hourlyRate) || 0));
    const overtimePay = round(calculated.overtimeHours * (Number(job?.overtimeRate) || 0));
    const grossPay = round(basePay + overtimePay);
    const missingRates = [];
    if (calculated.baseHours > 0 && !(job?.hourlyRate > 0)) missingRates.push('hourlyRate');
    if (calculated.overtimeHours > 0 && !(job?.overtimeRate > 0)) missingRates.push('overtimeRate');
    // Money is rounded per entry to øre, totals sum those amounts; hours stay unrounded
    // for calculations. Vacation and free holiday consume days but assume no wage.
    return {entry, job, ...calculated, paidHours: calculated.baseHours + calculated.overtimeHours, basePay, overtimePay, grossPay, pensionEmployee: round(grossPay * (Number(job?.pensionEmployee) || 0) / 100), pensionEmployer: round(grossPay * (Number(job?.pensionEmployer) || 0) / 100), choice: round(grossPay * (Number(job?.choicePercent) || 0) / 100), holidayAccrual: round(grossPay * (Number(job?.holidayPercent) || 0) / 100), rateMissing: missingRates.length > 0, missingRates};
  });
}
export function summarize(rows) {
  const fields = ['actualHours', 'baseHours', 'overtimeHours', 'paidHours', 'basePay', 'overtimePay', 'grossPay', 'pensionEmployee', 'pensionEmployer', 'choice', 'holidayAccrual', 'guaranteeHours'];
  const result = Object.fromEntries(fields.map(field => [field, round(rows.reduce((sum, row) => sum + (row[field] || 0), 0), field.endsWith('Hours') ? 4 : 2)]));
  return {...result, days: new Set(rows.map(row => row.entry.date)).size, workDays: new Set(rows.filter(row => row.entry.type === 'work').map(row => `${row.entry.jobId}/${row.entry.date}`)).size, holidayDays: rows.filter(row => row.entry.type === 'holiday').length, freeHolidayDays: rows.filter(row => row.entry.type === 'freeHoliday').length, sickDays: rows.filter(row => row.entry.type === 'sick').length, absenceDays: rows.filter(row => row.entry.type === 'absence').length, empties: rows.reduce((sum, row) => sum + (row.entry.type === 'work' ? Number(row.entry.empties) || 0 : 0), 0), rateMissing: rows.some(row => row.rateMissing), entries: rows.length};
}

function interval(entry) {
  if (!validDate(entry.date) || !ENTRY_TYPES.includes(entry.type)) return null;
  if (entry.type !== 'work') return [stamp(entry.date), stamp(entry.date) + DAY];
  const start = timeValue(entry.start), end = timeValue(entry.end);
  if (start === null || end === null || start === end) return null;
  const begin = stamp(entry.date) + start * 60000;
  return [begin, stamp(entry.date) + (end < start ? end + 1440 : end) * 60000];
}
function validateExtra(extra, index) {
  const errors = [], label = `Ekstraarbejde ${index + 1}`;
  if (!record(extra)) return [`${label}: ugyldigt format.`];
  if (!['emptying', 'task'].includes(extra.kind)) errors.push(`${label}: vælg en type.`);
  if (!numeric(extra.minutes) || extra.minutes <= 0 || extra.minutes > 1440) errors.push(`${label}: tidsforbrug skal være mellem 1 og 1.440 minutter.`);
  if (typeof extra.paidOvertime !== 'boolean') errors.push(`${label}: overarbejdsbetaling skal vælges.`);
  if (extra.kind === 'task' && !String(extra.task || '').trim()) errors.push(`${label}: beskriv arbejdsopgaven.`);
  if (extra.waste && !WASTE_TYPES.includes(extra.waste)) errors.push(`${label}: ukendt affaldstype.`);
  return errors;
}
export function validateEntry(entry, state, skipConflicts = false) {
  if (!record(entry)) return ['Registreringen har et ugyldigt format.'];
  const errors = [];
  if (!entry.id || typeof entry.id !== 'string') errors.push('Registreringen mangler et id.');
  if (!validDate(entry.date)) errors.push('Vælg en gyldig dato.');
  const job = state.jobs.find(item => item.id === entry.jobId);
  if (!job) errors.push('Vælg et eksisterende job.');
  if (!ENTRY_TYPES.includes(entry.type)) errors.push('Vælg en gyldig registreringstype.');
  if (!['3', '4', '5'].includes(entry.scheme || job?.scheme)) errors.push('Vælg en gyldig arbejdsuge.');
  if (own(entry, 'extras') && !Array.isArray(entry.extras)) errors.push('Ekstraarbejde skal være en liste.');
  if (own(entry, 'waste') && (!Array.isArray(entry.waste) || entry.waste.some(waste => !WASTE_TYPES.includes(waste)))) errors.push('Vælg gyldige affaldstyper.');
  if (entry.type === 'work') {
    if (timeValue(entry.start) === null || timeValue(entry.end) === null) errors.push('Indtast gyldige start- og sluttider.');
    else if (entry.start === entry.end) errors.push('Start og slut må ikke være ens.');
    if (!numeric(entry.breakMinutes) || entry.breakMinutes < 0 || entry.breakMinutes > 1439) errors.push('Pause skal være et positivt antal minutter eller 0.');
    if (timeValue(entry.start) !== null && timeValue(entry.end) !== null && shiftMinutes(entry) <= 0) errors.push('Pausen skal være kortere end vagten.');
    if (!numeric(entry.empties) || entry.empties < 0 || !Number.isInteger(entry.empties)) errors.push('Tømninger skal være et helt tal på 0 eller mere.');
    if (!['alone', 'colleague', 'substitute', 'temp', 'Alene', 'Med kollega', 'Afløser', 'Vikar'].includes(entry.crew)) errors.push('Vælg bemanding.');
    if (!Array.isArray(entry.waste) || entry.waste.some(waste => !WASTE_TYPES.includes(waste))) errors.push('Vælg gyldige affaldstyper.');
    if (!Array.isArray(entry.extras)) errors.push('Ekstraarbejde skal være en liste.');
    else {
      entry.extras.forEach((extra, index) => errors.push(...validateExtra(extra, index)));
      if (entry.extras.reduce((sum, extra) => sum + (Number(extra?.minutes) || 0), 0) > shiftMinutes(entry)) errors.push('Ekstraarbejdets samlede tid må ikke overstige vagtens arbejdstid.');
      const ids = entry.extras.map(extra => extra?.id);
      if (ids.some(id => typeof id !== 'string' || !id) || new Set(ids).size !== ids.length) errors.push('Ekstraarbejde skal have unikke id’er.');
    }
  } else if (Array.isArray(entry.extras) && entry.extras.length) errors.push('Ekstraarbejde kan kun tilføjes en arbejdsdag.');
  for (const other of skipConflicts ? [] : state.entries) {
    if (other.id === entry.id || other.jobId !== entry.jobId) continue;
    if (other.date === entry.date) {
      if (entry.type !== 'work' || other.type !== 'work') errors.push('Der findes allerede en registrering på denne dato for jobbet.');
      else if ((other.scheme || job?.scheme) !== (entry.scheme || job?.scheme)) errors.push('Vagter på samme dato skal have samme arbejdsuge.');
    }
    const currentInterval = interval(entry), otherInterval = interval(other);
    if (currentInterval && otherInterval && currentInterval[0] < otherInterval[1] && currentInterval[1] > otherInterval[0]) errors.push('Vagten overlapper en anden vagt for jobbet.');
  }
  return [...new Set(errors)];
}

// Import only recognized keys and primitives. Unknown keys are rejected, including
// prototype-like names, so backups cannot smuggle unrelated application state.
const JOB_KEYS = ['id', 'name', 'employer', 'role', 'employment', 'startDate', 'scheme', 'hourlyRate', 'overtimeRate', 'periodType', 'periodAnchor', 'payday', 'paydayOffset', 'pensionEmployee', 'pensionEmployer', 'holidayPercent', 'choicePercent', 'holidayDays', 'freeHolidayDays', 'sickPayPercent', 'notes'];
const ENTRY_KEYS = ['id', 'date', 'jobId', 'type', 'scheme', 'start', 'end', 'breakMinutes', 'vehicle', 'route', 'crew', 'empties', 'waste', 'extras', 'notes'];
const EXTRA_KEYS = ['id', 'kind', 'task', 'minutes', 'vehicle', 'forVehicle', 'from', 'to', 'address', 'waste', 'container', 'paidOvertime'];
const PLAN_KEYS = ['id', 'date', 'from', 'to', 'weekdays', 'jobId', 'scheme', 'title', 'start', 'end', 'vehicle', 'route', 'notes'];
const TEXT_KEYS = ['id', 'name', 'employer', 'role', 'employment', 'startDate', 'scheme', 'periodType', 'periodAnchor', 'notes', 'date', 'jobId', 'type', 'start', 'end', 'vehicle', 'route', 'crew', 'kind', 'task', 'forVehicle', 'from', 'to', 'address', 'container', 'title'];
function schema(object, allowed, label, errors) {
  if (!record(object)) { errors.push(`${label}: ugyldigt objekt.`); return false; }
  if (Object.keys(object).some(key => !allowed.includes(key))) errors.push(`${label}: indeholder ukendte felter.`);
  for (const [key, value] of Object.entries(object)) if (TEXT_KEYS.includes(key) && (typeof value !== 'string' || value.length > 10000)) errors.push(`${label}: feltet ${key} skal være tekst på højst 10.000 tegn.`);
  return true;
}
export function validateState(data) {
  const errors = [];
  if (!schema(data, ['version', 'jobs', 'entries', 'plans', 'vehicles', 'routes', 'settings'], 'Backup', errors)) return {ok: false, errors, state: null};
  if (data.version !== 1) errors.push('Backupversionen understøttes ikke.');
  for (const key of ['jobs', 'entries', 'plans', 'vehicles', 'routes']) if (!Array.isArray(data[key])) errors.push(`${key} skal være en liste.`);
  if (errors.length) return {ok: false, errors, state: null};
  if (data.jobs.length > 100 || data.entries.length > 50000 || data.plans.length > 10000) return {ok: false, errors: ['Backuppen indeholder for mange registreringer.'], state: null};
  if (['jobs', 'entries', 'plans'].some(key => data[key].some(item => !record(item)))) return {ok: false, errors: ['Jobs, registreringer og planer skal være objekter.'], state: null};
  const allIds = new Set();
  for (const key of ['jobs', 'entries', 'plans']) for (const item of data[key]) {
    if (!item?.id || typeof item.id !== 'string' || allIds.has(item.id)) errors.push('Alle jobs, registreringer og planer skal have unikke id’er.');
    allIds.add(item?.id);
  }
  for (const [index, job] of data.jobs.entries()) {
    const label = `Job ${index + 1}`;
    if (!schema(job, JOB_KEYS, label, errors)) continue;
    if (typeof job.name !== 'string' || !job.name.trim()) errors.push(`${label}: mangler navn.`);
    if ((job.startDate !== '' && !validDate(job.startDate)) || (job.periodType === '14days' ? !validDate(job.periodAnchor) : job.periodAnchor !== '' && !validDate(job.periodAnchor))) errors.push(`${label}: ugyldig dato.`);
    if (!['3', '4', '5'].includes(job.scheme)) errors.push(`${label}: ugyldig arbejdsuge.`);
    if (!['month', '14days'].includes(job.periodType)) errors.push(`${label}: ugyldig lønperiode.`);
    for (const key of ['hourlyRate', 'overtimeRate', 'pensionEmployee', 'pensionEmployer', 'holidayPercent', 'choicePercent', 'holidayDays', 'freeHolidayDays', 'sickPayPercent']) if (!numeric(job[key]) || job[key] < 0 || job[key] > (key.toLowerCase().includes('rate') ? 100000 : key.endsWith('Days') ? 366 : 100)) errors.push(`${label}: ugyldig værdi for ${key}.`);
    if (!Number.isInteger(job.payday) || job.payday < 1 || job.payday > 31 || !Number.isInteger(job.paydayOffset) || job.paydayOffset < 0 || job.paydayOffset > 60) errors.push(`${label}: ugyldig lønudbetalingsdag.`);
  }
  for (const [index, entry] of data.entries.entries()) {
    const label = `Registrering ${index + 1}`;
    if (!schema(entry, ENTRY_KEYS, label, errors)) continue;
    if (Array.isArray(entry.extras)) entry.extras.forEach((extra, i) => schema(extra, EXTRA_KEYS, `${label}, ekstraarbejde ${i + 1}`, errors));
    errors.push(...validateEntry(entry, data, true).map(error => `${label}: ${error}`));
  }
  // Batch imports use indexed conflict checks, not a quadratic scan of all entries.
  const dateGroups = new Map(), jobIntervals = new Map();
  for (const entry of data.entries) {
    const key = `${entry.jobId}/${entry.date}`;
    if (!dateGroups.has(key)) dateGroups.set(key, []);
    dateGroups.get(key).push(entry);
    const span = interval(entry);
    if (span) {
      if (!jobIntervals.has(entry.jobId)) jobIntervals.set(entry.jobId, []);
      jobIntervals.get(entry.jobId).push(span);
    }
  }
  for (const group of dateGroups.values()) if (group.length > 1) {
    if (group.some(entry => entry.type !== 'work')) errors.push('Backuppen har flere registreringer på en fraværsdag for samme job.');
    const job = data.jobs.find(item => item.id === group[0].jobId);
    if (new Set(group.map(entry => entry.scheme || job?.scheme)).size > 1) errors.push('Vagter på samme dato skal have samme arbejdsuge.');
  }
  for (const spans of jobIntervals.values()) {
    spans.sort((a, b) => a[0] - b[0]);
    let end = -Infinity;
    for (const span of spans) {
      if (span[0] < end) { errors.push('Backuppen indeholder overlappende vagter for samme job.'); break; }
      end = Math.max(end, span[1]);
    }
  }
  for (const [index, plan] of data.plans.entries()) {
    const label = `Arbejdsplan ${index + 1}`;
    if (!schema(plan, PLAN_KEYS, label, errors)) continue;
    const datesValid = own(plan, 'date') ? validDate(plan.date) : validDate(plan.from) && validDate(plan.to) && plan.from <= plan.to && Array.isArray(plan.weekdays) && plan.weekdays.length > 0 && plan.weekdays.every(day => Number.isInteger(day) && day >= 1 && day <= 7) && new Set(plan.weekdays).size === plan.weekdays.length;
    if (!datesValid || !data.jobs.some(job => job.id === plan.jobId) || typeof plan.title !== 'string' || !plan.title.trim()) errors.push(`${label}: dato, ugedage, job og titel skal være udfyldt.`);
    if (own(plan, 'scheme') && !['3', '4', '5'].includes(plan.scheme)) errors.push(`${label}: ugyldig arbejdsuge.`);
    if ((plan.start || plan.end) && (timeValue(plan.start) === null || timeValue(plan.end) === null || plan.start === plan.end)) errors.push(`${label}: ugyldig start- eller sluttid.`);
  }
  for (const key of ['vehicles', 'routes']) if (data[key].length > 1000 || data[key].some(value => typeof value !== 'string' || !value.trim() || value.length > 100) || new Set(data[key]).size !== data[key].length) errors.push(`${key} skal indeholde unikke, korte tekstværdier.`);
  if (schema(data.settings, ['name', 'defaultJobId'], 'Indstillinger', errors)) {
    if (typeof data.settings.name !== 'string' || data.settings.name.length > 200) errors.push('Navnet i indstillingerne er ugyldigt.');
    if (typeof data.settings.defaultJobId !== 'string' || (data.settings.defaultJobId && !data.jobs.some(job => job.id === data.settings.defaultJobId))) errors.push('Standardjobbet findes ikke.');
  }
  return {ok: errors.length === 0, errors: [...new Set(errors)], state: errors.length ? null : JSON.parse(JSON.stringify(data))};
}
