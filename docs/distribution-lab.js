function createDistributionLab(group){
  const models=DistributionLab.groups[group], root=document.createElement('section');
  root.className='dist-lab';
  root.innerHTML='<form><label>분포<select></select></label><div class="dist-fields"></div><button>계산하고 그래프 비교</button></form><p role="alert"></p><p class="dist-formula"></p><p data-hint></p><p data-result aria-live="polite"></p><p>실선은 현재 입력, 점선은 직전 입력입니다. 점은 각 계산의 기준값을 표시합니다.</p><div class="dist-pair"></div><p data-reading></p>';
  const find=s=>root.querySelector(s), select=find('select'),fields=find('.dist-fields');
  const discrete=group==='count';
  const leftTitle=discrete?'확률질량함수 (PMF)':'확률밀도함수 (PDF)';
  for(const title of [leftTitle,'누적분포함수 (CDF)']){
    const figure=document.createElement('figure');
    figure.innerHTML='<figcaption>'+title+'</figcaption><svg viewBox="0 0 440 248" role="img" aria-label="'+title+'"></svg>';
    find('.dist-pair').append(figure);
  }
  for(const [id,m] of Object.entries(models)) select.add(new Option(m.name,id));
  let last=null;
  const fmt=n=>Number(n.toPrecision(6)).toString();
  function reset(){
    const m=models[select.value]; last=null;
    fields.replaceChildren();
    for(const [label,value,min,max,integer] of [...m.fields,[group==='life'?'기준 시간 t [h]':group==='count'?'기준 횟수 k':'기준 통계량 x',m.x,group==='inference'?-1e12:0,1e12,group==='count']]){
      const el=document.createElement('label'),input=document.createElement('input');
      el.textContent=label;input.type='number';input.required=true;input.value=value;
      input.min=min;input.max=max;input.step=integer?'1':'any';el.append(input);fields.append(el);
    }
    find('[data-hint]').textContent=m.hint;
    const formula=find('.dist-formula');
    const relation=discrete?'F(k)=\\sum_{j\\le k}P(X=j)':'F(x)=\\int_{-\\infty}^{x} f(u)\\,du';
    const latex=m.formula+'\\qquad '+relation;
    formula.textContent=latex;
    const render=()=>window.katex?.render(latex,formula,{throwOnError:false,output:'mathml',displayMode:true});
    if(window.katex) render(); else document.querySelector('#ft-math-renderer')?.addEventListener('load',render,{once:true});
    run();
  }
  function run(){
    const error=find('[role=alert]');
    try{
      const values=Array.from(fields.querySelectorAll('input'),el=>el.valueAsNumber);
      const x=values.pop(), model=DistributionLab.prepare(group,select.value,values);
      if(!Number.isFinite(x)||Math.abs(x)>1e12||(group!=='inference'&&x<0)||(group==='count'&&!Number.isInteger(x))) throw Error('기준값 범위를 확인하세요.');
      const [p,q]=model.tails(x);
      const d=model.density(x), current={model,x,p,d};
      draw(current,last);
      const unit=group==='life'?' h':'';
      find('[data-result]').textContent='기준값 '+fmt(x)+unit+' · '+(discrete?'해당 횟수의 확률 '+fmt(d*100)+'%':'밀도 '+(Number.isFinite(d)?fmt(d):'∞ (경계에서 발산)')+(group==='life'?' /h':''))+' · 이하 '+fmt(p*100)+'% · 초과 '+fmt(q*100)+'%'+(model.mean!==undefined?' · 평균 수명 '+fmt(model.mean)+' h':'');
      find('[data-reading]').textContent=(discrete?'왼쪽 막대는 정확히 해당 횟수가 나올 확률입니다. 기준 횟수까지의 확률을 더하면 오른쪽 계단의 높이가 됩니다. 넓은 범위에서는 대표 횟수만 표시합니다.':'왼쪽 곡선 아래에서 기준값까지의 면적이 오른쪽 곡선의 높이입니다.')+
        (last?' 직전 기준값에서 읽은 누적확률보다 '+fmt(Math.abs(p-last.p)*100)+'%p '+(p===last.p?'차이입니다.':p>last.p?'높습니다.':'낮습니다.'):' 값을 바꾼 뒤 다시 계산하면 두 곡선을 같은 축에서 비교할 수 있습니다.');
      last=current;error.textContent='';
    }catch(e){error.textContent=e.message;}
  }
  function draw(now,prev){
    const curves=prev?[prev,now]:[now];
    const lo=Math.min(...curves.flatMap(c=>[c.model.range[0],c.x]));
    const hi=Math.max(lo+1e-10,...curves.flatMap(c=>[c.model.range[1],c.x]));
    const X=t=>64+346*(t-lo)/(hi-lo);
    const series=curves.map(c=>{
      const points=new Set([lo,hi,c.x]);
      if(group==='count' && hi-lo<=1200){
        for(let k=Math.ceil(lo);k<=hi;k++) points.add(k);
      }
      if(group==='life'){
        for(let i=0;i<=200;i++) points.add(c.model.range[1]*Math.pow(10,-14*i/200));
      }
      for(let i=0;i<=320;i++){
        const t=c.model.range[0]+(c.model.range[1]-c.model.range[0])*i/320;
        points.add(group==='count'?Math.floor(t):t);
        const s=lo+(hi-lo)*i/320;points.add(group==='count'?Math.floor(s):s);
      }
      const singular=c.model.density(0)===Infinity;
      const firstPositive=(c.model.range[1]-c.model.range[0])/640;
      if(singular) points.add(firstPositive);
      const samples=[...points].filter(t=>t>=lo&&t<=hi).sort((a,b)=>a-b)
        .map(t=>({t,p:c.model.tails(t)[0],d:singular&&t>=0&&t<firstPositive?null:c.model.density(t)}));
      return {c,samples,singular};
    });
    const plots=root.querySelectorAll('svg');
    let peak=0;
    for(const {samples,c} of series){
      for(const {d} of samples) if(Number.isFinite(d)) peak=Math.max(peak,d);
      if(Number.isFinite(c.d)) peak=Math.max(peak,c.d);
    }
    for(const [index,key] of ['d','p'].entries()){
      const top=key==='d'?(peak||1):1, Y=v=>194-158*(v/top);
      let svg='';
      for(const fraction of [0,.25,.5,.75,1]){
        const y=194-158*fraction;
        svg+='<path stroke="#dae3e6" d="M64 '+y+'h346"/><text x="59" y="'+(y+4)+'" text-anchor="end">'+Number((fraction*top).toPrecision(3))+'</text>';
      }
      for(let i=0;i<=4;i++){
        const t=lo+(hi-lo)*i/4;
        svg+='<text x="'+X(t)+'" y="214" text-anchor="middle">'+Number(t.toPrecision(4))+'</text>';
      }
      for(const {c,samples,singular} of series){
        let path='';
        for(const point of samples){
          const v=point[key];
          if(!Number.isFinite(v)) continue;
          const x=X(point.t),y=Y(v);
          if(discrete&&key==='d'){
            if(v>0) path+='M'+x+' 194V'+y;
          }else if(discrete&&path) path+='H'+x+'V'+y;
          else path+=(path?'L':'M')+x+' '+y;
        }
        const color=c===now?'#076960':'#a25b26';
        svg+='<path fill="none" stroke="'+color+'" stroke-width="2" '+(c===prev?'stroke-dasharray="5 3"':'')+' d="'+path+'"/>';
        if(Number.isFinite(c[key])) svg+='<circle fill="'+color+'" cx="'+X(c.x)+'" cy="'+Y(c[key])+'" r="4"/>';
        if(key==='d'&&singular&&c===now) svg+='<text x="65" y="19">0에서 밀도 → ∞</text>';
      }
      plots[index].innerHTML=svg+'<text x="237" y="237" text-anchor="middle">'+(group==='life'?'고장 시간 [h]':discrete?'사건 횟수':'통계량')+'</text>';
    }
  }
  find('form').onsubmit=e=>{e.preventDefault();run();};select.onchange=reset;reset();return root;
}
