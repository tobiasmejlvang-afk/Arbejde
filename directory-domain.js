// Private directory data is supplied by the user at runtime. No roster is bundled.
const isRecord = value => !!value && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
const clone = value => JSON.parse(JSON.stringify(value));
const LIMIT = 1000;
const KEYS = ['version', 'name', 'company', 'department', 'source', 'importedAt', 'vehicles', 'people', 'issues'];
const SOURCE_KEYS = ['fileName', 'title', 'sha256', 'pageCount', 'referenceDate'];
const VEHICLE_KEYS = ['id', 'number', 'registrationNumber', 'makeModel', 'description', 'driverIds', 'requiresVerification', 'sourcePage', 'sourceHighlight', 'notes'];
const PERSON_KEYS = ['id', 'name', 'phone', 'extension', 'roles', 'sourcePages', 'vehicleNumbers', 'notes'];
const ISSUE_KEYS = ['id', 'vehicleId', 'sourcePage', 'message', 'truncatedInSource'];

export function emptyDirectory() {
  return {version: 1, name: 'NVF', company: '', department: '', source: {fileName: '', title: '', sha256: '', pageCount: 0, referenceDate: ''}, importedAt: '', vehicles: [], people: [], issues: []};
}

export function validateDirectory(data) {
  const errors = [];
  function object(value, allowed, label) {
    if (!isRecord(value)) { errors.push(`${label}: ugyldigt objekt.`); return false; }
    if (Object.keys(value).some(key => !allowed.includes(key))) errors.push(`${label}: indeholder ukendte felter.`);
    return true;
  }
  function text(value, label, max = 200, required = false) {
    if (typeof value !== 'string' || value.length > max || (required && !value.trim())) errors.push(`${label}: ugyldig tekst (højst ${max} tegn).`);
  }
  function list(value, label) {
    if (!Array.isArray(value) || value.length > LIMIT) { errors.push(`${label}: skal være en liste med højst ${LIMIT} elementer.`); return false; }
    return true;
  }
  function uniqueStrings(value, label, max = 200) {
    if (!list(value, label)) return;
    value.forEach(item => text(item, label, max, true));
    if (new Set(value).size !== value.length) errors.push(`${label}: indeholder dubletter.`);
  }
  function page(value, label) {
    if (!Number.isInteger(value) || value < 0 || value > 10000 || (data.source?.pageCount > 0 && value > data.source.pageCount)) errors.push(`${label}: ugyldigt sidetal.`);
  }
  function notes(value, label) { if (own(value, 'notes')) text(value.notes, `${label}, noter`, 10000); }
  if (!object(data, KEYS, 'Register')) return {ok: false, errors, directory: null};
  if (data.version !== 1) errors.push('Registerversionen understøttes ikke.');
  text(data.name, 'Registernavn', 200, true);
  text(data.company, 'Virksomhed');
  text(data.department, 'Afdeling');
  if (object(data.source, SOURCE_KEYS, 'Kilde')) {
    text(data.source.fileName, 'Kildens filnavn', 255);
    if (typeof data.source.fileName === 'string' && (/[<>:"/\\|?*]/.test(data.source.fileName) || ['.', '..'].includes(data.source.fileName))) errors.push('Kilden må kun indeholde et filnavn, aldrig en lokal sti.');
    text(data.source.title, 'Kildens titel', 1000);
    if (typeof data.source.sha256 !== 'string' || (data.source.sha256 !== '' && !/^[a-fA-F0-9]{64}$/.test(data.source.sha256))) errors.push('Kildens SHA-256 er ugyldig.');
    if (!Number.isInteger(data.source.pageCount) || data.source.pageCount < 0 || data.source.pageCount > 10000) errors.push('Kildens sidetal er ugyldigt.');
    const date = data.source.referenceDate;
    if (typeof date !== 'string' || (date !== '' && (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date + 'T00:00:00Z')) || new Date(date + 'T00:00:00Z').toISOString().slice(0, 10) !== date))) errors.push('Kildens referencedato er ugyldig.');
  }
  const importedDate = typeof data.importedAt === 'string' ? data.importedAt.slice(0, 10) : '';
  if (typeof data.importedAt !== 'string' || (data.importedAt !== '' && (!/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,3})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.test(data.importedAt) || Number.isNaN(Date.parse(data.importedAt)) || Number.isNaN(Date.parse(importedDate + 'T00:00:00Z')) || new Date(importedDate + 'T00:00:00Z').toISOString().slice(0, 10) !== importedDate))) errors.push('Registerets importtidspunkt er ugyldigt.');
  for (const key of ['vehicles', 'people', 'issues']) list(data[key], key);
  if (errors.length) return {ok: false, errors: [...new Set(errors)], directory: null};
  const vehicleIds = new Set(), vehicleNumbers = new Set(), personIds = new Set(), issueIds = new Set();
  for (const [index, vehicle] of data.vehicles.entries()) {
    const label = `Vogn ${index + 1}`;
    if (!object(vehicle, VEHICLE_KEYS, label)) continue;
    text(vehicle.id, `${label}, id`, 200, true);
    text(vehicle.number, `${label}, nummer`, 100, true);
    if (typeof vehicle.number === 'string' && vehicle.number !== vehicle.number.trim()) errors.push(`${label}: vognnummer må ikke have indledende eller afsluttende mellemrum.`);
    if (vehicleIds.has(vehicle.id) || vehicleNumbers.has(vehicle.number)) errors.push('Vogne skal have unikke id’er og vognnumre.');
    vehicleIds.add(vehicle.id); vehicleNumbers.add(vehicle.number);
    for (const key of ['registrationNumber', 'makeModel']) text(vehicle[key], `${label}, ${key}`, 200);
    text(vehicle.description, `${label}, beskrivelse`, 10000);
    uniqueStrings(vehicle.driverIds, `${label}, chauffører`);
    if (typeof vehicle.requiresVerification !== 'boolean') errors.push(`${label}: kontrolmarkeringen er ugyldig.`);
    page(vehicle.sourcePage, `${label}, kilde`);
    if (vehicle.sourceHighlight !== null) text(vehicle.sourceHighlight, `${label}, kildemarkering`, 100);
    notes(vehicle, label);
  }
  for (const [index, person] of data.people.entries()) {
    const label = `Person ${index + 1}`;
    if (!object(person, PERSON_KEYS, label)) continue;
    text(person.id, `${label}, id`, 200, true); text(person.name, `${label}, navn`, 200, true);
    if (personIds.has(person.id)) errors.push('Personer skal have unikke id’er.');
    personIds.add(person.id);
    // Telephone numbers and extensions are text: leading zeroes and formatting survive.
    text(person.phone, `${label}, telefon`, 100); text(person.extension, `${label}, lokalnummer`, 100);
    uniqueStrings(person.roles, `${label}, roller`);
    uniqueStrings(person.vehicleNumbers, `${label}, vognnumre`, 100);
    if (list(person.sourcePages, `${label}, kildesider`)) {
      person.sourcePages.forEach(value => page(value, `${label}, kilde`));
      if (new Set(person.sourcePages).size !== person.sourcePages.length) errors.push(`${label}: kildesider indeholder dubletter.`);
    }
    notes(person, label);
  }
  for (const [index, issue] of data.issues.entries()) {
    const label = `Kontrolpunkt ${index + 1}`;
    if (!object(issue, ISSUE_KEYS, label)) continue;
    text(issue.id, `${label}, id`, 200, true); text(issue.vehicleId, `${label}, vogn`, 200, true);
    if (issueIds.has(issue.id)) errors.push('Kontrolpunkter skal have unikke id’er.');
    issueIds.add(issue.id);
    text(issue.message, `${label}, beskrivelse`, 10000, true); page(issue.sourcePage, `${label}, kilde`);
    if (typeof issue.truncatedInSource !== 'boolean') errors.push(`${label}: afkortningsmarkeringen er ugyldig.`);
    if (!vehicleIds.has(issue.vehicleId)) errors.push(`${label}: vognen findes ikke.`);
  }
  for (const vehicle of data.vehicles) if (isRecord(vehicle) && Array.isArray(vehicle.driverIds) && vehicle.driverIds.some(id => !personIds.has(id))) errors.push('En vogn henviser til en person, der ikke findes.');
  for (const person of data.people) if (isRecord(person) && Array.isArray(person.vehicleNumbers) && person.vehicleNumbers.some(number => !vehicleNumbers.has(number))) errors.push('En person henviser til et vognnummer, der ikke findes.');
  const directory = errors.length ? null : clone(data);
  if (directory) for (const key of ['vehicles', 'people']) for (const item of directory[key]) item.notes ??= '';
  return {ok: errors.length === 0, errors: [...new Set(errors)], directory};
}

export function mergeDirectoryState(state, directory) {
  const result = validateDirectory(directory);
  if (!result.ok) throw new Error(result.errors.join(' '));
  const vehicles = [...new Set([...(state.vehicles || []), ...result.directory.vehicles.map(vehicle => vehicle.number)])];
  if (vehicles.length > LIMIT) throw new Error('Den samlede vognliste må højst indeholde 1.000 vogne.');
  return {...state, directory: result.directory, vehicles};
}
