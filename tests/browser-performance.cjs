'use strict';
// Uses synthetic student data only. No requests reach the production database.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const http=require('node:http');
const {execFileSync}=require('node:child_process');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
const fixtureScript=`
window.supabase={createClient(){
 const level=window.testLevel||8;
 const profile={id:'test',full_name:'Test Student',role:'student',is_active:true,current_level:level};
 const row={id:'practice-test',student_name:'Test Student',level,practice_date:'2026-10-27',questions:{plusminus:Array.from({length:10},()=>({kind:'pm',digits:1,rows:3,terms:[1,2,3]})),multiplication:Array.from({length:10},()=>({kind:'mul',a:12,b:3,label:'2×1'})),division:Array.from({length:10},()=>({kind:'div',a:12,b:3,label:'2÷1'}))},responses:{},completed_sections:[],section_seconds:{},status:'not_started'};
 return {auth:{getSession:async()=>({data:{session:{user:{id:'test',email:'test@example.invalid'},access_token:'fixture'}}}),getUser:async()=>({data:{user:{id:'test'}}})},from(table){
  const result=()=>({data:table==='profiles'?profile:table==='official_daily_practice'?row:[]});
  const chain={};for(const method of ['select','eq','order','limit','gte','lte','in','insert'])chain[method]=()=>chain;
  chain.update=patch=>{Object.assign(row,patch);return chain};chain.single=chain.maybeSingle=async()=>result();chain.then=(resolve,reject)=>Promise.resolve(result()).then(resolve,reject);return chain;
 },rpc:async name=>({data:name==='student_practice_settings_get'?{official_level:level,plusminus:Math.min(level,7),multiplication:Math.min(level,7),division:Math.min(level,7)}:name==='student_formula_practice_context'?{formula_ids:['sf_p4'],batch_name:'Test Batch'}:[]})};
}};`;
const mime={'.html':'text/html','.css':'text/css','.js':'text/javascript','.webp':'image/webp','.png':'image/png','.woff2':'font/woff2'};
const server=http.createServer((req,res)=>{
 const pathname=decodeURIComponent(new URL(req.url,'http://test').pathname);
 const before=pathname.startsWith('/before/');const file=pathname.replace(/^\/(before|after)\//,'');
 if(file.includes('..')){res.writeHead(400).end();return}
 try{
  const body=before?execFileSync('git',['show','a6e99a4:'+file],{cwd:root,stdio:['ignore','pipe','ignore']}):fs.readFileSync(path.join(root,file));
  res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream'});res.end(body);
 }catch{res.writeHead(404).end()}
});
(async()=>{
 const tailwind=fs.readFileSync(process.env.QA_TAILWIND||'/tmp/lilchamps-tailwind.js','utf8');
 const renderer=fs.readFileSync(process.env.QA_HTML2CANVAS||'/tmp/lilchamps-html2canvas.js','utf8');
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({headless:true,...(process.env.CHROME_EXECUTABLE_PATH?{executablePath:process.env.CHROME_EXECUTABLE_PATH,args:['--no-sandbox','--disable-gpu']}:{} )});
 try{
  const cases=[
   ['login.html',8,['#loginBtn','input']],
   ['practice_options.html',8,['header','a[href="plus_minus.html"]','#daily-level-copy']],
   ['plus_minus.html',8,['header','a.practice-card']],
   ['multiplication.html',8,['#current-level-title','.practice-card:not(.hidden)']],
   ['division.html',8,['#current-level-title','.practice-card:not(.hidden)']],
   ['multiplication-master.html?type=mul-3x2',8,['#dynamic-mission-heading','button']],
   ['daily-practice.html',8,['#question-screen','.num-btn']],
   ['Level1and2.html',2,['#game-screen','.key','.number-cell']],
   ['MistakeTracker.html',8,['textarea','.text-brand']]
  ];
  for(const viewport of [{width:390,height:844},{width:1280,height:900}]){
   for(const [file,level,selectors] of cases){
    const styles=[];
    for(const version of ['before','after']){
     const context=await browser.newContext({viewport,acceptDownloads:true});const page=await context.newPage();const errors=[],requests=[];
     page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>requests.push(r.url()));
     await context.addInitScript(level=>{window.testLevel=level;sessionStorage.setItem('isLoggedIn','true');sessionStorage.setItem('studentIdentifier','Test Student');sessionStorage.setItem('currentLevel',String(level))},level);
     await page.route('**/*',async route=>{
      const url=route.request().url();
      if(url.includes('/assets/vendor/supabase-js-'))return route.fulfill({contentType:'text/javascript',body:fixtureScript});
      if(url.startsWith(base))return route.continue();
      if(url.includes('cdn.tailwindcss.com'))return route.fulfill({contentType:'text/javascript',body:tailwind});
      if(url.includes('@supabase/supabase-js'))return route.fulfill({contentType:'text/javascript',body:fixtureScript});
      if(url.includes('fonts.googleapis.com')&&url.includes('Nunito')){
       const font=/Nunito[^&]*900/.test(url)?'nunito-900.css':'nunito.css';
       const css=fs.readFileSync(path.join(root,'assets/fonts',font),'utf8').replace(/url\(([^)]+)\)/g,(_,file)=>`url(${base}/after/assets/fonts/${file})`);
       return route.fulfill({contentType:'text/css',body:css});
      }
      if(url.includes('html2canvas'))return route.fulfill({contentType:'text/javascript',body:renderer});
      if(url.includes('canvas-confetti'))return route.fulfill({contentType:'text/javascript',body:'window.confetti=()=>{window.testCelebrations=(window.testCelebrations||0)+1}'});
      return route.fulfill({contentType:url.includes('fonts.')?'text/css':'application/json',body:url.includes('fonts.')?'':'{}'});
     });
     await page.goto(base+'/'+version+'/'+file,{waitUntil:'networkidle'});
     await page.evaluate(()=>document.fonts.ready);
     if(file==='daily-practice.html'){await page.locator('.section-card').first().click();await page.locator('.num-btn').first().waitFor({state:'visible'});}
     if(file==='Level1and2.html'){await page.locator('.category-card').first().click();await page.locator('.formula-card').first().click();await page.locator('.key').first().waitFor({state:'visible'});}
     await page.waitForTimeout(150);
     const data=await page.evaluate(selectors=>selectors.map(selector=>{
      const el=document.querySelector(selector);if(!el)throw Error('Missing '+selector);const s=getComputedStyle(el);
      return Object.fromEntries(['display','color','backgroundColor','fontSize','fontWeight','padding','borderRadius','gridTemplateColumns','visibility'].map(k=>[k,s[k]]));
     }),selectors);styles.push(data);
     assert.deepEqual(errors,[],file+' '+version+' JS errors');
     if(version==='after'){
      assert(!requests.some(u=>/cdn.tailwindcss|html2canvas|canvas-confetti/.test(u)),file+': optional libraries absent from startup');
      assert(!requests.some(u=>u.includes('fonts.googleapis.com')&&u.includes('Nunito')),file+': Nunito does not use Google servers');
      if(file.startsWith('multiplication-master')){
       await page.evaluate(()=>{document.getElementById('report-area').classList.remove('hidden');document.getElementById('report-card').scrollIntoView()});
       const download=page.waitForEvent('download');await page.evaluate(()=>downloadReport());const saved=await download;
       assert(fs.statSync(await saved.path()).size>1000,'report PNG was generated');
       assert.equal(requests.filter(u=>u.includes('html2canvas')).length,1);
       await page.evaluate(()=>window.lilChampUtils.celebrate());
       await page.waitForFunction(()=>window.testCelebrations===2);
       assert.equal(requests.filter(u=>u.includes('canvas-confetti')).length,1);
      }
      if(viewport.width===390 && ['login.html','daily-practice.html','Level1and2.html'].includes(file))await page.screenshot({path:'/tmp/lilchamps-'+file.replace('.html','')+'.png'});
     }
     await context.close();
    }
    assert.deepEqual(styles[1],styles[0],file+': styling matches before/after at '+viewport.width+'px');
   }
  }
  console.log('PASS: 9 screens at mobile/desktop sizes match existing styles; optional startup requests removed; real report PNG and celebration load on demand.');
 }finally{await browser.close();await new Promise(r=>server.close(r))}
})().catch(error=>{console.error(error);server.close();process.exitCode=1});
