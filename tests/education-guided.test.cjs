'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {CPU, assemble} = require('../assets/js/core/td4-core.js');
const education = fs.readFileSync(path.join(__dirname, '..', 'assets', 'education', 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, '..', 'assets', 'css', 'education.css'), 'utf8');

function steps(program, count) {
  const cpu = new CPU(assemble(program).rom);
  return Array.from({length:count}, (_, index) => {
    const beforePc = cpu.pc;
    cpu.step();
    return {step:index + 1, beforePc, a:cpu.a, b:cpu.b, out:cpu.out, c:cpu.carry, nextPc:cpu.pc};
  });
}

test('Education navigation covers the curriculum and answers are collapsible', () => {
  const expected = ['overview','binary','logic','sequential','cycle','datapath','decode','walkthrough','hardware','hardware-details','practice','faq'];
  const sectionIds = [...education.matchAll(/<section class="panel edu-section" id="([^"]+)"/g)].map(m => m[1]);
  assert.deepEqual(sectionIds, expected);
  for (const id of expected) assert.ok(education.includes('href="#' + id + '"'), 'anchor to ' + id);
  assert.match(education, /<details class="reference-card" id="instruction-set"/);
  assert.ok(education.includes('href="#instruction-set"'));
  assert.equal((education.match(/class="isa-instruction"/g) || []).length, 12);
  assert.equal((education.match(/class="edu-exercise"/g) || []).length, 4);
  assert.equal((education.match(/class="edu-faq"/g) || []).length, 1);
  assert.match(css, /\.edu-state-table\{/);
  assert.match(css, /\.edu-exercise-grid\{/);
  assert.match(css, /@media\(max-width:700px\)/);
});

test('five-step B register walkthrough exactly follows the emulator CPU', () => {
  const result = steps(`MOV B, 3
loop: OUT B
      ADD B, 1
      JMP loop`, 5);
  assert.deepEqual(result, [
    {step:1,beforePc:0,a:0,b:3,out:0,c:0,nextPc:1},
    {step:2,beforePc:1,a:0,b:3,out:3,c:0,nextPc:2},
    {step:3,beforePc:2,a:0,b:4,out:3,c:0,nextPc:3},
    {step:4,beforePc:3,a:0,b:4,out:3,c:0,nextPc:1},
    {step:5,beforePc:1,a:0,b:4,out:4,c:0,nextPc:2}
  ]);
  assert.match(education, /<td><code>MOV B, 3<\/code><\/td><td>3<\/td><td>0<\/td><td>0x1<\/td>/);
  assert.match(education, /<td><code>JMP loop<\/code><\/td><td>4<\/td><td>3<\/td><td>0x1<\/td>/);
});

test('carry and JNC walkthrough uses old carry and updates the new carry', () => {
  const result = steps(`MOV A, 15
ADD A, 1
JNC skip
OUT 15
end: JMP end
skip: OUT 0
      JMP end`, 4);
  assert.deepEqual(result, [
    {step:1,beforePc:0,a:15,b:0,out:0,c:0,nextPc:1},
    {step:2,beforePc:1,a:0,b:0,out:0,c:1,nextPc:2},
    {step:3,beforePc:2,a:0,b:0,out:0,c:0,nextPc:3},
    {step:4,beforePc:3,a:0,b:0,out:15,c:0,nextPc:4}
  ]);
  assert.match(education, /<td><code>JNC skip<\/code><\/td><td>0<\/td><td>0<\/td><td>0x3<\/td>/);
  assert.match(education, /<td><code>ADD A, 1<\/code><\/td><td>0<\/td><td>1<\/td><td>0x2<\/td>/);
});

test('binary overflow example matches 4-bit ALU behavior', () => {
  const trace = steps('MOV A, 14\nADD A, 3', 2);
  assert.equal(trace[1].a, 1);
  assert.equal(trace[1].c, 1);
  assert.match(education, /1110₂/);
  assert.match(education, /0011₂/);
  assert.match(education, /0001₂/);
});
