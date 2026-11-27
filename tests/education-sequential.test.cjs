'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {initialState, transition} = require('../assets/education/sequential.js');
const {CPU, assemble} = require('../assets/js/core/td4-core.js');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'assets/education/index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'assets/css/education.css'), 'utf8');

function tick(state, inputs) {
  return transition(state, inputs, 'tick');
}

test('74HC74 captures COUT only at rising edge, holds on falling edge and while HIGH', () => {
  let s = initialState();
  assert.deepEqual(s, {clock:0,carry:0,register:0});
  s = tick(s, {d:1,mode:'hold',parallel:0});
  assert.deepEqual(s, {clock:1,carry:1,register:0,edge:'rise'});
  // Changing combinational D to 0 during HIGH is not a clock edge.
  assert.equal(s.carry, 1);
  s = tick(s, {d:0,mode:'hold',parallel:0});
  assert.deepEqual(s, {clock:0,carry:1,register:0,edge:'fall'});
  s = tick(s, {d:0,mode:'hold',parallel:0});
  assert.deepEqual(s, {clock:1,carry:0,register:0,edge:'rise'});
  s = tick(s, {d:1,mode:'hold',parallel:0});
  assert.equal(s.carry, 0);
  assert.equal(s.edge, 'fall');
});

test('74HC161 counts 0..15 and wraps to zero on rising edges only', () => {
  let state = initialState();
  for (let value=1; value<=32; value++) {
    state = tick(state,{d:0,mode:'count',parallel:7});
    assert.equal(state.register, value & 15);
    assert.equal(state.edge,'rise');
    state = tick(state,{d:1,mode:'count',parallel:7});
    assert.equal(state.register, value & 15);
    assert.equal(state.edge,'fall');
  }
});

test('74HC161 LOAD and HOLD both have correct edge behavior', () => {
  for (let value=0; value<16; value++) {
    let s = tick(initialState(),{d:1,mode:'load',parallel:value});
    assert.equal(s.register,value);
    s = tick(s,{d:0,mode:'load',parallel:(value + 1) & 15});
    assert.equal(s.register,value, 'falling edge cannot reload');
    s = tick(s,{d:0,mode:'hold',parallel:0});
    assert.equal(s.register,value, 'HOLD ignores parallel input');
    s = tick(s,{d:0,mode:'hold',parallel:15});
    assert.equal(s.register,value);
  }
});

test('asynchronous CLR# reset clears FF and register without altering CLK', () => {
  const high = tick(initialState(),{d:1,mode:'load',parallel:15});
  const resetHigh = transition(high,{d:1,mode:'hold',parallel:9},'reset');
  assert.deepEqual(resetHigh,{clock:1,carry:0,register:0,edge:'reset'});
  const low = tick(high,{d:1,mode:'hold',parallel:0});
  const resetLow = transition(low,{d:0,mode:'count',parallel:0},'reset');
  assert.equal(resetLow.clock,0);
  assert.equal(resetLow.register,0);
  assert.equal(resetLow.carry,0);
});

test('educational transitions match one-step CPU carry and PC update', () => {
  const cpu = new CPU(assemble('MOV A, 15\nADD A, 1\nJNC 9').rom);
  let state = initialState();
  const steps = [cpu.step(),cpu.step(),cpu.step()];
  for (const step of steps) {
    state = transition(state,{d:step.carryAfter,mode:step.branchTaken?'load':'count',parallel:step.result},'tick');
    assert.equal(state.carry,step.carryAfter,step.asm);
    assert.equal(state.register,step.pcAfter,step.asm);
    state = transition(state,{d:step.carryAfter,mode:'hold',parallel:0},'tick');
  }
  assert.equal(steps[1].carryAfter,1);
  assert.equal(steps[2].branchTaken,false,'JNC must inspect previous carry');
  assert.equal(steps[2].carryAfter,0);
});

test('Education adds accessible sequential learning section with waveform and IC links', () => {
  assert.match(html, /href="#sequential"/);
  assert.match(html, /<section class="panel edu-section" id="sequential">/);
  assert.match(html, /src="sequential\.js" defer/);
  assert.match(html, /id="sequential-lab"/);
  assert.match(html, /id="seq-clock-toggle"/);
  assert.match(html, /id="seq-reset"/);
  assert.match(html, /id="sequential-dff-table"/);
  assert.match(html, /id="sequential-161-table"/);
  assert.match(html, /id="seq-waveform"/);
  assert.match(html, /<title id="seq-wave-title">/);
  assert.match(html, /<desc id="seq-wave-description">/);
  assert.match(html, /data-seq-plot/);
  assert.match(html, /aria-live="polite"/);
  assert.match(html, /href="#ic-74hc14"/);
  assert.match(html, /href="#ic-74hc161"/);
  assert.match(html, /href="#ic-74hc74"/);
  assert.match(html, /href="#walkthrough"/);
  assert.match(css, /\.edu-seq-wave-scroll\{/);
  assert.match(css, /\.edu-seq-history\{/);
});

test('educational input validation prevents invalid bit, register and mode values', () => {
  assert.throws(() => tick(initialState(),{d:2,mode:'hold',parallel:0}), RangeError);
  assert.throws(() => tick(initialState(),{d:0,mode:'invalid',parallel:0}), RangeError);
  assert.throws(() => tick(initialState(),{d:0,mode:'count',parallel:16}), RangeError);
  assert.throws(() => tick({...initialState(),clock:2},{d:0,mode:'hold',parallel:0}), RangeError);
  assert.throws(() => transition(initialState(),{d:0,mode:'hold',parallel:0},'other'),RangeError);
});
