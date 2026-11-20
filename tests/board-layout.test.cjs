const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const css=fs.readFileSync(path.join(root,'assets/css/style.css'),'utf8');
const js=fs.readFileSync(path.join(root,'assets/js/ui/app.js'),'utf8');
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
  assert.match(js,/for\s*\(let addr\s*=\s*0;\s*addr\s*<\s*16/);
});

test('8 switches per ROM address are vertically arranged',()=>{
  assert.match(lastRule('rom-dip-switches'),/flex-direction:\s*column/);
  assert.match(lastRule('rom-dip'),/flex-direction:\s*row/);
  assert.match(lastRule('rom-dip'),/flex:\s*0 0 15px/);
  assert.match(js,/footer\.textContent\s*=\s*'D7 ↓ D0'/);
});

test('Input and Output panels are horizontal beneath the ROM',()=>{
  assert.match(lastRule('schematic-io-strip'),/grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/);
  assert.ok(html.indexOf('id="romDipGrid"')<html.indexOf('class="schematic-io-strip"'));
});

test('four grouped DIP IC areas remain on left side of board',()=>{
  assert.match(lastRule('schematic-board'),/grid-template-columns:\s*410px\s+minmax\(0,\s*1fr\)/);
  assert.match(lastRule('ic-chip-grid'),/grid-template-columns:\s*minmax\(0,\s*1fr\)/);
  for(const role of ['fetch','alu','registers','control'])
    assert.match(js,new RegExp("key:\\s*'"+role+"'"));
  assert.match(css,/\.ic-role-rack>\.ic-chip\s*\{[^}]*border:0/);
});

test('IC detail is outside board and large enough to inspect H/L probes',()=>{
  const boardEnd=html.indexOf('</div>\n      </div>\n      <section id="icDetailPanel"');
  assert.ok(boardEnd>0,'external detail section must follow schematic-scroll');
  assert.match(js,/function toggleIcDetails\(chipId\)/);
  assert.match(js,/host\.append\(head,\s*pins\)/);
  assert.match(js,/oldCard\.append\(oldPins\)/);
  assert.match(lastRule('ic-detail-panel'),/padding:\s*20px 24px 24px/);
  assert.match(css,/\.ic-detail-panel \.ic-functional-layout\s*\{[^}]*grid-template-columns:\s*repeat\(2/);
});

test('IC physical pins, net coloring and click toggles are preserved',()=>{
  assert.match(css,/\.ic-footprint \.ic-leg\.is-high:before/);
  assert.match(css,/\.ic-footprint \.ic-leg\.is-low:before/);
  assert.match(js,/physicalPins\[pinNumber - 1\]/);
  assert.match(js,/document\.querySelectorAll\('\.ic-probe'\)/);
  assert.match(js,/chipToggle\.addEventListener\('click'/);
  assert.match(js,/pinList\.hidden\s*=\s*true/);
});
