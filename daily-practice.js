(function(){
'use strict';

const SUPABASE_URL='https://portal-bridge.ucmas-ambernath-pg.workers.dev';
const SUPABASE_ANON_KEY='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlwYWt3Z3piYmp5d3pjY29haGl3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjIxOTAyMjQsImV4cCI6MjA3Nzc2NjIyNH0.VNjAhpbMzv9c19-IAg8UF2u28aIhh5OYCjAhcec9dRk';
const client=window.supabase.createClient(SUPABASE_URL,SUPABASE_ANON_KEY);

let session=null;
let profile=null;
let assignment=null;
let currentSection=null;
let input='';
let timerBase=0;
let timerStarted=null;
let timerId=null;
let mode='official';
let retryAttempt=null;
let sectionResultAction='choose';

const $=id=>document.getElementById(id);
const info={
  plusminus:{title:'Plus & Minus',icon:'🧮'},
  multiplication:{title:'Multiplication',icon:'✖️'},
  division:{title:'Division',icon:'➗'}
};

function show(id){
  ['loading','app','locked','error-screen'].forEach(x=>$(x)?.classList.add('hidden'));
  $(id)?.classList.remove('hidden');
}
function view(id){
  ['choose-screen','question-screen','section-result','final-screen'].forEach(x=>$(x)?.classList.add('hidden'));
  $(id)?.classList.remove('hidden');
}
function randInt(a,b){return Math.floor(Math.random()*(b-a+1))+a;}
function minForDigits(d){return d===1?2:10**(d-1);}
function maxForDigits(d){return d===1?9:10**d-1;}
function indiaDateISO(){
  const p={};
  new Intl.DateTimeFormat('en-CA',{
    timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'
  }).formatToParts(new Date()).forEach(x=>p[x.type]=x.value);
  return `${p.year}-${p.month}-${p.day}`;
}
function displayDate(iso){
  const [y,m,d]=iso.split('-').map(Number);
  return new Intl.DateTimeFormat('en-IN',{day:'numeric',month:'short',year:'numeric'}).format(new Date(y,m-1,d));
}
function requiredSections(level){
  return level>=5?['plusminus','multiplication','division']:['plusminus','multiplication'];
}

function makePM(digits,rows){
  const lo=10**(digits-1),hi=10**digits-1;
  let total=randInt(lo,hi),terms=[total],prev=null;
  for(let i=1;i<rows;i++){
    let term=null;
    for(let tries=0;tries<50;tries++){
      const canMinus=total-1>=lo;
      const useMinus=canMinus&&Math.random()<0.48;
      const mag=useMinus?randInt(lo,Math.min(hi,total-1)):randInt(lo,hi);
      const cand=useMinus?-mag:mag;
      if(prev!==null&&cand===-prev)continue;
      term=cand;
      break;
    }
    if(term===null)term=randInt(lo,hi);
    terms.push(term);
    total+=term;
    prev=term;
  }
  return {kind:'pm',digits,rows,terms};
}
function makeMul(aDigits,bDigits){
  const a=randInt(minForDigits(aDigits),maxForDigits(aDigits));
  const b=randInt(minForDigits(bDigits),maxForDigits(bDigits));
  return {kind:'mul',a,b,label:`${aDigits}×${bDigits}`};
}
function makeDiv(dividendDigits,divisorDigits){
  const dLo=divisorDigits===1?2:10**(divisorDigits-1);
  const dHi=divisorDigits===1?9:10**divisorDigits-1;
  const nLo=10**(dividendDigits-1),nHi=10**dividendDigits-1;
  for(let tries=0;tries<120;tries++){
    const divisor=randInt(dLo,dHi);
    const qLo=Math.max(2,Math.ceil(nLo/divisor));
    const qHi=Math.floor(nHi/divisor);
    if(qLo<=qHi){
      const quotient=randInt(qLo,qHi);
      return {kind:'div',dividend:divisor*quotient,divisor,label:`${dividendDigits}÷${divisorDigits}`};
    }
  }
  throw new Error('Could not generate exact division');
}
function addUnique(target,count,maker,keyFn){
  const seen=new Set(target.map(keyFn));
  while(count>0){
    const q=maker();
    const k=keyFn(q);
    if(seen.has(k))continue;
    seen.add(k);
    target.push(q);
    count--;
  }
}
function generateQuestions(level){
  const q={plusminus:[],multiplication:[]};

  const addPM=(count,digits,rows)=>addUnique(
    q.plusminus,count,()=>makePM(digits,rows),x=>x.terms.join(',')
  );
  if(level===2)addPM(10,2,10);
  else if(level===3){addPM(5,2,10);addPM(5,3,5);}
  else {addPM(5,2,10);addPM(5,3,8);}

  const addMul=(count,a,b)=>addUnique(
    q.multiplication,count,()=>makeMul(a,b),x=>`${x.a}x${x.b}`
  );
  if(level<=3)addMul(10,1,1);
  else if(level===4)addMul(10,2,1);
  else if(level===5)addMul(10,3,1);
  else if(level===6){addMul(5,4,1);addMul(5,2,2);}
  else if(level===7){addMul(5,2,2);addMul(5,3,2);}
  else {addMul(5,3,2);addMul(5,4,2);}

  if(level>=5){
    q.division=[];
    const addDiv=(count,a,b)=>addUnique(
      q.division,count,()=>makeDiv(a,b),x=>`${x.dividend}/${x.divisor}`
    );
    if(level===5)addDiv(10,3,1);
    else if(level===6){addDiv(5,4,1);addDiv(5,5,1);}
    else if(level===7){addDiv(5,4,2);addDiv(5,5,2);}
    else {addDiv(5,4,2);addDiv(5,5,3);}
  }
  return q;
}
function generateSection(level,section){
  return generateQuestions(level)[section]||[];
}
function correctAnswer(q){
  if(q.kind==='pm')return q.terms.reduce((a,b)=>a+b,0);
  if(q.kind==='mul')return q.a*q.b;
  return q.dividend/q.divisor;
}

function responses(){
  assignment.responses=assignment.responses||{};
  return assignment.responses;
}
function sectionResponses(s){
  const r=responses();
  if(!Array.isArray(r[s]))r[s]=[];
  return r[s];
}
function secondsObj(){
  assignment.section_seconds=assignment.section_seconds||{};
  return assignment.section_seconds;
}
function completed(){
  assignment.completed_sections=Array.isArray(assignment.completed_sections)?assignment.completed_sections:[];
  return assignment.completed_sections;
}
async function savePatch(patch){
  const {data,error}=await client.from('official_daily_practice')
    .update(patch).eq('id',assignment.id).select().single();
  if(error)throw error;
  assignment=data;
  return data;
}
async function getOrCreate(){
  const today=indiaDateISO();
  let {data,error}=await client.from('official_daily_practice')
    .select('*').eq('user_id',session.user.id).eq('practice_date',today).maybeSingle();
  if(error)throw error;
  if(data)return data;

  const payload={
    user_id:session.user.id,
    student_name:profile.full_name||'',
    level:Number(profile.current_level),
    practice_date:today,
    questions:generateQuestions(Number(profile.current_level)),
    responses:{},
    section_seconds:{},
    completed_sections:[],
    status:'not_started'
  };
  const ins=await client.from('official_daily_practice').insert(payload).select().single();
  if(ins.error){
    if(ins.error.code==='23505'){
      const again=await client.from('official_daily_practice')
        .select('*').eq('user_id',session.user.id).eq('practice_date',today).single();
      if(again.error)throw again.error;
      return again.data;
    }
    throw ins.error;
  }
  return ins.data;
}

function setHeader(){
  $('student-name').textContent=assignment.student_name||profile.full_name||'Student';
  $('level-label').textContent=`Level ${assignment.level}`;
  $('date-label').textContent=displayDate(assignment.practice_date);
  const req=requiredSections(assignment.level);
  const done=completed().filter(x=>req.includes(x)).length;
  $('overall-progress').textContent=`${done}/${req.length} sections completed`;

  const st=assignment.status==='completed'?'Completed':assignment.status==='in_progress'?'In Progress':'Not Started';
  $('overall-status').textContent=st;
  $('overall-status').className='inline-flex px-3 py-1 rounded-full text-sm font-black '+
    (st==='Completed'?'bg-green-100 text-green-800':st==='In Progress'?'bg-blue-100 text-blue-800':'bg-amber-100 text-amber-800');
}
function fmtTime(sec){
  sec=Math.max(0,Math.floor(sec||0));
  return `${String(Math.floor(sec/60)).padStart(2,'0')}:${String(sec%60).padStart(2,'0')}`;
}
function sectionStats(s){
  const r=sectionResponses(s);
  return {
    correct:r.filter(x=>x&&x.correct).length,
    wrong:r.filter(x=>x&&!x.correct&&!x.skipped).length,
    skipped:r.filter(x=>x&&x.skipped).length,
    total:r.length,
    time:Number(secondsObj()[s]||0)
  };
}
function retryStats(){
  const r=Array.isArray(retryAttempt?.responses)?retryAttempt.responses:[];
  return {
    correct:r.filter(x=>x&&x.correct).length,
    wrong:r.filter(x=>x&&!x.correct&&!x.skipped).length,
    skipped:r.filter(x=>x&&x.skipped).length,
    total:r.length,
    time:Number(retryAttempt?.duration_seconds||0)
  };
}

function renderCards(){
  mode='official';
  retryAttempt=null;
  currentSection=null;
  setHeader();
  view('choose-screen');
  const req=requiredSections(assignment.level);
  $('section-cards').innerHTML='';

  req.forEach(s=>{
    const meta=info[s];
    const r=sectionResponses(s);
    const done=completed().includes(s);
    const card=document.createElement('button');
    card.type='button';
    card.disabled=done;
    card.className=`section-card text-left bg-white rounded-2xl shadow p-5 border-b-4 ${
      s==='plusminus'?'border-amber-400':s==='multiplication'?'border-blue-500':'border-purple-500'
    } disabled:opacity-70`;
    card.innerHTML=`<div class="text-4xl">${meta.icon}</div>
      <div class="text-xl font-black mt-2">${meta.title}</div>
      <div class="text-sm text-gray-500 mt-1">${done?'Completed ✅':r.length?`Continue · ${r.length}/10`:'10 sums'}</div>
      <div class="mt-3 font-bold ${done?'text-green-700':'text-indigo-700'}">${done?'Done':'Start →'}</div>`;
    if(!done)card.onclick=()=>startSection(s);
    $('section-cards').appendChild(card);
  });
}

function currentQuestionList(){
  return mode==='retry'?(retryAttempt?.questions||[]):(assignment.questions[currentSection]||[]);
}
function currentResponseList(){
  if(mode==='retry'){
    retryAttempt.responses=Array.isArray(retryAttempt.responses)?retryAttempt.responses:[];
    return retryAttempt.responses;
  }
  return sectionResponses(currentSection);
}
function renderQuestion(){
  const list=currentQuestionList();
  const r=currentResponseList();
  const idx=r.length;
  if(idx>=list.length){
    if(mode==='retry')finishRetry();
    else finishSection();
    return;
  }

  const q=list[idx];
  $('section-title').textContent=`${info[currentSection].icon} ${info[currentSection].title}`;
  $('question-progress').textContent=`Question ${idx+1} of ${list.length}`;
  $('progress-bar').style.width=`${idx/list.length*100}%`;
  input='';
  renderInput();

  const qNo=`<div class="daily-question-number" style="font-size:clamp(.8rem,2dvh,1rem);font-weight:900;color:#4f46e5;margin-bottom:6px;line-height:1;">Question ${idx+1} of ${list.length}</div>`;

  if(q.kind==='pm'){
    const rows=q.terms.map(n=>{
      if(n<0)return `<div class="text-red-600" style="color:#dc2626;font-weight:900">− ${Math.abs(n)}</div>`;
      return `<div>${Math.abs(n)}</div>`;
    }).join('');
    $('question-display').innerHTML=`${qNo}<div class="pm-rows inline-block text-right text-2xl sm:text-3xl font-black">${rows}<div class="border-t-4 border-gray-800 mt-1 pt-1">?</div></div>`;
  }else if(q.kind==='mul'){
    $('question-display').innerHTML=`${qNo}<div class="text-4xl sm:text-6xl font-black">${q.a} × ${q.b} = ?</div>`;
  }else{
    $('question-display').innerHTML=`${qNo}<div class="text-4xl sm:text-6xl font-black">${q.dividend} ÷ ${q.divisor} = ?</div>`;
  }

  const targetedRetry=mode==='retry'&&(retryAttempt.retry_type==='wrong'||retryAttempt.retry_type==='skipped');
  const allowSkip=currentSection!=='plusminus'&&!targetedRetry;
  $('skip-btn').classList.toggle('hidden',!allowSkip);
  $('next-btn').classList.toggle('col-span-2',!allowSkip);
  $('next-btn').disabled=true;
  updateTimerDisplay();
}
function renderInput(){
  $('answer-display').textContent=input||'—';
  $('next-btn').disabled=input.length===0;
}
function handleKey(k){
  if(!currentSection)return;
  if(k==='back')input=input.slice(0,-1);
  else if(k==='clear')input='';
  else if(/^\d$/.test(k)&&input.length<10)input+=k;
  renderInput();
}

function activeSeconds(){
  return timerBase+(timerStarted&&document.visibilityState==='visible'?Math.floor((Date.now()-timerStarted)/1000):0);
}
function updateTimerDisplay(){
  $('timer').textContent=fmtTime(activeSeconds());
}
function startTimer(saved){
  stopTimer(false);
  timerBase=Number(saved||0);
  timerStarted=Date.now();
  timerId=setInterval(updateTimerDisplay,1000);
  updateTimerDisplay();
}
function stopTimer(commit=true){
  if(timerStarted){
    timerBase+=Math.floor((Date.now()-timerStarted)/1000);
    timerStarted=null;
  }
  if(timerId){
    clearInterval(timerId);
    timerId=null;
  }
  if(commit&&currentSection){
    if(mode==='retry'&&retryAttempt)retryAttempt.duration_seconds=timerBase;
    else secondsObj()[currentSection]=timerBase;
  }
}

async function startSection(s){
  mode='official';
  retryAttempt=null;
  currentSection=s;
  const r=responses();
  r._active=s;
  if(assignment.status==='not_started')assignment.status='in_progress';
  try{
    await savePatch({responses:r,status:'in_progress'});
  }catch(e){
    showError(e);
    return;
  }
  view('question-screen');
  startTimer(secondsObj()[s]||0);
  renderQuestion();
}

async function saveRetryProgress(){
  if(!retryAttempt)return;
  const r=retryStats();
  retryAttempt.duration_seconds=activeSeconds();
  const {data,error}=await client.from('official_daily_practice_retries').update({
    responses:retryAttempt.responses,
    duration_seconds:retryAttempt.duration_seconds,
    correct_count:r.correct,
    wrong_count:r.wrong,
    skipped_count:r.skipped
  }).eq('id',retryAttempt.id).select().single();
  if(error)throw error;
  retryAttempt=data;
}

async function submitAnswer(skipped){
  if(!currentSection)return;
  const targetedRetry=mode==='retry'&&(retryAttempt.retry_type==='wrong'||retryAttempt.retry_type==='skipped');
  if(currentSection==='plusminus'&&skipped)return;
  if(targetedRetry&&skipped)return;
  if(!skipped&&input==='')return;

  const list=currentQuestionList();
  const r=currentResponseList();
  const idx=r.length;
  if(idx>=list.length)return;

  const q=list[idx];
  const answer=skipped?null:Number(input);
  const correct=!skipped&&answer===correctAnswer(q);
  r.push({answer,correct,skipped:!!skipped,at:new Date().toISOString()});

  if(mode==='retry'){
    retryAttempt.duration_seconds=activeSeconds();
    timerBase=retryAttempt.duration_seconds;
    timerStarted=Date.now();
    try{
      await saveRetryProgress();
      renderQuestion();
    }catch(e){
      r.pop();
      showError(e);
    }
    return;
  }

  secondsObj()[currentSection]=activeSeconds();
  timerBase=secondsObj()[currentSection];
  timerStarted=Date.now();
  try{
    await savePatch({responses:responses(),section_seconds:secondsObj(),status:'in_progress'});
    renderQuestion();
  }catch(e){
    r.pop();
    showError(e);
  }
}

async function finishSection(){
  stopTimer();
  const s=currentSection;
  if(!completed().includes(s))completed().push(s);
  responses()._active=null;
  const req=requiredSections(assignment.level);
  const all=req.every(x=>completed().includes(x));

  try{
    await savePatch({
      responses:responses(),
      section_seconds:secondsObj(),
      completed_sections:completed(),
      status:all?'completed':'in_progress',
      completed_at:all?new Date().toISOString():null
    });
  }catch(e){
    showError(e);
    return;
  }

  const st=sectionStats(s);
  currentSection=null;
  setHeader();
  if(all){
    renderFinal();
    return;
  }

  $('section-result-title').textContent=`${info[s].title} Completed`;
  $('section-result-stats').innerHTML=`<b>${st.correct}</b> correct · <b>${st.wrong}</b> wrong${
    s!=='plusminus'?` · <b>${st.skipped}</b> skipped`:''
  } · Time <b>${fmtTime(st.time)}</b>`;
  $('choose-next-btn').textContent='Choose Next Section';
  sectionResultAction='choose';
  view('section-result');
}

function originalIssueIndices(section,type){
  const r=sectionResponses(section);
  const out=[];
  r.forEach((x,i)=>{
    if(!x)return;
    if(type==='wrong'&&!x.correct&&!x.skipped)out.push(i);
    if(type==='skipped'&&x.skipped)out.push(i);
  });
  return out;
}
async function startRetry(section,type){
  let questions=[];
  let sourceIndices=[];

  if(type==='wrong'||type==='skipped'){
    sourceIndices=originalIssueIndices(section,type);
    if(!sourceIndices.length){
      alert(type==='wrong'?'There are no wrong sums in this section.':'There are no skipped sums in this section.');
      return;
    }
    questions=sourceIndices.map(i=>assignment.questions[section][i]);
  }else{
    questions=generateSection(Number(assignment.level),section);
  }

  const payload={
    user_id:session.user.id,
    official_daily_practice_id:assignment.id,
    section,
    retry_type:type,
    questions,
    source_question_indices:sourceIndices,
    responses:[],
    duration_seconds:0,
    correct_count:0,
    wrong_count:0,
    skipped_count:0,
    completed:false
  };

  const {data,error}=await client.from('official_daily_practice_retries').insert(payload).select().single();
  if(error){
    showError(error);
    return;
  }

  retryAttempt=data;
  mode='retry';
  currentSection=section;
  view('question-screen');
  startTimer(0);
  renderQuestion();
}
async function finishRetry(){
  stopTimer();
  const s=currentSection;
  const type=retryAttempt.retry_type;
  const st=retryStats();

  try{
    const {data,error}=await client.from('official_daily_practice_retries').update({
      responses:retryAttempt.responses,
      duration_seconds:timerBase,
      correct_count:st.correct,
      wrong_count:st.wrong,
      skipped_count:st.skipped,
      completed:true,
      completed_at:new Date().toISOString()
    }).eq('id',retryAttempt.id).select().single();
    if(error)throw error;
    retryAttempt=data;
  }catch(e){
    showError(e);
    return;
  }

  const label=type==='wrong'?'Wrong Sums Practice':type==='skipped'?'Skipped Sums Practice':'Section Retry';
  $('section-result-title').textContent=`${info[s].title} · ${label} Completed`;
  $('section-result-stats').innerHTML=`<b>${st.correct}</b> correct · <b>${st.wrong}</b> wrong${
    s!=='plusminus'?` · <b>${st.skipped}</b> skipped`:''
  } · Time <b>${fmtTime(timerBase)}</b><div class="mt-2 text-xs text-gray-500">Your official first-attempt score has not been changed.</div>`;
  $('choose-next-btn').textContent='Back to Daily Result';
  sectionResultAction='final';
  currentSection=null;
  mode='official';
  retryAttempt=null;
  view('section-result');
}

function retryButton(label,action,kind){
  const style=kind==='wrong'
    ?'bg-red-50 text-red-700 border-red-200'
    :kind==='skipped'
      ?'bg-amber-50 text-amber-800 border-amber-200'
      :'bg-indigo-50 text-indigo-700 border-indigo-200';
  return `<button type="button" data-retry="${action}" class="w-full border ${style} rounded-lg px-3 py-2 text-sm font-black">${label}</button>`;
}
function renderFinal(){
  stopTimer(false);
  mode='official';
  currentSection=null;
  retryAttempt=null;
  setHeader();
  const req=requiredSections(assignment.level);

  $('final-stats').innerHTML=req.map(s=>{
    const st=sectionStats(s);
    let actions='';
    if(st.wrong>0)actions+=retryButton(`Practice Wrong (${st.wrong})`,`${s}|wrong`,'wrong');
    if(st.skipped>0)actions+=retryButton(`Practice Skipped (${st.skipped})`,`${s}|skipped`,'skipped');
    actions+=retryButton('Retry Full Section',`${s}|section`,'section');

    return `<div class="rounded-xl border p-4">
      <div class="font-black text-lg">${info[s].icon} ${info[s].title}</div>
      <div class="text-sm text-gray-600 mt-2"><b>${st.correct}</b> correct · <b>${st.wrong}</b> wrong${
        s!=='plusminus'?` · <b>${st.skipped}</b> skipped`:''
      }</div>
      <div class="text-sm font-bold text-indigo-700 mt-1">Time ${fmtTime(st.time)}</div>
      <div class="mt-4 space-y-2">${actions}</div>
    </div>`;
  }).join('');

  let note=document.getElementById('retry-note');
  if(!note){
    note=document.createElement('div');
    note.id='retry-note';
    note.className='mt-4 bg-blue-50 border border-blue-200 rounded-xl p-3 text-sm text-blue-900';
    note.innerHTML='<b>Practice again without changing today’s official score.</b> Wrong/Skipped practice repeats those exact sums. Retry Full Section gives a fresh 10-sum set of the same level pattern.';
    $('final-stats').insertAdjacentElement('afterend',note);
  }
  view('final-screen');
}

function showError(e){
  console.error(e);
  stopTimer(false);
  $('error-text').textContent=e?.message||'Please check your internet and try again.';
  show('error-screen');
}

async function init(){
  try{
    const auth=await client.auth.getSession();
    session=auth.data.session;
    if(!session){
      location.replace('login.html');
      return;
    }

    const p=await client.from('profiles')
      .select('full_name,current_level,role,is_active')
      .eq('id',session.user.id).single();
    if(p.error)throw p.error;
    profile=p.data;

    if(profile.is_active===false){
      location.replace('login.html');
      return;
    }
    if(profile.role!=='student'){
      show('locked');
      $('locked-text').textContent='Daily Practice is available to student accounts only.';
      return;
    }

    const level=Number(profile.current_level);
    if(!Number.isInteger(level)||level<2||level>8){
      show('locked');
      $('locked-text').textContent=level===1
        ?'Level 1 does not have a Daily Practice assignment.'
        :'Your current level is not set for Daily Practice.';
      return;
    }

    assignment=await getOrCreate();
    show('app');
    setHeader();

    if(assignment.status==='completed'){
      renderFinal();
      return;
    }

    const active=responses()._active;
    if(active&&requiredSections(assignment.level).includes(active)&&!completed().includes(active)){
      currentSection=active;
      mode='official';
      view('question-screen');
      startTimer(secondsObj()[active]||0);
      renderQuestion();
      return;
    }
    renderCards();
  }catch(e){
    showError(e);
  }
}

document.querySelectorAll('[data-key]').forEach(b=>b.addEventListener('click',()=>handleKey(b.dataset.key)));
$('next-btn').addEventListener('click',()=>submitAnswer(false));
$('skip-btn').addEventListener('click',()=>submitAnswer(true));
$('choose-next-btn').addEventListener('click',()=>{
  if(sectionResultAction==='final')renderFinal();
  else renderCards();
});
$('final-stats').addEventListener('click',e=>{
  const btn=e.target.closest('[data-retry]');
  if(!btn)return;
  const [section,type]=btn.dataset.retry.split('|');
  startRetry(section,type);
});
document.addEventListener('keydown',e=>{
  if($('question-screen').classList.contains('hidden'))return;
  if(/^\d$/.test(e.key)){
    handleKey(e.key);
    e.preventDefault();
  }else if(e.key==='Backspace'){
    handleKey('back');
    e.preventDefault();
  }else if(e.key==='Enter'&&input){
    submitAnswer(false);
    e.preventDefault();
  }
});
document.addEventListener('visibilitychange',()=>{
  if(!currentSection)return;
  if(document.visibilityState==='hidden'){
    stopTimer();
    if(mode==='retry'&&retryAttempt){
      retryAttempt.duration_seconds=timerBase;
      client.from('official_daily_practice_retries').update({
        responses:retryAttempt.responses,
        duration_seconds:timerBase
      }).eq('id',retryAttempt.id).then(()=>{});
    }else{
      secondsObj()[currentSection]=timerBase;
      client.from('official_daily_practice').update({
        section_seconds:secondsObj()
      }).eq('id',assignment.id).then(()=>{});
    }
  }else if(!timerStarted){
    timerStarted=Date.now();
    timerId=setInterval(updateTimerDisplay,1000);
  }
});

init();
})();