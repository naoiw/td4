/* TD4 Education — idealized sequential logic. No physical delays or analog RC model. */
(function () {
  'use strict';

  function bit(value) {
    if (value !== 0 && value !== 1) throw new RangeError('Expected a 0/1 logic level');
    return value;
  }
  function word(value) {
    if (!Number.isInteger(value) || value < 0 || value > 15) throw new RangeError('Expected a 4-bit value');
    return value;
  }
  function mode(value) {
    if (!['hold', 'count', 'load'].includes(value)) throw new RangeError('Unsupported 74HC161 mode');
    return value;
  }
  function initialState() {
    return {clock:0, carry:0, register:0};
  }

  /** One half-cycle transition, or a shared asynchronous active-LOW reset.
   *  D-FF captures the combinational carry at CLK ↑.
   *  74HC161 priority: CLR#(async) > LOAD# > count enable > hold.
   */
  function transition(state, inputs, action) {
    bit(state.clock); bit(state.carry); word(state.register);
    bit(inputs.d); word(inputs.parallel); mode(inputs.mode);
    if (action === 'reset') return {...state, carry:0, register:0, edge:'reset'};
    if (action !== 'tick') throw new RangeError('Unsupported clock action');
    if (state.clock) return {...state, clock:0, edge:'fall'};
    const register = inputs.mode === 'load' ? inputs.parallel
      : inputs.mode === 'count' ? (state.register + 1) & 15
      : state.register;
    return {clock:1, carry:inputs.d, register, edge:'rise'};
  }

  const toBinary = value => value.toString(2).padStart(4, '0');
  const ns = 'http://www.w3.org/2000/svg';
  const svgElement = (name, attrs) => {
    const el = document.createElementNS(ns, name);
    for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, String(value));
    return el;
  };

  function initialize() {
    const root = document.getElementById('sequential-lab');
    if (!root) return;
    const dInput = root.querySelector('#seq-cout-input');
    const modeInput = root.querySelector('#seq-register-mode');
    const parallelInput = root.querySelector('#seq-parallel-input');
    const clockButton = root.querySelector('#seq-clock-toggle');
    const resetButton = root.querySelector('#seq-reset');
    const wave = root.querySelector('#seq-waveform');
    const rows = root.querySelector('#seq-history-body');
    if (!dInput || !modeInput || !parallelInput || !clockButton || !resetButton || !wave || !rows) return;

    let state = initialState();
    let history = [];
    function inputs() {
      return {d:Number(dInput.value), mode:modeInput.value, parallel:Number(parallelInput.value)};
    }
    function snapshot(edge) {
      return {...state, ...inputs(), edge};
    }
    function append(edge) {
      history.push(snapshot(edge));
      if (history.length > 16) history = history.slice(-16);
    }
    function field(name, value) {
      root.querySelectorAll('[data-seq-value="' + name + '"]').forEach(el => {el.textContent = String(value);});
    }

    function drawWave() {
      const plot = wave.querySelector('[data-seq-plot]');
      if (!plot) return;
      while (plot.firstChild) plot.removeChild(plot.firstChild);
      const width = 768;
      const left = 106;
      const right = 746;
      const step = (right - left) / Math.max(1, history.length - 1);
      const lanes = [
        {label:'CLK', key:'clock', y:33, color:'#28688b'},
        {label:'COUT / D', key:'d', y:88, color:'#b27622'},
        {label:'C / Q', key:'carry', y:143, color:'#267755'},
        {label:'PC / Q0', key:'register', y:198, color:'#825a9e'}
      ];
      lanes.forEach(lane => {
        plot.appendChild(svgElement('text',{x:10,y:lane.y + 4,'font-size':13,'font-weight':750,fill:'#344e67'})).textContent = lane.label;
        plot.appendChild(svgElement('line',{x1:left,y1:lane.y+16,x2:width-13,y2:lane.y+16,stroke:'#dae4ed','stroke-width':1}));
        const logical = entry => lane.key === 'register' ? entry.register & 1 : entry[lane.key];
        const y = value => lane.y + (value ? -13 : 13);
        let path = '';
        history.forEach((entry, index) => {
          const x = left + index * step;
          const level = logical(entry);
          if (index === 0) path = 'M' + x + ' ' + y(level);
          else path += ' H' + x + ' V' + y(level);
        });
        if (history.length > 0) path += ' H' + (width - 13);
        plot.appendChild(svgElement('path',{d:path,stroke:lane.color,'stroke-width':3,fill:'none','stroke-linejoin':'round'}));
      });
      history.forEach((entry, index) => {
        const x = left + index * step;
        if (entry.edge === 'rise') {
          plot.appendChild(svgElement('line',{x1:x,y1:9,x2:x,y2:227,stroke:'#b5d6bf','stroke-width':1,'stroke-dasharray':'3 5'}));
        }
        if (entry.edge === 'reset') {
          plot.appendChild(svgElement('line',{x1:x,y1:9,x2:x,y2:227,stroke:'#e1a6a6','stroke-width':1,'stroke-dasharray':'3 5'}));
        }
      });
    }

    function drawHistory() {
      while (rows.firstChild) rows.removeChild(rows.firstChild);
      history.forEach((entry, index) => {
        const tr = document.createElement('tr');
        const parts = [
          String(index + 1),
          entry.edge === 'rise' ? '↑ CLK' : entry.edge === 'fall' ? '↓ CLK' : entry.edge === 'reset' ? 'RESET' : '入力変更',
          String(entry.clock),String(entry.d),String(entry.carry),
          toBinary(entry.register),entry.mode
        ];
        parts.forEach((value, i) => {
          const cell = document.createElement(i === 0 ? 'th' : 'td');
          if (i === 0) cell.scope = 'row';
          cell.textContent = value;
          tr.appendChild(cell);
        });
        if (entry.edge === 'rise') tr.className = 'seq-rising';
        rows.appendChild(tr);
      });
    }

    function render() {
      const current = inputs();
      field('clock', state.clock ? 'H (1)' : 'L (0)');
      field('d', current.d);
      field('carry', state.carry);
      field('register',toBinary(state.register) + ' (' + state.register + ')');
      field('nextEdge',state.clock ? '次は H→L（保持）' : '次は L→H（取り込み）');
      field('mode',current.mode === 'count' ? 'カウント +1' : current.mode === 'load' ? 'D3..0をロード' : '現在値を保持');
      clockButton.textContent = state.clock ? 'クロック H → L' : 'クロック L → H';
      drawWave();
      drawHistory();
    }

    function updateInputs() {
      append('input');
      render();
    }
    clockButton.addEventListener('click',() => {
      state = transition(state,inputs(),'tick');
      append(state.edge);
      render();
    });
    resetButton.addEventListener('click',() => {
      state = transition(state,inputs(),'reset');
      append('reset');
      render();
    });
    for(const el of [dInput,modeInput,parallelInput]) el.addEventListener('change',updateInputs);
    append('reset');
    render();
  }

  if(typeof module === 'object' && module.exports) module.exports = {initialState,transition};
  if(typeof document !== 'undefined') {
    if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded',initialize,{once:true});
    else initialize();
  }
})();
