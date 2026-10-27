'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const {pages, buildPage} = require('../scripts/build-practice-pages.cjs');
const read = file => fs.readFileSync(file, 'utf8');

for (const [name, kind] of Object.entries(pages)) {
  const html = read(name + '.html');
  assert.equal(html, buildPage(name, kind), name + ': generated page is current');
  assert(!html.includes('level-page-loader.js'), name + ': no second HTML fetch');
  assert.equal((html.match(/<script[^>]+src="assets\/vendor\/supabase-js-2\.118\.0\.js"/g)||[]).length, 1, name + ': one library load');
  assert(html.includes('id="levelAccessHide"') && html.includes('id="practice-startup"'), name + ': starts protected with loading feedback');
  for (const script of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)) {
    if (script[1].trim()) new vm.Script(script[1], {filename:name + '.html inline'});
  }
}

function harness(options = {}) {
  const profile = {id:'test-user',role:'student',is_active:true,full_name:'Test Student',current_level:8,...options.profile};
  const plan = {official_level:profile.current_level,plusminus:7,multiplication:7,division:7,...options.plan};
  const calls = [];
  const nodes = new Map();
  function element(id) {
    return {id,style:{},dataset:{},textContent:'',innerHTML:'',remove(){nodes.delete(id)},addEventListener(){},
      setAttribute(){},classList:{add(){},remove(){}},querySelector(){return null},querySelectorAll(){return []}};
  }
  for (const id of ['levelAccessHide','practice-startup','classUpdates','updateList','updateCount','updateStatus']) nodes.set(id,element(id));
  const grid = {parentElement:{insertBefore(el){nodes.set(el.id,el)}}};
  const store = new Map([['currentLevel','8']]);
  let resolveProfile;
  const profileWait = options.holdProfile ? new Promise(r=>resolveProfile=r) : Promise.resolve();
  const client = {
    auth:{getSession:async()=>{calls.push('session');return {data:{session:options.signedOut?null:{user:{id:'test-user',email:'test@example.invalid'},access_token:'test-only'}}}},getUser:async()=>{calls.push('getUser');return {data:{user:{id:'test-user'}}}}},
    from(table){calls.push(table);const chain={select(){return chain},eq(){return chain},
      single:async()=>{await profileWait;calls.push('profile-resolved');return options.profileError?{error:{message:'Profile failed'}}:{data:profile}},
      maybeSingle:async()=>({data:{status:'completed',completed_sections:['plusminus','multiplication','division']}})};return chain},
    rpc(name){calls.push(name);if(name==='portal_startup_context')return Promise.resolve(options.profileError||options.settingsError?{error:{message:'Context failed'}}:{data:{profile,practice_levels:plan}});if(name==='student_practice_settings_get')return Promise.resolve(options.settingsError?{error:{message:'Settings failed'}}:{data:plan});return Promise.resolve({data:[]})}
  };
  const document = {readyState:'complete',currentScript:{dataset:{page:options.page||'practice-options'}},documentElement:{style:{}},body:{innerHTML:''},
    getElementById:id=>nodes.get(id)||null,createElement:()=>element(''),querySelector:selector=>selector.includes('main')?grid:null,querySelectorAll:()=>[],head:{appendChild(){}}};
  const context=vm.createContext({document,console:{error(){},warn(){}},Event:class{},URLSearchParams,Intl,Date,Number,Set,Map,Array,Promise,
    sessionStorage:{getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v)},localStorage:{getItem:()=>null,setItem(){}},
    fetch:async()=>({ok:true,json:async()=>({})}),location:{search:options.search||'',replace:url=>calls.push('redirect:'+url)},
    setTimeout,window:{dispatchEvent(){},supabase:{createClient(){calls.push('client');return client}}}});
  return {context,calls,nodes,document,release:()=>resolveProfile?.(),run:file=>vm.runInContext(read(file),context)};
}
const tick=()=>new Promise(r=>setImmediate(r));
(async()=>{
  // Both requests must start even while the profile is still waiting on the network.
  const plus=harness({page:'plus-minus',holdProfile:true});
  plus.run('plus-minus-access.js');await tick();
  assert(plus.calls.includes('profiles') && plus.calls.includes('student_practice_settings_get'));
  assert(!plus.calls.includes('profile-resolved'));
  assert(plus.nodes.has('levelAccessHide'));
  plus.release();await tick();await tick();
  assert(!plus.nodes.has('levelAccessHide') && !plus.nodes.has('practice-startup'));

  const dashboard=harness();dashboard.run('level-access.js');
  await dashboard.context.window.practiceDashboardContext;
  await dashboard.run('daily-card.js');dashboard.run('class-updates.js');await tick();await tick();
  assert.equal(dashboard.calls.filter(x=>x==='portal_startup_context').length,1,'one fresh account and settings request');
  assert(!dashboard.calls.includes('profiles')&&!dashboard.calls.includes('student_practice_settings_get'),'no separate dashboard reads');
  assert.equal(dashboard.calls.filter(x=>x==='client').length,1,'one shared Supabase client');
  assert.equal(dashboard.calls.filter(x=>x==='session').length,1,'one shared session lookup');
  assert(!dashboard.calls.includes('getUser'),'no duplicate auth request for class updates');
  assert(dashboard.calls.includes('official_daily_practice'));
  assert(dashboard.calls.includes('class_updates_list'));
  assert(dashboard.nodes.has('official-daily-practice-card'));

  for(const options of [{settingsError:true},{plan:{official_level:7}},{plan:{plusminus:9}},{profileError:true}]){
    const test=harness(options);test.run('level-access.js');await test.context.window.practiceDashboardContext;
    await test.run('daily-card.js');assert(test.document.body.innerHTML.includes('Practice Locked'));
    assert(!test.nodes.has('official-daily-practice-card'),'failed verification cannot render daily cards');
  }
  for(const file of ['level-access.js','plus-minus-access.js','low-level-access.js']){
    const out=harness({page:'negative',signedOut:true});out.run(file);await tick();assert(out.calls.includes('redirect:login.html'));
    const inactive=harness({page:'negative',profile:{is_active:false}});inactive.run(file);await tick();await tick();assert(inactive.calls.includes('redirect:login.html'));
  }
  // Official Level 8 with Level 7 practice must not gain a Level 8-only division type.
  for(const [type,locked] of [['div-5d2d',false],['div-5d3d',true]]){
    const test=harness({page:'division-master',search:'?type='+type});test.run('level-access.js');await tick();await tick();
    assert.equal(test.document.body.innerHTML.includes('Practice Locked'),locked);
  }
  for(const level of [1,2,3,4,5,6,7,8]){
    const test=harness({page:'formula-report',profile:{current_level:level}});test.run('low-level-access.js');await tick();await tick();
    assert.equal(test.document.body.innerHTML.includes('Formula Practice Report Locked'),level>2);
    assert(!test.nodes.has('practice-startup'));
  }
  console.log('PASS: direct HTML, script syntax, parallel requests, one shared dashboard lookup, status loading, access failures, inactive users and subject-level restrictions.');
})().catch(error=>{console.error(error);process.exitCode=1});
