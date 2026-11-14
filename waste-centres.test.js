import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyState, validateState} from './domain.js';
import {mergeWasteCentres, validateWasteCentres} from './waste-centres.js';

const envelope = centres => ({kind: 'arbejde-waste-centres', version: 1, centres});
const sample = () => ({
  id: 'centre-a', name: 'Modtagecenter A', customerNumber: '00012', address: 'Testvej 1\n1000 Testby',
  instructions: 'Vej først', customerNumbers: [{id: 'kunde-a', company: 'Testfirma', number: '00420'}],
  codes: [
    {id: 'vare-a', code: '0007', label: 'Pap', instructions: 'Sorteres'},
    {id: 'vare-b', code: '0007', label: 'Papir', instructions: ''}
  ]
});

test('waste centre backup round-trips codes and customer numbers as text with leading zeros', () => {
  const state = emptyState();
  state.wasteCentres = [sample()];
  const validated = validateState(JSON.parse(JSON.stringify(state)));
  assert.deepEqual(validated.state.wasteCentres, state.wasteCentres);
  validated.state.wasteCentres[0].codes[0].code = '00';
  assert.equal(state.wasteCentres[0].codes[0].code, '0007');
  delete state.wasteCentres;
  assert.equal(validateState(state).ok, true);
  assert.equal(Object.hasOwn(validateState(state).state, 'wasteCentres'), false);
});

test('waste centre import can generate stable IDs without changing the display fields', () => {
  const input = sample();
  delete input.id;
  for (const record of [...input.codes, ...input.customerNumbers]) delete record.id;
  assert.equal(validateWasteCentres([input]).ok, false);
  const checked = validateWasteCentres(envelope([input]));
  assert.equal(checked.ok, true);
  const [centre] = checked.centres;
  assert.equal(centre.name, input.name);
  assert.equal(centre.codes[0].code, '0007');
  assert.notEqual(centre.codes[0].id, centre.codes[1].id);
  assert.deepEqual(validateWasteCentres(envelope([input])).centres, checked.centres);
  assert.equal(Object.hasOwn(input, 'id'), false);
});

test('validation rejects invalid types, unknown keys and duplicate logical identities', () => {
  const row = sample();
  for (const altered of [
    {...row, customerNumber: 12}, {...row, codes: [{...row.codes[0], code: 7}]}, {...row, customerNumbers: [{...row.customerNumbers[0], number: 420}]},
    {...row, notes: 'Unknown field'}, {...row, codes: null}, {...row, name: '  '}, {...row, address: 'x'.repeat(401)},
    {...row, codes: [row.codes[0], {...row.codes[0], id: 'other-id', label: ' pap '}]},
    {...row, customerNumbers: [row.customerNumbers[0], {id: 'other-customer', company: ' testfirma ', number: '001'}]}
  ]) assert.equal(validateWasteCentres(envelope([altered])).ok, false);
  assert.equal(validateWasteCentres([row, {...row, id: 'second', name: 'modtagecenter a'}]).ok, false);
  assert.equal(validateWasteCentres({...envelope([row]), version: 2}).ok, false);
  assert.equal(validateState({...emptyState(), wasteCentres: envelope([row])}).ok, false);
  assert.equal(validateWasteCentres(envelope([JSON.parse('{"name":"Test","__proto__":{"polluted":true}}')])).ok, false);
});

test('merging fills blanks and adds missing subsidiary records while keeping local edits', () => {
  const existing = sample();
  existing.instructions = '';
  const incoming = sample();
  incoming.id = 'external-id';
  incoming.address = 'Ny testvej';
  incoming.customerNumbers[0].number = '00999';
  incoming.customerNumbers.push({id: 'customer-b', company: 'Et andet firma', number: '00350'});
  incoming.codes[0].label = 'Omskrevet vare';
  incoming.codes[0].instructions = 'Ny anvisning';
  incoming.codes[1].instructions = 'Ny anvisning til papir';
  incoming.codes.push({id: 'vare-c', code: '0007', label: 'Bølgepap'});
  const merged = mergeWasteCentres([existing], envelope([incoming]));
  const [centre] = merged.centres;
  assert.equal(centre.id, existing.id);
  assert.equal(centre.address, existing.address);
  assert.equal(centre.instructions, incoming.instructions);
  assert.deepEqual(centre.customerNumbers[0], existing.customerNumbers[0]);
  assert.deepEqual(centre.codes[0], existing.codes[0]);
  assert.equal(centre.codes[1].instructions, incoming.codes[1].instructions);
  assert.equal(merged.addedCentres, 0);
  assert.equal(merged.addedCodes, 1);
  assert.equal(merged.addedCustomerNumbers, 1);
  assert.equal(merged.filledFields, 2);
  assert.equal(merged.conflicts.length, 4);
  assert.equal(existing.instructions, '');
  assert.equal(existing.codes.length, 2);
});

test('centre catalog merge is idempotent and does not merge conflicting ID and name matches', () => {
  const imported = envelope([sample()]);
  const first = mergeWasteCentres([], imported);
  assert.deepEqual([first.addedCentres, first.addedCustomerNumbers, first.addedCodes], [1, 1, 2]);
  const second = mergeWasteCentres(first.centres, imported);
  assert.deepEqual(second.centres, first.centres);
  assert.deepEqual([second.addedCentres, second.addedCustomerNumbers, second.addedCodes, second.filledFields], [0, 0, 0, 0]);
  assert.equal(second.skipped, 3);
  const secondCentre = {...sample(), id: 'centre-b', name: 'Modtagecenter B'};
  const local = [sample(), secondCentre];
  const ambiguous = mergeWasteCentres(local, envelope([{...secondCentre, id: 'centre-a'}]));
  assert.deepEqual(ambiguous.centres, local);
  assert.equal(ambiguous.conflicts.length, 1);
});
