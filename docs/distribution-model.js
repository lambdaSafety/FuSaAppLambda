/* Regularized gamma and beta functions. Compute the smaller-side representation
   directly and retain both tails for callers. All arithmetic uses binary64. */
const DistributionMath = (() => {
  const coefficients = [676.5203681218851,-1259.1392167224028,771.3234287776531,
    -176.61502916214059,12.507343278686905,-0.13857109526572012,9.984369578019572e-6,1.5056327351493116e-7];
  function logGamma(x) {
    if (x < .5) return logGamma(x+1)-Math.log(x);
    const z=x-1, t=z+7.5;
    let sum=.99999999999980993;
    coefficients.forEach((c,i)=>{sum+=c/(z+i+1);});
    return .5*Math.log(2*Math.PI)+(z+.5)*Math.log(t)-t+Math.log(sum);
  }
  function pair(logP, reverse=false) {
    logP=Math.min(0,logP);
    const small=Math.exp(logP), other=-Math.expm1(logP);
    return reverse ? [other,small] : [small,other];
  }
  function fraction(term, initial, c=1e280) {
    const safe=v=>Math.abs(v)<1e-280 ? (v<0?-1:1)*1e-280 : v;
    let d=1/safe(initial),h=d;
    for(let i=1;i<=20000;i++){
      const [a,b]=term(i);
      d=1/safe(b+a*d); c=safe(b+a/c);
      const change=c*d; h*=change;
      if(Math.abs(change-1)<2e-15) return h;
    }
    throw Error('연분수가 허용 오차에 수렴하지 않았습니다.');
  }
  function gamma(a,x) {
    if(x<=0) return [0,1];
    if(x===Infinity) return [1,0];
    const logFactor=a*Math.log(x)-x-logGamma(a);
    if(x<a+1){
      let term=1/a,sum=term;
      for(let n=1;n<=20000;n++){
        term*=x/(a+n); sum+=term;
        if(term<=sum*2e-16) return pair(logFactor+Math.log(sum));
      }
      throw Error('급수가 허용 오차에 수렴하지 않았습니다.');
    }
    return pair(logFactor+Math.log(fraction(i=>[i*(a-i),x+1-a+2*i],x+1-a)),true);
  }
  function beta(a,b,x,y=1-x) {
    const reverse=x>(a+1)/(a+b+2);
    if(reverse) { [a,b]=[b,a]; [x,y]=[y,x]; }
    if(x===0) return pair(-Infinity,reverse);
    const logFront=a*(x<.5?Math.log(x):Math.log1p(-y))+b*(y<.5?Math.log(y):Math.log1p(-x))
      +logGamma(a+b)-logGamma(a)-logGamma(b);
    const h=fraction(i=>{
      const m=Math.floor((i+1)/2);
      const term=i%2 ? m*(b-m)*x/((a+2*m-1)*(a+2*m)) :
        -(a+m)*(a+b+m)*x/((a+2*m)*(a+2*m+1));
      return [term,1];
    },1-(a+b)*x/(a+1),1);
    return pair(logFront+Math.log(h/a),reverse);
  }
  function normal(z){
    const half=gamma(.5,z*z/2)[1]/2;
    return z<0 ? [half,1-half] : [1-half,half];
  }
  function gammaDensity(a,s,x){
    if(x<0) return 0;
    if(x===0) return a===1?1/s:a<1?Infinity:0;
    return Math.exp((a-1)*Math.log(x/s)-x/s-logGamma(a)-Math.log(s));
  }
  return {logGamma,gamma,beta,normal,pair,gammaDensity};
})();

const DistributionLab = (() => {
  const groups={};
  function register(group,models){groups[group]=models;}
  function prepare(group,id,values){
    const model=groups[group]?.[id];
    if(!model) throw Error('분포를 선택하세요.');
    if(!Array.isArray(values)||values.length!==model.fields.length) throw Error("분포 모수 개수를 확인하세요.");
    model.fields.forEach(([name,,min,max,integer],i)=>{
      const v=values[i];
      if(!Number.isFinite(v)||v<min||v>max||(integer&&!Number.isInteger(v)))
        throw Error(name+' 입력 범위 '+min+' ~ '+max+(integer?' (정수)':''));
    });
    const prepared=model.build(...values), evaluate=prepared.tails, density=prepared.density;
    prepared.tails=x=>{
      if(!Number.isFinite(x)||Math.abs(x)>Number.MAX_SAFE_INTEGER) throw Error('유한한 기준값을 입력하세요.');
      return evaluate(x);
    };
    prepared.density=x=>{
      if(!Number.isFinite(x)||Math.abs(x)>Number.MAX_SAFE_INTEGER) throw Error('유한한 기준값을 입력하세요.');
      if(group==='count' && (!Number.isInteger(x)||x<0)) return 0;
      return density(x);
    };
    return prepared;
  }
  return {groups,register,prepare};
})();
DistributionLab.register('inference',{
  normal:{name:'정규분포',fields:[['평균 μ',0,-1e6,1e6],['표준편차 σ',1,.001,1e5]],x:1.96,
    formula:'Z=(X-\\mu)/\\sigma',hint:'평균을 키우면 곡선이 오른쪽으로 이동합니다. 표준편차를 키우면 중앙의 기울기가 완만해집니다.',
    build:(m,s)=>({range:[m-4*s,m+4*s],density:x=>Math.exp(-.5*((x-m)/s)**2)/(s*Math.sqrt(2*Math.PI)),tails:x=>DistributionMath.normal((x-m)/s)})},
  student:{name:'t분포',fields:[['자유도 ν',5,1,5000,true]],x:2,
    formula:'T=\\frac{\\bar X-\\mu_0}{S/\\sqrt n},\\quad \\nu=n-1',hint:'평균 검정에서 표준오차를 표본으로 추정합니다. 양의 기준값에서 자유도를 늘리면 오른쪽 꼬리가 줄어듭니다.',
    build:v=>({range:[-5,5],density:x=>Math.exp(DistributionMath.logGamma((v+1)/2)-DistributionMath.logGamma(v/2)
      -.5*Math.log(v*Math.PI)-(v+1)/2*Math.log1p(x*x/v)),tails:x=>{const t=x*x, half=DistributionMath.beta(v/2,.5,v/(v+t),t/(v+t))[0]/2;
      return x<0?[half,1-half]:[1-half,half];}})},
  chi:{name:'카이제곱분포',fields:[['자유도 ν',5,1,5000,true]],x:5,
    formula:'X=\\sum_{i=1}^{\\nu}Z_i^2',hint:'독립 표준정규변수의 제곱합입니다. 자유도가 늘면 중심이 오른쪽으로 이동해 같은 기준값 이하의 확률이 작아집니다.',
    build:v=>({range:[0,v+4*Math.sqrt(2*v)],density:x=>DistributionMath.gammaDensity(v/2,2,x),tails:x=>DistributionMath.gamma(v/2,x/2)})},
  fisher:{name:'F분포',fields:[['분자 자유도',5,1,5000,true],['분모 자유도',10,1,5000,true]],x:2,
    formula:'F=(U/d_1)/(V/d_2)',hint:'독립 카이제곱 변수 U, V를 각각의 자유도로 나눈 뒤 비율을 구합니다. 분모 자유도가 작으면 큰 비율이 관측될 가능성이 커집니다.',
    build:(a,b)=>({range:[0,5],density:x=>{
      if(x<0) return 0;
      if(x===0) return a===2?1:a<2?Infinity:0;
      return Math.exp(a/2*Math.log(a/b)+(a/2-1)*Math.log(x)-(a+b)/2*Math.log1p(a*x/b)
        +DistributionMath.logGamma((a+b)/2)-DistributionMath.logGamma(a/2)-DistributionMath.logGamma(b/2));
    },tails:x=>x<=0?[0,1]:DistributionMath.beta(a/2,b/2,a*x/(a*x+b),b/(a*x+b))})}
});

