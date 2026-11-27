/* TD4 Education: truth tables and carry-chain exercises (ideal logic only). */
(function () {
  'use strict';

  function bit(value) {
    if (value !== 0 && value !== 1) throw new RangeError('Expected a 0/1 bit');
    return value;
  }
  function nibble(value) {
    if (!Number.isInteger(value) || value < 0 || value > 15) {
      throw new RangeError('Expected a 4-bit unsigned integer');
    }
    return value;
  }

  /** Two-input gates plus the inversion of input A. */
  function gates(a, b) {
    bit(a); bit(b);
    return {
      notA: 1 - a,
      and: a & b,
      or: a | b,
      xor: a ^ b,
      nand: 1 - (a & b)
    };
  }

  function halfAdder(a, b) {
    bit(a); bit(b);
    return {sum: a ^ b, carry: a & b};
  }

  function fullAdder(a, b, carryIn) {
    bit(a); bit(b); bit(carryIn);
    const xor = a ^ b;
    return {
      sum: xor ^ carryIn,
      carryOut: (a & b) | (xor & carryIn)
    };
  }

  /** Ripple-carry explanation of a 74HC283's combinational 4-bit addition. */
  function add4(a, b) {
    nibble(a); nibble(b);
    let carryIn = 0;
    let result = 0;
    const stages = [];
    for (let position = 0; position < 4; position++) {
      const bitA = (a >>> position) & 1;
      const bitB = (b >>> position) & 1;
      const stage = fullAdder(bitA, bitB, carryIn);
      stages.push({position, a:bitA, b:bitB, carryIn, sum:stage.sum, carryOut:stage.carryOut});
      result |= stage.sum << position;
      carryIn = stage.carryOut;
    }
    return {a, b, total:a + b, result, carryOut:carryIn, stages};
  }

  const toBinary = number => number.toString(2).padStart(4, '0');

  function setText(root, attribute, name, value) {
    root.querySelectorAll('[' + attribute + '="' + name + '"]').forEach(el => { el.textContent = String(value); });
  }

  function init() {
    const root = document.getElementById('logic-lab');
    const section = document.getElementById('logic');
    if (!root || !section) return;
    const aInput = root.querySelector('#logic-input-a');
    const bInput = root.querySelector('#logic-input-b');
    const xInput = root.querySelector('#logic-add-x');
    const yInput = root.querySelector('#logic-add-y');
    if (!aInput || !bInput || !xInput || !yInput) return;

    function updateGates() {
      const a = Number(aInput.value);
      const b = Number(bInput.value);
      const result = gates(a, b);
      setText(root, 'data-logic-result', 'notA', result.notA);
      for (const name of ['and', 'or', 'xor', 'nand']) {
        setText(root, 'data-logic-result', name, result[name]);
      }
      const half = halfAdder(a, b);
      setText(root, 'data-logic-result', 'halfSum', half.sum);
      setText(root, 'data-logic-result', 'halfCarry', half.carry);
      section.querySelectorAll('[data-logic-row]').forEach(row => {
        row.classList.toggle('is-active', row.getAttribute('data-logic-row') === '' + a + b);
      });
    }

    function updateAdder() {
      const x = Number(xInput.value);
      const y = Number(yInput.value);
      const result = add4(x, y);
      setText(root, 'data-add-result', 'binaryA', toBinary(x));
      setText(root, 'data-add-result', 'binaryB', toBinary(y));
      setText(root, 'data-add-result', 'sum', toBinary(result.result));
      setText(root, 'data-add-result', 'carry', result.carryOut);
      setText(root, 'data-add-result', 'decimal', result.total);
      setText(root, 'data-add-result', 'register', result.result);
      root.querySelectorAll('[data-add-stage]').forEach(row => {
        const position = Number(row.getAttribute('data-add-stage'));
        const stage = result.stages[position];
        if (!stage) return;
        for (const key of ['a', 'b', 'carryIn', 'sum', 'carryOut']) {
          setText(row, 'data-stage-bit', key, stage[key]);
        }
      });
    }

    aInput.addEventListener('change', updateGates);
    bInput.addEventListener('change', updateGates);
    xInput.addEventListener('change', updateAdder);
    yInput.addEventListener('change', updateAdder);
    updateGates();
    updateAdder();
  }

  if (typeof module === 'object' && module.exports) {
    module.exports = {gates, halfAdder, fullAdder, add4};
  }
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, {once:true});
    else init();
  }
})();
