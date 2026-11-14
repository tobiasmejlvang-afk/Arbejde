import {validateDirectory} from './directory-domain.js';
import {validateWasteCentres} from './waste-centres.js';

// All dates are date-only ISO values and all arithmetic uses UTC to avoid DST drift.
// Contract assumptions are explicit: 12.33 × 3 = 36.99 h and 4 × 7.4 + 7 = 36.6 h,
// although the supplied contract says 37 h/week. We preserve the supplied daily norms.
export const WASTE_TYPES = ['Mad', 'Rest', 'Pap/Papir', 'Plast', 'Glas', 'Metal', 'Haveaffald', 'Storskrald'];
export const ENTRY_TYPES = ['work', 'sick', 'off', 'holiday', 'freeHoliday', 'absence'];
const DAY = 86400000;
const validDate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value + 'T00:00:00Z')) && new Date(value + 'T00:00:00Z').toISOString().slice(0, 10) === value;
const stamp = date => Date.parse(date + 'T00:00:00Z');
const iso = value => new Date(value).toISOString().slice(0, 10);
function round(value, precision = 2) {
  const scale = 10 ** precision;
  const scaled = value * scale;
  return Math.round(scaled + Math.abs(scaled) * Number.EPSILON) / scale;
}
const numeric = value => typeof value === 'number' && Number.isFinite(value);
const timeValue = value => typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value) ? Number(value.slice(0, 2)) * 60 + Number(value.slice(3)) : null;
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
  const month = new Date(stamp(date));
  month.setUTCDate(1);
  const start = iso(month);
  month.setUTCMonth(month.getUTCMonth() + 1, 0);
  return {start, end: iso(month)};
}
export function dateLabel(date, options = {}) {
  if (!validDate(date)) return '—';
  return new Intl.DateTimeFormat('da-DK', {day: 'numeric', month: 'short', ...options, timeZone: 'UTC'}).format(new Date(stamp(date)));
}
export function money(value) { return new Intl.NumberFormat('da-DK', {style: 'currency', currency: 'DKK', maximumFractionDigits: 2}).format(Number(value) || 0); }
export function hours(value) { return new Intl.NumberFormat('da-DK', {minimumFractionDigits: 2, maximumFractionDigits: 2}).format(Number(value) || 0); }

export function defaultJob(overrides = {}) {
  return {id: uid(), name: 'Mit arbejde', employer: '', role: 'Renovationsmedarbejder', employment: '', startDate: '', scheme: '3', hourlyRate: 0, overtimeRate: 0, overtimeRate2: 0, overtimeRule: 'manual', periodType: 'month', periodAnchor: weekStart(todayISO()), payday: 31, paydayOffset: 7, pensionEmployee: 0, pensionEmployer: 0, pensionBase: 'gross', holidayPercent: 0, choicePercent: 0, holidayDays: 0, freeHolidayDays: 0, sickPayPercent: 0, notes: '', ...overrides};
}
const PREFERENCE_VISIBILITY_KEYS = ['showOverviewChart', 'showOverviewActivity', 'showQuickTools', 'showTimer'];
export function defaultPreferences() {
  return {
    compact: false, defaultBreakMinutes: 0, defaultStart: '06:00', defaultEnd: '14:00', defaultRouteId: '', reduceMotion: false,
    theme: 'dark', navigation: 'auto', startupView: 'overblik',
    showOverviewChart: true, showOverviewActivity: true, showQuickTools: true, showTimer: true
  };
}
export function emptyState() {
  const job = defaultJob();
  return {version: 1, jobs: [job], entries: [], plans: [], vehicles: [], routes: [], routeTemplates: [], wasteCentres: [], directory: null, settings: {name: '', defaultJobId: job.id, preferences: defaultPreferences()}};
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
  const pause = numeric(entry.breakMinutes) ? entry.breakMinutes : 0;
  return Math.max(0, (end < start ? end + 1440 : end) - start - pause);
}
function dailyNorm(scheme, date) {
  if (scheme === '3') return 12.33;
  if (scheme === '4') return 9.25;
  const day = new Date(stamp(date)).getUTCDay();
  return day === 0 || day === 6 ? 0 : day === 5 ? 7 : 7.4;
}

const MINUTES_PER_DAY = 1440;
const positiveRemainder = minutes => minutes > 1e-9 ? minutes : 0;
const hasNormalHours = entry => timeValue(entry.normalStart) !== null && timeValue(entry.normalEnd) !== null && entry.normalStart !== entry.normalEnd;
const validNormalHours = entry => ((entry.normalStart ?? '') === '' && (entry.normalEnd ?? '') === '') || hasNormalHours(entry);
const usesAtlSchedule = entry => own(entry, 'normalStart') || own(entry, 'normalEnd');
const workDate = (entry, job) => job?.overtimeRule === 'atlFixed' && hasNormalHours(entry) && validDate(entry.normalDate) ? entry.normalDate : entry.date;

function pauseInterval(entry, start, end) {
  const clock = timeValue(entry.breakStart);
  if (clock === null || !numeric(entry.breakMinutes) || entry.breakMinutes <= 0) return null;
  let from = Math.floor(start / MINUTES_PER_DAY) * MINUTES_PER_DAY + clock;
  if (from < start) from += MINUTES_PER_DAY;
  return from + entry.breakMinutes <= end ? [from, from + entry.breakMinutes] : null;
}

function easterSunday(year) {
  // Gregorian computus (Meeus/Jones/Butcher).
  const golden = year % 19;
  const century = Math.floor(year / 100), centuryYear = year % 100;
  const lunarCorrection = Math.floor((century - Math.floor((century + 8) / 25) + 1) / 3);
  const epact = (19 * golden + century - Math.floor(century / 4) - lunarCorrection + 15) % 30;
  const weekday = (32 + 2 * (century % 4) + 2 * Math.floor(centuryYear / 4) - epact - centuryYear % 4) % 7;
  const correction = Math.floor((golden + 11 * epact + 22 * weekday) / 451);
  const monthAndDay = epact + weekday - 7 * correction + 114;
  const month = Math.floor(monthAndDay / 31), day = monthAndDay % 31 + 1;
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function isSundayOrHoliday(date) {
  const monthDay = date.slice(5);
  if (new Date(stamp(date)).getUTCDay() === 0 || ['01-01', '12-25', '12-26'].includes(monthDay)) return true;
  const year = Number(date.slice(0, 4));
  const easterOffset = (stamp(date) - stamp(easterSunday(year))) / DAY;
  return [-3, -2, 1, 39, 50].includes(easterOffset) || (year < 2024 && easterOffset === 26);
}

function atlTimeBuckets(entry, normalDate, hasSchedule) {
  const [start, end] = interval(entry).map(value => value / 60000);
  const firstDay = Math.floor(start / MINUTES_PER_DAY) * MINUTES_PER_DAY;
  const normalClock = hasSchedule ? timeValue(entry.normalStart) : null;
  const normalStart = hasSchedule ? stamp(normalDate) / 60000 + normalClock : null;
  const normalLength = hasSchedule ? (timeValue(entry.normalEnd) - normalClock + MINUTES_PER_DAY) % MINUTES_PER_DAY : null;
  const normalEnd = hasSchedule ? normalStart + normalLength : null;
  const pause = pauseInterval(entry, start, end);
  const buckets = {regular: 0, tier1: 0, tier2: 0, unclassified: 0};
  const specialEves = ['12-24', '12-31'];

  for (let day = firstDay; day < end; day += MINUTES_PER_DAY) {
    const date = iso(day * 60000);
    const dayStart = Math.max(day, start), dayEnd = Math.min(day + MINUTES_PER_DAY, end);
    if (isSundayOrHoliday(date)) {
      const pauseMinutes = pause ? Math.max(0, Math.min(dayEnd, pause[1]) - Math.max(dayStart, pause[0])) : 0;
      buckets.tier2 += dayEnd - dayStart - pauseMinutes;
      continue;
    }
    // ATL § 11: an eve's highest rate runs until the same time the next day.
    const isEve = specialEves.includes(date.slice(5));
    const followsEve = specialEves.includes(addDays(date, -1).slice(5));
    const eveBoundary = day + (normalClock ?? 360);
    const halfDay = ['05-01', '06-05'].includes(date.slice(5));
    const noon = day + 720;
    const cuts = [dayStart, dayEnd];
    if (isEve || followsEve) cuts.push(eveBoundary);
    if (halfDay) cuts.push(noon);
    if (hasSchedule) cuts.push(normalStart - 60, normalStart, normalEnd, normalEnd + 180);
    if (pause) cuts.push(...pause);
    const boundaries = cuts.filter(point => point >= dayStart && point <= dayEnd).sort((a, b) => a - b);
    for (let index = 1; index < boundaries.length; index++) {
      const from = boundaries[index - 1], to = boundaries[index];
      const middle = (from + to) / 2;
      if (pause && middle >= pause[0] && middle < pause[1]) continue;
      if ((isEve && middle >= eveBoundary) || (followsEve && middle < eveBoundary) || (hasSchedule && middle >= normalEnd + 180)) {
        buckets.tier2 += to - from;
      } else if (hasSchedule && ((middle >= normalStart - 60 && middle < normalStart) || middle >= normalEnd)) {
        buckets.tier1 += to - from;
      } else if ((halfDay && middle >= noon) || (hasSchedule && middle < normalStart - 60)) {
        buckets.unclassified += to - from;
      } else {
        buckets.regular += to - from;
      }
    }
  }

  let remainingPause = pause ? 0 : entry.breakMinutes;
  const pauseUncertain = remainingPause > 0 && Object.values(buckets).filter(minutes => minutes > 0).length > 1;
  // Only the pause length is recorded. Deduct it from the highest rate first
  // and show the estimate as provisional if it could change the allocation.
  for (const key of ['tier2', 'unclassified', 'tier1', 'regular']) {
    const deducted = Math.min(remainingPause, buckets[key]);
    buckets[key] -= deducted;
    remainingPause -= deducted;
  }
  return {buckets, pauseUncertain};
}

export function calculateAll(state) {
  const jobs = new Map(state.jobs.map(job => [job.id, job]));
  const sorted = [...state.entries].sort((a, b) => a.date.localeCompare(b.date) || (a.start || '').localeCompare(b.start || '') || a.id.localeCompare(b.id));
  const days = new Map();
  const weekDays = new Map();
  for (const entry of sorted) {
    const job = jobs.get(entry.jobId);
    if (entry.type !== 'work' || !job) continue;
    const date = workDate(entry, job), key = `${entry.jobId}/${date}`;
    if (!days.has(key)) days.set(key, {date, entries: []});
    days.get(key).entries.push(entry);
  }
  const allocation = new Map();
  const orderedDays = [...days.values()].sort((left, right) => left.date.localeCompare(right.date));
  for (const group of orderedDays) {
    const first = group.entries[0], job = jobs.get(first.jobId), scheme = first.scheme || job.scheme;
    const atl = job.overtimeRule === 'atlFixed';
    const holiday = atl && isSundayOrHoliday(group.date) && group.entries.some(usesAtlSchedule);
    const restDay = first.restDay === true || holiday;
    const weekKey = `${first.jobId}/${weekStart(group.date)}`;
    const dayIndex = restDay ? null : (weekDays.get(weekKey) || 0) + 1;
    // Rest days and ATL holidays do not consume one of the normal accord days.
    if (!restDay) weekDays.set(weekKey, dayIndex);
    const norm = restDay ? 0 : dailyNorm(scheme, group.date);
    const extraDay = restDay || (scheme === '3' ? dayIndex > 3 : scheme === '4' ? dayIndex > 4 : norm === 0);
    const guaranteed = (scheme === '3' || scheme === '4') && !extraDay;
    // Extra tasks are part of the shift; only explicitly paid overtime is reclassified.
    // A guaranteed accord day keeps its base guarantee while paid extras become overtime.
    // Keep shifts and extra work in minutes until the split is complete.
    // Ignore floating-point residue from legacy fractional-minute values.
    let baseCapacity = extraDay ? 0 : norm * 60;
    for (let index = 0; index < group.entries.length; index++) {
      const entry = group.entries[index], actual = shiftMinutes(entry);
      const explicitOT = (entry.extras || []).reduce((sum, extra) => sum + (extra.paidOvertime && numeric(extra.minutes) ? extra.minutes : 0), 0);
      const hasSchedule = hasNormalHours(entry);
      const override = own(entry, 'overtimeTier2Minutes');
      const legacy = atl && !usesAtlSchedule(entry);
      const timed = atl && !legacy && actual > 0 ? atlTimeBuckets(entry, group.date, hasSchedule) : null;
      const ordinary = Math.min(baseCapacity, Math.max(0, actual - explicitOT), timed?.buckets.regular ?? actual);
      baseCapacity = positiveRemainder(baseCapacity - ordinary);
      const guarantee = guaranteed && index === group.entries.length - 1 ? baseCapacity : 0;
      const overtime = positiveRemainder(actual - ordinary);
      const requestedTier2 = entry.overtimeTier2Minutes ?? 0;
      const tier2 = Math.min(atl && !override ? (timed?.buckets.tier2 ?? 0) : requestedTier2, overtime);
      const warnings = [];
      const fullyClassified = timed && !positiveRemainder(actual - timed.buckets.tier2);
      const knownManualQuantity = (override || legacy) && (restDay || extraDay || (legacy && !overtime));
      if (atl && !hasSchedule && !fullyClassified && !knownManualQuantity) warnings.push('Normale start- og sluttider mangler. Overarbejdet kan kræve manuel kontrol.');
      if (timed?.pauseUncertain) warnings.push('Pausens placering er ukendt. Pausen er trukket fra de højeste satser først.');
      if (!override && timed && positiveRemainder(overtime - timed.buckets.tier1 - timed.buckets.tier2)) {
        warnings.push('Satsen for en del af overarbejdet skal bekræftes. Disse minutter er beregnet på sats 1.');
      }
      allocation.set(entry.id, {
        actualHours: actual / 60, baseHours: (ordinary + guarantee) / 60, overtimeHours: overtime / 60,
        overtimeTier1Hours: (overtime - tier2) / 60, overtimeTier2Hours: tier2 / 60,
        overtimeTier2Clamped: override && positiveRemainder(requestedTier2 - tier2) > 0,
        overtimeAllocationMode: warnings.length ? 'needsReview' : atl && !legacy && !override ? 'automatic' : 'manual',
        overtimeWarnings: warnings, guaranteeHours: guarantee / 60, dayIndex, nominalHours: norm, extraDay
      });
    }
  }
  return sorted.map(entry => {
    const job = jobs.get(entry.jobId);
    const scheme = entry.scheme || job?.scheme || '3';
    let calculated = allocation.get(entry.id) || {
      actualHours: 0, baseHours: 0, overtimeHours: 0, overtimeTier1Hours: 0, overtimeTier2Hours: 0,
      overtimeTier2Clamped: false, overtimeAllocationMode: 'manual', overtimeWarnings: [],
      guaranteeHours: 0, dayIndex: null, nominalHours: dailyNorm(scheme, entry.date), extraDay: false
    };
    if (entry.type === 'sick') calculated = {...calculated, baseHours: calculated.nominalHours * (Number(job?.sickPayPercent) || 0) / 100};
    const basePay = round(calculated.baseHours * (Number(job?.hourlyRate) || 0));
    const overtimeTier1Pay = round(calculated.overtimeTier1Hours * (Number(job?.overtimeRate) || 0));
    const overtimeTier2Pay = round(calculated.overtimeTier2Hours * (Number(job?.overtimeRate2) || 0));
    const overtimePay = round(overtimeTier1Pay + overtimeTier2Pay);
    const grossPay = round(basePay + overtimePay);
    const choice = round(grossPay * (Number(job?.choicePercent) || 0) / 100);
    const holidayAccrual = round(grossPay * (Number(job?.holidayPercent) || 0) / 100);
    const pensionBaseAmount = job?.pensionBase === 'grossWithAccruals' ? round(grossPay + choice + holidayAccrual) : grossPay;
    const missingRates = [];
    if (calculated.baseHours > 0 && !(job?.hourlyRate > 0)) missingRates.push('hourlyRate');
    if (calculated.overtimeTier1Hours > 0 && !(job?.overtimeRate > 0)) missingRates.push('overtimeRate');
    if (calculated.overtimeTier2Hours > 0 && !(job?.overtimeRate2 > 0)) missingRates.push('overtimeRate2');
    // Money is rounded per entry to øre, totals sum those amounts; hours stay unrounded
    // for calculations. Vacation and free holiday consume days but assume no wage.
    return {
      entry, job, ...calculated, paidHours: calculated.baseHours + calculated.overtimeHours,
      basePay, overtimePay, overtimeTier1Pay, overtimeTier2Pay, grossPay, choice, holidayAccrual, pensionBaseAmount,
      pensionEmployee: round(pensionBaseAmount * (Number(job?.pensionEmployee) || 0) / 100),
      pensionEmployer: round(pensionBaseAmount * (Number(job?.pensionEmployer) || 0) / 100),
      rateMissing: missingRates.length > 0, missingRates
    };
  });
}
export function summarize(rows) {
  const fields = ['actualHours', 'baseHours', 'overtimeHours', 'overtimeTier1Hours', 'overtimeTier2Hours', 'paidHours', 'basePay', 'overtimePay', 'overtimeTier1Pay', 'overtimeTier2Pay', 'grossPay', 'pensionBaseAmount', 'pensionEmployee', 'pensionEmployer', 'choice', 'holidayAccrual', 'guaranteeHours'];
  const result = Object.fromEntries(fields.map(field => {
    if (field.endsWith('Hours')) return [field, round(rows.reduce((sum, row) => sum + (row[field] || 0), 0), 4)];
    // Each registration already rounds to øre. Sum those whole units exactly.
    const totalOre = rows.reduce((sum, row) => sum + Math.round((row[field] || 0) * 100), 0);
    return [field, totalOre / 100];
  }));
  return {
    ...result, days: new Set(rows.map(row => row.entry.date)).size,
    workDays: new Set(rows.filter(row => row.entry.type === 'work').map(row => `${row.entry.jobId}/${workDate(row.entry, row.job)}`)).size,
    holidayDays: rows.filter(row => row.entry.type === 'holiday').length,
    freeHolidayDays: rows.filter(row => row.entry.type === 'freeHoliday').length,
    sickDays: rows.filter(row => row.entry.type === 'sick').length,
    absenceDays: rows.filter(row => row.entry.type === 'absence').length,
    empties: rows.reduce((sum, row) => sum + (row.entry.type === 'work' ? Number(row.entry.empties) || 0 : 0), 0),
    rateMissing: rows.some(row => row.rateMissing), overtimeTier2ClampedEntries: rows.filter(row => row.overtimeTier2Clamped).length,
    overtimeReviewEntries: rows.filter(row => row.overtimeAllocationMode === 'needsReview').length, entries: rows.length
  };
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
  if (extra.kind === 'task' && (typeof extra.task !== 'string' || !extra.task.trim())) errors.push(`${label}: beskriv arbejdsopgaven.`);
  if (extra.waste && !WASTE_TYPES.includes(extra.waste)) errors.push(`${label}: ukendt affaldstype.`);
  return errors;
}
const PHOTO_KEYS = ['id', 'name', 'mime', 'size'];
const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const photoId = /^[a-f0-9]{32}$|^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
function validatePhotoRefs(photos) {
  if (!Array.isArray(photos) || photos.length > 6) return ['En registrering kan have højst 6 fotos.'];
  const ids = new Set(), errors = [];
  for (const [index, photo] of photos.entries()) {
    const label = `Foto ${index + 1}`;
    if (!record(photo) || Object.keys(photo).some(key => !PHOTO_KEYS.includes(key))) {
      errors.push(`${label}: ugyldige fotooplysninger.`);
      continue;
    }
    if (typeof photo.id !== 'string' || !photoId.test(photo.id)) errors.push(`${label}: ugyldigt id.`);
    else if (ids.has(photo.id)) errors.push('Det samme foto må kun tilføjes én gang pr. registrering.');
    ids.add(photo.id);
    if (typeof photo.name !== 'string' || !photo.name.trim() || photo.name.length > 150) errors.push(`${label}: ugyldigt filnavn.`);
    if (!PHOTO_TYPES.includes(photo.mime)) errors.push(`${label}: vælg et JPEG-, PNG- eller WebP-billede.`);
    if (!Number.isInteger(photo.size) || photo.size < 1 || photo.size > 5242880) errors.push(`${label}: størrelsen skal være mellem 1 byte og 5 MiB.`);
  }
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
  if (own(entry, 'restDay') && typeof entry.restDay !== 'boolean') errors.push('Hviledag skal være markeret som ja eller nej.');
  if (own(entry, 'overtimeTier2Minutes')) {
    const minutes = entry.overtimeTier2Minutes;
    if (!Number.isInteger(minutes) || minutes < 0 || minutes > 1439) errors.push('Overarbejde på sats 2 skal være et helt antal minutter mellem 0 og 1.439.');
    else if (minutes > 0 && entry.type !== 'work') errors.push('Overarbejde på sats 2 kan kun fordeles på en arbejdsdag.');
  }
  if (!validNormalHours(entry)) errors.push('Angiv to forskellige normale start- og sluttider, eller lad begge felter være tomme.');
  if (entry.normalDate != null && entry.normalDate !== '') {
    if (!hasNormalHours(entry) || !validDate(entry.normalDate) || !validDate(entry.date) || Math.abs(stamp(entry.normalDate) - stamp(entry.date)) > DAY) {
      errors.push('Datoen for de normale arbejdstider skal være højst én dag fra registreringens dato.');
    }
  }
  if (entry.breakStart != null && entry.breakStart !== '') {
    const span = entry.type === 'work' ? interval(entry) : null;
    if (!span || !pauseInterval(entry, span[0] / 60000, span[1] / 60000)) errors.push('Pausens starttid og varighed skal ligge inden for vagten.');
  }
  if (own(entry, 'photos')) errors.push(...validatePhotoRefs(entry.photos));
  for (const key of ['driver', 'colleague', 'planId', 'timerId']) if (own(entry, key) && (typeof entry[key] !== 'string' || entry[key].length > 200)) errors.push('Chauffør, kollega og referencer skal være tekst på højst 200 tegn.');
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
      if (entry.extras.reduce((sum, extra) => sum + (numeric(extra?.minutes) ? extra.minutes : 0), 0) > shiftMinutes(entry)) errors.push('Ekstraarbejdets samlede tid må ikke overstige vagtens arbejdstid.');
      const ids = entry.extras.map(extra => extra?.id);
      if (ids.some(id => typeof id !== 'string' || !id) || new Set(ids).size !== ids.length) errors.push('Ekstraarbejde skal have unikke id’er.');
    }
  } else if (Array.isArray(entry.extras) && entry.extras.length) errors.push('Ekstraarbejde kan kun tilføjes en arbejdsdag.');
  for (const other of skipConflicts ? [] : state.entries) {
    if (other.id !== entry.id && typeof entry.timerId === 'string' && entry.timerId && other.timerId === entry.timerId) errors.push('Denne tidsmåling er allerede gemt som en registrering.');
    if (other.id === entry.id || other.jobId !== entry.jobId) continue;
    if (other.date === entry.date) {
      if (entry.type !== 'work' || other.type !== 'work') errors.push('Der findes allerede en registrering på denne dato for jobbet.');
      else {
        if ((other.scheme || job?.scheme) !== (entry.scheme || job?.scheme)) errors.push('Vagter på samme dato skal have samme arbejdsuge.');
        if ((other.restDay === true) !== (entry.restDay === true)) errors.push('Vagter på samme dato skal have samme hviledagsmarkering.');
      }
    }
    if (job?.overtimeRule === 'atlFixed' && entry.type === 'work' && other.type === 'work' && workDate(entry, job) === workDate(other, job)) {
      if ((other.scheme || job.scheme) !== (entry.scheme || job.scheme)) errors.push('Delte vagter med samme normale vagt skal have samme arbejdsuge.');
      if ((other.restDay === true) !== (entry.restDay === true)) errors.push('Delte vagter med samme normale vagt skal have samme hviledagsmarkering.');
      if (hasNormalHours(entry) && hasNormalHours(other) && (entry.normalStart !== other.normalStart || entry.normalEnd !== other.normalEnd)) errors.push('Delte vagter med samme normale vagt skal have samme normale start- og sluttid.');
    }
    const currentInterval = interval(entry), otherInterval = interval(other);
    if (currentInterval && otherInterval && currentInterval[0] < otherInterval[1] && currentInterval[1] > otherInterval[0]) errors.push('Vagten overlapper en anden vagt for jobbet.');
  }
  return [...new Set(errors)];
}

// Import only recognized keys and primitives. Unknown keys are rejected, including
// prototype-like names, so backups cannot smuggle unrelated application state.
const JOB_KEYS = ['id', 'name', 'employer', 'role', 'employment', 'startDate', 'scheme', 'hourlyRate', 'overtimeRate', 'overtimeRate2', 'overtimeRule', 'normalStart', 'normalEnd', 'periodType', 'periodAnchor', 'payday', 'paydayOffset', 'pensionEmployee', 'pensionEmployer', 'pensionBase', 'holidayPercent', 'choicePercent', 'holidayDays', 'freeHolidayDays', 'sickPayPercent', 'notes'];
const ENTRY_KEYS = ['id', 'date', 'jobId', 'type', 'scheme', 'start', 'end', 'normalDate', 'normalStart', 'normalEnd', 'breakMinutes', 'breakStart', 'vehicle', 'route', 'crew', 'driver', 'colleague', 'planId', 'timerId', 'empties', 'waste', 'extras', 'notes', 'restDay', 'photos', 'overtimeTier2Minutes'];
const EXTRA_KEYS = ['id', 'kind', 'task', 'minutes', 'vehicle', 'forVehicle', 'from', 'to', 'address', 'waste', 'container', 'paidOvertime'];
const PLAN_KEYS = ['id', 'date', 'from', 'to', 'weekdays', 'jobId', 'scheme', 'title', 'start', 'end', 'vehicle', 'route', 'notes', 'driver', 'colleague', 'crew', 'people', 'kind', 'source'];
const PLAN_SOURCE_KEYS = ['type', 'fileName', 'fileHash', 'page', 'row', 'importedAt', 'week', 'year'];
const ROUTE_TEMPLATE_KEYS = ['id', 'name', 'weekParity', 'weekday', 'vehicle', 'waste', 'empties'];
const PREFERENCE_KEYS = ['compact', 'defaultBreakMinutes', 'defaultStart', 'defaultEnd', 'defaultRouteId', 'reduceMotion', 'theme', 'navigation', 'startupView', ...PREFERENCE_VISIBILITY_KEYS];
const TEXT_KEYS = ['id', 'name', 'employer', 'role', 'employment', 'startDate', 'scheme', 'periodType', 'periodAnchor', 'notes', 'date', 'jobId', 'type', 'start', 'end', 'vehicle', 'route', 'crew', 'driver', 'colleague', 'kind', 'task', 'forVehicle', 'from', 'to', 'address', 'container', 'title'];
function schema(object, allowed, label, errors) {
  if (!record(object)) { errors.push(`${label}: ugyldigt objekt.`); return false; }
  if (Object.keys(object).some(key => !allowed.includes(key))) errors.push(`${label}: indeholder ukendte felter.`);
  for (const [key, value] of Object.entries(object)) if (TEXT_KEYS.includes(key) && (typeof value !== 'string' || value.length > 10000)) errors.push(`${label}: feltet ${key} skal være tekst på højst 10.000 tegn.`);
  return true;
}
export function validateState(data) {
  const errors = [];
  if (!schema(data, ['version', 'jobs', 'entries', 'plans', 'vehicles', 'routes', 'routeTemplates', 'wasteCentres', 'settings', 'directory'], 'Backup', errors)) return {ok: false, errors, state: null};
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
    if (own(job, 'overtimeRate2') && (!numeric(job.overtimeRate2) || job.overtimeRate2 < 0 || job.overtimeRate2 > 100000)) errors.push(`${label}: overarbejdssats 2 skal være mellem 0 og 100.000 kr. pr. time.`);
    if (own(job, 'overtimeRule') && !['manual', 'atlFixed'].includes(job.overtimeRule)) errors.push(`${label}: vælg en gyldig regel for overarbejde.`);
    if (!validNormalHours(job)) errors.push(`${label}: angiv to forskellige normale start- og sluttider, eller lad begge felter være tomme.`);
    if (own(job, 'pensionBase') && !['gross', 'grossWithAccruals'].includes(job.pensionBase)) errors.push(`${label}: vælg et gyldigt pensionsgrundlag.`);
    if (!Number.isInteger(job.payday) || job.payday < 1 || job.payday > 31 || !Number.isInteger(job.paydayOffset) || job.paydayOffset < 0 || job.paydayOffset > 60) errors.push(`${label}: ugyldig lønudbetalingsdag.`);
  }
  for (const [index, entry] of data.entries.entries()) {
    const label = `Registrering ${index + 1}`;
    if (!schema(entry, ENTRY_KEYS, label, errors)) continue;
    if (Array.isArray(entry.extras)) entry.extras.forEach((extra, i) => schema(extra, EXTRA_KEYS, `${label}, ekstraarbejde ${i + 1}`, errors));
    errors.push(...validateEntry(entry, data, true).map(error => `${label}: ${error}`));
  }
  const timerIds = data.entries.map(entry => entry.timerId).filter(value => typeof value === 'string' && value);
  if (new Set(timerIds).size !== timerIds.length) errors.push('Den samme tidsmåling må kun gemmes én gang.');
  // Batch imports use indexed conflict checks, not a quadratic scan of all entries.
  const dateGroups = new Map(), jobIntervals = new Map(), normalGroups = new Map();
  const jobsById = new Map(data.jobs.map(job => [job.id, job]));
  for (const entry of data.entries) {
    if (typeof entry.jobId !== 'string' || !validDate(entry.date)) continue;
    const key = `${entry.jobId}/${entry.date}`;
    if (!dateGroups.has(key)) dateGroups.set(key, []);
    dateGroups.get(key).push(entry);
    const job = jobsById.get(entry.jobId);
    if (job?.overtimeRule === 'atlFixed' && entry.type === 'work') {
      const normalKey = `${entry.jobId}/${workDate(entry, job)}`;
      if (!normalGroups.has(normalKey)) normalGroups.set(normalKey, []);
      normalGroups.get(normalKey).push(entry);
    }
    const span = interval(entry);
    if (span) {
      if (!jobIntervals.has(entry.jobId)) jobIntervals.set(entry.jobId, []);
      jobIntervals.get(entry.jobId).push(span);
    }
  }
  for (const group of normalGroups.values()) if (group.length > 1) {
    const job = jobsById.get(group[0].jobId);
    if (new Set(group.map(entry => entry.scheme || job.scheme)).size > 1) errors.push('Delte vagter med samme normale vagt skal have samme arbejdsuge.');
    if (new Set(group.map(entry => entry.restDay === true)).size > 1) errors.push('Delte vagter med samme normale vagt skal have samme hviledagsmarkering.');
    if (new Set(group.filter(hasNormalHours).map(entry => `${entry.normalStart}/${entry.normalEnd}`)).size > 1) errors.push('Delte vagter med samme normale vagt skal have samme normale start- og sluttid.');
  }
  for (const group of dateGroups.values()) if (group.length > 1) {
    if (group.some(entry => entry.type !== 'work')) errors.push('Backuppen har flere registreringer på en fraværsdag for samme job.');
    const job = data.jobs.find(item => item.id === group[0].jobId);
    if (new Set(group.map(entry => entry.scheme || job?.scheme)).size > 1) errors.push('Vagter på samme dato skal have samme arbejdsuge.');
    if (new Set(group.filter(entry => entry.type === 'work').map(entry => entry.restDay === true)).size > 1) errors.push('Vagter på samme dato skal have samme hviledagsmarkering.');
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
    for (const key of ['driver', 'colleague', 'crew']) if (own(plan, key) && (typeof plan[key] !== 'string' || plan[key].length > 200)) errors.push(`${label}: ugyldig bemanding.`);
    if (own(plan, 'people') && (!Array.isArray(plan.people) || plan.people.length > 20 || plan.people.some(person => typeof person !== 'string' || !person.trim() || person.length > 200) || new Set(plan.people).size !== plan.people.length)) errors.push(`${label}: ugyldig personliste.`);
    if (own(plan, 'kind') && ![...ENTRY_TYPES, 'unknown', 'unassigned'].includes(plan.kind)) errors.push(`${label}: ugyldig plantype.`);
    if (own(plan, 'source') && schema(plan.source, PLAN_SOURCE_KEYS, `${label}, kilde`, errors)) {
      const source = plan.source;
      if (!['pdf', 'calendar'].includes(source.type) || typeof source.fileName !== 'string' || !source.fileName.trim() || source.fileName.length > 255 || /[<>:"/\\|?*]/.test(source.fileName)) errors.push(`${label}: ugyldigt kildefilnavn.`);
      if (typeof source.fileHash !== 'string' || (source.fileHash !== '' && !/^(?:pdfjs:)?[a-f0-9]{16,128}$/i.test(source.fileHash))) errors.push(`${label}: ugyldig kildefingeraftryk.`);
      if (!Number.isInteger(source.page) || source.page < 1 || source.page > 10000 || !((Number.isInteger(source.row) && source.row >= 0) || (typeof source.row === 'string' && source.row.length > 0 && source.row.length <= 200))) errors.push(`${label}: ugyldig kildeplacering.`);
      if (typeof source.importedAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,3})?Z$/.test(source.importedAt) || Number.isNaN(Date.parse(source.importedAt)) || !validDate(source.importedAt.slice(0, 10))) errors.push(`${label}: ugyldigt importtidspunkt.`);
      if (own(source, 'week') && source.week !== null && (!Number.isInteger(source.week) || source.week < 1 || source.week > 53)) errors.push(`${label}: ugyldig kildeuge.`);
      if (own(source, 'year') && source.year !== null && (!Number.isInteger(source.year) || source.year < 1900 || source.year > 2199)) errors.push(`${label}: ugyldigt kildeår.`);
    }
  }
  for (const key of ['vehicles', 'routes']) if (data[key].length > 1000 || data[key].some(value => typeof value !== 'string' || !value.trim() || value.length > 100) || new Set(data[key]).size !== data[key].length) errors.push(`${key} skal indeholde unikke, korte tekstværdier.`);
  const routeTemplateIds = new Set();
  if (own(data, 'routeTemplates')) {
    if (!Array.isArray(data.routeTemplates) || data.routeTemplates.length > 1000) errors.push('Gemte ruter skal være en liste med højst 1.000 ruter.');
    else for (const [index, route] of data.routeTemplates.entries()) {
      const label = `Gemt rute ${index + 1}`;
      if (!schema(route, ROUTE_TEMPLATE_KEYS, label, errors)) continue;
      if (typeof route.id !== 'string' || !route.id.trim() || route.id.length > 200 || routeTemplateIds.has(route.id)) errors.push(`${label}: ruten skal have et gyldigt og unikt id.`);
      else routeTemplateIds.add(route.id);
      if (typeof route.name !== 'string' || !route.name.trim() || route.name.length > 100) errors.push(`${label}: rutenavnet skal være mellem 1 og 100 tegn.`);
      if (!['all', 'even', 'odd'].includes(route.weekParity)) errors.push(`${label}: vælg alle, lige eller ulige uger.`);
      if (!Number.isInteger(route.weekday) || route.weekday < 1 || route.weekday > 7) errors.push(`${label}: vælg en gyldig ugedag.`);
      if (own(route, 'vehicle') && (typeof route.vehicle !== 'string' || route.vehicle.length > 100)) errors.push(`${label}: ugyldigt vognnummer eller arbejdssted.`);
      if (!Array.isArray(route.waste) || route.waste.some(value => !WASTE_TYPES.includes(value)) || new Set(route.waste).size !== route.waste.length) errors.push(`${label}: vælg gyldige, forskellige affaldstyper.`);
      if (!Number.isInteger(route.empties) || route.empties < 0 || route.empties > 100000) errors.push(`${label}: tømninger skal være et helt tal mellem 0 og 100.000.`);
    }
  }
  if (schema(data.settings, ['name', 'defaultJobId', 'defaultDriver', 'defaultVehicle', 'preferences'], 'Indstillinger', errors)) {
    if (typeof data.settings.name !== 'string' || data.settings.name.length > 200) errors.push('Navnet i indstillingerne er ugyldigt.');
    if (typeof data.settings.defaultJobId !== 'string' || (data.settings.defaultJobId && !data.jobs.some(job => job.id === data.settings.defaultJobId))) errors.push('Standardjobbet findes ikke.');
    for (const key of ['defaultDriver', 'defaultVehicle']) if (own(data.settings, key) && (typeof data.settings[key] !== 'string' || data.settings[key].length > 200)) errors.push('Standardchauffør og -vogn skal være tekst på højst 200 tegn.');
    if (own(data.settings, 'preferences') && schema(data.settings.preferences, PREFERENCE_KEYS, 'Personlige standardvalg', errors)) {
      const preferences = data.settings.preferences;
      if (typeof preferences.compact !== 'boolean' || typeof preferences.reduceMotion !== 'boolean') errors.push('Kompakt visning og mindre bevægelse skal være valgt til eller fra.');
      if (own(preferences, 'theme') && !['dark', 'light', 'contrast'].includes(preferences.theme)) errors.push('Vælg et gyldigt tema.');
      if (own(preferences, 'navigation') && !['auto', 'sidebar', 'bottom'].includes(preferences.navigation)) errors.push('Vælg en gyldig navigation.');
      if (own(preferences, 'startupView') && !['overblik', 'daglig', 'kalender', 'arbejde'].includes(preferences.startupView)) errors.push('Vælg en gyldig startside.');
      if (PREFERENCE_VISIBILITY_KEYS.some(key => own(preferences, key) && typeof preferences[key] !== 'boolean')) errors.push('Visningsvalg skal være valgt til eller fra.');
      const breakMinutes = preferences.defaultBreakMinutes;
      if (!Number.isInteger(breakMinutes) || breakMinutes < 0 || breakMinutes > 1439) errors.push('Standardpausen skal være et helt tal mellem 0 og 1.439 minutter.');
      if (preferences.defaultStart !== '' || preferences.defaultEnd !== '') {
        const start = timeValue(preferences.defaultStart), end = timeValue(preferences.defaultEnd);
        if (start === null || end === null || start === end) errors.push('Angiv to forskellige gyldige standardtider, eller lad begge felter være tomme.');
        else if (Number.isInteger(breakMinutes) && breakMinutes >= (end - start + 1440) % 1440) errors.push('Standardpausen skal være kortere end vagten.');
      }
      if (typeof preferences.defaultRouteId !== 'string' || preferences.defaultRouteId.length > 200 || (preferences.defaultRouteId && !routeTemplateIds.has(preferences.defaultRouteId))) errors.push('Den valgte standardrute findes ikke.');
    }
  }
  let directory = null;
  if (own(data, 'directory') && data.directory !== null) {
    const result = validateDirectory(data.directory);
    if (!result.ok) errors.push(...result.errors.map(error => `NVF-register: ${error}`));
    else directory = result.directory;
  }
  let centres = {};
  if (own(data, 'wasteCentres')) {
    if (!Array.isArray(data.wasteCentres)) errors.push('Affaldscentrene i sikkerhedskopien skal være en liste.');
    else {
      const result = validateWasteCentres(data.wasteCentres);
      if (!result.ok) errors.push(...result.errors);
      else centres = {wasteCentres: result.centres};
    }
  }
  return {ok: errors.length === 0, errors: [...new Set(errors)], state: errors.length ? null : {...JSON.parse(JSON.stringify(data)), directory, ...centres}};
}
