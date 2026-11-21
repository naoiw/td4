/* Digital signal snapshots for a TD4 instruction-level logic analyzer.
 * Clock is modeled as a two-phase level; state updates at the rising edge.
 * These levels are ideal logic values, NOT 74HC propagation-delay waveforms.
 */
(function (root: typeof globalThis, factory: () => TD4SignalsApi) {
  const exported = factory();
  if (typeof module === 'object' && module.exports) module.exports = exported;
  else (root as typeof globalThis & {TD4Signals: TD4SignalsApi}).TD4Signals = exported;
})(globalThis, function (): TD4SignalsApi {
  'use strict';

  const GROUPS: SignalGroups = Object.freeze({
    basic: ['CLK', 'C', 'IN0', 'OUT0', 'A0', 'B0', 'PC0', 'D0'],
    io: ['CLK', 'IN3', 'IN2', 'IN1', 'IN0', 'OUT3', 'OUT2', 'OUT1', 'OUT0'],
    registers: ['CLK', 'C', 'A3', 'A2', 'A1', 'A0', 'B3', 'B2', 'B1', 'B0'],
    pc: ['CLK', 'C', 'PC3', 'PC2', 'PC1', 'PC0', 'ALU3', 'ALU2', 'ALU1', 'ALU0'],
    rom: ['CLK', 'D7', 'D6', 'D5', 'D4', 'D3', 'D2', 'D1', 'D0']
  });
  const bit = (n: number, i: number): BinaryLevel => ((n >> i) & 1) as BinaryLevel;

  function preview(cpu: CpuState): ALUPreview {
    const byte = cpu.rom[cpu.pc];
    const opcode = byte >> 4;
    const imm = byte & 15;
    const selectA = ((opcode >> 3) & 1) | (opcode & 1);
    const selectB = (opcode >> 1) & 1;
    const source = [cpu.a, cpu.b, cpu.input, 0][(selectB << 1) | selectA];
    const sum = source + imm;
    return {byte, source, imm, sum, result:sum & 15, carry:Number(sum > 15)};
  }

  function snapshot(cpu: CpuState, clockHigh: boolean | number): SignalLevels {
    const result: SignalLevels = {CLK:Number(Boolean(clockHigh)) as BinaryLevel, C:cpu.carry as BinaryLevel};
    const p = preview(cpu);
    for (let i = 0; i < 4; i++) {
      result['IN' + i] = bit(cpu.input,i);
      result['OUT' + i] = bit(cpu.out,i);
      result['A' + i] = bit(cpu.a,i);
      result['B' + i] = bit(cpu.b,i);
      result['PC' + i] = bit(cpu.pc,i);
      result['ALU' + i] = bit(p.result,i);
    }
    for (let i = 0; i < 8; i++) result['D' + i] = bit(p.byte,i);
    return result;
  }

  /** CPU capture follows clock activity; oscilloscope capture follows an independent timer. */
  function shouldCaptureSample(mode: WaveCaptureMode, powerOn: boolean, cpuRunning: boolean, source: WaveSampleTrigger): boolean {
    if (!powerOn) return false;
    return mode === 'cpu' ? cpuRunning && source !== 'timer' : source === 'timer' || source === 'input';
  }

  // Each sample represents one observed level, normally one clock half-cycle.
  function appendSample(samples: SignalLevels[], sample: SignalLevels, capacity = 80): SignalLevels[] {
    samples.push(sample);
    if(samples.length > capacity) samples.splice(0, samples.length - capacity);
    return samples;
  }

  // Staircase transitions: hold old level until a new sampling instant.
  function waveformPath(samples: readonly SignalLevels[], signal: string, width = 640, height = 36, capacity = 80): string {
    if (!samples.length) return '';
    const step = width / Math.max(1, capacity - 1);
    const startX = width - (samples.length - 1) * step;
    const y = (value: number): number => value ? 7 : height - 7;
    const fmt = (value: number): number => Math.round(value * 100) / 100;
    let path = `M ${fmt(startX)} ${y(samples[0][signal])}`;
    for (let i = 1; i < samples.length; i++) {
      const x = fmt(startX + i * step);
      path += ` H ${x} V ${y(samples[i][signal])}`;
    }
    return `${path} H ${width}`;
  }

  return { GROUPS, preview, snapshot, appendSample, waveformPath, shouldCaptureSample };
});
