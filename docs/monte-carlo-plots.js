function mcPlots(container, samples, threshold, fails, theory) {
  const n=samples.length, values=[], trend=[];
  let mean=0, m2=0, count=0;
  const stride=Math.ceil(n/400);
  samples.forEach(({z},i)=>{
    const delta=z-mean;
    mean+=delta/(i+1);
    m2+=delta*(z-mean);
    if (fails(z)) count++;
    values.push(z);
    if (i%stride===0 || i===n-1) trend.push([i+1,mean]);
  });
  values.sort((a,b)=>a-b);
  const percentile=values[Math.ceil(.999*n)-1];
  container.replaceChildren();
  const blue='#256489', red='#b33a32', green='#237a52';
  function bounds(lo,hi) {
    if (lo===hi) { const pad=Math.max(1,Math.abs(lo)*.02);return [lo-pad,hi+pad]; }
    return [lo,hi];
  }
  function plot(title,xLabel,yLabel,xRange,yRange,legend,draw) {
    const [x0,x1]=xRange,[y0,y1]=yRange;
    const X=v=>52+252*((v-x0)/(x1-x0)), Y=v=>146-126*((v-y0)/(y1-y0));
    const figure=document.createElement('figure');
    figure.className='expo-card';
    const heading=document.createElement('h3');heading.textContent=title;
    const caption=document.createElement('figcaption');caption.textContent=legend;
    const tick=v=>Number(v.toPrecision(3)).toString();
    figure.innerHTML=`<svg viewBox="0 0 340 190" role="img" aria-label="${title}"><path d="M52 20V146H304" stroke="#75838c" fill="none"/>
      <g font-size="10" fill="#354751"><text x="48" y="25" text-anchor="end">${tick(y1)}</text><text x="48" y="146" text-anchor="end">${tick(y0)}</text>
      <text x="52" y="162">${tick(x0)}</text><text x="304" y="162" text-anchor="end">${tick(x1)}</text>
      <text x="52" y="12">${yLabel}</text><text x="178" y="181" text-anchor="middle">${xLabel}</text></g>${draw(X,Y)}</svg>`;
    figure.prepend(heading);figure.append(caption);container.append(figure);
  }
  const averages=trend.map(point=>point[1]);
  if (theory) averages.push(theory[0]);
  plot('누적 평균의 수렴','누적 표본 수','표본 평균',[1,Math.max(n,2)],bounds(Math.min(...averages),Math.max(...averages)),
    theory?'파랑 · 누적 평균　초록 점선 · 이론 평균':'파랑 · 누적 평균',(X,Y)=>{
      const ref=theory?`<path d="M52 ${Y(theory[0])}H304" stroke="${green}" stroke-dasharray="4 3"/>`:'';
      return ref+`<polyline points="${trend.map(([i,m])=>X(i)+','+Y(m)).join(' ')}" fill="none" stroke="${blue}" stroke-width="2"/><circle cx="${X(n)}" cy="${Y(mean)}" r="2.5" fill="${blue}"/>`;
    });
  const [lo,hi]=bounds(values[0],values[n-1]);
  const bins=Array.from({length:Math.min(28,Math.ceil(Math.sqrt(n)))},()=>[0,0]);
  for (const v of values) bins[Math.min(bins.length-1,Math.floor(((v-lo)/(hi-lo))*bins.length))][Number(fails(v))]++;
  const max=Math.max(...bins.map(([a,b])=>a+b));
  const inside=threshold>=lo && threshold<=hi;
  plot('출력 분포','출력값','구간별 표본 수',[lo,hi],[0,max],
    '빨강 · 판정 조건에 해당하는 표본　초록선 · 평균　보라 점선 · P99.9　'+(inside?'검정 점선 · 임계치':'임계치 '+mcFormat(threshold)+'는 표시 범위 밖'),(X,Y)=>{
      const w=252/bins.length;
      const bars=bins.map(([a,b],i)=>`<rect x="${52+i*w}" y="${Y(a)}" width="${w-.5}" height="${146-Y(a)}" fill="${blue}"/><rect x="${52+i*w}" y="${Y(a+b)}" width="${w-.5}" height="${Y(a)-Y(a+b)}" fill="${red}"/>`).join('');
      const marker=(v,color,dash)=>`<path d="M${X(v)} 20V146" stroke="${color}" stroke-width="2" stroke-dasharray="${dash}"/>`;
      return bars+marker(mean,green,'none')+marker(percentile,'#75459b','2 2')+(inside?marker(threshold,'#292e33','5 3'):'');
    });
  const dots=samples.filter((_,i)=>i%Math.ceil(n/1200)===0);
  const xs=dots.map(p=>p.x),ys=dots.map(p=>p.y);
  plot('입력 표본과 판정 영역','입력 X1','입력 X2',bounds(Math.min(...xs),Math.max(...xs)),bounds(Math.min(...ys),Math.max(...ys)),
    '표시 '+dots.length.toLocaleString()+'점 · 파랑은 기준 이내, 빨강은 판정 조건에 해당하는 표본',
    (X,Y)=>dots.map(p=>`<circle cx="${X(p.x)}" cy="${Y(p.y)}" r="2" opacity=".7" fill="${fails(p.z)?red:blue}"/>`).join(''));
  return {mean,variance:n>1?Math.max(0,m2)/(n-1):NaN,count,percentile};
}

