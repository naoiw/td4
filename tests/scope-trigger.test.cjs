const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const source = fs.readFileSync(path.join(root, 'src/ui/app.ts'), 'utf8');
const compiled = fs.readFileSync(path.join(root, 'assets/js/ui/app.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'assets/css/workbench.css'), 'utf8');
const {GROUPS, appendSample, shouldCaptureSample} = require('../assets/js/core/signals.js');

function harness({powerOn = true, group = 'basic', channel = 'CLK', edge = 'rise', baseline = {CLK:0, IN0:0}} = {}) {
  const control = {
    signalGroup: {value:group},
    triggerChannel: {
      value:channel,
      options:[],
      replaceChildren() { this.options=[]; },
      append(option) { this.options.push(option); }
    },
    scopeTriggerStatus: {className:'', textContent:''},
    scopeRunBtn: {disabled:true}
  };
  const rendered = [];
  let live = baseline;
  const context = {
    $: id => {
      assert.ok(control[id], 'missing mocked '+id);
      return control[id];
    },
    document: {createElement:tag => {
      assert.equal(tag,'option');
      return {value:'',textContent:''};
    }},
    GROUPS, appendSample, shouldCaptureSample,
    scopeTriggerChannel:channel,
    scopeTriggerEdge:edge,
    scopeTriggered:false,
    frozenScopeLevels:null,
    previousTriggerLevel:null,
    waveSamples:[],
    MAX_WAVE_SAMPLES:80,
    powerOn,
    cpu: {cycles:12},
    clockHigh:false,
    intervalId:1,
    waveCaptureMode:'oscilloscope',
    snapshot:()=>live,
    renderWaveforms:levels => rendered.push(levels),
    performance:{now:()=>1250},
    lastWaveDrawAt:0
  };
  const start=compiled.indexOf('    /** Use sampled digital levels;');
  const end=compiled.indexOf('    /** An independent sample clock',start);
  assert.ok(start>0 && end>start, 'trigger and rearm function region exists');
  const api=vm.runInNewContext(compiled.slice(start,end)+
    '\n({matchesScopeEdge,syncScopeTriggerStatus,populateScopeTriggerChannels,captureScopeSample,restartWaveCapture})',
    context);
  return {context, control, api, rendered, setLive: next => {live=next;}};
}

test('one trigger channel and one L/H edge direction are visible, plus a dedicated RUN button',()=>{
  const scope=html.slice(html.indexOf('<section class="panel scope-panel"'),html.indexOf('<section class="panel trace-panel"'));
  for(const id of ['signalGroup','triggerChannel','triggerEdge','scopeTriggerStatus','scopeRunBtn','clearWaveBtn'])
    assert.ok(scope.includes('id="'+id+'"'),id+' control is visible');
  assert.match(scope, /<select id="triggerChannel"[^>]*><option value="CLK">CLK<\/option><\/select>/);
  assert.match(scope, /<option value="rise">＿↑￣ L→H<\/option>/);
  assert.match(scope, /<option value="fall">￣↓＿ H→L<\/option>/);
  assert.match(scope, /id="scopeRunBtn" disabled[^>]*>RUN<\/button>/);
  assert.ok(css.includes('.scope-trigger-status.is-triggered'));
  assert.ok(css.includes('.scope-run-btn'));
  for(const app of [source,compiled]){
    assert.ok(app.includes("('scopeRunBtn').addEventListener('click', restartWaveCapture)"));
    assert.ok(app.includes("('clearWaveBtn').addEventListener('click', restartWaveCapture)"));
    assert.ok(app.includes("('triggerChannel').addEventListener('change'"));
    assert.ok(app.includes("('triggerEdge').addEventListener('change'"));
  }
});

test('edge matching uses previous sampled level and supports both directions',()=>{
  const {api}=harness();
  const cases=[
    [null,1,'rise',false],
    [0,0,'rise',false],
    [0,1,'rise',true],
    [1,0,'rise',false],
    [null,0,'fall',false],
    [1,1,'fall',false],
    [1,0,'fall',true],
    [0,1,'fall',false]
  ];
  for(const [previous,current,edge,expected] of cases)
    assert.equal(api.matchesScopeEdge(previous,current,edge),expected,
      String(previous)+' -> '+current+' '+edge);
});

test('trigger captures rising sample, freezes scope history, and leaves CPU running',()=>{
  const h=harness();
  h.api.populateScopeTriggerChannels();
  h.api.restartWaveCapture();
  assert.equal(h.control.scopeTriggerStatus.textContent,'ARMED');
  assert.equal(h.control.scopeRunBtn.disabled,false);
  assert.equal(h.context.waveSamples.length,1);
  h.api.captureScopeSample({CLK:0,IN0:0});
  h.api.captureScopeSample({CLK:1,IN0:0});
  assert.equal(h.context.scopeTriggered,true);
  assert.equal(h.control.scopeTriggerStatus.textContent,'TRIGGERED');
  assert.equal(h.context.frozenScopeLevels.CLK,1);
  assert.deepEqual(h.context.waveSamples.map(x=>x.CLK),[0,0,1]);
  const count=h.context.waveSamples.length;
  h.api.captureScopeSample({CLK:0,IN0:1});
  assert.equal(h.context.waveSamples.length,count,'scope history stays frozen');
  assert.equal(h.context.cpu.cycles,12,'trigger does not step or stop CPU');
  assert.equal(h.context.intervalId,1,'running CPU interval remains intact');
});

test('RUN clears frozen capture, re-arms using current level, and requires a fresh edge',()=>{
  const h=harness();
  h.api.restartWaveCapture();
  h.api.captureScopeSample({CLK:1,IN0:0});
  assert.equal(h.context.scopeTriggered,true);
  h.setLive({CLK:1,IN0:0});
  h.api.restartWaveCapture(); // RUN and Clear call this common handler
  assert.equal(h.context.scopeTriggered,false);
  assert.equal(h.context.frozenScopeLevels,null);
  assert.equal(h.control.scopeTriggerStatus.textContent,'ARMED');
  assert.deepEqual(h.context.waveSamples.map(x=>x.CLK),[1]);
  h.api.captureScopeSample({CLK:1,IN0:0});
  assert.equal(h.context.scopeTriggered,false,'already-high is not a new rising edge');
  h.api.captureScopeSample({CLK:0,IN0:0});
  h.api.captureScopeSample({CLK:1,IN0:0});
  assert.equal(h.context.scopeTriggered,true);
});

test('falling trigger works on a single input channel, with pre-trigger history capped at 80 samples',()=>{
  const h=harness({channel:'IN0',edge:'fall',baseline:{CLK:0,IN0:1}});
  h.api.populateScopeTriggerChannels();
  h.api.restartWaveCapture();
  assert.equal(h.context.scopeTriggerChannel,'IN0');
  for(let i=0;i<100;i++)h.api.captureScopeSample({CLK:i%2,IN0:1});
  assert.equal(h.context.waveSamples.length,80);
  h.api.captureScopeSample({CLK:0,IN0:0});
  assert.equal(h.context.scopeTriggered,true);
  assert.equal(h.context.waveSamples.length,80);
  assert.equal(h.context.waveSamples.at(-1).IN0,0);
  assert.ok(h.context.waveSamples.slice(0,-1).some(x=>x.IN0===1),
    'pre-trigger high samples remain');
  assert.equal(h.context.frozenScopeLevels.IN0,0);
});

test('group changes keep a valid single channel or select the first live channel',()=>{
  const h=harness({group:'basic',channel:'IN0'});
  h.api.populateScopeTriggerChannels();
  assert.equal(h.context.scopeTriggerChannel,'IN0');
  assert.deepEqual(Array.from(h.control.triggerChannel.options.map(x=>x.value)),
    Array.from(GROUPS.basic));
  h.control.signalGroup.value='io';
  h.api.populateScopeTriggerChannels();
  assert.equal(h.context.scopeTriggerChannel,'IN0','keep channel if next group includes it');
  h.control.signalGroup.value='rom';
  h.api.populateScopeTriggerChannels();
  assert.equal(h.context.scopeTriggerChannel,'CLK','fall back to first channel');
  assert.deepEqual(Array.from(h.control.triggerChannel.options.map(x=>x.value)),
    Array.from(GROUPS.rom));
  assert.ok(!h.control.triggerChannel.options.some(x=>x.value==='-'));
});

test('power-off and on transitions update trigger state while preserving independent clock operations',()=>{
  const h=harness({powerOn:false});
  h.api.syncScopeTriggerStatus();
  assert.equal(h.control.scopeTriggerStatus.textContent,'OFF');
  assert.equal(h.control.scopeRunBtn.disabled,true);
  for(const app of [source,compiled]) {
    assert.ok(app.includes('if (scopeTriggered || !shouldCaptureSample('),
      'timer stops writing but is not cleared');
    assert.ok(app.includes('if (!wasTriggered && (scopeTriggered || intervalId === null'),
      'live board signals cannot overwrite the frozen scope');
    assert.ok(app.includes('updateCircuitBoard();'), 'CPU/board display path remains alive');
    assert.ok(app.includes('restartWaveCapture();'), 'power-on resets trigger');
    assert.ok(app.includes('scopeTriggered = false;'), 'power-off clears capture state');
    assert.ok(app.includes('scopeTriggered && frozenScopeLevels ? frozenScopeLevels : levels'),
      'frozen H/L badges show sampled levels');
  }
});
