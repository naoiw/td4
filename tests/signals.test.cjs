const test = require('node:test');
const assert = require('node:assert/strict');
const { CPU, assemble } = require('../td4-core.js');
const { GROUPS, preview, snapshot, appendSample, waveformPath } = require('../signals.js');
const examples = require('../samples.js');

test('all sample programs assemble inside TD4 16-byte ROM', () => {
  assert.equal(examples.length, 8);
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
