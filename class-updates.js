(function(){
'use strict';
const teacher=!!document.getElementById('updateForm'),root=document.getElementById('classUpdates');
if(!root)return;
let db;
const $=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const labels={completed:'Completed class',sample_test:'Upcoming sample test',final_exam:'Upcoming final exam',notice:'Class notice'};
let rows=[],batches=[],editing=null;
async function rpc(n,a={}){const {data,error}=await db.rpc(n,a);if(error)throw Error(error.message);return data}
function status(s){$('updateStatus').textContent=s}
const date=s=>s?new Date(s+'T12:00:00').toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'}):'';
async function load(){rows=await rpc('class_updates_list');render()}
function render(){const selected=teacher&&$('updateBatch').value!==''?batches[Number($('updateBatch').value)]:null;
// Keep teacher history and notices; students only need the latest completed
// class for each batch and level. The RPC returns class_date/id newest first.
const latestCompleted=new Set();
const shown=teacher?rows.filter(r=>selected&&r.centre_id===selected.centre_id&&r.batch_name===selected.batch_name):rows.filter(r=>{
if(r.kind!=='completed')return true;
const key=JSON.stringify([r.centre_id,r.batch_name,r.level]);
if(latestCompleted.has(key))return false;
latestCompleted.add(key);return true;
});
const unread=shown.filter(r=>!r.is_read).length;
if(!teacher)$('updateCount').textContent=unread?`${unread} unread`:'All caught up';
$('updateList').innerHTML=shown.length?shown.map(r=>`<article class="cu-item ${r.kind==='sample_test'||r.kind==='final_exam'?'cu-test':''}"><div class="cu-meta">${esc(labels[r.kind])} · ${date(r.class_date)}${teacher?' · Level '+r.level:(!r.is_read?' · NEW':'')}</div><h3>${r.week?'Week '+r.week+' · ':''}${esc(r.book||labels[r.kind])}</h3>${r.pages?'<p><b>Pages:</b> '+esc(r.pages)+'</p>':''}${r.event_date?'<p><b>Test date:</b> '+date(r.event_date)+'</p>':''}${r.message?'<p class="cu-message">'+esc(r.message)+'</p>':''}<button type="button" data-id="${r.id}">${teacher?'Edit':r.is_read?'Read':'Mark as read'}</button></article>`).join(''):`<p>${teacher?(selected?'No updates for this batch.':'Select a batch to view updates.'):'No class updates yet. Check here daily for pages and test notices.'}</p>`;
}
function reset(){editing=null;$('updateForm').reset();$('updateDate').value=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());$('updateBatch').disabled=false;$('updateSave').textContent='Publish update';fields();render()}
function fields(){const kind=$('updateKind').value,completed=kind==='completed',test=['sample_test','final_exam'].includes(kind);['updateWeek','updateBook','updatePages'].forEach(id=>$(id).required=completed);$('updateEvent').required=test;$('eventField').hidden=!test;$('updateMessage').required=kind==='notice'}
root.addEventListener('click',async e=>{const b=e.target.closest('button[data-id]');if(!b)return;const r=rows.find(x=>String(x.id)===b.dataset.id);if(!r)return;
if(teacher){editing=r.id;const i=batches.findIndex(x=>x.centre_id===r.centre_id&&x.batch_name===r.batch_name);$('updateBatch').value=String(i);$('updateBatch').disabled=true;[['Level',r.level],['Date',r.class_date],['Kind',r.kind],['Week',r.week],['Book',r.book],['Pages',r.pages],['Message',r.message],['Event',r.event_date]].forEach(([k,v])=>$('update'+k).value=v??'');$('updateSave').textContent='Save changes';fields();$('updateForm').scrollIntoView({behavior:'smooth'});}
else{b.disabled=true;try{await rpc('class_update_mark_read',{p_id:r.id});await load()}catch(e){status('Could not mark as read. Please retry.');b.disabled=false;}}
});
async function init(){try{
if(!teacher&&window.practiceDashboardContext){
  const context=await window.practiceDashboardContext;
  if(!context){status('Please log in to see class updates.');return}
  db=context.client;
}else{
  db=window.supabase.createClient('https://portal-bridge.ucmas-ambernath-pg.workers.dev','eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlwYWt3Z3piYmp5d3pjY29haGl3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjIxOTAyMjQsImV4cCI6MjA3Nzc2NjIyNH0.VNjAhpbMzv9c19-IAg8UF2u28aIhh5OYCjAhcec9dRk');
  const {data:{user},error}=await db.auth.getUser();
  if(error||!user){status('Please log in to see class updates.');return}
}
if(teacher){const actor=await rpc('attendance_actor');if(!actor)throw Error('Teacher or admin login required.');batches=await rpc('attendance_batches');$('updateBatch').innerHTML='<option value="">Select batch</option>'+batches.map((b,i)=>`<option value="${i}">${esc(b.batch_name)} · Level ${b.level} · Centre ${b.centre_id}</option>`).join('');reset();$('updateBatch').onchange=()=>{const b=batches[Number($('updateBatch').value)];if(b)$('updateLevel').value=b.level;render()};$('updateKind').onchange=fields;$('updateCancel').onclick=reset;
$('updateForm').onsubmit=async e=>{e.preventDefault();const b=batches[Number($('updateBatch').value)];if($('updateBatch').value===''||!b)return;const id=editing;$('updateSave').disabled=true;try{await rpc('class_update_save',{p_id:id,p_centre:b.centre_id,p_batch:b.batch_name,p_level:Number($('updateLevel').value),p_date:$('updateDate').value,p_kind:$('updateKind').value,p_week:$('updateWeek').value?Number($('updateWeek').value):null,p_book:$('updateBook').value,p_pages:$('updatePages').value,p_message:$('updateMessage').value,p_event:['sample_test','final_exam'].includes($('updateKind').value)?$('updateEvent').value:null});editing=null;$('updateBatch').disabled=false;$('updateSave').textContent='Publish update';await load();status('Published. Parents can see this update after login.');}catch(e){status(e.message)}finally{$('updateSave').disabled=false}};
}
await load();status('');$('updateRefresh').onclick=async()=>{try{await load();status('')}catch(e){status('Unable to load updates. Please try again.')}};
}catch(e){status('Unable to load class updates: '+e.message)}}
init();
})();