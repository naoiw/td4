/* Interactive TD4 front end. Requires td4-core.js in the same directory. */
(function () {
  'use strict';
  const {CPU, assemble, HEX, disassemble, isStandard, romToSource} = window.TD4;
  function $<T extends HTMLElement = HTMLElement>(id: string): T {
    const element = document.getElementById(id);
    if (!element) throw new Error(`Required UI element not found: ${id}`);
    return element as T;
  }
  const SAMPLES = window.TD4Samples;
  const SAMPLE_PROGRAMS: Record<string, string> = Object.fromEntries(SAMPLES.map(sample => [sample.id, sample.source]));
  const {GROUPS, snapshot, appendSample, waveformPath} = window.TD4Signals;
  const circuit = window.TD4Circuit;
  const cpu = new CPU();
  let selectedNet = 'CLK';
  const history: TD4Step[] = [];
  const breakpoints = new Set<number>();
  let intervalId: number | null = null;
  let sourceMatchesROM = true;
  let clockHigh = false;
  let pulseTimer: number | null = null;
  const waveSamples: SignalLevels[] = [];
  const MAX_WAVE_SAMPLES = 80;
  let lastWaveDrawAt = 0;
  let boardResizeObserver: ResizeObserver | null = null;

  function buildRomRows(): void {
    const tbody = $<HTMLTableSectionElement>('romRows');
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
        if (breakpoints.has(addr)) breakpoints.delete(addr);
        else breakpoints.add(addr);
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
          renderROM(); renderCPU(); recordSignals();
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

  function renderROM(): void {
    [...$('romRows').children].forEach((tr, addr) => {
      const byte = cpu.rom[addr];
      tr.classList.toggle('current', addr === cpu.pc);
      tr.classList.toggle('has-breakpoint', breakpoints.has(addr));
      const bp = tr.querySelector<HTMLButtonElement>('.address-btn')!;
      bp.classList.toggle('breaked', breakpoints.has(addr));
      bp.setAttribute('aria-pressed', String(breakpoints.has(addr)));
      tr.querySelectorAll<HTMLButtonElement>('.rom-bit').forEach(btn => {
        const on = (byte >> Number(btn.dataset.bit)) & 1;
        btn.textContent = String(on);
        btn.classList.toggle('on', !!on);
      });
      tr.querySelector<HTMLElement>('.rom-hex')!.textContent = byte.toString(16).toUpperCase().padStart(2, '0');
      const asm = tr.querySelector<HTMLElement>('.rom-asm')!;
      asm.textContent = disassemble(byte);
      if (!isStandard(byte)) asm.title = 'オリジナルの命令セットでは未定義。実機の回路動作を再現。';
      else asm.title = '';
    });
  }

  function renderCPU(): void {
    $('cycles').textContent = String(cpu.cycles).padStart(6, '0');
    renderROM();
    updateCircuitBoard();
  }

  /** Each switch is a real editable ROM bit; all display surfaces share cpu.rom. */
  /** Assemble the PCB view; application state stays here, rendering stays in board.ts. */
  function buildCircuitBoard(): void {
    window.TD4BoardView.mount({
      circuit,
      HEX,
      toggleIcDetails,
      setSelectedNet,
      onRomBitToggle(addr, bit) {
        stop();
        cpu.rom[addr] ^= (1 << bit);
        sourceMatchesROM = false;
        renderROM(); renderCPU(); recordSignals();
        showMessage('ROM ' + HEX(addr) + '番地 D' + bit + 'を変更しました。ソースとROMの内容が異なります。', 'unsynced');
      },
      onInputBitToggle(bit) {
        cpu.setInput(cpu.input ^ (1 << bit));
        renderCPU(); recordSignals();
      }
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
  function toggleIcDetails(chipId: string): void {
    const host = $('icDetailPanel');
    const previous = host.dataset.chip || '';
    if (previous) {
      const oldCard = document.querySelector<HTMLElement>('.ic-chip[data-chip="' + previous + '"]');
      const oldPins = document.getElementById('ic-details-' + previous);
      if (oldCard && oldPins) {
        oldPins.hidden = true;
        oldCard.append(oldPins);
        oldCard.classList.remove('is-expanded');
        oldCard.querySelector<HTMLButtonElement>('.ic-open-details')?.setAttribute('aria-expanded', 'false');
      }
    }
    host.replaceChildren();
    const next = previous === chipId ? '' : chipId;
    host.dataset.chip = next;
    host.hidden = !next;
    if (!next) { updateCircuitBoard(); return; }
    const card = document.querySelector<HTMLElement>('.ic-chip[data-chip="' + next + '"]');
    const pins = document.getElementById('ic-details-' + next);
    const chip = circuit.chips.find(item => item.id === next);
    if (!card || !pins || !chip) return;
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
    card.querySelector<HTMLButtonElement>('.ic-open-details')?.setAttribute('aria-expanded', 'true');
    host.append(head, pins);
    updateCircuitBoard();
    host.scrollIntoView({behavior: 'smooth', block: 'nearest'});
  }

  function setSelectedNet(net:string):void {
    selectedNet=net;
    updateCircuitBoard();
    drawSelectedWires();
  }

  /** Keep CPU state in the application; delegate all board DOM updates. */
  function updateCircuitBoard():void {
    window.TD4BoardView.render({cpu, clockHigh, selectedNet, circuit, HEX});
  }
  function drawSelectedWires():void {
    window.TD4BoardView.drawWires({cpu, clockHigh, selectedNet, circuit, HEX});
  }

  /** Fit the entire logical 1135px PCB without changing its IC/ROM geometry. */
  function fitCircuitBoard():void {
    const viewport = $<HTMLElement>('schematicViewport');
    const board = $<HTMLElement>('schematicBoard');
    const style = window.getComputedStyle(viewport);
    const availableWidth = viewport.clientWidth -
      parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
    if (availableWidth <= 0 || board.offsetWidth <= 0 || board.offsetHeight <= 0) return;
    // Shrink as much as necessary; gently enlarge on wide screens.
    const scale = Math.min(1.2, availableWidth / board.offsetWidth);
    board.style.setProperty('--board-fit-scale', String(scale));
    const verticalSpace = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom) +
      parseFloat(style.borderTopWidth) + parseFloat(style.borderBottomWidth);
    viewport.style.height = Math.ceil(board.offsetHeight * scale + verticalSpace) + 'px';
    drawSelectedWires();
  }


  function renderHistory(): void {
    const list = $('traceList');
    list.replaceChildren();
    if (!history.length) {
      const placeholder = document.createElement('li');
      placeholder.className = 'placeholder';
      placeholder.textContent = 'まだ命令を実行していません';
      list.append(placeholder); return;
    }
    for (const item of history) {
      const li = document.createElement('li');
      const loc = document.createElement('span');
      loc.className = 'trace-address';
      loc.textContent = `${HEX(item.pc)} [${item.byte.toString(16).toUpperCase().padStart(2,'0')}]`;
      const asm = document.createElement('span');
      asm.textContent = item.asm;
      const pc = document.createElement('span');
      pc.className = 'trace-next';
      pc.textContent = `→ ${HEX(item.pcAfter)}`;
      li.append(loc, asm, pc);
      list.append(li);
    }
  }

  function renderWaveforms(levels: SignalLevels): void {
    const area = $('scopeView');
    area.replaceChildren();
    const group = GROUPS[$<HTMLSelectElement>('signalGroup').value as SignalGroup] || GROUPS.basic;
    const svgNS = 'http://www.w3.org/2000/svg';
    for (const signal of group) {
      const row = document.createElement('div');
      row.className = 'scope-row';
      const name = document.createElement('span');
      name.className = 'scope-name';
      name.textContent = signal;
      const graph = document.createElementNS(svgNS,'svg');
      graph.setAttribute('viewBox','0 0 640 36');
      graph.setAttribute('preserveAspectRatio','none');
      graph.classList.add('scope-graph');
      graph.setAttribute('aria-hidden','true');
      for (let x = 0; x <= 640; x += 80) {
        const grid = document.createElementNS(svgNS, 'path');
        grid.setAttribute('d', `M${x} 0 V36`);
        grid.setAttribute('class', 'scope-gridline');
        graph.append(grid);
      }
      const high = document.createElementNS(svgNS,'path');
      high.setAttribute('d',waveformPath(waveSamples, signal, 640, 36, MAX_WAVE_SAMPLES));
      high.setAttribute('class','wave-trace');
      graph.append(high);
      const status = document.createElement('strong');
      status.className = 'scope-level ' + (levels[signal] ? 'hi' : 'lo');
      status.textContent = levels[signal] ? 'H' : 'L';
      row.append(name, graph, status);
      area.append(row);
    }
    $('sampleCount').textContent = `${waveSamples.length} samples / ${MAX_WAVE_SAMPLES}`;
  }

  function recordSignals(): void {
    const levels = snapshot(cpu, clockHigh);
    appendSample(waveSamples, levels, MAX_WAVE_SAMPLES);
    updateCircuitBoard();
    const now = performance.now();
    if (intervalId === null || now - lastWaveDrawAt > 35) {
      renderWaveforms(levels);
      lastWaveDrawAt = now;
    }
  }

  function setClockLow(): void {
    if (!clockHigh) return;
    clockHigh = false;
    recordSignals();
  }

  function clearPulseTimer(): void {
    if (pulseTimer !== null) { clearTimeout(pulseTimer); pulseTimer = null; }
  }

  function buildSamples(): void {
    const select = $<HTMLSelectElement>('examples');
    select.replaceChildren();
    for (const sample of SAMPLES) {
      const option = document.createElement('option');
      option.value = sample.id;
      option.textContent = `${sample.title} — ${sample.description}`;
      select.append(option);
    }
    const cards = $('sampleCards');
    for (const sample of SAMPLES.slice(0,6)) {
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

  function showMessage(message: string, kind = ''): void {
    $('editorMessage').textContent = message;
    $('editorMessage').className = 'editor-message' + (kind ? ` ${kind}` : '');
  }

  function stop(reason = ''): void {
    if (intervalId !== null) { clearInterval(intervalId); intervalId = null; }
    clearPulseTimer();
    setClockLow();
    $<HTMLButtonElement>('runBtn').disabled = false;
    $<HTMLButtonElement>('stopBtn').disabled = true;
    $<HTMLButtonElement>('stepBtn').disabled = false;
    $('runStatus').classList.remove('running');
    $('runStatus').lastChild!.textContent = '停止中';
    renderWaveforms(snapshot(cpu, clockHigh));
    if (reason) showMessage(reason);
  }

  // A high-going clock edge commits exactly one CPU instruction.
  function risingEdge(): void {
    clockHigh = true;
    const outcome = cpu.step();
    history.unshift(outcome);
    history.splice(25);
    renderCPU();
    renderHistory();
    recordSignals();
  }

  function step(): void {
    if (intervalId !== null) return;
    clearPulseTimer();
    setClockLow();
    risingEdge();
    // Hold H long enough to observe the pulse, then return to L.
    pulseTimer = setTimeout(() => {
      pulseTimer = null;
      setClockLow();
    }, 180);
  }

  function run(): void {
    if (intervalId !== null) return;
    if (breakpoints.has(cpu.pc)) {
      showMessage(`PC=${HEX(cpu.pc)} にブレークポイントがあります。1クロックで進めるかBPを解除してください。`);
      return;
    }
    clearPulseTimer();
    setClockLow();
    $<HTMLButtonElement>('runBtn').disabled = true;
    $<HTMLButtonElement>('stopBtn').disabled = false;
    $<HTMLButtonElement>('stepBtn').disabled = true;
    $('runStatus').classList.add('running');
    $('runStatus').lastChild!.textContent = '実行中';
    const halfPeriod = 500 / Number($<HTMLSelectElement>('speed').value);
    intervalId = setInterval(() => {
      if (clockHigh) { setClockLow(); return; }
      if (breakpoints.has(cpu.pc)) {
        stop(`PC=${HEX(cpu.pc)} のブレークポイントで停止しました。`);
        renderCPU();
        return;
      }
      risingEdge();
    }, halfPeriod);
    risingEdge();
  }

  function reset(): void {
    stop();
    cpu.reset();
    history.splice(0);
    waveSamples.splice(0);
    renderCPU(); renderHistory(); recordSignals();
    showMessage('CPUをリセットしました（ROMと入力スイッチは保持）');
  }

  function installROM(bytes: number[], message?: string): void {
    stop();
    cpu.loadROM(bytes);
    cpu.reset();
    history.splice(0);
    waveSamples.splice(0);
    breakpoints.clear();
    renderCPU(); renderHistory(); recordSignals();
    if (message) showMessage(message);
  }

  function compileSource(): boolean {
    try {
      const result = assemble($<HTMLTextAreaElement>('source').value);
      installROM(result.rom, `書込完了：${result.count}命令 / 16バイトROM`);
      sourceMatchesROM = true;
      return true;
    } catch (error) {
      stop(); showMessage(error instanceof Error ? error.message : String(error), 'error');
      return false;
    }
  }

  function switchExample(name: string): void {
    if (!SAMPLE_PROGRAMS[name]) return;
    $<HTMLTextAreaElement>('source').value = SAMPLE_PROGRAMS[name];
    compileSource();
    updateCount();
    $<HTMLSelectElement>('examples').value = name;
    document.querySelectorAll<HTMLElement>('.sample-card').forEach(card => {
      card.classList.toggle('is-selected', card.dataset.sample === name);
    });
  }

  function updateCount(): void {
    const lines = $<HTMLTextAreaElement>('source').value.split(/\r?\n/);
    const count = lines.filter((line: string) => {
      const s = line.replace(/;.*$/, '').replace(/\/\/.*$/, '').trim();
      return s && !/^\.?ORG\b/i.test(s) && !/^[\w]+:$/.test(s);
    }).length;
    $('lineCount').textContent = `${count} / 16 instructions`;
  }

  function downloadROM(): void {
    const bytes = new Uint8Array(cpu.rom);
    const url = URL.createObjectURL(new Blob([bytes], {type: 'application/octet-stream'}));
    const a = document.createElement('a');
    a.href = url; a.download = 'td4-rom.bin';
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    showMessage('ROM 16バイトを td4-rom.bin として保存しました');
  }

  function importROM(file?: File): void {
    if (!file) return;
    file.arrayBuffer().then(buffer => {
      if (buffer.byteLength !== 16) throw new Error(`ROMは16バイトちょうど必要です（選択されたファイル: ${buffer.byteLength}バイト）`);
      const bytes = Array.from(new Uint8Array(buffer));
      installROM(bytes, `${file.name} をROMに読み込みました`);
      $<HTMLTextAreaElement>('source').value = romToSource(bytes);
      sourceMatchesROM = true;
      $<HTMLSelectElement>('examples').selectedIndex = -1;
      updateCount();
    }).catch(error => showMessage(error instanceof Error ? error.message : String(error), 'error'));
  }

  function connectActions(): void {
    $('runBtn').addEventListener('click', run);
    $('stopBtn').addEventListener('click', () => stop());
    $('stepBtn').addEventListener('click', step);
    $('resetBtn').addEventListener('click', reset);
    $('speed').addEventListener('change', () => {
      if (intervalId !== null) { stop(); run(); }
    });
    $('clearLogBtn').addEventListener('click', () => {history.splice(0); renderHistory();});
    $('clearBpBtn').addEventListener('click', () => {breakpoints.clear();renderROM();});
    $('clearWaveBtn').addEventListener('click', () => {waveSamples.splice(0);recordSignals();});
    $('signalGroup').addEventListener('change', () => renderWaveforms(snapshot(cpu,clockHigh)));
    $('assembleBtn').addEventListener('click', compileSource);
    $('fromRomBtn').addEventListener('click', () => {
      $<HTMLTextAreaElement>('source').value = romToSource(cpu.rom);
      sourceMatchesROM = true;
      $<HTMLSelectElement>('examples').selectedIndex = -1;
      updateCount();
      showMessage('現在のROMを16行のDB形式でソースへ反映しました');
    });
    $('exportBtn').addEventListener('click', downloadROM);
    $('importBtn').addEventListener('click', () => $<HTMLInputElement>('importFile').click());
    $('importFile').addEventListener('change', event => {
      const picker = $<HTMLInputElement>('importFile'); importROM(picker.files?.[0]); picker.value = '';
    });
    $('examples').addEventListener('change', event => switchExample($<HTMLSelectElement>('examples').value));
    $('source').addEventListener('input', () => {
      updateCount(); sourceMatchesROM = false;
      showMessage('ソースを変更しました。ROMに書き込むと実行内容に反映されます。', 'unsynced');
    });
    document.addEventListener('keydown', event => {
      if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
        event.preventDefault(); compileSource(); return;
      }
      if (event.key === 'Escape' && intervalId !== null) {
        event.preventDefault(); stop(); return;
      }
      const active = document.activeElement;
      const editing = ['TEXTAREA','INPUT','SELECT','BUTTON'].includes(active?.tagName ?? '');
      if (!editing && event.code === 'Space' && !event.repeat) {
        event.preventDefault(); if (intervalId === null) step();
      }
    });
  }

  buildRomRows();
  buildSamples();
  buildCircuitBoard();
  connectActions();
  switchExample('led');
  window.addEventListener('pagehide', () => stop());
})();
