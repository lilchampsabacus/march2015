'use strict';
// Exercise the actual vendored SDKs with a synthetic API, never the live database.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const http=require('node:http');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.woff2':'font/woff2','.webp':'image/webp'};
const server=http.createServer((req,res)=>{
 const name=decodeURIComponent(new URL(req.url,'http://test').pathname).replace(/^\//,'');
 if(name.includes('..')){res.writeHead(400).end();return}
 if(name==='sdk-test.html'){res.writeHead(200,{'Content-Type':'text/html'}).end('<!doctype html><script src="assets/vendor/supabase-js-2.49.8.js"></script><p>SDK test</p>');return}
 try{const data=fs.readFileSync(path.join(root,name));res.writeHead(200,{'Content-Type':types[path.extname(name)]||'application/octet-stream'}).end(data)}catch{res.writeHead(404).end()}
});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({headless:true,...(process.env.CHROME_EXECUTABLE_PATH?{executablePath:process.env.CHROME_EXECUTABLE_PATH,args:['--no-sandbox','--disable-gpu']}:{} )});
 try{
  const context=await browser.newContext({viewport:{width:390,height:844}});const page=await context.newPage();
  const failures=[],external=[],api=[],assets=[];
  const id='11111111-1111-4111-8111-111111111111',email='test.student@example.invalid',now=Math.floor(Date.now()/1000);
  const user={id,email,aud:'authenticated',role:'authenticated',app_metadata:{provider:'email',providers:['email']},user_metadata:{},created_at:new Date().toISOString()};
  const jwt=[{alg:'HS256',typ:'JWT'},{sub:id,email,aud:'authenticated',role:'authenticated',iat:now,exp:now+3600}].map(v=>Buffer.from(JSON.stringify(v)).toString('base64url')).join('.')+'.fixture';
  const session={access_token:jwt,refresh_token:'test-refresh',expires_in:3600,expires_at:now+3600,token_type:'bearer',user};
  const profile={id,full_name:'Test Student',current_level:8,role:'student',is_active:true,student_status:'active'};
  page.on('pageerror',error=>failures.push(error.message));
  await page.route('**/*',async route=>{
   const request=route.request(),url=new URL(request.url());
   if(url.origin===base){assets.push(url.pathname);return route.continue()}
   if(url.host==='portal-bridge.ucmas-ambernath-pg.workers.dev'||url.host==='ipakwgzbbjywzccoahiw.supabase.co'){
    api.push({path:url.pathname,method:request.method(),authorization:request.headers().authorization});
    let body={};
    if(url.pathname==='/auth/v1/token'){
     assert.deepEqual(request.postDataJSON(),{email,password:'fixture-password',gotrue_meta_security:{}});
     body=session;
    }else if(url.pathname==='/auth/v1/user')body=user;
    else if(url.pathname==='/rest/v1/profiles')body=profile;
    else if(url.pathname==='/rest/v1/rpc/student_practice_settings_get')body={official_level:8,plusminus:7,multiplication:7,division:7};
    else if(url.pathname==='/rest/v1/official_daily_practice'||url.pathname==='/rest/v1/rpc/class_updates_list')body=[];
    return route.fulfill({contentType:'application/json',body:JSON.stringify(body)});
   }
   external.push(url.href);return route.abort();
  });
  await page.goto(base+'/login.html',{waitUntil:'networkidle'});
  const loaded=await page.evaluate(async()=>{const faces=await document.fonts.load('800 16px Nunito');return faces.length>0&&faces.every(face=>face.status==='loaded')});
  assert(loaded,'Nunito WOFF2 loads without Google servers');
  await page.getByLabel('Email or Username').fill(email);await page.getByLabel('Password',{exact:true}).fill('fixture-password');
  await Promise.all([page.waitForURL('**/practice_options.html'),page.getByRole('button',{name:'Log In',exact:true}).click()]);
  await page.locator('#practice-startup').waitFor({state:'detached'});
  assert.equal(await page.locator('#welcome-name').innerText(),'Test Student');
  assert((await page.locator('#student-level').innerText()).includes('Level 8'));
  await page.locator('#official-daily-practice-card').waitFor({state:'visible'});
  const dashboard=await page.evaluate(()=>{
   const card=document.getElementById('official-daily-practice-card');
   const start=card.querySelector('a[href^="daily-practice.html"]');
   const bounds=start.getBoundingClientRect();
   return {first:card.parentElement.firstElementChild===card,visible:bounds.top>=0&&bounds.bottom<=innerHeight,
    reminders:[...document.querySelectorAll('main p')].filter(p=>/physical abacus/i.test(p.textContent)).length};
  });
  assert(dashboard.first,'Daily Practice is the first dashboard section');
  assert(dashboard.visible,'the entire Daily Practice card is visible on mobile without scrolling');
  assert(dashboard.reminders>=2,'both the compact and full physical-abacus reminders remain');
  await page.getByRole('link',{name:/Multiplication/i}).first().click();
  await page.locator('#practice-startup').waitFor({state:'detached'});
  assert((await page.locator('#current-level-title').innerText()).includes('Level 7'));
  assert.equal(api.filter(x=>x.path==='/auth/v1/token').length,1,'login session persists between pages');
  const key=/eyJhbGci[^\s'";]+/.exec(fs.readFileSync(path.join(root,'login.html'),'utf8'))[0];
  await page.goto(base+'/sdk-test.html');
  const retained=await page.evaluate(async key=>{
   const client=window.supabase.createClient('https://portal-bridge.ucmas-ambernath-pg.workers.dev',key);
   const {data,error}=await client.auth.getSession();if(error)throw error;return data.session?.user?.id;
  },key);
  assert.equal(retained,id,'older pinned SDK reads the same saved login');
  const secured=api.filter(x=>x.path.startsWith('/rest/v1/'));
  assert(secured.length>0 && secured.every(x=>x.authorization==='Bearer '+jwt),'the actual SDK attaches the authenticated session');
  assert(assets.some(x=>x.endsWith('/supabase-js-2.118.0.js'))&&assets.some(x=>x.endsWith('/supabase-js-2.49.8.js')));
  assert(assets.some(x=>x.endsWith('.woff2')));
  assert.deepEqual(failures,[]);assert.deepEqual(external,[],'login, dashboard and menus need no external scripts or fonts');
  await context.close();
  console.log('PASS: actual local SDK login, session persistence, authenticated requests, batch practice level, older SDK compatibility and Nunito font loading.');
 }finally{await browser.close();await new Promise(r=>server.close(r))}
})().catch(error=>{console.error(error);server.close();process.exitCode=1});
