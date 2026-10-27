'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
function setup(){
  const scripts=[],alerts=[],timers=[];
  const button={tagName:'BUTTON',textContent:'Download Report',innerHTML:'Download Report',disabled:false};
  const window={alert:message=>alerts.push(message)};
  const context=vm.createContext({window,Map,WeakMap,Promise,
    console:{error(){},warn(){}},
    setTimeout:fn=>{timers.push(fn);return timers.length-1},clearTimeout:id=>{timers[id]=null},
    document:{activeElement:button,createElement:()=>({remove(){this.removed=true}}),head:{appendChild:script=>scripts.push(script)}}});
  vm.runInContext(fs.readFileSync('optional-features.js','utf8'),context);
  return {api:window.lilChampsOptional,window,scripts,alerts,timers,button};
}
const target=()=>({busy:false,setAttribute(){this.busy=true},removeAttribute(){this.busy=false}});
(async()=>{
  // Older cached HTML may still load the revised game script without the helper.
  const game=fs.readFileSync('gamify.js','utf8');
  const celebrate=game.slice(game.indexOf('function triggerWinConfetti()'),game.indexOf('function sanitizeString'));
  assert.doesNotThrow(()=>vm.runInNewContext(celebrate+'\ntriggerWinConfetti();',{window:{}}));
  const test=setup();assert.equal(test.scripts.length,0,'no optional downloads at startup');
  const report=target();let captured=0,saved=0;
  const first=test.api.captureReport(report,{scale:2},canvas=>{assert.equal(canvas.image,'png');saved++});
  assert.equal(test.api.captureReport(report,()=>saved++),first,'repeat taps share the same capture');
  assert.equal(test.scripts.length,1);assert(test.scripts[0].src.includes('html2canvas/1.4.1'));
  assert(report.busy && test.button.disabled);
  test.window.html2canvas=async(el,options)=>{assert.equal(el,report);assert.equal(options.scale,2);captured++;return {image:'png'}};
  test.scripts[0].onload();await first;
  assert.equal(captured,1);assert.equal(saved,1);assert(!report.busy && !test.button.disabled);
  assert.equal(test.button.innerHTML,'Download Report');
  await test.api.captureReport(report,{scale:2},()=>saved++);
  assert.equal(test.scripts.length,1,'reuse the library after the first download');assert.equal(saved,2);

  const failed=setup();const item=target();const bad=failed.api.captureReport(item,()=>assert.fail('failed capture must not save'));
  failed.scripts[0].onerror();assert.equal(await bad,null);assert.equal(failed.alerts.length,1);assert(!item.busy && !failed.button.disabled);
  const retry=failed.api.captureReport(item,()=>{});assert.equal(failed.scripts.length,2,'failure can be retried');
  failed.window.html2canvas=async()=>({});failed.scripts[1].onload();await retry;

  const timed=setup();const slow=timed.api.captureReport(target(),()=>{});timed.timers[0]();assert.equal(await slow,null);assert(timed.scripts[0].removed);
  const celebration=setup();let wins=0;
  const one=celebration.api.withConfetti(fire=>fire({})),two=celebration.api.withConfetti(fire=>fire({}));
  assert.equal(celebration.scripts.length,1);assert(celebration.scripts[0].src.includes('canvas-confetti@1.6.0'));
  celebration.window.confetti=()=>wins++;celebration.scripts[0].onload();await Promise.all([one,two]);assert.equal(wins,2);
  const offline=setup();const optional=offline.api.withConfetti(()=>assert.fail());offline.scripts[0].onerror();await optional;assert.equal(offline.alerts.length,0,'celebration failure never interrupts practice');
  console.log('PASS: no startup downloads; report options, saving, repeat taps, reuse, failure/retry, timeout and optional celebrations.');
})().catch(error=>{console.error(error);process.exitCode=1});
