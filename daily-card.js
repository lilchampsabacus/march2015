(async function(){
'use strict';
const SUPABASE_URL='https://portal-bridge.ucmas-ambernath-pg.workers.dev';
const SUPABASE_ANON_KEY='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlwYWt3Z3piYmp5d3pjY29haGl3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjIxOTAyMjQsImV4cCI6MjA3Nzc2NjIyNH0.VNjAhpbMzv9c19-IAg8UF2u28aIhh5OYCjAhcec9dRk';
function indiaDateISO(){const p={};new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date()).forEach(x=>p[x.type]=x.value);return `${p.year}-${p.month}-${p.day}`}
function requiredCount(level){return level>=5?3:2}
function waitReady(){return new Promise(r=>document.readyState==='loading'?document.addEventListener('DOMContentLoaded',r,{once:true}):r())}
try{
  await waitReady();
  if(!window.supabase)return;
  const client=window.supabase.createClient(SUPABASE_URL,SUPABASE_ANON_KEY);
  const auth=await client.auth.getSession(),session=auth.data.session;if(!session)return;
  const p=await client.from('profiles').select('current_level,role,is_active').eq('id',session.user.id).single();if(p.error||!p.data||p.data.is_active===false||p.data.role!=='student')return;
  const level=Number(p.data.current_level);if(!Number.isInteger(level)||level<2||level>8)return;
  let status='not_started',done=0;
  const q=await client.from('official_daily_practice').select('status,completed_sections').eq('user_id',session.user.id).eq('practice_date',indiaDateISO()).maybeSingle();
  if(!q.error&&q.data){status=q.data.status||'not_started';done=Array.isArray(q.data.completed_sections)?q.data.completed_sections.length:0}
  const grid=document.querySelector('main .grid');if(!grid||document.getElementById('official-daily-practice-card'))return;
  const total=requiredCount(level),label=status==='completed'?'Completed ✅':status==='in_progress'?`Continue · ${done}/${total} sections`:'Start Today';
  const wrap=document.createElement('div');wrap.id='official-daily-practice-card';wrap.className='w-full max-w-6xl mb-7';
  wrap.innerHTML=`<a href="daily-practice.html" class="block no-underline rounded-2xl shadow-xl overflow-hidden border-2 border-indigo-300 bg-gradient-to-r from-indigo-600 to-violet-600 text-white p-5 md:p-6 hover:shadow-2xl transition-all"><div class="flex flex-col sm:flex-row gap-4 sm:items-center sm:justify-between"><div class="flex items-center gap-4"><div class="text-5xl">📋</div><div><div class="text-xs font-black uppercase tracking-widest text-indigo-100">Official Daily Assignment</div><h3 class="text-2xl md:text-3xl font-black mt-1">Today's Daily Practice</h3><p class="text-indigo-100 mt-1">Level ${level} · Complete your required sections in any order.</p></div></div><div class="bg-white text-indigo-700 font-black rounded-xl px-5 py-3 text-center whitespace-nowrap">${label} →</div></div></a>`;
  const parent=grid.parentElement;parent.insertBefore(wrap,grid);
}catch(e){console.error('Daily practice card:',e)}
})();
