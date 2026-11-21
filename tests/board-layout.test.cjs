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
  assert.match(boardJs,/firstBit\.textContent\s*=\s*'7'/);
  assert.match(boardJs,/lastBit\.textContent\s*=\s*'0'/);
  assert.match(boardJs,/footer\.append\(firstBit,\s*lastBit\)/);
});

test('Input and Output panels are horizontal beneath the ROM',()=>{
  assert.match(lastRule('schematic-io-strip'),/grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/);
  assert.ok(html.indexOf('id="romDipGrid"')<html.indexOf('class="schematic-io-strip"'));
});

test('three logic areas stay left and only HC154/HC540 stack in the middle',()=>{
  const board=css.match(/\/\* PCB placement:[\s\S]*$/)[0];
  assert.match(board,/\.schematic-board\s*\{[^}]*grid-template-columns:\s*472px\s+minmax\(0,\s*1fr\)/);
  assert.match(lastRule('ic-chip-grid'),/grid-template-columns:\s*minmax\(0,332px\)\s+126px/);
  for(const [role,row] of [['control',1],['alu',2],['registers',3]]){
    assert.match(board,new RegExp('\\.ic-role-'+role+'\\{grid-column:1;grid-row:'+row+'\\}'));
  }
  for(const source of [boardJs,fs.readFileSync(path.join(root,'src/ui/board.ts'),'utf8')]){
    const leftRoles=[...source.matchAll(/key:\s*'(control|alu|registers)'\s*,\s*title:/g)].map(match=>match[1]);
    assert.deepEqual(leftRoles,['control','alu','registers']);
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
  const boardEnd=html.indexOf('      <section id="icDetailPanel"');
  assert.ok(boardEnd>html.indexOf('id="romDipGrid"'),'external IC detail must follow board');
  assert.ok(html.indexOf('id="schematicBoard"')<boardEnd,'IC detail panel must stay outside PCB');
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
test('board legend and disclaimer are absent while PCB and details remain',()=>{
  for(const title of ['LOGIC ICs','74HC SERIES · 13 PACKAGES','ROM · 16 × 8-bit','74HC154でアドレスを選択']){
    assert.ok(!html.includes(title),title+' must be removed');
  }
  assert.doesNotMatch(html,/board-notes|schematic-explain|schematic-caution|アドレス選択中（\/Y=L）/);
  assert.doesNotMatch(html,/HIGH 1|LOW 0/);
  assert.match(html,/id="schematicBoard"/);
  assert.match(html,/id="icDetailPanel"/);
});

test('DOM construction is delegated to stateless board renderer',()=>{
  assert.match(js,/TD4BoardView\.mount\(/);
  assert.match(boardJs,/function mount\(options\)/);
  assert.match(boardJs,/onRomBitToggle\(addr, bit\)/);
  assert.match(boardJs,/onInputBitToggle\(bit\)/);
  assert.doesNotMatch(boardJs,/cpu\.rom\[[^\]]+\]\s*(?:\^=|=)/,'renderer must not mutate ROM');
  assert.ok(!boardJs.includes('cpu.setInput('),'renderer must not mutate input');
});

test('selected-net highlighting uses orange terminals instead of SVG wires',()=>{
  assert.match(js,/TD4BoardView\.render\(/);
  assert.match(boardJs,/function render\(options\)/);
  assert.doesNotMatch(js,/TD4BoardView\.drawWires\(/);
  assert.doesNotMatch(boardJs,/drawWires\(|createElementNS\(/);
  assert.doesNotMatch(html,/icWireLayer/);
  assert.doesNotMatch(css,/\.ic-wire(?:-layer|\.hi|\.lo|\{)/);
  assert.match(boardJs,/leg\.classList\.toggle\('net-selected', powerOn && !!net && net === selectedNet\)/);
  assert.match(boardJs,/element\.classList\.toggle\('net-selected', powerOn && net === selectedNet\)/);
  assert.match(boardJs,/el\.classList\.toggle\('net-selected', powerOn && !!el\.dataset\.net && el\.dataset\.net === selectedNet\)/);
  assert.match(css,/\.ic-footprint \.ic-leg\.net-selected:before/);
  assert.match(css,/\.rom-select-lamp\.net-selected/);
  assert.match(css,/\.schematic-io-switch\.net-selected/);
  assert.match(css,/\.schematic-io-led\.net-selected/);
  assert.match(css,/\.rom-dip\.net-selected/);
  assert.match(boardJs,/classList\.toggle\('is-high'/);
  assert.ok(!boardJs.includes('cpu.step('),'view layer must not execute instructions');
});


test('selected network color follows logic level on all board component types',()=>{
  for(const source of [boardJs,fs.readFileSync(path.join(root,'src/ui/board.ts'),'utf8')]){
    assert.match(source,/element\.classList\.toggle\('net-selected-low', powerOn && net === selectedNet && level === 0\)/);
    assert.match(source,/leg\.classList\.toggle\('net-selected-low', powerOn && !!net && net === selectedNet && level === 0\)/);
    assert.match(source,/el\.classList\.toggle\('net-selected-low', powerOn && !!el\.dataset\.net && el\.dataset\.net === selectedNet && values\[el\.dataset\.net\] === 0\)/);
  }
  assert.match(css,/\.ic-footprint \.ic-leg\.net-selected-low:before/);
  assert.match(css,/\.ic-detail-panel \.ic-probe\.net-selected-low/);
  assert.match(css,/\.rom-select-lamp\.net-selected-low/);
  assert.match(css,/\.rom-dip\.net-selected-low/);
  assert.match(css,/\.schematic-io-switch\.net-selected-low/);
  assert.match(css,/\.schematic-io-led\.net-selected-low/);
  assert.match(css,/outline-color:#f5e6a5/);
  assert.match(css,/\.ic-leg\.net-selected:before/,'HIGH retains its orange highlight');
  assert.doesNotMatch(html,/icWireLayer/);
});

test('IC VCC red, GND black, NC dark and signal pins live green/grey',()=>{
  assert.match(boardJs,/dataset\.pinRole = physicalPin\.name === 'VCC'/);
  assert.match(boardJs,/physicalPin\.name === 'GND' \? 'gnd'/);
  assert.match(boardJs,/physicalPin\.net \? 'signal' : 'nc'/);
  assert.match(boardJs,/role === 'signal' && level === 1/);
  assert.match(boardJs,/role === 'signal' && level === 0/);
  for (const kind of ['vcc','gnd','nc'])
    assert.match(css,new RegExp('\\.ic-footprint \\.ic-leg\\[data-pin-role="'+kind+'"\\]:before'));
  assert.match(css.match(/\.ic-footprint \.ic-leg\[data-pin-role="vcc"\]:before\s*\{([^}]*)\}/)[1],/background:linear-gradient\(90deg,#ff9292,#e7474d\)/);
  assert.match(css.match(/\.ic-footprint \.ic-leg\[data-pin-role="gnd"\]:before\s*\{([^}]*)\}/)[1],/background:linear-gradient\(90deg,#333b40,#0c1115\)/);
  assert.match(css.match(/\.ic-footprint \.ic-leg\[data-pin-role="nc"\]:before\s*\{([^}]*)\}/)[1],/background:#48535a/);
  assert.match(lastRule('ic-probe.is-low'),/background:#303c43/);
});
test('ROM end labels align with first D7 and last D0 switch',()=>{
  assert.match(lastRule('rom-slot-bits'),/grid-template-columns:repeat\(8,minmax\(0,1fr\)\)/);
  assert.match(lastRule('rom-slot-bits span:first-child'),/grid-column:1/);
  assert.match(lastRule('rom-slot-bits span:last-child'),/grid-column:8/);
  assert.match(boardJs,/footer\.append\(firstBit,\s*lastBit\)/);
});
test('ROM active LED is green and IO labels grow to 11px with green/grey state',()=>{
  assert.match(lastRule('rom-select-lamp.is-on'),/background:#63efa2/);
  assert.match(lastRule('schematic-io-switch'),/font-size:11px/);
  assert.match(lastRule('schematic-io-led'),/font-size:11px/);
  assert.match(lastRule('schematic-io-switch.is-on'),/background:#246c4e/);
  assert.match(lastRule('schematic-io-led:before'),/background:#75838a/);
  assert.match(lastRule('schematic-io-led.is-on:before'),/background:radial-gradient/);
  assert.match(lastRule('schematic-io-led.is-on:before'),/box-shadow:0 0 26px 6px/);
});

test('whole PCB auto-fits viewport while preserving original geometry',()=>{
  assert.match(html,/class="schematic-scroll" id="schematicViewport"/);
  assert.match(lastRule('schematic-scroll'),/display:flex/);
  assert.match(lastRule('schematic-scroll'),/justify-content:center/);
  assert.match(lastRule('schematic-scroll'),/overflow:hidden/);
  const board=css.match(/\/\* PCB placement:[\s\S]*?\.schematic-board\s*\{([^}]*)\}/);
  assert.ok(board,'the logical board dimensions must remain fixed');
  assert.match(board[1],/width:1135px/);
  assert.match(board[1],/flex:none/);
  assert.match(board[1],/transform:scale\(var\(--board-fit-scale,1\)\)/);
  assert.match(board[1],/transform-origin:top center/);
  for(const source of [js,fs.readFileSync(path.join(root,'src/ui/app.ts'),'utf8')]){
    assert.match(source,/new ResizeObserver\(fitCircuitBoard\)/);
    assert.match(source,/Math\.min\(1\.2, availableWidth \/ board\.offsetWidth\)/);
    assert.match(source,/viewport\.clientWidth/);
    assert.match(source,/board\.offsetHeight \* scale/);
    assert.match(source,/window\.addEventListener\('resize', fitCircuitBoard\)/);
    assert.match(source,/board\.style\.setProperty\('--board-fit-scale'/);
  }
});
test('board auto-fit no longer draws selection-dependent wires',()=>{
  for(const source of [js,fs.readFileSync(path.join(root,'src/ui/app.ts'),'utf8')]){
    assert.match(source,/Math\.min\(1\.2, availableWidth \/ board\.offsetWidth\)/);
    assert.doesNotMatch(source,/drawSelectedWires|TD4BoardView\.drawWires/);
  }
});

test('PCB power and oscillator controls sit above the lowered ROM and IO',()=>{
  const area=html.indexOf('class="board-control-bay"');
  const rom=html.indexOf('id="romDipGrid"');
  const io=html.indexOf('class="schematic-io-strip"');
  assert.ok(area>0 && area<rom && rom<io,'controls must precede the ROM and IO on the PCB');
  for(const id of ['boardPowerSwitch','boardClockSwitch','boardPowerLed']){
    assert.match(html,new RegExp('id="'+id+'"'));
  }
  assert.match(html,/class="pcb-osc-diagram" viewBox="0 -7 220 99"/);
  assert.match(html,/CR OSCILLATOR/);
  assert.match(lastRule('rom-zone'),/flex-direction:column/);
  assert.match(lastRule('board-control-bay'),/grid-template-rows:auto auto/);
  assert.match(lastRule('board-control-bay'),/padding:9px 12px 9px/);
  assert.match(lastRule('pcb-power-led.is-on'),/background:radial-gradient/);
});

test('board controls start power OFF and 2Hz with board-exclusive frequency selection',()=>{
  const appTs=fs.readFileSync(path.join(root,'src/ui/app.ts'),'utf8');
  const boardTs=fs.readFileSync(path.join(root,'src/ui/board.ts'),'utf8');
  for(const source of [js,appTs]){
    assert.match(source,/let powerOn = false/);
    assert.match(source,/let boardClockHz(?:\s*:\s*2\s*\|\s*10)? = 2/);
    assert.match(source,/onPowerToggle\(\)\s*\{\s*if\s*\(powerOn\)\s*setPower\(false\);\s*else\s*run\(\);\s*\}/);
    assert.match(source,/onFrequencyToggle\(\) \{ setBoardFrequency\(boardClockHz === 2 \? 10 : 2\); \}/);
    assert.match(source,/function setPower\(/);
    assert.match(source,/function restartRunningClock\(/);
    assert.match(source,/if\s*\(immediate\)\s*risingEdge\(\)/);
    assert.match(source,/\('powerOnBtn'\)\.addEventListener\('click', \(\) => setPower\(true\)\)/);
    assert.match(source,/\('powerOffBtn'\)\.addEventListener\('click', \(\) => setPower\(false\)\)/);
    assert.match(source,/\('runPauseBtn'\)\.addEventListener\('click', toggleRunPause\)/);
    assert.match(source,/const halfPeriod = 500 \/ boardClockHz/);
    assert.doesNotMatch(source,/stepBtn|resetBtn|actualClockHz|boardOscReadout|['"]speed['"]/);
  }
  for(const source of [boardJs,boardTs]){
    assert.match(source,/\('boardPowerSwitch'\)\.addEventListener\('click', onPowerToggle\)/);
    assert.match(source,/\('boardClockSwitch'\)\.addEventListener\('click', onFrequencyToggle\)/);
    assert.match(source,/pilot\.classList\.toggle\('is-on', powerOn\)/);
    assert.match(source,/frequencySwitch\.classList\.toggle\('is-ten-hz', boardClockHz === 10\)/);
    assert.match(source,/cell\.classList\.toggle\('is-current',\s*selected && powerOn\)/);
  }
  assert.match(html,/id="powerOnBtn"/);
  assert.match(html,/id="powerOffBtn"/);
  assert.match(html,/id="runPauseBtn"/);
  for (const oldId of ['runBtn','stopBtn']) assert.doesNotMatch(html,new RegExp('id="'+oldId+'"'));
  for (const id of ['stepBtn','resetBtn','speed','boardOscReadout']) assert.doesNotMatch(html,new RegExp('id="'+id+'"'));
});

test('oscillator on left and power silk labels to the right of its switch',()=>{
  const left=html.indexOf('<div class="pcb-osc-area">');
  const right=html.indexOf('<div class="pcb-power-area">');
  const rom=html.indexOf('id="romDipGrid"');
  assert.ok(left>0 && right>left && rom>right,'left CR/right power must precede ROM');
  const power=html.slice(right,html.indexOf('            </section>',right));
  const led=power.indexOf('id="boardPowerLed"');
  const labels=power.indexOf('class="pcb-switch-labels"');
  const toggle=power.indexOf('id="boardPowerSwitch"');
  assert.ok(led>=0 && led<toggle && toggle<labels,'pilot LED left, ON/OFF labels right of POWER switch');
  assert.match(lastRule('board-control-bay'),/grid-template-columns:minmax\(0,1\.4fr\) minmax\(0,\.8fr\)/);
});

test('CR oscillator CLK exits left without a directional arrow or mirrored silk',()=>{
  const a=html.indexOf('<svg class="pcb-osc-diagram"');
  const b=html.indexOf('</svg>',a);
  const svg=html.slice(a,b);
  assert.match(svg,/class="pcb-osc-mirrored" transform="translate\(220 0\) scale\(-1 1\)"/);
  assert.match(svg,/M165 45 H212/);
  assert.doesNotMatch(svg,/M36 45 l10 -6 M36 45 l10 6/);
  assert.ok(svg.indexOf('class="pcb-osc-silk-text"')>svg.indexOf('class="pcb-osc-mirrored"'));
  assert.doesNotMatch(svg,/<text[^>]*>CLK<\/text>/);
  assert.match(svg,/class="pcb-osc-lines pcb-osc-pulse"/);
  assert.match(svg,/M8 33 H15 V22 H25 V33 H35 V22 H45 V33 H55/);
  // The mirrored feedback path runs at x=72; the silk ends at x=55.
  assert.doesNotMatch(svg,/M8 33 H16 V22 H27 V33 H38 V22 H49 V33 H60 V22 H71 V33 H79/);
});

test('PCB power toggle runs and stops the CPU and CLK toggles precisely 2/10Hz',()=>{
  for(const source of [js,fs.readFileSync(path.join(root,'src/ui/app.ts'),'utf8')]){
    assert.match(source,/onPowerToggle\(\)\s*\{\s*if\s*\(powerOn\)\s*setPower\(false\);\s*else\s*run\(\);\s*\}/);
    assert.match(source,/onFrequencyToggle\(\)\s*\{\s*setBoardFrequency\(boardClockHz === 2 \? 10 : 2\);\s*\}/);
    assert.match(source,/function run\(\)\s*(?:: void)?\s*\{[\s\S]{0,120}?if\s*\(!powerOn\)\s*\{\s*setPower\(true\);/);
    assert.match(source,/function setPower\(on(?:\: boolean)?\)[\s\S]{0,1400}?powerOn = true;/);
    assert.match(source,/function setPower\(on(?:\: boolean)?\)[\s\S]{0,1700}?startClock\(false\);/);
    assert.match(source,/function setBoardFrequency\(frequency(?:\: 2 \| 10)?\)[\s\S]{0,300}?boardClockHz = frequency;/);
    assert.match(source,/function setBoardFrequency\(frequency(?:\: 2 \| 10)?\)[\s\S]{0,300}?restartRunningClock\(\)/);
  }
  for(const source of [boardJs,fs.readFileSync(path.join(root,'src/ui/board.ts'),'utf8')]){
    assert.match(source,/powerSwitch\.classList\.toggle\('is-on', powerOn\)/);
    assert.match(source,/pilot\.classList\.toggle\('is-on', powerOn\)/);
    assert.match(source,/frequencySwitch\.classList\.toggle\('is-ten-hz', boardClockHz === 10\)/);
    assert.match(source,/onPowerToggle/);
    assert.match(source,/onFrequencyToggle/);
  }
});

test('power OFF hides the highlighted ROM module without losing ROM bits',()=>{
  for(const source of [boardJs,fs.readFileSync(path.join(root,'src/ui/board.ts'),'utf8')]){
    assert.match(source,/cell\.classList\.toggle\('is-current',\s*selected && powerOn\)/);
    assert.match(source,/lamp\.classList\.toggle\('is-on',\s*selected && powerOn\)/);
    assert.match(source,/cell\.querySelector[^\n]*'\.rom-slot-value'[^\n]*textContent/);
  }
  for(const source of [js,fs.readFileSync(path.join(root,'src/ui/app.ts'),'utf8')]){
    const start=source.indexOf('function setPower(');
    const end=source.indexOf('function setBoardFrequency(',start);
    assert.ok(start>=0&&end>start);
    const power=source.slice(start,end);
    assert.match(power,/powerOn = false;/);
    assert.match(power,/cpu\.reset\(\)/);
    assert.match(power,/renderCPU\(\)/);
    assert.match(power,/powerOn = true;/);
    assert.match(power,/startClock\(false\)/);
  }
});

test('no hidden clock dropdown, manual-step/reset bindings or duplicate CLK readout remain',()=>{
  for(const id of ['stepBtn','resetBtn','speed','boardOscReadout'])
    assert.doesNotMatch(html,new RegExp('id="'+id+'"'));
  assert.doesNotMatch(html,/1クロック|クロック速度|CLOCK · 2 Hz/);
  assert.match(html,/id="boardClockSwitch"/);
  assert.match(html,/10Hz<\/span><span>2Hz/);
  const foundation=fs.readFileSync(path.join(root,'assets/css/foundation.css'),'utf8');
  assert.match(foundation,/\.run-buttons\{display:grid;grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  for(const source of [js,fs.readFileSync(path.join(root,'src/ui/app.ts'),'utf8')]){
    assert.doesNotMatch(source,/stepBtn|resetBtn|boardOscReadout|actualClockHz|['"]speed['"]/);
    assert.doesNotMatch(source,/function step\(|function reset\(|clearPulseTimer/);
  }
  for(const source of [boardJs,fs.readFileSync(path.join(root,'src/ui/board.ts'),'utf8')]){
    assert.doesNotMatch(source,/boardOscReadout|actualClockHz|PANEL OVERRIDE/);
  }
});

test('clock lever maps lower position to 2Hz and upper to 10Hz',()=>{
  assert.match(html, /<span>10Hz<\/span><span>2Hz<\/span>/);
  const cssSource=fs.readFileSync(path.join(root,'assets/css/circuit-board.css'),'utf8');
  assert.match(cssSource,/\.pcb-clock-switch:not\(\.is-ten-hz\) \.pcb-toggle-lever\{top:auto;bottom:7px/);
  for(const source of [js,fs.readFileSync(path.join(root,'src/ui/app.ts'),'utf8')]){
    assert.match(source,/let boardClockHz(?:\s*:\s*2\s*\|\s*10)? = 2/);
  }
  for(const source of [boardJs,fs.readFileSync(path.join(root,'src/ui/board.ts'),'utf8')]){
    assert.match(source,/frequencySwitch\.classList\.toggle\('is-ten-hz', boardClockHz === 10\)/);
  }
});

test('power controls have no footer silk and unused lower padding is compact',()=>{
  assert.doesNotMatch(html,/MAIN SWITCH|pcb-silk-note/);
  const cssSource=fs.readFileSync(path.join(root,'assets/css/circuit-board.css'),'utf8');
  assert.doesNotMatch(cssSource,/\.pcb-silk-note/);
  assert.match(lastRule('pcb-power-area,.pcb-osc-area'),/padding:6px 8px 5px/);
  assert.match(lastRule('pcb-power-hardware'),/margin:7px 0 0/);
  assert.match(lastRule('pcb-osc-diagram'),/height:88px/);
  assert.doesNotMatch(lastRule('board-control-bay'),/min-height:226px/);
});

test('VCC supply pins lose their red glow only when PCB POWER is OFF',()=>{
  const cssSource=fs.readFileSync(path.join(root,'assets/css/circuit-board.css'),'utf8');
  const on=cssSource.match(/\.ic-footprint \.ic-leg\[data-pin-role="vcc"\]:before\s*\{([^}]*)\}/);
  const off=cssSource.match(/\.schematic-board\.is-powered-off \.ic-footprint \.ic-leg\[data-pin-role="vcc"\]:before\s*\{([^}]*)\}/);
  assert.ok(on&&off,'powered and unpowered supply-pin styles are both required');
  assert.match(on[1],/background:linear-gradient\(90deg,#ff9292,#e7474d\)/);
  assert.match(off[1],/box-shadow:none/);
  assert.doesNotMatch(off[1],/#e7474d|#ff9292/);
  for(const source of [boardJs,fs.readFileSync(path.join(root,'src/ui/board.ts'),'utf8')]){
    assert.match(source,/board\.classList\.toggle\('is-powered-off', !powerOn\)/);
    assert.match(source,/physicalPin\.name === 'VCC'/);
  }
});

test('power-on displays 0x00 until the first scheduled clock',()=>{
  for(const source of [js,fs.readFileSync(path.join(root,'src/ui/app.ts'),'utf8')]){
    const begin=source.indexOf('function setPower(');
    const end=source.indexOf('function setBoardFrequency(',begin);
    assert.ok(begin>0&&end>begin,'power lifecycle must exist');
    const body=source.slice(begin,end);
    assert.match(body,/powerOn = true;/);
    assert.match(body,/cpu\.reset\(\);/);
    assert.match(body,/renderCPU\(\)/);
    assert.match(body,/startClock\(false\);/);
    assert.doesNotMatch(body,/startClock\(true\)/);
    assert.match(source,/if\s*\(immediate\)\s*risingEdge\(\)/);
    assert.match(source,/intervalId = setInterval\(/);
  }
});

test('both board ROM slots and PROGRAM ROM addresses use 0x prefix',()=>{
  for(const source of [boardJs,fs.readFileSync(path.join(root,'src/ui/board.ts'),'utf8'),
                       js,fs.readFileSync(path.join(root,'src/ui/app.ts'),'utf8')]){
    assert.match(source,/address\.textContent\s*=/);
    assert.ok(source.includes('0x'+'$'+'{HEX(addr)}'),'ROM label must use 0x before the hex address');
  }
});

test('two 74HC14 Schmitt gates form a closed RC oscillator with CLK output',()=>{
  const start=html.indexOf('<svg class="pcb-osc-diagram"');
  const stop=html.indexOf('</svg>',start);
  assert.ok(start>0&&stop>start);
  const svg=html.slice(start,stop);
  assert.match(svg,/M25 45 H45 M87 45 H124 M165 45 H212/);
  assert.match(svg,/M45 31 V59 L77 45 Z/);
  assert.match(svg,/<circle cx="82" cy="45" r="5"\/>/);
  assert.match(svg,/M124 31 V59 L155 45 Z/);
  assert.match(svg,/<circle cx="160" cy="45" r="5"\/>/);
  assert.match(svg,/M107 45 V10 H102 M60 10 H25 V45/);
  assert.match(svg,/M25 45 V75 H104 M110 75 H198 V45/);
  assert.match(svg,/M104 64 V86 M110 64 V86/);
  assert.match(svg,/class="pcb-osc-junctions"/);
  for (const x of [25,107,198])
    assert.match(svg,new RegExp('<circle cx="'+x+'" cy="45" r="3(?:\\.5)?"\\/>'));
  // No line crosses an inversion bubble, and the capacitor breaks direct nets.
  assert.doesNotMatch(svg,/M76 45 H124|M154 45 H198|M25 75 H198/);
  assert.doesNotMatch(svg,/<text[^>]*>CLK<\/text>/);
  assert.match(svg,/class="pcb-osc-lines pcb-osc-pulse"/);
  assert.match(svg,/M8 33 H15 V22 H25 V33 H35 V22 H45 V33 H55/);
});

test('power ON, power OFF and one dynamic CPU stop/run button represent three states',()=>{
  const header=html.slice(html.indexOf('<section class="runbar"'),html.indexOf('id="schematicViewport"'));
  assert.match(header,/id="powerOnBtn"[^>]*>電源ON<\/button>/);
  assert.match(header,/id="powerOffBtn" disabled>電源OFF<\/button>/);
  assert.match(header,/id="runPauseBtn"[^>]*disabled[^>]*>[\s\S]*id="runPauseLabel">実行<\/span>/);
  assert.match(html,/id="runStatus" aria-live="polite"/);
  const foundation=fs.readFileSync(path.join(root,'assets/css/foundation.css'),'utf8');
  assert.match(foundation,/\.connection\.is-powered-on:not\(\.running\) \.status-dot/);
  for(const source of [js,fs.readFileSync(path.join(root,'src/ui/app.ts'),'utf8')]){
    assert.match(source,/const running = powerOn && intervalId !== null/);
    assert.match(source,/\('powerOnBtn'\)\.disabled = powerOn/);
    assert.match(source,/\('powerOffBtn'\)\.disabled = !powerOn/);
    assert.match(source,/toggle\.disabled = !powerOn/);
    assert.match(source,/if \(intervalId === null\)\s*run\(\)/);
    assert.match(source,/else\s*stop\(\)/);
    assert.match(source,/\('runPauseLabel'\)\.textContent = running \? '停止' : '実行'/);
    assert.match(source,/running \? 'CPUを停止する' : 'CPUを実行する'/);
    assert.match(source,/!powerOn \? '電源OFF' : running \? '電源ON · 実行中' : '電源ON · CPU停止中'/);
  }
});

test('ROM edits and breakpoints pause CPU without shutting off the PCB power',()=>{
  for(const source of [js,fs.readFileSync(path.join(root,'src/ui/app.ts'),'utf8')]){
    const stopStart=source.indexOf('function stop(');
    const stopEnd=source.indexOf('function risingEdge(',stopStart);
    const stopBody=source.slice(stopStart,stopEnd);
    assert.match(stopBody,/clearInterval\(intervalId\)/);
    assert.match(stopBody,/setClockLow\(\)/);
    assert.doesNotMatch(stopBody,/powerOn = false|setPower\(false\)/);
    assert.match(source,/onRomBitToggle\(addr, bit\)\s*\{\s*stop\(\)/);
    assert.match(source,/button\.addEventListener\('click', \(\) => \{\s*stop\(\);\s*cpu\.rom\[addr\]/);
    assert.match(source,/if \(breakpoints\.has\(cpu\.pc\)\)\s*\{\s*stop\(/);
    assert.match(source,/\('runPauseBtn'\)\.addEventListener\('click', toggleRunPause\)/);
    assert.match(source,/\('powerOffBtn'\)\.addEventListener\('click', \(\) => setPower\(false\)\)/);
    assert.match(source,/event\.preventDefault\(\);\s*stop\(\);\s*return;/);
  }
});

test('header POWER ON and OFF buttons use green and red styles without recoloring CPU run/pause',()=>{
  assert.match(html,/class="btn btn-power-on" id="powerOnBtn">電源ON<\/button>/);
  assert.match(html,/class="btn btn-power-off" id="powerOffBtn" disabled>電源OFF<\/button>/);
  assert.match(html,/class="btn btn-primary" id="runPauseBtn"/);
  const workbench=fs.readFileSync(path.join(root,'assets/css/workbench.css'),'utf8');
  assert.match(workbench,/\.board-panel \.run-buttons \.btn-power-on\{background:#1f945b;border-color:#177a49;color:#fff\}/);
  assert.match(workbench,/\.board-panel \.run-buttons \.btn-power-off\{background:#cc4646;border-color:#b83232;color:#fff\}/);
  assert.match(workbench,/\.btn-power-on:not\(:disabled\):hover\{background:#167a47/);
  assert.match(workbench,/\.btn-power-off:not\(:disabled\):hover\{background:#b93636/);
});


test('waveform capture policy remains internal and defaults to live oscilloscope mode',()=>{
  assert.doesNotMatch(html,/id="waveCaptureMode"|id="scopeCaptureMode"/);
  for (const source of [js,fs.readFileSync(path.join(root,'src/ui/app.ts'),'utf8')]){
    assert.match(source,/let waveCaptureMode(?:: WaveCaptureMode)? = 'oscilloscope'/);
    assert.match(source,/const OSCILLOSCOPE_SAMPLE_INTERVAL_MS = 20/);
    assert.match(source,/const OSCILLOSCOPE_RENDER_INTERVAL_MS = 40/);
    assert.match(source,/function setWaveCaptureMode\(/);
    assert.match(source,/window\.TD4WaveCapture = \{/);
    assert.match(source,/function recordSignals\(trigger(?:: WaveSampleTrigger)? = 'clock'\)[\s\S]*?shouldCaptureSample\(waveCaptureMode, powerOn, intervalId !== null, trigger\)/);
    assert.match(source,/function restartWaveCapture\(\)[\s\S]*?shouldCaptureSample\(waveCaptureMode, powerOn, intervalId !== null, trigger\)/);
    assert.doesNotMatch(source,/if \(powerOn\) appendSample\(waveSamples, levels, MAX_WAVE_SAMPLES\)/);
  }
});

test('oscilloscope mode uses a separate timer across pause and cleans up at power-off',()=>{
  for (const source of [js,fs.readFileSync(path.join(root,'src/ui/app.ts'),'utf8')]){
    const begin=source.indexOf('function startScopeCapture(');
    const end=source.indexOf('function setWaveCaptureMode(',begin);
    assert.ok(begin>0&&end>begin,'scope timer lifecycle should exist');
    const scope=source.slice(begin,end);
    assert.match(scope,/if \(!powerOn \|\| waveCaptureMode !== 'oscilloscope'\)/);
    assert.match(scope,/scopeCaptureIntervalId = setInterval\(/);
    assert.match(scope,/shouldCaptureSample\(waveCaptureMode, powerOn, intervalId !== null, 'timer'\)/);
    assert.match(scope,/appendSample\(waveSamples, levels, MAX_WAVE_SAMPLES\)/);
    const powerBegin=source.indexOf('function setPower(');
    const powerEnd=source.indexOf('function setBoardFrequency(',powerBegin);
    const power=source.slice(powerBegin,powerEnd);
    assert.match(power,/stopScopeCapture\(\)/);
    assert.match(power,/startScopeCapture\(\)/);
    assert.match(source,/window\.addEventListener\('pagehide',[\s\S]*?stopScopeCapture\(\)/);
    const stopBegin=source.indexOf('function stop(');
    const stopEnd=source.indexOf('function risingEdge(',stopBegin);
    assert.doesNotMatch(source.slice(stopBegin,stopEnd),/stopScopeCapture\(\)/);
  }
});

test('oscilloscope INPUT changes are sampled instantly even with CPU timer paused',()=>{
  for(const source of [js,fs.readFileSync(path.join(root,'src/ui/app.ts'),'utf8')]){
    assert.match(source,/onInputBitToggle\(bit\)\s*\{[\s\S]{0,200}?cpu\.setInput[\s\S]{0,140}?recordSignals\('input'\)/);
    assert.match(source,/function recordSignals\(trigger(?:: WaveSampleTrigger)? = 'clock'\)/);
    assert.match(source,/shouldCaptureSample\(waveCaptureMode, powerOn, intervalId !== null, trigger\)/);
    const stopStart=source.indexOf('function stop(');
    const stopEnd=source.indexOf('function risingEdge(',stopStart);
    assert.doesNotMatch(source.slice(stopStart,stopEnd),/stopScopeCapture\(\)/);
    const timerStart=source.indexOf('function startScopeCapture(');
    const timerEnd=source.indexOf('function setWaveCaptureMode(',timerStart);
    assert.match(source.slice(timerStart,timerEnd),/scopeCaptureIntervalId = setInterval\(/);
  }
});


test('oscilloscope sampling is fast enough for 10Hz while CPU clock remains 2Hz or 10Hz',()=>{
  for(const source of [js,fs.readFileSync(path.join(root,'src/ui/app.ts'),'utf8')]){
    assert.match(source,/const OSCILLOSCOPE_SAMPLE_INTERVAL_MS = 20/);
    assert.match(source,/const OSCILLOSCOPE_RENDER_INTERVAL_MS = 40/);
    assert.match(source,/const halfPeriod = 500 \/ boardClockHz/);
    const start=source.indexOf('function startScopeCapture(');
    const end=source.indexOf('function setWaveCaptureMode(',start);
    const body=source.slice(start,end);
    assert.match(body,/appendSample\(waveSamples, levels, MAX_WAVE_SAMPLES\)/);
    assert.match(body,/now - lastWaveDrawAt >= OSCILLOSCOPE_RENDER_INTERVAL_MS/);
    assert.match(body,/renderWaveforms\(levels\)/);
    assert.match(body,/}, OSCILLOSCOPE_SAMPLE_INTERVAL_MS\)/);
  }
});


test('PCB functional-area silk contains only English headings and no Japanese descriptions',()=>{
  const expected=['ROM / FETCH','MUX / ALU','REGISTERS','CLOCK / CONTROL'];
  for(const source of [boardJs,fs.readFileSync(path.join(root,'src/ui/board.ts'),'utf8')]){
    const begin=source.indexOf('const roleAreas = [');
    const end=source.indexOf('];',begin);
    assert.ok(begin>=0 && end>begin,'role area headings must be present');
    const headings=source.slice(begin,end+2);
    for(const title of expected)assert.match(headings,new RegExp("title:\\s*'"+title+"'"),title);
    assert.doesNotMatch(headings,/[\u3040-\u30ff\u3400-\u9fff]/,'PCB headings must not include Japanese characters');
    assert.doesNotMatch(headings,/subtitle:/);
    assert.doesNotMatch(source,/role\.subtitle/);
    assert.doesNotMatch(source,/head\.append\(label,\s*description\)/);
    assert.match(source,/head\.append\(label\)/);
  }
  assert.doesNotMatch(css,/\.ic-role-head span\{/);
  assert.doesNotMatch(css,/\.ic-role-fetch \.ic-role-head span\{/);
});

test('CR R/C silk avoids traces while remaining visible inside enlarged SVG viewBox',()=>{
  const start=html.indexOf('<svg class="pcb-osc-diagram"');
  const end=html.indexOf('</svg>',start);
  assert.ok(start>0 && end>start);
  const svg=html.slice(start,end);
  assert.match(svg,/viewBox="0 -7 220 99"/);
  assert.match(svg,/class="pcb-osc-silk-text"><text x="147" y="1">R<\/text><text x="122" y="67">C<\/text>/);
  assert.doesNotMatch(svg,/<text x="130" y="3">R<\/text>|<text x="196" y="65">C<\/text>/);
  // R is above the resistor at y=5..15, and C sits between the two gates.
  // With mirrored coordinates, the capacitor plates appear at x=110 and x=116.
});

test('CR feedback branches have filled junction dots independent of the open inverter bubbles',()=>{
  const styles=fs.readFileSync(path.join(root,'assets/css/circuit-board.css'),'utf8');
  assert.match(styles,/\.pcb-osc-junctions\{fill:#fff;stroke:none\}/);
  const start=html.indexOf('<svg class="pcb-osc-diagram"');
  const end=html.indexOf('</svg>',start);
  const svg=html.slice(start,end);
  const circleGroup=svg.match(/<g class="pcb-osc-junctions">([\s\S]*?)<\/g>/)?.[1] || '';
  assert.equal((circleGroup.match(/<circle /g)||[]).length,3);
  assert.match(circleGroup,/<circle cx="107" cy="45" r="3\.5"\/>/);
  assert.doesNotMatch(svg,/<g class="pcb-osc-lines"><path d="M36 45/);
});

test('IC reference silk is clear of DIP bodies and role blocks have vertical breathing room',()=>{
  const header=lastRule('ic-role-rack .ic-dip .ic-head');
  const footprint=lastRule('ic-role-rack .ic-dip .ic-footprint');
  const group=lastRule('ic-role-group');
  const fetch=lastRule('ic-role-fetch .ic-role-rack');
  assert.match(header,/height:\s*18px/,'chip reference header reserves clear vertical space');
  assert.match(footprint,/margin:\s*6px auto 0/,'DIP body sits below its reference text');
  assert.match(group,/padding:\s*9px 8px 15px/,'all IC role groups have larger top and bottom clearance');
  assert.match(fetch,/gap:\s*28px/,'HC154 and HC540 retain minimum separation');
  assert.match(fetch,/justify-content:\s*space-evenly/,'both ROM/FETCH chips spread vertically');
  assert.match(fetch,/flex:\s*1/,'ROM/FETCH rack fills the available block height');
  assert.match(lastRule('ic-role-fetch'),/display:\s*flex/);
  assert.match(lastRule('ic-role-fetch'),/flex-direction:\s*column/);
  assert.match(lastRule('ic-chip-grid'),/grid-template-rows:\s*auto auto auto/);
  assert.match(lastRule('ic-role-fetch'),/grid-row:\s*1 \/ span 3/);
});

test('IC reference silkscreen is legible without shrinking DIP clearance',()=>{
  const silk=lastRule('ic-role-rack .ic-dip .ic-head span');
  assert.match(silk,/font:\s*800 11px\/1\.2 ui-monospace,monospace/);
  assert.match(silk,/color:\s*#d3ead7/);
  assert.match(lastRule('ic-role-rack .ic-dip .ic-head'),/height:\s*18px/);
  assert.match(lastRule('ic-role-rack .ic-dip .ic-footprint'),/margin:\s*6px auto 0/);
});

test('PCB columns and vertical section spacing use a shared, balanced layout',()=>{
  const board=css.match(/\/\* PCB placement:[\s\S]*?\.schematic-board\s*\{([^}]*)\}/);
  assert.ok(board,'PCB placement block must exist');
  assert.match(board[1],/grid-template-columns:472px minmax\(0,1fr\)/);
  assert.match(board[1],/gap:14px/);
  assert.match(board[1],/padding:28px 24px/);
  assert.match(board[1],/align-items:stretch/);
  const columns=lastRule('ic-chip-grid');
  assert.match(columns,/grid-template-columns:minmax\(0,332px\) 126px/);
  assert.match(columns,/column-gap:14px/);
  assert.match(columns,/row-gap:28px/);
  assert.match(columns,/height:100%/);
  assert.match(columns,/align-content:space-between/);
  assert.match(lastRule('ic-zone'),/align-self:stretch/);
  // 332 + 126 + 14 = 472px, leaving exactly the same 14px
  // between the middle IC group and the right POWER / ROM column.
  assert.equal(332 + 126 + 14,472);
  const right=lastRule('rom-zone');
  assert.match(right,/flex-direction:column/);
  assert.match(right,/gap:28px/);
  assert.match(lastRule('schematic-io-strip'),/margin-top:0/);
});

test('IC detail renderer supports nested input/output probe columns',()=>{
  const source=fs.readFileSync(path.join(root,'src/ui/board.ts'),'utf8');
  assert.match(source,/section\.leftColumnBreak/);
  assert.match(source,/section\.rightColumnBreak/);
  assert.match(source,/ic-function-subcolumns/);
  assert.match(boardJs,/ic-function-subcolumns/);
  assert.match(lastRule('ic-detail-panel .ic-function-subcolumns'),/grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(lastRule('ic-detail-panel .ic-function-subcolumn'),/flex-direction:column/);
});

test('all four IC block headers share the same silk font and weight',()=>{
  const common=lastRule('ic-role-head strong');
  assert.match(common,/font:\s*800 11px\/1\.2 ui-monospace,monospace/);
  const roleSelectors=['control','alu','registers','fetch'];
  for(const role of roleSelectors){
    assert.doesNotMatch(css,new RegExp('\\.ic-role-'+role+' \\.ic-role-head strong\\s*\\{'),
      role+' must not override the common heading typography');
  }
  // The independent power/clock area is intentionally left at its original size.
  assert.match(lastRule('pcb-control-heading'),/font:\s*800 13px\/1\.2 ui-monospace,monospace/);
});

test('POWER / CLOCK remains without the redundant TD4 CONTROL CIRCUIT caption',()=>{
  assert.match(html,/<div class="pcb-control-heading">POWER \/ CLOCK<\/div>/);
  assert.doesNotMatch(html,/TD4 CONTROL CIRCUIT/);
  assert.doesNotMatch(css,/\.pcb-control-heading span\s*\{/);
});


test('all IC detail signals share the same box size, type, and spacing',()=>{
  const panel=css.match(/\.ic-detail-panel\s*\{([^}]*)\}/)?.[1];
  assert.ok(panel,'IC detail container exists');
  assert.match(panel,/--ic-detail-probe-width:112px/);
  assert.match(panel,/--ic-detail-probe-height:42px/);
  assert.match(panel,/--ic-detail-probe-gap:8px/);
  const shared=css.match(/\.ic-detail-panel \.ic-probe,\s*\.ic-detail-panel \.ic-probe-compact\s*\{([^}]*)\}/)?.[1];
  assert.ok(shared,'all signal cards must use one shared sizing rule');
  assert.match(shared,/flex:1 1 0/);
  assert.match(shared,/max-width:var\(--ic-detail-probe-width\)/);
  assert.match(shared,/min-height:var\(--ic-detail-probe-height\)/);
  assert.match(shared,/padding:8px 10px/);
  assert.match(shared,/font-size:12px/);
  assert.match(css,/\.ic-detail-panel \.ic-function-row\{min-height:var\(--ic-detail-probe-height\)/);
  assert.match(css,/\.ic-detail-panel \.ic-function-column\{gap:var\(--ic-detail-probe-gap\)/);
  assert.match(css,/\.ic-detail-panel \.ic-function-subcolumn\{[^}]*gap:var\(--ic-detail-probe-gap\)/);
  assert.match(css,/\.ic-detail-panel \.ic-function-section:only-child\{grid-column:1 \/ -1\}/);
  assert.doesNotMatch(css,/\.ic-detail-panel\[data-chip="U13"\] \.ic-probe-compact\s*\{/);
});

test('uniform detail styles do not change IC-specific probe arrangements',()=>{
  require('../assets/js/data/netlist.js');
  const {chips,layout}=require('../assets/js/core/ic-circuit.js');
  assert.equal(chips.length,13);
  const hc154=layout(chips.find(c=>c.type==='74HC154')).sections[0];
  assert.deepEqual(hc154.right.map(row=>row.map(pin=>pin.name)),[
    ['Y0#','Y1#','Y2#','Y3#'],
    ['Y4#','Y5#','Y6#','Y7#'],
    ['Y8#','Y9#','YA#','YB#'],
    ['YC#','YD#','YE#','YF#']
  ]);
  const hc540=layout(chips.find(c=>c.type==='74HC540')).sections[0];
  assert.deepEqual(hc540.left.map(row=>row.map(pin=>pin.name)),[
    ['A0','A4'],['A1','A5'],['A2','A6'],['A3','A7']
  ]);
  assert.deepEqual(hc540.right.map(row=>row.map(pin=>pin.name)),[
    ['Y0','Y4'],['Y1','Y5'],['Y2','Y6'],['Y3','Y7']
  ]);
  for(const c of chips.filter(c=>c.type==='74HC153')){
    const sections=layout(c).sections;
    assert.equal(sections.length,2);
    for(const section of sections)assert.equal(section.leftColumnBreak,2);
  }
  for(const [type,expected] of [['74HC32',4],['74HC10',3]])
    assert.equal(layout(chips.find(c=>c.type===type)).sections.length,expected);
  assert.equal(layout(chips.find(c=>c.type==='74HC283')).sections[0].rightColumnBreak,4);
});

test('IC Escape closes details before the running-CPU Escape fallback',()=>{
  for(const source of [js,fs.readFileSync(path.join(root,'src/ui/app.ts'),'utf8')]){
    const keyHandler=source.slice(source.indexOf("document.addEventListener('keydown', event =>"));
    const close=keyHandler.indexOf("if (event.key === 'Escape')");
    const detail=keyHandler.indexOf("if (!detail.hidden && detail.dataset.chip)");
    const toggle=keyHandler.indexOf("toggleIcDetails(detail.dataset.chip)");
    const fallback=keyHandler.indexOf("if (intervalId !== null)");
    assert.ok(close>=0&&detail>close&&toggle>detail&&fallback>toggle,
      'Escape must close open detail before stopping the CPU');
    assert.match(keyHandler,/event\.preventDefault\(\);\s*toggleIcDetails\(detail\.dataset\.chip\);\s*return;/);
    assert.match(source,/\.ic-open-details'\)\?\.focus\(\{\s*preventScroll:\s*true\s*\}\)/,
      'closing IC details returns focus to the originating IC');
    assert.match(source,/close\.focus\(\{\s*preventScroll:\s*true\s*\}\)/,
      'opening IC details focuses its close control');
  }
});

test('Space toggles CPU run/pause without editing or button-keyboard conflicts',()=>{
  for(const source of [js,fs.readFileSync(path.join(root,'src/ui/app.ts'),'utf8')]){
    const keyHandler=source.slice(source.indexOf("document.addEventListener('keydown', event =>"));
    assert.match(keyHandler,/event\.key === ' '/,'use normal Space keyboard key');
    assert.match(keyHandler,/!event\.isComposing/);
    assert.match(keyHandler,/!event\.ctrlKey && !event\.metaKey && !event\.altKey/);
    assert.match(keyHandler,/event\.target instanceof HTMLElement/);
    assert.match(keyHandler,/event\.target\.closest\('input, textarea, select, button, a\[href\], summary, \[contenteditable\], \[role="button"\]'\)/);
    assert.match(keyHandler,/powerOn\)\s*\{\s*event\.preventDefault\(\);\s*if \(!event\.repeat\)\s*toggleRunPause\(\)/,
      'Space should toggle only with power on, ignoring held-key repeats');
    assert.match(source,/function toggleRunPause\(\)\s*(?:: void)?\s*\{[\s\S]*?if \(intervalId === null\) run\(\);\s*else stop\(\);/,
      'shortcut reuses existing run/pause lifecycle');
  }
});
