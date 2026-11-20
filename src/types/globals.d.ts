/** Shared public interfaces for the 4-bit emulator and the no-bundler browser UI. */
type BinaryLevel = 0 | 1;
type SignalGroup = 'basic' | 'io' | 'registers' | 'rom';
type SignalLevels = Record<string, BinaryLevel>;
type SignalGroups = Readonly<Record<SignalGroup, readonly string[]>>;

interface TD4Step {
  pc: number;
  byte: number;
  asm: string;
  source: number;
  imm: number;
  sum: number;
  result: number;
  carryBefore: number;
  carryAfter: number;
  branchTaken: boolean;
  pcAfter: number;
  destination: 'A' | 'B' | 'OUT' | 'PC';
  standard: boolean;
}
interface CpuState {
  a: number;
  b: number;
  out: number;
  pc: number;
  carry: number;
  cycles: number;
  input: number;
  rom: number[];
  lastStep: TD4Step | null;
  loadROM(bytes: readonly number[] | Uint8Array): void;
  reset(): void;
  setInput(n: number): void;
  step(): TD4Step;
}
interface AssemblyResult {
  rom: number[];
  labels: Record<string, number>;
  count: number;
}
interface TD4Api {
  CPU: new (rom?: readonly number[] | Uint8Array) => CpuState;
  assemble(source: string): AssemblyResult;
  disassemble(byte: number): string;
  isStandard(byte: number): boolean;
  romToSource(rom: readonly number[]): string;
  HEX(n: number): string;
  BINARY(n: number, width: number): string;
}
interface ALUPreview {
  byte: number;
  source: number;
  imm: number;
  sum: number;
  result: number;
  carry: number;
}
interface TD4SignalsApi {
  GROUPS: SignalGroups;
  preview(cpu: CpuState): ALUPreview;
  snapshot(cpu: CpuState, clockHigh: boolean | number): SignalLevels;
  appendSample(samples: SignalLevels[], sample: SignalLevels, capacity?: number): SignalLevels[];
  waveformPath(samples: readonly SignalLevels[], signal: string, width?: number, height?: number, capacity?: number): string;
}
interface SampleProgram {
  id: string;
  icon: string;
  title: string;
  description: string;
  source: string;
}
interface Window {
  TD4: TD4Api;
  TD4Signals: TD4SignalsApi;
  TD4Samples: SampleProgram[];
}
declare const module: {exports?: unknown};

/** Named IC functional probes; not literal package pin numbers. */
interface IcPin { name: string; net: string }
interface IcSection {label?: string; left: IcPin[][]; right: IcPin[][]}
interface IcLayout {packagePins: number; leftLabel: string; rightLabel: string; sections: IcSection[]}
interface IcComponent {
  id: string;
  type: string;
  description: string;
  group: 'rom' | 'select' | 'decode' | 'register' | 'clock';
  pins: readonly IcPin[];
}
type IcLevels = Record<string, BinaryLevel>;
interface IcCircuitApi {
  chips: readonly IcComponent[];
  levels(cpu: CpuState, clock: boolean): IcLevels;
  layout(chip: IcComponent): IcLayout;
}
interface Window { TD4Circuit: IcCircuitApi }
