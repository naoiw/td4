/** DOM creation for the physical TD4 board.
 * CPU state and lifecycle remain owned by app.ts through explicit callbacks.
 * No bundler: this script registers the view before app.ts runs.
 */
(function () {
  'use strict';

  function $<T extends HTMLElement = HTMLElement>(id: string): T {
    const element = document.getElementById(id);
    if (!element) throw new Error(`Required UI element not found: ${id}`);
    return element as T;
  }

    function mount(options: BoardViewOptions): void {
    const {circuit, HEX, toggleIcDetails, setSelectedNet, onRomBitToggle, onInputBitToggle} = options;
    const chips = $('icChipGrid');
    chips.replaceChildren();
    for (const chip of circuit.chips) {
      const card = document.createElement('article');
      card.className = `ic-chip ic-group-${chip.group}`;
      card.dataset.chip = chip.id;
      const title = document.createElement('div');
      title.className = 'ic-head';
      const id = document.createElement('span'); id.textContent = chip.id;
      const type = document.createElement('strong'); type.textContent = chip.type;
      title.append(id,type);
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
      footprint.classList.add('ic-footprint-interactive');
      const packageBody = document.createElement('div');
      packageBody.className = 'ic-footprint-body';
      const packageMark = document.createElement('span');
      packageMark.className = 'ic-footprint-mark';
      packageMark.textContent = chip.type;
      packageBody.append(packageMark);
      footprint.append(packageBody);
      const physicalPins = circuit.physicalPins(chip);
      const createLegs = (side:'left'|'right'):void => {
        const bank = document.createElement('div');
        bank.className = `ic-leg-bank ic-leg-${side}`;
        const half=layout.packagePins/2;
        for(let position=0; position<half; position++){
          const leg=document.createElement('span');
          leg.className='ic-leg';
          const pinNumber=side==='left'? position+1 : layout.packagePins-position;
          const physicalPin = physicalPins[pinNumber - 1];
          leg.dataset.pinName = physicalPin.name;
          if (physicalPin.net) leg.dataset.net = physicalPin.net;
          leg.title = '#' + pinNumber + ' ' + physicalPin.name + ': ' + (physicalPin.net || '未モデル化');
          leg.dataset.pinNumber=String(pinNumber);
          bank.append(leg);
        }
        footprint.append(bank);
      };
      createLegs('left');
      createLegs('right');
      const chipToggle = document.createElement('button');
      chipToggle.className = 'ic-open-details';
      chipToggle.type = 'button';
      chipToggle.setAttribute('aria-label', chip.id + ' ' + chip.type + ' の入出力詳細を表示');
      chipToggle.setAttribute('aria-expanded', 'false');
      chipToggle.setAttribute('aria-controls', 'ic-details-' + chip.id);
      chipToggle.append(footprint);
      const pinList = document.createElement('div');
      pinList.className = 'ic-functional-layout';
      pinList.id = 'ic-details-' + chip.id;
      pinList.hidden = true;
      chipToggle.addEventListener('click', () => toggleIcDetails(chip.id));
      const createProbe=(pin:IcPin,compact:boolean):HTMLButtonElement=>{
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
      card.append(title,desc,chipToggle,pinList);
      chips.append(card);
    }
    
      // Keep the existing interactive DIP elements, but group them by function
      // like parts on a PCB rather than showing one framed card per IC.
      const mountedChips = [...chips.children];
      chips.replaceChildren();
      const roleAreas = [
        {key:'fetch',title:'ROM / FETCH',subtitle:'アドレス選択・命令データ',types:['rom']},
        {key:'alu',title:'MUX / ALU',subtitle:'信号選択・4bit演算',types:['select']},
        {key:'registers',title:'REGISTERS',subtitle:'A・B・OUT・PCを保持',types:['register']},
        {key:'control',title:'CLOCK / CONTROL',subtitle:'クロック・キャリー・命令制御',types:['clock','decode']}
      ];
      for (const role of roleAreas) {
        const area=document.createElement('section');
        area.className='ic-role-group ic-role-'+role.key;
        const head=document.createElement('div');
        head.className='ic-role-head';
        const label=document.createElement('strong');label.textContent=role.title;
        const description=document.createElement('span');description.textContent=role.subtitle;
        head.append(label,description);
        const rack=document.createElement('div');
        rack.className='ic-role-rack';
        for (const card of mountedChips) {
          if (role.types.some(type=>card.classList.contains('ic-group-'+type))) rack.append(card);
        }
        area.append(head,rack);
        chips.append(area);
      }

    const grid = $('romDipGrid');
    grid.replaceChildren();
    for(let addr=0;addr<16;addr++) {
      const cell=document.createElement('div');
      cell.className='rom-slot';cell.dataset.addr=String(addr);
      const head=document.createElement('div');head.className='rom-slot-head';
      const led=document.createElement('button');led.type='button';led.className='rom-select-lamp';
      led.dataset.net=`ROM_SEL_${addr}`;
      led.setAttribute('aria-label',`ROMアドレス${HEX(addr)}の選択信号を追跡`);
      led.title='74HC154の出力は負論理です。LED点灯時は/ROM=L';
      led.addEventListener('click',()=>setSelectedNet(`ROM_SEL_${addr}`));
      const address=document.createElement('strong'); address.textContent=HEX(addr);
      const value=document.createElement('span');value.className='rom-slot-value';
      head.append(led,address,value);
      const bits=document.createElement('div');bits.className='rom-dip-switches';
      for(let bit=7;bit>=0;bit--){
        const button=document.createElement('button');button.type='button';
        button.className='rom-dip';button.dataset.bit=String(bit);
        const handle=document.createElement('span');handle.className='dip-handle';
        button.append(handle);
        button.addEventListener('click', () => onRomBitToggle(addr, bit));
        bits.append(button);
      }
      const footer=document.createElement('div');footer.className='rom-slot-bits';footer.textContent = 'D7 → D0';
      cell.append(head,bits,footer);
      grid.append(cell);
    }
    const input=$('schematicInput');input.replaceChildren();
    const output=$('schematicOutput');output.replaceChildren();
    for(let bit=3;bit>=0;bit--){
      const b=document.createElement('button');b.type='button';b.className='schematic-io-switch';
      b.dataset.bit=String(bit);b.dataset.net=`IN${bit}`;
      b.addEventListener('click', () => onInputBitToggle(bit));
      input.append(b);
      const diode=document.createElement('button');diode.type='button';
      diode.className='schematic-io-led';diode.dataset.bit=String(bit);diode.dataset.net=`OUT${bit}`;
      diode.title=`OUT${bit}の信号線を追跡`;
      diode.addEventListener('click',()=>setSelectedNet(`OUT${bit}`));
      diode.setAttribute('aria-label',`出力LED${bit}の信号線を追跡`);
      output.append(diode);
    }
    
  }

  function render(options: BoardRenderOptions):void {
    const {cpu, clockHigh, selectedNet, circuit, HEX}=options;
    const board=document.getElementById('schematicBoard');
    if(!board)return;
    const values=circuit.levels(cpu,clockHigh);
    for(const element of document.querySelectorAll<HTMLElement>('.ic-probe')) {
      const net=element.dataset.net||'';
      const level=values[net];
      element.classList.toggle('is-high',level===1);
      element.classList.toggle('is-low',level===0);
      element.classList.toggle('is-selected',net===selectedNet);
      const value=element.querySelector<HTMLElement>('.ic-pin-level');
      if(value)value.textContent=level?'H':'L';
      element.title=`${net}: ${level?'HIGH (1)':'LOW (0)'}`;
    }
    for (const leg of board.querySelectorAll<HTMLElement>('.ic-leg')) {
      const net = leg.dataset.net;
      const level = net ? values[net] : undefined;
      leg.classList.toggle('is-high', level === 1);
      leg.classList.toggle('is-low', level === 0);
      leg.classList.toggle('is-unmodelled', level === undefined);
      leg.title = '#' + leg.dataset.pinNumber + ' ' + leg.dataset.pinName + ': ' +
        (level === undefined ? '未モデル化' : level === 1 ? 'H (1)' : 'L (0)');
    }
    for(const cell of board.querySelectorAll<HTMLElement>('.rom-slot')){
      const addr=Number(cell.dataset.addr);
      const selected=cpu.pc===addr;
      const byte=cpu.rom[addr];
      cell.classList.toggle('is-current',selected);
      const lamp=cell.querySelector<HTMLElement>('.rom-select-lamp')!;
      lamp.classList.toggle('is-on',selected);
      lamp.classList.toggle('is-selected',selectedNet===`ROM_SEL_${addr}`);
      cell.querySelector<HTMLElement>('.rom-slot-value')!.textContent=byte.toString(16).toUpperCase().padStart(2,'0');
      for(const btn of cell.querySelectorAll<HTMLButtonElement>('.rom-dip')){
        const bit=Number(btn.dataset.bit);
        const on=!!(byte&(1<<bit));
        btn.classList.toggle('is-on',on);
        btn.dataset.net=selected?`D${bit}`:'';
        btn.setAttribute('aria-pressed',String(on));
        btn.title=`ROM ${HEX(addr)} / D${bit} = ${+on}（クリックで反転）`;
        btn.setAttribute('aria-label',`ROM ${HEX(addr)}番地 D${bit} を${on?'OFF':'ON'}にする`);
      }
    }
    board.querySelectorAll<HTMLButtonElement>('.schematic-io-switch').forEach(btn=>{
      const bit=Number(btn.dataset.bit),on=!!(cpu.input&(1<<bit));
      btn.textContent=`SW${bit} ${on?'ON':'OFF'}`;
      btn.classList.toggle('is-on',on);
      btn.setAttribute('aria-pressed',String(on));
      btn.title=`IN${bit} = ${+on}`;
    });
    board.querySelectorAll<HTMLButtonElement>('.schematic-io-led').forEach(btn=>{
      const bit=Number(btn.dataset.bit),on=!!(cpu.out&(1<<bit));
      btn.classList.toggle('is-on',on);
      btn.textContent=`LED${bit}`;
      btn.title=`OUT${bit} = ${+on}（クリックで信号を追跡）`;
    });
    $('selectedNetName').textContent=selectedNet.replace(/^ROM_SEL_(\d+)$/,(_,n)=>`/ROM${Number(n).toString(16).toUpperCase()}`);
    const level=values[selectedNet];
    $('selectedNetLevel').textContent=level?'H':'L';
    $('selectedNetLevel').className=level?'hi':'lo';
    for(const el of document.querySelectorAll<HTMLElement>('[data-net]')){
      el.classList.toggle('net-selected',!!el.dataset.net&&el.dataset.net===selectedNet);
    }
    // ROM switch connections change with PC. Re-draw only when required.
    drawWires(options);
  }

  function drawWires(options: BoardRenderOptions):void {
    const {cpu, clockHigh, selectedNet, circuit}=options;
    const board=document.getElementById('schematicBoard');
    if(!board)return;
    const svg=document.getElementById('icWireLayer') as unknown as SVGSVGElement;
    const bounds=board.getBoundingClientRect();
    if(!bounds.width||!bounds.height)return;
    svg.setAttribute('viewBox',`0 0 ${bounds.width} ${bounds.height}`);
    svg.replaceChildren();
    const matches=[...board.querySelectorAll<HTMLElement>('[data-net]')].filter(el=>el.dataset.net===selectedNet && el.getBoundingClientRect().width > 0 && el.getBoundingClientRect().height > 0);
    if(matches.length<2)return;
    const point=(node:HTMLElement)=>{
      const r=node.getBoundingClientRect();
      return {x:r.left-bounds.left+r.width/2,y:r.top-bounds.top+r.height/2};
    };
    const anchor=point(matches[0]);
    const level=circuit.levels(cpu,clockHigh)[selectedNet];
    for(const node of matches.slice(1)){
      const dest=point(node);
      const bend=(anchor.x+dest.x)/2;
      const path=document.createElementNS('http://www.w3.org/2000/svg','path');
      path.setAttribute('d',`M${anchor.x} ${anchor.y} H${bend} V${dest.y} H${dest.x}`);
      path.setAttribute('class',level?'ic-wire hi':'ic-wire lo');
      svg.append(path);
    }
  }

  window.TD4BoardView = {mount, render, drawWires};
})();
