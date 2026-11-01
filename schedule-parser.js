// Generic, local-only interpretation of positioned weekly schedule text.
// Candidates are plans, never proof of attendance or actual worked hours.
const DAY = 86400000;
const WEEKDAYS = ['mandag', 'tirsdag', 'onsdag', 'torsdag', 'fredag'];
const norm = value => String(value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/ø/gi, 'o').replace(/æ/gi, 'ae').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
const unique = values => [...new Set(values.filter(Boolean))];
const dateISO = value => new Date(value).toISOString().slice(0, 10);
function weekMonday(year, week) {
  if (!Number.isInteger(year) || year < 1900 || year > 2199 || !Number.isInteger(week) || week < 1 || week > 53) return null;
  const jan4 = Date.UTC(year, 0, 4), monday = jan4 - ((new Date(jan4).getUTCDay() + 6) % 7) * DAY + (week - 1) * 7 * DAY;
  if (new Date(monday + 3 * DAY).getUTCFullYear() !== year) return null;
  return monday;
}
function stableId(value) {
  let result = 2166136261;
  for (const character of value) { result ^= character.charCodeAt(0); result = Math.imul(result, 16777619); }
  return `schedule-${(result >>> 0).toString(36)}`;
}
function normalizePage(page, index) {
  const items = (page.items || page.words || []).map(item => ({text: String(item.text ?? item.str ?? '').trim(), x: Number(item.x ?? item.x0), y: Number(item.y ?? item.top), width: Number(item.width ?? (item.x1 - item.x0)) || 0, height: Number(item.height ?? (item.bottom - item.top)) || 10, origin: item.origin || 'text'})).filter(item => item.text && Number.isFinite(item.x) && Number.isFinite(item.y));
  return {page: page.pageNumber ?? page.page ?? index + 1, width: page.width || 0, height: page.height || 0, items};
}
function lines(items, tolerance = 3) {
  const result = [];
  for (const item of [...items].sort((a, b) => a.y - b.y || a.x - b.x)) {
    let line = result.find(line => Math.abs(line.y - item.y) <= tolerance);
    if (!line) { line = {y: item.y, items: []}; result.push(line); }
    line.items.push(item);
  }
  for (const line of result) { line.items.sort((a, b) => a.x - b.x); line.text = line.items.map(item => item.text).join(' '); }
  return result;
}
function findHeader(page) {
  for (const line of lines(page.items)) {
    const positions = WEEKDAYS.map(day => line.items.find(item => norm(item.text) === day));
    if (positions.every(Boolean) && positions.every((item, index) => !index || item.x > positions[index - 1].x)) {
      const remark = line.items.find(item => norm(item.text).startsWith('bemaerk'));
      return {y: line.y, days: positions, remarkX: remark?.x ?? page.width + 1};
    }
  }
  return null;
}
function rosterFromPage(page) {
  const grouped = lines(page.items);
  if (!grouped.length) return [];
  const header = grouped[0];
  const anchors = unique(header.items.filter(item => page.items.filter(other => other.y > header.y + 5 && Math.abs(other.x - item.x) < 2).length >= 3).map(item => item.x)).sort((a, b) => a - b);
  if (!anchors.length || anchors.length > 4) return [];
  const records = [];
  for (const [column, anchor] of anchors.entries()) {
    const next = anchors[column + 1] ?? page.width + 1;
    const category = header.items.filter(item => item.x >= anchor - 2 && item.x < next - 2).map(item => item.text).join(' ');
    for (const line of grouped.slice(1)) {
      const columnItems = line.items.filter(item => item.x >= anchor - 2 && item.x < next - 2);
      if (!columnItems.length || Math.abs(columnItems[0].x - anchor) > 3) continue;
      const nameItems = [], noteItems = [];
      let previousEnd = anchor;
      for (const item of columnItems) {
        if (!nameItems.length || (!noteItems.length && item.x - previousEnd < 12)) nameItems.push(item);
        else noteItems.push(item);
        previousEnd = item.x + item.width;
      }
      const person = nameItems.map(item => item.text).join(' ').trim();
      if (person) records.push({person, category, note: noteItems.map(item => item.text).join(' '), meaning: 'unspecified', source: {page: page.page, row: records.length + 1}});
    }
  }
  return records;
}
function namesInCell(text, roster) {
  const dictionary = new Set(roster.flatMap(name => [norm(name), norm(name.split(/\s+/)[0])]).filter(Boolean));
  const parts = text.split(/\s+/).filter(Boolean), names = [];
  let unknown = [], recognized = 0;
  const flush = () => { if (unknown.length) { names.push(unknown.join(' ')); unknown = []; } };
  for (let index = 0; index < parts.length;) {
    let count = 0;
    for (let length = Math.min(6, parts.length - index); length > 0; length--) if (dictionary.has(norm(parts.slice(index, index + length).join(' ')))) { count = length; break; }
    if (count) { flush(); names.push(parts.slice(index, index + count).join(' ')); recognized++; index += count; }
    else if (/^[A-ZÆØÅ]$/.test(parts[index]) && names.length && !unknown.length) { names[names.length - 1] += ` ${parts[index++]}`; }
    else unknown.push(parts[index++]);
  }
  flush();
  return {people: unique(names), uncertain: !roster.length || recognized === 0 || names.some(name => !dictionary.has(norm(name)))};
}

export function parseSchedule(document, options = {}) {
  const input = Array.isArray(document) ? {pages: document} : document || {};
  const fileName = options.fileName || input.filename || input.fileName || '';
  const fileHash = options.fingerprint || input.fingerprint || '';
  const pages = (input.pages || []).map(normalizePage);
  const layouts = pages.map(page => ({page, header: findHeader(page)}));
  const main = layouts.find(layout => layout.header);
  const headerText = main ? lines(main.page.items.filter(item => item.y < main.header.y + 2)).map(line => line.text).join(' ') : '';
  const headerWeek = headerText.match(/uge\s*:?\s*(\d{1,2})(?:\s+(20\d{2}))?/i);
  const fileWeek = fileName.match(/(?:uge|week)[_\s-]*(\d{1,2})(?:[_\s-]+(20\d{2}))?/i);
  const headerYear = headerWeek?.[2] || headerText.match(/\b(20\d{2})\b/)?.[1];
  const fileYear = fileWeek?.[2] || fileName.match(/(?:^|[_\s-])(20\d{2})(?:[_\s.-]|$)/)?.[1];
  const week = Number(options.week ?? headerWeek?.[1] ?? fileWeek?.[1]) || null;
  const year = Number(options.year ?? headerYear ?? fileYear) || null;
  const yearSource = options.year != null ? 'override' : headerYear ? 'header' : fileYear ? 'filename' : 'missing';
  const weekSource = options.week != null ? 'override' : headerWeek ? 'header' : fileWeek ? 'filename' : 'missing';
  const monday = weekMonday(year, week), warnings = (input.warnings || []).map(warning => typeof warning === 'string' ? warning : String(warning.message || warning));
  if (!main) warnings.push('Ingen tabel med kolonnerne mandag til fredag blev fundet.');
  if (!monday) warnings.push('Ugen og året mangler eller er ugyldige. Angiv dem før import.');
  if (yearSource === 'filename') warnings.push('Årstallet er læst fra filnavnet. Kontrollér datoerne.');
  if (headerWeek && fileWeek && Number(headerWeek[1]) !== Number(fileWeek[1])) warnings.push('Ugen i tabellen afviger fra filnavnet. Kontrollér datoerne.');
  const availability = layouts.filter(layout => !layout.header && layout.page.items.length).flatMap(layout => rosterFromPage(layout.page)).map(record => ({...record, week, year, source: {...record.source, fileName, ...(fileHash ? {fileHash} : {})}}));
  const roster = unique(availability.map(record => record.person));
  const candidates = [];
  for (const {page, header} of layouts.filter(layout => layout.header)) {
    const leftEdge = header.days[0].x - 3;
    const rowLabels = lines(page.items.filter(item => item.y > header.y + 4 && item.x < leftEdge)).filter(line => line.text.trim());
    const orphanRemarks = lines(page.items.filter(item => item.y > header.y + 4 && item.x >= header.remarkX - 3 && !rowLabels.some(label => Math.abs(label.y - item.y) <= 4)));
    for (const remark of orphanRemarks) warnings.push(`Generel bemærkning uden sikker person/dato: ${remark.text}`);
    for (const [rowIndex, label] of rowLabels.entries()) {
      const number = label.text.match(/^vogn\s*(\d+[A-Za-z-]*)$/i)?.[1];
      if (/^(?:uge|vogn\s*nr|side)\b/i.test(label.text)) continue;
      const rowItems = page.items.filter(item => Math.abs(item.y - label.y) <= 4);
      const remark = rowItems.filter(item => item.x >= header.remarkX - 3).sort((a, b) => a.x - b.x).map(item => item.text).join(' ');
      for (const [dayIndex, day] of header.days.entries()) {
        const endX = (header.days[dayIndex + 1]?.x ?? header.remarkX) - 3;
        const cell = rowItems.filter(item => item.x >= day.x - 3 && item.x < endX).sort((a, b) => a.x - b.x).map(item => item.text).join(' ').trim();
        if (!cell) continue;
        const kind = /^(ingen|ubemandet)$/i.test(cell) ? 'unassigned' : /^[?\s]+$/.test(cell) ? 'unknown' : 'work';
        const found = kind === 'work' ? namesInCell(cell, roster) : {people: [], uncertain: true};
        const candidateWarnings = [];
        if (!monday) candidateWarnings.push('Dato skal vælges.');
        if (yearSource === 'filename') candidateWarnings.push('År fra filnavn – kontrollér dato.');
        if (kind === 'unassigned') candidateWarnings.push('Vognen er uden angivet bemanding; dette er ikke en fridag.');
        if (kind === 'unknown') candidateWarnings.push('Personen er ukendt i planen.');
        if (kind === 'work' && found.uncertain) candidateWarnings.push('Kontrollér navne og bemanding mod kilden.');
        if (remark) candidateWarnings.push('Rækken har en fælles bemærkning; kontrollér hvilken dag den gælder.');
        if (rowItems.some(item => item.origin === 'annotation')) candidateWarnings.push('Rækken indeholder en udfyldt PDF-annotation. Kontrollér den.');
        const vehicle = number || label.text;
        const source = {fileName, ...(fileHash ? {fileHash} : {}), page: page.page, row: rowIndex + 1, week, year};
        const date = monday === null ? '' : dateISO(monday + dayIndex * DAY);
        candidates.push({id: stableId(`${fileHash || fileName}|${page.page}|${rowIndex}|${dayIndex}|${vehicle}|${cell}`), date, person: cell, people: found.people, vehicle, task: number ? '' : label.text, route: '', start: '', end: '', kind, status: kind === 'work' ? 'assigned' : kind, absenceCode: '', notes: remark, source, confidence: kind !== 'work' || !monday ? 'low' : candidateWarnings.length ? 'medium' : 'high', warnings: candidateWarnings, needsReview: candidateWarnings.length > 0});
      }
    }
  }
  if (candidates.length) warnings.push('Planen angiver ingen faktiske arbejdstider. Start og slut skal registreres særskilt.');
  if (availability.some(record => record.note)) warnings.push('Personalelistens sidenoter har ukendt betydning og bliver ikke til vagter eller fravær.');
  const meta = {week, year, weekStart: monday === null ? '' : dateISO(monday), weekEnd: monday === null ? '' : dateISO(monday + 6 * DAY), yearSource, weekSource, pageCount: pages.length, assignmentPages: layouts.filter(layout => layout.header).map(layout => layout.page.page), blankPages: pages.filter(page => !page.items.length).map(page => page.page)};
  return {candidates, people: unique([...roster, ...candidates.filter(candidate => candidate.kind === 'work').flatMap(candidate => candidate.people)]), vehicles: unique(candidates.map(candidate => candidate.vehicle)), availability, warnings: unique(warnings), meta, week, year};
}

function oneEdit(a, b) {
  if (a.length < 4 || b.length < 4 || Math.abs(a.length - b.length) > 1) return false;
  let i = 0, j = 0, edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++edits > 1) return false;
    if (a.length <= b.length) j++;
    if (a.length >= b.length) i++;
  }
  return edits + (i < a.length || j < b.length ? 1 : 0) === 1;
}
export function matchSchedulePerson(candidate, query) {
  const needle = norm(query), names = unique([...(candidate.people || []), candidate.person]);
  if (!needle) return {match: true, kind: 'contains', needsReview: false, matchedName: ''};
  const exact = names.find(name => norm(name) === needle);
  if (exact) return {match: true, kind: 'exact', needsReview: false, matchedName: exact};
  const contains = names.find(name => ` ${norm(name)} `.includes(` ${needle} `));
  if (contains) return {match: true, kind: 'contains', needsReview: true, matchedName: contains};
  const similar = names.find(name => oneEdit(norm(name), needle));
  return similar ? {match: true, kind: 'similar', needsReview: true, matchedName: similar} : {match: false, kind: 'none', needsReview: false, matchedName: ''};
}
