'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'assets', 'education', 'index.html'), 'utf8');
const script = fs.readFileSync(path.join(root, 'assets', 'education', 'datapath.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'assets', 'css', 'education.css'), 'utf8');
const {calculate} = require('../assets/education/datapath.js');
const {CPU} = require('../assets/js/core/td4-core.js');

const examplesMatch = html.match(/<script type="application\/json" id="datapath-examples">([\s\S]*?)<\/script>/);
assert.ok(examplesMatch, 'datapath examples are embedded as JSON');
const examples = JSON.parse(examplesMatch[1]);

test('Education datapath has selectable instruction examples and accessible diagram', () => {
  assert.equal(examples.length, 9);
  assert.equal(new Set(examples.map(item => item.id)).size, 9);
  assert.match(html, /href="#datapath"/);
  assert.match(html, /id="datapath-explorer"/);
  assert.match(html, /<svg class="edu-datapath-svg"[^>]*role="img"/);
  assert.match(html, /<title id="datapath-svg-title">/);
  assert.match(html, /<desc id="datapath-svg-description">/);
  assert.match(html, /id="datapath-choice"/);
  assert.match(html, /src="datapath.js" defer/);
  assert.match(html, /href="#hardware-details"/);
  assert.match(html, /aria-live="polite"/);
  assert.match(css, /\.edu-datapath-svg\{/);
  assert.match(css, /\.dp-path\.is-active\{/);
  assert.match(script, /add\('write-' \+ state.destination\)/);
  assert.match(script, /new core\.CPU\(rom\)/, 'data path uses the shared emulator CPU');
  assert.match(script, /core\.decodeALU\(/, 'data path uses the shared ALU logic');
  assert.ok(html.indexOf('src="../js/core/td4-core.js"') < html.indexOf('src="datapath.js"'),
    'CPU core must load before dependent educational scripts');

  for (const route of ['fetch', 'source-A', 'source-B', 'source-INPUT', 'source-0', 'immediate', 'operand', 'result', 'write-A', 'write-B', 'write-OUT', 'write-PC', 'carry-out', 'carry-latched', 'old-carry']) {
    assert.ok(html.includes('data-flow-route="' + route + '"'), 'route: ' + route);
  }
});

test('all examples match one CPU step and the register/carry results', () => {
  for (const example of examples) {
    const result = calculate(example);
    const rom = new Array(16).fill(0);
    rom[example.pc] = example.byte;
    const cpu = new CPU(rom);
    cpu.pc = example.pc;
    cpu.a = example.a;
    cpu.b = example.b;
    cpu.out = example.out;
    cpu.carry = example.carry;
    cpu.setInput(example.input);
    const step = cpu.step();
    assert.equal(result.sourceValue, step.source, example.id + ' source');
    assert.equal(result.immediate, step.imm, example.id + ' immediate');
    assert.equal(result.sum, step.sum, example.id + ' sum');
    assert.equal(result.result, step.result, example.id + ' ALU result');
    assert.equal(result.nextCarry, step.carryAfter, example.id + ' COUT/C');
    assert.equal(result.oldCarry, step.carryBefore, example.id + ' old carry');
    assert.equal(result.destination, step.destination, example.id + ' destination');
    assert.equal(result.branchTaken, step.branchTaken, example.id + ' branch');
    assert.equal(result.nextPc, step.pcAfter, example.id + ' PC');
    assert.deepEqual(result.next, {a:cpu.a, b:cpu.b, out:cpu.out, pc:cpu.pc, carry:cpu.carry}, example.id + ' updated state');
    assert.equal(result.writes, step.destination !== 'PC' || step.branchTaken, example.id + ' load enable');
  }
});

test('JNC uses old carry and only writes PC when branch is taken', () => {
  const taken = calculate(examples.find(x => x.id === 'jnc0'));
  const skipped = calculate(examples.find(x => x.id === 'jnc1'));
  assert.equal(taken.oldCarry, 0);
  assert.equal(taken.branchTaken, true);
  assert.equal(taken.writes, true);
  assert.equal(taken.nextPc, 9);
  assert.equal(skipped.oldCarry, 1);
  assert.equal(skipped.branchTaken, false);
  assert.equal(skipped.writes, false);
  assert.equal(skipped.nextPc, 3);
  assert.equal(skipped.nextCarry, 0);
  assert.equal(calculate(examples.find(x => x.id === 'overflow')).nextCarry, 1);
});

test('inputs reject values outside the TD4 range', () => {
  assert.throws(() => calculate({...examples[0], byte:256}), RangeError);
  assert.throws(() => calculate({...examples[0], carry:2}), RangeError);
  assert.throws(() => calculate({...examples[0], pc:-1}), RangeError);
});
