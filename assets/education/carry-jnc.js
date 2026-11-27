/* TD4 Education: carry/branch execution follows the shared CPU core. */
(function () {
  'use strict';

  const td4 = typeof module === 'object' && module.exports
    ? require('../js/core/td4-core.js') : window.TD4;

  // Keep these programs at or below the TD4's 16-byte ROM limit.
  const scenarios = Object.freeze([
    {
      id:'no-overflow', title:'桁あふれなし：JNC成立', description:'14 + 1 = 15。Cは0なのでJNCでskipへジャンプします。',
      program:'MOV A, 14\nADD A, 1\nJNC skip\nOUT 15\nJMP end\nskip: OUT 0\nend: JMP end',
      steps:3
    },
    {
      id:'overflow', title:'桁あふれ：JNC不成立', description:'15 + 1 = 16。4bit結果は0、Cが1になり、直後のJNCはジャンプしません。',
      program:'MOV A, 15\nADD A, 1\nJNC skip\nOUT 15\nJMP end\nskip: OUT 0\nend: JMP end',
      steps:4
    },
    {
      id:'intervening-mov', title:'MOVを挟む：Cが0に更新', description:'ADDで立ったCも、続くMOVで0に変わります。次のJNCは分岐成立。',
      program:'MOV A, 15\nADD A, 1\nMOV B, 2\nJNC skip\nOUT 15\nJMP end\nskip: OUT 0\nend: JMP end',
      steps:4
    },
    {
      id:'intervening-add', title:'ADDを挟む：別の加算で上書き', description:'ADD AでC=1になっても、ADD B,1が桁あふれしなければC=0へ変わります。',
      program:'MOV A, 15\nADD A, 1\nADD B, 1\nJNC skip\nOUT 15\nJMP end\nskip: OUT 0\nend: JMP end',
      steps:4
    },
    {
      id:'repeat-jnc', title:'JNCを2回：1回目の判定後にC=0', description:'旧C=1で最初のJNCは不成立。ただしその命令自身がCを0にするため、次のJNCは成立。',
      program:'MOV A, 15\nADD A, 1\nJNC skip\nJNC skip\nOUT 15\nJMP end\nskip: OUT 0\nend: JMP end',
      steps:4
    }
  ]);

  function createRunner(id) {
    const scenario = scenarios.find(item => item.id === id);
    if (!scenario) throw new RangeError('Unknown carry/JNC scenario');
    const assembled = td4.assemble(scenario.program);
    const cpu = new td4.CPU(assembled.rom);
    const history = [];
    return {
      scenario,
      history,
      cpu,
      next() {
        const before = {pc:cpu.pc, a:cpu.a, b:cpu.b, out:cpu.out, carry:cpu.carry};
        const step = cpu.step();
        const row = {
          pcBefore:before.pc, asm:step.asm, byte:step.byte,
          source:step.source, imm:step.imm, sum:step.sum, result:step.result,
          carryBefore:step.carryBefore, cout:step.carryAfter, carryAfter:cpu.carry,
          destination:step.destination,
          loadPcN:step.destination === 'PC' ? (step.branchTaken ? 0 : 1) : null,
          branchTaken:step.branchTaken,
          pcAfter:cpu.pc, aAfter:cpu.a, bAfter:cpu.b, outAfter:cpu.out,
          isJnc:(step.byte >>> 4) === 0xE
        };
        history.push(row);
        return row;
      }
    };
  }

  const hex = n => '0x' + n.toString(16).toUpperCase();
  const binary = n => n.toString(2).padStart(4,'0');

  function initialize() {
    const root = document.getElementById('carry-lab');
    if (!root) return;
    const select = root.querySelector('#carry-scenario');
    const nextButton = root.querySelector('#carry-next');
    const resetButton = root.querySelector('#carry-reset');
    const code = root.querySelector('#carry-source');
    const summary = root.querySelector('#carry-step-summary');
    const table = root.querySelector('#carry-history-body');
    if (!select || !nextButton || !resetButton || !code || !summary || !table) return;

    let runner;
    function setValue(name, value) {
      root.querySelectorAll('[data-carry-value="' + name + '"]').forEach(el => {
        el.textContent = String(value);
      });
    }
    function reset() {
      runner = createRunner(select.value);
      code.textContent = runner.scenario.program;
      summary.textContent = runner.scenario.description;
      while(table.firstChild) table.removeChild(table.firstChild);
      setValue('step','0');
      setValue('old','—');
      setValue('cout','—');
      setValue('new','0');
      setValue('pc','0x0');
      setValue('decision','命令を選び、STEPを押してください');
      nextButton.disabled = false;
    }
    function displayRow(row) {
      setValue('step',runner.history.length);
      setValue('old',row.carryBefore);
      setValue('cout',row.cout);
      setValue('new',row.carryAfter);
      setValue('pc',hex(row.pcAfter));
      const verdict = row.isJnc
        ? row.branchTaken ? '旧C=0 → JNC成立、PCへロード' : '旧C=1 → JNC不成立、PCを+1'
        : row.destination === 'PC' ? 'JMP：無条件分岐'
        : '通常命令：' + row.destination + 'を更新、PCを+1';
      setValue('decision',verdict);
      summary.textContent = hex(row.pcBefore) + ' ' + row.asm +
        ' ｜ MUX ' + row.source + ' + Im ' + row.imm +
        ' = ' + row.sum + ' → ALU ' + binary(row.result) +
        ' ｜ COUT=' + row.cout + '、C=' + row.carryAfter;
      const tr = document.createElement('tr');
      if(row.isJnc) tr.className = row.branchTaken ? 'carry-taken' : 'carry-skipped';
      const cells = [
        String(runner.history.length),hex(row.pcBefore),row.asm,
        row.source + '+' + row.imm + '=' + row.sum,
        String(row.carryBefore),String(row.cout),
        row.loadPcN === null ? '—' : String(row.loadPcN),
        hex(row.pcAfter),verdict
      ];
      cells.forEach((value,index)=>{
        const cell = document.createElement(index===0?'th':'td');
        if(index===0) cell.scope='row';
        cell.textContent=value;
        tr.appendChild(cell);
      });
      table.appendChild(tr);
      nextButton.disabled = runner.history.length >= runner.scenario.steps;
    }
    select.addEventListener('change',reset);
    resetButton.addEventListener('click',reset);
    nextButton.addEventListener('click',()=>{
      if(runner.history.length < runner.scenario.steps) displayRow(runner.next());
    });
    reset();
  }

  if(typeof module === 'object' && module.exports) module.exports = {scenarios,createRunner};
  if(typeof document !== 'undefined') {
    if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded',initialize,{once:true});
    else initialize();
  }
})();
