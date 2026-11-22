const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {CPU} = require('../assets/js/core/td4-core.js');

// Exercise the compiled app's actual clock-start function with a fake timer.
// Only its DOM/scope collaborators are stubbed; real TD4 instructions execute.
const js = fs.readFileSync(path.resolve(__dirname, '../assets/js/ui/app.js'), 'utf8');
const ts = fs.readFileSync(path.resolve(__dirname, '../src/ui/app.ts'), 'utf8');
const definition = js.match(/    function startClock\(immediate\) \{[\s\S]*?\n    \}/)?.[0];
assert.ok(definition, 'compiled startClock function can be isolated for execution');

function harness(rom, breakpointAddresses) {
  const cpu = new CPU([...rom, ...Array(16).fill(0)].slice(0, 16));
  const messages = [];
  const stops = [];
  let scheduledTick = null;
  let synced = 0;
  const context = {
    cpu,
    breakpoints: new Set(breakpointAddresses),
    powerOn: true,
    intervalId: null,
    clockHigh: false,
    boardClockHz: 2,
    HEX: value => value.toString(16).toUpperCase(),
    showMessage: message => messages.push(message),
    syncRunControls: () => { synced++; },
    setClockLow: () => { context.clockHigh = false; },
    setInterval(callback, delay) {
      assert.equal(delay, 250, '2Hz clock half-period is retained');
      scheduledTick = callback;
      return 19;
    },
    risingEdge() {
      context.clockHigh = true;
      cpu.step();
    },
    stop(reason) {
      stops.push(reason);
      context.intervalId = null;
      context.clockHigh = false;
    },
    renderCPU() {}
  };
  const startClock = vm.runInNewContext('(' + definition + ')', context);
  return {
    cpu,context,messages,stops,startClock,
    tick() {
      assert.equal(typeof scheduledTick, 'function', 'clock scheduled');
      scheduledTick();
    },
    get synced() {return synced;}
  };
}

test('resume runs stopped instruction once without clearing its breakpoint, then breaks on the next loop',()=>{
  // Execute OUT 1 at address 0, then JMP 0 at address 1.
  const h = harness([0xB1, 0xF0], [0]);

  // Initial power-on clock must still stop at a breakpoint without executing.
  h.startClock(false);
  assert.equal(h.context.intervalId,null);
  assert.equal(h.cpu.pc,0);
  assert.equal(h.cpu.cycles,0);
  assert.match(h.messages.at(-1),/実行でこの命令を1回進められます/);

  // Explicit Run resumes *at* address 0, without skipping its instruction.
  h.startClock(true);
  assert.equal(h.context.intervalId,19);
  assert.equal(h.cpu.pc,1);
  assert.equal(h.cpu.out,1,'the instruction at the breakpoint executed');
  assert.equal(h.cpu.cycles,1);
  assert.equal(h.context.breakpoints.has(0),true,'breakpoint remains set');

  h.tick(); // CLK falling edge
  assert.equal(h.cpu.cycles,1);
  h.tick(); // CLK rising edge: JMP 0
  assert.equal(h.cpu.pc,0);
  assert.equal(h.cpu.cycles,2);
  h.tick(); // CLK falling edge
  h.tick(); // next CLK rising edge sees original BP at 0
  assert.equal(h.context.intervalId,null,'stopped again at original breakpoint');
  assert.equal(h.cpu.pc,0);
  assert.equal(h.cpu.cycles,2,'breakpoint stops BEFORE another instruction executes');
  assert.equal(h.context.breakpoints.has(0),true);
  assert.match(h.stops.at(-1),/ブレークポイントで停止しました/);
  assert.ok(h.synced>=2);

  // Run can be pressed repeatedly without deleting the breakpoint.
  h.startClock(true);
  assert.equal(h.cpu.pc,1);
  assert.equal(h.cpu.cycles,3);
  assert.equal(h.context.breakpoints.size,1);
});

test('resume suppresses only the current address breakpoint, not another address',()=>{
  const h = harness([0xB1,0xF0],[0,1]);
  h.startClock(true);
  assert.equal(h.cpu.pc,1);
  assert.equal(h.cpu.cycles,1);
  h.tick(); // falling edge
  h.tick(); // next address has a different breakpoint
  assert.equal(h.cpu.pc,1);
  assert.equal(h.cpu.cycles,1);
  assert.equal(h.context.intervalId,null);
  assert.equal(h.context.breakpoints.size,2);
});

test('breakpoint bypass is limited to an explicit resume and does not power on the CPU',()=>{
  const h = harness([0xB1],[0]);
  h.context.powerOn=false;
  h.startClock(true);
  assert.equal(h.cpu.cycles,0);
  assert.equal(h.context.intervalId,null);
  h.context.powerOn=true;
  h.startClock(false);
  assert.equal(h.cpu.cycles,0);
  assert.equal(h.context.intervalId,null);
  for(const source of [ts,js]){
    assert.match(source,/if \(!immediate && breakpoints\.has\(cpu\.pc\)\)/,
      'only a user-triggered immediate start may pass its existing BP');
    assert.match(source,/if \(breakpoints\.has\(cpu\.pc\)\)\s*\{\s*stop\(/,
      'scheduled rising edges still honor breakpoints');
    assert.match(source,/function run\(\)\s*(?:: void)?\s*\{[\s\S]*?startClock\(true\)/,
      'existing board/ROM/Space run action uses immediate resume');
  }
});
