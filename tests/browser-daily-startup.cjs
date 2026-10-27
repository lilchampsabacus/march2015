'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const http=require('node:http');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.woff2':'font/woff2'};
const server=http.createServer((req,res)=>{
 const name=new URL(req.url,'http://test').pathname.slice(1);if(name.includes('..')){res.writeHead(400).end();return}
 try{res.writeHead(200,{'Content-Type':types[path.extname(name)]||'application/octet-stream'}).end(fs.readFileSync(path.join(root,name)))}catch{res.writeHead(404).end()}
});
const userId='11111111-1111-4111-8111-111111111111';
const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const makeQuestions=()=>({plusminus:Array.from({length:10},()=>({kind:'pm',digits:1,rows:3,terms:[1,2,3]})),multiplication:Array.from({length:10},()=>({kind:'mul',a:12,b:3,label:'2×1'})),division:Array.from({length:10},()=>({kind:'div',dividend:36,divisor:3,label:'2÷1'})),_practice_levels:{plusminus:7,multiplication:7,division:7}});
const makeAssignment=(patch={})=>({id:'22222222-2222-4222-8222-222222222222',user_id:userId,student_name:'Test Student',level:8,practice_date:today,questions:makeQuestions(),responses:{},completed_sections:[],section_seconds:{},status:'not_started',...patch});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({headless:true,...(process.env.CHROME_EXECUTABLE_PATH?{executablePath:process.env.CHROME_EXECUTABLE_PATH,args:['--no-sandbox','--disable-gpu']}:{} )});
 async function runCase(name,options={},verify=async()=>{}){
  const context=await browser.newContext({viewport:{width:390,height:844}});const page=await context.newPage();const requests=[],errors=[];
  const profile={id:userId,full_name:'Test Student',current_level:8,role:'student',is_active:true,...options.profile};
  const levels={official_level:profile.current_level,plusminus:7,multiplication:7,division:7,...options.levels};
  let assignment=options.assignment||null,retry=null;const original=assignment?JSON.stringify(assignment):null;
  const now=Math.floor(Date.now()/1000),user={id:userId,email:'test@example.invalid',aud:'authenticated',role:'authenticated',app_metadata:{},user_metadata:{}};
  const jwt=[{alg:'HS256'},{sub:userId,aud:'authenticated',role:'authenticated',iat:now,exp:now+3600}].map(x=>Buffer.from(JSON.stringify(x)).toString('base64url')).join('.')+'.fixture';
  await context.addInitScript(({session})=>{sessionStorage.setItem('isLoggedIn','true');sessionStorage.setItem('studentIdentifier','Test Student');sessionStorage.setItem('currentLevel','8');localStorage.setItem('sb-portal-bridge-auth-token',JSON.stringify(session))},{session:{access_token:jwt,refresh_token:'fixture',expires_at:now+3600,expires_in:3600,token_type:'bearer',user}});
  page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/*',async route=>{
   const req=route.request(),url=new URL(req.url());if(url.origin===base)return route.continue();
   requests.push({path:url.pathname,method:req.method(),payload:req.method()==='POST'||req.method()==='PATCH'?req.postDataJSON():null});
   const entry=requests[requests.length-1];let body={},status=200;
   if(url.pathname==='/rest/v1/rpc/student_daily_practice_context'){
    body={profile,practice_levels:levels,assignment,practice_date:today,...options.context};
    if(options.failure){status=403;body={message:'Access denied',code:'42501'}}
   }else if(url.pathname==='/rest/v1/official_daily_practice'){
    if(req.method()==='POST'){
     if(options.duplicate){status=409;body={code:'23505',message:'Already created'};assignment=options.raceWinner}
     else{assignment={...entry.payload,id:'33333333-3333-4333-8333-333333333333'};body=assignment;status=201}
    }else if(req.method()==='PATCH'){assignment={...assignment,...entry.payload};body=assignment}
    else body=assignment;
   }else if(url.pathname==='/rest/v1/official_daily_practice_retries'){
    if(req.method()==='POST'){retry={...entry.payload,id:'44444444-4444-4444-8444-444444444444'};status=201}else retry={...retry,...entry.payload};body=retry;
   }else if(url.pathname==='/auth/v1/health')body={};
   else throw new Error('Unexpected request '+url.pathname);
   return route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)});
  });
  try{
   await page.goto(base+'/daily-practice.html',{waitUntil:'networkidle'});
   const reads=requests.filter(x=>x.path==='/rest/v1/rpc/student_daily_practice_context');
   assert.equal(reads.length,1,name+': one startup read');
   assert(!requests.some(x=>x.path==='/rest/v1/profiles'||x.path==='/rest/v1/rpc/student_practice_settings_get'),name+': no duplicate profile or level reads');
   await verify({page,requests,getAssignment:()=>assignment,getRetry:()=>retry,original});
   assert.deepEqual(errors,[],name+': no JavaScript errors');
   console.log('PASS: '+name);
  }finally{await context.close()}
 }
 try{
  await runCase('new assignment uses verified batch levels',{},async({page,requests,getAssignment})=>{
   await page.locator('.section-card').first().waitFor({state:'visible'});
   assert.equal(requests.filter(x=>x.path==='/rest/v1/official_daily_practice'&&x.method==='POST').length,1);
   const row=getAssignment();assert.equal(row.level,8);assert.equal(row.practice_date,today);assert.equal(row.questions._practice_levels.multiplication,7);
   assert.deepEqual([...new Set(row.questions.multiplication.map(q=>q.label))].sort(),['2×2','3×2']);
  });
  const saved=makeAssignment({status:'in_progress',responses:{_active:'multiplication',multiplication:[{answer:36,correct:true,skipped:false}]},section_seconds:{multiplication:14}});
  await runCase('existing attempt resumes without regeneration',{assignment:saved,levels:{multiplication:8}},async({page,requests,getAssignment,original})=>{
   assert((await page.locator('#question-progress').textContent()).includes('Question 2'));
   assert.equal(JSON.stringify(getAssignment()),original);assert(!requests.some(x=>x.method==='POST'&&x.path==='/rest/v1/official_daily_practice'));
   assert.equal(getAssignment().questions._practice_levels.multiplication,7);
  });
  const done=makeAssignment({status:'completed',completed_sections:['plusminus','multiplication','division'],responses:{plusminus:Array.from({length:10},()=>({answer:6,correct:true})),multiplication:Array.from({length:10},()=>({skipped:true,correct:false})),division:Array.from({length:10},()=>({skipped:true,correct:false}))}});
  for(const section of ['multiplication','division'])await runCase('completed attempt preserves '+section+' skipped-sum retries',{assignment:JSON.parse(JSON.stringify(done))},async({page,getAssignment,getRetry,original})=>{
   await page.locator(`[data-retry="${section}|skipped"]`).click();await page.locator('#question-screen').waitFor({state:'visible'});
   assert.equal(getRetry().questions.length,10);assert.deepEqual(getRetry().questions,getAssignment().questions[section]);assert.equal(JSON.stringify(getAssignment()),original);
  });
  const winner=makeAssignment({responses:{plusminus:[{answer:6,correct:true}]},status:'in_progress'});
  await runCase('two-tab race reuses the winning saved assignment',{duplicate:true,raceWinner:winner},async({page,getAssignment})=>{
   await page.locator('.section-card').first().waitFor({state:'visible'});assert.deepEqual(getAssignment().responses,winner.responses);
  });
  for(const [name,options] of [['failed server verification',{failure:true}],['wrong user in context',{context:{profile:{id:'other-user'}}}],['invalid practice levels',{levels:{official_level:7}}]])await runCase(name,options,async({page,requests})=>{
   await page.locator('#error-screen').waitFor({state:'visible'});assert(!requests.some(x=>x.method==='POST'&&x.path==='/rest/v1/official_daily_practice'));
  });
  for(const [name,profile] of [['Level 1',{current_level:1}],['staff',{role:'teacher'}]])await runCase(name+' stays locked',{profile},async({page,requests})=>{
   await page.locator('#locked').waitFor({state:'visible'});assert(!requests.some(x=>x.method==='POST'&&x.path==='/rest/v1/official_daily_practice'));
  });
 }finally{await browser.close();await new Promise(r=>server.close(r))}
})().catch(error=>{console.error(error);server.close();process.exitCode=1});
