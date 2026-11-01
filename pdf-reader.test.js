import test from 'node:test';
import assert from 'node:assert/strict';
import {extractPdf, PDF_LIMITS, PdfReadError, pdfAssetBase} from './pdf-reader.js';

// Public synthetic fixture; contains no user document, roster, or real schedule.
function fixture({field = true, partial = false, blank = false, pageCount = 1} = {}) {
  const stream = blank ? '' : 'BT /F1 10 Tf 25 170 Td (Old line) Tj 0 -50 Td (Outside) Tj ET';
  const objects = [
    `<< /Type /Catalog /Pages 2 0 R ${field ? '/AcroForm 6 0 R' : ''} >>`,
    `<< /Type /Pages /Kids [${Array.from({length: pageCount}, (_, i) => `${i ? i + 7 : 3} 0 R`).join(' ')}] /Count ${pageCount} >>`,
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R ${field ? '/Annots [7 0 R]' : ''} >>`,
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    '<< /Fields [7 0 R] /DR << /Font << /Helv 5 0 R >> >> /DA (/Helv 10 Tf 0 g) /NeedAppearances true >>',
    `<< /Type /Annot /Subtype /Widget /FT /Tx /T (driver) /V (New line) /Rect [${partial ? 35 : 24} 166 156 186] /P 3 0 R /F 4 >>`,
  ];
  for (let i = 1; i < pageCount; i++) objects.push('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>');
  let pdf = '%PDF-1.7\n';
  const offsets = [0];
  objects.forEach((object, index) => { offsets.push(Buffer.byteLength(pdf)); pdf += `${index + 1} 0 obj\n${object}\nendobj\n`; });
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map(offset => String(offset).padStart(10, '0') + ' 00000 n \n').join('')}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new File([pdf], 'synthetic.pdf', {type: 'application/pdf'});
}

test('actual PDF extraction normalizes coordinates and uses a populated widget over contained stale text', async () => {
  const progress = [];
  const result = await extractPdf(fixture(), {onProgress: step => progress.push(step)});
  assert.equal(result.pageCount, 1);
  assert.equal(result.fingerprint.length, 64);
  const page = result.pages[0];
  assert.deepEqual([page.pageNumber, page.width, page.height], [1, 200, 200]);
  const field = page.items.find(item => item.origin === 'annotation');
  assert.deepEqual([field.text, field.fieldName, field.x, field.y, field.width, field.height], ['New line', 'driver', 24, 14, 132, 20]);
  assert.equal(page.items.some(item => item.text === 'Old line'), false);
  assert.equal(page.suppressedItems[0].text, 'Old line');
  const outside = page.items.find(item => item.text === 'Outside');
  assert.equal(outside.x, 25);
  assert.ok(outside.y > 65 && outside.y < 85);
  assert.equal(progress[0].phase, 'read');
  assert.equal(progress.at(-1).percent, 100);
  assert.equal(progress.at(-1).phase, 'done');
});

test('partial field overlap preserves both real PDF values for review', async () => {
  const result = await extractPdf(fixture({partial: true}));
  const page = result.pages[0];
  assert.equal(page.items.find(item => item.text === 'Old line').needsReview, true);
  assert.equal(page.items.find(item => item.text === 'New line').needsReview, true);
  assert.equal(page.suppressedItems.length, 0);
  assert.equal(result.warnings.length, 1);
});

test('fingerprint is stable for identical bytes and a throwing progress UI does not damage extraction', async () => {
  const file = fixture({field: false});
  const one = await extractPdf(file);
  const two = await extractPdf(file, {onProgress() { throw new Error('UI failed'); }});
  assert.equal(one.fingerprint, two.fingerprint);
  assert.deepEqual(one.pages.map(page => page.items.map(item => item.text)), two.pages.map(page => page.items.map(item => item.text)));
  assert.equal(pdfAssetBase().protocol, 'file:');
});

test('empty text PDF and a valid 31-page PDF give distinct actionable errors', async () => {
  await assert.rejects(extractPdf(fixture({field: false, blank: true})), error => error instanceof PdfReadError && error.code === 'PDF_NO_TEXT');
  await assert.rejects(extractPdf(fixture({field: false, blank: true, pageCount: 31})), error => error.code === 'PDF_TOO_MANY_PAGES');
});

test('size limit, invalid bytes and cancellation are rejected before importing schedule data', async () => {
  await assert.rejects(extractPdf(new File([new Uint8Array(PDF_LIMITS.maxBytes + 1)], 'large.pdf')), error => error.code === 'PDF_TOO_LARGE');
  await assert.rejects(extractPdf(new File(['not a PDF'], 'wrong.pdf')), error => error.code === 'PDF_INVALID');
  const controller = new AbortController(); controller.abort();
  await assert.rejects(extractPdf(fixture(), {signal: controller.signal}), error => error.name === 'AbortError' && error.code === 'ABORTED');
  const during = new AbortController();
  await assert.rejects(extractPdf(fixture(), {signal: during.signal, onProgress(step) { if (step.phase === 'extract') during.abort(); }}), error => error.code === 'ABORTED');
});
