const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.resolve(__dirname, '../index.html'), 'utf8');
const css = fs.readFileSync(path.resolve(__dirname, '../assets/css/foundation.css'), 'utf8');
const {CPU, isStandard} = require('../assets/js/core/td4-core.js');
require('../assets/js/data/netlist.js');
const {levels} = require('../assets/js/core/ic-circuit.js');

const standard = [
  ['3', 'MOV A, Im', true],
  ['7', 'MOV B, Im', true],
  ['1', 'MOV A, B', false],
  ['4', 'MOV B, A', false],
  ['0', 'ADD A, Im', true],
  ['5', 'ADD B, Im', true],
  ['2', 'IN A', false],
  ['6', 'IN B', false],
  ['B', 'OUT Im', true],
  ['9', 'OUT B', false],
  ['F', 'JMP Im', true],
  ['E', 'JNC Im', true]
];
const nets = ['SEL_B', 'SEL_A', 'LOAD_A_N', 'LOAD_B_N', 'LOAD_OUT_N', 'LOAD_PC_N'];
const signalNames = ['SelB', 'SelA', 'Ld0', 'Ld1', 'Ld2', 'Ld3'];

test('visual ISA table reproduces all 12 standard instructions and their binary encoding',()=>{
  const matches=[...html.matchAll(/<tr class="isa-instruction" data-opcode="([0-9A-F])">([\s\S]*?)<\/tr>/g)];
  assert.equal(matches.length,12);
  for(const [index,[hex,name,immediate]] of standard.entries()){
    const [,opcode,row]=matches[index];
    assert.equal(opcode,hex,'opcode row '+index);
    assert.ok(row.includes('<code>'+name+'</code>'),'mnemonic '+name);
    assert.ok(row.includes('<code>0x'+hex+(immediate?'n':'0')+'</code>'),'hex pattern '+hex);
    assert.equal(isStandard(parseInt(hex,16)<<4),true);
    const cells=[...row.matchAll(/<td class="isa-bit (isa-fixed|isa-immediate)" data-bit="([0-7])"[^>]*>([^<]+)<\/td>/g)];
    assert.equal(cells.length,8,hex+' has exactly 8 bit cells');
    for(const [i,cell] of cells.entries()){
      const [,kind,bit,display]=cell;
      assert.equal(Number(bit),7-i,hex+' bit header order');
      if(i<4){
        assert.equal(kind,'isa-fixed');
        assert.equal(display,((parseInt(hex,16)>>(3-i))&1).toString());
      }else if(immediate){
        assert.equal(kind,'isa-immediate');
        assert.equal(display,'i'+(7-i));
      }else{
        assert.equal(kind,'isa-fixed');
        assert.equal(display,'0');
      }
    }
  }
});

test('displayed SelB, SelA and Ld0-Ld3 exactly match decoder nets, including JNC carry condition',()=>{
  const rows=[...html.matchAll(/<tr class="isa-instruction" data-opcode="([0-9A-F])">([\s\S]*?)<\/tr>/g)];
  for(const [,hex,row] of rows){
    const cpu=new CPU();
    cpu.rom[0]=parseInt(hex,16)<<4;
    cpu.carry=0;
    const state=levels(cpu,false);
    const cells=[...row.matchAll(/<td class="isa-control [^"]+" data-net="([^"]+)" data-level="([^"]+)"[^>]*>([^<]+)<\/td>/g)];
    assert.equal(cells.length,6,'six control lines for opcode '+hex);
    for(const [i,match] of cells.entries()){
      assert.equal(match[1],signalNames[i]);
      const expected=state[nets[i]]?'H':'L';
      const shown=(hex==='E'&&i===5)?'L/H':expected;
      assert.equal(match[2],shown,'signal '+match[1]+' opcode '+hex);
      assert.equal(match[3],shown);
    }
    const flagCell=row.match(/<td class="isa-carry[^"]*">([^<]+)<\/td>/);
    assert.ok(flagCell);
    assert.equal(flagCell[1],['0','5'].includes(hex)?'0/1':'0');
  }
  const jnc=new CPU();
  jnc.rom[0]=0xE0;
  jnc.carry=1;
  assert.equal(levels(jnc,false).LOAD_PC_N,1,'old carry=1 blocks JNC');
  jnc.carry=0;
  assert.equal(levels(jnc,false).LOAD_PC_N,0,'old carry=0 enables JNC');
  assert.match(html,/JNCのLd3は旧C=0ならL、旧C=1ならH/);
});

test('ISA is shown as a legible scrollable table with descriptions and clear H/L colors',()=>{
  assert.match(html,/class="isa-table-scroll" role="region"[^>]+tabindex="0"/);
  assert.match(html,/class="isa-detail-table"/);
  assert.equal((html.match(/<tr class="isa-explanation">/g)||[]).length,12);
  assert.match(html,/下位4bit/);
  assert.match(html,/アクティブLOW/);
  for(const selector of ['.isa-bit','.isa-high','.isa-low','.isa-conditional','.isa-explanation','.isa-table-scroll'])
    assert.ok(css.includes(selector),selector+' has a visual style');
});
