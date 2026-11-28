const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const context=vm.createContext({});
for(const file of ['model','count','life']){
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../docs/distribution-'+file+'.js'),'utf8'),context);
}
const lab=vm.runInContext('DistributionLab',context);
const cases=[
  ['inference','normal',[0,1],1.96,.97500210485178],
  ['inference','student',[5],2,.94903026058507],
  ['inference','chi',[2],2,1-Math.exp(-1)],
  ['inference','fisher',[2,2],2,2/3],
  ['count','binomial',[10,.5],2,56/1024],
  ['count','poisson',[2],1,3*Math.exp(-2)],
  ['count','hyper',[10,3,2],0,21/45],
  ['count','negative',[2,.5],1,.5],
  ['life','exponential',[.01],100,1-Math.exp(-1)],
  ['life','weibull',[100,2],50,1-Math.exp(-.25)],
  ['life','lognormal',[0,1],1,.5],
  ['life','gamma',[2,50],100,1-3*Math.exp(-2)]
];
for(const [group,id,args,x,p] of cases){
  test(id,()=>{
    const [lower,upper]=lab.prepare(group,id,args).tails(x);
    assert.ok(Math.abs(lower-p)<1e-12 && Math.abs(upper-(1-p))<1e-12);
  });
}
test('small probabilities, endpoint and invalid population',()=>{
  assert.ok(lab.prepare('inference','normal',[0,1]).tails(10)[1]>7e-24);
  assert.equal(lab.prepare('life','exponential',[1]).tails(1e-20)[0],1e-20);
  assert.equal(lab.prepare('count','binomial',[10,1]).tails(9)[0],0);
  assert.throws(()=>lab.prepare('count','hyper',[10,11,3]));
});

test('density or mass for each supported distribution',()=>{
  const expected=[
    Math.exp(-(1.96**2)/2)/Math.sqrt(2*Math.PI), .0650903103262165, Math.exp(-1)/2, 1/9,
    45/1024, 2*Math.exp(-2), 21/45, .25,
    .01*Math.exp(-1), .01*Math.exp(-.25), 1/Math.sqrt(2*Math.PI), 2*Math.exp(-2)/50
  ];
  cases.forEach(([group,id,args,x],i)=>{
    assert.ok(Math.abs(lab.prepare(group,id,args).density(x)-expected[i])<1e-12,id);
  });
  assert.equal(lab.prepare('life','weibull',[10,.5]).density(0),Infinity);
  assert.equal(lab.prepare('count','poisson',[0]).density(0),1);
  assert.equal(lab.prepare('count','poisson',[3]).density(.5),0);
});
