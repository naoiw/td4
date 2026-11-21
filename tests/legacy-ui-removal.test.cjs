const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const ts = fs.readFileSync(path.join(root, 'src/ui/app.ts'), 'utf8');
const js = fs.readFileSync(path.join(root, 'assets/js/ui/app.js'), 'utf8');

test('header and footer omit the four requested labels', () => {
  for (const label of ['8-BIT INSTRUCTION', '16-BYTE ROM', 'TD4 4-BIT CPU LAB',
    'ローカル実行対応 · バックエンド不要']) {
    assert.ok(!html.includes(label), label + ' must not be displayed');
  }
  assert.match(html, /id="runStatus"/);
});

test('obsolete CPU overview is removed while active PCB and analyzer remain', () => {
  assert.doesNotMatch(html, /従来のCPU機能ブロック図を表示|overview-collapse|id="pcbBoard"/);
  assert.match(html, /id="schematicBoard"/);
  assert.match(html, /id="icDetailPanel"/);
  assert.match(html, /id="romDipGrid"/);
  assert.doesNotMatch(html, /id="liveSignals"/);
  assert.match(html, /id="scopeView"/);
});

test('app and generated JS no longer update deleted legacy DOM elements', () => {
  for (const source of [ts, js]) {
    for (const obsolete of ['renderBits(', 'renderRegister(', 'renderOutputs(', 'renderSwitches(',
      'renderWireLevels(', "'fetchState'", "'clockLamp'", "'inputSwitches'", "'outputLeds'"]) {
      assert.ok(!source.includes(obsolete), obsolete + ' should not be referenced');
    }
    assert.match(source, /TD4BoardView\.render\(/);
    assert.match(source, /TD4BoardView\.mount\(/);
  }
});

test('obsolete signal badge strip and 74HC disclaimer are removed', () => {
  assert.doesNotMatch(html, /live-signals|schematic-caution|74HC系列の部品構成と論理接続/);
  assert.doesNotMatch(html, /board-notes|schematic-explain|HIGH 1|LOW 0|アドレス選択中/);
  assert.doesNotMatch(html, /id="selectedNetName"|id="selectedNetLevel"|id="resetNetBtn"/);
  assert.match(html, /id="scopeView"/, 'logic analyzer remains available');
  for (const source of [ts, js]) {
    assert.doesNotMatch(source, /renderLiveSignals|liveSignals/);
    assert.match(source, /renderWaveforms\(levels\)/);
  }
});

test('PCB heading is minimal while interactive net tracking still works', () => {
  assert.match(html, /HARDWARE WORKBENCH/);
  assert.match(html, /id="boardTitle"/);
  assert.doesNotMatch(html, /4-BIT \/ 16 BYTE ROM|実ICロジック・ROM基板|ICを押すと基板の下に大きな詳細が開きます/);
  assert.doesNotMatch(html, /追跡中|CLKに戻す|ic-toolbar|ic-probe-control/);
  const boardTs = fs.readFileSync(path.join(root, 'src/ui/board.ts'), 'utf8');
  const boardJs = fs.readFileSync(path.join(root, 'assets/js/ui/board.js'), 'utf8');
  for (const source of [ts, js, boardTs, boardJs]) {
    assert.doesNotMatch(source, /resetNetBtn|selectedNetName|selectedNetLevel/);
  }
  assert.match(ts, /function setSelectedNet\(net:string\):void/);
  assert.match(ts, /setSelectedNet\('CLK'\)/, 'initial tracking defaults to CLK');
  assert.match(boardTs, /setSelectedNet\(pin\.net\)/, 'functional pin click can select a net');
  assert.match(boardTs, /setSelectedNet\(`ROM_SEL_\$\{addr\}`\)/, 'ROM address selection remains');
  assert.match(boardTs, /setSelectedNet\(`OUT\$\{bit\}`\)/, 'output selection remains');
  assert.match(boardTs, /classList\.toggle\('net-selected'/, 'selected signal highlighting remains');
  assert.match(boardTs, /function drawWires\(options: BoardRenderOptions\)/);
});

test('PROGRAM ROM and PROGRAM EDITOR keep headings without redundant top-right tags', () => {
  assert.match(html, /<p class="eyebrow">PROGRAM ROM<\/p><h2 id="romTitle">16バイト ROM<\/h2>/);
  assert.match(html, /<p class="eyebrow">PROGRAM EDITOR<\/p><h2 id="editorTitle">プログラムを書く<\/h2>/);
  assert.doesNotMatch(html, /<span class="panel-tag">16 × 8-BIT<\/span>/);
  assert.doesNotMatch(html, /<span class="panel-tag">ASSEMBLER<\/span>/);
  assert.match(html, /id="romRows"/);
  assert.match(html, /id="source"/);
});

test('board subtitle and analyzer H/L explanatory label are removed', () => {
  assert.doesNotMatch(html, /スイッチを動かし、LEDと信号の変化を観察する|board-subtitle/);
  assert.doesNotMatch(html, /H = HIGH \(1\) \/ L = LOW \(0\)/);
  assert.match(html, /id="boardTitle"/);
  assert.match(html, /id="scopeView"/);
  assert.doesNotMatch(html, /id="sampleCount"|scope-footer/);
  const workbench = fs.readFileSync(path.join(root, 'assets/css/workbench.css'), 'utf8');
  assert.doesNotMatch(workbench, /board-subtitle/);
  assert.doesNotMatch(workbench, /scope-footer/);
});

test('logic analyzer groups the clear action with the signal selector', () => {
  assert.doesNotMatch(html, /立ち上がりでCPU状態を更新|id="sampleCount"|scope-footer|scope-meta/);
  const header = html.slice(html.indexOf('<section class="panel scope-panel"'), html.indexOf('id="scopeView"'));
  assert.match(header, /class="scope-controls"/);
  assert.ok(header.indexOf('id="signalGroup"') < header.indexOf('id="clearWaveBtn"'));
  assert.equal((html.match(/id="clearWaveBtn"/g) || []).length, 1);
  const css = fs.readFileSync(path.join(root, 'assets/css/workbench.css'), 'utf8');
  assert.match(css, /\.scope-controls\{display:flex;align-items:center/);
  assert.doesNotMatch(css, /scope-footer/);
  for (const source of [ts, js]) {
    assert.match(source, /\$\('clearWaveBtn'\)\.addEventListener\('click'/);
    assert.doesNotMatch(source, /sampleCount/);
    assert.match(source, /appendSample\(waveSamples, levels, MAX_WAVE_SAMPLES\)/);
  }
});

test('execution controls are inside workbench board, below its title', () => {
  const boardStart = html.indexOf('<section class="panel board-panel"');
  const heading = html.indexOf('id="boardTitle"', boardStart);
  const control = html.indexOf('<section class="runbar"', boardStart);
  const pcb = html.indexOf('id="schematicViewport"', boardStart);
  assert.ok(boardStart > 0 && heading > boardStart && control > heading && pcb > control);
  assert.equal((html.match(/class="runbar"/g) || []).length, 1);
  for (const id of ['runBtn', 'stopBtn', 'stepBtn', 'resetBtn', 'speed', 'cycles']) {
    assert.ok(html.indexOf('id="' + id + '"', control) > control);
    assert.ok(html.indexOf('id="' + id + '"', control) < pcb);
  }
  const workbench = fs.readFileSync(path.join(root, 'assets/css/workbench.css'), 'utf8');
  assert.match(workbench, /\.board-panel \.runbar\{margin:0 0 14px/);
});

test('ROM legend and breakpoint clear are above table, with help text removed', () => {
  const romStart = html.indexOf('<section class="panel rom-panel"');
  const legend = html.indexOf('class="rom-footer"', romStart);
  const table = html.indexOf('class="rom-table-wrap"', romStart);
  const panelEnd = html.indexOf('</section>', table);
  assert.ok(romStart > 0 && legend > romStart && table > legend && panelEnd > table);
  assert.ok(html.indexOf('id="clearBpBtn"', legend) < table);
  assert.match(html.slice(legend,table), /PC（次の命令）/);
  assert.match(html.slice(legend,table), /ブレークポイント/);
  assert.doesNotMatch(html, /rom-info|実行中の命令がハイライトされます。/);
  const css = fs.readFileSync(path.join(root, 'assets/css/workbench.css'), 'utf8');
  assert.match(css, /\.rom-panel \.rom-footer\{margin:0 0 11px/);
  assert.match(ts, /\$\('clearBpBtn'\)\.addEventListener\('click'/);
});

test('logic analyzer and execution trace match heights with ten visible waveform rows', () => {
  const groups = [...html.matchAll(/<option value="(basic|io|registers|pc|rom|alu)">([^<]+)<\/option>/g)];
  assert.deepEqual(groups.map(x => x[1]), ['basic', 'io', 'registers', 'pc', 'rom', 'alu']);
  assert.deepEqual(groups.slice(2).map(x => x[2]), ['レジスタ A/B', 'PC', 'ROM', 'ALU']);
  const workbench = fs.readFileSync(path.join(root,'assets/css/workbench.css'),'utf8');
  assert.match(workbench, /\.scope-layout\{[^}]*align-items:stretch/);
  assert.match(workbench, /\.scope-layout>\.panel\{height:550px\}/);
  assert.match(workbench, /\.scope-panel\{display:flex;flex-direction:column/);
  assert.match(workbench, /\.scope-view\{[^}]*min-height:412px[^}]*overflow:hidden/);
  assert.match(workbench, /\.scope-layout \.trace-panel ol\{[^}]*flex:1;min-height:0;max-height:none;overflow-y:auto/);
  assert.match(workbench, /\.scope-row\{[^}]*height:39px/);
  for (const source of [ts, js]) {
    assert.match(source, /for \(const signal of group\.slice\(0, 10\)\)/);
  }
});
