const test = require('node:test');
const assert = require('node:assert/strict');
const {CPU} = require('../assets/js/core/td4-core.js');
const {chips, levels} = require('../assets/js/core/ic-circuit.js');
const bit = (value, bitNumber) => (value >> bitNumber) & 1;

test('reference TD4 consists of 13 named 74HC packages', () => {
  assert.equal(chips.length, 13);
  assert.equal(new Set(chips.map(c => c.id)).size, 13);
  assert.equal(chips.filter(c => c.type === '74HC161').length, 4);
  assert.equal(chips.filter(c => c.type === '74HC153').length, 2);
  for (const type of ['74HC154','74HC540','74HC283','74HC74','74HC32','74HC10','74HC14']) {
    assert.equal(chips.filter(c => c.type === type).length, 1, type);
  }
});

test('every chip probe is driven by a defined binary net', () => {
  const cpu = new CPU();
  for (const chip of chips) {
    for (const pin of chip.pins) {
      const value = levels(cpu,false)[pin.net];
      assert.ok(value === 0 || value === 1, `${chip.id}.${pin.name} ${pin.net}`);
    }
  }
});

test('74HC154 active-low address decoding and ROM bus inversion', () => {
  const cpu = new CPU(Array.from({length:16}, (_,i)=>i * 13 & 255));
  for(let addr=0;addr<16;addr++) {
    cpu.pc=addr;
    const net = levels(cpu,false);
    assert.equal([...Array(16).keys()].filter(i=>net[`ROM_SEL_${i}`]===0).join(','), String(addr));
    for(let b=0;b<8;b++) {
      assert.equal(net[`D${b}`],bit(cpu.rom[addr],b));
      assert.equal(net[`ROM_RAW${b}`],1-bit(cpu.rom[addr],b));
    }
  }
});

test('all opcode bytes decode MUX selection and active-low register loads correctly', () => {
  const cpu = new CPU();
  cpu.a=5;cpu.b=12;cpu.input=7;cpu.carry=0;
  for(let instruction=0;instruction<256;instruction++) {
    cpu.rom[0]=instruction;cpu.pc=0;
    const nets=levels(cpu,false);
    const op=instruction>>4,imm=instruction&15,d4=bit(instruction,4),d5=bit(instruction,5),d6=bit(instruction,6),d7=bit(instruction,7);
    const selectA = d4 | d7, selectB=d5;
    const source=[cpu.a,cpu.b,cpu.input,0][selectB*2+selectA];
    const sum=source+imm;
    assert.equal(nets.SEL_A,selectA,`SEL_A ${instruction}`);
    assert.equal(nets.SEL_B,selectB,`SEL_B ${instruction}`);
    assert.equal(nets.COUT,+(sum>15),`carry ${instruction}`);
    for(let i=0;i<4;i++) {
      assert.equal(nets[`MUX${i}`],bit(source,i));
      assert.equal(nets[`ALU${i}`],bit(sum,i));
    }
    assert.equal(nets.LOAD_A_N,d6|d7);
    assert.equal(nets.LOAD_B_N,(1-d6)|d7);
    assert.equal(nets.LOAD_OUT_N,(1-d7)|d6);
    assert.equal(nets.LOAD_PC_N,+(!!(d6&&d7&&(d4||!cpu.carry))===false));
  }
});

test('carry flag is latched and differs from combinational COUT', () => {
  const cpu = new CPU([0x3f, 0x01, 0xE0, ...Array(13).fill(0)]);
  let nets=levels(cpu,false);
  assert.equal(nets.C,0);
  cpu.step();
  nets=levels(cpu,false);
  assert.equal(nets.C,0);
  assert.equal(nets.COUT,1);
  cpu.step();
  nets=levels(cpu,true);
  assert.equal(nets.C,1);
  assert.equal(nets.C_N,0);
  assert.equal(nets.LOAD_PC_N,1, 'JNC disabled when previously carry=1');
});

test('DIP pin counts and functional signal orientation', () => {
  const named=Object.fromEntries(chips.map(c=>[c.id,c]));
  const expected={'74HC154':24,'74HC540':20,'74HC161':16,'74HC153':16,'74HC283':16,'74HC74':14,'74HC32':14,'74HC10':14,'74HC14':14};
  for(const c of chips){
    const l=require('../assets/js/core/ic-circuit.js').layout(c);
    assert.equal(l.packagePins,expected[c.type],c.id);
    assert.equal(l.packagePins%2,0,c.id);
    assert.ok(l.sections.length>=1,c.id);
  }
  for(const id of ['U13','U12']){
    const l=require('../assets/js/core/ic-circuit.js').layout(named[id]);
    assert.match(l.leftLabel,/INPUT/);
    assert.match(l.rightLabel,/OUTPUT/);
    assert.ok(l.sections[0].left.flat().every(p=>!/^Y[0-9A-F]/.test(p.name)));
    assert.ok(l.sections[0].right.flat().every(p=>/^Y[0-9A-F]/.test(p.name)));
  }
  for(const id of ['U7','U8']){
    const l=require('../assets/js/core/ic-circuit.js').layout(named[id]);
    assert.deepEqual(l.sections.map(s=>s.label.split(' · ')[0]),['回路1','回路2']);
  }
  const adder=require('../assets/js/core/ic-circuit.js').layout(named.U9);
  assert.deepEqual(adder.sections[0].right.flat().map(x=>x.name),['SUM0','SUM1','SUM2','SUM3','COUT']);
  assert.deepEqual(adder.sections[0].left.flat().map(x=>x.name),['A0','B0','A1','B1','A2','B2','A3','B3','CIN']);
});


test('physical pinouts have correct leg counts and all simulated nets resolve', () => {
  const {physicalPins,layout}=require('../assets/js/core/ic-circuit.js');
  const cpu=new CPU();
  for(const chip of chips) {
    const pins=physicalPins(chip);
    assert.equal(pins.length,layout(chip).packagePins,chip.id);
    assert.deepEqual(pins.map(p=>p.number),Array.from({length:pins.length},(_,i)=>i+1));
    for(const pin of pins) if(pin.net) assert.ok([0,1].includes(levels(cpu,false)[pin.net]),chip.id+' pin '+pin.number+': '+pin.net);
    assert.equal(pins.at(-1).net,'VCC');
    assert.equal(pins[pins.length/2-1].net,'GND');
  }
});

test('physical pins of decoder, ROM buffer, MUX and adder match their DIP pinouts', () => {
  const {physicalPins}=require('../assets/js/core/ic-circuit.js');
  const byId=Object.fromEntries(chips.map(c=>[c.id,c]));
  const dec=physicalPins(byId.U13);
  assert.equal(dec[0].net,'ROM_SEL_0');
  assert.equal(dec[12].net,'ROM_SEL_11');
  assert.equal(dec[16].net,'ROM_SEL_15');
  assert.equal(dec[22].net,'PC0');
  const buf=physicalPins(byId.U12);
  assert.equal(buf[1].net,'ROM_RAW0');assert.equal(buf[8].net,'ROM_RAW7');
  assert.equal(buf[17].net,'D0');assert.equal(buf[10].net,'D7');
  for(const [id,lbit,hbit] of [['U7',0,1],['U8',2,3]]) {
    const mux=physicalPins(byId[id]);
    assert.equal(mux[1].net,'SEL_B');
    assert.equal(mux[13].net,'SEL_A');
    assert.equal(mux[6].net,'MUX'+lbit);
    assert.equal(mux[8].net,'MUX'+hbit);
  }
  const add=physicalPins(byId.U9);
  assert.equal(add[8].net,'COUT');assert.equal(add[3].net,'ALU0');
});
