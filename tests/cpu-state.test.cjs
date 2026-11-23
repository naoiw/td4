const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'assets/css/workbench.css'), 'utf8');
const source = fs.readFileSync(path.join(root, 'src/ui/app.ts'), 'utf8');
const compiled = fs.readFileSync(path.join(root, 'assets/js/ui/app.js'), 'utf8');
const {CPU, HEX} = require('../assets/js/core/td4-core.js');
const FIELDS = ['PC', 'C', 'A', 'B', 'IN', 'OUT'];

function harness(powerOn = true) {
  const cpu = new CPU();
  const elements = new Map();
  function element(id) {
    if (!elements.has(id)) {
      const flags = new Set();
      elements.set(id, {
        textContent: '',
        attributes: {},
        classList: {
          toggle(name, active) { if (active) flags.add(name); else flags.delete(name); },
          contains(name) { return flags.has(name); }
        },
        setAttribute(name, value) { this.attributes[name] = value; }
      });
    }
    return elements.get(id);
  }
  const context = {
    cpu, HEX, powerOn,
    $: element,
    CPU_STATE_FIELDS: FIELDS,
    changedCpuFields: new Set(),
    renderROM() {},
    updateCircuitBoard() {}
  };
  const start = compiled.indexOf('    /** Read-only snapshot for the board-adjacent CPU STATE widget. */');
  const end = compiled.indexOf('    /** Apply the same UI refresh after editing ROM from either board surface. */', start);
  assert.ok(start !== -1 && end > start, 'compiled CPU renderer exists');
  const api = vm.runInNewContext(compiled.slice(start, end) +
    '\n({readCpuState,markCpuStateChanges,renderCpuState,renderCPU})', context);
  return {cpu, context, element, api, changed: field => element('cpuState' + field + 'Card').classList.contains('is-changed')};
}

test('CPU STATE is a compact, read-only, six-value widget directly beneath the PCB', () => {
  const boardEnd = html.indexOf('id="icDetailPanel"');
  const stateStart = html.indexOf('id="cpuStatePanel"');
  const scopeStart = html.indexOf('<div class="scope-layout">');
  assert.ok(boardEnd >= 0 && boardEnd < stateStart && stateStart < scopeStart);
  assert.match(html, /class="panel cpu-state-panel is-off" id="cpuStatePanel"/);
  assert.match(html, /id="cpuStatePower">OFF<\/span>/);
  const widget = html.slice(stateStart, scopeStart);
  for (const field of FIELDS) {
    assert.match(widget, new RegExp('id="cpuState' + field + 'Card"'));
    assert.match(widget, new RegExp('id="cpuState' + field + 'Hex"'));
    assert.match(widget, new RegExp('id="cpuState' + field + 'Binary"'));
  }
  assert.equal((widget.match(/class="cpu-state-cell"/g) || []).length, 6);
  assert.deepEqual([...widget.matchAll(/id="cpuState(PC|C|A|B|IN|OUT)Card"/g)].map(match => match[1]), FIELDS, 'visual order matches requested sequence');
  assert.doesNotMatch(widget, /<button|<input|<select|<textarea/, 'read-only values');
  assert.match(css, /\.cpu-state-grid\{[^}]*grid-template-columns:repeat\(6,minmax\(0,1fr\)\)/);
  assert.match(css, /@media\(max-width:650px\)\{\.cpu-state-panel\{[^}]*\}\.cpu-state-grid\{grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/);
  assert.match(css, /@media\(max-width:380px\)\{\.cpu-state-grid\{grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(css, /\.cpu-state-cell\.is-changed\{/);
});

test('CPU STATE shows hex and 4-bit binary and masks live readings when powered off', () => {
  const h = harness(false);
  h.api.renderCPU();
  assert.equal(h.element('cpuStatePower').textContent, 'OFF');
  for (const key of FIELDS) {
    assert.equal(h.element('cpuState' + key + 'Hex').textContent, '—', key + ' off');
    assert.equal(h.changed(key), false);
  }
  h.context.powerOn = true;
  h.api.renderCPU();
  assert.equal(h.element('cpuStatePower').textContent, 'ON');
  for (const key of FIELDS) {
    assert.equal(h.element('cpuState' + key + 'Hex').textContent, key === 'C' ? '0' : '0x0');
    assert.equal(h.element('cpuState' + key + 'Binary').textContent, key === 'C' ? 'FLAG' : '0000');
    assert.equal(h.changed(key), false);
  }
  h.cpu.setInput(15);
  h.api.renderCPU();
  assert.equal(h.element('cpuStateINHex').textContent, '0xF');
  assert.equal(h.element('cpuStateINBinary').textContent, '1111');
  assert.equal(h.element('cpuStateINCard').attributes['aria-label'], 'IN 0xF (1111)');
});

test('only fields changed by the latest executed instruction are emphasized', () => {
  const h = harness(true);
  h.cpu.loadROM([0x3f, 0x01, ...new Array(14).fill(0)]);
  const beforeFirst = h.api.readCpuState();
  h.cpu.step();
  h.api.markCpuStateChanges(beforeFirst);
  h.api.renderCPU();
  assert.equal(h.element('cpuStateAHex').textContent, '0xF');
  assert.equal(h.element('cpuStateABinary').textContent, '1111');
  assert.equal(h.element('cpuStatePCHex').textContent, '0x1');
  assert.equal(h.changed('A'), true);
  assert.equal(h.changed('PC'), true);
  assert.equal(h.changed('B'), false);
  assert.equal(h.changed('C'), false);
  const beforeSecond = h.api.readCpuState();
  h.cpu.step(); // ADD A, 1 wraps 0xF to 0x0 and sets carry
  h.api.markCpuStateChanges(beforeSecond);
  h.api.renderCPU();
  assert.equal(h.element('cpuStateAHex').textContent, '0x0');
  assert.equal(h.element('cpuStateCHex').textContent, '1');
  assert.equal(h.element('cpuStatePCHex').textContent, '0x2');
  assert.equal(h.changed('A'), true);
  assert.equal(h.changed('PC'), true);
  assert.equal(h.changed('C'), true);
  assert.equal(h.changed('OUT'), false);
  assert.equal(h.changed('B'), false);
  const beforeThird = h.api.readCpuState();
  h.cpu.step(); // ADD A, 0 leaves A and carry unchanged, PC advances
  h.api.markCpuStateChanges(beforeThird);
  h.api.renderCPU();
  assert.equal(h.changed('A'), false);
  assert.equal(h.changed('C'), true, 'carry cleared by subsequent instruction');
  assert.equal(h.changed('PC'), true);
});

test('INPUT changes update the displayed value without modifying CPU registers', () => {
  const h = harness(true);
  const before = h.api.readCpuState();
  h.cpu.setInput(0b1010);
  h.api.markCpuStateChanges(before);
  h.api.renderCPU();
  assert.equal(h.element('cpuStateINHex').textContent, '0xA');
  assert.equal(h.element('cpuStateINBinary').textContent, '1010');
  assert.equal(h.changed('IN'), true);
  assert.equal(h.changed('A'), false);
  assert.equal(h.changed('B'), false);
  assert.equal(h.changed('PC'), false);
  assert.match(h.element('cpuStateINCard').attributes['aria-label'], /前回の操作で変化/);
});

test('all instruction paths, INPUT toggles, resets and ROM loads refresh CPU STATE', () => {
  for (const app of [source, compiled]) {
    assert.match(app, /function renderCPU\(\)[\s\S]*?renderCpuState\(\)/);
    assert.match(app, /function risingEdge\(\)[\s\S]*?const before = readCpuState\(\);[\s\S]*?cpu\.step\(\);[\s\S]*?markCpuStateChanges\(before\)/);
    assert.match(app, /onInputBitToggle\(bit\)\s*\{[\s\S]*?markCpuStateChanges\(before\);[\s\S]*?renderCPU\(\)/);
    assert.match(app, /function setPower\(on(?:: boolean)?\)[\s\S]*?changedCpuFields\.clear\(\)/);
    assert.match(app, /function installROM\(bytes(?:: number\[\])?[\s\S]*?changedCpuFields\.clear\(\);[\s\S]*?renderCPU\(\)/);
  }
});
