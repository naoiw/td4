const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {loadAppFunctions} = require('./helpers/compiled-app.cjs');
const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const source = fs.readFileSync(path.join(root, 'src/ui/app.ts'), 'utf8');
const compiled = fs.readFileSync(path.join(root, 'assets/js/ui/app.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'assets/css/workbench.css'), 'utf8');
const {GROUPS, appendSample, shouldCaptureSample} = require('../assets/js/core/signals.js');

function harness({powerOn = true, enabled = true, group = 'basic', channel = 'CLK', edge = 'rise', baseline = {CLK:0, IN0:0}} = {}) {
  const control = {
    signalGroup: {value:group},
    scopeTriggerStatus: {className:'', textContent:''},
    scopeRunBtn: {disabled:true},
    triggerRiseBtn: {
      classList: {toggle() {}},
      setAttribute() {}
    },
    triggerFallBtn: {
      classList: {toggle() {}},
      setAttribute() {}
    }
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
    scopeTriggerEnabled:enabled,
    scopeTriggerChannel:channel,
    scopeTriggerEdge:edge,
    scopeCaptureState:{status:enabled?'armed':'live',previousLevel:null},
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
  const api = loadAppFunctions([
    'matchesScopeEdge', 'isScopeFrozen', 'resetScopeCaptureState',
    'syncScopeTriggerStatus', 'syncScopeTriggerChannel', 'selectScopeTriggerChannel',
    'rearmScopeTrigger', 'captureScopeSample', 'toggleScopeCapture', 'restartWaveCapture'
  ], context);
  return {context, control, api, rendered, setLive: next => {live=next;}};
}

test('trigger enable is opt-in, with illustrated SVG edge buttons and RUN',()=>{
  const scope=html.slice(html.indexOf('<section class="panel scope-panel"'),html.indexOf('<section class="panel trace-panel"'));
  for(const id of ['signalGroup','triggerEnable','triggerRiseBtn','triggerFallBtn','scopeTriggerStatus','scopeRunBtn','clearWaveBtn'])
    assert.ok(scope.includes('id="'+id+'"'),id+' control is visible');
  assert.match(scope, /<input type="checkbox" id="triggerEnable"> TRIGGER<\/label>/, 'trigger defaults OFF with the concise label');
  assert.doesNotMatch(scope, /scope-edge-label|TRIGGER ENABLE/, 'no redundant EDGE label or old trigger caption');
  assert.doesNotMatch(scope, /id="triggerChannel"/, 'channel dropdown was removed');
  assert.doesNotMatch(scope, /id="triggerEdge"|"＿↑￣"|"￣↓＿"/);
  assert.match(scope, /id="triggerRiseBtn"[^>]*aria-pressed="true"/);
  assert.match(scope, /id="triggerFallBtn"[^>]*aria-pressed="false"/);
  assert.match(scope, /<svg viewBox="0 0 40 28"[^>]*>/);
  assert.equal((scope.match(/class="scope-edge-wave"/g)||[]).length,2);
  assert.equal((scope.match(/class="scope-edge-arrow"/g)||[]).length,2);
  assert.match(scope, /id="scopeRunBtn" disabled[^>]*>RUN<\/button>/);
  assert.ok(css.includes('.scope-trigger-status.is-live'));
  assert.ok(css.includes('.scope-trigger-status.is-stopped'));
  assert.ok(css.includes('.scope-edge-option.is-selected'));
  for(const app of [source,compiled]){
    assert.ok(app.includes("('scopeRunBtn').addEventListener('click', toggleScopeCapture)"));
    assert.ok(app.includes("('clearWaveBtn').addEventListener('click', restartWaveCapture)"));
    assert.ok(app.includes("name.addEventListener('click'"), 'signal name buttons choose the channel');
    assert.ok(app.includes("selectScopeTriggerChannel(signal)"));
    assert.ok(app.includes("('triggerEnable').addEventListener('change'"));
    assert.ok(app.includes("('triggerRiseBtn').addEventListener('click'"));
    assert.ok(app.includes("('triggerFallBtn').addEventListener('click'"));
    assert.ok(!app.includes("('triggerEdge').addEventListener('change'"));
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
  h.api.syncScopeTriggerChannel();
  h.api.restartWaveCapture();
  assert.equal(h.control.scopeTriggerStatus.textContent,'ARMED');
  assert.equal(h.control.scopeRunBtn.disabled,false);
  assert.equal(h.control.scopeRunBtn.textContent,'STOP');
  assert.equal(h.context.waveSamples.length,1);
  h.api.captureScopeSample({CLK:0,IN0:0});
  h.api.captureScopeSample({CLK:1,IN0:0});
  assert.equal(h.context.scopeCaptureState.status,'triggered');
  assert.equal(h.control.scopeTriggerStatus.textContent,'TRIGGERED');
  assert.equal(h.control.scopeRunBtn.textContent,'RUN');
  assert.equal(h.context.scopeCaptureState.levels.CLK,1);
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
  assert.equal(h.context.scopeCaptureState.status,'triggered');
  h.setLive({CLK:1,IN0:0});
  h.api.toggleScopeCapture(); // RUN while triggered clears and resumes
  assert.notEqual(h.context.scopeCaptureState.status,'triggered');
  assert.equal('levels' in h.context.scopeCaptureState,false);
  assert.equal(h.control.scopeTriggerStatus.textContent,'ARMED');
  assert.deepEqual(h.context.waveSamples.map(x=>x.CLK),[1]);
  h.api.captureScopeSample({CLK:1,IN0:0});
  assert.notEqual(h.context.scopeCaptureState.status,'triggered','already-high is not a new rising edge');
  h.api.captureScopeSample({CLK:0,IN0:0});
  h.api.captureScopeSample({CLK:1,IN0:0});
  assert.equal(h.context.scopeCaptureState.status,'triggered');
});

test('falling trigger works on a single input channel, with pre-trigger history capped at 80 samples',()=>{
  const h=harness({channel:'IN0',edge:'fall',baseline:{CLK:0,IN0:1}});
  h.api.syncScopeTriggerChannel();
  h.api.restartWaveCapture();
  assert.equal(h.context.scopeTriggerChannel,'IN0');
  for(let i=0;i<100;i++)h.api.captureScopeSample({CLK:i%2,IN0:1});
  assert.equal(h.context.waveSamples.length,80);
  h.api.captureScopeSample({CLK:0,IN0:0});
  assert.equal(h.context.scopeCaptureState.status,'triggered');
  assert.equal(h.context.waveSamples.length,80);
  assert.equal(h.context.waveSamples.at(-1).IN0,0);
  assert.ok(h.context.waveSamples.slice(0,-1).some(x=>x.IN0===1),
    'pre-trigger high samples remain');
  assert.equal(h.context.scopeCaptureState.levels.IN0,0);
});

test('selected channel comes from visible signal names and remains valid across groups',()=>{
  const h=harness({group:'basic',channel:'IN0'});
  h.api.syncScopeTriggerChannel();
  assert.equal(h.context.scopeTriggerChannel,'IN0');
  h.api.selectScopeTriggerChannel('OUT0');
  assert.equal(h.context.scopeTriggerChannel,'OUT0');
  h.api.selectScopeTriggerChannel('UNUSED');
  assert.equal(h.context.scopeTriggerChannel,'OUT0','unused channels are rejected');
  h.control.signalGroup.value='io';
  h.api.syncScopeTriggerChannel();
  assert.equal(h.context.scopeTriggerChannel,'OUT0');
  h.control.signalGroup.value='rom';
  h.api.syncScopeTriggerChannel();
  assert.equal(h.context.scopeTriggerChannel,'CLK','fallback to first visible channel');
});

test('CH and EDGE changes preserve the live waveform while re-arming',()=>{
  const h=harness({group:'basic',channel:'CLK',edge:'rise'});
  h.api.restartWaveCapture();
  h.api.captureScopeSample({CLK:0,IN0:0});
  const original=h.context.waveSamples.slice();
  h.setLive({CLK:0,IN0:0});
  h.api.selectScopeTriggerChannel('IN0');
  assert.equal(h.context.scopeTriggerChannel,'IN0');
  assert.equal(h.context.scopeCaptureState.previousLevel,0);
  assert.equal(h.control.scopeTriggerStatus.textContent,'ARMED');
  assert.deepEqual(h.context.waveSamples,original);
  h.context.scopeTriggerEdge='fall';
  h.api.rearmScopeTrigger();
  assert.deepEqual(h.context.waveSamples,original);
  h.api.captureScopeSample({CLK:0,IN0:1});
  h.api.captureScopeSample({CLK:0,IN0:0});
  assert.equal(h.context.scopeCaptureState.status,'triggered','falling IN0 triggers');
});

test('TRIGGERED stays frozen after ENABLE OFF or ON or channel/edge changes until RUN',()=>{
  const h=harness({enabled:true,baseline:{CLK:0,IN0:0}});
  h.api.restartWaveCapture();
  h.api.captureScopeSample({CLK:1,IN0:0});
  assert.equal(h.context.scopeCaptureState.status,'triggered');
  const history=h.context.waveSamples.slice();
  const captured=h.context.scopeCaptureState.levels;
  h.setLive({CLK:0,IN0:1});
  h.context.scopeTriggerEnabled=false;
  h.api.rearmScopeTrigger();
  assert.equal(h.context.scopeCaptureState.status,'triggered');
  assert.equal(h.control.scopeTriggerStatus.textContent,'TRIGGERED');
  assert.equal(h.control.scopeRunBtn.textContent,'RUN');
  assert.equal(h.context.scopeCaptureState.levels,captured);
  assert.deepEqual(h.context.waveSamples,history);
  h.context.scopeTriggerEnabled=true;
  h.api.rearmScopeTrigger();
  h.api.selectScopeTriggerChannel('IN0');
  h.context.scopeTriggerEdge='fall';
  h.api.rearmScopeTrigger();
  h.api.captureScopeSample({CLK:0,IN0:1});
  h.api.captureScopeSample({CLK:0,IN0:0});
  assert.equal(h.context.scopeCaptureState.status,'triggered');
  assert.deepEqual(h.context.waveSamples,history,'settings never restart a frozen capture');
  assert.equal(h.context.intervalId,1,'CPU remains running');
  h.api.toggleScopeCapture(); // explicit RUN
  assert.notEqual(h.context.scopeCaptureState.status,'triggered');
  assert.equal(h.control.scopeTriggerStatus.textContent,'ARMED');
  assert.equal(h.control.scopeRunBtn.textContent,'STOP');
  assert.equal(h.context.waveSamples.length,1,'RUN clears the old trace');
});

test('group changes disable trigger and responsive analyzer never clips taller controls',()=>{
  for(const app of [source,compiled]){
    const start=app.indexOf("('signalGroup').addEventListener('change'");
    const end=app.indexOf("('triggerEnable').addEventListener('change'",start);
    assert.ok(start>-1 && end>start);
    const handler=app.slice(start,end);
    assert.ok(handler.includes('scopeTriggerEnabled = false'));
    assert.ok(handler.includes("('triggerEnable').checked = false"));
    assert.ok(handler.includes('syncScopeTriggerChannel()'));
    assert.ok(handler.includes('restartWaveCapture()'),'group change still starts a new trace');
    const rise=app.slice(app.indexOf("('triggerRiseBtn').addEventListener"),app.indexOf("('triggerFallBtn').addEventListener"));
    assert.ok(rise.includes('rearmScopeTrigger()'));
    assert.ok(!rise.includes('restartWaveCapture()'));
    const fall=app.slice(app.indexOf("('triggerFallBtn').addEventListener"),app.indexOf("('assembleBtn').addEventListener"));
    assert.ok(fall.includes('rearmScopeTrigger()'));
    assert.ok(!fall.includes('restartWaveCapture()'));
  }
  assert.ok(css.includes('.scope-layout>.panel{height:auto;min-height:550px;min-width:0}'), 'both panels share responsive height');
  assert.ok(css.includes('grid-auto-rows:minmax(550px,1fr)'), 'stacked panels keep equal heights');
  assert.ok(css.includes('.scope-panel .scope-view{min-width:0}'));
  assert.ok(!html.includes('id="triggerChannel"'));
  assert.ok(css.includes('.scope-row.is-trigger-channel .scope-channel-button{'));
  assert.ok(css.includes('.scope-row .scope-channel-button{'));
});

test('disabled trigger stays LIVE and samples continuously through both edge directions',()=>{
  const h=harness({enabled:false,baseline:{CLK:0,IN0:0}});
  h.api.syncScopeTriggerChannel();
  h.api.restartWaveCapture();
  assert.equal(h.control.scopeTriggerStatus.textContent,'LIVE');
  for (let i=0;i<100;i++)h.api.captureScopeSample({CLK:i%2,IN0:0});
  assert.notEqual(h.context.scopeCaptureState.status,'triggered');
  assert.equal('levels' in h.context.scopeCaptureState,false);
  assert.equal(h.context.waveSamples.length,80,'rolling window works with trigger disabled');
  assert.equal(h.context.cpu.cycles,12,'CPU unaffected');
  assert.equal(h.context.intervalId,1,'CPU timer remains active');
});

test('TRIGGER ENABLE preserves prior live waveform and catches only the first future edge',()=>{
  const h=harness({enabled:false,baseline:{CLK:0,IN0:0}});
  h.api.restartWaveCapture();
  // A rising edge occurred before the user enabled the trigger.
  h.api.captureScopeSample({CLK:1,IN0:0});
  h.api.captureScopeSample({CLK:0,IN0:0});
  h.api.captureScopeSample({CLK:1,IN0:0});
  assert.notEqual(h.context.scopeCaptureState.status,'triggered');
  const history=h.context.waveSamples.slice();
  // Switch ON while the signal is HIGH. This HIGH is the new baseline, not a trigger.
  h.setLive({CLK:1,IN0:0});
  h.context.scopeTriggerEnabled=true;
  h.api.rearmScopeTrigger();
  assert.equal(h.control.scopeTriggerStatus.textContent,'ARMED');
  assert.equal(h.context.scopeCaptureState.previousLevel,1);
  assert.notEqual(h.context.scopeCaptureState.status,'triggered');
  assert.deepEqual(h.context.waveSamples,history,'ENABLE must not clear prior waveform');
  assert.equal(h.context.intervalId,1,'CPU keeps running during arming');
  h.api.captureScopeSample({CLK:1,IN0:0});
  assert.notEqual(h.context.scopeCaptureState.status,'triggered','high level alone must not trigger');
  h.api.captureScopeSample({CLK:0,IN0:0});
  assert.notEqual(h.context.scopeCaptureState.status,'triggered','wrong-direction edge must not trigger');
  h.api.captureScopeSample({CLK:1,IN0:0});
  assert.equal(h.context.scopeCaptureState.status,'triggered','first subsequent rising edge triggers');
  assert.equal(h.control.scopeTriggerStatus.textContent,'TRIGGERED');
  assert.deepEqual(h.context.waveSamples.slice(0,history.length),history,
    'pre-enable waveform remains visible alongside triggering edge');
  const frozen=h.context.waveSamples.length;
  h.api.captureScopeSample({CLK:0,IN0:0});
  assert.equal(h.context.waveSamples.length,frozen,'frozen history is stable');
});

test('disabling an ARMED trigger continues LIVE and preserves waveform',()=>{
  const h=harness({enabled:true,baseline:{CLK:0,IN0:0}});
  h.api.restartWaveCapture();
  h.api.captureScopeSample({CLK:0,IN0:0});
  const history=h.context.waveSamples.slice();
  h.context.scopeTriggerEnabled=false;
  h.api.rearmScopeTrigger();
  assert.equal(h.control.scopeTriggerStatus.textContent,'LIVE');
  assert.deepEqual(h.context.waveSamples,history);
  h.api.captureScopeSample({CLK:1,IN0:0});
  assert.notEqual(h.context.scopeCaptureState.status,'triggered');
  assert.equal(h.context.waveSamples.length,history.length+1);
});

test('capture status is a single state and frozen variants always carry a snapshot',()=>{
  const h=harness({enabled:true,baseline:{CLK:0,IN0:0}});
  h.api.restartWaveCapture();
  assert.equal(h.context.scopeCaptureState.status,'armed');
  assert.equal('levels' in h.context.scopeCaptureState,false);
  assert.equal(h.context.scopeCaptureState.previousLevel,0);
  h.api.captureScopeSample({CLK:1,IN0:0});
  assert.equal(h.context.scopeCaptureState.status,'triggered');
  assert.deepEqual(h.context.scopeCaptureState.levels,{CLK:1,IN0:0});
  assert.equal('previousLevel' in h.context.scopeCaptureState,false);
  h.context.scopeTriggerEnabled=false;
  h.api.rearmScopeTrigger();
  assert.equal(h.context.scopeCaptureState.status,'triggered','changing config preserves captured state');
  h.api.toggleScopeCapture();
  assert.equal(h.context.scopeCaptureState.status,'live');
  assert.equal('levels' in h.context.scopeCaptureState,false);
  h.api.toggleScopeCapture();
  assert.equal(h.context.scopeCaptureState.status,'stopped');
  assert.ok(h.context.scopeCaptureState.levels);
  h.api.toggleScopeCapture();
  assert.equal(h.context.scopeCaptureState.status,'live');
  assert.equal('levels' in h.context.scopeCaptureState,false);
});

test('STOP freezes only the scope; RUN clears and resumes capture',()=>{
  const h=harness({enabled:false,baseline:{CLK:0,IN0:0}});
  h.api.restartWaveCapture();
  assert.equal(h.control.scopeRunBtn.textContent,'STOP');
  h.api.captureScopeSample({CLK:1,IN0:0});
  h.setLive({CLK:1,IN0:0});
  h.api.toggleScopeCapture();
  assert.equal(h.context.scopeCaptureState.status,'stopped');
  assert.equal(h.control.scopeTriggerStatus.textContent,'STOPPED');
  assert.equal(h.control.scopeRunBtn.textContent,'RUN');
  assert.equal(h.context.scopeCaptureState.levels.CLK,1);
  const history=h.context.waveSamples.slice();
  h.api.captureScopeSample({CLK:0,IN0:0});
  assert.deepEqual(h.context.waveSamples,history);
  assert.equal(h.context.intervalId,1,'CPU keeps running');
  h.api.toggleScopeCapture();
  assert.notEqual(h.context.scopeCaptureState.status,'stopped');
  assert.equal(h.control.scopeRunBtn.textContent,'STOP');
  assert.equal(h.control.scopeTriggerStatus.textContent,'LIVE');
  assert.equal(h.context.waveSamples.length,1,'RUN starts a fresh trace');
  h.api.captureScopeSample({CLK:0,IN0:0});
  assert.equal(h.context.waveSamples.length,2);
});

test('ENABLE click uses no-reset re-arm; RUN and Clear still explicitly clear',()=>{
  for(const app of [source,compiled]){
    const enableStart=app.indexOf("('triggerEnable').addEventListener('change'");
    const riseStart=app.indexOf("('triggerRiseBtn').addEventListener('click'",enableStart);
    assert.ok(enableStart>0&&riseStart>enableStart);
    const enable=app.slice(enableStart,riseStart);
    assert.ok(enable.includes('rearmScopeTrigger()'), 'ENABLE toggles re-arm');
    assert.ok(!enable.includes('restartWaveCapture()'), 'ENABLE must not clear waveform');
    assert.ok(app.includes("('scopeRunBtn').addEventListener('click', toggleScopeCapture)"));
    assert.ok(app.includes("('clearWaveBtn').addEventListener('click', restartWaveCapture)"));
    const rearm=app.slice(app.indexOf('function rearmScopeTrigger('),
      app.indexOf('function selectScopeTriggerChannel('));
    assert.ok(!rearm.includes('waveSamples.splice'), 're-arm leaves samples untouched');
    assert.ok(rearm.includes('previousLevel: powerOn ? levels[scopeTriggerChannel] : null'),
      'sample current level on enable, not historical last edge');
  }
});

test('power-off and on transitions update trigger state while preserving independent clock operations',()=>{
  const h=harness({powerOn:false});
  h.api.syncScopeTriggerStatus();
  assert.equal(h.control.scopeTriggerStatus.textContent,'OFF');
  assert.equal(h.control.scopeRunBtn.disabled,true);
  assert.equal(h.control.scopeRunBtn.textContent,'RUN');
  for(const app of [source,compiled]) {
    assert.ok(app.includes('if (isScopeFrozen() || !shouldCaptureSample('),
      'timer stops writing but is not cleared');
    assert.ok(app.includes("if (!wasFrozen && (scopeCaptureState.status === 'triggered' || intervalId === null"),
      'live board signals cannot overwrite the frozen scope');
    assert.ok(app.includes('updateCircuitBoard();'), 'CPU/board display path remains alive');
    assert.ok(app.includes('restartWaveCapture();'), 'power-on resets trigger');
    assert.ok(app.includes('resetScopeCaptureState();'), 'power-off clears capture state');
    assert.ok(app.includes("scopeCaptureState.status === 'triggered' || scopeCaptureState.status === 'stopped'"),
      'frozen H/L badges show sampled levels');
  }
});
