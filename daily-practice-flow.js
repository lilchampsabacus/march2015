(function(){
'use strict';

const sectionResult=document.getElementById('section-result');
const chooseNextBtn=document.getElementById('choose-next-btn');
const chooseScreen=document.getElementById('choose-screen');
const sectionCards=document.getElementById('section-cards');
if(!sectionResult||!chooseNextBtn||!chooseScreen||!sectionCards)return;

const heading=chooseScreen.querySelector('h1');
const subheading=chooseScreen.querySelector('p');
let autoAdvancing=false;
let refreshQueued=false;

function updateChooser(){
  refreshQueued=false;
  const cards=Array.from(sectionCards.querySelectorAll('button.section-card'));
  if(!cards.length)return;

  const done=cards.filter(card=>card.disabled).length;
  const remaining=cards.length-done;

  cards.forEach(card=>{
    card.style.display=card.disabled&&remaining>0?'none':'';
  });

  if(done>0&&remaining>0){
    if(heading)heading.textContent=remaining===1?'Almost done! Complete the last section':'Choose your next section';
    if(subheading)subheading.textContent=`${done} of ${cards.length} sections completed · ${remaining} remaining`;
  }else if(done===0){
    if(heading)heading.textContent='What do you want to solve first?';
    if(subheading)subheading.textContent='Complete one section, then choose the next section.';
  }
}

function queueChooserRefresh(){
  if(refreshQueued)return;
  refreshQueued=true;
  queueMicrotask(updateChooser);
}

function skipIntermediateOfficialResult(){
  if(sectionResult.classList.contains('hidden'))return;
  if(chooseNextBtn.textContent.trim()!=='Choose Next Section')return;
  if(autoAdvancing)return;

  autoAdvancing=true;
  chooseNextBtn.click();
  queueMicrotask(()=>{
    autoAdvancing=false;
    updateChooser();
  });
}

new MutationObserver(skipIntermediateOfficialResult).observe(sectionResult,{
  attributes:true,
  attributeFilter:['class']
});
new MutationObserver(queueChooserRefresh).observe(sectionCards,{
  childList:true,
  subtree:true,
  attributes:true,
  attributeFilter:['disabled','class']
});
new MutationObserver(queueChooserRefresh).observe(chooseScreen,{
  attributes:true,
  attributeFilter:['class']
});

updateChooser();
skipIntermediateOfficialResult();
})();
