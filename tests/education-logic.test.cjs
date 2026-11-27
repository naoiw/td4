'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'assets', 'education', 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'assets', 'css', 'education.css'), 'utf8');
const script = fs.readFileSync(path.join(root, 'assets', 'education', 'logic-basics.js'), 'utf8');
const {gates, halfAdder, fullAdder, add4} = require('../assets/education/logic-basics.js');
const {decodeALU} = require('../assets/js/core/td4-core.js');

test('gate functions and all four truth table rows agree', () => {
  for (const a of [0, 1]) {
    for (const b of [0, 1]) {
      const outputs = gates(a, b);
      assert.deepEqual(outputs, {
        notA: 1 - a,
        and: a & b,
        or: a | b,
        xor: a ^ b,
        nand: 1 - (a & b)
      });
      const expectedRow = '<tr data-logic-row="' + a + b + '"><th scope="row">' + a + '</th><td>' + b +
        '</td><td>' + outputs.and + '</td><td>' + outputs.or + '</td><td>' + outputs.xor +
        '</td><td>' + outputs.nand + '</td></tr>';
      assert.ok(html.includes(expectedRow), 'truth table row ' + a + b);
      assert.deepEqual(halfAdder(a, b), {sum:a ^ b, carry:a & b});
    }
  }
  assert.equal((html.match(/data-logic-row="/g) || []).length, 4);
  assert.match(script, /section\.querySelectorAll\('\[data-logic-row\]'\)/);
});

test('all eight full-adder rows match 1-bit arithmetic', () => {
  for (const a of [0, 1]) {
    for (const b of [0, 1]) {
      for (const cin of [0, 1]) {
        const result = fullAdder(a, b, cin);
        assert.equal(result.sum, (a + b + cin) & 1);
        assert.equal(result.carryOut, (a + b + cin) >>> 1);
        const row = '<tr><th scope="row">' + a + '</th><td>' + b + '</td><td>' + cin +
          '</td><td>' + result.sum + '</td><td>' + result.carryOut + '</td></tr>';
        assert.ok(html.includes(row), 'full adder row ' + a + b + cin);
      }
    }
  }
});

test('4-bit carry chain matches TD4 ALU for all 256 operand pairs', () => {
  for (let a = 0; a < 16; a++) {
    for (let b = 0; b < 16; b++) {
      const trace = add4(a, b);
      const cpu = decodeALU(b, a, 0, 0);
      assert.equal(trace.result, cpu.result, a + ' + ' + b + ': sum');
      assert.equal(trace.carryOut, cpu.carry, a + ' + ' + b + ': carry');
      assert.equal(trace.total, a + b);
      assert.equal(trace.stages.length, 4);
      let carry = 0;
      for (let bit = 0; bit < 4; bit++) {
        const stage = trace.stages[bit];
        assert.equal(stage.position, bit);
        assert.equal(stage.carryIn, carry);
        assert.equal(stage.sum, (trace.result >>> bit) & 1);
        carry = stage.carryOut;
      }
      assert.equal(carry, trace.carryOut);
    }
  }
  const example = add4(14, 3);
  assert.equal(example.total, 17);
  assert.equal(example.result, 1);
  assert.equal(example.carryOut, 1);
});

test('Education includes the new lesson and accessible exercises', () => {
  assert.match(html, /href="#logic"/);
  assert.match(html, /<section class="panel edu-section" id="logic">/);
  assert.match(html, /src="logic-basics\.js" defer/);
  assert.match(html, /id="logic-lab"/);
  assert.match(html, /id="logic-input-a"/);
  assert.match(html, /id="logic-input-b"/);
  assert.match(html, /id="logic-add-x"/);
  assert.match(html, /id="logic-add-y"/);
  assert.match(html, /id="logic-truth-two"/);
  assert.match(html, /id="logic-half-adder"/);
  assert.match(html, /id="logic-full-adder"/);
  assert.match(html, /id="logic-carry-stages"/);
  assert.match(html, /aria-live="polite"/);
  assert.match(html, /href="#ic-74hc283"/);
  assert.match(html, /href="#datapath"/);
  assert.match(css, /\.edu-logic-results\{/);
  assert.match(css, /\.edu-logic-table\{/);
  assert.equal((html.match(/data-add-stage="/g) || []).length, 4);
  assert.equal((html.match(/class="panel edu-section"/g) || []).length, 12);
  assert.equal((html.match(/<tr><th scope="row">(?:[0-9]|1[0-5])<\/th><td><code>[01]{4}<\/code><\/td><td><code>0x[0-9A-F]<\/code><\/td><\/tr>/g) || []).length, 16);
});

test('bit and nibble validation rejects invalid teaching inputs', () => {
  assert.throws(() => gates(2, 0), RangeError);
  assert.throws(() => fullAdder(0, 1, -1), RangeError);
  assert.throws(() => add4(-1, 2), RangeError);
  assert.throws(() => add4(16, 2), RangeError);
  assert.throws(() => add4(1.5, 2), RangeError);
});
