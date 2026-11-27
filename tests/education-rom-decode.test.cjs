'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {inspect,exampleROM} = require('../assets/education/rom-decode.js');
const {CPU,decodeALU} = require('../assets/js/core/td4-core.js');

const root = path.resolve(__dirname,'..');
const html = fs.readFileSync(path.join(root,'assets/education/index.html'),'utf8');
const css = fs.readFileSync(path.join(root,'assets/css/education.css'),'utf8');
const netlist = JSON.parse(fs.readFileSync(path.join(root,'src/data/netlist.json'),'utf8'));

test('sample ROM uses 16 bytes and has the expected conditional jump', () => {
  const rom=exampleROM();
  assert.equal(rom.length,16);
  assert.deepEqual(rom.slice(0,7),[0x3F,0x01,0xE5,0xBF,0xF0,0xB0,0xF0]);
  const taken=inspect(rom,2,0),notTaken=inspect(rom,2,1);
  assert.equal(taken.asm,'JNC 5');
  assert.equal(taken.branchTaken,true);
  assert.equal(taken.controls.LOAD_PC_N,0);
  assert.equal(taken.pcAfter,5);
  assert.equal(notTaken.branchTaken,false);
  assert.equal(notTaken.controls.LOAD_PC_N,1);
  assert.equal(notTaken.pcAfter,3);
  assert.equal(taken.nextCarry,0);
  assert.equal(notTaken.nextCarry,0);
});

test('all 16 address lines select exactly one active-LOW 74HC154 output', () => {
  const rom=exampleROM();
  for(let pc=0;pc<16;pc++){
    const result=inspect(rom,pc,0);
    assert.equal(result.romSelect.length,16);
    assert.equal(result.romSelect.filter(x=>x===0).length,1,'one LOW row at '+pc);
    for(let i=0;i<16;i++) assert.equal(result.romSelect[i],pc===i?0:1,'Y'+i+'#');
    assert.equal(result.byte,rom[pc]);
    const cpu=new CPU(rom);
    cpu.pc=pc;
    cpu.a=5;
    cpu.b=3;
    cpu.setInput(10);
    const step=cpu.step();
    assert.equal(result.pcAfter,step.pcAfter);
  }
  assert.equal(netlist.pinNets.U13['23'],'PC0');
  assert.equal(netlist.pinNets.U13['22'],'PC1');
  assert.equal(netlist.pinNets.U13['21'],'PC2');
  assert.equal(netlist.pinNets.U13['20'],'PC3');
  assert.equal(netlist.pinNets.U13['1'],'ROM_SEL_0');
  assert.equal(netlist.pinNets.U13['17'],'ROM_SEL_15');
  assert.equal(netlist.pinNets.U13['18'],'GND');
  assert.equal(netlist.pinNets.U13['19'],'GND');
});

test('every 8-bit byte is inverted into ROM_RAW then restored on instruction D bus', () => {
  const rom=exampleROM();
  for(let byte=0;byte<256;byte++){
    rom[7]=byte;
    const result=inspect(rom,7,0);
    assert.equal(result.raw,(~byte)&0xFF);
    assert.equal(result.romRawBits.length,8);
    assert.equal(result.instructionBits.length,8);
    for(let bit=0;bit<8;bit++){
      assert.equal(result.instructionBits[bit],(byte>>bit)&1,'D'+bit+' byte '+byte);
      assert.equal(result.romRawBits[bit],1-((byte>>bit)&1),'ROM_RAW'+bit);
    }
    assert.equal(result.opcode,byte>>4);
    assert.equal(result.immediate,byte&15);
  }
  assert.equal(netlist.pinNets.U12['9'],'ROM_RAW0');
  assert.equal(netlist.pinNets.U12['11'],'D0');
  assert.equal(netlist.pinNets.U12['2'],'ROM_RAW7');
  assert.equal(netlist.pinNets.U12['18'],'D7');
  assert.equal(netlist.pinNets.U12['1'],'GND');
  assert.equal(netlist.pinNets.U12['19'],'GND');
  assert.notEqual(netlist.romSwitches[0].bits[0].lowerNet,'ROM_SEL_0',
    'switch-cell and select row must be distinct nets');
});

test('all 256 opcodes and both old carry states match hardware decode equations', () => {
  const rom=exampleROM();
  for(let byte=0;byte<256;byte++){
    rom[5]=byte;
    for(let previousCarry=0;previousCarry<=1;previousCarry++){
      const data=inspect(rom,5,previousCarry);
      const d7=(byte>>7)&1,d6=(byte>>6)&1,d5=(byte>>5)&1,d4=(byte>>4)&1;
      assert.equal(data.selectA,d7|d4);
      assert.equal(data.selectB,d5);
      assert.equal(data.controls.LOAD_A_N,d6|d7);
      assert.equal(data.controls.LOAD_B_N,(1-d6)|d7);
      assert.equal(data.controls.LOAD_OUT_N,Number(!((1-d6)&&d7)));
      assert.equal(data.controls.LOAD_PC_N,Number(!(d6&&d7&&(d4||(1-previousCarry)))));
      const alu=decodeALU(byte,5,3,10);
      assert.equal(data.sourceValue,alu.source);
      assert.equal(data.sum,alu.sum);
      assert.equal(data.result,alu.result);
      assert.equal(data.carryOut,alu.carry);
      assert.equal(data.nextCarry,data.carryOut);
      const cpu=new CPU(rom);
      cpu.pc=5;
      cpu.carry=previousCarry;
      cpu.a=5;
      cpu.b=3;
      cpu.setInput(10);
      const step=cpu.step();
      assert.equal(data.destination,step.destination);
      assert.equal(data.branchTaken,step.branchTaken);
      assert.equal(data.pcAfter,step.pcAfter);
    }
  }
});

test('interactive ROM lesson is linked, accessible and includes all 16x8 entries', () => {
  assert.match(html,/href="#rom-decode"/);
  assert.match(html,/<section class="panel edu-section" id="rom-decode">/);
  assert.match(html,/src="\.\.\/js\/core\/ic-circuit\.js" defer/);
  assert.match(html,/src="rom-decode\.js" defer/);
  assert.ok(html.indexOf('src="../js/core/td4-core.js"')<
    html.indexOf('src="../js/core/ic-circuit.js"'));
  assert.ok(html.indexOf('src="../js/core/ic-circuit.js"')<
    html.indexOf('src="rom-decode.js"'));
  for(const id of ['rom-decode-lab','rom-address-select','rom-byte-input','rom-carry-select',
    'rom-byte-error','rom-contents-table']) {
    assert.ok(html.includes('id="'+id+'"'),id);
  }
  assert.equal((html.match(/data-rom-selector="/g)||[]).length,16);
  assert.equal((html.match(/data-rom-row="/g)||[]).length,16);
  assert.equal((html.match(/data-rom-goto="/g)||[]).length,16);
  assert.equal((html.match(/data-rom-bit="/g)||[]).length,8);
  assert.match(html,/ROM_RAW0→A7/);
  assert.match(html,/href="#ic-74hc154"/);
  assert.match(html,/href="#ic-74hc540"/);
  assert.match(html,/href="#carry-jnc"/);
  assert.match(html,/aria-live="polite"/);
  assert.match(css,/\.edu-rom-selector\{/);
  assert.match(css,/\.edu-rom-signals\{/);
});

test('input validation uses correct TD4 ROM and register limits', () => {
  const rom=exampleROM();
  assert.throws(()=>inspect(rom,-1,0),RangeError);
  assert.throws(()=>inspect(rom,16,0),RangeError);
  assert.throws(()=>inspect(rom,0,2),RangeError);
  assert.throws(()=>inspect([...rom,0],0,0),RangeError);
});
