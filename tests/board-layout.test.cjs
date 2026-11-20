const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
// Keep assertions on the composed CSS in the exact browser import order.
const cssFiles=['foundation.css','workbench.css','circuit-board.css'];
const css=cssFiles.map(name=>fs.readFileSync(path.join(root,'assets/css',name),'utf8')).join('\n');
const js=fs.readFileSync(path.join(root,'assets/js/ui/app.js'),'utf8');
const boardJs=fs.readFileSync(path.join(root,'assets/js/ui/board.js'),'utf8');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const lastRule=(selector)=>{
  const matches=[...css.matchAll(new RegExp('\\.'+selector+'\\s*\\{([^}]*)\\}','g'))];
  assert.ok(matches.length>0,'Missing CSS rule '+selector);
  return matches.at(-1)[1];
};

test('ROM DIP 8-bit modules make a 4 by 4 address matrix',()=>{
  const grid=lastRule('rom-dip-grid');
  assert.match(grid,/grid-template-columns:\s*repeat\(4,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(grid,/grid-template-rows:\s*repeat\(4,\s*max-content\)/);
  assert.match(grid,/grid-auto-flow:\s*row/);
  assert.match(boardJs,/for\s*\(let addr\s*=\s*0;\s*addr\s*<\s*16/);
});

test('each ROM address contains eight horizontally arranged DIP toggles',()=>{
  assert.match(lastRule('rom-dip-switches'),/flex-direction:\s*row/);
  assert.match(lastRule('rom-dip'),/flex-direction:\s*column/);
  assert.match(lastRule('rom-dip'),/flex:\s*1 1 0/);
  assert.match(lastRule('rom-dip.is-on'),/justify-content:\s*flex-start/);
  assert.match(boardJs,/footer\.textContent\s*=\s*'D7 → D0'/);
});

test('Input and Output panels are horizontal beneath the ROM',()=>{
  assert.match(lastRule('schematic-io-strip'),/grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/);
  assert.ok(html.indexOf('id="romDipGrid"')<html.indexOf('class="schematic-io-strip"'));
});

test('three logic areas stay left and only HC154/HC540 stack in the middle',()=>{
  const board=css.match(/\/\* PCB placement:[\s\S]*$/)[0];
  assert.match(board,/\.schematic-board\s*\{[^}]*grid-template-columns:\s*490px\s+minmax\(0,\s*1fr\)/);
  assert.match(lastRule('ic-chip-grid'),/grid-template-columns:\s*minmax\(0,332px\)\s+126px/);
  for(const role of ['alu','registers','control']){
    assert.match(board,new RegExp('\\.ic-role-'+role+'\\{grid-column:1;'));
  }
  assert.match(board,/\.ic-role-fetch\s*\{[^}]*grid-column:2/);
  assert.match(lastRule('ic-role-fetch .ic-role-rack'),/flex-direction:\s*column/);
  const circuit=require('../assets/js/core/ic-circuit.js');
  const fetch=circuit.chips.filter(c=>c.group==='rom').map(c=>c.type).sort();
  assert.deepEqual(fetch,['74HC154','74HC540']);
  for(const role of ['fetch','alu','registers','control'])
    assert.match(boardJs,new RegExp("key:\\s*'"+role+"'"));
});

test('IC detail is outside board and large enough to inspect H/L probes',()=>{
  const boardEnd=html.indexOf('</div>\n      <div class="board-notes"');
  assert.ok(boardEnd>0,'external notes must follow schematic-scroll');
  assert.ok(html.indexOf('id="icDetailPanel"')>boardEnd,'detail panel must follow notes outside PCB');
  assert.match(js,/function toggleIcDetails\(chipId\)/);
  assert.match(js,/host\.append\(head,\s*pins\)/);
  assert.match(js,/oldCard\.append\(oldPins\)/);
  assert.match(css,/\.ic-detail-panel\s*\{[^}]*padding:\s*20px 24px 24px/);
  assert.match(css,/\.ic-detail-panel \.ic-functional-layout\s*\{[^}]*grid-template-columns:\s*repeat\(2/);
});

test('IC physical pins, net coloring and click toggles are preserved',()=>{
  assert.match(css,/\.ic-footprint \.ic-leg\.is-high:before/);
  assert.match(css,/\.ic-footprint \.ic-leg\.is-low:before/);
  assert.match(boardJs,/physicalPins\[pinNumber - 1\]/);
  assert.match(boardJs,/document\.querySelectorAll\('\.ic-probe'\)/);
  assert.match(boardJs,/chipToggle\.addEventListener\('click'/);
  assert.match(boardJs,/pinList\.hidden\s*=\s*true/);
});


test('the PCB has a green solder mask and a white surrounding background',()=>{
  const surround=lastRule('schematic-scroll');
  assert.match(surround,/background:\s*#ffffff/);
  const board=css.match(/\/\* PCB placement:[\s\S]*?\.schematic-board\s*\{([^}]*)\}/);
  assert.ok(board,'main board rule must exist');
  assert.match(board[1],/background-color:\s*#166342/);
  assert.match(board[1],/border:\s*6px solid #0d4b32/);
});
test('four circular mounting holes occupy the PCB corners',()=>{
  const hole=lastRule('pcb-mount-hole');
  assert.match(hole,/border-radius:\s*50%/);
  assert.match(hole,/pointer-events:\s*none/);
  for(const position of ['tl','tr','bl','br']){
    assert.match(html,new RegExp('class="pcb-mount-hole pcb-mount-'+position+'" aria-hidden="true"'));
    assert.match(css,new RegExp('\\.pcb-mount-'+position+'\\s*\\{'));
  }
  assert.equal((html.match(/class="pcb-mount-hole pcb-mount-/g)||[]).length,4);
});


test('DIP footprints retain two opposing pin banks and functional signal colors',()=>{
  assert.match(boardJs,/createLegs\('left'\)/);
  assert.match(boardJs,/createLegs\('right'\)/);
  assert.match(boardJs,/physicalPins\[pinNumber - 1\]/);
  assert.match(css,/\.ic-footprint \.ic-leg\.is-high:before/);
  assert.match(css,/\.ic-footprint \.ic-leg\.is-low:before/);
  assert.match(lastRule('ic-footprint .ic-leg-bank'),/flex-direction:\s*column/);
  assert.match(lastRule('ic-footprint .ic-leg-left'),/left:\s*-4px/);
  assert.match(lastRule('ic-footprint .ic-leg-right'),/right:\s*-4px/);
});
test('upper board text is removed and the signal legend sits entirely below the PCB',()=>{
  const board=html.slice(html.indexOf('id="schematicBoard"'),html.indexOf('id="icDetailPanel"'));
  for(const title of ['LOGIC ICs','74HC SERIES · 13 PACKAGES','ROM · 16 × 8-bit','74HC154でアドレスを選択']){
    assert.ok(!board.includes(title),title+' must be removed');
  }
  assert.equal((html.match(/class="schematic-explain"/g)||[]).length,1);
  assert.equal((html.match(/class="schematic-caution"/g)||[]).length,1);
  const boardClose=html.indexOf('      <div class="board-notes"');
  assert.ok(boardClose>html.indexOf('id="romDipGrid"'));
  assert.ok(boardClose<html.indexOf('id="icDetailPanel"'));
  assert.ok(!html.slice(html.indexOf('id="schematicBoard"'),boardClose).includes('class="schematic-explain"'));
});

test('DOM construction is delegated to stateless board renderer',()=>{
  assert.match(js,/TD4BoardView\.mount\(/);
  assert.match(boardJs,/function mount\(options\)/);
  assert.match(boardJs,/onRomBitToggle\(addr, bit\)/);
  assert.match(boardJs,/onInputBitToggle\(bit\)/);
  assert.ok(!boardJs.includes('cpu.rom['), 'renderer must not own CPU mutations');
});

test('board H/L and selected-net SVG renderers stay separate from CPU state',()=>{
  assert.match(js,/TD4BoardView\.render\(/);
  assert.match(js,/TD4BoardView\.drawWires\(/);
  assert.match(boardJs,/function render\(options\)/);
  assert.match(boardJs,/function drawWires\(options\)/);
  assert.match(boardJs,/drawWires\(options\)/);
  assert.match(boardJs,/selectedNetName/);
  assert.match(boardJs,/getBoundingClientRect\(\)/);
  assert.match(boardJs,/classList\.toggle\('is-high'/);
  assert.ok(!boardJs.includes('cpu.step('),'view layer must not execute instructions');
});
