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
  const expected = ['overview','binary','logic','sequential','hardware','cycle','rom-decode','decode','datapath','walkthrough','carry-jnc','practice','hardware-details','faq'];
  const sectionIds = [...education.matchAll(/<section class="panel edu-section" id="([^"]+)"/g)].map(m => m[1]);
  assert.deepEqual(sectionIds, expected);
  for (const id of expected) assert.ok(education.includes('href="#' + id + '"'), 'anchor to ' + id);
  // Only this curriculum test owns chapter order and numbering. Other feature
  // tests check their own section, so new lessons need just one test update.
  const headers = [...education.matchAll(/<section class="panel edu-section" id="([^"]+)">\s*<div class="edu-section-heading"><p class="eyebrow">(\d{2}) \/ /g)];
  assert.deepEqual(headers.map(match => match[1]), expected, 'numbered headings follow section order');
  assert.deepEqual(headers.map(match => match[2]), expected.map((_, index) => String(index + 1).padStart(2, '0')));
  const nav = education.match(/<nav class="education-toc"[^>]*>([\s\S]*?)<\/nav>/);
  assert.ok(nav, 'grouped curriculum navigation');
  const anchors = [...nav[1].matchAll(/href="#([^"]+)"/g)].map(match => match[1]);
  const withInstructionSet = expected.flatMap(id => id === 'decode' ? [id, 'instruction-set'] : [id]);
  assert.deepEqual(anchors, withInstructionSet, 'TOC follows reading order');
  const htmlIds = new Set([...education.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]));
  for (const id of anchors) assert.ok(htmlIds.has(id), 'TOC anchor target: ' + id);
  assert.equal((nav[1].match(/class="education-toc-group"/g) || []).length, 4);

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
