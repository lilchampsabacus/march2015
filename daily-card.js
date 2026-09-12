(async function(){
'use strict';
const SUPABASE_URL='https://portal-bridge.ucmas-ambernath-pg.workers.dev';
const SUPABASE_ANON_KEY='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYXNlIiwicmVmIjoiaXBha3dnemJianl3emNjb2FoaXciLCJyb2xlIjoiYW5vbiIsImlhdCI6MTc2MjE5MDIyNCwiZXhwIjoyMDc3NzY2MjI0fQ.VNjAhpbMzv9c19-IAg8UF2u28aIhh5OYCjAhcec9dRk';
function indiaDateISO(){const p={};new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date()).forEach(x=>p[x.type]=x.value);return `${p.year}-${p.month}-${p.day}`}
function requiredCount(level){return level>=5?3:2}
function waitReady(){return new Promise(r=>document.readyState==='loading'?document.addEventListener('DOMContentLoaded',r,{once:true}):r())}
function validLevel(level){return Number.isInteger(level)&&level>=2&&level<=8}
function dashboardGrid(){return document.querySelector('main > .grid')||document.querySelector('main .grid')}
function renderCards(level){
  if(!validLevel(level))return null;
  const grid=dashboardGrid();if(!grid)return null;
  let wrap=document.getElementById('official-daily-practice-card');
  if(wrap)return wrap;
  wrap=document.createElement('div');
  wrap.id='official-daily-practice-card';
  wrap.className='w-full max-w-6xl mb-5';
  wrap.innerHTML=`
    <div class="mb-3 flex items-center gap-2"><span class="text-xs font-black uppercase tracking-widest text-indigo-600">Daily Practice</span><span class="h-px flex-1 bg-indigo-100"></span></div>
    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
      <a href="daily-practice.html?v=2" class="block no-underline rounded-2xl shadow-xl overflow-hidden border-2 border-indigo-300 bg-gradient-to-r from-indigo-600 to-violet-600 text-white p-5 md:p-6 hover:shadow-2xl transition-all">
        <div class="flex gap-4 items-center justify-between">
          <div class="flex items-center gap-4"><div class="text-5xl">📋</div><div><div class="text-xs font-black uppercase tracking-widest text-indigo-100">Official Daily Assignment</div><h3 class="text-2xl font-black mt-1">Today's Daily Practice</h3><p id="daily-level-copy" class="text-indigo-100 mt-1">Level ${level} · Complete your required sections.</p></div></div>
          <div id="daily-status-label" class="hidden sm:block bg-white text-indigo-700 font-black rounded-xl px-4 py-3 text-center whitespace-nowrap">Open Today →</div>
        </div>
        <div id="daily-status-label-mobile" class="sm:hidden mt-4 bg-white text-indigo-700 font-black rounded-xl px-4 py-3 text-center">Open Today →</div>
      </a>
      <a href="student-progress.html" class="block no-underline rounded-2xl shadow-xl overflow-hidden border-2 border-emerald-200 bg-white p-5 md:p-6 hover:shadow-2xl transition-all">
        <div class="flex gap-4 items-center justify-between">
          <div class="flex items-center gap-4"><div class="text-5xl">📊</div><div><div class="text-xs font-black uppercase tracking-widest text-emerald-600">For Students & Parents</div><h3 class="text-2xl font-black mt-1 text-slate-900">My Progress</h3><p class="text-slate-500 mt-1">See practice history, accuracy, time, consistency and weak areas.</p></div></div>
          <div class="hidden sm:block bg-emerald-600 text-white font-black rounded-xl px-4 py-3 text-center whitespace-nowrap">View Progress →</div>
        </div>
        <div class="sm:hidden mt-4 bg-emerald-600 text-white font-black rounded-xl px-4 py-3 text-center">View Progress →</div>
      </a>
    </div>
    <div class="mt-7 flex items-center gap-2"><span class="text-xs font-black uppercase tracking-widest text-slate-500">Other Practice</span><span class="h-px flex-1 bg-slate-200"></span></div>`;
  grid.parentElement.insertBefore(wrap,grid);
  return wrap;
}
function updateLevelText(level){const el=document.getElementById('daily-level-copy');if(el)el.textContent=`Level ${level} · Complete your required sections.`}
function updateStatus(level,status,done){const total=requiredCount(level);const label=status==='completed'?'Completed ✅':status==='in_progress'?`Continue · ${done}/${total} sections`:'Start Today';const a=document.getElementById('daily-status-label'),b=document.getElementById('daily-status-label-mobile');if(a)a.textContent=label+' →';if(b)b.textContent=label+' →'}
try{
  await waitReady();
  let level=Number(sessionStorage.getItem('currentLevel'));
  if(validLevel(level))renderCards(level);

  // Level access updates sessionStorage from the current profile. Give it a moment,
  // then render even if Supabase status lookup is slow or temporarily unavailable.
  for(let i=0;i<12&&!validLevel(level);i++){
    await new Promise(r=>setTimeout(r,100));
    level=Number(sessionStorage.getItem('currentLevel'));
  }
  if(validLevel(level))renderCards(level);

  if(!window.supabase)return;
  const client=window.supabase.createClient(SUPABASE_URL,SUPABASE_ANON_KEY);
  const auth=await client.auth.getSession(),session=auth.data.session;if(!session)return;
  const p=await client.from('profiles').select('current_level,role,is_active').eq('id',session.user.id).single();
  if(p.error||!p.data||p.data.is_active===false||p.data.role!=='student')return;
  level=Number(p.data.current_level);
  if(!validLevel(level)){
    document.getElementById('official-daily-practice-card')?.remove();
    return;
  }
  sessionStorage.setItem('currentLevel',String(level));
  renderCards(level);updateLevelText(level);

  let status='not_started',done=0;
  const q=await client.from('official_daily_practice').select('status,completed_sections').eq('user_id',session.user.id).eq('practice_date',indiaDateISO()).maybeSingle();
  if(!q.error&&q.data){status=q.data.status||'not_started';done=Array.isArray(q.data.completed_sections)?q.data.completed_sections.length:0}
  updateStatus(level,status,done);
}catch(e){
  console.error('Daily practice card:',e);
  const fallbackLevel=Number(sessionStorage.getItem('currentLevel'));
  if(validLevel(fallbackLevel))renderCards(fallbackLevel);
}
})();
