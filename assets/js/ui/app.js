"use strict";
/* Interactive TD4 front end. Requires td4-core.js in the same directory. */
(function () {
    'use strict';
    const { CPU, assemble, HEX, disassemble, isStandard, romToSource } = window.TD4;
    // Stable, static page nodes are looked up once instead of on every clock edge.
    const elementCache = new Map();
    function $(id) {
        let element = elementCache.get(id);
        if (!element) {
            element = document.getElementById(id) ?? undefined;
            if (!element)
                throw new Error(`Required UI element not found: ${id}`);
            elementCache.set(id, element);
        }
        return element;
    }
    const SAMPLES = window.TD4Samples;
    const SAMPLE_PROGRAMS = Object.fromEntries(SAMPLES.map(sample => [sample.id, sample.source]));
    const { GROUPS, snapshot, appendSample, waveformPath, shouldCaptureSample } = window.TD4Signals;
    const circuit = window.TD4Circuit;
    const cpu = new CPU();
    let selectedNet = 'CLK';
    const history = [];
    const breakpoints = new Set();
    let intervalId = null;
    let clockHigh = false;
    // Manual STEP injects one rising and one falling edge into the waveform while paused.
    let stepInProgress = false;
    let powerOn = false;
    let boardClockHz = 2;
    const waveSamples = [];
    const MAX_WAVE_SAMPLES = 80;
    const MAX_TRACE_ENTRIES = 25;
    const CPU_STATE_FIELDS = ['PC', 'C', 'A', 'B', 'IN', 'OUT'];
    let changedCpuFields = new Set();
    // 'oscilloscope' is the visible default: keep sampling while the CPU is paused.
    // 'cpu' is still selectable internally for clock-only capture.
    let waveCaptureMode = 'oscilloscope';
    let scopeTriggerEnabled = false;
    let scopeTriggerChannel = 'CLK';
    let scopeTriggerEdge = 'rise';
    // A discriminated union makes frozen captures carry their required snapshot.
    // The trigger-enabled checkbox is a setting, independent of a frozen capture.
    let scopeCaptureState = { status: 'live', previousLevel: null };
    // A 20ms sample period (50Hz) captures 10Hz CLK at five samples per cycle.
    const OSCILLOSCOPE_SAMPLE_INTERVAL_MS = 20;
    const OSCILLOSCOPE_RENDER_INTERVAL_MS = 40;
    let scopeCaptureIntervalId = null;
    let lastWaveDrawAt = 0;
    const scopeRows = [];
    let boardResizeObserver = null;
    const romRowNodes = [];
    function buildRomRows() {
        const tbody = $('romRows');
        tbody.replaceChildren();
        romRowNodes.length = 0;
        for (let addr = 0; addr < 16; addr++) {
            const tr = document.createElement('tr');
            tr.dataset.addr = String(addr);
            const addrTd = document.createElement('td');
            const address = document.createElement('button');
            address.className = 'address-btn';
            address.type = 'button';
            address.textContent = `0x${HEX(addr)}`;
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
            const bitButtons = [];
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
                    refreshRomAfterEdit('ROMを直接変更しました。ソースとの内容が異なります。');
                });
                bits.append(button);
                bitButtons[bit] = button;
            }
            dataTd.append(bits);
            const hexTd = document.createElement('td');
            hexTd.className = 'rom-hex';
            const asmTd = document.createElement('td');
            asmTd.className = 'rom-asm';
            tr.append(addrTd, dataTd, hexTd, asmTd);
            tbody.append(tr);
            romRowNodes.push({ row: tr, breakpoint: address, bits: bitButtons,
                hex: hexTd, asm: asmTd, renderedByte: -1 });
        }
    }
    function renderROM() {
        for (const [addr, nodes] of romRowNodes.entries()) {
            const byte = cpu.rom[addr];
            const hasBreakpoint = breakpoints.has(addr);
            nodes.row.classList.toggle('current', addr === cpu.pc);
            nodes.row.classList.toggle('has-breakpoint', hasBreakpoint);
            nodes.breakpoint.classList.toggle('breaked', hasBreakpoint);
            nodes.breakpoint.setAttribute('aria-pressed', String(hasBreakpoint));
            // PC and breakpoint indicators move each step, but ROM data rarely changes.
            if (nodes.renderedByte === byte)
                continue;
            nodes.renderedByte = byte;
            for (let bit = 0; bit < 8; bit++) {
                const button = nodes.bits[bit];
                const on = (byte >> bit) & 1;
                button.textContent = String(on);
                button.classList.toggle('on', !!on);
            }
            nodes.hex.textContent = byte.toString(16).toUpperCase().padStart(2, '0');
            nodes.asm.textContent = disassemble(byte);
            nodes.asm.title = isStandard(byte) ? '' : 'オリジナルの命令セットでは未定義。実機の回路動作を再現。';
        }
    }
    /** Read-only snapshot for the board-adjacent CPU STATE widget. */
    function readCpuState() {
        return { A: cpu.a, B: cpu.b, PC: cpu.pc, OUT: cpu.out, C: cpu.carry, IN: cpu.input };
    }
    /** Highlight only values changed by the most recent instruction or INPUT operation. */
    function markCpuStateChanges(before) {
        const after = readCpuState();
        changedCpuFields = new Set(CPU_STATE_FIELDS.filter(field => before[field] !== after[field]));
    }
    function renderCpuState() {
        const values = readCpuState();
        $('cpuStatePanel').classList.toggle('is-off', !powerOn);
        const power = $('cpuStatePower');
        power.textContent = powerOn ? 'ON' : 'OFF';
        power.classList.toggle('is-on', powerOn);
        for (const field of CPU_STATE_FIELDS) {
            const value = values[field];
            const changed = powerOn && changedCpuFields.has(field);
            const cell = $('cpuState' + field + 'Card');
            cell.classList.toggle('is-changed', changed);
            const hexadecimal = powerOn ? (field === 'C' ? String(value) : '0x' + HEX(value)) : '—';
            const binary = field === 'C' ? 'FLAG' : (powerOn ? value.toString(2).padStart(4, '0') : '----');
            $('cpuState' + field + 'Hex').textContent = hexadecimal;
            $('cpuState' + field + 'Binary').textContent = binary;
            cell.setAttribute('aria-label', powerOn
                ? field + ' ' + hexadecimal + (field === 'C' ? '' : ' (' + binary + ')') +
                    (changed ? ' 前回の操作で変化' : '')
                : field + ' 電源OFF');
        }
    }
    function renderCPU() {
        $('cycles').textContent = String(cpu.cycles).padStart(6, '0');
        renderCpuState();
        renderROM();
        updateCircuitBoard();
    }
    /** Apply the same UI refresh after editing ROM from either board surface. */
    function refreshRomAfterEdit(message) {
        renderCPU();
        recordSignals();
        showMessage(message, 'unsynced');
    }
    /** Each switch is a real editable ROM bit; all display surfaces share cpu.rom. */
    /** Assemble the PCB view; application state stays here, rendering stays in board.ts. */
    function buildCircuitBoard() {
        window.TD4BoardView.mount({
            circuit,
            HEX,
            toggleIcDetails,
            setSelectedNet,
            onRomBitToggle(addr, bit) {
                stop();
                cpu.rom[addr] ^= (1 << bit);
                refreshRomAfterEdit('ROM ' + HEX(addr) + '番地 D' + bit + 'を変更しました。ソースとROMの内容が異なります。');
            },
            onInputBitToggle(bit) {
                const before = readCpuState();
                cpu.setInput(cpu.input ^ (1 << bit));
                markCpuStateChanges(before);
                renderCPU();
                recordSignals('input');
            },
            onPowerToggle() { if (powerOn)
                setPower(false);
            else
                run(); },
            onFrequencyToggle() { setBoardFrequency(boardClockHz === 2 ? 10 : 2); }
        });
        if (typeof ResizeObserver !== 'undefined') {
            boardResizeObserver = new ResizeObserver(fitCircuitBoard);
            boardResizeObserver.observe($('schematicViewport'));
            boardResizeObserver.observe($('schematicBoard'));
        }
        window.addEventListener('resize', fitCircuitBoard);
        fitCircuitBoard();
        setSelectedNet('CLK');
    }
    /** Full-width, below-board detail panel. Existing signal probes are preserved. */
    function toggleIcDetails(chipId) {
        const host = $('icDetailPanel');
        const previous = host.dataset.chip || '';
        if (previous) {
            const oldCard = document.querySelector('.ic-chip[data-chip="' + previous + '"]');
            const oldPins = document.getElementById('ic-details-' + previous);
            if (oldCard && oldPins) {
                oldPins.hidden = true;
                oldCard.append(oldPins);
                oldCard.classList.remove('is-expanded');
                oldCard.querySelector('.ic-open-details')?.setAttribute('aria-expanded', 'false');
            }
        }
        host.replaceChildren();
        const next = previous === chipId ? '' : chipId;
        host.dataset.chip = next;
        host.hidden = !next;
        if (!next) {
            updateCircuitBoard();
            document.querySelector('.ic-chip[data-chip="' + previous + '"] .ic-open-details')?.focus({ preventScroll: true });
            return;
        }
        const card = document.querySelector('.ic-chip[data-chip="' + next + '"]');
        const pins = document.getElementById('ic-details-' + next);
        const chip = circuit.chips.find(item => item.id === next);
        if (!card || !pins || !chip)
            return;
        const head = document.createElement('div');
        head.className = 'ic-detail-panel-head';
        const heading = document.createElement('div');
        const title = document.createElement('h3');
        title.textContent = chip.id + ' · ' + chip.type;
        const description = document.createElement('p');
        description.textContent = chip.description + ' · DIP-' + circuit.layout(chip).packagePins;
        heading.append(title, description);
        const close = document.createElement('button');
        close.type = 'button';
        close.className = 'btn btn-small ic-detail-close';
        close.textContent = '閉じる ×';
        close.addEventListener('click', () => toggleIcDetails(next));
        head.append(heading, close);
        pins.hidden = false;
        card.classList.add('is-expanded');
        card.querySelector('.ic-open-details')?.setAttribute('aria-expanded', 'true');
        host.append(head, pins);
        updateCircuitBoard();
        host.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        host.tabIndex = -1;
        host.focus({ preventScroll: true });
    }
    function setSelectedNet(net) {
        selectedNet = net;
        updateCircuitBoard();
    }
    /** Keep CPU state in the application; delegate all board DOM updates. */
    function boardRenderOptions() {
        return { cpu, clockHigh, selectedNet, circuit, HEX, powerOn, boardClockHz };
    }
    function updateCircuitBoard() {
        window.TD4BoardView.render(boardRenderOptions());
    }
    /** Keep the normal fit for split windows; shrink by 20% only in near-fullscreen desktop windows. */
    function boardFitScale(availableWidth, boardWidth, windowWidth, screenWidth) {
        const normalScale = Math.min(1.2, availableWidth / boardWidth);
        // A strict 85% screen ratio misses some maximized browser windows.
        const coversScreen = screenWidth > 0 && windowWidth >= screenWidth * 0.75;
        const wideWorkspace = windowWidth >= 1450 && availableWidth >= 1250;
        const notHalfScreen = screenWidth <= 0 || windowWidth >= screenWidth * 0.65;
        const nearFullscreen = windowWidth >= 1100 && (coversScreen || (wideWorkspace && notHalfScreen));
        return normalScale * (nearFullscreen ? 0.8 : 1);
    }
    /** Fit the entire logical 1135px PCB without changing its IC/ROM geometry. */
    function fitCircuitBoard() {
        const viewport = $('schematicViewport');
        const board = $('schematicBoard');
        const style = window.getComputedStyle(viewport);
        const availableWidth = viewport.clientWidth -
            parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
        if (availableWidth <= 0 || board.offsetWidth <= 0 || board.offsetHeight <= 0)
            return;
        // A split-window layout retains the current scale; a fullscreen-sized one is about 80% of before.
        const scale = boardFitScale(availableWidth, board.offsetWidth, Math.max(window.innerWidth, window.outerWidth), window.screen.width || window.screen.availWidth);
        board.style.setProperty('--board-fit-scale', String(scale));
        const verticalSpace = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom) +
            parseFloat(style.borderTopWidth) + parseFloat(style.borderBottomWidth);
        viewport.style.height = Math.ceil(board.offsetHeight * scale + verticalSpace) + 'px';
    }
    function createTraceItem(item) {
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
        return li;
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
        for (const item of history)
            list.append(createTraceItem(item));
    }
    /** Add only one trace row per instruction; rebuild all rows only on reset/clear. */
    function prependHistory(item) {
        const list = $('traceList');
        if (list.firstElementChild?.classList.contains('placeholder'))
            list.replaceChildren();
        list.prepend(createTraceItem(item));
        if (list.children.length > MAX_TRACE_ENTRIES)
            list.lastElementChild?.remove();
    }
    /** Create the ten waveform channels once; only signal paths and levels change afterward. */
    function renderWaveforms(levels) {
        // Once triggered, even the H/L badges must show the captured instant, not live CPU levels.
        const visibleLevels = scopeCaptureState.status === 'triggered' || scopeCaptureState.status === 'stopped'
            ? scopeCaptureState.levels : levels;
        const area = $('scopeView');
        const group = GROUPS[$('signalGroup').value] || GROUPS.basic;
        const svgNS = 'http://www.w3.org/2000/svg';
        if (!scopeRows.length) {
            for (let index = 0; index < 10; index++) {
                const row = document.createElement('div');
                const name = document.createElement('button');
                name.type = 'button';
                name.className = 'scope-name scope-channel-button';
                name.addEventListener('click', () => {
                    const currentGroup = GROUPS[$('signalGroup').value] || GROUPS.basic;
                    const signal = currentGroup[index];
                    if (signal)
                        selectScopeTriggerChannel(signal);
                });
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
                const trace = document.createElementNS(svgNS, 'path');
                trace.setAttribute('class', 'wave-trace');
                graph.append(trace);
                const status = document.createElement('strong');
                row.append(name, graph, status);
                scopeRows.push({ row, name, trace, status });
                area.append(row);
            }
        }
        for (let index = 0; index < 10; index++) {
            const signal = group[index];
            const { row, name, trace, status } = scopeRows[index];
            row.className = signal
                ? 'scope-row' + (signal === scopeTriggerChannel ? ' is-trigger-channel' : '')
                : 'scope-row is-unused';
            name.textContent = signal || '-';
            name.disabled = !signal;
            name.setAttribute('aria-pressed', String(!!signal && signal === scopeTriggerChannel));
            name.title = signal ? `${signal}をトリガー対象に選択` : '';
            if (signal) {
                trace.setAttribute('d', waveformPath(waveSamples, signal, 640, 36, MAX_WAVE_SAMPLES));
                trace.style.display = '';
            }
            else {
                trace.style.display = 'none';
            }
            status.className = signal ? 'scope-level ' + (visibleLevels[signal] ? 'hi' : 'lo') : 'scope-level unused';
            status.textContent = signal ? (visibleLevels[signal] ? 'H' : 'L') : '×';
            if (!powerOn && signal) {
                status.className = 'scope-level unused';
                status.textContent = '—';
            }
        }
    }
    /** Frozen states always own the captured H/L snapshot. */
    function isScopeFrozen() {
        return scopeCaptureState.status === 'triggered' || scopeCaptureState.status === 'stopped';
    }
    /** Restore the sampling state from the current TRIGGER setting. */
    function resetScopeCaptureState() {
        scopeCaptureState = { status: scopeTriggerEnabled ? 'armed' : 'live', previousLevel: null };
    }
    /** Use sampled digital levels; the first observation establishes a baseline. */
    function matchesScopeEdge(previous, current, edge) {
        if (previous === null)
            return false;
        return edge === 'rise' ? previous === 0 && current === 1 : previous === 1 && current === 0;
    }
    function syncScopeTriggerStatus() {
        const status = $('scopeTriggerStatus');
        const frozen = isScopeFrozen();
        const state = powerOn ? scopeCaptureState.status : 'off';
        status.className = 'scope-trigger-status is-' + state;
        status.textContent = state.toUpperCase();
        const captureButton = $('scopeRunBtn');
        captureButton.disabled = !powerOn;
        captureButton.textContent = frozen || !powerOn ? 'RUN' : 'STOP';
        captureButton.title = frozen ? '波形を消去して測定を再開' : '波形を保持して測定を停止';
        const rise = $('triggerRiseBtn');
        const fall = $('triggerFallBtn');
        rise.classList.toggle('is-selected', scopeTriggerEdge === 'rise');
        fall.classList.toggle('is-selected', scopeTriggerEdge === 'fall');
        rise.setAttribute('aria-pressed', String(scopeTriggerEdge === 'rise'));
        fall.setAttribute('aria-pressed', String(scopeTriggerEdge === 'fall'));
    }
    /** Keep the one selected channel valid when the visible group changes. */
    function syncScopeTriggerChannel() {
        const group = GROUPS[$('signalGroup').value] || GROUPS.basic;
        if (!group.includes(scopeTriggerChannel))
            scopeTriggerChannel = group[0];
    }
    /** Setting changes never release an already-frozen capture; only RUN/Clear can do so. */
    function rearmScopeTrigger() {
        const levels = snapshot(cpu, clockHigh);
        if (isScopeFrozen()) {
            syncScopeTriggerStatus();
            renderWaveforms(levels);
            return;
        }
        scopeCaptureState = {
            status: scopeTriggerEnabled ? 'armed' : 'live',
            previousLevel: powerOn ? levels[scopeTriggerChannel] : null
        };
        syncScopeTriggerStatus();
        renderWaveforms(levels);
        lastWaveDrawAt = performance.now();
    }
    function selectScopeTriggerChannel(signal) {
        const group = GROUPS[$('signalGroup').value] || GROUPS.basic;
        if (!group.includes(signal) || scopeTriggerChannel === signal)
            return;
        scopeTriggerChannel = signal;
        rearmScopeTrigger();
    }
    /** Only the oscilloscope capture freezes; no CPU interval or board state is changed. */
    function captureScopeSample(levels) {
        if (scopeCaptureState.status === 'triggered' || scopeCaptureState.status === 'stopped')
            return;
        const current = levels[scopeTriggerChannel];
        const triggered = scopeCaptureState.status === 'armed' &&
            matchesScopeEdge(scopeCaptureState.previousLevel, current, scopeTriggerEdge);
        scopeCaptureState = { ...scopeCaptureState, previousLevel: current };
        appendSample(waveSamples, levels, MAX_WAVE_SAMPLES);
        if (triggered) {
            scopeCaptureState = { status: 'triggered', levels };
            syncScopeTriggerStatus();
        }
    }
    /** STOP freezes only the scope; RUN clears the held waveform and starts again. */
    function toggleScopeCapture() {
        if (!powerOn)
            return;
        if (isScopeFrozen()) {
            restartWaveCapture();
            return;
        }
        const levels = snapshot(cpu, clockHigh);
        appendSample(waveSamples, levels, MAX_WAVE_SAMPLES);
        scopeCaptureState = { status: 'stopped', levels };
        syncScopeTriggerStatus();
        renderWaveforms(levels);
        lastWaveDrawAt = performance.now();
    }
    /** Explicit RUN, Clear, and display-group changes reset the waveform history. */
    function restartWaveCapture() {
        waveSamples.splice(0);
        resetScopeCaptureState();
        const levels = snapshot(cpu, clockHigh);
        const trigger = waveCaptureMode === 'cpu' ? 'clock' : 'timer';
        if (shouldCaptureSample(waveCaptureMode, powerOn, intervalId !== null, trigger)) {
            captureScopeSample(levels);
        }
        syncScopeTriggerStatus();
        renderWaveforms(levels);
        lastWaveDrawAt = performance.now();
    }
    /** An independent sample clock advances the waveform with a stationary CPU. */
    function stopScopeCapture() {
        if (scopeCaptureIntervalId === null)
            return;
        clearInterval(scopeCaptureIntervalId);
        scopeCaptureIntervalId = null;
    }
    function startScopeCapture() {
        stopScopeCapture();
        if (!powerOn || waveCaptureMode !== 'oscilloscope')
            return;
        scopeCaptureIntervalId = setInterval(() => {
            if (isScopeFrozen() || !shouldCaptureSample(waveCaptureMode, powerOn, intervalId !== null, 'timer'))
                return;
            const levels = snapshot(cpu, clockHigh);
            captureScopeSample(levels);
            // Draw the trigger sample immediately, even when the frame limit has not elapsed.
            const now = performance.now();
            if (scopeCaptureState.status === 'triggered' || now - lastWaveDrawAt >= OSCILLOSCOPE_RENDER_INTERVAL_MS) {
                renderWaveforms(levels);
                lastWaveDrawAt = now;
            }
        }, OSCILLOSCOPE_SAMPLE_INTERVAL_MS);
    }
    function setWaveCaptureMode(mode) {
        if (mode !== 'cpu' && mode !== 'oscilloscope')
            throw new Error('Unsupported waveform capture mode');
        if (waveCaptureMode === mode)
            return;
        waveCaptureMode = mode;
        startScopeCapture();
        restartWaveCapture();
    }
    function recordSignals(trigger = 'clock') {
        const levels = snapshot(cpu, clockHigh);
        const wasFrozen = isScopeFrozen();
        if (!wasFrozen && ((stepInProgress && powerOn) ||
            shouldCaptureSample(waveCaptureMode, powerOn, intervalId !== null, trigger))) {
            captureScopeSample(levels);
        }
        const now = performance.now();
        if (!wasFrozen && (scopeCaptureState.status === 'triggered' || intervalId === null || now - lastWaveDrawAt > 35)) {
            renderWaveforms(levels);
            lastWaveDrawAt = now;
        }
    }
    function setClockLow() {
        if (!clockHigh)
            return;
        clockHigh = false;
        updateCircuitBoard();
        recordSignals();
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
            words.className = 'sample-text';
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
    /** Power and execution are independent: OFF, ON/paused, and ON/running. */
    function syncRunControls() {
        const running = powerOn && intervalId !== null;
        $('powerOnBtn').disabled = powerOn;
        $('powerOffBtn').disabled = !powerOn;
        const controls = [
            ['runPauseBtn', 'runPauseIcon', 'runPauseLabel'],
            ['romRunPauseBtn', 'romRunPauseIcon', 'romRunPauseLabel']
        ];
        for (const [buttonId, iconId, labelId] of controls) {
            const toggle = $(buttonId);
            toggle.disabled = !powerOn;
            toggle.classList.toggle('btn-primary', !running);
            toggle.setAttribute('aria-label', running ? 'CPUを停止する' : 'CPUを実行する');
            $(iconId).textContent = running ? 'Ⅱ' : '▶';
            $(labelId).textContent = running ? '停止' : '実行';
        }
        $('romStepBtn').disabled = !powerOn || running;
        $('boardStepBtn').disabled = !powerOn || running;
        const status = $('runStatus');
        status.classList.toggle('running', running);
        status.classList.toggle('is-powered-on', powerOn);
        status.lastChild.textContent = !powerOn ? '電源OFF' : running ? '電源ON · 実行中' : '電源ON · CPU停止中';
    }
    /** An OFF→ON transition resets volatile CPU state; ROM and switches persist. */
    function setPower(on) {
        if (powerOn === on)
            return;
        if (!on) {
            stop();
            stopScopeCapture();
            powerOn = false;
            resetScopeCaptureState();
            cpu.reset();
            changedCpuFields.clear();
            history.splice(0);
            waveSamples.splice(0);
            renderCPU();
            renderHistory();
            renderWaveforms(snapshot(cpu, clockHigh));
            syncRunControls();
            syncScopeTriggerStatus();
            showMessage('電源OFF：CPUを初期化しました（ROM・入力スイッチは保持）');
            return;
        }
        powerOn = true;
        cpu.reset();
        changedCpuFields.clear();
        history.splice(0);
        waveSamples.splice(0);
        renderCPU();
        renderHistory();
        syncRunControls();
        // Keep ROM address 0x00 visible on power-up until the first clock edge.
        restartWaveCapture();
        startScopeCapture();
        startClock(false);
    }
    /** The PCB two-way switch always chooses an actual 2/10 Hz clock. */
    function setBoardFrequency(frequency) {
        boardClockHz = frequency;
        restartRunningClock();
    }
    /** Reschedule without injecting an extra rising edge on speed changes. */
    function restartRunningClock() {
        const wasRunning = intervalId !== null;
        if (wasRunning) {
            stop();
            startClock(false);
        }
        updateCircuitBoard();
    }
    function stop(reason = '') {
        if (intervalId !== null) {
            clearInterval(intervalId);
            intervalId = null;
        }
        setClockLow();
        syncRunControls();
        renderWaveforms(snapshot(cpu, clockHigh));
        if (reason)
            showMessage(reason);
    }
    // A high-going clock edge commits exactly one CPU instruction.
    function risingEdge() {
        clockHigh = true;
        const before = readCpuState();
        const outcome = cpu.step();
        markCpuStateChanges(before);
        history.unshift(outcome);
        history.splice(MAX_TRACE_ENTRIES);
        renderCPU();
        prependHistory(outcome);
        recordSignals();
    }
    function run() {
        if (!powerOn) {
            setPower(true);
            return;
        }
        startClock(true);
    }
    function toggleRunPause() {
        if (!powerOn)
            return;
        if (intervalId === null)
            run();
        else
            stop();
    }
    /** Execute exactly one instruction on a paused, powered CPU; keep breakpoints armed. */
    function stepInstruction() {
        if (!powerOn || intervalId !== null)
            return;
        setClockLow();
        stepInProgress = true;
        try {
            risingEdge();
            setClockLow();
        }
        finally {
            stepInProgress = false;
        }
    }
    function startClock(immediate) {
        if (intervalId !== null || !powerOn)
            return;
        // A user-initiated resume immediately executes the paused instruction once.
        // Preserve its breakpoint so the next visit to this address stops normally.
        if (!immediate && breakpoints.has(cpu.pc)) {
            showMessage(`PC=${HEX(cpu.pc)} のブレークポイントで停止しました。実行でこの命令を1回進められます。`);
            syncRunControls();
            return;
        }
        setClockLow();
        const halfPeriod = 500 / boardClockHz;
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
        syncRunControls();
        if (immediate)
            risingEdge();
    }
    function installROM(bytes, message) {
        stop();
        cpu.loadROM(bytes);
        cpu.reset();
        changedCpuFields.clear();
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
    function connectActions() {
        $('powerOnBtn').addEventListener('click', () => setPower(true));
        $('powerOffBtn').addEventListener('click', () => setPower(false));
        $('runPauseBtn').addEventListener('click', toggleRunPause);
        $('romRunPauseBtn').addEventListener('click', toggleRunPause);
        $('romStepBtn').addEventListener('click', stepInstruction);
        $('boardStepBtn').addEventListener('click', stepInstruction);
        $('clearLogBtn').addEventListener('click', () => { history.splice(0); renderHistory(); });
        $('clearBpBtn').addEventListener('click', () => { breakpoints.clear(); renderROM(); });
        $('clearWaveBtn').addEventListener('click', restartWaveCapture);
        $('scopeRunBtn').addEventListener('click', toggleScopeCapture);
        $('signalGroup').addEventListener('change', () => {
            scopeTriggerEnabled = false;
            $('triggerEnable').checked = false;
            syncScopeTriggerChannel();
            restartWaveCapture();
        });
        $('triggerEnable').addEventListener('change', () => {
            scopeTriggerEnabled = $('triggerEnable').checked;
            // Preserve the existing trace; only future edges may trigger after enabling.
            rearmScopeTrigger();
        });
        $('triggerRiseBtn').addEventListener('click', () => {
            scopeTriggerEdge = 'rise';
            rearmScopeTrigger();
        });
        $('triggerFallBtn').addEventListener('click', () => {
            scopeTriggerEdge = 'fall';
            rearmScopeTrigger();
        });
        $('assembleBtn').addEventListener('click', compileSource);
        $('fromRomBtn').addEventListener('click', () => {
            $('source').value = romToSource(cpu.rom);
            $('examples').selectedIndex = -1;
            updateCount();
            showMessage('現在のROMを16行のDB形式でソースへ反映しました');
        });
        $('examples').addEventListener('change', event => switchExample($('examples').value));
        $('source').addEventListener('input', () => {
            updateCount();
            showMessage('ソースを変更しました。ROMに書き込むと実行内容に反映されます。', 'unsynced');
        });
        document.addEventListener('keydown', event => {
            if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
                event.preventDefault();
                compileSource();
                return;
            }
            if (event.key === 'Escape') {
                const detail = $('icDetailPanel');
                if (!detail.hidden && detail.dataset.chip) {
                    event.preventDefault();
                    toggleIcDetails(detail.dataset.chip);
                    return;
                }
                if (intervalId !== null) {
                    event.preventDefault();
                    stop();
                }
                return;
            }
            if (event.key === ' ' && !event.isComposing &&
                !event.ctrlKey && !event.metaKey && !event.altKey &&
                !(event.target instanceof HTMLElement &&
                    event.target.closest('input, textarea, select, button, a[href], summary, [contenteditable], [role="button"]')) &&
                powerOn) {
                event.preventDefault();
                if (!event.repeat)
                    toggleRunPause();
            }
        });
    }
    // Expose both capture modes internally; the visible default is 'oscilloscope'.
    window.TD4WaveCapture = { getMode: () => waveCaptureMode, setMode: setWaveCaptureMode };
    syncScopeTriggerChannel();
    syncScopeTriggerStatus();
    buildRomRows();
    buildSamples();
    buildCircuitBoard();
    connectActions();
    switchExample('led');
    window.addEventListener('pagehide', () => { stop(); stopScopeCapture(); });
})();
