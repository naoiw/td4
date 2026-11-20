"use strict";
/* Interactive TD4 front end. Requires td4-core.js in the same directory. */
(function () {
    'use strict';
    const { CPU, assemble, HEX, BINARY, disassemble, isStandard, romToSource } = window.TD4;
    function $(id) {
        const element = document.getElementById(id);
        if (!element)
            throw new Error(`Required UI element not found: ${id}`);
        return element;
    }
    const SAMPLES = window.TD4Samples;
    const SAMPLE_PROGRAMS = Object.fromEntries(SAMPLES.map(sample => [sample.id, sample.source]));
    const { GROUPS, preview, snapshot, appendSample, waveformPath } = window.TD4Signals;
    const circuit = window.TD4Circuit;
    const cpu = new CPU();
    let selectedNet = 'CLK';
    const history = [];
    const breakpoints = new Set();
    let intervalId = null;
    let sourceMatchesROM = true;
    let clockHigh = false;
    let pulseTimer = null;
    const waveSamples = [];
    const MAX_WAVE_SAMPLES = 80;
    let lastWaveDrawAt = 0;
    function renderBits(value, container) {
        container.innerHTML = '';
        for (let bit = 3; bit >= 0; bit--) {
            const node = document.createElement('span');
            const active = !!(value & (1 << bit));
            node.className = 'reg-bit' + (active ? ' on' : '');
            node.title = `bit ${bit}: ${Number(active)}`;
            container.append(node);
        }
    }
    function renderRegister(name, value) {
        $(name + '-value').textContent = HEX(value);
        if (name !== 'c')
            renderBits(value, $(name + '-bits'));
    }
    function renderOutputs() {
        $('outputLeds').replaceChildren();
        for (let bit = 3; bit >= 0; bit--) {
            const wrapper = document.createElement('div');
            wrapper.className = 'led-unit';
            const bulb = document.createElement('div');
            bulb.className = 'led' + (cpu.out & (1 << bit) ? ' on' : '');
            bulb.setAttribute('aria-label', `出力LED ${bit}: ${cpu.out >> bit & 1 ? 'ON' : 'OFF'}`);
            wrapper.append(bulb, document.createTextNode('LED' + bit));
            $('outputLeds').append(wrapper);
        }
        $('out-value').textContent = HEX(cpu.out);
        $('out-decimal').textContent = 'DEC ' + cpu.out;
    }
    function renderSwitches() {
        $('inputSwitches').replaceChildren();
        for (let bit = 3; bit >= 0; bit--) {
            const unit = document.createElement('div');
            unit.className = 'switch-unit';
            const label = document.createElement('span');
            label.textContent = 'SW' + bit;
            const button = document.createElement('button');
            const on = !!(cpu.input & (1 << bit));
            button.className = 'toggle-switch';
            button.type = 'button';
            button.textContent = on ? 'ON' : 'OFF';
            button.setAttribute('aria-label', `入力スイッチ ${bit}`);
            button.setAttribute('aria-pressed', String(on));
            button.title = `SW${bit} : ${on ? 1 : 0}（クリックで反転）`;
            button.addEventListener('click', () => {
                cpu.setInput(cpu.input ^ (1 << bit));
                renderSwitches();
                renderCPU();
                recordSignals();
                showMessage(`入力ポート = 0x${HEX(cpu.input)} (${BINARY(cpu.input, 4)})`);
            });
            const index = document.createElement('small');
            index.textContent = 'BIT ' + bit;
            unit.append(label, button, index);
            $('inputSwitches').append(unit);
        }
    }
    function buildRomRows() {
        const tbody = $('romRows');
        tbody.replaceChildren();
        for (let addr = 0; addr < 16; addr++) {
            const tr = document.createElement('tr');
            tr.dataset.addr = String(addr);
            const addrTd = document.createElement('td');
            const address = document.createElement('button');
            address.className = 'address-btn';
            address.type = 'button';
            address.textContent = HEX(addr);
            address.title = 'クリックでブレークポイント切替';
            address.setAttribute('aria-label', `アドレス${HEX(addr)}のブレークポイント`);
            address.addEventListener('click', () => {
                if (breakpoints.has(addr))
                    breakpoints.delete(addr);
                else
                    breakpoints.add(addr);
                renderROM();
            });
            addrTd.append(address);
            const dataTd = document.createElement('td');
            const bits = document.createElement('div');
            bits.className = 'rom-bit-list';
            for (let bit = 7; bit >= 0; bit--) {
                const button = document.createElement('button');
                button.className = 'rom-bit';
                button.type = 'button';
                button.dataset.bit = String(bit);
                button.title = `アドレス${HEX(addr)} D${bit} を反転`;
                button.setAttribute('aria-label', `ROM ${HEX(addr)}番地のD${bit}を反転`);
                button.addEventListener('click', () => {
                    stop();
                    cpu.rom[addr] ^= 1 << bit;
                    sourceMatchesROM = false;
                    renderROM();
                    renderCPU();
                    recordSignals();
                    showMessage('ROMを直接変更しました。ソースとの内容が異なります。', 'unsynced');
                });
                bits.append(button);
            }
            dataTd.append(bits);
            const hexTd = document.createElement('td');
            hexTd.className = 'rom-hex';
            const asmTd = document.createElement('td');
            asmTd.className = 'rom-asm';
            tr.append(addrTd, dataTd, hexTd, asmTd);
            tbody.append(tr);
        }
    }
    function renderROM() {
        [...$('romRows').children].forEach((tr, addr) => {
            const byte = cpu.rom[addr];
            tr.classList.toggle('current', addr === cpu.pc);
            tr.classList.toggle('has-breakpoint', breakpoints.has(addr));
            const bp = tr.querySelector('.address-btn');
            bp.classList.toggle('breaked', breakpoints.has(addr));
            bp.setAttribute('aria-pressed', String(breakpoints.has(addr)));
            tr.querySelectorAll('.rom-bit').forEach(btn => {
                const on = (byte >> Number(btn.dataset.bit)) & 1;
                btn.textContent = String(on);
                btn.classList.toggle('on', !!on);
            });
            tr.querySelector('.rom-hex').textContent = byte.toString(16).toUpperCase().padStart(2, '0');
            const asm = tr.querySelector('.rom-asm');
            asm.textContent = disassemble(byte);
            if (!isStandard(byte))
                asm.title = 'オリジナルの命令セットでは未定義。実機の回路動作を再現。';
            else
                asm.title = '';
        });
    }
    function renderCPU() {
        renderRegister('a', cpu.a);
        renderRegister('b', cpu.b);
        renderRegister('pc', cpu.pc);
        $('c-value').textContent = String(cpu.carry);
        $('carryLamp').classList.toggle('on', !!cpu.carry);
        $('carryText').textContent = cpu.carry ? 'CARRY = 1' : 'NO CARRY';
        renderOutputs();
        $('cycles').textContent = String(cpu.cycles).padStart(6, '0');
        const instruction = cpu.rom[cpu.pc];
        $('fetchAsm').textContent = disassemble(instruction);
        $('fetchHex').textContent = instruction.toString(16).toUpperCase().padStart(2, '0');
        $('fetchDetail').textContent = `PC = ${HEX(cpu.pc)} · 次に実行する命令`;
        $('fetchState').textContent = intervalId ? 'RUN' : 'NEXT';
        const alu = preview(cpu);
        $('aluValue').textContent = HEX(alu.result);
        $('aluEquation').textContent = `${HEX(alu.source)} + ${HEX(alu.imm)} = ${HEX(alu.result)}${alu.carry ? ' (C=1)' : ''}`;
        renderROM();
        updateCircuitBoard();
    }
    /** Each switch is a real editable ROM bit; all display surfaces share cpu.rom. */
    function buildCircuitBoard() {
        const chips = $('icChipGrid');
        chips.replaceChildren();
        for (const chip of circuit.chips) {
            const card = document.createElement('article');
            card.className = `ic-chip ic-group-${chip.group}`;
            card.dataset.chip = chip.id;
            const title = document.createElement('div');
            title.className = 'ic-head';
            const id = document.createElement('span');
            id.textContent = chip.id;
            const type = document.createElement('strong');
            type.textContent = chip.type;
            title.append(id, type);
            const desc = document.createElement('p');
            desc.textContent = chip.description;
            desc.className = 'ic-description';
      const layout = circuit.layout(chip);
      card.classList.add('ic-dip');
      card.dataset.packagePins = String(layout.packagePins);
      const badge = document.createElement('small');
      badge.className = 'ic-package-label';
      badge.textContent = `DIP-${layout.packagePins} · 2.54 mm PITCH`;
      title.append(badge);
      const footprint = document.createElement('div');
      footprint.className = 'ic-footprint';
      footprint.setAttribute('aria-hidden', 'true');
      const packageBody = document.createElement('div');
      packageBody.className = 'ic-footprint-body';
      const packageMark = document.createElement('span');
      packageMark.className = 'ic-footprint-mark';
      packageMark.textContent = chip.type;
      packageBody.append(packageMark);
      footprint.append(packageBody);
      const createLegs = (side) => {
        const bank = document.createElement('div');
        bank.className = `ic-leg-bank ic-leg-${side}`;
        const half=layout.packagePins/2;
        for(let position=0; position<half; position++){
          const leg=document.createElement('span');
          leg.className='ic-leg';
          const pinNumber=side==='left'? position+1 : layout.packagePins-position;
          leg.title=`DIP physical pin ${pinNumber} (visual guide)`;
          leg.dataset.pinNumber=String(pinNumber);
          bank.append(leg);
        }
        footprint.append(bank);
      };
      createLegs('left');
      createLegs('right');
      const pinList = document.createElement('div');
      pinList.className = 'ic-functional-layout';
      const createProbe=(pin,compact)=>{
        const button=document.createElement('button');
        button.type='button';
        button.className='ic-probe'+(compact?' ic-probe-compact':'');
        button.dataset.net=pin.net;
        const name=document.createElement('span');name.textContent=pin.name;
        const value=document.createElement('b');value.className='ic-pin-level';value.textContent='L';
        button.append(name,value);
        button.addEventListener('click',()=>setSelectedNet(pin.net));
        return button;
      };
      for(const section of layout.sections){
        const unit=document.createElement('section');
        unit.className='ic-function-section';
        if(section.label){
          const heading=document.createElement('div');
          heading.className='ic-function-title';
          heading.textContent=section.label;
          unit.append(heading);
        }
        const headings=document.createElement('div');
        headings.className='ic-function-headings';
        for(const name of [layout.leftLabel,layout.rightLabel]){
          const span=document.createElement('span');
          span.textContent=name;
          headings.append(span);
        }
        unit.append(headings);
        const columns=document.createElement('div');
        columns.className='ic-function-columns';
        for(const side of [section.left,section.right]){
          const column=document.createElement('div');
          column.className='ic-function-column';
          for(const rowPins of side){
            const row=document.createElement('div');
            row.className='ic-function-row';
            for(const pin of rowPins)row.append(createProbe(pin,rowPins.length>1));
            column.append(row);
          }
          columns.append(column);
        }
        unit.append(columns);
        pinList.append(unit);
      }
      card.append(title,desc,footprint,pinList);
            chips.append(card);
        }
        const grid = $('romDipGrid');
        grid.replaceChildren();
        for (let addr = 0; addr < 16; addr++) {
            const cell = document.createElement('div');
            cell.className = 'rom-slot';
            cell.dataset.addr = String(addr);
            const head = document.createElement('div');
            head.className = 'rom-slot-head';
            const led = document.createElement('button');
            led.type = 'button';
            led.className = 'rom-select-lamp';
            led.dataset.net = `ROM_SEL_${addr}`;
            led.setAttribute('aria-label', `ROMアドレス${HEX(addr)}の選択信号を追跡`);
            led.title = '74HC154の出力は負論理です。LED点灯時は/ROM=L';
            led.addEventListener('click', () => setSelectedNet(`ROM_SEL_${addr}`));
            const address = document.createElement('strong');
            address.textContent = HEX(addr);
            const value = document.createElement('span');
            value.className = 'rom-slot-value';
            head.append(led, address, value);
            const bits = document.createElement('div');
            bits.className = 'rom-dip-switches';
            for (let bit = 7; bit >= 0; bit--) {
                const button = document.createElement('button');
                button.type = 'button';
                button.className = 'rom-dip';
                button.dataset.bit = String(bit);
                const handle = document.createElement('span');
                handle.className = 'dip-handle';
                button.append(handle);
                button.addEventListener('click', () => {
                    stop();
                    cpu.rom[addr] ^= (1 << bit);
                    sourceMatchesROM = false;
                    renderROM();
                    renderCPU();
                    recordSignals();
                    showMessage(`ROM ${HEX(addr)}番地 D${bit}を変更しました。ソースとROMの内容が異なります。`, 'unsynced');
                });
                bits.append(button);
            }
            const footer = document.createElement('div');
            footer.className = 'rom-slot-bits';
            footer.textContent = 'D7 · · · · · · · D0';
            cell.append(head, bits, footer);
            grid.append(cell);
        }
        const input = $('schematicInput');
        input.replaceChildren();
        const output = $('schematicOutput');
        output.replaceChildren();
        for (let bit = 3; bit >= 0; bit--) {
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'schematic-io-switch';
            b.dataset.bit = String(bit);
            b.dataset.net = `IN${bit}`;
            b.addEventListener('click', () => {
                cpu.setInput(cpu.input ^ (1 << bit));
                renderSwitches();
                renderCPU();
                recordSignals();
            });
            input.append(b);
            const diode = document.createElement('button');
            diode.type = 'button';
            diode.className = 'schematic-io-led';
            diode.dataset.bit = String(bit);
            diode.dataset.net = `OUT${bit}`;
            diode.title = `OUT${bit}の信号線を追跡`;
            diode.addEventListener('click', () => setSelectedNet(`OUT${bit}`));
            diode.setAttribute('aria-label', `出力LED${bit}の信号線を追跡`);
            output.append(diode);
        }
        $('resetNetBtn').addEventListener('click', () => setSelectedNet('CLK'));
        window.addEventListener('resize', drawSelectedWires);
        setSelectedNet('CLK');
    }
    function setSelectedNet(net) {
        selectedNet = net;
        updateCircuitBoard();
        drawSelectedWires();
    }
    function updateCircuitBoard() {
        const board = document.getElementById('schematicBoard');
        if (!board)
            return;
        const values = circuit.levels(cpu, clockHigh);
        for (const element of board.querySelectorAll('.ic-probe')) {
            const net = element.dataset.net || '';
            const level = values[net];
            element.classList.toggle('is-high', level === 1);
            element.classList.toggle('is-low', level === 0);
            element.classList.toggle('is-selected', net === selectedNet);
            const value = element.querySelector('.ic-pin-level');
            if (value)
                value.textContent = level ? 'H' : 'L';
            element.title = `${net}: ${level ? 'HIGH (1)' : 'LOW (0)'}`;
        }
        for (const cell of board.querySelectorAll('.rom-slot')) {
            const addr = Number(cell.dataset.addr);
            const selected = cpu.pc === addr;
            const byte = cpu.rom[addr];
            cell.classList.toggle('is-current', selected);
            const lamp = cell.querySelector('.rom-select-lamp');
            lamp.classList.toggle('is-on', selected);
            lamp.classList.toggle('is-selected', selectedNet === `ROM_SEL_${addr}`);
            cell.querySelector('.rom-slot-value').textContent = byte.toString(16).toUpperCase().padStart(2, '0');
            for (const btn of cell.querySelectorAll('.rom-dip')) {
                const bit = Number(btn.dataset.bit);
                const on = !!(byte & (1 << bit));
                btn.classList.toggle('is-on', on);
                btn.dataset.net = selected ? `D${bit}` : '';
                btn.setAttribute('aria-pressed', String(on));
                btn.title = `ROM ${HEX(addr)} / D${bit} = ${+on}（クリックで反転）`;
                btn.setAttribute('aria-label', `ROM ${HEX(addr)}番地 D${bit} を${on ? 'OFF' : 'ON'}にする`);
            }
        }
        board.querySelectorAll('.schematic-io-switch').forEach(btn => {
            const bit = Number(btn.dataset.bit), on = !!(cpu.input & (1 << bit));
            btn.textContent = `SW${bit} ${on ? 'ON' : 'OFF'}`;
            btn.classList.toggle('is-on', on);
            btn.setAttribute('aria-pressed', String(on));
            btn.title = `IN${bit} = ${+on}`;
        });
        board.querySelectorAll('.schematic-io-led').forEach(btn => {
            const bit = Number(btn.dataset.bit), on = !!(cpu.out & (1 << bit));
            btn.classList.toggle('is-on', on);
            btn.textContent = `LED${bit}`;
            btn.title = `OUT${bit} = ${+on}（クリックで信号を追跡）`;
        });
        $('selectedNetName').textContent = selectedNet.replace(/^ROM_SEL_(\d+)$/, (_, n) => `/ROM${Number(n).toString(16).toUpperCase()}`);
        const level = values[selectedNet];
        $('selectedNetLevel').textContent = level ? 'H' : 'L';
        $('selectedNetLevel').className = level ? 'hi' : 'lo';
        for (const el of board.querySelectorAll('[data-net]')) {
            el.classList.toggle('net-selected', !!el.dataset.net && el.dataset.net === selectedNet);
        }
        // ROM switch connections change with PC. Re-draw only when required.
        drawSelectedWires();
    }
    function drawSelectedWires() {
        const board = document.getElementById('schematicBoard');
        if (!board)
            return;
        const svg = document.getElementById('icWireLayer');
        const bounds = board.getBoundingClientRect();
        if (!bounds.width || !bounds.height)
            return;
        svg.setAttribute('viewBox', `0 0 ${bounds.width} ${bounds.height}`);
        svg.replaceChildren();
        const matches = [...board.querySelectorAll('[data-net]')].filter(el => el.dataset.net === selectedNet);
        if (matches.length < 2)
            return;
        const point = (node) => {
            const r = node.getBoundingClientRect();
            return { x: r.left - bounds.left + r.width / 2, y: r.top - bounds.top + r.height / 2 };
        };
        const anchor = point(matches[0]);
        const level = circuit.levels(cpu, clockHigh)[selectedNet];
        for (const node of matches.slice(1)) {
            const dest = point(node);
            const bend = (anchor.x + dest.x) / 2;
            const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            path.setAttribute('d', `M${anchor.x} ${anchor.y} H${bend} V${dest.y} H${dest.x}`);
            path.setAttribute('class', level ? 'ic-wire hi' : 'ic-wire lo');
            svg.append(path);
        }
    }
    function renderHistory() {
        const list = $('traceList');
        list.replaceChildren();
        if (!history.length) {
            const placeholder = document.createElement('li');
            placeholder.className = 'placeholder';
            placeholder.textContent = 'まだ命令を実行していません';
            list.append(placeholder);
            return;
        }
        for (const item of history) {
            const li = document.createElement('li');
            const loc = document.createElement('span');
            loc.className = 'trace-address';
            loc.textContent = `${HEX(item.pc)} [${item.byte.toString(16).toUpperCase().padStart(2, '0')}]`;
            const asm = document.createElement('span');
            asm.textContent = item.asm;
            const pc = document.createElement('span');
            pc.className = 'trace-next';
            pc.textContent = `→ ${HEX(item.pcAfter)}`;
            li.append(loc, asm, pc);
            list.append(li);
        }
    }
    function renderLiveSignals(levels) {
        const region = $('liveSignals');
        region.replaceChildren();
        for (const key of ['CLK', 'C', 'IN3', 'IN2', 'IN1', 'IN0', 'OUT3', 'OUT2', 'OUT1', 'OUT0']) {
            const label = document.createElement('span');
            const high = levels[key] === 1;
            label.className = 'signal-pill ' + (high ? 'is-high' : 'is-low');
            label.textContent = `${key} ${high ? 'H' : 'L'}`;
            label.title = `${key} = ${high ? 'HIGH (1)' : 'LOW (0)'}`;
            region.append(label);
        }
    }
    function renderWireLevels(levels) {
        for (const wire of document.querySelectorAll('[data-wire]')) {
            const high = levels[wire.dataset.wire ?? ''] === 1;
            wire.classList.toggle('wire-high', high);
            wire.classList.toggle('wire-low', !high);
        }
        $('clockLamp').classList.toggle('on', !!levels.CLK);
        $('clockLevel').textContent = levels.CLK ? 'H' : 'L';
        $('clockStateLabel').textContent = levels.CLK ? 'HIGH' : 'LOW';
        updateCircuitBoard();
    }
    function renderWaveforms(levels) {
        const area = $('scopeView');
        area.replaceChildren();
        const group = GROUPS[$('signalGroup').value] || GROUPS.basic;
        const svgNS = 'http://www.w3.org/2000/svg';
        for (const signal of group) {
            const row = document.createElement('div');
            row.className = 'scope-row';
            const name = document.createElement('span');
            name.className = 'scope-name';
            name.textContent = signal;
            const graph = document.createElementNS(svgNS, 'svg');
            graph.setAttribute('viewBox', '0 0 640 36');
            graph.setAttribute('preserveAspectRatio', 'none');
            graph.classList.add('scope-graph');
            graph.setAttribute('aria-hidden', 'true');
            for (let x = 0; x <= 640; x += 80) {
                const grid = document.createElementNS(svgNS, 'path');
                grid.setAttribute('d', `M${x} 0 V36`);
                grid.setAttribute('class', 'scope-gridline');
                graph.append(grid);
            }
            const high = document.createElementNS(svgNS, 'path');
            high.setAttribute('d', waveformPath(waveSamples, signal, 640, 36, MAX_WAVE_SAMPLES));
            high.setAttribute('class', 'wave-trace');
            graph.append(high);
            const status = document.createElement('strong');
            status.className = 'scope-level ' + (levels[signal] ? 'hi' : 'lo');
            status.textContent = levels[signal] ? 'H' : 'L';
            row.append(name, graph, status);
            area.append(row);
        }
        $('sampleCount').textContent = `${waveSamples.length} samples / ${MAX_WAVE_SAMPLES}`;
    }
    function recordSignals() {
        const levels = snapshot(cpu, clockHigh);
        appendSample(waveSamples, levels, MAX_WAVE_SAMPLES);
        renderWireLevels(levels);
        renderLiveSignals(levels);
        const now = performance.now();
        if (intervalId === null || now - lastWaveDrawAt > 35) {
            renderWaveforms(levels);
            lastWaveDrawAt = now;
        }
    }
    function setClockLow() {
        if (!clockHigh)
            return;
        clockHigh = false;
        recordSignals();
    }
    function clearPulseTimer() {
        if (pulseTimer !== null) {
            clearTimeout(pulseTimer);
            pulseTimer = null;
        }
    }
    function buildSamples() {
        const select = $('examples');
        select.replaceChildren();
        for (const sample of SAMPLES) {
            const option = document.createElement('option');
            option.value = sample.id;
            option.textContent = `${sample.title} — ${sample.description}`;
            select.append(option);
        }
        const cards = $('sampleCards');
        for (const sample of SAMPLES.slice(0, 6)) {
            const card = document.createElement('button');
            card.type = 'button';
            card.className = 'sample-card';
            card.dataset.sample = sample.id;
            card.title = `${sample.title}を読み込んで実行`;
            const icon = document.createElement('span');
            icon.className = 'sample-icon';
            icon.textContent = sample.icon;
            const words = document.createElement('span');
            const title = document.createElement('strong');
            title.textContent = sample.title;
            const description = document.createElement('small');
            description.textContent = sample.description;
            words.append(title, description);
            card.append(icon, words);
            card.addEventListener('click', () => {
                select.value = sample.id;
                switchExample(sample.id);
                run();
            });
            cards.append(card);
        }
    }
    function showMessage(message, kind = '') {
        $('editorMessage').textContent = message;
        $('editorMessage').className = 'editor-message' + (kind ? ` ${kind}` : '');
    }
    function stop(reason = '') {
        if (intervalId !== null) {
            clearInterval(intervalId);
            intervalId = null;
        }
        clearPulseTimer();
        setClockLow();
        $('runBtn').disabled = false;
        $('stopBtn').disabled = true;
        $('stepBtn').disabled = false;
        $('runStatus').classList.remove('running');
        $('runStatus').lastChild.textContent = '停止中';
        $('fetchState').textContent = 'NEXT';
        renderWaveforms(snapshot(cpu, clockHigh));
        if (reason)
            showMessage(reason);
    }
    // A high-going clock edge commits exactly one CPU instruction.
    function risingEdge() {
        clockHigh = true;
        const outcome = cpu.step();
        history.unshift(outcome);
        history.splice(25);
        renderCPU();
        renderHistory();
        recordSignals();
    }
    function step() {
        if (intervalId !== null)
            return;
        clearPulseTimer();
        setClockLow();
        risingEdge();
        // Hold H long enough to observe the pulse, then return to L.
        pulseTimer = setTimeout(() => {
            pulseTimer = null;
            setClockLow();
        }, 180);
    }
    function run() {
        if (intervalId !== null)
            return;
        if (breakpoints.has(cpu.pc)) {
            showMessage(`PC=${HEX(cpu.pc)} にブレークポイントがあります。1クロックで進めるかBPを解除してください。`);
            return;
        }
        clearPulseTimer();
        setClockLow();
        $('runBtn').disabled = true;
        $('stopBtn').disabled = false;
        $('stepBtn').disabled = true;
        $('runStatus').classList.add('running');
        $('runStatus').lastChild.textContent = '実行中';
        $('fetchState').textContent = 'RUN';
        const halfPeriod = 500 / Number($('speed').value);
        intervalId = setInterval(() => {
            if (clockHigh) {
                setClockLow();
                return;
            }
            if (breakpoints.has(cpu.pc)) {
                stop(`PC=${HEX(cpu.pc)} のブレークポイントで停止しました。`);
                renderCPU();
                return;
            }
            risingEdge();
        }, halfPeriod);
        risingEdge();
    }
    function reset() {
        stop();
        cpu.reset();
        history.splice(0);
        waveSamples.splice(0);
        renderCPU();
        renderHistory();
        recordSignals();
        showMessage('CPUをリセットしました（ROMと入力スイッチは保持）');
    }
    function installROM(bytes, message) {
        stop();
        cpu.loadROM(bytes);
        cpu.reset();
        history.splice(0);
        waveSamples.splice(0);
        breakpoints.clear();
        renderCPU();
        renderHistory();
        recordSignals();
        if (message)
            showMessage(message);
    }
    function compileSource() {
        try {
            const result = assemble($('source').value);
            installROM(result.rom, `書込完了：${result.count}命令 / 16バイトROM`);
            sourceMatchesROM = true;
            return true;
        }
        catch (error) {
            stop();
            showMessage(error instanceof Error ? error.message : String(error), 'error');
            return false;
        }
    }
    function switchExample(name) {
        if (!SAMPLE_PROGRAMS[name])
            return;
        $('source').value = SAMPLE_PROGRAMS[name];
        compileSource();
        updateCount();
        $('examples').value = name;
        document.querySelectorAll('.sample-card').forEach(card => {
            card.classList.toggle('is-selected', card.dataset.sample === name);
        });
    }
    function updateCount() {
        const lines = $('source').value.split(/\r?\n/);
        const count = lines.filter((line) => {
            const s = line.replace(/;.*$/, '').replace(/\/\/.*$/, '').trim();
            return s && !/^\.?ORG\b/i.test(s) && !/^[\w]+:$/.test(s);
        }).length;
        $('lineCount').textContent = `${count} / 16 instructions`;
    }
    function downloadROM() {
        const bytes = new Uint8Array(cpu.rom);
        const url = URL.createObjectURL(new Blob([bytes], { type: 'application/octet-stream' }));
        const a = document.createElement('a');
        a.href = url;
        a.download = 'td4-rom.bin';
        document.body.append(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        showMessage('ROM 16バイトを td4-rom.bin として保存しました');
    }
    function importROM(file) {
        if (!file)
            return;
        file.arrayBuffer().then(buffer => {
            if (buffer.byteLength !== 16)
                throw new Error(`ROMは16バイトちょうど必要です（選択されたファイル: ${buffer.byteLength}バイト）`);
            const bytes = Array.from(new Uint8Array(buffer));
            installROM(bytes, `${file.name} をROMに読み込みました`);
            $('source').value = romToSource(bytes);
            sourceMatchesROM = true;
            $('examples').selectedIndex = -1;
            updateCount();
        }).catch(error => showMessage(error instanceof Error ? error.message : String(error), 'error'));
    }
    function connectActions() {
        $('runBtn').addEventListener('click', run);
        $('stopBtn').addEventListener('click', () => stop());
        $('stepBtn').addEventListener('click', step);
        $('resetBtn').addEventListener('click', reset);
        $('speed').addEventListener('change', () => {
            if (intervalId !== null) {
                stop();
                run();
            }
        });
        $('clearLogBtn').addEventListener('click', () => { history.splice(0); renderHistory(); });
        $('clearBpBtn').addEventListener('click', () => { breakpoints.clear(); renderROM(); });
        $('clearWaveBtn').addEventListener('click', () => { waveSamples.splice(0); recordSignals(); });
        $('signalGroup').addEventListener('change', () => renderWaveforms(snapshot(cpu, clockHigh)));
        $('assembleBtn').addEventListener('click', compileSource);
        $('fromRomBtn').addEventListener('click', () => {
            $('source').value = romToSource(cpu.rom);
            sourceMatchesROM = true;
            $('examples').selectedIndex = -1;
            updateCount();
            showMessage('現在のROMを16行のDB形式でソースへ反映しました');
        });
        $('exportBtn').addEventListener('click', downloadROM);
        $('importBtn').addEventListener('click', () => $('importFile').click());
        $('importFile').addEventListener('change', event => {
            const picker = $('importFile');
            importROM(picker.files?.[0]);
            picker.value = '';
        });
        $('examples').addEventListener('change', event => switchExample($('examples').value));
        $('source').addEventListener('input', () => {
            updateCount();
            sourceMatchesROM = false;
            showMessage('ソースを変更しました。ROMに書き込むと実行内容に反映されます。', 'unsynced');
        });
        document.addEventListener('keydown', event => {
            if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
                event.preventDefault();
                compileSource();
                return;
            }
            if (event.key === 'Escape' && intervalId !== null) {
                event.preventDefault();
                stop();
                return;
            }
            const active = document.activeElement;
            const editing = ['TEXTAREA', 'INPUT', 'SELECT', 'BUTTON'].includes(active?.tagName ?? '');
            if (!editing && event.code === 'Space' && !event.repeat) {
                event.preventDefault();
                if (intervalId === null)
                    step();
            }
        });
    }
    buildRomRows();
    buildSamples();
    buildCircuitBoard();
    renderSwitches();
    connectActions();
    switchExample('led');
    window.addEventListener('pagehide', () => stop());
})();
