const test = require('node:test');
const assert = require('node:assert/strict');
const {CPU} = require('../assets/js/core/td4-core.js');
const netlist = require('../assets/js/data/netlist.js');
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
  assert.deepEqual(adder.sections[0].left.flat().map(x=>x.name),['A0','B0','A1','B1','A2','B2','A3','B3']);
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
  assert.equal(buf[1].net,'ROM_RAW7');assert.equal(buf[8].net,'ROM_RAW0');
  assert.equal(buf[17].net,'D7');assert.equal(buf[10].net,'D0');
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

test('physical DIP pin nets match canonical JSON for all 13 chips', () => {
  const {physicalPins}=require('../assets/js/core/ic-circuit.js');
  for(const chip of chips){
    const mapped=physicalPins(chip);
    const defined=netlist.pinNets[chip.id];
    const names=netlist.pinNames[chip.id];
    for(const pin of mapped){
      assert.equal(pin.net,defined[String(pin.number)],chip.id+'.'+pin.number+' net');
      assert.equal(pin.name,names[String(pin.number)],chip.id+'.'+pin.number+' name');
    }
  }
  assert.equal(physicalPins(chips.find(c=>c.id==='U1'))[7].net,'C_N');
  assert.equal(physicalPins(chips.find(c=>c.id==='U1'))[8].net,undefined);
  assert.equal(physicalPins(chips.find(c=>c.id==='U12'))[0].net,'GND');
});

test('ROM matrix has independent contact nets and common raw data columns', () => {
  assert.equal(netlist.romSwitches.length,16);
  const cells = new Set();
  for (const [address, sw] of netlist.romSwitches.entries()) {
    assert.equal(sw.address,address);
    assert.equal(sw.bits.length,8);
    for (const [bit,contact] of sw.bits.entries()) {
      assert.equal(contact.upperNet,'ROM_RAW'+bit);
      assert.equal(contact.selectedRow,'ROM_SEL_'+address);
      assert.equal(contact.lowerNet,'ROM_CELL_'+address+'_'+bit);
      cells.add(contact.lowerNet);
    }
  }
  assert.equal(cells.size,128);
});

test('74HC154 decoder outputs are arranged in a 4x4 row-major grid', () => {
  const {layout}=require('../assets/js/core/ic-circuit.js');
  const chip=chips.find(c=>c.type==='74HC154');
  const [section]=layout(chip).sections;
  assert.equal(section.right.length,4,'four output rows');
  for(let row=0;row<4;row++){
    assert.equal(section.right[row].length,4,'four columns per row');
    for(let column=0;column<4;column++){
      const address=row*4+column;
      assert.deepEqual(section.right[row][column],{
        name:'Y'+address.toString(16).toUpperCase()+'#',
        net:'ROM_SEL_'+address
      });
    }
  }
});

test('74HC14 uses only oscillator gates B and C and drives the common CLK net', () => {
  const {layout,physicalPins}=require('../assets/js/core/ic-circuit.js');
  const chip=chips.find(c=>c.id==='U2');
  assert.deepEqual(chip.pins.map(p=>[p.name,p.net]),[
    ['2A','OSC_IN'],['2Y','OSC_INV'],['3A','OSC_INV'],['3Y','CLK']
  ]);
  const pins=physicalPins(chip);
  for(const [num,net] of [[3,'OSC_IN'],[4,'OSC_INV'],[5,'OSC_INV'],[6,'CLK']]){
    assert.equal(pins[num-1].net,net);
    assert.equal(netlist.pinNets.U2[num],net);
    assert.ok(netlist.nets[net].includes('U2.'+num));
  }
  for(const num of [1,2,8,9,10,11,12,13])
    assert.equal(pins[num-1].net,undefined,'unused gate '+num+' is not tied to CPU nets');
  assert.ok(!netlist.nets.RST_N.includes('U2.10'));
  for(const target of ['U1.11','U3.2','U4.2','U5.2','U6.2'])
    assert.ok(netlist.nets.CLK.includes(target),target+' shares U2.6');
  assert.ok(!netlist.nets.OSC_IN.includes('U2.6'),'RC feedback is not a direct copper net');
  const layoutBC=layout(chip);
  assert.deepEqual(layoutBC.sections.map(s=>s.label),['B · OSCILLATOR','C · CLOCK BUFFER']);
  for(const high of [false,true]){
    const values=levels(new CPU(),high);
    assert.equal(values.CLK,high?1:0);
    assert.equal(values.OSC_IN,high?1:0,'idealized post-threshold B input');
    assert.equal(values.OSC_INV,high?0:1,'B output is inverted from CLK');
  }
});

test('IC details omit fixed enable controls but retain dynamic and non-enable pins', () => {
  const {layout,physicalPins}=require('../assets/js/core/ic-circuit.js');
  const byId=Object.fromEntries(chips.map(chip=>[chip.id,chip]));
  const detailPins=id=>layout(byId[id]).sections.flatMap(section=>[
    ...section.left.flat(),...section.right.flat()
  ]);
  const names=id=>detailPins(id).map(pin=>pin.name);

  assert.deepEqual(names('U13').filter(name=>/^G[12]#$/.test(name)),[]);
  assert.deepEqual(names('U13').filter(name=>/^A[0-3]$/.test(name)),['A0','A1','A2','A3']);
  assert.equal(names('U13').filter(name=>/^Y[0-9A-F]#$/.test(name)).length,16);

  assert.deepEqual(names('U12').filter(name=>/^OE[12]#$/.test(name)),[]);
  assert.deepEqual(names('U12').filter(name=>/^A[0-7]$/.test(name)).sort((a,b)=>Number(a[1])-Number(b[1])),Array.from({length:8},(_,n)=>'A'+n));
  assert.equal(names('U12').filter(name=>/^Y[0-7]$/.test(name)).length,8);

  for(const id of ['U7','U8']){
    assert.deepEqual(names(id).filter(name=>/^E[12]#$/.test(name)),[]);
    for(const control of ['S0','S1']){
      assert.equal(names(id).filter(name=>name===control).length,2,id+' '+control);
    }
  }
  for(const id of ['U3','U4','U5','U6']){
    assert.ok(names(id).includes('PE#'),id+' must retain dynamic parallel-load control');
    assert.ok(!names(id).includes('CLR#'),id+' fixed-HIGH clear must be hidden');
    assert.ok(names(id).includes('CLK'),id+' clock must remain visible');
    assert.deepEqual(names(id).filter(name=>/^D[0-3]$/.test(name)),['D0','D1','D2','D3']);
    assert.deepEqual(names(id).filter(name=>/^Q[0-3]$/.test(name)),['Q0','Q1','Q2','Q3']);
    assert.equal(physicalPins(byId[id])[0].net,'RST_N',id+' physical clear must remain connected');
  }
  assert.ok(!names('U1').includes('CLR#'),'74HC74 fixed-HIGH clear must be hidden');
  assert.ok(names('U1').includes('CLK'),'74HC74 clock must remain visible');
  assert.ok(names('U1').includes('D'),'74HC74 data input must remain visible');
  assert.ok(names('U1').includes('Q'),'74HC74 data output must remain visible');
  assert.ok(names('U1').includes('Q#'),'74HC74 inverted output must remain visible');
  assert.equal(physicalPins(byId.U1)[12].net,'RST_N','physical 74HC74 clear must remain connected');
  assert.equal(levels(new CPU(),false).RST_N,1,'clear remains deasserted HIGH in the model');
  assert.ok(!names('U9').includes('CIN'),'fixed LOW carry input hidden from detail view');
  assert.equal(physicalPins(byId.U9)[6].net,'GND','physical CIN remains tied LOW');

  // Hidden probes must not erase real physical terminals or the canonical wiring.
  assert.equal(physicalPins(byId.U12)[0].net,'GND');
  assert.equal(physicalPins(byId.U12)[18].net,'GND');
  assert.equal(physicalPins(byId.U13)[17].net,'GND');
  assert.equal(physicalPins(byId.U13)[18].net,'GND');
  for(const id of ['U7','U8']){
    assert.equal(physicalPins(byId[id])[0].net,'GND');
    assert.equal(physicalPins(byId[id])[14].net,'GND');
  }
});


test('74HC540 A and Y probes are 4 rows by 2 columns, with 0–3 in the left column', () => {
  const {layout}=require('../assets/js/core/ic-circuit.js');
  const chip=chips.find(c=>c.type==='74HC540');
  const [section]=layout(chip).sections;
  for(const [side,label,net] of [['left','A','ROM_RAW'],['right','Y','D']]){
    const rows=section[side];
    assert.equal(rows.length,4,side+' must contain four rows');
    for(let row=0;row<4;row++){
      assert.equal(rows[row].length,2,side+' must contain two columns');
      assert.deepEqual(rows[row],[
        {name:label+row,net:net+row},
        {name:label+(row+4),net:net+(row+4)}
      ]);
    }
  }
});

test('74HC153 detail displays selector and data inputs in two separate columns', () => {
  const {layout}=require('../assets/js/core/ic-circuit.js');
  for(const [id,start] of [['U7',0],['U8',2]]){
    const chip=chips.find(c=>c.id===id);
    const model=layout(chip);
    assert.match(model.leftLabel,/INPUT/);
    assert.match(model.rightLabel,/OUTPUT/);
    assert.equal(model.sections.length,2);
    for(const [index,section] of model.sections.entries()){
      const n=start+index;
      assert.equal(section.leftColumnBreak,2);
      assert.deepEqual(section.left.flat().map(pin=>pin.name),['S0','S1','A'+n,'B'+n,'IN'+n]);
      assert.deepEqual(section.left.slice(0,2).flat().map(pin=>pin.net),['SEL_A','SEL_B']);
      assert.deepEqual(section.right.flat().map(pin=>pin.name),['Y'+n]);
      assert.ok(!section.left.flat().some(pin=>pin.net==='GND'),'fixed-LOW C3 hidden');
    }
  }
});

test('74HC283 output divides SUM0–3 and COUT into separate columns', () => {
  const {layout,physicalPins}=require('../assets/js/core/ic-circuit.js');
  const chip=chips.find(c=>c.id==='U9');
  const section=layout(chip).sections[0];
  assert.equal(section.rightColumnBreak,4);
  assert.deepEqual(section.right.slice(0,4).flat().map(pin=>pin.name),['SUM0','SUM1','SUM2','SUM3']);
  assert.deepEqual(section.right.slice(4).flat().map(pin=>pin.name),['COUT']);
  assert.ok(!section.left.flat().some(pin=>pin.name==='CIN'));
  assert.equal(physicalPins(chip)[6].net,'GND','actual CIN is still tied LOW');
});
