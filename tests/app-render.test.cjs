'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {loadAppFunctions} = require('./helpers/compiled-app.cjs');
const {CPU, HEX} = require('../assets/js/core/td4-core.js');

function mockElement(tag = 'div') {
  const element = {
    tag, className: '', textContent: '', title: '', dataset: {},
    attributes: {}, children: [], parent: null,
    setAttribute(name, value) { this.attributes[name] = String(value); },
    append(...nodes) {
      for (const node of nodes) {
        node.parent = this;
        this.children.push(node);
      }
    },
    prepend(node) { node.parent = this; this.children.unshift(node); },
    replaceChildren(...nodes) {
      for (const old of this.children) old.parent = null;
      this.children = [];
      this.append(...nodes);
    },
    remove() {
      if (this.parent) {
        const children = this.parent.children;
        children.splice(children.indexOf(this), 1);
        this.parent = null;
      }
    },
    get firstElementChild() { return this.children[0] || null; },
    get lastElementChild() { return this.children.at(-1) || null; }
  };
  const flags = new Set();
  element.classList = {
    toggle(name, value) {
      if (value) flags.add(name);
      else flags.delete(name);
    },
    contains(name) { return flags.has(name) || element.className.split(/\s+/).includes(name); }
  };
  return element;
}

test('ROM render updates changed bytes only, but always updates PC and breakpoints', () => {
  const cpu = new CPU(new Array(16).fill(0));
  const breakpoints = new Set();
  const rows = Array.from({length:16}, () => ({
    row:mockElement('tr'),
    breakpoint:mockElement('button'),
    bits:Array.from({length:8}, () => mockElement('button')),
    hex:mockElement('td'),
    asm:mockElement('td'),
    renderedByte:-1
  }));
  let disassemblyCalls = 0;
  const api = loadAppFunctions(['renderROM'], {
    cpu, breakpoints, romRowNodes:rows,
    disassemble(byte) { disassemblyCalls++; return 'OP ' + byte; },
    isStandard(byte) { return byte === 0; }
  });

  api.renderROM();
  assert.equal(disassemblyCalls, 16);
  assert.equal(rows[0].hex.textContent, '00');
  assert.ok(rows[0].row.classList.contains('current'));
  assert.ok(!rows[1].row.classList.contains('current'));

  api.renderROM();
  assert.equal(disassemblyCalls, 16, 'unchanged ROM must not be disassembled twice');

  cpu.pc = 5;
  breakpoints.add(5);
  api.renderROM();
  assert.equal(disassemblyCalls, 16, 'PC/breakpoint changes do not change ROM data');
  assert.ok(!rows[0].row.classList.contains('current'));
  assert.ok(rows[5].row.classList.contains('current'));
  assert.ok(rows[5].row.classList.contains('has-breakpoint'));
  assert.ok(rows[5].breakpoint.classList.contains('breaked'));
  assert.equal(rows[5].breakpoint.attributes['aria-pressed'], 'true');

  cpu.rom[5] = 0x81;
  api.renderROM();
  assert.equal(disassemblyCalls, 17, 'only the edited address is decoded again');
  assert.equal(rows[5].hex.textContent, '81');
  assert.equal(rows[5].asm.textContent, 'OP 129');
  assert.match(rows[5].asm.title, /未定義/);
  assert.equal(rows[5].bits[7].textContent, '1');
  assert.equal(rows[5].bits[0].textContent, '1');
  assert.equal(rows[5].bits[1].textContent, '0');
  assert.ok(rows[5].bits[7].classList.contains('on'));

  cpu.rom[5] = 0;
  breakpoints.delete(5);
  api.renderROM();
  assert.equal(disassemblyCalls, 18);
  assert.equal(rows[5].asm.title, '');
  assert.equal(rows[5].breakpoint.attributes['aria-pressed'], 'false');
  assert.ok(!rows[5].row.classList.contains('has-breakpoint'));
});

test('execution trace adds one row per step and retains at most 25 recent instructions', () => {
  const history = [];
  const traceList = mockElement('ol');
  let createdNodes = 0;
  const api = loadAppFunctions(
    ['createTraceItem', 'renderHistory', 'prependHistory'],
    {
      history, MAX_TRACE_ENTRIES:25, HEX,
      $: id => { assert.equal(id, 'traceList'); return traceList; },
      document:{createElement(tag) { createdNodes++; return mockElement(tag); }}
    }
  );
  api.renderHistory();
  assert.equal(traceList.children.length, 1);
  assert.ok(traceList.children[0].classList.contains('placeholder'));

  for (let i = 0; i < 30; i++) {
    const item = {
      pc:i & 15, pcAfter:(i + 1) & 15, byte:i, asm:'TEST ' + i
    };
    history.unshift(item);
    history.splice(25);
    api.prependHistory(item);
    assert.equal(traceList.children.length, Math.min(25, i + 1));
  }
  assert.equal(createdNodes, 1 + 30 * 4, 'no full list rebuild for each instruction');
  assert.equal(traceList.children[0].children[1].textContent, 'TEST 29');
  assert.equal(traceList.children.at(-1).children[1].textContent, 'TEST 5');
  assert.equal(traceList.children[0].children[2].textContent, '→ E');

  api.renderHistory();
  assert.equal(traceList.children.length, 25);
  assert.equal(traceList.children[0].children[1].textContent, 'TEST 29');
  history.length = 0;
  api.renderHistory();
  assert.equal(traceList.children.length, 1);
  assert.ok(traceList.children[0].classList.contains('placeholder'));
});

test('CPU rising edge advances the real core, refreshes UI and records exactly once', () => {
  const cpu = new CPU([0x3a, ...new Array(15).fill(0)]);
  const history = [];
  const observed = {renders:0, traces:0, records:0, changes:[]};
  const context = {
    cpu, clockHigh:false, history, MAX_TRACE_ENTRIES:25,
    readCpuState() { return {A:cpu.a, B:cpu.b, PC:cpu.pc, OUT:cpu.out, C:cpu.carry, IN:cpu.input}; },
    markCpuStateChanges(before) {
      for (const key of ['A', 'B', 'PC', 'OUT', 'C', 'IN']) {
        if (before[key] !== ({A:cpu.a,B:cpu.b,PC:cpu.pc,OUT:cpu.out,C:cpu.carry,IN:cpu.input})[key])
          observed.changes.push(key);
      }
    },
    renderCPU() { observed.renders++; },
    prependHistory(step) { observed.traces++; assert.equal(step.pc, 0); },
    recordSignals() { observed.records++; }
  };
  const api = loadAppFunctions(['risingEdge'], context);
  api.risingEdge();
  assert.equal(cpu.a, 10);
  assert.equal(cpu.pc, 1);
  assert.equal(cpu.cycles, 1);
  assert.equal(context.clockHigh, true);
  assert.equal(history.length, 1);
  assert.deepEqual(observed.changes, ['A', 'PC']);
  assert.deepEqual([observed.renders, observed.traces, observed.records], [1, 1, 1]);
});
