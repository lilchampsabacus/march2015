(function (root) {
  'use strict';
  const methods = {direct:{name:'Direct',color:'#111827'},sf:{name:'Small Friend',color:'#b91c1c'},bf:{name:'Big Friend',color:'#1d4ed8'},mix:{name:'Mix Friend',color:'#854d0e'}};
  const ids = ['sf','bf','mix'].flatMap(kind => ['p','m'].flatMap(sign => (kind==='sf'?[4,3,2,1]:kind==='bf'?[9,8,7,6,5,4,3,2,1]:[6,7,8,9]).map(n=>`${kind}_${sign}${n}`)));
  function direct(unit,delta) {
    const n=Math.abs(delta), upper=unit>=5, lower=unit%5;
    if(unit+delta<0||unit+delta>9)return false;
    return delta>0 ? !(n>=5&&upper)&&lower+n%5<=4 : !(n>=5&&!upper)&&lower>=n%5;
  }
  function classify(current,delta) {
    if(!Number.isInteger(current)||!Number.isInteger(delta)||current<0||current>99||delta===0||Math.abs(delta)>9||current+delta<0||current+delta>99)return null;
    const unit=current%10, n=Math.abs(delta), sign=delta>0?'p':'m';
    let method, expression, requirements=[];
    if(direct(unit,delta)){method='direct';expression='Direct bead movement';}
    else if(unit+delta<0||unit+delta>9){
      const complement=10-n;
      method=direct(unit,delta>0?-complement:complement)?'bf':'mix';
      requirements.push(`${method}_${sign}${n}`);
      expression=method==='bf'?(delta>0?`−${complement} +10`:`−10 +${complement}`):(delta>0?`+${n-5} −5 +10`:`−10 +5 −${n-5}`);
      // The tens rod also has to move directly or use an unlocked Small Friend.
      const tens=Math.floor(current/10), carry=delta>0?1:-1;
      if(!direct(tens,carry)){requirements.push(`sf_${carry>0?'p':'m'}1`);expression+=` (tens rod: ${carry>0?'+5 −4':'+4 −5'})`;}
    }else{method='sf';requirements.push(`sf_${sign}${n}`);expression=delta>0?`+5 −${5-n}`:`+${5-n} −5`;}
    return {method,requirements,expression,before:current,after:current+delta,delta};
  }
  function label(id){const m=/^(sf|bf|mix)_([pm])([1-9])$/.exec(id);return m?`${methods[m[1]].name} ${m[2]==='p'?'+':'−'}${m[3]}`:id;}
  function shuffle(a){for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}
  function generate(allowedIds,rows=5,count=30,target='all') {
    if(![5,8].includes(rows)||!Number.isInteger(count)||count<1||count>30)throw Error('Invalid practice size.');
    const allowed=new Set(allowedIds.filter(id=>ids.includes(id)));
    if(!allowed.size)throw Error('Your teacher has not unlocked formulas for this batch yet.');
    if(target!=='all'&&!allowed.has(target))throw Error('This formula has not been unlocked.');
    const max=[...allowed].some(id=>id.startsWith('bf_')||id.startsWith('mix_'))?99:9;
    const pool=[],seen=new Set(); let nodes=0;
    const choices=Array.from({length:max+1},(_,total)=>{
      const a=[];for(let d=-9;d<=9;d++){const c=classify(total,d);if(c&&c.after<=max&&c.requirements.every(id=>allowed.has(id)))a.push(c);}return a;
    });
    // Sample complete paths first so starts and prefixes vary across the set.
    for(let attempt=0;attempt<20000&&pool.length<count;attempt++){
      let total=1+Math.floor(Math.random()*9),values=[total],steps=[],hit=false;
      for(let pos=1;pos<rows;pos++){
        const options=choices[total];if(!options.length)break;
        const c=options[Math.floor(Math.random()*options.length)];
        values.push(c.delta);steps.push(c);total=c.after;
        hit=hit||(target==='all'?c.requirements.length>0:c.requirements.includes(target));
      }
      if(values.length===rows&&hit){const key=values.join(',');if(!seen.has(key)){seen.add(key);pool.push({numbers:values,steps,answer:total});}}
    }
    // Bounded search, with the taught formula required in every completed sum.
    function walk(values,steps,hit){
      if(++nodes>120000||pool.length>=count)return;
      if(values.length===rows){if(!hit)return;const key=values.join(',');if(seen.has(key))return;seen.add(key);pool.push({numbers:values.slice(),steps:steps.slice(),answer:values.reduce((a,b)=>a+b,0)});return;}
      const total=values.reduce((a,b)=>a+b,0);
      for(const c of shuffle(choices[total].slice())){
        const nextHit=hit||(target==='all'?c.requirements.length>0:c.requirements.includes(target));
        walk([...values,c.delta],[...steps,c],nextHit);
        if(nodes>120000||pool.length>=count)break;
      }
    }
    for(const first of shuffle([1,2,3,4,5,6,7,8,9])){walk([first],[],false);if(pool.length>=count||nodes>120000)break;}
    if(!pool.length)throw Error('These formula selections cannot make a full practice set. Ask your teacher to keep earlier taught formulas selected.');
    if(pool.length<count)throw Error('Too few different sums are available. Ask your teacher to check the taught formulas.');
    return shuffle(pool);
  }
  const api={methods,ids,direct,classify,label,generate};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  else root.TaughtFormulaEngine=api;
})(typeof window!=='undefined'?window:globalThis);
