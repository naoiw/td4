const test = require('node:test');
const assert = require('node:assert/strict');
const {CPU,assemble}=require('../assets/js/core/td4-core.js');
const samples=require('../assets/js/data/samples.js');
const byId=Object.fromEntries(samples.map(s=>[s.id,s]));

test('sample catalog keeps original programs and features the 16-byte adder',()=>{
  const original=['led','echo','counter','blink','bounce','countdown','carry','addition'];
  assert.equal(samples.length,9);
  assert.deepEqual(original.filter(id=>!byId[id]),[]);
  assert.equal(new Set(samples.map(s=>s.id)).size,samples.length);
  const adder=byId.sum2;
  assert.ok(adder,'sum2 sample is available');
  assert.ok(samples.findIndex(sample=>sample.id==='sum2')<6,'adder is a quick-start card');
  assert.match(adder.title,/2bit加算.*16命令/);
  assert.match(adder.description,/SW01.*SW23.*LED210/);
  for(const sample of samples){
    const {rom,count}=assemble(sample.source);
    assert.equal(rom.length,16,sample.id);
    assert.ok(count<=16,sample.id);
  }
});


test('switch echo samples and outputs every two clocks across the PC wrap',()=>{
  const {rom,count}=assemble(byId.echo.source);
  assert.equal(count,16,'eight input/output pairs fill ROM exactly');
  assert.deepEqual(rom,Array.from({length:16},(_,addr)=>addr%2===0?0x60:0x90),
    'ROM alternates IN B and OUT B without jumps or padding');
  const cpu=new CPU(rom);
  for(let input=0;input<16;input++){
    const address=(input*2)%16;
    cpu.setInput(input);
    const previousOutput=cpu.out;
    const read=cpu.step();
    assert.equal(read.pc,address);
    assert.equal(read.destination,'B');
    assert.equal(cpu.b,input,'each IN B captures the latest switches');
    assert.equal(cpu.out,previousOutput,'sampling does not alter OUTPUT');
    assert.equal(cpu.pc,address+1);

    // The output is the previously sampled B, even if switches move
    // before the following OUT B instruction.
    cpu.setInput((input+7)&15);
    const write=cpu.step();
    assert.equal(write.pc,address+1);
    assert.equal(write.destination,'OUT');
    assert.equal(cpu.out,input,'each OUT B displays the last sampled value');
    assert.equal(cpu.pc,(address+2)&15,'PC wraps 0xF to 0 without JMP');
  }
  assert.equal(cpu.cycles,32);
  assert.equal(cpu.pc,0);
});

test('LED scanner returns to LED0 and holds it through the jump',()=>{
  const sample=byId.led;
  const {rom,count}=assemble(sample.source);
  assert.equal(count,8);
  const cpu=new CPU(rom);
  const states=Array.from({length:16},()=>{cpu.step();return cpu.out;});
  const period=[1,2,4,8,4,2,1,1];
  assert.deepEqual(states,[...period,...period]);
  assert.equal(cpu.pc,0);
  assert.deepEqual(states.slice(6,9),[1,1,1],'LED0 stays on across the jump');
  assert.ok(!states.includes(0),'scanner never blanks its LEDs');
});

test('binary LED pattern ends at LED0 and holds it while jumping',()=>{
  const {rom,count}=assemble(byId.bounce.source);
  assert.equal(count,8);
  const cpu=new CPU(rom);
  const period=[1,3,7,15,7,3,1,1];
  const states=Array.from({length:16},()=>{cpu.step();return cpu.out;});
  assert.deepEqual(states,[...period,...period]);
  assert.equal(cpu.pc,0);
  // Last OUT 1, the JMP, and first OUT 1 all keep LED0 on
  // across the cycle boundary (three instruction cycles).
  assert.deepEqual(states.slice(6,9),[1,1,1]);
  assert.ok(!states.includes(0),'no all-LED-off frame');
});

test('16-byte adder computes all SW01 + SW23 input combinations and uses all addresses',()=>{
  const {rom,count}=assemble(byId.sum2.source);
  assert.equal(count,16);
  assert.deepEqual(rom,[
    0x20,0x40,0x04,0xE6,0x57,0xFD,0x04,0xEA,
    0x5A,0xFD,0x04,0xED,0x5D,0x90,0x5C,0xF0
  ]);
  const seen=new Set();
  const runCycle=(cpu,expected)=>{
    let writes=0;
    let clocks=0;
    let reachedCarryProbe=false;
    do{
      assert.ok(clocks<16,'one adder sample must finish within 16 clocks');
      const step=cpu.step();
      seen.add(step.pc);
      clocks++;
      if(step.destination==='OUT'){
        assert.equal(step.pc,13,'only address D writes LEDs');
        assert.equal(cpu.out,expected,'output includes carry on LED2');
        assert.equal(cpu.out&8,0,'LED3 stays off');
        writes++;
      }
      if(step.pc===14){
        assert.equal(cpu.carry,+(expected>=4),'C displays the 2-bit addition carry for one clock');
        reachedCarryProbe=true;
      }
      if(step.pc===15){
        assert.equal(cpu.pc,0,'loop returns to address 0');
        assert.equal(cpu.carry,0,'JMP recomputes C; LED2 retains the carry bit');
        break;
      }
    }while(true);
    assert.equal(writes,1,'exactly one output update per reading');
    assert.equal(reachedCarryProbe,true);
    assert.ok(clocks>=9&&clocks<=12);
  };
  for(let input=0;input<16;input++){
    const a=input&3,b=input>>2;
    const cpu=new CPU(rom);
    cpu.setInput(input);
    runCycle(cpu,a+b);
    cpu.setInput(15-input);
    runCycle(cpu,((15-input)&3)+((15-input)>>2));
  }
  assert.deepEqual([...seen].sort((a,b)=>a-b),Array.from({length:16},(_,i)=>i),'all ROM bytes are reachable');
});
