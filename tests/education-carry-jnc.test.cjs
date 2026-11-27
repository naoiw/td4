'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {scenarios, createRunner} = require('../assets/education/carry-jnc.js');
const {CPU, assemble} = require('../assets/js/core/td4-core.js');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'assets/education/index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'assets/css/education.css'), 'utf8');

test('five scenarios are short, unique, valid TD4 ROM programs', () => {
  assert.equal(scenarios.length, 5);
  assert.equal(new Set(scenarios.map(s=>s.id)).size, 5);
  for(const scenario of scenarios) {
    const {count,rom} = assemble(scenario.program);
    assert.ok(count <= 16, scenario.id + ' length');
    assert.equal(rom.length,16);
    assert.ok(scenario.steps > 0 && scenario.steps <= count);
    assert.ok(html.includes('<option value="' + scenario.id + '">'));
  }
  assert.throws(() => createRunner('unknown'),RangeError);
});

test('trace matches CPU registers, old carry, new carry and branch decision', () => {
  for(const scenario of scenarios) {
    const runner = createRunner(scenario.id);
    const expected = new CPU(assemble(scenario.program).rom);
    for(let i=0;i<scenario.steps;i++) {
      const before = {pc:expected.pc,carry:expected.carry};
      const step = expected.step();
      const row = runner.next();
      assert.equal(row.pcBefore,before.pc,scenario.id + ' PC-before');
      assert.equal(row.asm,step.asm,scenario.id + ' ASM');
      assert.equal(row.carryBefore,before.carry,scenario.id + ' old C');
      assert.equal(row.cout,step.carryAfter,scenario.id + ' COUT');
      assert.equal(row.carryAfter,expected.carry,scenario.id + ' new C');
      assert.equal(row.sum,step.sum,scenario.id + ' ALU');
      assert.equal(row.result,step.result,scenario.id + ' 4bit result');
      assert.equal(row.pcAfter,expected.pc,scenario.id + ' PC-after');
      assert.equal(row.aAfter,expected.a,scenario.id + ' A-after');
      assert.equal(row.bAfter,expected.b,scenario.id + ' B-after');
      assert.equal(row.outAfter,expected.out,scenario.id + ' OUT-after');
      assert.equal(row.branchTaken,step.branchTaken,scenario.id + ' branch taken');
      if(row.isJnc) {
        assert.equal(row.loadPcN,step.branchTaken?0:1,scenario.id + ' active-low LOAD_PC_N');
        assert.equal(row.cout,0,scenario.id + ' standard JNC resets C');
      }
    }
    assert.equal(runner.history.length,scenario.steps,scenario.id + ' step count');
  }
});

test('old-C conditions and intervening instructions give different JNC outcomes', () => {
  const sample = id => {
    const r=createRunner(id);
    for(let i=0;i<r.scenario.steps;i++) r.next();
    return r.history;
  };
  const noCarry=sample('no-overflow');
  assert.equal(noCarry[1].sum,15);
  assert.equal(noCarry[1].cout,0);
  assert.equal(noCarry[2].carryBefore,0);
  assert.equal(noCarry[2].branchTaken,true);
  assert.equal(noCarry[2].pcAfter,5);
  assert.equal(noCarry[2].loadPcN,0);

  const overflow=sample('overflow');
  assert.equal(overflow[1].sum,16);
  assert.equal(overflow[1].result,0);
  assert.equal(overflow[1].carryAfter,1);
  assert.equal(overflow[2].carryBefore,1);
  assert.equal(overflow[2].branchTaken,false);
  assert.equal(overflow[2].pcAfter,3);
  assert.equal(overflow[2].loadPcN,1);
  assert.equal(overflow[2].carryAfter,0);
  assert.equal(overflow[3].outAfter,15);

  for(const id of ['intervening-mov','intervening-add']) {
    const rows=sample(id);
    assert.equal(rows[1].carryAfter,1);
    assert.equal(rows[2].carryBefore,1);
    assert.equal(rows[2].carryAfter,0,id + ' resets C before JNC');
    assert.equal(rows[3].carryBefore,0);
    assert.equal(rows[3].branchTaken,true);
    assert.equal(rows[3].pcAfter,6);
  }
  const repeated=sample('repeat-jnc');
  assert.equal(repeated[2].carryBefore,1);
  assert.equal(repeated[2].branchTaken,false);
  assert.equal(repeated[2].carryAfter,0);
  assert.equal(repeated[3].carryBefore,0);
  assert.equal(repeated[3].branchTaken,true);
  assert.equal(repeated[3].pcAfter,6);
});

test('carry learning UI provides linked materials and state trace', () => {
  assert.match(html, /href="#carry-jnc"/);
  assert.match(html, /<section class="panel edu-section" id="carry-jnc">/);
  assert.match(html, /src="\.\.\/js\/core\/td4-core\.js" defer/);
  assert.match(html, /src="carry-jnc\.js" defer/);
  assert.ok(html.indexOf('src="../js/core/td4-core.js"') < html.indexOf('src="carry-jnc.js"'));
  for(const id of ['carry-lab','carry-scenario','carry-next','carry-reset','carry-history-body','carry-step-summary','carry-jnc-condition']) {
    assert.ok(html.includes('id="' + id + '"'),id);
  }
  for(const id of ['old','cout','new','pc','decision']) {
    assert.ok(html.includes('data-carry-value="' + id + '"'),id);
  }
  assert.match(html,/href="#ic-74hc74"/);
  assert.match(html,/href="#datapath"/);
  assert.match(html,/href="#sequential"/);
  assert.match(html,/aria-live="polite"/);
  assert.match(css,/\.edu-carry-states\{/);
  assert.match(css,/\.edu-carry-history\{/);
});
