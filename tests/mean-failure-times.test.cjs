const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const scripts = ['expo-model', 'repair-integrals-model', 'ft-event-model', 'failure-intensity-model', 'mean-failure-times-model'];
const api = vm.runInNewContext(scripts.map(s => fs.readFileSync(path.join(__dirname,'../docs',s+'.js'),'utf8')).join('\n')+'\nmeanFailureTimes');
const inputs = {lambda:.001,mu:.01,lambda1:.001,lambda2:.001,t:1000};
function close(a,b) { assert.ok(Math.abs(a-b) <= 1e-13 * Math.abs(b), a+' != '+b); }
test('single and OR analytical means', () => {
  const r = api.calculate('single',inputs);
  close(r.mttf,1000); close(r.mtbf,1100); close(r.effective,1000);
  const g = api.calculate('or',inputs);
  close(g.mttf,500); close(g.effective,500); assert.equal(g.mtbf,Infinity);
});
test('AND restricted survival integral and long mission', () => {
  const m = api.prepare('and',inputs);
  const area = 2000*(1-Math.exp(-1))-500*(1-Math.exp(-2));
  close(m.result.mttf,1500); close(m.result.truncated,area);
  close(m.result.effective,area/(1-Math.exp(-1))**2);
  close(m.sample(1e8).effective,1500);
});
test('zero time, impossible failure, no repair and invalid inputs', () => {
  for(const mode of ['single','or','and']) {
    assert.equal(api.calculate(mode,{...inputs,t:0}).effective,null);
    const r=api.calculate(mode,{...inputs,lambda:0,lambda1:0,lambda2:0});
    assert.equal(r.effective,Infinity); assert.equal(r.mttf,Infinity); close(r.truncated,1000);
    assert.equal(api.calculate(mode,{...inputs,t:-1}).ok,false);
  }
  assert.equal(api.calculate('single',{...inputs,mu:0}).mtbf,Infinity);
});
