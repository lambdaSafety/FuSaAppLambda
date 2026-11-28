const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const context=vm.createContext({});
for(const file of ['distribution-model','learning-labs']){
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../docs/'+file+'.js'),'utf8'),context);
}
test('umbrella posterior and conditional OR match worked examples',()=>{
  assert.ok(Math.abs(context.rainPosterior(.2)-2/3)<1e-15);
  assert.ok(Math.abs(context.conditionalOr(.02,.03)-.0494)<1e-15);
});
test('one-sample inference uses the two-sided t tail',()=>{
  const r=context.studyMeanTest([1,2,3],1);
  assert.ok(Math.abs(r.p-.2254033307585166)<1e-12);
  assert.ok(Math.abs(r.lower-(-.48413771172))<1e-9);
  assert.throws(()=>context.studyMeanTest([1,1],1));
});
test('first system stop accounts for repair and retains small probabilities',()=>{
  const model=context.studyMarkov(.01,.1);
  assert.equal(model.mean,650);
  assert.ok(Math.abs(context.studyMarkov(.01,.2).mean-1150)<1e-10);
  const plain=context.studyMarkov(.01,0);
  for(const t of [0,1e-8,.2,10,1000]){
    const exact=Math.expm1(-.01*t)**2;
    assert.ok(Math.abs(plain.cdf(t)-exact)<=exact*1e-11);
  }
  assert.ok(model.cdf(100)<plain.cdf(100));
});
test('same seeded walk preserves its prefix as the horizon grows',()=>{
  assert.deepEqual(context.studyWalk(10,.5,context.studyRandom(5)),
    context.studyWalk(50,.5,context.studyRandom(5)).slice(0,11));
});
