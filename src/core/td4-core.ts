/* TD4 4-bit CPU — instruction-level emulator, no external dependencies.
 * Hardware decoding, including unofficial opcodes, follows the original TD4's
 * 74HC153 mux, 4-bit adder, and destination decode. Apache License 2.0.
 */
(function (root: typeof globalThis, factory: () => TD4Api) {
  'use strict';
  const exported = factory();
  if (typeof module === 'object' && module.exports) module.exports = exported;
  else (root as typeof globalThis & {TD4: TD4Api}).TD4 = exported;
})(globalThis, function (): TD4Api {
  'use strict';

  const HEX = (n: number): string => n.toString(16).toUpperCase();
  const BINARY = (n: number, width: number): string => n.toString(2).padStart(width, '0');
  const STANDARD_OPCODES = new Set([0, 1, 2, 3, 4, 5, 6, 7, 9, 11, 14, 15]);

  function isStandard(byte: number): boolean {
    const op = byte >>> 4;
    return STANDARD_OPCODES.has(op) && (![1, 2, 4, 6, 9].includes(op) || (byte & 15) === 0);
  }

  function disassemble(byte: number): string {
    const op = byte >>> 4;
    const im = byte & 15;
    const n = HEX(im);
    switch (op) {
      case 0x0: return `ADD A, ${n}`;
      case 0x1: return im ? `MOV A, B+${n} *` : 'MOV A, B';
      case 0x2: return im ? `IN A +${n} *` : 'IN A';
      case 0x3: return `MOV A, ${n}`;
      case 0x4: return im ? `MOV B, A+${n} *` : 'MOV B, A';
      case 0x5: return `ADD B, ${n}`;
      case 0x6: return im ? `IN B +${n} *` : 'IN B';
      case 0x7: return `MOV B, ${n}`;
      case 0x8: return `OUT B+${n} *`;
      case 0x9: return im ? `OUT B+${n} *` : 'OUT B';
      case 0xA: return `OUT ${n} *`;
      case 0xB: return `OUT ${n}`;
      case 0xC: return `JNC B+${n} *`;
      case 0xD: return `JMP B+${n} *`;
      case 0xE: return `JNC ${n}`;
      case 0xF: return `JMP ${n}`;
      default: throw new Error('Invalid 8-bit instruction');
    }
  }

  /** Combinational ALU/MUX view shared by execution, probe logic and waveforms. */
  function decodeALU(byte: number, a: number, b: number, input: number): ALUPreview {
    const opcode = byte >>> 4;
    const imm = byte & 15;
    const selectA = (((opcode >>> 3) & 1) | (opcode & 1)) as BinaryLevel;
    const selectB = ((opcode >>> 1) & 1) as BinaryLevel;
    const source = [a, b, input, 0][(selectB << 1) | selectA];
    const sum = source + imm;
    return {byte, selectA, selectB, source, imm, sum, result: sum & 15, carry: Number(sum > 15)};
  }

  class CPU implements CpuState {
    a = 0;
    b = 0;
    out = 0;
    pc = 0;
    carry = 0;
    cycles = 0;
    input = 0;
    rom: number[] = [];
    lastStep: TD4Step | null = null;

    constructor(rom: readonly number[] | Uint8Array = new Array(16).fill(0)) {
      this.loadROM(rom);
      this.input = 0;
      this.reset();
    }

    loadROM(bytes: readonly number[] | Uint8Array): void {
      if (!Array.isArray(bytes) && !(bytes instanceof Uint8Array)) {
        throw new TypeError('ROM must be an array of 16 bytes');
      }
      if (bytes.length !== 16 || Array.from(bytes).some(v => !Number.isInteger(v) || v < 0 || v > 255)) {
        throw new RangeError('ROM requires exactly 16 values between 0 and 255');
      }
      this.rom = Array.from(bytes);
    }

    reset(): void {
      this.a = 0;
      this.b = 0;
      this.out = 0;
      this.pc = 0;
      this.carry = 0;
      this.cycles = 0;
      this.lastStep = null;
    }

    setInput(n: number): void {
      if (!Number.isInteger(n) || n < 0 || n > 15) throw new RangeError('IN must be a 4-bit integer');
      this.input = n;
    }

    step(): TD4Step {
      const pcBefore = this.pc;
      const instruction = this.rom[pcBefore];
      const opcode = instruction >>> 4;
      const {imm, source, sum, result, carry: nextCarry} = decodeALU(instruction, this.a, this.b, this.input);
      const oldCarry = this.carry;
      const destination = opcode >>> 2;
      let branchTaken = false;

      // A destination is chosen by the two most significant instruction bits.
      // For PC destinations: i4=1 => JMP, i4=0 => JNC (previous carry == 0).
      if (destination === 0) this.a = result;
      else if (destination === 1) this.b = result;
      else if (destination === 2) this.out = result;
      else {
        branchTaken = (opcode & 1) === 1 || oldCarry === 0;
        this.pc = branchTaken ? result : ((this.pc + 1) & 15);
      }
      if (destination !== 3) this.pc = (this.pc + 1) & 15;
      this.carry = nextCarry; // 74HC283 updates C even for MOV, IN, OUT, JMP, JNC.
      this.cycles = (this.cycles + 1) % 1000000;
      this.lastStep = {
        pc: pcBefore, byte: instruction, asm: disassemble(instruction),
        source, imm, sum, result, carryBefore: oldCarry,
        carryAfter: nextCarry, branchTaken, pcAfter: this.pc,
        destination: (['A', 'B', 'OUT', 'PC'] as const)[destination],
        standard: isStandard(instruction)
      };
      return this.lastStep!;
    }
  }

  function readNumber(raw: string, symbols: Record<string, number>, lineNo: number, max = 15): number {
    const token = raw.trim();
    const upper = token.toUpperCase();
    let number: number;
    if (/^0X[0-9A-F]+$/i.test(token)) number = parseInt(token.slice(2), 16);
    else if (/^\$[0-9A-F]+$/i.test(token)) number = parseInt(token.slice(1), 16);
    else if (/^0B[01]+$/i.test(token)) number = parseInt(token.slice(2), 2);
    else if (/^[0-9A-F]+H$/i.test(token)) number = parseInt(token.slice(0, -1), 16);
    else if (/^[0-9]+$/.test(token)) number = parseInt(token, 10);
    else if (Object.prototype.hasOwnProperty.call(symbols, upper)) number = symbols[upper];
    else if (/^[A-F]$/i.test(token)) number = parseInt(token, 16);
    else throw new Error(`${lineNo}行目: 数値またはラベルを解釈できません: ${token}`);
    if (!Number.isInteger(number) || number < 0 || number > max) {
      throw new Error(`${lineNo}行目: ${token} は 0〜${max} の範囲外です`);
    }
    return number;
  }

  function encodeInstruction(source: string, labels: Record<string, number>, lineNo: number): number {
    const s = source.trim();
    const line = s.toUpperCase().replace(/\s+/g, ' ');
    let m: RegExpMatchArray | null;
    if (/^[01]{8}$/.test(line)) return parseInt(line, 2);
    if (/^(?:0X)?[0-9A-F]{2}$/.test(line)) return parseInt(line.replace(/^0X/, ''), 16);
    if ((m = line.match(/^(?:DB|\.BYTE|BYTE)\s+(.+)$/))) {
      return readNumber(m[1], labels, lineNo, 255);
    }
    if ((m = line.match(/^MOV\s+([AB])\s*,\s*(.+)$/))) {
      const dest = m[1], src = m[2].trim();
      if (dest === 'A' && src === 'B') return 0x10;
      if (dest === 'B' && src === 'A') return 0x40;
      return (dest === 'A' ? 0x30 : 0x70) | readNumber(src, labels, lineNo);
    }
    if ((m = line.match(/^ADD\s+([AB])\s*,\s*(.+)$/))) {
      return (m[1] === 'A' ? 0x00 : 0x50) | readNumber(m[2], labels, lineNo);
    }
    if ((m = line.match(/^IN\s+([AB])$/))) return m[1] === 'A' ? 0x20 : 0x60;
    if ((m = line.match(/^OUT\s+(.+)$/))) {
      return m[1].trim() === 'B' ? 0x90 : 0xB0 | readNumber(m[1], labels, lineNo);
    }
    if ((m = line.match(/^(JMP|JNC)\s+(.+)$/))) {
      return (m[1] === 'JMP' ? 0xF0 : 0xE0) | readNumber(m[2], labels, lineNo);
    }
    throw new Error(`${lineNo}行目: 未対応の命令: ${s}`);
  }

  function assemble(source: string): AssemblyResult {
    if (typeof source !== 'string') throw new TypeError('Source must be text');
    const lines = source.split(/\r?\n/);
    const labels: Record<string, number> = Object.create(null);
    const instructions: {address: number; text: string; lineNo: number}[] = [];
    const used = new Set<number>();
    let address = 0;

    lines.forEach((rawLine, index) => {
      const lineNo = index + 1;
      let body = rawLine.replace(/;.*$/, '').replace(/\/\/.*$/, '').trim();
      if (!body) return;
      let match: RegExpMatchArray | null;
      while ((match = body.match(/^([A-Za-z_][A-Za-z_0-9]*):\s*/))) {
        const name = match[1].toUpperCase();
        if (Object.prototype.hasOwnProperty.call(labels, name)) throw new Error(`${lineNo}行目: 重複ラベル: ${name}`);
        if (address > 15) throw new Error(`${lineNo}行目: ラベルはROM範囲外です`);
        labels[name] = address;
        body = body.slice(match[0].length).trim();
      }
      if (!body) return;
      if ((match = body.match(/^\.?ORG\s+(.+)$/i))) {
        address = readNumber(match[1], labels, lineNo);
        return;
      }
      if (address > 15) throw new Error(`${lineNo}行目: ROMは16命令までです`);
      if (used.has(address)) throw new Error(`${lineNo}行目: アドレス ${HEX(address)} に命令が重複しています`);
      used.add(address);
      instructions.push({ address, text: body, lineNo });
      address += 1;
    });

    const rom = new Array(16).fill(0);
    for (const item of instructions) {
      rom[item.address] = encodeInstruction(item.text, labels, item.lineNo);
    }
    return { rom, labels, count: instructions.length };
  }

  function romToSource(rom: readonly number[]): string {
    if (rom.length !== 16) throw new RangeError('ROM must have 16 bytes');
    return rom.map((byte, addr) => `DB 0x${byte.toString(16).toUpperCase().padStart(2, '0')}  ; ${HEX(addr)} ${disassemble(byte)}`).join('\n');
  }

  return { CPU, assemble, disassemble, isStandard, romToSource, HEX, BINARY, decodeALU };
});
