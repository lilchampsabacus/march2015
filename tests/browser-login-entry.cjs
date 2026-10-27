'use strict';
// Actual pinned SDK and real portal scripts; every external API is synthetic.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const http=require('node:http');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.woff2':'font/woff2'};
const server=http.createServer((req,res)=>{
 const name=new URL(req.url,'http://test').pathname.slice(1);
 if(name.includes('..'))return res.writeHead(400).end();
 if(name==='teacher-dashboard.html')return res.writeHead(200,{'Content-Type':'text/html'}).end('<h1>Staff destination fixture</h1>');
 try{res.writeHead(200,{'Content-Type':types[path.extname(name)]||'application/octet-stream'}).end(fs.readFileSync(path.join(root,name)))}catch{res.writeHead(404).end()}
});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const base='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({headless:true,...(process.env.CHROME_EXECUTABLE_PATH?{executablePath:process.env.CHROME_EXECUTABLE_PATH,args:['--no-sandbox','--disable-gpu']}:{} )});
 const id='11111111-1111-4111-8111-111111111111',email='test.student@example.invalid';
 const now=Math.floor(Date.now()/1000),user={id,email,aud:'authenticated',role:'authenticated',app_metadata:{},user_metadata:{}};
 const jwt=[{alg:'HS256'},{sub:id,aud:'authenticated',role:'authenticated',iat:now,exp:now+3600}].map(v=>Buffer.from(JSON.stringify(v)).toString('base64url')).join('.')+'.fixture';
 const session={access_token:jwt,refresh_token:'fixture',expires_at:now+3600,expires_in:3600,token_type:'bearer',user};
 async function run(name,options={},verify=async()=>{}){
  const context=await browser.newContext({viewport:{width:390,height:844}}),page=await context.newPage();
  const calls=[],errors=[];
  let release,received;
  const held=new Promise(r=>release=r),contextRequested=new Promise(r=>received=r);
  const profile={id,full_name:'Current Student',role:'student',is_active:true,current_level:8,...options.profile};
  const levels={official_level:profile.current_level,plusminus:7,multiplication:7,division:7,...options.levels};
  // Deliberately stale role/name/level hints cannot authorize the dashboard.
  await context.addInitScript(({session,seed})=>{
   if(!sessionStorage.getItem('fixture-seeded')){
    sessionStorage.setItem('fixture-seeded','true');
    for(const [k,v] of Object.entries({isLoggedIn:'true',userRole:'admin',studentIdentifier:'Previous Account',currentLevel:'1'}))sessionStorage.setItem(k,v);
    if(seed)localStorage.setItem('sb-portal-bridge-auth-token',JSON.stringify(session));
   }
  },{session,seed:!!options.direct&&!options.signedOut});
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',async route=>{
   const req=route.request(),url=new URL(req.url());
   if(url.origin===base)return route.continue();
   calls.push({path:url.pathname,method:req.method(),authorization:req.headers().authorization});
   let status=200,body={};
   if(url.pathname==='/auth/v1/token'){
    if(options.badPassword){status=400;body={code:'invalid_credentials',msg:'Invalid login credentials'}}else body=session;
   }else if(url.pathname==='/rest/v1/rpc/portal_startup_context'){
    received();if(options.hold)await held;
    if(options.failure){status=503;body={message:'Temporary service failure'}}else body={profile,practice_levels:levels};
   }else if(url.pathname==='/auth/v1/logout'){status=204;body=null}
   else if(url.pathname==='/auth/v1/user')body=user;
   else if(url.pathname==='/auth/v1/health')body={};
   else if(['/rest/v1/official_daily_practice','/rest/v1/rpc/class_updates_list'].includes(url.pathname))body=[];
   else if(url.pathname==='/functions/v1/speed-accuracy-api')body={};
   else throw Error('Unexpected API request: '+url.pathname);
   await route.fulfill({status,contentType:'application/json',body:status===204?'':JSON.stringify(body)});
  });
  try{
   await page.goto(base+(options.direct?'/practice_options.html':'/login.html'));
   if(!options.direct){
    await page.getByLabel('Email or Username').fill(email);
    await page.getByLabel('Password',{exact:true}).fill('fixture-password');
    if(options.badPassword){await page.getByRole('button',{name:'Log In',exact:true}).click()}
    else await Promise.all([page.waitForURL('**/practice_options.html'),page.getByRole('button',{name:'Log In',exact:true}).click()]);
   }
   if(!options.badPassword&&!options.signedOut)await contextRequested;
   await verify({page,calls,release,context});
   assert(!calls.some(x=>['/rest/v1/profiles','/rest/v1/rpc/student_practice_settings_get'].includes(x.path)),'no repeated profile/settings calls');
   assert.equal(calls.filter(x=>x.path==='/rest/v1/rpc/portal_startup_context').length,options.badPassword||options.signedOut?0:1,'one fresh portal request');
   assert(calls.filter(x=>x.path.startsWith('/rest/v1/')).every(x=>x.authorization==='Bearer '+jwt),'authenticated API access');
   assert.deepEqual(errors,[]);console.log('PASS: '+name);
  }finally{release();await context.close()}
 }
 try{
  await run('password login waits for fresh levels and ignores stale browser hints',{hold:true},async({page,release})=>{
   await page.locator('#practice-startup').waitFor({state:'visible'});
   assert.equal(await page.locator('a[href="multiplication.html"]').isVisible(),false);
   release();await page.locator('#practice-startup').waitFor({state:'detached'});
   assert.equal(await page.locator('#welcome-name').innerText(),'Current Student');
   assert((await page.locator('#student-level').innerText()).includes('Level 8'));
   const hints=await page.evaluate(()=>({role:sessionStorage.getItem('userRole'),level:sessionStorage.getItem('currentLevel')}));
   assert.deepEqual(hints,{role:'student',level:'8'});
  });
  for(const role of ['teacher','admin'])await run(role+' routes to the staff dashboard',{profile:{role}},async({page})=>{
   await page.waitForURL('**/teacher-dashboard.html');
   assert.equal(await page.locator('#official-daily-practice-card').count(),0);
   assert.equal(await page.evaluate(()=>sessionStorage.getItem('userRole')),role);
  });
  for(const [label,profile,message] of [
   ['inactive student',{is_active:false},'deactivated'],
   ['inactive teacher',{is_active:false,role:'teacher'},'deactivated'],
   ['completed course',{current_level:9},'Course Completed']
  ])await run(label+' is signed out with a clear message',{profile},async({page,calls})=>{
   await page.waitForURL('**/login.html');
   await page.getByText(new RegExp(message)).waitFor({state:'visible'});
   assert(calls.some(x=>x.path==='/auth/v1/logout'));
   assert.equal(await page.evaluate(()=>sessionStorage.getItem('isLoggedIn')),null);
   assert.equal(await page.evaluate(()=>localStorage.getItem('sb-portal-bridge-auth-token')),null);
  });
  for(const [label,options] of [
   ['failed startup request',{failure:true}],
   ['wrong account in response',{profile:{id:'another-user'}}],
   ['invalid batch settings',{levels:{multiplication:9}}]
  ])await run(label+' stays locked',options,async({page})=>{
   await page.getByRole('heading',{name:'Practice Locked',exact:true}).waitFor({state:'visible'});
   assert.equal(await page.locator('#official-daily-practice-card').count(),0);
  });
  await run('wrong password does not start account checks',{badPassword:true},async({page})=>{
   await page.getByText('❌ Login Failed. Check Password.',{exact:true}).waitFor({state:'visible'});
   assert.equal(new URL(page.url()).pathname,'/login.html');
   assert.equal(await page.locator('#loginBtn').isEnabled(),true);
  });
  await run('direct dashboard visit checks current settings',{direct:true,profile:{current_level:2},levels:{plusminus:2,multiplication:2,division:2}},async({page})=>{
   await page.locator('#practice-startup').waitFor({state:'detached'});
   assert.equal(await page.locator('a[href][data-level-locked="1"]').count(),0); // Locked anchors lose href.
   assert.equal(await page.locator('[data-level-locked="1"]').count(),2);
   assert.equal(await page.locator('a[href="Level1and2.html"]').isVisible(),true);
  });
  await run('saved hints without an auth session return to login',{direct:true,signedOut:true},async({page})=>{
   await page.waitForURL('**/login.html');assert.equal(await page.locator('#official-daily-practice-card').count(),0);
  });
 }finally{await browser.close();await new Promise(r=>server.close(r))}
})().catch(error=>{console.error(error);server.close();process.exitCode=1});
