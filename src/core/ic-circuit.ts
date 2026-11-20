/* TD4 board-level logic probes. These are named *functional connections* of
 * the original 74HC architecture, not a physical KiCad netlist or package pinout.
 * #ROMn, #LOADn and /C are active LOW. They must not be confused with LEDs.
 */
(function (root: typeof globalThis, factory: () => IcCircuitApi) {
  const exported = factory();
  if (typeof module === 'object' && module.exports) module.exports = exported;
  else (root as typeof globalThis & {TD4Circuit: IcCircuitApi}).TD4Circuit = exported;
})(globalThis, function (): IcCircuitApi {
  'use strict';
  const bit = (value: number, i: number): BinaryLevel => ((value >> i) & 1) as BinaryLevel;
  const p = (name: string, net: string): IcPin => ({name, net});
  const nibble = (name: string, net: string): IcPin[] => [0,1,2,3].map(i => p(`${name}${i}`, `${net}${i}`));
  const byte = (name: string, net: string): IcPin[] => [0,1,2,3,4,5,6,7].map(i => p(`${name}${i}`, `${net}${i}`));

  const chips: IcComponent[] = [
    {id:'U13',type:'74HC154',description:'ROM address decoder / active-low',group:'rom',pins:[...nibble('A','PC'),...[...Array(16).keys()].map(i=>p(`Y${i.toString(16).toUpperCase()}#`,`ROM_SEL_${i}`))]},
    {id:'U12',type:'74HC540',description:'ROM inverting buffer / D0–D7',group:'rom',pins:[...byte('A','ROM_RAW'),...byte('Y','D'),p('OE#','OE_N')]},
    {id:'U7',type:'74HC153',description:'MUX low bits 0–1',group:'select',pins:[p('S0','SEL_A'),p('S1','SEL_B'),...nibble('A','A').slice(0,2),...nibble('B','B').slice(0,2),...nibble('IN','IN').slice(0,2),...nibble('Y','MUX').slice(0,2)]},
    {id:'U8',type:'74HC153',description:'MUX high bits 2–3',group:'select',pins:[p('S0','SEL_A'),p('S1','SEL_B'),...nibble('A','A').slice(2),...nibble('B','B').slice(2),...nibble('IN','IN').slice(2),...nibble('Y','MUX').slice(2)]},
    {id:'U9',type:'74HC283',description:'4-bit adder / carry-out',group:'select',pins:[...nibble('A','MUX'),...nibble('B','D'),p('CIN','GND'),...nibble('SUM','ALU'),p('COUT','COUT')]},
    {id:'U10',type:'74HC32',description:'OR / source + destination decode',group:'decode',pins:[p('D4','D4'),p('D6','D6'),p('D7','D7'),p('SEL_A','SEL_A'),p('LD_A#','LOAD_A_N'),p('LD_B#','LOAD_B_N')]},
    {id:'U11',type:'74HC10',description:'NAND / output + jump decode',group:'decode',pins:[p('D4','D4'),p('D6','D6'),p('D7','D7'),p('/C','C_N'),p('LD_O#','LOAD_OUT_N'),p('LD_P#','LOAD_PC_N')]},
    {id:'U1',type:'74HC74',description:'Carry D flip-flop',group:'decode',pins:[p('D','COUT'),p('CLK','CLK'),p('CLR#','RST_N'),p('Q','C'),p('Q#','C_N')]},
    {id:'U3',type:'74HC161',description:'Register A',group:'register',pins:[p('CLK','CLK'),p('CLR#','RST_N'),p('PE#','LOAD_A_N'),...nibble('D','ALU'),...nibble('Q','A')]},
    {id:'U4',type:'74HC161',description:'Register B',group:'register',pins:[p('CLK','CLK'),p('CLR#','RST_N'),p('PE#','LOAD_B_N'),...nibble('D','ALU'),...nibble('Q','B')]},
    {id:'U5',type:'74HC161',description:'OUT latch',group:'register',pins:[p('CLK','CLK'),p('CLR#','RST_N'),p('PE#','LOAD_OUT_N'),...nibble('D','ALU'),...nibble('Q','OUT')]},
    {id:'U6',type:'74HC161',description:'PC counter / parallel load',group:'register',pins:[p('CLK','CLK'),p('CLR#','RST_N'),p('PE#','LOAD_PC_N'),...nibble('D','ALU'),...nibble('Q','PC')]},
    {id:'U2',type:'74HC14',description:'Schmitt clock/reset stage',group:'clock',pins:[p('CLK','CLK'),p('RESET#','RST_N')]}
  ];

  function levels(cpu: CpuState, clock: boolean): IcLevels {
    const instruction = cpu.rom[cpu.pc];
    const d4 = bit(instruction,4), d5=bit(instruction,5), d6=bit(instruction,6), d7=bit(instruction,7);
    const selA = (d4 | d7) as BinaryLevel, selB = d5;
    const input = [cpu.a,cpu.b,cpu.input,0][(selB << 1)|selA];
    const imm = instruction & 15;
    const sum = input + imm;
    const nets: IcLevels = {
      CLK: clock?1:0, RST_N:1, GND:0, VCC:1, OE_N:0,
      C:cpu.carry as BinaryLevel,C_N:(1-cpu.carry) as BinaryLevel,
      COUT:Number(sum>15) as BinaryLevel,
      SEL_A:selA,SEL_B:selB,
      LOAD_A_N:(d6|d7) as BinaryLevel,
      LOAD_B_N:((1-d6)|d7) as BinaryLevel,
      LOAD_OUT_N:((1-d7)|d6) as BinaryLevel,
      LOAD_PC_N:Number(!(d6 && d7 && (d4 || !cpu.carry))) as BinaryLevel
    };
    for(let i=0;i<16;i++) nets[`ROM_SEL_${i}`]=(cpu.pc===i?0:1);
    for(let i=0;i<8;i++) {
      nets[`D${i}`]=bit(instruction,i);
      nets[`ROM_RAW${i}`]=bit(~instruction,i);
    }
    for(let i=0;i<4;i++) {
      nets[`PC${i}`]=bit(cpu.pc,i);
      nets[`IN${i}`]=bit(cpu.input,i);
      nets[`A${i}`]=bit(cpu.a,i);
      nets[`B${i}`]=bit(cpu.b,i);
      nets[`OUT${i}`]=bit(cpu.out,i);
      nets[`MUX${i}`]=bit(input,i);
      nets[`ALU${i}`]=bit(sum,i);
    }
    return nets;
  }
  return {chips,levels};
});
