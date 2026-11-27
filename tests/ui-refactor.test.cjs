'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {loadAppFunctions, loadCompiledUIFunctions} = require('./helpers/compiled-app.cjs');
const {CPU} = require('../assets/js/core/td4-core.js');

function element() {
  const classes = new Set();
  return {
    dataset:{}, attributes:{}, textContent:'', title:'',
    classList:{
      toggle(name, value) {
        if(value) classes.add(name);
        else classes.delete(name);
      },
      contains(name) {return classes.has(name);}
    },
    setAttribute(name, value) {this.attributes[name]=String(value);}
  };
}

test('both ROM editing surfaces share a stop / flip / refresh sequence', () => {
  const cpu = new CPU(new Array(16).fill(0));
  const calls=[];
  const {toggleRomBit} = loadAppFunctions(['toggleRomBit'], {
    cpu,
    stop() {calls.push('stop');},
    refreshRomAfterEdit(message) {calls.push(message);}
  });
  toggleRomBit(3, 7, 'table edit');
  assert.equal(cpu.rom[3],0x80);
  assert.deepEqual(calls,['stop','table edit']);
  toggleRomBit(3, 7, 'board edit');
  assert.equal(cpu.rom[3],0);
  assert.deepEqual(calls.slice(2),['stop','board edit']);
});

test('board ROM DIP DOM updates only after ROM data actually changes', () => {
  let bitRenders=0;
  let queryCount=0;
  const slots=Array.from({length:16},(_,address)=>{
    const slot=element();
    slot.dataset.addr=String(address);
    const lamp=element();
    const value=element();
    const dips=Array.from({length:8},(_,bit)=>{
      const dip=element();
      dip.dataset.bit=String(bit);
      dip.setAttribute=(name,text)=>{
        dip.attributes[name]=String(text);
        if(name==='aria-pressed')bitRenders++;
      };
      return dip;
    });
    slot.querySelector=(name)=>name==='.rom-select-lamp'?lamp:name==='.rom-slot-value'?value:null;
    slot.querySelectorAll=name=>{
      assert.equal(name,'.rom-dip');
      queryCount++;
      return dips;
    };
    return slot;
  });
  const board=element();
  const nodes={
    probes:[], legs:[], slots, switches:[], leds:[], tracked:[],
    renderedRomBytes:new Array(16).fill(-1)
  };
  const controls={
    boardPowerSwitch:element(),
    boardPowerLed:element(),
    boardClockSwitch:element()
  };
  const contacts=Array.from({length:16},(_,address)=>({
    bits:Array.from({length:8},(_,bit)=>({
      upperNet:'ROM_RAW'+bit, lowerNet:'ROM_CELL_'+address+'_'+bit
    }))
  }));
  const {render}=loadCompiledUIFunctions('board.js',['render'],{
    boardNodes:nodes,
    document:{getElementById(id){return id==='schematicBoard'?board:null;}},
    $:id=>{
      assert.ok(controls[id],id);
      return controls[id];
    },
    globalThis:{TD4Netlist:{romSwitches:contacts}}
  });
  const cpu=new CPU(new Array(16).fill(0));
  const options={
    cpu,clockHigh:false,selectedNet:'CLK',powerOn:true,boardClockHz:2,
    HEX:n=>n.toString(16).toUpperCase(),
    circuit:{levels:()=>({})}
  };

  render(options);
  assert.equal(queryCount,16,'initial render visits all 16 ROM rows');
  assert.equal(bitRenders,128,'initial render initializes all DIP switches');

  render(options);
  assert.equal(queryCount,16,'no DIP selector queries when ROM bytes do not change');
  assert.equal(bitRenders,128,'no redundant attribute changes when ROM is stable');

  cpu.pc=3;
  render(options);
  assert.ok(slots[3].classList.contains('is-current'),'PC highlight still changes');
  assert.equal(bitRenders,128,'PC updates must not repaint ROM bits');

  cpu.rom[3]=0x81;
  render(options);
  assert.equal(queryCount,17,'only the edited ROM row updates');
  assert.equal(bitRenders,136,'8 DIP switches repaint after one byte edit');
  assert.equal(nodes.renderedRomBytes[3],0x81);
  assert.equal(slots[3].querySelector('.rom-slot-value').textContent,'81');

  render({...options,selectedNet:'ROM_RAW0',powerOn:false});
  assert.equal(bitRenders,136,'power and highlighted-net changes keep ROM bit cache');
});
