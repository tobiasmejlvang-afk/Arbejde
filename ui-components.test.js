import test from 'node:test';
import assert from 'node:assert/strict';
import {UI_COMPONENT_TARGETS, sanitizeSVG, validateUIComponents, parseUIComponentsImport, serializeUIComponents} from './ui-components-domain.js';
import {createUIComponents, renderUIComponentTarget} from './ui-components.js';

const basic = (changes = {}) => ({id: 'component-1', target: 'driver-card', type: 'box', title: 'Kontakt', value: 'Ring til kontoret', items: ['Telefon: 12345678'], ...changes});
const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><g transform="translate(1 1)"><path d="M2 2 L20 20" stroke="#ff8800" fill="none"/><circle cx="12" cy="12" r="3" fill="currentColor"/></g></svg>';
const action = (name, id) => ({target: {closest: () => ({dataset: {uiComponentAction: name, uiComponentId: id}})}});

test('SVG geometry is canonical, scalable and idempotent', () => {
  const result = sanitizeSVG(svg);
  assert.equal(result.ok, true, result.error);
  assert.equal(sanitizeSVG(result.svg).svg, result.svg);
  assert.match(sanitizeSVG('<svg width="40" height="20"><rect width="40" height="20"/></svg>').svg, /viewBox="0 0 40 20"/);
});

test('SVG blocks executable, linked, CSS, entity and malformed content', () => {
  const attacks = [
    '<svg onload="alert(1)"></svg>', '<svg><script>alert(1)</script></svg>',
    '<svg><foreignObject><div>HTML</div></foreignObject></svg>',
    '<svg><image href="https://example.org/tracker"/></svg>', '<svg><use href="#shape"/></svg>',
    '<svg><a href="javascript:alert(1)"><path d="M0 0"/></a></svg>',
    '<svg style="background:url(https://example.org)"></svg>',
    '<svg><path d="M0 0" fill="url(https://example.org/a)"/></svg>',
    '<!DOCTYPE svg [<!ENTITY x SYSTEM "file:///etc/passwd">]><svg>&x;</svg>',
    '<svg xmlns="http://www.w3.org/1999/xhtml"></svg>', '<svg><svg/></svg>',
    '<svg><g></svg>', '<svg/><svg/>', '<svg><path d="M1e999 0"/></svg>',
    '<svg><path d="M0 0" stroke="red" stroke="blue"/></svg>',
    '<svg><animate attributeName="onload"/></svg>', '<svg><text>&lt;script&gt;</text></svg>'
  ];
  for (const attack of attacks) assert.equal(sanitizeSVG(attack).ok, false, attack);
  assert.equal(sanitizeSVG('<svg>' + '<path/>'.repeat(251) + '</svg>').ok, false);
  assert.equal(sanitizeSVG('x'.repeat(65537)).ok, false);
});

test('all six placements preserve editable data, defaults and safe vectors', () => {
  const data = UI_COMPONENT_TARGETS.map((target, index) => basic({id: `component-${index}`, target: target.id}));
  const result = validateUIComponents(data);
  assert.equal(result.ok, true);
  assert.equal(result.components.length, 6);
  assert.equal(result.components[0].size, 'medium');
  assert.equal(result.components[0].variant, 'outline');
  assert.equal(validateUIComponents([basic({type: 'svg', svg})]).ok, true);
  for (const changes of [{target: 'unknown'}, {type: '__proto__'}, {size: 'huge'}, {color: 'url(x)'}, {items: [7]}, {items: ['']}, {extra: true}, {title: ''}, {svg: '<svg onload="x"/>'}]) assert.equal(validateUIComponents([basic(changes)]).ok, false, JSON.stringify(changes));
  assert.equal(validateUIComponents([basic(), basic()]).ok, false);
});

test('component JSON export/import roundtrip preserves existing components and remaps collisions', () => {
  const original = validateUIComponents([basic()]).components;
  const text = serializeUIComponents(original);
  assert.deepEqual(parseUIComponentsImport(text).components, original);
  const merged = parseUIComponentsImport(text, original, () => 'new-id');
  assert.equal(merged.ok, true);
  assert.equal(merged.imported, 1);
  assert.equal(merged.components[1].id, 'new-id');
  assert.deepEqual(merged.components[0], original[0]);
  assert.equal(original.length, 1);
  assert.equal(parseUIComponentsImport('{broken').ok, false);
  assert.equal(parseUIComponentsImport(JSON.stringify({type: 'arbejde-ui-components', version: 99, components: []})).ok, false);
  assert.equal(parseUIComponentsImport('x'.repeat(1048577)).ok, false);
});

test('target rendering escapes user content and isolates placements', () => {
  const components = [basic({title: '<img onerror=x>', value: '<script>x</script>', items: ['<svg onload=x>']}), basic({id: 'other', target: 'vehicle-card', title: 'Kun vogne'})];
  const html = renderUIComponentTarget(components, 'driver-card');
  assert.match(html, /&lt;img onerror=x&gt;/);
  assert.match(html, /&lt;script&gt;/);
  assert.doesNotMatch(html, /<script>|<img|Kun vogne/);
  assert.equal(renderUIComponentTarget(components, 'route-card'), '');
  assert.match(renderUIComponentTarget([basic({type: 'svg', svg})], 'driver-card'), /<svg /);
  assert.equal(renderUIComponentTarget([basic({type: 'svg', svg: '<svg onload="x"/>'})], 'driver-card'), '');
});

test('manager edits and deletes only after an explicit delete action', () => {
  let state = {uiComponents: validateUIComponents([basic()]).components}, writes = 0;
  const ui = createUIComponents({getState: () => state, save: components => {state = {uiComponents: components}; writes++; return true;}});
  assert.match(ui.renderManager(), /ét bestemt chauffør-/);
  ui.click(action('edit', 'component-1'));
  assert.match(ui.renderManager(), /Redigér komponent/);
  ui.click(action('delete', 'component-1'));
  assert.equal(writes, 0);
  ui.click(action('confirm-delete', 'component-1'));
  assert.equal(state.uiComponents.length, 0);
  assert.equal(writes, 1);
});

test('import preview does not persist until confirmed and detects intervening changes', async () => {
  let state = {uiComponents: []}, writes = 0;
  const ui = createUIComponents({getState: () => state, save: components => {state = {uiComponents: components}; writes++; return true;}});
  const file = {size: 100, text: async () => serializeUIComponents([basic()])};
  const input = {files: [file], dataset: {uiComponentFile: 'json'}, value: 'file'};
  await ui.change({target: {closest: () => input}});
  assert.equal(writes, 0);
  assert.match(ui.renderManager(), /Gennemgå import/);
  state.uiComponents = [basic({id: 'intervening'})];
  ui.click(action('confirm-import'));
  assert.equal(writes, 0);
  assert.match(ui.renderManager(), /Komponenterne er ændret/);
  await ui.change({target: {closest: () => input}});
  ui.click(action('confirm-import'));
  assert.equal(writes, 1);
  assert.equal(state.uiComponents.length, 2);
});

test('binding the document repeatedly attaches each handler only once', () => {
  const attached = [], removed = [], root = {addEventListener: (...args) => attached.push(args), removeEventListener: (...args) => removed.push(args)};
  const state = {uiComponents: []}, ui = createUIComponents({getState: () => state, save: () => true});
  const unbind = ui.bind(root);
  assert.equal(ui.bind(root), unbind);
  assert.equal(attached.length, 4);
  unbind();
  assert.equal(removed.length, 4);
  ui.bind(root);
  assert.equal(attached.length, 8);
});

test('switching workspace resets editor data and pending file imports', async () => {
  let state = {uiComponents: validateUIComponents([basic({type: 'svg', svg})]).components};
  const ui = createUIComponents({getState: () => state, save: () => assert.fail('Unexpected write')});
  ui.click(action('edit', 'component-1'));
  assert.match(ui.renderManager(), /Redigér komponent/);
  let resolve;
  const input = {files: [{size: 100, text: () => new Promise(done => {resolve = done;})}], dataset: {uiComponentFile: 'json'}, isConnected: true};
  const pending = ui.change({target: {closest: () => input}});
  state = {uiComponents: []};
  resolve(serializeUIComponents([basic()]));
  await pending;
  const html = ui.renderManager();
  assert.doesNotMatch(html, /Redigér komponent|Gennemgå import|Vektorgrafik klar/);
});

test('a disconnected file input cannot finish an import into a replacement form', async () => {
  const state = {uiComponents: []}, ui = createUIComponents({getState: () => state, save: () => assert.fail('Unexpected write')});
  let resolve;
  const input = {files: [{size: 100, text: () => new Promise(done => {resolve = done;})}], dataset: {uiComponentFile: 'json'}, isConnected: true};
  const pending = ui.change({target: {closest: () => input}});
  input.isConnected = false;
  resolve(serializeUIComponents([basic()]));
  await pending;
  assert.doesNotMatch(ui.renderManager(), /Gennemgå import/);
});

test('canceling an edit invalidates its asynchronous SVG import', async () => {
  const state = {uiComponents: validateUIComponents([basic()]).components};
  const ui = createUIComponents({getState: () => state, save: () => assert.fail('Unexpected write')});
  ui.click(action('edit', 'component-1'));
  let resolve;
  const input = {files: [{size: 100, text: () => new Promise(done => {resolve = done;})}], dataset: {uiComponentFile: 'svg'}, isConnected: true};
  const pending = ui.change({target: {closest: () => input}});
  ui.click(action('cancel-edit'));
  resolve(svg);
  await pending;
  assert.doesNotMatch(ui.renderManager(), /Vektorgrafik klar/);
});

test('metal card presets remain editable and do not persist until saved', () => {
  const state = {uiComponents: []};
  const ui = createUIComponents({getState:()=>state,save:()=>assert.fail('Preset selection must not write')});
  for (const id of ['driver','vehicle','route','waste','calendar']) {
    ui.click(action('preset', id));
    const html = ui.renderManager();
    assert.match(html, /name="icon"/);
    assert.match(html, /name="layout"/);
    assert.match(html, /value="metallic" selected/);
    assert.ok(html.includes('value="'+id+'" selected'));
    assert.match(html, /data-ui-component-preview/);
    assert.match(html, /<svg class="ui-component-icon"/);
  }
  assert.equal(state.uiComponents.length,0);
});

test('card-specific components never appear on a different record and survive JSON export', () => {
  const components = validateUIComponents([basic({id:'shared',title:'Alle chauffører'}),basic({id:'private',title:'Kun den valgte chauffør',entityId:'person-70',variant:'metallic',icon:'driver',layout:'wide'})]).components;
  const imported = parseUIComponentsImport(serializeUIComponents(components)).components;
  assert.equal(imported[1].entityId,'person-70');
  const selected = renderUIComponentTarget(imported,'driver-card',undefined,'person-70');
  const other = renderUIComponentTarget(imported,'driver-card',undefined,'person-71');
  assert.match(selected,/Kun den valgte chauffør/);
  assert.match(other,/Alle chauffører/);
  assert.doesNotMatch(other,/Kun den valgte chauffør/);
  assert.equal(validateUIComponents([basic({target:'route-setup',entityId:'person-70'})]).ok,false);
  assert.equal(validateUIComponents([basic({icon:'<script>'})]).ok,false);
});
