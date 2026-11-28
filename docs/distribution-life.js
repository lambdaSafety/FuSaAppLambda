(() => {
  const {gamma,normal,pair,logGamma}=DistributionMath;
  const scale=['척도 η [h]',100,.001,1e7],shape=['형상 β',2,.1,50];
  DistributionLab.register('life',{
    exponential:{name:'지수분포',fields:[['고장률 λ [1/h]',.01,1e-9,1e3]],x:100,
      formula:'F(t)=1-e^{-\\lambda t},\\quad E[T]=1/\\lambda',hint:'고장률이 일정합니다. λ를 두 배로 올리면 같은 누적고장확률에 도달하는 시간이 절반이 됩니다.',
      build:rate=>({range:[0,5/rate],mean:1/rate,density:t=>t<0?0:rate*Math.exp(-rate*t),tails:t=>pair(-rate*Math.max(0,t),true)})},
    weibull:{name:'와이블분포',fields:[scale,shape],x:100,
      formula:'F(t)=1-e^{-(t/\\eta)^\\beta},\\quad E[T]=\\eta\\,\\Gamma(1+1/\\beta)',hint:'형상이 1보다 작으면 고장률이 감소하고, 1이면 일정하며, 1보다 크면 증가합니다. 형상을 바꿔도 척도 시간 η에서 두 곡선은 약 63.2%로 만납니다.',
      build:(s,b)=>({range:[0,s*Math.pow(4,1/b)],mean:s*Math.exp(logGamma(1+1/b)),density:t=>{
        if(t<0) return 0;
        if(t===0) return b===1?1/s:b<1?Infinity:0;
        return Math.exp(Math.log(b/s)+(b-1)*Math.log(t/s)-(t/s)**b);
      },tails:t=>pair(-Math.pow(Math.max(0,t)/s,b),true)})},
    lognormal:{name:'로그정규분포',fields:[['로그시간 평균 μ (시간 단위 h)',4,-12,16],['로그시간 표준편차 σ',.5,.05,4]],x:100,
      formula:'F(t)=\\Phi((\\ln(t/1\\,\\mathrm h)-\\mu)/\\sigma),\\quad E[T]=e^{\\mu+\\sigma^2/2}\\,\\mathrm h',hint:'로그시간이 정규분포를 따릅니다. μ를 고정하고 σ를 늘리면 중앙값은 유지되지만 조기 고장과 긴 수명이 함께 늘어납니다.',
      build:(m,s)=>({range:[0,Math.exp(m+2.5*s)],mean:Math.exp(m+s*s/2),density:t=>t<=0?0:Math.exp(-.5*((Math.log(t)-m)/s)**2)/(t*s*Math.sqrt(2*Math.PI)),tails:t=>t<=0?[0,1]:normal((Math.log(t)-m)/s)})},
    gamma:{name:'감마분포',fields:[['형상 α',2,.1,5000],['척도 θ [h]',50,.001,1e7]],x:100,
      formula:'F(t)=\\gamma(\\alpha,t/\\theta)/\\Gamma(\\alpha),\\quad E[T]=\\alpha\\theta',hint:'형상이 양의 정수이면 여러 지수 대기시간의 합으로 해석할 수 있습니다. 척도를 고정하고 형상을 늘리면 평균 수명이 늘어납니다.',
      build:(a,s)=>({range:[0,s*(a+5*Math.sqrt(a))],mean:a*s,density:t=>DistributionMath.gammaDensity(a,s,t),tails:t=>gamma(a,Math.max(0,t)/s)})}
  });
})();
