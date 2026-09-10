(function(){
'use strict';
const SUPABASE_URL='https://portal-bridge.ucmas-ambernath-pg.workers.dev';
const SUPABASE_ANON_KEY='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlwYWt3Z3piYmp5d3pjY29haGl3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjIxOTAyMjQsImV4cCI6MjA3Nzc2NjIyNH0.VNjAhpbMzv9c19-IAg8UF2u28aIhh5OYCjAhcec9dRk';
const client=window.supabase.createClient(SUPABASE_URL,SUPABASE_ANON_KEY);
let session=null,profile=null,assignment=null,currentSection=null,input='',timerBase=0,timerStarted=null,timerId=null;
const $=id=>document.getElementById(id);
const info={plusminus:{title:'Plus & Minus',icon:'🧮',tone:'amber'},multiplication:{title:'Multiplication',icon:'✖️',tone:'blue'},division:{title:'Division',icon:'➗',tone:'purple'}};
function show(id){['loading','app','locked','error-screen'].forEach(x=>$(x)?.classList.add('hidden'));$(id)?.classList.remove('hidden')}
function view(id){['choose-screen','question-screen','section-result','final-screen'].forEach(x=>$(x)?.classList.add('hidden'));$(id)?.classList.remove('hidden')}
function randInt(a,b){return Math.floor(Math.random()*(b-a+1))+a}
function minForDigits(d){return d===1?2:10**(d-1)}
function maxForDigits(d){return d===1?9:10**d-1}
function indiaDateISO(){const p={};new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date()).forEach(x=>p[x.type]=x.value);return `${p.year}-${p.month}-${p.day}`}
function displayDate(iso){const [y,m,d]=iso.split('-').map(Number);return new Intl.DateTimeFormat('en-IN',{day:'numeric',month:'short',year:'numeric'}).format(new Date(y,m-1,d))}
function requiredSections(level){return level>=5?['plusminus','multiplication','division']:['plusminus','multiplication']}
function makePM(digits,rows){
  const lo=10**(digits-1),hi=10**digits-1;let total=randInt(lo,hi),terms=[total],prev=null;
  for(let i=1;i<rows;i++){
    let term=null;
    for(let tries=0;tries<40;tries++){
      const canMinus=total-1>=lo;const useMinus=canMinus&&Math.random()<0.48;const mag=useMinus?randInt(lo,Math.min(hi,total-1)):randInt(lo,hi);const cand=useMinus?-mag:mag;
      if(prev!==null&&cand===-prev)continue;term=cand;break;
    }
    if(term===null)term=randInt(lo,hi);terms.push(term);total+=term;prev=term;
  }
  return {kind:'pm',digits,rows,terms};
}
function makeMul(aDigits,bDigits){const a=randInt(minForDigits(aDigits),maxForDigits(aDigits)),b=randInt(minForDigits(bDigits),maxForDigits(bDigits));return{kind:'mul',a,b,label:`${aDigits}×${bDigits}`}}
function makeDiv(dividendDigits,divisorDigits){
  const dLo=divisorDigits===1?2:10**(divisorDigits-1),dHi=divisorDigits===1?9:10**divisorDigits-1;
  const nLo=10**(dividendDigits-1),nHi=10**dividendDigits-1;
  for(let tries=0;tries<100;tries++){
    const divisor=randInt(dLo,dHi),qLo=Math.max(2,Math.ceil(nLo/divisor)),qHi=Math.floor(nHi/divisor);
    if(qLo<=qHi){const quotient=randInt(qLo,qHi);return{kind:'div',dividend:divisor*quotient,divisor,label:`${dividendDigits}÷${divisorDigits}`}}
  }
  throw new Error('Could not generate exact division');
}
function uniqueQuestions(count,maker,keyFn){const out=[],seen=new Set();while(out.length<count){const q=maker(),k=keyFn(q);if(seen.has(k))continue;seen.add(k);out.push(q)}return out}
function pmSet(specs){const out=[],seen=new Set();for(const [count,digits,rows] of specs){while(out.length<specs.slice(0,specs.indexOf([count,digits,rows])).length){break}for(let i=0;i<count;i++){let q,k;do{q=makePM(digits,rows);k=q.terms.join(',')}while(seen.has(k));seen.add(k);out.push(q)}}return out}
function generateQuestions(level){
  const q={plusminus:[]};
  const addPM=(count,digits,rows)=>{const seen=new Set(q.plusminus.map(x=>x.terms.join(',')));for(let i=0;i<count;i++){let x,k;do{x=makePM(digits,rows);k=x.terms.join(',')}while(seen.has(k));seen.add(k);q.plusminus.push(x)}};
  if(level===2)addPM(10,2,10);else if(level===3){addPM(5,2,10);addPM(5,3,5)}else{addPM(5,2,10);addPM(5,3,8)}
  const mul=[];const addMul=(count,a,b)=>{const seen=new Set(mul.map(x=>`${x.a}x${x.b}`));while(count--){let x,k;do{x=makeMul(a,b);k=`${x.a}x${x.b}`}while(seen.has(k));seen.add(k);mul.push(x)}};
  if(level<=3)addMul(10,1,1);else if(level===4)addMul(10,2,1);else if(level===5)addMul(10,3,1);else if(level===6){addMul(5,4,1);addMul(5,2,2)}else if(level===7){addMul(5,2,2);addMul(5,3,2)}else{addMul(5,3,2);addMul(5,4,2)}
  q.multiplication=mul;
  if(level>=5){const div=[];const addDiv=(count,a,b)=>{const seen=new Set(div.map(x=>`${x.dividend}/${x.divisor}`));while(count--){let x,k;do{x=makeDiv(a,b);k=`${x.dividend}/${x.divisor}`}while(seen.has(k));seen.add(k);div.push(x)}};if(level===5)addDiv(10,3,1);else if(level===6){addDiv(5,4,1);addDiv(5,5,1)}else if(level===7){addDiv(5,4,2);addDiv(5,5,2)}else{addDiv(5,4,2);addDiv(5,5,3)}q.division=div}
  return q;
}
function correctAnswer(q){if(q.kind==='pm')return q.terms.reduce((a,b)=>a+b,0);if(q.kind==='mul')return q.a*q.b;return q.dividend/q.divisor}
function responses(){assignment.responses=assignment.responses||{};return assignment.responses}
function sectionResponses(s){const r=responses();if(!Array.isArray(r[s]))r[s]=[];return r[s]}
function secondsObj(){assignment.section_seconds=assignment.section_seconds||{};return assignment.section_seconds}
function completed(){assignment.completed_sections=Array.isArray(assignment.completed_sections)?assignment.completed_sections:[];return assignment.completed_sections}
async function savePatch(patch){const{data,error}=await client.from('official_daily_practice').update(patch).eq('id',assignment.id).select().single();if(error)throw error;assignment=data;return data}
async function getOrCreate(){
  const today=indiaDateISO();
  let{data,error}=await client.from('official_daily_practice').select('*').eq('user_id',session.user.id).eq('practice_date',today).maybeSingle();
  if(error)throw error;
  if(data)return data;
  const payload={user_id:session.user.id,student_name:profile.full_name||'',level:Number(profile.current_level),practice_date:today,questions:generateQuestions(Number(profile.current_level)),responses:{},section_seconds:{},completed_sections:[],status:'not_started'};
  let ins=await client.from('official_daily_practice').insert(payload).select().single();
  if(ins.error){if(ins.error.code==='23505'){const again=await client.from('official_daily_practice').select('*').eq('user_id',session.user.id).eq('practice_date',today).single();if(again.error)throw again.error;return again.data}throw ins.error}
  return ins.data;
}
function setHeader(){
  $('student-name').textContent=assignment.student_name||profile.full_name||'Student';$('level-label').textContent=`Level ${assignment.level}`;$('date-label').textContent=displayDate(assignment.practice_date);
  const req=requiredSections(assignment.level),done=completed().filter(x=>req.includes(x)).length;
  $('overall-progress').textContent=`${done}/${req.length} sections completed`;
  const st=assignment.status==='completed'?'Completed':assignment.status==='in_progress'?'In Progress':'Not Started';$('overall-status').textContent=st;
  $('overall-status').className='inline-flex px-3 py-1 rounded-full text-sm font-black '+(st==='Completed'?'bg-green-100 text-green-800':st==='In Progress'?'bg-blue-100 text-blue-800':'bg-amber-100 text-amber-800');
}
function fmtTime(sec){sec=Math.max(0,Math.floor(sec||0));return `${String(Math.floor(sec/60)).padStart(2,'0')}:${String(sec%60).padStart(2,'0')}`}
function sectionStats(s){const r=sectionResponses(s);return{correct:r.filter(x=>x&&x.correct).length,wrong:r.filter(x=>x&&!x.correct&&!x.skipped).length,skipped:r.filter(x=>x&&x.skipped).length,total:r.length,time:Number(secondsObj()[s]||0)}}
function renderCards(){
  setHeader();view('choose-screen');const req=requiredSections(assignment.level);$('section-cards').innerHTML='';
  req.forEach(s=>{const meta=info[s],r=sectionResponses(s),done=completed().includes(s),card=document.createElement('button');card.type='button';card.disabled=done;card.className=`section-card text-left bg-white rounded-2xl shadow p-5 border-b-4 ${s==='plusminus'?'border-amber-400':s==='multiplication'?'border-blue-500':'border-purple-500'} disabled:opacity-70`;
    card.innerHTML=`<div class="text-4xl">${meta.icon}</div><div class="text-xl font-black mt-2">${meta.title}</div><div class="text-sm text-gray-500 mt-1">${done?'Completed ✅':r.length?`Continue · ${r.length}/10`:'10 sums'}</div><div class="mt-3 font-bold ${done?'text-green-700':'text-indigo-700'}">${done?'Done':'Start →'}</div>`;if(!done)card.onclick=()=>startSection(s);$('section-cards').appendChild(card)});
}
function renderQuestion(){
  const list=assignment.questions[currentSection],r=sectionResponses(currentSection),idx=r.length;if(idx>=list.length){finishSection();return}
  const q=list[idx];$('section-title').textContent=`${info[currentSection].icon} ${info[currentSection].title}`;$('question-progress').textContent=`Question ${idx+1} of ${list.length}`;$('progress-bar').style.width=`${idx/list.length*100}%`;input='';renderInput();
  if(q.kind==='pm'){$('question-display').innerHTML=`<div class="text-xs font-bold text-gray-400 uppercase mb-1">${q.digits}-digit · ${q.rows} rows</div><div class="pm-rows inline-block text-right text-2xl sm:text-3xl font-black">${q.terms.map((n,i)=>`<div>${i===0?'&nbsp;':n<0?'−':'+'}&nbsp;${Math.abs(n)}</div>`).join('')}<div class="border-t-4 border-gray-800 mt-1 pt-1">?</div></div>`}else if(q.kind==='mul'){$('question-display').innerHTML=`<div class="text-sm font-bold text-blue-500 mb-3">${q.label}</div><div class="text-4xl sm:text-6xl font-black">${q.a} × ${q.b} = ?</div>`}else{$('question-display').innerHTML=`<div class="text-sm font-bold text-purple-500 mb-3">${q.label}</div><div class="text-4xl sm:text-6xl font-black">${q.dividend} ÷ ${q.divisor} = ?</div>`}
  const skip=currentSection!=='plusminus';$('skip-btn').classList.toggle('hidden',!skip);$('next-btn').classList.toggle('col-span-2',!skip);$('next-btn').disabled=true;updateTimerDisplay();
}
function renderInput(){$('answer-display').textContent=input||'—';$('next-btn').disabled=input.length===0}
function handleKey(k){if(!currentSection)return;if(k==='back')input=input.slice(0,-1);else if(k==='clear')input='';else if(/^\d$/.test(k)&&input.length<10)input+=k;renderInput()}
function activeSeconds(){return timerBase+(timerStarted&&document.visibilityState==='visible'?Math.floor((Date.now()-timerStarted)/1000):0)}
function updateTimerDisplay(){$('timer').textContent=fmtTime(activeSeconds())}
function startTimer(saved){stopTimer(false);timerBase=Number(saved||0);timerStarted=Date.now();timerId=setInterval(updateTimerDisplay,1000);updateTimerDisplay()}
function stopTimer(commit=true){if(timerStarted){timerBase+=Math.floor((Date.now()-timerStarted)/1000);timerStarted=null}if(timerId){clearInterval(timerId);timerId=null}if(commit&&currentSection)secondsObj()[currentSection]=timerBase}
async function startSection(s){
  currentSection=s;const r=responses();r._active=s;if(assignment.status==='not_started')assignment.status='in_progress';
  try{await savePatch({responses:r,status:'in_progress'})}catch(e){showError(e);return}
  view('question-screen');startTimer(secondsObj()[s]||0);renderQuestion();window.scrollTo({top:0,behavior:'smooth'});
}
async function submitAnswer(skipped){
  if(!currentSection)return;if(currentSection==='plusminus'&&skipped)return;if(!skipped&&input==='')return;
  const list=assignment.questions[currentSection],r=sectionResponses(currentSection),idx=r.length;if(idx>=list.length)return;const q=list[idx],answer=skipped?null:Number(input),correct=!skipped&&answer===correctAnswer(q);r.push({answer,correct,skipped:!!skipped,at:new Date().toISOString()});
  secondsObj()[currentSection]=activeSeconds();timerBase=secondsObj()[currentSection];timerStarted=Date.now();
  try{await savePatch({responses:responses(),section_seconds:secondsObj(),status:'in_progress'});renderQuestion()}catch(e){r.pop();showError(e)}
}
async function finishSection(){
  stopTimer();const s=currentSection;if(!completed().includes(s))completed().push(s);responses()._active=null;const req=requiredSections(assignment.level),all=req.every(x=>completed().includes(x));
  try{await savePatch({responses:responses(),section_seconds:secondsObj(),completed_sections:completed(),status:all?'completed':'in_progress',completed_at:all?new Date().toISOString():null})}catch(e){showError(e);return}
  const st=sectionStats(s);currentSection=null;setHeader();if(all){renderFinal();return}$('section-result-title').textContent=`${info[s].title} Completed`;$('section-result-stats').innerHTML=`<b>${st.correct}</b> correct · <b>${st.wrong}</b> wrong${s!=='plusminus'?` · <b>${st.skipped}</b> skipped`:''} · Time <b>${fmtTime(st.time)}</b>`;view('section-result');window.scrollTo({top:0,behavior:'smooth'});
}
function renderFinal(){setHeader();const req=requiredSections(assignment.level);$('final-stats').innerHTML=req.map(s=>{const st=sectionStats(s);return`<div class="rounded-xl border p-4"><div class="font-black text-lg">${info[s].icon} ${info[s].title}</div><div class="text-sm text-gray-600 mt-2"><b>${st.correct}</b> correct · <b>${st.wrong}</b> wrong${s!=='plusminus'?` · <b>${st.skipped}</b> skipped`:''}</div><div class="text-sm font-bold text-indigo-700 mt-1">Time ${fmtTime(st.time)}</div></div>`}).join('');view('final-screen')}
function showError(e){console.error(e);stopTimer(false);$('error-text').textContent=e?.message||'Please check your internet and try again.';show('error-screen')}
async function init(){
  try{const auth=await client.auth.getSession();session=auth.data.session;if(!session){location.replace('login.html');return}const p=await client.from('profiles').select('full_name,current_level,role,is_active').eq('id',session.user.id).single();if(p.error)throw p.error;profile=p.data;if(profile.is_active===false){location.replace('login.html');return}if(profile.role!=='student'){show('locked');$('locked-text').textContent='Daily Practice is available to student accounts only.';return}const level=Number(profile.current_level);if(!Number.isInteger(level)||level<2||level>8){show('locked');$('locked-text').textContent=level===1?'Level 1 does not have a Daily Practice assignment.':'Your current level is not set for Daily Practice.';return}assignment=await getOrCreate();show('app');setHeader();if(assignment.status==='completed'){renderFinal();return}const active=responses()._active;if(active&&requiredSections(assignment.level).includes(active)&&!completed().includes(active)){currentSection=active;view('question-screen');startTimer(secondsObj()[active]||0);renderQuestion();return}renderCards()}catch(e){showError(e)}}
document.querySelectorAll('[data-key]').forEach(b=>b.addEventListener('click',()=>handleKey(b.dataset.key)));$('next-btn').addEventListener('click',()=>submitAnswer(false));$('skip-btn').addEventListener('click',()=>submitAnswer(true));$('choose-next-btn').addEventListener('click',renderCards);
document.addEventListener('keydown',e=>{if($('question-screen').classList.contains('hidden'))return;if(/^\d$/.test(e.key)){handleKey(e.key);e.preventDefault()}else if(e.key==='Backspace'){handleKey('back');e.preventDefault()}else if(e.key==='Enter'&&input){submitAnswer(false);e.preventDefault()}});
document.addEventListener('visibilitychange',()=>{if(!currentSection)return;if(document.visibilityState==='hidden'){stopTimer();secondsObj()[currentSection]=timerBase;client.from('official_daily_practice').update({section_seconds:secondsObj()}).eq('id',assignment.id).then(()=>{})}else if(!timerStarted){timerStarted=Date.now();timerId=setInterval(updateTimerDisplay,1000)}});
init();
})();
