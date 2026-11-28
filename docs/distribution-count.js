(() => {
  const {beta,gamma,logGamma}=DistributionMath;
  const count=(label,value)=>[label,value,1,5000,true];
  const probability=['성공 확률 p',.3,0,1];
  const span=(mean,variance)=>[0,Math.max(1,Math.ceil(mean+5*Math.sqrt(variance)))];
  function hyper(N,K,n){
    if(K>N||n>N) throw Error('불량 수와 추출 수는 모집단 크기 이하여야 합니다.');
    const lo=Math.max(0,n+K-N), hi=Math.min(K,n);
    const mode=Math.floor((n+1)*(K+1)/(N+2)), weights=new Float64Array(hi-lo+1);
    weights[mode-lo]=1;
    for(let k=mode;k<hi;k++) weights[k+1-lo]=weights[k-lo]*(K-k)*(n-k)/((k+1)*(N-K-n+k+1));
    for(let k=mode;k>lo;k--) weights[k-1-lo]=weights[k-lo]*k*(N-K-n+k)/((K-k+1)*(n-k+1));
    function sums(reverse){
      const out=new Float64Array(weights.length);
      let sum=0,correction=0;
      for(let i=0;i<out.length;i++){
        const j=reverse?out.length-1-i:i;
        const y=weights[j]-correction,next=sum+y;
        correction=(next-sum)-y;out[j]=sum=next;
      }
      return out;
    }
    const lower=sums(false),upper=sums(true),total=upper[0];
    return {range:[lo,Math.max(lo+1,hi)],density:k=>k<lo||k>hi?0:weights[k-lo]/total,tails:x=>{const k=Math.floor(x);
      return k<lo?[0,1]:k>=hi?[1,0]:[lower[k-lo]/total,upper[k+1-lo]/total];}};
  }
  DistributionLab.register('count',{
    binomial:{name:'이항분포',fields:[count('시행 수 n',20),probability],x:5,
      formula:'P(X=k)=\\binom nk p^k(1-p)^{n-k}',hint:'독립 시행에서 성공한 횟수입니다. 시행 수가 같을 때 성공 확률을 키우면 계단이 오른쪽으로 이동합니다.',
      build:(n,p)=>({range:[0,n],density:k=>{
        if(k>n) return 0;
        if(p===0||p===1) return Number(k===n*p);
        return Math.exp(logGamma(n+1)-logGamma(k+1)-logGamma(n-k+1)+k*Math.log(p)+(n-k)*Math.log1p(-p));
      },tails:x=>{const k=Math.floor(x);return k<0?[0,1]:k>=n?[1,0]:beta(n-k,k+1,1-p,p);}})},
    poisson:{name:'포아송분포',fields:[['관찰 구간당 평균 건수 μ',4,0,5000]],x:4,
      formula:'P(X=k)=e^{-\\mu}\\mu^k/k!',hint:'정해진 구간에 발생하는 사건 수입니다. 평균 건수를 늘리면 중심이 오른쪽으로 이동하고 분산도 커집니다.',
      build:m=>({range:span(m,m),density:k=>m===0?Number(k===0):Math.exp(k*Math.log(m)-m-logGamma(k+1)),tails:x=>x<0?[0,1]:Math.floor(x)>Math.max(10000,4*m+1000)?[1,0]:gamma(Math.floor(x)+1,m).reverse()})},
    hyper:{name:'초기하분포',fields:[count('모집단 N',50),['모집단 불량 수 K',10,0,5000,true],['비복원 추출 수 n',8,0,5000,true]],x:2,
      formula:'P(X=k)=\\frac{\\binom Kk\\binom{N-K}{n-k}}{\\binom Nn}',hint:'복원 없이 뽑은 표본의 불량 수입니다. 추출 수를 늘리면 불량을 만날 기회가 늘고, 전수 검사에서는 불량 수가 K로 확정됩니다.',build:hyper},
    negative:{name:'음이항분포',fields:[count('목표 성공 수 r',3),['성공 확률 p',.5,.001,1]],x:3,
      formula:'P(X=k)=\\binom{k+r-1}{k}p^r(1-p)^k',hint:'r번째 성공까지 관측한 실패 횟수입니다. 성공 확률을 낮추면 더 많이 실패할 수 있어 계단이 오른쪽으로 퍼집니다.',
      build:(r,p)=>({range:span(r*(1-p)/p,r*(1-p)/(p*p)),density:k=>{
        if(p===1) return Number(k===0);
        return Math.exp(logGamma(k+r)-logGamma(k+1)-logGamma(r)+r*Math.log(p)+k*Math.log1p(-p));
      },tails:x=>x<0?[0,1]:x>1e8?[1,0]:beta(r,Math.floor(x)+1,p,1-p)})}
  });
})();
