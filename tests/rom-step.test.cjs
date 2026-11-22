const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const source = fs.readFileSync(path.join(root, 'src/ui/app.ts'), 'utf8');
const compiled = fs.readFileSync(path.join(root, 'assets/js/ui/app.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'assets/css/workbench.css'), 'utf8');
const {CPU} = require('../assets/js/core/td4-core.js');

test('PROGRAM ROM STEP is next to RUN and starts disabled', () => {
  const section = html.slice(html.indexOf('<section class="panel rom-panel"'), html.indexOf('<section class="panel editor-panel"'));
  const header = section.slice(0, section.indexOf('<div class="rom-footer">'));
  assert.match(header, /class="rom-execution-controls"/);
  assert.match(header, /id="romRunPauseBtn" disabled/);
  assert.match(header, /id="romStepBtn" disabled/);
  assert.ok(header.indexOf('id="romRunPauseBtn"') < header.indexOf('id="romStepBtn"'));
  assert.match(css, /\.rom-execution-controls\{display:flex/);
  for (const app of [source, compiled]) {
    assert.match(app, /\('romStepBtn'\)\.addEventListener\('click', stepInstruction\)/);
    assert.match(app, /\('romStepBtn'\)\.disabled = !powerOn \|\| running/);
  }
});

test('manual STEP shares the normal rising-edge logic and records a full CLK pulse', () => {
  for (const app of [source, compiled]) {
    const start = app.indexOf('function stepInstruction(');
    const end = app.indexOf('function startClock(', start);
    assert.ok(start !== -1 && end > start, 'standalone manual STEP handler');
    const body = app.slice(start, end);
    assert.match(body, /if \(!powerOn \|\| intervalId !== null\)/);
    assert.match(body, /risingEdge\(\)/);
    assert.match(body, /setClockLow\(\)/);
    assert.match(body, /stepInProgress = true/);
    assert.match(body, /stepInProgress = false/);
    assert.doesNotMatch(body, /startClock\(|setInterval\(|breakpoints\.(?:delete|clear)/);
    assert.match(app, /\(stepInProgress && powerOn\) \|\| shouldCaptureSample/);
    assert.match(app, /function risingEdge\(/);
    assert.match(app, /const outcome = cpu\.step\(\)/);
  }
});

/** Exercise the real browser handler with an instrumented CPU and clock controls. */
function harness({powerOn = true, running = false, rom = new Array(16).fill(0), pc = 0, carry = 0, breakpoints = []} = {}) {
  const cpu = new CPU(rom);
  cpu.pc = pc;
  cpu.carry = carry;
  const marked = new Set(breakpoints);
  const events = [];
  const trace = [];
  const begin = compiled.indexOf('    function stepInstruction()');
  const end = compiled.indexOf('    function startClock(', begin);
  assert.ok(begin > -1 && end > begin);
  const context = {
    powerOn, intervalId: running ? 777 : null, stepInProgress: false, clockHigh: false,
    setClockLow() {
      this.clockHigh = false;
      events.push('L');
    },
    risingEdge() {
      this.clockHigh = true;
      events.push('H');
      trace.push(cpu.step());
    }
  };
  // The UI handler references lexical functions, not a browser DOM.
  // Wrap the instrumented primitives in lexical bindings for the sandbox.
  const run = vm.runInNewContext(`
    const setClockLow = () => { clockHigh = false; events.push('L'); };
    const risingEdge = () => { clockHigh = true; events.push('H'); trace.push(cpu.step()); };
    ${compiled.slice(begin, end)}
    stepInstruction;
  `, {
    powerOn, intervalId: context.intervalId, stepInProgress: false, clockHigh: false,
    events, trace, cpu
  });
  return {cpu, marked, events, trace, click: run};
}

test('paused CPU executes exactly one instruction per STEP while preserving breakpoints', () => {
  const rom = new Array(16).fill(0);
  rom[0] = 0x75; // MOV B,5
  rom[1] = 0x90; // OUT B
  const h = harness({rom, breakpoints:[0,1]});
  h.click();
  assert.equal(h.cpu.b, 5);
  assert.equal(h.cpu.pc, 1);
  assert.equal(h.cpu.out, 0);
  assert.equal(h.cpu.cycles, 1);
  assert.equal(h.trace.length, 1);
  assert.deepEqual(h.events, ['L','H','L']);
  h.click();
  assert.equal(h.cpu.out, 5);
  assert.equal(h.cpu.pc, 2);
  assert.equal(h.cpu.cycles, 2);
  assert.equal(h.trace.length, 2);
  assert.deepEqual([...h.marked], [0,1]);
});

test('STEP ignores clicks while power is OFF or automatic clock is running', () => {
  for (const options of [{powerOn:false}, {running:true}]) {
    const h = harness(options);
    h.click();
    assert.equal(h.cpu.cycles, 0);
    assert.equal(h.trace.length, 0);
    assert.equal(h.events.length, 0);
  }
});

test('STEP follows JNC carry condition and 0xF-to-0x0 wraparound', () => {
  const rom = new Array(16).fill(0);
  rom[0] = 0xE3; // JNC 3
  for (const [carry, expected] of [[0,3],[1,1]]) {
    const h = harness({rom, carry});
    h.click();
    assert.equal(h.cpu.pc, expected, 'JNC tested with previous carry '+carry);
  }
  rom[15] = 0xBF; // OUT F, then PC wraps to 0
  const wrap = harness({rom, pc:15});
  wrap.click();
  assert.equal(wrap.cpu.pc, 0);
  assert.equal(wrap.cpu.out, 15);
  assert.equal(wrap.cpu.cycles, 1);
});

test('ROM edits are used on the very next STEP, including after a breakpoint', () => {
  const rom = new Array(16).fill(0);
  rom[0] = 0xB2;
  const h = harness({rom, breakpoints:[0]});
  h.cpu.rom[0] = 0xB9;
  h.click();
  assert.equal(h.cpu.out, 9);
  assert.equal(h.cpu.pc, 1);
  assert.ok(h.marked.has(0), 'STEP never clears breakpoints');
});

test('HARDWARE WORKBENCH STEP uses the same handler and disabled state as PROGRAM ROM', () => {
  const board = html.slice(html.indexOf('<section class="panel board-panel"'), html.indexOf('<div class="schematic-scroll"'));
  const rom = html.slice(html.indexOf('<section class="panel rom-panel"'), html.indexOf('<section class="panel editor-panel"'));
  assert.match(board, /id="boardStepBtn" disabled/);
  assert.match(rom, /id="romStepBtn" disabled/);
  assert.ok(board.indexOf('id="runPauseBtn"') < board.indexOf('id="boardStepBtn"'),
    'STEP appears directly to the right of WORKBENCH run/pause');
  for (const id of ['boardStepBtn', 'romStepBtn']) {
    const button = html.match(new RegExp('<button[^>]*id="' + id + '"[^>]*>[\\s\\S]*?<\\/button>'))?.[0];
    assert.ok(button, id + ' exists');
    assert.match(button, /class="btn rom-step-button"/);
    assert.match(button, /aria-label="現在のROM命令を1つ実行する"/);
    assert.match(button, /STEP <span aria-hidden="true">⏭<\\/span>/);
  }
  assert.match(css, /\\.rom-step-button\\{flex:none;background:#edf4fd/);
  for (const app of [source, compiled]) {
    for (const id of ['boardStepBtn', 'romStepBtn']) {
      assert.match(app, new RegExp("\\('" + id + "'\\)\\.addEventListener\\('click', stepInstruction\\)"));
      assert.match(app, new RegExp("\\('" + id + "'\\)\\.disabled = !powerOn \\|\\| running"));
    }
  }
});
