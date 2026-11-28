const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const scripts = ['expo-model', 'repair-integrals-model', 'ft-event-model', 'failure-intensity-model', 'pfd-pfh-model'];
const model = vm.runInNewContext(scripts.map(s => fs.readFileSync(path.join(__dirname, '../docs', s + '.js'), 'utf8')).join('\n') + '\npfdPfh');
const inputs = { lambda: .001, mu: .01, lambda1: .001, lambda2: .001, t: 1000 };
const phi = x => -Math.expm1(-x) / x;
function close(actual, expected) {
  assert.ok(Math.abs(actual - expected) <= Math.abs(expected) * 1e-12, actual + ' vs ' + expected);
}

test('mission averages agree with the analytical integrals', () => {
  const cases = [
    ['single', (1 - phi(11)) / 11, -Math.expm1(-1)],
    ['or', 1 - phi(2), -Math.expm1(-2)],
    ['and', 1 - 2 * phi(1) + phi(2), Math.expm1(-1) ** 2]
  ];
  for (const [mode, pfd, f] of cases) {
    const result = model.calculate(mode, inputs);
    close(result.pfd, pfd);
    close(result.pfh, f / inputs.t);
  }
  const faster = model.calculate('single', { ...inputs, mu: .1 });
  assert.ok(faster.pfd < cases[0][1]);
  close(faster.pfh, cases[0][2] / inputs.t);
});

test('zero time, rejected inputs and widely separated time scales', () => {
  for (const mode of ['single', 'or', 'and']) {
    const modelAtT = model.prepare(mode, inputs);
    assert.equal(modelAtT.sample(0).pfd, null);
    assert.equal(modelAtT.sample(0).pfh, null);
    assert.equal(model.prepare(mode, {...inputs, t: -1}).ok, false);
  }
  const asymmetric = model.calculate('and', {...inputs, lambda1: 1e-15, lambda2: 1e12, t: 1});
  close(asymmetric.pfd, 5e-16);
  const tiny = model.calculate('and', {...inputs, lambda1: 1, lambda2: 1, t: 1e-180});
  close(tiny.pfh, 1e-180);
});
