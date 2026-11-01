/** Private, local PDF extraction. Coordinates are viewport points at scale 1,
 * with page rotation/crop applied, x rightwards and y downwards from top-left.
 * Text boxes approximate the font ascent/descent; no raster/OCR inference.
 */
export const PDF_LIMITS = Object.freeze({maxBytes: 20 * 1024 * 1024, maxPages: 30, maxItems: 150000, maxPageItems: 30000, maxCharacters: 2000000, timeoutMs: 120000});

export class PdfReadError extends Error {
  constructor(code, message) { super(message); this.name = code === 'ABORTED' ? 'AbortError' : 'PdfReadError'; this.code = code; }
}

export function pdfAssetBase() {
  if (typeof window !== 'undefined' && window.location.protocol === 'file:') return new URL('https://tobiasmejlvang-afk.github.io/Arbejde/assets/pdfjs/');
  return new URL('./assets/pdfjs/', import.meta.url);
}
let enginePromise;
const abortError = () => new PdfReadError('ABORTED', 'PDF-læsningen er afbrudt.');
const finite = value => Number.isFinite(value);
const round = value => Math.round(value * 1000) / 1000;
const nonempty = value => typeof value === 'string' && value.trim().length > 0;

async function engine() {
  const base = pdfAssetBase();
  enginePromise ??= import(new URL('pdf.min.mjs', base).href).then(pdf => { pdf.GlobalWorkerOptions.workerSrc = new URL('pdf.worker.min.mjs', base).href; return pdf; }).catch(() => { enginePromise = null; throw new PdfReadError('PDF_ENGINE_UNAVAILABLE', 'PDF-læseren kunne ikke indlæses. Åbn appens HTTPS-adresse, og lad offlinefilerne blive hentet.'); });
  return enginePromise;
}

function checkAbort(signal) { if (signal?.aborted) throw abortError(); }

function readFile(file, signal, progress) {
  checkAbort(signal);
  if (typeof FileReader === 'undefined') {
    // Node's File API is supported for offline extraction checks; browsers use FileReader.
    return new Promise((resolve, reject) => {
      const aborted = () => reject(abortError());
      signal?.addEventListener('abort', aborted, {once: true});
      Promise.resolve().then(() => file.arrayBuffer()).then(resolve, () => reject(new PdfReadError('PDF_READ_FAILED', 'PDF-filen kunne ikke læses. Vælg filen igen.'))).finally(() => signal?.removeEventListener('abort', aborted));
    });
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    const cleanup = () => signal?.removeEventListener('abort', aborted);
    const aborted = () => { reader.abort(); cleanup(); reject(abortError()); };
    signal?.addEventListener('abort', aborted, {once: true});
    reader.onprogress = event => progress(event.loaded, event.lengthComputable ? event.total : file.size);
    reader.onerror = () => { cleanup(); reject(new PdfReadError('PDF_READ_FAILED', 'PDF-filen kunne ikke læses. Vælg filen igen.')); };
    reader.onabort = () => { cleanup(); reject(abortError()); };
    reader.onload = () => { cleanup(); resolve(reader.result); };
    reader.readAsArrayBuffer(file);
  });
}

function textBox(pdf, viewport, item, styles) {
  const transform = pdf.Util.transform(viewport.transform, item.transform);
  if (!transform.every(finite)) return null;
  const style = styles[item.fontName] || {};
  const fontHeight = Math.hypot(transform[2], transform[3]);
  const advanceScale = Math.hypot(transform[0], transform[1]);
  if (!fontHeight || !advanceScale) return null;
  const ascent = finite(style.ascent) ? style.ascent : 0.8;
  const descent = finite(style.descent) ? style.descent : ascent - 1;
  const advance = Math.abs((style.vertical ? item.height : item.width) * viewport.scale);
  const dx = transform[0] / advanceScale * advance, dy = transform[1] / advanceScale * advance;
  const top = [transform[4] + transform[2] * ascent, transform[5] + transform[3] * ascent];
  const bottom = [transform[4] + transform[2] * descent, transform[5] + transform[3] * descent];
  const xs = [top[0], top[0] + dx, bottom[0], bottom[0] + dx], ys = [top[1], top[1] + dy, bottom[1], bottom[1] + dy];
  return {text: item.str, x: round(Math.min(...xs)), y: round(Math.min(...ys)), width: round(Math.max(...xs) - Math.min(...xs)), height: round(Math.max(...ys) - Math.min(...ys)), origin: 'text'};
}

function annotationBox(pdf, viewport, annotation) {
  if (!(annotation.annotationType === pdf.AnnotationType.WIDGET || annotation.subtype === 'Widget' || annotation.fieldType)) return null;
  if (annotation.annotationFlags & 35) return null; // Invisible, hidden, or no-view fields.
  let value = annotation.fieldValue;
  if (Array.isArray(value)) value = value.filter(item => typeof item === 'string').join('; ');
  if (value === true) value = '✓';
  if (!nonempty(value) || (annotation.fieldType === 'Btn' && /^(?:off|false)$/i.test(value))) return null;
  if (!Array.isArray(annotation.rect) || annotation.rect.length !== 4 || !annotation.rect.every(finite)) return null;
  // PDF.js 6 exposes the viewport matrix rather than the removed rectangle helper.
  const [a, b, c, d, e, f] = viewport.transform, [x1, y1, x2, y2] = annotation.rect;
  const points = [[x1, y1], [x2, y1], [x1, y2], [x2, y2]].map(([x, y]) => [a * x + c * y + e, b * x + d * y + f]);
  const xs = points.map(point => point[0]), ys = points.map(point => point[1]);
  return {text: value, x: round(Math.min(...xs)), y: round(Math.min(...ys)), width: round(Math.max(...xs) - Math.min(...xs)), height: round(Math.max(...ys) - Math.min(...ys)), origin: 'annotation', fieldName: String(annotation.fieldName || ''), fieldType: String(annotation.fieldType || '')};
}

function intersects(a, b) { return Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x) > 0.5 && Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y) > 0.5; }
function contained(text, field) { return text.width > 0 && text.height > 0 && text.x >= field.x - 0.75 && text.y >= field.y - 0.75 && text.x + text.width <= field.x + field.width + 0.75 && text.y + text.height <= field.y + field.height + 0.75 && field.height <= Math.max(24, text.height * 2.5); }

function combineItems(textItems, fields) {
  const suppressedItems = [], kept = [];
  let ambiguous = false;
  for (const text of textItems) {
    const overlaps = fields.filter(field => intersects(text, field));
    if (overlaps.length === 1 && contained(text, overlaps[0]) && !fields.some(other => other !== overlaps[0] && intersects(other, overlaps[0]))) {
      suppressedItems.push({...text, supersededBy: overlaps[0].fieldName});
    } else {
      if (overlaps.length) { text.needsReview = true; for (const field of overlaps) field.needsReview = true; ambiguous = true; }
      kept.push(text);
    }
  }
  return {items: [...kept, ...fields], suppressedItems, ambiguous};
}

/**
 * @param {File} file Local browser File (also supports Node's File/Blob API).
 * @param {{onProgress?: Function, signal?: AbortSignal}} options
 * @returns {Promise<{pages: Array, fingerprint: string, filename: string, pageCount: number, warnings: string[]}>}
 */
export async function extractPdf(file, {onProgress, signal} = {}) {
  if (!file || typeof file.arrayBuffer !== 'function' || !finite(file.size) || typeof file.name !== 'string') throw new PdfReadError('PDF_INVALID_FILE', 'Vælg en PDF-fil fra din enhed.');
  if (file.size > PDF_LIMITS.maxBytes) throw new PdfReadError('PDF_TOO_LARGE', 'PDF-filen må højst fylde 20 MB.');
  if (signal && (typeof signal.addEventListener !== 'function' || typeof signal.removeEventListener !== 'function')) throw new PdfReadError('PDF_INVALID_OPTIONS', 'Afbrydelsessignalet er ugyldigt.');
  checkAbort(signal);
  let loadingTask, document, passwordRequired = false, timedOut = false, abortReject;
  const emit = (phase, completed, total, percent, message, pageNumber) => {
    if (typeof onProgress !== 'function') return;
    // Progress callbacks are a UI concern; they cannot make extraction fail.
    try { onProgress({phase, completed, total, percent: Math.max(0, Math.min(100, Math.round(percent))), message, ...(pageNumber ? {pageNumber} : {})}); } catch { /* No logging of private input. */ }
  };
  const cancelled = new Promise((_, reject) => { abortReject = reject; });
  const destroy = () => { if (loadingTask) void loadingTask.destroy().catch(() => {}); };
  const aborted = () => { destroy(); abortReject(abortError()); };
  signal?.addEventListener('abort', aborted, {once: true});
  const timeout = setTimeout(() => { timedOut = true; destroy(); abortReject(new PdfReadError('PDF_TIMEOUT', 'PDF-læsningen tog for lang tid. Prøv en mindre fil eller færre sider.')); }, PDF_LIMITS.timeoutMs);
  const operation = async () => {
    emit('read', 0, file.size, 0, 'Læser filen lokalt…');
    const data = new Uint8Array(await readFile(file, signal, (loaded, total) => emit('read', loaded, total, total ? loaded / total * 10 : 0, 'Læser filen lokalt…')));
    checkAbort(signal);
    if (data.byteLength > PDF_LIMITS.maxBytes) throw new PdfReadError('PDF_TOO_LARGE', 'PDF-filen må højst fylde 20 MB.');
    if (!new TextDecoder('ascii').decode(data.subarray(0, 1024)).includes('%PDF-')) throw new PdfReadError('PDF_INVALID', 'Filen er ikke en læsbar PDF.');
    const fingerprint = globalThis.crypto?.subtle ? [...new Uint8Array(await crypto.subtle.digest('SHA-256', data))].map(value => value.toString(16).padStart(2, '0')).join('') : '';
    checkAbort(signal);
    emit('load', 0, 1, 10, 'Åbner PDF uden upload…');
    const pdf = await engine();
    checkAbort(signal);
    loadingTask = pdf.getDocument({data, cMapUrl: new URL('cmaps/', pdfAssetBase()).href, cMapPacked: true, standardFontDataUrl: new URL('standard_fonts/', pdfAssetBase()).href, useSystemFonts: false, disableFontFace: true, isEvalSupported: false, enableXfa: false, useWasm: false, isOffscreenCanvasSupported: false, verbosity: 0});
    loadingTask.onPassword = () => { passwordRequired = true; destroy(); };
    document = await loadingTask.promise;
    checkAbort(signal);
    if (document.numPages > PDF_LIMITS.maxPages) throw new PdfReadError('PDF_TOO_MANY_PAGES', 'PDF-filen må højst indeholde 30 sider.');
    const pages = [], warnings = [];
    let itemCount = 0, characters = 0;
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber++) {
      checkAbort(signal);
      emit('extract', pageNumber - 1, document.numPages, 15 + (pageNumber - 1) / document.numPages * 85, `Læser side ${pageNumber} af ${document.numPages}…`, pageNumber);
      const page = await document.getPage(pageNumber);
      const viewport = page.getViewport({scale: 1});
      const content = await page.getTextContent({includeMarkedContent: false});
      checkAbort(signal);
      const annotations = await page.getAnnotations({intent: 'display'});
      const textItems = content.items.filter(item => nonempty(item.str) && Array.isArray(item.transform)).map(item => textBox(pdf, viewport, item, content.styles)).filter(Boolean);
      const fields = annotations.map(annotation => annotationBox(pdf, viewport, annotation)).filter(Boolean);
      const combined = combineItems(textItems, fields);
      itemCount += textItems.length + fields.length;
      characters += [...textItems, ...fields].reduce((total, item) => total + item.text.length, 0);
      if (textItems.length + fields.length > PDF_LIMITS.maxPageItems || itemCount > PDF_LIMITS.maxItems || characters > PDF_LIMITS.maxCharacters) throw new PdfReadError('PDF_TOO_COMPLEX', 'PDF-filen indeholder for meget tekst til sikker import. Del den i mindre filer.');
      if (!combined.items.length) warnings.push(`Side ${pageNumber} har ingen udtrækkelig tekst. En billedscannet side kræver en PDF med tekstlag.`);
      if (combined.ambiguous) warnings.push(`Side ${pageNumber}: et udfyldt formularfelt overlapper tekst eller andre felter. Begge værdier er bevaret til kontrol.`);
      pages.push({pageNumber, width: round(viewport.width), height: round(viewport.height), ...combined});
      page.cleanup();
    }
    checkAbort(signal);
    if (!pages.some(page => page.items.length)) throw new PdfReadError('PDF_NO_TEXT', 'PDFen har intet læsbart tekstlag eller udfyldte tekstfelter. Billedscannede planer skal først gemmes som en PDF med tekstgenkendelse.');
    emit('done', pages.length, pages.length, 100, 'PDFen er læst lokalt. Klar til gennemgang.');
    return {pages, fingerprint: fingerprint || `pdfjs:${document.fingerprints[0]}`, filename: file.name, pageCount: document.numPages, warnings};
  };
  try { return await Promise.race([operation(), cancelled]); }
  catch (error) {
    if (signal?.aborted) throw abortError();
    if (timedOut) throw new PdfReadError('PDF_TIMEOUT', 'PDF-læsningen tog for lang tid. Prøv en mindre fil eller færre sider.');
    if (passwordRequired || error?.name === 'PasswordException') throw new PdfReadError('PDF_PASSWORD_REQUIRED', 'PDFen er beskyttet med adgangskode. Gem en kopi uden adgangskode, og vælg den igen.');
    if (error instanceof PdfReadError) throw error;
    if (error?.name === 'InvalidPDFException' || error?.name === 'MissingPDFException') throw new PdfReadError('PDF_INVALID', 'PDF-filen kunne ikke læses. Gem en ny kopi fra det oprindelige program.');
    throw new PdfReadError('PDF_UNSUPPORTED', 'PDFen kunne ikke læses lokalt. Filen kan være beskadiget eller bruge en funktion, som ikke understøttes.');
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', aborted);
    if (loadingTask) { try { await loadingTask.destroy(); } catch { /* Destroy errors contain no actionable user information. */ } }
  }
}
