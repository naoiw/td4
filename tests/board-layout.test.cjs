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

test('board H/L and selected-net SVG renderers stay separate from CPU state',()=>{
  assert.match(js,/TD4BoardView\.render\(/);
  assert.match(js,/TD4BoardView\.drawWires\(/);
  assert.match(boardJs,/function render\(options\)/);
  assert.match(boardJs,/function drawWires\(options\)/);
  assert.match(boardJs,/drawWires\(options\)/);
  assert.match(boardJs,/classList\.toggle\('net-selected'/);
  assert.match(boardJs,/getBoundingClientRect\(\)/);
  assert.match(boardJs,/classList\.toggle\('is-high'/);
  assert.ok(!boardJs.includes('cpu.step('),'view layer must not execute instructions');
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
test('scaled board keeps signal wires aligned in logical SVG coordinates',()=>{
  for(const source of [boardJs,fs.readFileSync(path.join(root,'src/ui/board.ts'),'utf8')]){
    assert.match(source,/width\s*\/\s*bounds\.width/);
    assert.match(source,/height\s*\/\s*bounds\.height/);
    assert.match(source,/\*\s*scaleX/);
    assert.match(source,/\*\s*scaleY/);
    assert.match(source,/setAttribute\('viewBox'/);
    assert.match(source,/getBoundingClientRect\(\)/);
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
  assert.match(html,/class="pcb-osc-diagram" viewBox="0 0 220 92"/);
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

test('CR silk schematic points CLK to the left without mirroring readable text',()=>{
  const a=html.indexOf('<svg class="pcb-osc-diagram"');
  const b=html.indexOf('</svg>',a);
  const svg=html.slice(a,b);
  assert.match(svg,/class="pcb-osc-mirrored" transform="translate\(220 0\) scale\(-1 1\)"/);
  assert.match(svg,/M36 45 l10 -6 M36 45 l10 6/);
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

test('inverter CR feedback is closed and the output bubble has no wire through it',()=>{
  const start=html.indexOf('<svg class="pcb-osc-diagram"');
  const stop=html.indexOf('</svg>',start);
  assert.ok(start>0&&stop>start);
  const svg=html.slice(start,stop);
  assert.doesNotMatch(html,/<span>INVERTER<\/span>/);
  assert.doesNotMatch(svg,/>INV<\/text>/);
  // In unmirrored SVG coordinates, the input joins R and C at x40.
  assert.match(svg,/M40 45 H66 M119 45 H148 M148 45 V10 H125 M70 10 H40 V45/);
  assert.doesNotMatch(svg,/M12 45 H66|M108 45 H148/);
  // Triangle ends at x108, the inversion bubble occupies x109..119,
  // and the output starts exactly at its outer tangent (x119).
  assert.match(svg,/M66 27 V63 L108 45 Z/);
  assert.match(svg,/<circle cx="114" cy="45" r="5"\/>/);
  assert.match(svg,/M148 45 H184/);
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
