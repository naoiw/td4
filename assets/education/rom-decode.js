/* Education ROM and instruction decode explorer.
 * All displayed logical nets use the same TD4 CPU and IC probe implementations
 * as the Emulator. ROM_RAW is the bitwise-inverted instruction bus in this
 * idealized model, not a simulation of switch/diode electrical behavior.
 */
(function () {
  'use strict';

  const core = typeof module === 'object' && module.exports
    ? require('../js/core/td4-core.js')
    : window.TD4;
  const circuit = typeof module === 'object' && module.exports
    ? require('../js/core/ic-circuit.js')
    : window.TD4Circuit;

  function exampleROM() {
    return core.assemble('MOV A, 15\nADD A, 1\nJNC 5\nOUT 15\nJMP 0\nOUT 0\nJMP 0').rom;
  }

  function inspect(rom, pc, previousCarry) {
    if (!Number.isInteger(pc) || pc < 0 || pc > 15) throw new RangeError('PC must be 0–15');
    if (previousCarry !== 0 && previousCarry !== 1) throw new RangeError('C must be 0 or 1');
    const cpu = new core.CPU(rom);
    cpu.pc = pc;
    cpu.carry = previousCarry;
    // Fixed operands make the ALU path reproducible for every selected byte.
    cpu.a = 5;
    cpu.b = 3;
    cpu.setInput(10);
    const byte = cpu.rom[pc];
    const signals = circuit.levels(cpu, false);
    const alu = core.decodeALU(byte, cpu.a, cpu.b, cpu.input);
    const step = cpu.step();
    const source = ['A', 'B', 'IN', '0'][(alu.selectB << 1) | alu.selectA];
    return {
      pc, byte, previousCarry, raw:(~byte) & 0xFF,
      opcode:byte >>> 4, immediate:byte & 15, asm:core.disassemble(byte),
      standard:core.isStandard(byte),
      romSelect:Array.from({length:16}, (_,address) => signals['ROM_SEL_' + address]),
      romRawBits:Array.from({length:8}, (_,bit) => signals['ROM_RAW' + bit]),
      instructionBits:Array.from({length:8}, (_,bit) => signals['D' + bit]),
      source, sourceValue:alu.source, sum:alu.sum, result:alu.result,
      carryOut:alu.carry, nextCarry:cpu.carry,
      selectA:signals.SEL_A, selectB:signals.SEL_B,
      controls:{
        LOAD_A_N:signals.LOAD_A_N,
        LOAD_B_N:signals.LOAD_B_N,
        LOAD_OUT_N:signals.LOAD_OUT_N,
        LOAD_PC_N:signals.LOAD_PC_N
      },
      pcAfter:step.pcAfter, branchTaken:step.branchTaken,
      destination:step.destination, aAfter:cpu.a, bAfter:cpu.b, outAfter:cpu.out
    };
  }

  const hex = (n,width=2) => n.toString(16).toUpperCase().padStart(width,'0');
  const binary = (n,width) => n.toString(2).padStart(width,'0');
  const hl = bit => bit ? 'H (1)' : 'L (0)';

  function initialize() {
    const root = document.getElementById('rom-decode-lab');
    if (!root) return;
    const pcSelect = root.querySelector('#rom-address-select');
    const byteInput = root.querySelector('#rom-byte-input');
    const carrySelect = root.querySelector('#rom-carry-select');
    const error = root.querySelector('#rom-byte-error');
    if (!pcSelect || !byteInput || !carrySelect || !error) return;
    const rom = exampleROM();

    function value(name, content) {
      root.querySelectorAll('[data-rom-value="' + name + '"]').forEach(el => { el.textContent = String(content); });
    }

    function render() {
      const pc = Number(pcSelect.value);
      const carry = Number(carrySelect.value);
      const current = inspect(rom,pc,carry);
      byteInput.value = hex(current.byte);
      error.hidden = true;
      value('pc',hex(pc,1));
      value('selectedRow','Y' + hex(pc,1) + '# = L (0)');
      value('byte','0x' + hex(current.byte));
      value('romRaw',binary(current.raw,8));
      value('bus',binary(current.byte,8));
      value('opcode',binary(current.opcode,4));
      value('immediate',binary(current.immediate,4));
      value('asm',current.asm);
      value('standard',current.standard ? '標準TD4命令' : '非標準 opcode / 即値の組合せ');
      value('selA',hl(current.selectA));
      value('selB',hl(current.selectB));
      value('source',current.source + ' = ' + current.sourceValue);
      value('calculation',current.sourceValue + ' + ' + current.immediate + ' = ' + current.sum);
      value('result',binary(current.result,4) + ' (' + current.result + ')');
      value('carryOut',current.carryOut);
      value('oldCarry',current.previousCarry);
      value('nextCarry',current.nextCarry);
      value('pcAfter','0x' + hex(current.pcAfter,1));
      value('branch',current.destination === 'PC'
        ? current.branchTaken ? 'PC ← ALU値（分岐成立）' : 'PC ← PC + 1（分岐不成立）'
        : current.destination + ' ← ALU値、PC ← PC + 1');
      for (const [net,level] of Object.entries(current.controls)) {
        value(net,hl(level));
        root.querySelectorAll('[data-rom-control="' + net + '"]').forEach(el=>{
          el.classList.toggle('is-low',level===0);
          el.classList.toggle('is-high',level===1);
        });
      }
      root.querySelectorAll('[data-rom-selector]').forEach(el=>{
        const address=Number(el.getAttribute('data-rom-selector'));
        const selected=address===pc;
        el.classList.toggle('is-selected',selected);
        el.textContent='Y' + hex(address,1) + '# ' + (selected ? 'L' : 'H');
      });
      root.querySelectorAll('[data-rom-row]').forEach(row=>{
        const address=Number(row.getAttribute('data-rom-row'));
        const selected=address===pc;
        const byte=rom[address];
        row.classList.toggle('is-selected',selected);
        const button=row.querySelector('button[data-rom-goto]');
        if (button) button.setAttribute('aria-pressed',String(selected));
        const bits=row.querySelector('[data-rom-row-bits]');
        const code=row.querySelector('[data-rom-row-byte]');
        const asm=row.querySelector('[data-rom-row-asm]');
        if(bits) bits.textContent=binary(byte,8);
        if(code) code.textContent='0x' + hex(byte);
        if(asm) asm.textContent=core.disassemble(byte);
      });
      root.querySelectorAll('[data-rom-bit]').forEach(el=>{
        const bit=Number(el.getAttribute('data-rom-bit'));
        const logical=current.instructionBits[bit];
        const raw=current.romRawBits[bit];
        const rawElement=el.querySelector('[data-rom-raw-bit]');
        const instructionElement=el.querySelector('[data-rom-instruction-bit]');
        if(rawElement) rawElement.textContent=String(raw);
        if(instructionElement) instructionElement.textContent=String(logical);
      });
    }

    pcSelect.addEventListener('change',render);
    carrySelect.addEventListener('change',render);
    byteInput.addEventListener('change',()=>{
      const text=byteInput.value.trim();
      if(!/^[0-9a-fA-F]{2}$/.test(text)){
        error.hidden=false;
        return;
      }
      rom[Number(pcSelect.value)]=parseInt(text,16);
      render();
    });
    root.querySelectorAll('[data-rom-goto]').forEach(button=>{
      button.addEventListener('click',()=>{
        pcSelect.value=button.getAttribute('data-rom-goto');
        render();
      });
    });
    render();
  }

  if (typeof module === 'object' && module.exports) module.exports = {exampleROM,inspect};
  if (typeof document !== 'undefined') {
    if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',initialize,{once:true});
    else initialize();
  }
})();
