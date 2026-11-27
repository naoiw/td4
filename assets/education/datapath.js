/* TD4 Education datapath explorer: separate from the live emulator. */
(function () {
  'use strict';

  // Share the Emulator CPU implementation instead of duplicating opcode
  // decoding and carry/branch semantics in the educational view.
  const core = typeof module === 'object' && module.exports
    ? require('../js/core/td4-core.js') : window.TD4;
  const sources = ['A', 'B', 'INPUT', '0'];

  function calculate(example) {
    const {byte, pc, a, b, input, out, carry} = example;
    for (const value of [byte, pc, a, b, input, out, carry]) {
      if (!Number.isInteger(value)) throw new TypeError('Datapath values must be integers');
    }
    if (byte < 0 || byte > 255 || [pc, a, b, input, out].some(v => v < 0 || v > 15) || (carry !== 0 && carry !== 1)) {
      throw new RangeError('Datapath values outside the CPU range');
    }

    const rom = new Array(16).fill(0);
    rom[pc] = byte;
    const cpu = new core.CPU(rom);
    cpu.pc = pc;
    cpu.a = a;
    cpu.b = b;
    cpu.out = out;
    cpu.carry = carry;
    cpu.setInput(input);

    const preview = core.decodeALU(byte, a, b, input);
    const step = cpu.step();
    const sourceIndex = (preview.selectB << 1) | preview.selectA;
    const isBranch = step.destination === 'PC';
    const writes = !isBranch || step.branchTaken;

    return {
      byte, pc, opcode:byte >>> 4, immediate:preview.imm,
      selectA:preview.selectA, selectB:preview.selectB, sourceIndex,
      sourceName:sources[sourceIndex], sourceValue:preview.source,
      sum:preview.sum, result:preview.result, nextCarry:step.carryAfter,
      destination:step.destination, oldCarry:step.carryBefore,
      isBranch, branchTaken:step.branchTaken, writes, nextPc:step.pcAfter,
      next:{a:cpu.a, b:cpu.b, out:cpu.out, pc:cpu.pc, carry:cpu.carry}
    };
  }

  function hex(value) { return '0x' + value.toString(16).toUpperCase().padStart(2, '0'); }
  function nibble(value) { return value.toString(2).padStart(4, '0'); }

  function initialize() {
    const container = document.getElementById('datapath-explorer');
    if (!container) return;
    const json = document.getElementById('datapath-examples');
    const select = container.querySelector('#datapath-choice');
    if (!json || !select) return;
    let examples;
    try { examples = JSON.parse(json.textContent); }
    catch (error) { return; }
    if (!Array.isArray(examples)) return;
    const byId = new Map(examples.map(example => [example.id, example]));

    function show(id) {
      const example = byId.get(id);
      if (!example) return;
      const state = calculate(example);
      const display = {
        command: example.label,
        byte: hex(state.byte),
        pc: nibble(state.pc),
        nextPc: nibble(state.nextPc),
        source: state.sourceName + ' = ' + state.sourceValue,
        immediate: String(state.immediate),
        operation: state.sourceValue + ' + ' + state.immediate,
        result: nibble(state.result) + ' (' + state.result + ')',
        destination: state.writes ? state.destination + ' ← ' + state.result : 'PCロード無効',
        control: state.destination === 'PC'
          ? (state.branchTaken ? 'PCへロード' : 'PCを +1')
          : state.destination + 'へロード',
        carryOut: String(state.nextCarry),
        carryStored: String(state.nextCarry),
        oldCarry: String(state.oldCarry),
        sel: 'SEL_B=' + state.selectB + ' / SEL_A=' + state.selectA,
        branch: state.isBranch
          ? (state.branchTaken ? '分岐成立：PC ← ' + state.result : '分岐不成立：PC ← PC + 1')
          : '通常実行：PC ← PC + 1',
        note: example.note
      };
      container.querySelectorAll('[data-flow-value]').forEach(element => {
        const key = element.getAttribute('data-flow-value');
        if (Object.prototype.hasOwnProperty.call(display, key)) element.textContent = display[key];
      });
      container.querySelectorAll('[data-flow-source]').forEach(element => {
        element.classList.toggle('is-active', element.getAttribute('data-flow-source') === state.sourceName);
      });
      container.querySelectorAll('[data-flow-target]').forEach(element => {
        element.classList.toggle('is-active', state.writes && element.getAttribute('data-flow-target') === state.destination);
      });
      const active = new Set([
        'fetch', 'source-' + state.sourceName, 'operand', 'immediate',
        'control-mux', 'control-load', 'carry-out', 'carry-latched'
      ]);
      if (state.writes) { active.add('result'); active.add('write-' + state.destination); }
      if (state.isBranch) active.add('old-carry');
      container.querySelectorAll('[data-flow-route]').forEach(element => {
        element.classList.toggle('is-active', active.has(element.getAttribute('data-flow-route')));
      });
    }

    select.addEventListener('change', () => show(select.value));
    show(select.value);
  }

  if (typeof module === 'object' && module.exports) module.exports = {calculate};
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialize, {once: true});
    else initialize();
  }
})();
