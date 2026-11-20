/* Interactive TD4 front end. Requires td4-core.js in the same directory. */
(function () {
  'use strict';
  const {CPU, assemble, HEX, BINARY, disassemble, isStandard, romToSource} = window.TD4;
  const $ = id => document.getElementById(id);
  const SAMPLE_PROGRAMS = {
    led: `; LEDを左右に流すパターン\nstart: OUT 3\n       OUT 6\n       OUT 12\n       OUT 8\n       OUT 12\n       OUT 6\n       OUT 3\n       OUT 1\n       JMP start`,
    counter: `; Bレジスタで0〜15を繰り返す\n       MOV B, 0\nloop:  OUT B\n       ADD B, 1\n       JMP loop`,
    echo: `; 入力スイッチをLEDへ反映\nread:  IN B\n       OUT B\n       JMP read`,
    carry: `; 15+1でC=1、JNCは分岐しない\n       MOV A, 15\n       ADD A, 1\n       JNC skip\n       OUT 15\nend:   JMP end\nskip:  OUT 0\n       JMP end`
  };
  const cpu = new CPU();
  const history = [];
  const breakpoints = new Set();
  let intervalId = null;
  let sourceMatchesROM = true;
  let animationTime = 0;

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
    if (name !== 'c') renderBits(value, $(name + '-bits'));
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
        showMessage(`入力ポート = 0x${HEX(cpu.input)} (${BINARY(cpu.input,4)})`);
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
      tr.dataset.addr = addr;
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
        button.dataset.bit = bit;
        button.title = `アドレス${HEX(addr)} D${bit} を反転`;
        button.setAttribute('aria-label', `ROM ${HEX(addr)}番地のD${bit}を反転`);
        button.addEventListener('click', () => {
          stop();
          cpu.rom[addr] ^= 1 << bit;
          sourceMatchesROM = false;
          renderROM(); renderCPU();
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
      if (!isStandard(byte)) asm.title = 'オリジナルの命令セットでは未定義。実機の回路動作を再現。';
      else asm.title = '';
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
    renderROM();
  }

  function renderHistory() {
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

  function showMessage(message, kind = '') {
    $('editorMessage').textContent = message;
    $('editorMessage').className = 'editor-message' + (kind ? ` ${kind}` : '');
  }

  function stop(reason = '') {
    if (intervalId !== null) { clearInterval(intervalId); intervalId = null; }
    $('runBtn').disabled = false;
    $('stopBtn').disabled = true;
    $('stepBtn').disabled = false;
    $('runStatus').classList.remove('running');
    $('runStatus').lastChild.textContent = '停止中';
    $('fetchState').textContent = 'NEXT';
    if (reason) showMessage(reason);
  }

  function step() {
    const outcome = cpu.step();
    history.unshift(outcome);
    history.splice(25);
    animationTime = performance.now();
    renderCPU();
    renderHistory();
  }

  function run() {
    if (intervalId !== null) return;
    if (breakpoints.has(cpu.pc)) {
      showMessage(`PC=${HEX(cpu.pc)} にブレークポイントがあります。1クロックで進めるかBPを解除してください。`);
      return;
    }
    intervalId = setInterval(() => {
      if (breakpoints.has(cpu.pc)) {
        stop(`PC=${HEX(cpu.pc)} のブレークポイントで停止しました。`);
        renderCPU();
        return;
      }
      step();
    }, 1000 / Number($('speed').value));
    $('runBtn').disabled = true;
    $('stopBtn').disabled = false;
    $('stepBtn').disabled = true;
    $('runStatus').classList.add('running');
    $('runStatus').lastChild.textContent = '実行中';
    $('fetchState').textContent = 'RUN';
  }

  function reset() {
    stop();
    cpu.reset();
    history.splice(0);
    renderCPU(); renderHistory();
    showMessage('CPUをリセットしました（ROMと入力スイッチは保持）');
  }

  function installROM(bytes, message) {
    stop();
    cpu.loadROM(bytes);
    cpu.reset();
    history.splice(0);
    breakpoints.clear();
    renderCPU(); renderHistory();
    if (message) showMessage(message);
  }

  function compileSource() {
    try {
      const result = assemble($('source').value);
      installROM(result.rom, `書込完了：${result.count}命令 / 16バイトROM`);
      sourceMatchesROM = true;
      return true;
    } catch (error) {
      stop(); showMessage(error.message, 'error');
      return false;
    }
  }

  function switchExample(name) {
    if (!SAMPLE_PROGRAMS[name]) return;
    $('source').value = SAMPLE_PROGRAMS[name];
    compileSource();
    updateCount();
  }

  function updateCount() {
    const lines = $('source').value.split(/\r?\n/);
    const count = lines.filter(line => {
      const s = line.replace(/;.*$/, '').replace(/\/\/.*$/, '').trim();
      return s && !/^\.?ORG\b/i.test(s) && !/^[\w]+:$/.test(s);
    }).length;
    $('lineCount').textContent = `${count} / 16 instructions`;
  }

  function downloadROM() {
    const bytes = new Uint8Array(cpu.rom);
    const url = URL.createObjectURL(new Blob([bytes], {type: 'application/octet-stream'}));
    const a = document.createElement('a');
    a.href = url; a.download = 'td4-rom.bin';
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    showMessage('ROM 16バイトを td4-rom.bin として保存しました');
  }

  function importROM(file) {
    if (!file) return;
    file.arrayBuffer().then(buffer => {
      if (buffer.byteLength !== 16) throw new Error(`ROMは16バイトちょうど必要です（選択されたファイル: ${buffer.byteLength}バイト）`);
      const bytes = Array.from(new Uint8Array(buffer));
      installROM(bytes, `${file.name} をROMに読み込みました`);
      $('source').value = romToSource(bytes);
      sourceMatchesROM = true;
      $('examples').selectedIndex = -1;
      updateCount();
    }).catch(error => showMessage(error.message, 'error'));
  }

  function connectActions() {
    $('runBtn').addEventListener('click', run);
    $('stopBtn').addEventListener('click', () => stop());
    $('stepBtn').addEventListener('click', step);
    $('resetBtn').addEventListener('click', reset);
    $('speed').addEventListener('change', () => {
      if (intervalId !== null) { stop(); run(); }
    });
    $('clearLogBtn').addEventListener('click', () => {history.splice(0); renderHistory();});
    $('clearBpBtn').addEventListener('click', () => {breakpoints.clear();renderROM();});
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
      importROM(event.target.files[0]); event.target.value = '';
    });
    $('examples').addEventListener('change', event => switchExample(event.target.value));
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
      const editing = ['TEXTAREA','INPUT','SELECT','BUTTON'].includes(active?.tagName);
      if (!editing && event.code === 'Space' && !event.repeat) {
        event.preventDefault(); if (intervalId === null) step();
      }
    });
  }

  buildRomRows();
  renderSwitches();
  connectActions();
  switchExample('led');
  window.addEventListener('pagehide', () => stop());
})();
