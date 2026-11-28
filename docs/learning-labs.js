const learningLessons = {};
const pretty = value => Number(value.toPrecision(5)).toString();
function studyRandom(seed) {
  return () => { seed=(Math.imul(seed,1664525)+1013904223)>>>0; return (seed+.5)/4294967296; };
}
function studyChart(title,xLabel,yLabel,series) {
  const points=series.flatMap(s=>s.points);
  const xs=points.map(p=>p[0]), ys=points.map(p=>p[1]);
  const lo=Math.min(...xs),hi=Math.max(...xs),bottom=Math.min(0,...ys),top=Math.max(...ys);
  const X=x=>48+292*(x-lo)/(hi-lo||1), Y=y=>156-132*(y-bottom)/(top-bottom||1);
  let drawing='<path d="M48 24v132h292" fill="none" stroke="#899"/>';
  for(const s of series){
    const path=s.points.map(([x,y],i)=>s.bar?'M'+X(x)+' '+Y(0)+'V'+Y(y):(i?'L':'M')+X(x)+' '+Y(y)).join(' ');
    if(s.area){
      const polygon=s.points.map(([x,y])=>X(x)+','+Y(y)).join(' ');
      drawing+='<polygon fill="#a8e1c1" points="'+X(s.points[0][0])+','+Y(0)+' '+polygon+' '+X(s.points.at(-1)[0])+','+Y(0)+'"/>';
    }
    drawing+='<path d="'+path+'" stroke="'+(s.color||'#166a74')+'" stroke-width="'+(s.bar?4:1.8)+'" fill="none"/>';
  }
  return '<figure><figcaption>'+title+'</figcaption><svg viewBox="0 0 374 196" role="img" aria-label="'+title+'"><g font-size="11">'+drawing+'<text x="4" y="15">'+yLabel+'</text><text x="4" y="32">'+pretty(top)+'</text><text x="4" y="157">'+pretty(bottom)+'</text><text x="48" y="174">'+pretty(lo)+'</text><text x="340" y="174" text-anchor="end">'+pretty(hi)+'</text><text x="195" y="192" text-anchor="middle">'+xLabel+'</text></g></svg></figure>';
}
function learningPage(id){
  const lesson=learningLessons[id],root=document.createElement('section');
  root.className='dist-lab';
  root.innerHTML='<p>'+lesson.intro+'</p><p data-math></p><form>'+lesson.fields+(lesson.random?'<button>같은 난수로 계산</button>':'<button>계산</button>')+(lesson.random?'<button type="button" data-new>새 경로 생성</button>':'')+'</form><p role="alert"></p><div data-output aria-live="polite"></div>';
  const math=root.querySelector('[data-math]');
  math.textContent=lesson.formula;
  const render=()=>window.katex?.render(lesson.formula,math,{output:'mathml',throwOnError:false});
  if(window.katex)render();else document.querySelector('#ft-math-renderer')?.addEventListener('load',render,{once:true});
  const form=root.querySelector('form');let seed=1729,previous=null;
  function calculate(){
    if(!form.reportValidity())return;
    try{
      const values=Array.from(form.querySelectorAll('input,select,textarea'),e=>e.type==='number'?e.valueAsNumber:e.value);
      root.querySelector('[data-output]').innerHTML=lesson.run(values,studyRandom(seed),previous); previous=values;
      root.querySelector('[role=alert]').textContent='';
    }catch(e){root.querySelector('[role=alert]').textContent=e.message;}
  }
  form.onsubmit=e=>{e.preventDefault();calculate();};
  form.onchange=e=>{if(e.target.tagName==='SELECT')calculate();};
  if(lesson.random)root.querySelector('[data-new]').onclick=()=>{seed=(seed+7919)>>>0;calculate();};
  calculate();return root;
}
function studyNumber(label,value,min,max,step='any'){
 return '<label>'+label+'<input required type="number" value="'+value+'" min="'+min+'" max="'+max+'" step="'+step+'"></label>';
}
function studySelect(label,choices){
 return '<label>'+label+'<select>'+choices.map(c=>'<option>'+c+'</option>').join('')+'</select></label>';
}
const studyPair=(left,right)=>'<div class="dist-pair">'+left+right+'</div>';
const sampleCurve=(end,fn)=>Array.from({length:181},(_,i)=>[end*i/180,fn(end*i/180)]);
function chanceBar(label,percent){
 return '<p>'+label+' · '+pretty(percent)+'% <progress max="100" value="'+percent+'" aria-label="'+label+'"></progress></p>';
}
function conditionalOr(qA,qB){
 return qA+(1-qA)*qB;
}
function rainPosterior(prior){
 const joint=.8*prior,umbrella=joint+.1*(1-prior);
 return joint/umbrella;
}
const rainInfo='가상 관찰 100일 중 비가 온 날은 20일, 우산을 든 날은 24일, 두 사건이 겹친 날은 16일입니다.';
learningLessons['basic-probability']={
 intro:rainInfo+' 사건을 선택해 전체 표본공간에서 어느 영역을 세는지 확인하세요.',
 formula:'P(A\\cup B)=P(A)+P(B)-P(A\\cap B)',fields:studySelect('표시할 사건',['교사건','합사건','비의 여사건']),
 run:([event])=>{
 const intersect=event==='교사건',outside=event==='비의 여사건',fill='#9cddc8';
 return '<svg viewBox="0 0 360 160" role="img" aria-label="'+event+' 벤 다이어그램"><defs><clipPath id="rain-circle"><circle cx="140" cy="82" r="60"/></clipPath></defs><rect x="2" y="2" width="356" height="156" fill="'+(outside?fill:'white')+'" stroke="#788"/><circle cx="140" cy="82" r="60" fill="'+(outside||intersect?'white':fill)+'"/><circle cx="215" cy="82" r="60" fill="'+(outside||intersect?'none':fill)+'"/>'+(intersect?'<circle cx="215" cy="82" r="60" fill="'+fill+'" clip-path="url(#rain-circle)"/>':'')+'<g fill="none" stroke="#246"><circle cx="140" cy="82" r="60"/><circle cx="215" cy="82" r="60"/></g><g text-anchor="middle"><text x="116" y="82">비 4</text><text x="177" y="82">16</text><text x="238" y="82">우산 8</text><text x="314" y="140">72</text></g></svg><p>'+event+'에 해당하는 날은 100일 중 '+(outside?80:intersect?16:28)+'일입니다.</p>';
 }};
learningLessons['conditional-probability']={
 intro:rainInfo+' 조건을 선택하면 분모가 바뀝니다. 아래 FTA 예제에서는 시점 t에서 독립인 A, B 중 하나가 고장이면 시스템이 정지합니다.',
 formula:'P(B\\mid A)=P(A\\cap B)/P(A),\\quad Q_T=P(A)+P(A^c)P(B\\mid A^c)',
 fields:studySelect('생활 예제의 조건',['전체 100일','비가 온 날'])+studyNumber('A 고장 확률 (%)',2,0,100)+studyNumber('B 고장 확률 (%)',3,0,100),
 run:([condition,a,b])=>{
 const n=condition==='전체 100일'?100:20,second=(1-a/100)*b;
 return '<p>비가 오고 우산을 든 16일 ÷ '+n+'일 = '+pretty(1600/n)+'%</p><h3>FTA의 조건별 기여도</h3><p>A가 고장인 경우 '+pretty(a)+'% + A가 정상이고 B가 고장인 경우 '+pretty(second)+'% = 시스템 비가용확률 '+pretty(100*conditionalOr(a/100,b/100))+'%</p>'+chanceBar('조건에 따른 우산 예제의 비율',1600/n)+chanceBar('FTA 시스템 정지 확률',100*conditionalOr(a/100,b/100));
 }};
learningLessons.bayes={
 intro:rainInfo+' 비 오는 날 우산을 들 확률은 80%, 맑은 날은 10%입니다. 비가 올 사전확률을 바꿔 우산을 관찰한 뒤의 확률을 비교하세요.',
 formula:'P(R\\mid U)=\\frac{P(U\\mid R)P(R)}{P(U\\mid R)P(R)+P(U\\mid R^c)P(R^c)}',
 fields:studyNumber('비가 올 사전확률 (%)',20,0,100),
 run:([p])=>{const both=.8*p,clear=.1*(100-p);return '<p>100일당 예상 우산 관찰 '+pretty(both+clear)+'일 중 비와 우산이 겹치는 날은 '+pretty(both)+'일입니다.</p><p>비가 올 때 우산을 들 확률 80% · 우산을 관찰했을 때 비가 왔을 확률 <strong>'+pretty(100*rainPosterior(p/100))+'%</strong></p>'+chanceBar('관찰 전 비 확률',p)+chanceBar('우산 관찰 후 비 확률',100*rainPosterior(p/100));}};
learningLessons.distributions={
 intro:'일정한 비율로 독립적으로 접수되는 사건을 봅니다. 첫 접수까지의 시간은 연속형이고 정해진 시간 동안의 접수 건수는 이산형입니다.',
 formula:'P(T_1\\le t)=1-e^{-rt}=P(N(t)\\ge1)',
 fields:studyNumber('시간당 접수율 r',2,.01,10)+studyNumber('관찰시간 t (h)',.5,.01,5),
 run:([r,t])=>{
 const mean=r*t,model=DistributionLab.prepare('count','poisson',[mean]),end=Math.max(t,4/r);
 const continuous=studyChart('첫 접수시간 PDF · 녹색 구간의 면적','시간 (h)','확률밀도 (1/h)',[{points:sampleCurve(end,x=>r*Math.exp(-r*x))},{points:sampleCurve(t,x=>r*Math.exp(-r*x)),area:true,color:'#319650'}]);
 const counts=Array.from({length:Math.ceil(mean+5*Math.sqrt(mean))+2},(_,k)=>[k,model.density(k)]);
 return studyPair(continuous,studyChart('접수 건수 PMF · 녹색 막대의 합','건수','확률',[{points:counts,bar:true},{points:counts.slice(1),bar:true,color:'#319650'}]))+'<p>시간 t까지 첫 접수가 발생할 확률과 1건 이상 접수될 확률은 모두 '+pretty(-100*Math.expm1(-mean))+'%입니다.</p>';
 }};
learningLessons['law-large-numbers']={
 intro:'같은 공정에서 독립적으로 제품을 뽑습니다. 표본 수를 늘리면 앞에서 뽑은 표본에 새 표본을 이어 붙입니다. 누적 불량률은 중간에 기준선에서 멀어질 수도 있습니다.',
 formula:'\\hat p_n=\\frac{1}{n}\\sum_{i=1}^n X_i\\longrightarrow p',random:true,
 fields:studyNumber('공정 불량률 (%)',10,0,100)+studySelect('누적 표본 수',['10','100','1000','10000']),
 run:([p,size],rand)=>{let bad=0;const points=[],n=Number(size);
 for(let i=1;i<=n;i++){if(rand()<p/100)bad++;if(i===1||i%Math.ceil(n/500)===0||i===n)points.push([i,100*bad/i]);}
 return studyChart('누적 불량률과 공정 불량률(주황선)','표본 수','불량률 (%)',[{points},{points:[[1,p],[n,p]],color:'#b16525'}])+'<p>'+n+'개 중 불량 '+bad+'개 · 누적 불량률 '+pretty(100*bad/n)+'%</p>';}};
function studyMeanTest(values,target){
 if(!Number.isFinite(target))throw Error('유한한 목표 평균을 입력하세요.');
 if(values.length<2||values.length>5001||values.some(x=>!Number.isFinite(x)||Math.abs(x)>1e12))throw Error('유한한 측정값을 2~5001개 입력하세요 (절댓값 10¹² 이하).');
 let mean=0,m2=0;
 values.forEach((x,i)=>{const delta=x-mean;mean+=delta/(i+1);m2+=delta*(x-mean);});
 const n=values.length,se=Math.sqrt(m2/(n-1)/n);
 if(!(se>0))throw Error('표준편차가 0이면 t 검정을 계산할 수 없습니다.');
 const model=DistributionLab.prepare('inference','student',[n-1]);
 let lo=0,hi=16;
 for(let i=0;i<55;i++){const mid=(lo+hi)/2;if(model.tails(mid)[1]>.025)lo=mid;else hi=mid;}
 const stat=(mean-target)/se;
 const p=Math.abs(stat)>Number.MAX_SAFE_INTEGER?DistributionMath.beta((n-1)/2,.5,(n-1)/(n-1+stat*stat))[0]:2*model.tails(Math.abs(stat))[1];
 return {mean,se,lower:mean-hi*se,upper:mean+hi*se,p,stat};
}
learningLessons['descriptive-statistics']={
 intro:'가공한 축의 평균 지름을 추정합니다. 독립적인 정규 표본과 미지의 모분산을 가정합니다. 목표값만 바꾸면 신뢰구간은 그대로이고 양측 검정의 p값이 달라집니다.',
 formula:'\\bar x\\pm t_{0.975,n-1}s/\\sqrt n,\\qquad t=(\\bar x-\\mu_0)/(s/\\sqrt n)',
 fields:'<label>측정 지름 (mm, 공백 또는 쉼표 구분)<textarea required>10.02 10.04 10.01 10.05 10.03 10.06</textarea></label>'+studyNumber('목표 평균 (mm)',10,-1e12,1e12),
 run:([raw,target])=>{const values=raw.trim().split(/[\s,]+/).filter(Boolean).map(Number),r=studyMeanTest(values,target);
 return studyChart('평균의 95% 신뢰구간과 목표값(주황선)','지름 (mm)','',[{points:[[r.lower,1],[r.upper,1]]},{points:[[target,0],[target,1.2]],color:'#b16525'}])+'<p>표본평균 '+pretty(r.mean)+' mm · 95% 신뢰구간 ['+pretty(r.lower)+', '+pretty(r.upper)+'] mm</p><p>t = '+pretty(r.stat)+' · 자유도 '+(values.length-1)+' · 양측 p = '+pretty(r.p)+' · 유의수준 5%에서 '+(r.p<.05?'귀무가설 기각':'귀무가설을 기각할 근거 부족')+'</p>';}};
function studyWalk(n,p,rand){
 let x=0;const points=[[0,x]];
 for(let i=1;i<=n;i++){x+=rand()<p?1:-1;points.push([i,x]);}
 return points;
}
function studyHistogram(values){
 const counts=new Map();for(const v of values)counts.set(v,(counts.get(v)||0)+1);
 return [...counts].sort((a,b)=>a[0]-b[0]).map(([v,count])=>[v,count/values.length]);
}
learningLessons['stochastic-processes']={
 intro:'확률과정은 시간마다 값이 달라지는 확률변수들의 모음입니다. 같은 조건으로 생성한 10개 경로에서 관찰 시점을 옮겨 보세요.',
 formula:'\\{X_n:n=0,1,\\ldots\\}',random:true,fields:studyNumber('관찰 시점 (걸음)',20,0,50,1),
 run:([t],rand)=>{const paths=Array.from({length:10},()=>studyWalk(50,.5,rand));
 const heights=paths.flatMap(points=>points.map(p=>p[1]));
 return studyPair(studyChart('10개 표본경로 · 주황선은 관찰 시점','걸음','위치',[...paths.map(points=>({points})),{points:[[t,Math.min(...heights)],[t,Math.max(...heights)]],color:'#bc6422'}]),studyChart('선택한 시점에서의 위치 분포','위치','상대도수',[{points:studyHistogram(paths.map(path=>path[t][1])),bar:true}]))+'<p>한 선을 따라가면 한 번의 이력입니다. '+t+'번째 걸음에서 선들을 가로질러 읽은 10개 값이 오른쪽 분포를 만듭니다.</p>';}};
learningLessons['poisson-process']={
 intro:'일정한 접수율과 독립적인 구간별 발생 건수를 가정합니다. 사건 사이 대기시간을 지수분포에서 뽑아 누적 건수를 셉니다.',
 formula:'N(T)\\sim\\operatorname{Poisson}(rT),\\quad E[N(t)]=rt',random:true,
 fields:studyNumber('시간당 접수율',2,0,10)+studyNumber('관찰시간 (h)',5,.01,20),
 run:([rate,end],rand)=>{
 const counts=[],path=[[0,0]],mean=rate*end;
 for(let i=0;i<400;i++){
 const next=studyRandom(Math.floor(rand()*4294967296));let t=0,k=0;
 while(rate>0){t+=-Math.log(next())/rate;if(t>end)break;if(i===0)path.push([t,k],[t,k+1]);k++;}
 counts.push(k);if(i===0)path.push([end,k]);
 }
 const dist=DistributionLab.prepare('count','poisson',[mean]);
 const theory=Array.from({length:Math.ceil(mean+5*Math.sqrt(mean))+2},(_,k)=>[k,dist.density(k)]);
 return studyPair(studyChart('한 경로와 평균선(주황)','시간 (h)','누적 건수',[{points:path},{points:[[0,0],[end,mean]],color:'#bc6422'}]),studyChart('400개 경로의 마지막 건수와 이론 PMF(주황)','건수','확률',[{points:studyHistogram(counts),bar:true},{points:theory,color:'#bc6422'}]))+'<p>마지막 시점의 이론 평균은 '+pretty(mean)+'건입니다. 접수율을 높이면 평균선의 기울기가 커집니다.</p>';}};
learningLessons['random-walk']={
 intro:'원점에서 시작해 매번 독립적으로 오른쪽 또는 왼쪽으로 한 칸 이동합니다. 오른쪽 확률을 50%와 60%로 바꿔 보세요.',
 formula:'E[X_n]=n(2p-1)',random:true,fields:studyNumber('오른쪽 확률 (%)',50,0,100)+studyNumber('걸음 수',100,1,1000,1),
 run:([pct,n],rand)=>{const p=pct/100,mean=n*(2*p-1);
 const series=Array.from({length:6},()=>({points:studyWalk(n,p,studyRandom(Math.floor(rand()*4294967296)))}));
 series.push({points:[[0,0],[n,mean]],color:'#bc6422'});
 return studyChart('6개 경로와 이론 평균 위치(주황)','걸음','위치',series)+'<p>'+n+'걸음 후 평균 위치는 '+pretty(mean)+'입니다. 각 경로의 도착점은 서로 다를 수 있습니다.</p>';}};
function studyMarkov(lambda,mu){
 if(!(lambda>=1e-6&&lambda<=10&&mu>=0&&mu<=10))throw Error('고장률 또는 수리율 입력 범위를 확인하세요.');
 const sum=3*lambda+mu,gap=Math.sqrt(lambda*lambda+6*lambda*mu+mu*mu);
 const fast=(sum+gap)/2,slow=2*lambda*lambda/fast;
 function cdf(t){
 if(!Number.isFinite(t)||t<0)throw Error('시간은 유한한 0 이상의 값이어야 합니다.');
 const x=fast*t,y=slow*t;
 if(x<.01){
 // Taylor expansion of the hypoexponential CDF, evaluated without cancellation.
 let polynomial=1,power=1,factor=2,series=.5;
 for(let n=1;n<=9;n++){power*=-y;polynomial=-x*polynomial+power;factor*=n+2;series+=polynomial/factor;}
 return x*y*series;
 }
 return Math.max(0,-Math.expm1(-y)-slow/gap*Math.exp(-y)*(-Math.expm1(-gap*t)));
 }
 return {mean:sum/(2*lambda*lambda),cdf};
}
function markovStateDiagram(lambda,mu){
 const failure=pretty(lambda),repair=pretty(mu);
 return `<figure><figcaption>장비 한 대의 고장과 수리</figcaption>
 <svg viewBox="0 0 500 176" style="max-width: 40rem;display:block;margin:auto" role="img"
      aria-label="정상에서 고장으로 가는 고장률 λ는 시간당 ${failure}, 고장에서 정상으로 돌아가는 수리율 μ는 시간당 ${repair}">
   <defs>
     <marker id="failure-tip" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path d="M0 0L10 5L0 10Z" fill="#a84927"/></marker>
     <marker id="repair-tip" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path d="M0 0L10 5L0 10Z" fill="#076960"/></marker>
   </defs>
   <circle cx="80" cy="88" r="45" fill="#e3f3ed" stroke="#076960" stroke-width="2"/>
   <circle cx="420" cy="88" r="45" fill="#fff0e6" stroke="#a84927" stroke-width="2"/>
   <path d="M122 69 Q250 33 377 69" fill="none" stroke="#a84927" stroke-width="3" marker-end="url(#failure-tip)"/>
   <path d="M378 107 Q250 143 123 107" fill="none" stroke="#076960" stroke-width="3" marker-end="url(#repair-tip)"/>
   <g text-anchor="middle" font-size="20" font-weight="600">
     <text x="80" y="95">정상</text><text x="420" y="95">고장</text>
     <text x="250" y="36" fill="#903c20">고장률 λ = ${failure} /h</text>
     <text x="250" y="155" fill="#076960">수리율 μ = ${repair} /h</text>
   </g>
 </svg>
 <p>두 대가 모두 정상이면 어느 쪽이든 먼저 고장 날 수 있어 첫 고장 전이율은 2λ = ${pretty(2*lambda)} /h입니다. 한 대만 남으면 수리(μ)로 두 대 정상에 복귀하거나, 남은 장비의 고장(λ)으로 시스템이 처음 정지합니다.</p></figure>`;
}
learningLessons['markov-process']={
 intro:'현재 정상인 장비 수로 다음 전이율을 결정합니다. 두 장비는 독립이며 하나만 정상이어도 작동합니다. 지수 고장·수리시간을 가정하고 두 대 모두 고장이 되는 첫 순간까지 관찰합니다.',
 formula:'E[T]=(3\\lambda+\\mu)/(2\\lambda^2)',
 fields:studyNumber('장비당 고장률 λ (1/h)',.01,.000001,10)+studyNumber('수리율 μ (1/h)',.1,0,10)+studyNumber('관찰시간 (h)',1000,.001,1e8),
 run:([lambda,mu,t],rand,previous)=>{const model=studyMarkov(lambda,mu);
 const curves=[];
 if(previous){const earlier=studyMarkov(previous[0],previous[1]);curves.push({points:sampleCurve(t,earlier.cdf),color:'#bc6422'});}
 curves.push({points:sampleCurve(t,model.cdf)});
 return markovStateDiagram(lambda,mu)+studyChart('시스템 첫 정지 누적확률 · 현재(청록) / 직전(주황)','경과 시간 (h)','확률',curves)+'<p>장비 한 대의 첫 고장까지 평균 '+pretty(1/lambda)+' h · 시스템 첫 정지까지 평균 <strong>'+pretty(model.mean)+' h</strong> · 관찰 종료까지 정지할 확률 '+pretty(100*model.cdf(t))+'%</p><p>수리율을 높이면 남은 장비가 고장 나기 전에 두 대 정상 상태로 돌아갈 가능성이 커집니다.</p>';}};
