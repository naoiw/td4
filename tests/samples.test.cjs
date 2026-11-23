const test = require('node:test');
const assert = require('node:assert/strict');
const {CPU,assemble}=require('../assets/js/core/td4-core.js');
const samples=require('../assets/js/data/samples.js');
const byId=Object.fromEntries(samples.map(s=>[s.id,s]));

test('sample catalog keeps original programs and features the 16-byte adder',()=>{
  const original=['led','echo','counter','blink','bounce','countdown','carry','addition'];
  assert.equal(samples.length,10);
  assert.deepEqual(original.filter(id=>!byId[id]),[]);
  assert.equal(new Set(samples.map(s=>s.id)).size,samples.length);
  const adder=byId.sum2;
  assert.ok(adder,'sum2 sample is available');
  assert.ok(samples.findIndex(sample=>sample.id==='sum2')<6,'adder is a quick-start card');
  assert.ok(byId.sum3,'the two-phase 3-bit adder is available');
  assert.ok(samples.findIndex(sample=>sample.id==='sum3')<6,'3-bit adder is a quick-start card');
  assert.match(byId.sum3.title,/3bit加算.*14命令/);
  assert.match(byId.sum3.description,/SW3 ON.*OFF.*LED3:0/);
  assert.match(adder.title,/2bit加算.*16命令/);
  assert.match(adder.description,/SW01.*SW23.*LED210/);
  for(const sample of samples){
    const {rom,count}=assemble(sample.source);
    assert.equal(rom.length,16,sample.id);
    assert.ok(count<=16,sample.id);
  }
});



test('3-bit adder has the exact 14 instructions and uses SW3 as a two-phase capture strobe',()=>{
  const {rom,count}=assemble(byId.sum3.source);
  assert.equal(count,14);
  assert.deepEqual(rom,[
    0x20,0x08,0xE0,0x60,0x58,0xE7,0xF3,0x58,
    0x0F,0xEC,0x51,0xF8,0x90,0xF0,0x00,0x00
  ]);
  const cpu=new CPU(rom);
  // IN3=0: keep looping at address 0 until the first operand is strobed high.
  cpu.setInput(3);
  for(let i=0;i<5;i++){
    assert.equal(cpu.pc,0);
    cpu.step();cpu.step();cpu.step();
    assert.equal(cpu.pc,0,'IN3=0 must not acquire the first value');
    assert.equal(cpu.out,0);
  }
  cpu.setInput(0b1010); // first operand 2, SW3=1
  assert.equal(cpu.step().pc,0);
  assert.equal(cpu.step().pc,1);
  assert.equal(cpu.a,2,'first operand is masked to the low three bits');
  assert.equal(cpu.carry,1);
  assert.equal(cpu.step().pc,2);
  assert.equal(cpu.pc,3);
  // IN3 stays high: repeatedly sample B, but do not run the addition.
  cpu.setInput(0b1101);
  for(let i=0;i<4;i++){
    const addresses=[3,4,5,6].map(()=>cpu.step().pc);
    assert.deepEqual(addresses,[3,4,5,6]);
    assert.equal(cpu.pc,3,'IN3=1 must keep waiting for the second operand');
    assert.equal(cpu.a,2);
    assert.equal(cpu.out,0);
  }
  // IN3=0 provides the second operand; the first operand remains latched in A.
  cpu.setInput(0b0111);
  let writes=0;
  for(let i=0;i<40;i++){
    const step=cpu.step();
    if(step.destination==='OUT'){
      writes++;
      assert.equal(step.pc,12);
      assert.equal(cpu.out,9,'2 + 7 is represented on LED3:0');
    }
    if(step.pc===13)break;
  }
  assert.equal(writes,1);
  assert.equal(cpu.pc,0);
});

test('3-bit adder computes all 64 operand pairs and exposes the carry on LED3',()=>{
  const {rom}=assemble(byId.sum3.source);
  const used=new Set();
  for(let first=0;first<8;first++){
    for(let second=0;second<8;second++){
      const cpu=new CPU(rom);
      cpu.setInput(8|first);
      for(let i=0;i<3;i++)used.add(cpu.step().pc);
      assert.equal(cpu.pc,3,'high SW3 arms the second input');
      assert.equal(cpu.a,first,'A holds the first 3-bit operand');
      for(let i=0;i<4;i++)used.add(cpu.step().pc);
      assert.equal(cpu.pc,3,'SW3 high keeps the CPU waiting at the second-input loop');
      cpu.setInput(second);
      let writes=0;
      let sawReturn=false;
      for(let i=0;i<50;i++){
        const step=cpu.step();
        used.add(step.pc);
        if(step.destination==='OUT'){
          writes++;
          assert.equal(step.pc,12,'only address C drives LEDs');
          assert.equal(cpu.out,first+second,`sum ${first}+${second}`);
          assert.equal(cpu.out>>3,+(first+second>=8),'LED3 is the 3-bit carry');
        }
        if(step.pc===13){
          assert.equal(cpu.pc,0);
          sawReturn=true;
          break;
        }
      }
      assert.equal(writes,1,`one output update for ${first}+${second}`);
      assert.equal(sawReturn,true,'the sample returns to the first input wait');
      // A new cycle must not overwrite the result while SW3 remains low.
      for(let i=0;i<6;i++)cpu.step();
      assert.equal(cpu.out,first+second);
      assert.equal(cpu.pc,0);
    }
  }
  assert.deepEqual([...used].sort((a,b)=>a-b),Array.from({length:14},(_,i)=>i),
    'all 14 instructions are reachable over all operand combinations');
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

test('binary pattern plays left and right waves over all 16 ROM addresses',()=>{
  const {rom,count}=assemble(byId.bounce.source);
  const expected=[0xB1,0xB3,0xB7,0xBF,0xB7,0xB3,0xB1,0xB0,
                  0xB8,0xBC,0xBE,0xBF,0xBE,0xBC,0xB8,0xB0];
  assert.equal(count,16,'all 16 ROM bytes are used without padding or JMP');
  assert.deepEqual(rom,expected,'ROM must exactly match the specified DB bytes');
  assert.ok(rom.every(byte=>(byte&0xF0)===0xB0),'every instruction is an OUT immediate');
  const cpu=new CPU(rom);
  const output=expected.map(byte=>byte&0x0F);
  for(let i=0;i<32;i++){
    const current=cpu.pc;
    const step=cpu.step();
    assert.equal(step.pc,i%16,'PC advances sequentially across the ROM');
    assert.equal(step.destination,'OUT');
    assert.equal(cpu.out,output[i%16],`output after instruction ${i}`);
    assert.equal(cpu.pc,(current+1)&0x0F,'PC wraps from F to 0 without JMP');
  }
  assert.equal(cpu.pc,0);
  assert.equal(cpu.cycles,32);
  assert.deepEqual(output.slice(0,8),[1,3,7,15,7,3,1,0],'leftward wave');
  assert.deepEqual(output.slice(8),[8,12,14,15,14,12,8,0],'rightward wave');
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
