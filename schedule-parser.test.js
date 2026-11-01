import test from 'node:test';
import assert from 'node:assert/strict';
import {parseSchedule, matchSchedulePerson} from './schedule-parser.js';

// Synthetic fixtures only; no real schedule or personal source values belong here.
const item = (text, x, y, width = text.length * 5) => ({text, x, y, width, height: 10});
function document(week = 10, year = 2028) {
  return {filename: `synthetic_week_${week}_${year}.pdf`, fingerprint: 'synthetic-hash', pages: [{pageNumber: 1, width: 800, height: 600, items: [item(`Uge: ${week} ${year}`, 500, 10), ...['Vogn nr', 'Mandag', 'Tirsdag', 'Onsdag', 'Torsdag', 'Fredag', 'Bemærkninger'].map((text, index) => item(text, index * 100, 30)), item('Vogn 999', 0, 60), item('Maria Ole', 100, 60), item('Maria', 200, 60), item('Ingen', 300, 60), item('???', 400, 60), item('Ole', 500, 60), item('Kontrollér opgaven', 600, 60), item('Værksted', 0, 80), item('Maria', 100, 80)]}]};
}
test('weekday columns become dated plan candidates without invented times or route numbers', () => {
  const parsed = parseSchedule(document());
  assert.equal(parsed.candidates.length, 6);
  assert.equal(parsed.candidates[0].date, '2028-03-06');
  assert.equal(parsed.candidates[4].date, '2028-03-10');
  assert.equal(parsed.meta.weekStart, '2028-03-06'); assert.equal(parsed.meta.weekEnd, '2028-03-12');
  assert.ok(parsed.candidates.every(candidate => candidate.start === '' && candidate.end === '' && candidate.route === ''));
  assert.equal(parsed.candidates[0].source.fileHash, 'synthetic-hash');
  assert.equal(parsed.candidates[5].vehicle, 'Værksted'); assert.equal(parsed.candidates[5].task, 'Værksted');
});
test('unassigned and unknown cells never become absence or worked-time assertions', () => {
  const parsed = parseSchedule(document());
  assert.equal(parsed.candidates[2].kind, 'unassigned'); assert.equal(parsed.candidates[3].kind, 'unknown');
  assert.equal(parsed.candidates[2].absenceCode, ''); assert.deepEqual(parsed.candidates[2].people, []);
  assert.equal(parsed.candidates[2].needsReview, true);
});
test('missing year remains unresolved; explicit year or a clear filename restores dates', () => {
  const doc = document(); doc.filename = 'synthetic.pdf'; doc.pages[0].items[0].text = 'Uge: 10';
  assert.ok(parseSchedule(doc).candidates.every(candidate => candidate.date === ''));
  assert.equal(parseSchedule(doc, {year: 2028}).candidates[0].date, '2028-03-06');
  doc.filename = 'synthetic_week_10_2028.pdf';
  const parsed = parseSchedule(doc); assert.equal(parsed.candidates[0].date, '2028-03-06'); assert.equal(parsed.meta.yearSource, 'filename');
  assert.ok(parsed.warnings.some(warning => warning.includes('filnavnet')));
});
test('invalid ISO week, absent table, blank pages, and empty cells are handled explicitly', () => {
  assert.equal(parseSchedule(document(53, 2028)).candidates[0].date, '');
  const doc = document(); doc.pages.push({pageNumber: 2, width: 800, height: 600, items: []});
  assert.deepEqual(parseSchedule(doc).meta.blankPages, [2]);
  const missing = parseSchedule({pages: []}); assert.deepEqual(missing.candidates, []); assert.ok(missing.warnings.length);
});
test('roster names aid crew segmentation while sidenotes remain unspecified metadata', () => {
  const doc = document();
  doc.pages.push({pageNumber: 2, width: 800, height: 600, items: [item('Hold A', 100, 30), item('Hold B', 400, 30), item('Maria', 100, 60), item('Mand-fred', 200, 60), item('Ole', 100, 80), item('Lise', 100, 100), item('Mikkel', 400, 60), item('Signe', 400, 80), item('Vera', 400, 100)]});
  const parsed = parseSchedule(doc);
  assert.deepEqual(parsed.candidates[0].people, ['Maria', 'Ole']);
  assert.equal(parsed.availability.find(record => record.person === 'Maria').note, 'Mand-fred');
  assert.equal(parsed.availability[0].meaning, 'unspecified');
  assert.equal(parsed.candidates.length, 6);
});
test('stable candidate IDs survive repeated parsing and source annotations require review', () => {
  const doc = document();
  assert.deepEqual(parseSchedule(doc).candidates.map(candidate => candidate.id), parseSchedule(doc).candidates.map(candidate => candidate.id));
  doc.pages[0].items.find(item => item.text === 'Maria').origin = 'annotation';
  assert.ok(parseSchedule(doc).candidates[1].warnings.some(warning => warning.includes('annotation')));
});
test('person matching preserves identities and flags one-edit spelling suggestions', () => {
  const candidate = {person: 'Marria', people: ['Marria']};
  assert.deepEqual(matchSchedulePerson(candidate, 'Maria'), {match: true, kind: 'similar', needsReview: true, matchedName: 'Marria'});
  assert.equal(matchSchedulePerson(candidate, 'Marria').kind, 'exact');
  assert.equal(matchSchedulePerson({person: 'Maria Ole', people: ['Maria', 'Ole']}, 'Maria').kind, 'exact');
  assert.equal(matchSchedulePerson({person: 'Maria Jensen', people: []}, 'Maria').kind, 'contains');
  assert.equal(matchSchedulePerson(candidate, 'Lise').match, false);
});
test('pdfplumber positioned words are accepted for private offline verification', () => {
  const source = document();
  const pages = source.pages.map(page => ({page: page.pageNumber, width: page.width, height: page.height, words: page.items.map(item => ({text: item.text, x0: item.x, x1: item.x + item.width, top: item.y, bottom: item.y + item.height}))}));
  assert.equal(parseSchedule(pages, {fileName: source.filename}).candidates.length, 6);
});
test('general notes without a row association are preserved as warnings, never absences', () => {
  const doc = document(); doc.pages[0].items.push(item('Ukoblet ferienote', 600, 45));
  const parsed = parseSchedule(doc);
  assert.ok(parsed.warnings.some(warning => warning.includes('Ukoblet ferienote')));
  assert.equal(parsed.candidates.length, 6);
  assert.ok(parsed.candidates.every(candidate => candidate.absenceCode === ''));
});
