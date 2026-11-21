/** Shared public interfaces for the 4-bit emulator and the no-bundler browser UI. */
type BinaryLevel = 0 | 1;
type SignalGroup = 'basic' | 'io' | 'registers' | 'pc' | 'rom';
type SignalLevels = Record<string, BinaryLevel>;
type WaveCaptureMode = 'cpu' | 'oscilloscope';
type WaveSampleTrigger = 'clock' | 'timer' | 'input';
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
  decodeALU(byte: number, a: number, b: number, input: number): ALUPreview;
}
interface ALUPreview {
  byte: number;
  selectA: BinaryLevel;
  selectB: BinaryLevel;
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
  shouldCaptureSample(mode: WaveCaptureMode, powerOn: boolean, cpuRunning: boolean, source: WaveSampleTrigger): boolean;
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
  /** Internal capture-mode configuration. No additional control in the UI. */
  TD4WaveCapture: {
    getMode(): WaveCaptureMode;
    setMode(mode: WaveCaptureMode): void;
  };
  TD4Samples: SampleProgram[];
}
declare const module: {exports?: unknown};
declare function require(path: string): TD4Api;

/** Named IC functional probes; not literal package pin numbers. */
interface IcPin { name: string; net: string }
interface IcSection {label?: string; left: IcPin[][]; right: IcPin[][]}
interface IcLayout {packagePins: number; leftLabel: string; rightLabel: string; sections: IcSection[]}
interface IcPhysicalPin {number: number; name: string; net?: string}
type IcPackageType = '74HC154' | '74HC540' | '74HC161' | '74HC153' |
  '74HC283' | '74HC74' | '74HC32' | '74HC10' | '74HC14';
interface IcComponent {
  id: string;
  type: IcPackageType;
  description: string;
  group: 'rom' | 'select' | 'decode' | 'register' | 'clock';
  pins: readonly IcPin[];
}
type IcLevels = Record<string, BinaryLevel>;
interface IcCircuitApi {
  chips: readonly IcComponent[];
  levels(cpu: CpuState, clock: boolean): IcLevels;
  layout(chip: IcComponent): IcLayout;
  physicalPins(chip: IcComponent): IcPhysicalPin[];
}
interface Window { TD4Circuit: IcCircuitApi }

/** Stateless view builder. All mutations return through app-provided callbacks. */
interface BoardViewOptions {
  circuit: IcCircuitApi;
  HEX: (value: number) => string;
  toggleIcDetails(chipId: string): void;
  setSelectedNet(net: string): void;
  onRomBitToggle(address: number, bit: number): void;
  onInputBitToggle(bit: number): void;
  onPowerToggle(): void;
  onFrequencyToggle(): void;
}

interface BoardRenderOptions {
  circuit: IcCircuitApi;
  HEX: (value: number) => string;
  cpu: CpuState;
  clockHigh: boolean;
  selectedNet: string;
  powerOn: boolean;
  boardClockHz: 2 | 10;
}
interface BoardViewApi {
  mount(options: BoardViewOptions): void;
  render(options: BoardRenderOptions): void;
  drawWires(options: BoardRenderOptions): void;
}
interface Window { TD4BoardView: BoardViewApi }
