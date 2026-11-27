const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const scripts = ['expo-model.js', 'repair-integrals-model.js'].map(name =>
  fs.readFileSync(path.join(__dirname, '..', 'docs', name), 'utf8'));
const model = vm.runInNewContext(scripts.join('\n') + '\nrepairIntegrals');
const defaults = { lambda: '5e-7', mu: '0.01', t: '1000' };
const fields = ['expectedFailures', 'expectedDowntime', 'cumulativeHazard'];

function close(actual, expected, tolerance = 2e-15) {
  const error = Math.abs(actual - expected);
  assert.ok(error <= Math.max(Number.MIN_VALUE, tolerance * Math.abs(expected)),
    `received ${actual}, expected ${expected}`);
}

test('default mission agrees with independent high-precision reference values', () => {
  const { result, sample, checkIntegration } = model.prepare(defaults);
  close(result.expectedFailures, 0.000499977500886524506653900553891);
  close(result.expectedDowntime, 0.0449982269509866921988922179822);
  close(result.cumulativeHazard, 0.0005);
  close(result.averageUnavailability, 0.0000449982269509866921988922179822);
  close(result.unreliability, 0.000499875020830729427061633494447);
  const check = checkIntegration();
  assert.ok(check.panels > 2);
  for (const field of fields) {
    assert.equal(sample(1000)[field], result[field]);
    close(check[field], result[field], 1e-12);
  }
});

test('zero time, zero failure rate and absent repair have their model limits', () => {
  const initial = model.calculate({ ...defaults, t: 0 });
  const noFailures = model.calculate({ ...defaults, lambda: 0 });
  for (const field of fields) {
    assert.equal(initial[field], 0);
    assert.equal(noFailures[field], 0);
  }
  assert.equal(initial.averageUnavailability, null);
  assert.equal(noFailures.averageUnavailability, 0);
  const nonRepair = model.calculate({ lambda: 1, mu: 0, t: 40 });
  assert.equal(nonRepair.expectedFailures, nonRepair.unreliability);
  close(nonRepair.expectedDowntime, 39);
  assert.equal(nonRepair.cumulativeHazard, 40);
});

test('tiny exposure preserves downtime and distinguishes a rounded-zero area from its mean', () => {
  const tiny = model.calculate({ lambda: 1e-20, mu: 0, t: 1 });
  close(tiny.expectedDowntime, 5e-21);
  const short = model.calculate({ lambda: 1e200, mu: 1e300, t: 1e-300 });
  assert.equal(short.expectedDowntime, 0);
  close(short.averageUnavailability, Math.exp(-1) * 1e-100);
  close(short.expectedFailures, 1e-100);
});

test('large rates preserve finite integrals even if a rate sum, exposure or rate ratio is out of range', () => {
  const fast = model.calculate({ lambda: 1e308, mu: 1e308, t: 1e-308 });
  close(fast.expectedFailures, 0.5 + 0.25 * -Math.expm1(-2));
  close(fast.averageUnavailability, 0.5 * (1 + Math.expm1(-2) / 2));
  const tinyShare = model.calculate({ lambda: 1e-300, mu: 1e300, t: 1e300 });
  assert.equal(tinyShare.averageUnavailability, 0);
  close(tinyShare.expectedDowntime, 1e-300);
  const long = model.calculate({ lambda: 1e308, mu: 1e-300, t: 1e308 });
  assert.equal(long.cumulativeHazard, Infinity);
  close(long.expectedFailures, 100000001);
  close(long.expectedDowntime, 1e308);
});

test('refinement tracks the transient across small, crossover and long missions', () => {
  for (const t of [1e-14, 0.49999999999999994, 0.5, 10, 1e12]) {
    const { result, checkIntegration } = model.prepare({ lambda: 1.5, mu: 0.5, t });
    const numerical = checkIntegration();
    for (const field of fields) close(numerical[field], result[field], 1e-12);
    close(result.expectedFailures, result.probability + 0.5 * result.expectedDowntime);
  }
  const slowRepair = model.calculate({ ...defaults, mu: 0 });
  const fastRepair = model.calculate(defaults);
  assert.ok(fastRepair.expectedDowntime < slowRepair.expectedDowntime);
  assert.ok(fastRepair.expectedFailures > slowRepair.expectedFailures);
  assert.equal(fastRepair.cumulativeHazard, slowRepair.cumulativeHazard);
});

test('validates public API inputs before computing or sampling', () => {
  const invalid = model.calculate({ lambda: '-1', mu: '', t: '1e999' });
  assert.equal(invalid.ok, false);
  assert.deepEqual(Array.from(invalid.fields).sort(), ['lambda', 'mu', 't']);
  const { sample } = model.prepare(defaults);
  for (const t of [-1, Infinity, NaN]) assert.throws(() => sample(t), { name: 'RangeError' });
});
