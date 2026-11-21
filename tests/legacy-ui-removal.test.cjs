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
