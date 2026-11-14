const CENTRE_KEYS = ['id', 'name', 'customerNumber', 'address', 'instructions', 'customerNumbers', 'codes'];
const CUSTOMER_KEYS = ['id', 'company', 'number'];
const CODE_KEYS = ['id', 'code', 'label', 'instructions'];
const MAX_CENTRES = 200;
const MAX_CUSTOMERS = 50;
const MAX_CODES = 300;
const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
const record = value => value !== null && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype;
const normalize = value => value.normalize('NFC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('da-DK');
const codeKey = value => JSON.stringify([normalize(value.code), normalize(value.label)]);
const companyKey = value => normalize(value.company);

function checkRecord(value, keys, label, errors) {
  if (!record(value)) { errors.push(`${label} skal være et objekt.`); return false; }
  if (Object.keys(value).some(key => !keys.includes(key))) errors.push(`${label} indeholder ukendte felter.`);
  return true;
}

function readText(value, key, max, label, errors, {required = false, multiline = false} = {}) {
  if (!own(value, key) && !required) return '';
  const text = value[key];
  const unsupported = multiline ? /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/ : /[\u0000-\u001f\u007f]/;
  if (typeof text !== 'string' || text.length > max || unsupported.test(text) || (required && !text.trim())) {
    errors.push(`${label}: ${key} skal være ${required ? 'udfyldt og ' : ''}tekst på højst ${max} tegn.`);
    return '';
  }
  return text.trim();
}

function generatedId(prefix, key) {
  let hash = 2166136261;
  for (let index = 0; index < key.length; index++) hash = Math.imul(hash ^ key.charCodeAt(index), 16777619);
  return `${prefix}-${(hash >>> 0).toString(36)}`;
}

function readId(value, fallback, canGenerate, label, errors) {
  if (canGenerate && !own(value, 'id')) return fallback;
  return readText(value, 'id', 120, label, errors, {required: true});
}

function readList(value, max, label, errors) {
  if (!Array.isArray(value) || value.length > max) {
    errors.push(`${label} skal være en liste med højst ${max} poster.`);
    return [];
  }
  return value;
}

function checkUnique(rows, key, label, errors) {
  if (new Set(rows.map(row => row.id)).size !== rows.length) errors.push(`${label} skal have unikke id’er.`);
  if (new Set(rows.map(key)).size !== rows.length) errors.push(`${label} indeholder dubletter.`);
}

export function validateWasteCentres(input) {
  const errors = [];
  const envelope = !Array.isArray(input);
  if (envelope) {
    if (!checkRecord(input, ['kind', 'version', 'centres'], 'Importfilen', errors)) return {ok: false, errors, centres: null};
    if (input.kind !== 'arbejde-waste-centres' || input.version !== 1) errors.push('Importfilen skal være affaldscentrenes JSON-format, version 1.');
  }
  const centres = [];
  for (const [index, value] of readList(envelope ? input.centres : input, MAX_CENTRES, 'Affaldscentre', errors).entries()) {
    const label = `Affaldscenter ${index + 1}`;
    if (!checkRecord(value, CENTRE_KEYS, label, errors)) continue;
    const name = readText(value, 'name', 200, label, errors, {required: true});
    const centre = {
      id: readId(value, generatedId('centre', normalize(name)), envelope, label, errors), name,
      customerNumber: readText(value, 'customerNumber', 80, label, errors),
      address: readText(value, 'address', 400, label, errors, {multiline: true}),
      instructions: readText(value, 'instructions', 4000, label, errors, {multiline: true}),
      customerNumbers: [], codes: []
    };
    const customers = own(value, 'customerNumbers') ? value.customerNumbers : [];
    for (const [customerIndex, customer] of readList(customers, MAX_CUSTOMERS, `${label}, kundenumre`, errors).entries()) {
      const description = `${label}, kundenummer ${customerIndex + 1}`;
      if (!checkRecord(customer, CUSTOMER_KEYS, description, errors)) continue;
      const company = readText(customer, 'company', 200, description, errors);
      centre.customerNumbers.push({
        id: readId(customer, generatedId('customer', normalize(company)), envelope, description, errors), company,
        number: readText(customer, 'number', 80, description, errors, {required: true})
      });
    }
    const codes = own(value, 'codes') ? value.codes : [];
    for (const [codeIndex, item] of readList(codes, MAX_CODES, `${label}, varenumre`, errors).entries()) {
      const description = `${label}, varenummer ${codeIndex + 1}`;
      if (!checkRecord(item, CODE_KEYS, description, errors)) continue;
      const code = readText(item, 'code', 80, description, errors, {required: true});
      const wasteLabel = readText(item, 'label', 200, description, errors, {required: true});
      centre.codes.push({
        id: readId(item, generatedId('code', codeKey({code, label: wasteLabel})), envelope, description, errors), code, label: wasteLabel,
        instructions: readText(item, 'instructions', 4000, description, errors, {multiline: true})
      });
    }
    checkUnique(centre.customerNumbers, companyKey, `${label}, kundenumre pr. virksomhed`, errors);
    checkUnique(centre.codes, codeKey, `${label}, varenumre og affaldstyper`, errors);
    centres.push(centre);
  }
  checkUnique(centres, centre => normalize(centre.name), 'Affaldscentre', errors);
  return {ok: errors.length === 0, errors, centres: errors.length ? null : centres};
}

function mergeFields(target, incoming, fields, label, result) {
  for (const [field, fieldLabel] of fields) {
    if (!incoming[field] || normalize(target[field]) === normalize(incoming[field])) continue;
    if (target[field]) result.conflicts.push(`${label}: ${fieldLabel} afviger. Den eksisterende værdi er bevaret.`);
    else { target[field] = incoming[field]; result.filledFields++; }
  }
}

function recordMatch(records, incoming, key) {
  const byId = records.find(record => record.id === incoming.id);
  const byKey = records.find(record => key(record) === key(incoming));
  return {existing: byId || byKey, collision: Boolean(byId && byKey && byId !== byKey)};
}

function mergeItems(local, incoming, key, label, fields, max, counter, result) {
  for (const item of incoming) {
    const description = label(item);
    const {existing, collision} = recordMatch(local, item, key);
    if (collision) { result.conflicts.push(`${description}: id og oplysninger passer til to forskellige poster.`); continue; }
    if (!existing) {
      if (local.length >= max) { result.conflicts.push(`${description}: grænsen på ${max} poster er nået.`); continue; }
      local.push(item);
      result[counter]++;
      continue;
    }
    const changes = result.filledFields + result.conflicts.length;
    mergeFields(existing, item, fields, description, result);
    if (result.filledFields + result.conflicts.length === changes) result.skipped++;
  }
}

export function mergeWasteCentres(existing, incoming) {
  const local = validateWasteCentres(existing), imported = validateWasteCentres(incoming);
  if (!local.ok || !imported.ok) throw new Error([...local.errors, ...imported.errors].join(' '));
  const result = {centres: local.centres, addedCentres: 0, addedCodes: 0, addedCustomerNumbers: 0, filledFields: 0, skipped: 0, conflicts: []};
  for (const centre of imported.centres) {
    const match = recordMatch(result.centres, centre, value => normalize(value.name));
    if (match.collision) { result.conflicts.push(`${centre.name}: id og navn passer til to forskellige centre.`); continue; }
    if (!match.existing) {
      if (result.centres.length >= MAX_CENTRES) { result.conflicts.push(`${centre.name}: grænsen på ${MAX_CENTRES} centre er nået.`); continue; }
      result.centres.push(centre);
      result.addedCentres++;
      result.addedCodes += centre.codes.length;
      result.addedCustomerNumbers += centre.customerNumbers.length;
      continue;
    }
    const target = match.existing;
    const changes = result.filledFields + result.conflicts.length + result.addedCodes + result.addedCustomerNumbers;
    const skipped = result.skipped;
    mergeFields(target, centre, [['name', 'navn'], ['customerNumber', 'kundenummer'], ['address', 'adresse'], ['instructions', 'anvisninger']], target.name, result);
    mergeItems(target.customerNumbers, centre.customerNumbers, companyKey, item => `${target.name} · ${item.company || 'kundenummer'}`,
      [['company', 'virksomhed'], ['number', 'kundenummer']], MAX_CUSTOMERS, 'addedCustomerNumbers', result);
    mergeItems(target.codes, centre.codes, codeKey, item => `${target.name} · ${item.code} ${item.label}`,
      [['code', 'varenummer'], ['label', 'affaldstype'], ['instructions', 'anvisninger']], MAX_CODES, 'addedCodes', result);
    if (result.filledFields + result.conflicts.length + result.addedCodes + result.addedCustomerNumbers === changes && result.skipped === skipped) result.skipped++;
  }
  return result;
}
