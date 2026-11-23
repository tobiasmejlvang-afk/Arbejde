export const UI_COMPONENT_TARGETS = Object.freeze([
  {id: 'driver-card', label: 'Chaufførkort'},
  {id: 'vehicle-card', label: 'Vognkort'},
  {id: 'route-card', label: 'Turkort'},
  {id: 'driving-crew', label: 'Kørsel & Bemanding'},
  {id: 'vehicles-routes', label: 'Vogne & Ture'},
  {id: 'route-setup', label: 'Turopsætning'}
]);
export const UI_COMPONENT_TYPES = Object.freeze({field: 'Felt', list: 'Liste', box: 'Boks', svg: 'Vektorgrafik (SVG)'});
export const UI_COMPONENT_SIZES = Object.freeze({small: 'Lille', medium: 'Mellem', large: 'Stor'});
export const UI_COMPONENT_VARIANTS = Object.freeze({plain: 'Enkel', outline: 'Ramme', filled: 'Farvet baggrund', metallic: 'Metal & orange'});
export const UI_COMPONENT_COLORS = Object.freeze({orange: 'Orange', blue: 'Blå', green: 'Grøn', purple: 'Lilla', neutral: 'Neutral'});
export const UI_COMPONENT_ICONS = Object.freeze({none: 'Intet ikon', driver: 'Chauffør', vehicle: 'Vogn', route: 'Tur', waste: 'Affaldsbeholder', calendar: 'Kalender'});
export const UI_COMPONENT_LAYOUTS = Object.freeze({wide: 'Vandret kort', tile: 'Lodret kort'});
const KEYS = new Set(['id', 'target', 'type', 'title', 'value', 'items', 'size', 'variant', 'color', 'svg', 'icon', 'layout', 'entityId']);
const TAGS = new Set(['svg', 'g', 'path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon']);
const ATTRS = new Set(['xmlns', 'version', 'viewBox', 'width', 'height', 'x', 'y', 'x1', 'x2', 'y1', 'y2', 'cx', 'cy', 'r', 'rx', 'ry', 'd', 'points', 'fill', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'stroke-miterlimit', 'stroke-dasharray', 'stroke-dashoffset', 'fill-rule', 'opacity', 'fill-opacity', 'stroke-opacity', 'transform', 'preserveAspectRatio', 'vector-effect']);
const NUMBER = '[+-]?(?:\\d+(?:\\.\\d*)?|\\.\\d+)(?:[eE][+-]?\\d+)?';
const numeric = new RegExp(`^${NUMBER}(?:px|%)?$`);
const numbers = new RegExp(`^(?:${NUMBER}[\\s,]*)+$`);
const escapeAttribute = value => value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const finiteNumbers = value => (value.match(new RegExp(NUMBER, 'g')) || []).every(number => Number.isFinite(Number(number)) && Math.abs(Number(number)) <= 1e7);

function safeAttribute(name, value) {
  if (!ATTRS.has(name) || /[&<>]/.test(value) || value.length > 32000) return false;
  if (name === 'xmlns') return value === 'http://www.w3.org/2000/svg';
  if (name === 'version') return /^(?:1\.0|1\.1|2\.0)$/.test(value);
  if (name === 'd') return /^[MmZzLlHhVvCcSsQqTtAa0-9eE+.,\s-]*$/.test(value) && finiteNumbers(value);
  if (name === 'points') return numbers.test(value) && finiteNumbers(value);
  if (name === 'viewBox') {
    const parts = value.trim().split(/[\s,]+/);
    return parts.length === 4 && parts.every(part => new RegExp(`^${NUMBER}$`).test(part)) && finiteNumbers(value) && Number(parts[2]) > 0 && Number(parts[3]) > 0;
  }
  if (name === 'fill' || name === 'stroke') return /^(?:none|currentColor|transparent|black|white|red|green|blue|orange|purple|gray|grey|yellow|#[\da-f]{3,4}|#[\da-f]{6}|#[\da-f]{8})$/i.test(value);
  if (name === 'transform') return /^(?:(?:matrix|translate|scale|rotate|skewX|skewY)\([\d.eE+\s,-]+\)\s*)+$/.test(value) && finiteNumbers(value);
  if (name === 'stroke-linecap') return ['butt', 'round', 'square'].includes(value);
  if (name === 'stroke-linejoin') return ['miter', 'round', 'bevel'].includes(value);
  if (name === 'fill-rule') return ['nonzero', 'evenodd'].includes(value);
  if (name === 'vector-effect') return value === 'non-scaling-stroke';
  if (name === 'preserveAspectRatio') return /^(?:none|x(?:Min|Mid|Max)Y(?:Min|Mid|Max)(?: (?:meet|slice))?)$/.test(value);
  if (name === 'stroke-dasharray') return value === 'none' || (numbers.test(value) && finiteNumbers(value));
  if (name.endsWith('opacity')) return numeric.test(value) && Number(value) >= 0 && Number(value) <= 1;
  return numeric.test(value) && finiteNumbers(value);
}

// Rebuild SVG from a geometry whitelist. No HTML, CSS, links, external resources,
// entities, animation or executable attributes enter the stored value.
export function sanitizeSVG(source) {
  const fail = error => ({ok: false, error, svg: ''});
  if (typeof source !== 'string' || !source.trim() || source.length > 65536) return fail('SVG-filen skal være mellem 1 og 65.536 tegn.');
  const input = source.trim().replace(/^<\?xml\s[^?]*\?>\s*/i, '').replace(/<!--[\s\S]*?-->/g, '');
  if (/<!|<\?|[&]/.test(input)) return fail('SVG-filen må ikke indeholde dokumenttyper, instruktioner eller entiteter.');
  const tokens = input.match(/<[^>]*>|[^<]+/g) || [];
  const stack = [], output = [];
  let root = false, elements = 0, closedRoot = false;
  for (const token of tokens) {
    if (!token.startsWith('<')) { if (token.trim()) return fail('SVG-import understøtter kun vektorformer. Skriv tekst i komponentens felter.'); continue; }
    const tag = token.match(/^<(\/?)([A-Za-z][A-Za-z0-9:-]*)([\s\S]*?)(\/?)>$/);
    if (!tag || !TAGS.has(tag[2])) return fail('SVG-filen indeholder et element, der ikke er en understøttet vektorform.');
    const [, closing, name, tail, selfClosing] = tag;
    if (closing) {
      if (tail.trim() || selfClosing || stack.pop() !== name) return fail('SVG-filen har ugyldige afslutningstags.');
      output.push(`</${name}>`);
      if (!stack.length) closedRoot = true;
      continue;
    }
    if (closedRoot || (!root && name !== 'svg') || (root && name === 'svg')) return fail('SVG-filen skal have ét ydre svg-element.');
    if (++elements > 250) return fail('SVG-filen må højst indeholde 250 vektorformer.');
    root = true;
    const attributes = [], seen = new Set();
    let position = 0;
    while (position < tail.length) {
      const spaces = tail.slice(position).match(/^\s*/)[0]; position += spaces.length;
      if (position === tail.length) break;
      const attribute = tail.slice(position).match(/^([A-Za-z_:][A-Za-z0-9_.:-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/);
      if (!attribute) return fail('SVG-filen har en ugyldig attribut.');
      const attributeName = attribute[1], value = attribute[2] ?? attribute[3];
      if (seen.has(attributeName) || !safeAttribute(attributeName, value)) return fail(`SVG-attributten ${attributeName} er ikke tilladt. Fjern links, typografi, scripts og eksterne referencer.`);
      seen.add(attributeName); attributes.push(`${attributeName}="${escapeAttribute(value)}"`); position += attribute[0].length;
    }
    if (name === 'svg' && !seen.has('viewBox')) {
      const dimension = key => {
        const found = tail.match(new RegExp(`\\b${key}\\s*=\\s*["']([\\d.]+)(?:px)?["']`));
        return found && Number(found[1]) > 0 ? Number(found[1]) : 100;
      };
      attributes.push(`viewBox="0 0 ${dimension('width')} ${dimension('height')}"`);
    }
    output.push(`<${name}${attributes.length ? ' ' + attributes.join(' ') : ''}${selfClosing ? '/' : ''}>`);
    if (selfClosing) { if (name === 'svg') closedRoot = true; }
    else stack.push(name);
  }
  if (!root || stack.length || !closedRoot) return fail('SVG-filen er ikke et afsluttet SVG-dokument.');
  return {ok: true, svg: output.join(''), error: ''};
}

export function validateUIComponents(value) {
  const errors = [], components = [], ids = new Set();
  if (!Array.isArray(value) || value.length > 200) return {ok: false, errors: ['UI-komponenter skal være en liste med højst 200 komponenter.'], components: []};
  value.forEach((item, index) => {
    const label = `UI-komponent ${index + 1}`;
    if (!object(item)) { errors.push(`${label} skal være et objekt.`); return; }
    if (Object.keys(item).some(key => !KEYS.has(key))) errors.push(`${label} indeholder ukendte oplysninger.`);
    if (typeof item.id !== 'string' || !item.id.trim() || item.id.length > 200 || ids.has(item.id)) errors.push(`${label} skal have et unikt id på højst 200 tegn.`);
    ids.add(item.id);
    if (!UI_COMPONENT_TARGETS.some(target => target.id === item.target)) errors.push(`${label}: vælg en gyldig placering.`);
    if (!Object.hasOwn(UI_COMPONENT_TYPES, item.type)) errors.push(`${label}: vælg en gyldig komponenttype.`);
    if (typeof item.title !== 'string' || !item.title.trim() || item.title.length > 160) errors.push(`${label}: titlen skal være mellem 1 og 160 tegn.`);
    const component = {id: item.id, target: item.target, type: item.type, title: item.title, value: item.value ?? '', items: item.items ?? [], size: item.size ?? 'medium', variant: item.variant ?? 'outline', color: item.color ?? 'orange', svg: item.svg ?? '', icon: item.icon ?? 'none', layout: item.layout ?? 'wide', entityId: item.entityId ?? ''};
    if (typeof component.value !== 'string' || component.value.length > 4000) errors.push(`${label}: indholdet må højst være 4.000 tegn.`);
    if (!Array.isArray(component.items) || component.items.length > 100 || component.items.some(text => typeof text !== 'string' || !text.trim() || text.length > 500)) errors.push(`${label}: listen må højst have 100 linjer på hver 500 tegn.`);
    if (!Object.hasOwn(UI_COMPONENT_SIZES, component.size) || !Object.hasOwn(UI_COMPONENT_VARIANTS, component.variant) || !Object.hasOwn(UI_COMPONENT_COLORS, component.color)) errors.push(`${label}: vælg gyldig størrelse, farve og udseende.`);
    if (!Object.hasOwn(UI_COMPONENT_ICONS, component.icon) || !Object.hasOwn(UI_COMPONENT_LAYOUTS, component.layout)) errors.push(`${label}: vælg et gyldigt ikon og kortlayout.`);
    if (typeof component.svg !== 'string') errors.push(`${label}: vektorgrafik skal være SVG-tekst.`);
    else if (component.svg || component.type === 'svg') {
      const result = sanitizeSVG(component.svg);
      if (!result.ok) errors.push(`${label}: ${result.error}`);
      else component.svg = result.svg;
    }
    if (typeof component.entityId !== 'string' || component.entityId.length > 200 || (component.entityId && !['driver-card', 'vehicle-card', 'route-card'].includes(component.target))) errors.push(`${label}: vælg et gyldigt kort eller alle kort.`);
    components.push(component);
  });
  return {ok: errors.length === 0, errors, components: errors.length ? [] : components};
}

export function serializeUIComponents(components) {
  const checked = validateUIComponents(components);
  if (!checked.ok) throw new Error(checked.errors[0]);
  return JSON.stringify({type: 'arbejde-ui-components', version: 1, components: checked.components}, null, 2);
}

export function parseUIComponentsImport(text, existing = [], createId = () => globalThis.crypto.randomUUID()) {
  if (typeof text !== 'string' || text.length > 1048576) return {ok: false, errors: ['Komponentfilen må højst være 1 MiB.'], components: []};
  let data;
  try { data = JSON.parse(text); } catch { return {ok: false, errors: ['Filen er ikke gyldig JSON.'], components: []}; }
  if (!object(data) || Object.keys(data).some(key => !['type', 'version', 'components'].includes(key)) || data.type !== 'arbejde-ui-components' || data.version !== 1) return {ok: false, errors: ['Vælg en Arbejde-komponentfil, version 1.'], components: []};
  const checked = validateUIComponents(data.components);
  if (!checked.ok) return checked;
  const reserved = new Set(existing.map(item => item.id));
  const imported = checked.components.map(component => {
    let id = component.id;
    if (reserved.has(id)) id = createId();
    reserved.add(id);
    return {...component, id};
  });
  const merged = validateUIComponents([...existing, ...imported]);
  return merged.ok ? {ok: true, errors: [], components: merged.components, imported: imported.length} : merged;
}
