"use strict";
/* TD4 board-level logic probes. These are named *functional connections* of
 * the original 74HC architecture, not a physical KiCad netlist or package pinout.
 * #ROMn, #LOADn and /C are active LOW. They must not be confused with LEDs.
 */
(function (root, factory) {
    const exported = factory();
    if (typeof module === 'object' && module.exports)
        module.exports = exported;
    else
        root.TD4Circuit = exported;
})(globalThis, function () {
    'use strict';
    const decodeALU = (typeof module === 'object' && module.exports
        ? require('./td4-core.js')
        : globalThis.TD4).decodeALU;
    const bit = (value, i) => ((value >> i) & 1);
    const p = (name, net) => ({ name, net });
    const nibble = (name, net) => [0, 1, 2, 3].map((i) => p(`${name}${i}`, `${net}${i}`));
    const byte = (name, net) => [0, 1, 2, 3, 4, 5, 6, 7].map((i) => p(`${name}${i}`, `${net}${i}`));
    /** Physical package sizes are immutable across every chip layout. */
    const PACKAGE_PINS = {
        '74HC154': 24,
        '74HC540': 20,
        '74HC161': 16,
        '74HC153': 16,
        '74HC283': 16,
        '74HC74': 14,
        '74HC32': 14,
        '74HC10': 14,
        '74HC14': 14
    };

    const chips = [
        {
            id: 'U13',
            type: '74HC154',
            description: 'ROM address decoder / active-low',
            group: 'rom',
            pins: [
                ...nibble('A', 'PC'),
                ...[...Array(16).keys()].map((i) => p(`Y${i.toString(16).toUpperCase()}#`, `ROM_SEL_${i}`))
            ]
        },
        {
            id: 'U12',
            type: '74HC540',
            description: 'ROM inverting buffer / D0–D7',
            group: 'rom',
            pins: [...byte('A', 'ROM_RAW'), ...byte('Y', 'D'), p('OE#', 'GND')]
        },
        {
            id: 'U7',
            type: '74HC153',
            description: 'MUX low bits 0–1',
            group: 'select',
            pins: [
                p('S0', 'SEL_A'),
                p('S1', 'SEL_B'),
                ...nibble('A', 'A').slice(0, 2),
                ...nibble('B', 'B').slice(0, 2),
                ...nibble('IN', 'IN').slice(0, 2),
                ...nibble('Y', 'MUX').slice(0, 2)
            ]
        },
        {
            id: 'U8',
            type: '74HC153',
            description: 'MUX high bits 2–3',
            group: 'select',
            pins: [
                p('S0', 'SEL_A'),
                p('S1', 'SEL_B'),
                ...nibble('A', 'A').slice(2),
                ...nibble('B', 'B').slice(2),
                ...nibble('IN', 'IN').slice(2),
                ...nibble('Y', 'MUX').slice(2)
            ]
        },
        {
            id: 'U9',
            type: '74HC283',
            description: '4-bit adder / carry-out',
            group: 'select',
            pins: [
                ...nibble('A', 'MUX'),
                ...nibble('B', 'D'),
                p('CIN', 'GND'),
                ...nibble('SUM', 'ALU'),
                p('COUT', 'COUT')
            ]
        },
        {
            id: 'U10',
            type: '74HC32',
            description: 'OR / source + destination decode',
            group: 'decode',
            pins: [
                p('D4', 'D4'),
                p('D6', 'D6'),
                p('D7', 'D7'),
                p('SEL_A', 'SEL_A'),
                p('LD_A#', 'LOAD_A_N'),
                p('LD_B#', 'LOAD_B_N')
            ]
        },
        {
            id: 'U11',
            type: '74HC10',
            description: 'NAND / output + jump decode',
            group: 'decode',
            pins: [
                p('D4', 'D4'),
                p('D6', 'D6'),
                p('D7', 'D7'),
                p('/C', 'C_N'),
                p('LD_O#', 'LOAD_OUT_N'),
                p('LD_P#', 'LOAD_PC_N')
            ]
        },
        {
            id: 'U1',
            type: '74HC74',
            description: 'Carry D flip-flop',
            group: 'decode',
            pins: [p('D', 'COUT'), p('CLK', 'CLK'), p('CLR#', 'RST_N'), p('Q', 'C'), p('Q#', 'C_N')]
        },
        {
            id: 'U3',
            type: '74HC161',
            description: 'Register A',
            group: 'register',
            pins: [
                p('CLK', 'CLK'),
                p('CLR#', 'RST_N'),
                p('PE#', 'LOAD_A_N'),
                ...nibble('D', 'ALU'),
                ...nibble('Q', 'A')
            ]
        },
        {
            id: 'U4',
            type: '74HC161',
            description: 'Register B',
            group: 'register',
            pins: [
                p('CLK', 'CLK'),
                p('CLR#', 'RST_N'),
                p('PE#', 'LOAD_B_N'),
                ...nibble('D', 'ALU'),
                ...nibble('Q', 'B')
            ]
        },
        {
            id: 'U5',
            type: '74HC161',
            description: 'OUT latch',
            group: 'register',
            pins: [
                p('CLK', 'CLK'),
                p('CLR#', 'RST_N'),
                p('PE#', 'LOAD_OUT_N'),
                ...nibble('D', 'ALU'),
                ...nibble('Q', 'OUT')
            ]
        },
        {
            id: 'U6',
            type: '74HC161',
            description: 'PC counter / parallel load',
            group: 'register',
            pins: [
                p('CLK', 'CLK'),
                p('CLR#', 'RST_N'),
                p('PE#', 'LOAD_PC_N'),
                ...nibble('D', 'ALU'),
                ...nibble('Q', 'PC')
            ]
        },
        {
            id: 'U2',
            type: '74HC14',
            description: 'Two-stage Schmitt CR oscillator (B / C)',
            group: 'clock',
            pins: [p('2A', 'OSC_IN'), p('2Y', 'OSC_INV'), p('3A', 'OSC_INV'), p('3Y', 'CLK')]
        }
    ];
    // Functional pin order reflects signal flow, not literal DIP package positions.
    const row = (...pins) => pins;
    const lines = (prefix, net, size) => Array.from({ length: size }, (_, index) => row(p(`${prefix}${index}`, `${net}${index}`)));
    const layout = (component) => {
        const common = { packagePins: PACKAGE_PINS[component.type] };
        const make = (leftLabel, rightLabel, sections) => ({
            ...common,
            leftLabel,
            rightLabel,
            sections
        });
        if (component.type === '74HC154') {
            const left = lines('A', 'PC', 4);
            const right = Array.from({ length: 4 }, (_, index) => row(p(`Y${(index * 4).toString(16).toUpperCase()}#`, `ROM_SEL_${index * 4}`), p(`Y${(index * 4 + 1).toString(16).toUpperCase()}#`, `ROM_SEL_${index * 4 + 1}`), p(`Y${(index * 4 + 2).toString(16).toUpperCase()}#`, `ROM_SEL_${index * 4 + 2}`), p(`Y${(index * 4 + 3).toString(16).toUpperCase()}#`, `ROM_SEL_${index * 4 + 3}`)));
            return make('INPUT · A', 'OUTPUT · Y', [{ left, right }]);
        }
        if (component.type === '74HC540') {
            const pair = (name, net) => Array.from({ length: 4 }, (_, index) => row(p(`${name}${index}`, `${net}${index}`), p(`${name}${index + 4}`, `${net}${index + 4}`)));
            return make('INPUT · A', 'OUTPUT · Y', [
                {
                    left: pair('A', 'ROM_RAW'),
                    right: pair('Y', 'D')
                }
            ]);
        }
        if (component.type === '74HC153') {
            const high = component.id === 'U8', first = high ? 2 : 0, second = first + 1;
            const section = (n, index) => ({
                label: `回路${index + 1} · bit${n}`,
                // S0 and S1 are shared select inputs; C3 is tied LOW and hidden.
                left: [
                    row(p('S0', 'SEL_A')),
                    row(p('S1', 'SEL_B')),
                    row(p(`A${n}`, `A${n}`)),
                    row(p(`B${n}`, `B${n}`)),
                    row(p(`IN${n}`, `IN${n}`))
                ],
                leftColumnBreak: 2,
                right: [row(p(`Y${n}`, `MUX${n}`))]
            });
            return make('INPUT · SELECT / DATA', 'OUTPUT · Y', [section(first, 0), section(second, 1)]);
        }
        if (component.type === '74HC283') {
            return make('INPUT · A / B', 'OUTPUT · SUM / COUT', [
                {
                    // CIN/C0 is permanently tied LOW: retain physical wiring, hide probe.
                    left: Array.from({ length: 4 }, (_, n) => row(p(`A${n}`, `MUX${n}`), p(`B${n}`, `D${n}`))),
                    right: [...lines('SUM', 'ALU', 4), row(p('COUT', 'COUT'))],
                    rightColumnBreak: 4
                }
            ]);
        }
        if (component.type === '74HC161') {
            return make('INPUT · D / CTRL', 'OUTPUT · Q', [
                {
                    left: [
                        row(p('CLK', 'CLK')),
                        // CLR# stays HIGH in the model, so omit its functional probe.
                        ...component.pins.filter((x) => x.name === 'PE#').map((x) => row(x)),
                        ...lines('D', 'ALU', 4)
                    ],
                    leftColumnBreak: 2,
                    right: component.pins.filter((x) => /^Q[0-3]$/.test(x.name)).map((x) => row(x))
                }
            ]);
        }
        if (component.type === '74HC74') {
            return make('INPUT', 'OUTPUT', [
                {
                    left: component.pins.filter((x) => x.name !== 'CLR#' && !/^Q/.test(x.name)).map((x) => row(x)),
                    right: component.pins.filter((x) => /^Q/.test(x.name)).map((x) => row(x))
                }
            ]);
        }
        if (component.type === '74HC32' || component.type === '74HC10') {
            // Use the PDF-derived electrical netlist, including every gate and its actual pin numbers.
            const netlist = globalThis.TD4Netlist;
            if (!netlist)
                throw new Error('TD4 netlist is missing: load data/netlist.js first');
            const gateGroups = netlist.gateGroups[component.id];
            if (!gateGroups)
                throw new Error('Missing gate groups for ' + component.id);
            const fromPin = (number) => p(netlist.pinNames[component.id][String(number)], netlist.pinNets[component.id][String(number)]);
            const inputLabel = component.type === '74HC32' ? 'INPUT · A/B' : 'INPUT · A/B/C';
            return make(inputLabel, 'OUTPUT · Y', gateGroups.map((gate) => ({
                label: `${gate.gate} · ${gate.purpose}`,
                left: gate.inputPins.map((number) => row(fromPin(number))),
                right: [row(fromPin(gate.outputPin))]
            })));
        }
        if (component.type === '74HC14') {
            // B and C are the only fitted oscillator gates; the RC network is analogue.
            return make('INPUT · A', 'OUTPUT · Y', [
                {
                    label: 'B · OSCILLATOR',
                    left: [row(p('2A', 'OSC_IN'))],
                    right: [row(p('2Y', 'OSC_INV'))]
                },
                {
                    label: 'C · CLOCK BUFFER',
                    left: [row(p('3A', 'OSC_INV'))],
                    right: [row(p('3Y', 'CLK'))]
                }
            ]);
        }
        const index = component.pins.findIndex((x) => /^SEL_|^LD_/.test(x.name));
        return make('INPUT', 'OUTPUT', [
            {
                left: component.pins.slice(0, index >= 0 ? index : component.pins.length).map((x) => row(x)),
                right: component.pins.slice(index >= 0 ? index : component.pins.length).map((x) => row(x))
            }
        ]);
    };
    /** Physical DIP pads use the PDF-derived JSON connection table. */
    const physicalPins = (component) => {
        const netlist = globalThis.TD4Netlist;
        if (!netlist)
            throw new Error('TD4 netlist is missing: load data/netlist.js first');
        const connected = netlist.pinNets[component.id];
        const names = netlist.pinNames[component.id];
        if (!connected || !names)
            throw new Error('Missing netlist component: ' + component.id);
        return Array.from({ length: layout(component).packagePins }, (_, index) => {
            const number = index + 1;
            const net = connected[String(number)];
            return {
                number,
                name: names[String(number)] ?? '未モデル化',
                ...(net ? { net } : {})
            };
        });
    };
    function levels(cpu, clock) {
        const instruction = cpu.rom[cpu.pc];
        const d4 = bit(instruction, 4), d6 = bit(instruction, 6), d7 = bit(instruction, 7);
        const { selectA: selA, selectB: selB, source: input, sum, carry } = decodeALU(instruction, cpu.a, cpu.b, cpu.input);
        const invertedD6 = (1 - d6);
        const jumpOr = (d4 | (1 - cpu.carry));
        const nets = {
            CLK: clock ? 1 : 0,
            // Idealized logic states, not the analogue RC voltage or propagation delay.
            OSC_IN: clock ? 1 : 0,
            OSC_INV: clock ? 0 : 1,
            RST_N: 1,
            GND: 0,
            VCC: 1,
            OE_N: 0,
            C: cpu.carry,
            C_N: (1 - cpu.carry),
            COUT: carry,
            SEL_A: selA,
            SEL_B: selB,
            D6_N: invertedD6,
            JUMP_OR: jumpOr,
            LOAD_A_N: (d6 | d7),
            LOAD_B_N: (invertedD6 | d7),
            LOAD_OUT_N: Number(!(invertedD6 && d7)),
            LOAD_PC_N: Number(!(d6 && d7 && jumpOr))
        };
        for (let i = 0; i < 16; i++)
            nets[`ROM_SEL_${i}`] = cpu.pc === i ? 0 : 1;
        for (let i = 0; i < 8; i++) {
            nets[`D${i}`] = bit(instruction, i);
            nets[`ROM_RAW${i}`] = bit(~instruction, i);
        }
        for (let i = 0; i < 4; i++) {
            nets[`PC${i}`] = bit(cpu.pc, i);
            nets[`IN${i}`] = bit(cpu.input, i);
            nets[`A${i}`] = bit(cpu.a, i);
            nets[`B${i}`] = bit(cpu.b, i);
            nets[`OUT${i}`] = bit(cpu.out, i);
            nets[`MUX${i}`] = bit(input, i);
            nets[`ALU${i}`] = bit(sum, i);
        }
        return nets;
    }
    return { chips, levels, layout, physicalPins };
});
