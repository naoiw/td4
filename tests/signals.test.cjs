const test = require('node:test');
const assert = require('node:assert/strict');
const { CPU, assemble } = require('../assets/js/core/td4-core.js');
const { GROUPS, preview, snapshot, appendSample, waveformPath, shouldCaptureSample } = require('../assets/js/core/signals.js');
const examples = require('../assets/js/data/samples.js');

test('all sample programs assemble inside TD4 16-byte ROM', () => {
  assert.equal(examples.length, 10);
  for (const example of examples) {
    assert.ok(example.id && example.title && example.description);
    const rom = assemble(example.source);
    assert.ok(rom.count > 0 && rom.count <= 16, example.id);
  }
  assert.equal(new Set(examples.map(example => example.id)).size, examples.length);
});

test('input and output channel bits are independent', () => {
  const cpu = new CPU(assemble(examples.find(x => x.id === 'echo').source).rom);
  cpu.setInput(0b1010);
  let s = snapshot(cpu, 0);
  assert.deepEqual([0,1,2,3].map(n => s['IN'+n]),[0,1,0,1]);
  assert.equal(s.CLK,0);
  cpu.step();
  s = snapshot(cpu, 1);
  assert.equal(s.CLK,1);
  assert.equal(cpu.b,10);
  cpu.step();
  s = snapshot(cpu, 1);
  assert.deepEqual([0,1,2,3].map(n => s['OUT'+n]),[0,1,0,1]);
});

test('ROM and current ALU output follow PC before the next rising edge', () => {
  const cpu = new CPU(assemble('MOV A, 15\nADD A, 1\nJNC 0').rom);
  let p = preview(cpu);
  assert.equal(p.byte,0x3f);
  assert.equal(p.result,15);
  cpu.step();
  p = preview(cpu);
  assert.equal(cpu.pc,1);
  assert.equal(p.byte,0x01);
  assert.equal(p.result,0);
  assert.equal(p.carry,1);
  cpu.step();
  assert.equal(cpu.carry,1);
  assert.equal(snapshot(cpu,false).C,1);
});

test('waveform step path, transitions, and capacity', () => {
  const samples=[];
  appendSample(samples,{CLK:0},3);
  appendSample(samples,{CLK:1},3);
  appendSample(samples,{CLK:0},3);
  appendSample(samples,{CLK:1},3);
  assert.deepEqual(samples.map(x=>x.CLK),[1,0,1]);
  assert.equal(waveformPath([], 'CLK'), '');
  const path=waveformPath(samples,'CLK',640,36,3);
  assert.match(path,/M 0 7 H 320 V 29 H 640 V 7 H 640/);
});

test('every channel defined by a selectable group is a boolean',()=>{
  const cpu=new CPU();
  const s=snapshot(cpu,1);
  for(const list of Object.values(GROUPS)){
    for(const name of list)assert.ok(s[name]===0 || s[name]===1, name);
  }
});

test('selectable analyzer groups contain at most 10 signals and retain all channels', () => {
  assert.deepEqual(Object.keys(GROUPS), ['basic', 'io', 'registers', 'pc', 'rom']);
  for (const [name, channels] of Object.entries(GROUPS)) {
    assert.ok(channels.length >= 1 && channels.length <= 10, name + ': too many signals');
    assert.equal(new Set(channels).size, channels.length, name + ': duplicate signal');
  }
  assert.deepEqual(GROUPS.registers, ['CLK', 'C', 'A3', 'A2', 'A1', 'A0', 'B3', 'B2', 'B1', 'B0']);
  assert.deepEqual(GROUPS.pc, ['CLK', 'C', 'PC3', 'PC2', 'PC1', 'PC0', 'ALU3', 'ALU2', 'ALU1', 'ALU0']);
  assert.deepEqual(GROUPS.rom, ['CLK', 'D7', 'D6', 'D5', 'D4', 'D3', 'D2', 'D1', 'D0']);
  const allSignals = new Set(Object.values(GROUPS).flat());
  for (const name of ['PC0','PC1','PC2','PC3','D0','D1','D2','D3','D4','D5','D6','D7','ALU0','ALU1','ALU2','ALU3']) {
    assert.ok(allSignals.has(name), name + ' should stay selectable');
  }
});

test('CPU capture samples only powered CPU clock activity, not stopped input edits', () => {
  for (const powerOn of [false, true]) {
    assert.equal(shouldCaptureSample('cpu', powerOn, false, 'clock'), false);
    assert.equal(shouldCaptureSample('cpu', powerOn, false, 'timer'), false);
    assert.equal(shouldCaptureSample('cpu', powerOn, true, 'timer'), false);
  }
  assert.equal(shouldCaptureSample('cpu', true, true, 'clock'), true);
  assert.equal(shouldCaptureSample('cpu', true, true, 'input'), true);
  assert.equal(shouldCaptureSample('cpu', true, false, 'input'), false);
  assert.equal(shouldCaptureSample('cpu', false, true, 'clock'), false);
  const samples = [];
  const cpu = new CPU();
  cpu.setInput(0);
  if (shouldCaptureSample('cpu', true, true, 'clock')) appendSample(samples, snapshot(cpu, false));
  const frozen = waveformPath(samples, 'IN0');
  cpu.setInput(1);
  if (shouldCaptureSample('cpu', true, false, 'clock')) appendSample(samples, snapshot(cpu, false));
  assert.equal(waveformPath(samples, 'IN0'), frozen, 'paused input changes do not scroll the trace');
  assert.equal(samples.length, 1);
});

test('oscilloscope capture continues at a fixed timer while CPU stopped, without stepping CPU', () => {
  const cpu = new CPU();
  const samples = [];
  cpu.setInput(0);
  for (let i = 0; i < 3; i++) {
    if (shouldCaptureSample('oscilloscope', true, false, 'timer'))
      appendSample(samples, snapshot(cpu, false));
  }
  assert.deepEqual(samples.map(s => s.IN0), [0, 0, 0]);
  cpu.setInput(1);
  if (shouldCaptureSample('oscilloscope', true, false, 'timer'))
    appendSample(samples, snapshot(cpu, false));
  assert.deepEqual(samples.map(s => s.IN0), [0, 0, 0, 1]);
  assert.equal(cpu.cycles, 0, 'independent capture never advances the CPU');
  assert.equal(shouldCaptureSample('oscilloscope', true, false, 'input'), true);
  assert.equal(shouldCaptureSample('oscilloscope', false, false, 'input'), false);
  assert.equal(shouldCaptureSample('oscilloscope', true, true, 'clock'), false);
  assert.equal(shouldCaptureSample('oscilloscope', false, false, 'timer'), false);
});

test('oscilloscope captures paused INPUT transitions immediately then keeps holding the level',()=>{
  const cpu = new CPU();
  const samples = [];
  const sample = source => {
    if (shouldCaptureSample('oscilloscope', true, false, source))
      appendSample(samples, snapshot(cpu, false));
  };
  sample('timer'); sample('timer');
  assert.deepEqual(samples.map(x=>x.IN2), [0,0]);
  cpu.setInput(0b0100);
  sample('input');
  assert.deepEqual(samples.map(x=>x.IN2), [0,0,1]);
  sample('timer'); sample('timer');
  assert.deepEqual(samples.map(x=>x.IN2), [0,0,1,1,1]);
  assert.equal(cpu.cycles,0,'continuously tracing signals never steps the CPU');
  const p=waveformPath(samples,'IN2');
  assert.match(p,/V 7/,'input transition is represented by a rising edge');
  const held=waveformPath(samples,'PC0');
  assert.doesNotMatch(held,/V 7/,'CPU PC remains at the same logic value while stopped');
});

test('fixed 20ms sampling displays 2Hz and 10Hz as distinct real-time CLK rates',()=>{
  const cpu = new CPU();
  const intervalMs = 20;
  const risingEdges = frequency => {
    const samples = [];
    const halfPeriodMs = 500 / frequency;
    for(let ms = 0; ms < 1000; ms += intervalMs){
      const high = Math.floor(ms / halfPeriodMs) % 2 === 1;
      appendSample(samples, snapshot(cpu, high), 80);
    }
    const rises = samples.slice(1).filter((sample, i) => samples[i].CLK === 0 && sample.CLK === 1).length;
    assert.ok(waveformPath(samples, 'CLK').includes('V 7'));
    return {rises, samples};
  };
  const slow = risingEdges(2);
  const fast = risingEdges(10);
  assert.equal(slow.rises, 2, '2Hz makes two rising edges per second');
  assert.equal(fast.rises, 10, '10Hz makes ten rising edges per second');
  assert.equal(fast.rises / slow.rises, 5, '10Hz shows five times as many cycles as 2Hz');
  assert.equal(fast.samples.length, slow.samples.length, 'both share one timebase');
});

test('LOGIC ANALYZER dropdown contains one combined PC / ALU option', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const select = html.match(/<select id="signalGroup">([\s\S]*?)<\/select>/)?.[1];
  assert.ok(select, 'signal group selector must exist');
  const options = [...select.matchAll(/<option value="([^"]+)">([^<]+)<\/option>/g)];
  assert.deepEqual(options.map(([,value]) => value), ['basic','io','registers','pc','rom']);
  assert.equal(options.find(([,value])=>value==='pc')?.[2], 'PC / ALU');
  assert.doesNotMatch(select,/value="alu"/);
});
