const test = require('node:test');
const assert = require('node:assert/strict');
const MarkovModel = require('../docs/markov-model.js');
const { analyze } = require('../docs/markov-analysis.js');
const SysmlModel = require('../docs/sysml-model.js');

function close(actual, expected, tolerance = 1e-10) {
  assert.ok(Math.abs(actual - expected) <= tolerance * Math.max(1, Math.abs(expected)), `${actual} != ${expected}`);
}

function generated(n, needed, teams, mode, commonFailure = 0) {
  const model = MarkovModel.create();
  for (let i = 0; i < n; i++) MarkovModel.addComponent(model, null, 'Element ' + (i + 1));
  MarkovModel.generate(model, { mode, needed, teams, commonFailure, commonRepair: 0.04, down: 'dangerous' });
  return model;
}

test('single renewal model separates first failure from availability, restoration and demand failure', () => {
  const model = generated(1, 1, 1, 'independent');
  const { failure: l, repair: m } = model.components[0];
  const t = model.horizon = 28;
  const result = analyze(model);
  close(result.reliability, Math.exp(-l * t));
  close(result.availability, m / (l + m) + l / (l + m) * Math.exp(-(l + m) * t));
  close(result.maintainability, -Math.expm1(-m * t));
  close(result.mttff, 1 / l);
  close(result.mttr, 1 / m);
  close(result.avgPfd, l / (l + m) * (1 + Math.expm1(-(l + m) * t) / ((l + m) * t)));
  close(result.steadyAvailability, m / (l + m));
});

test('IEC 61165 Annex C: 1oo2 aggregated and unaggregated models reproduce 503000 h', () => {
  const detail = analyze(generated(2, 1, 2, 'independent'));
  const grouped = analyze(generated(2, 1, 2, 'aggregate'));
  const l = 0.0005, m = 0.25;
  close(detail.mttff, 503000);
  close(grouped.mttff, 503000);
  close(grouped.steadyAvailability, 1 - (l / (l + m)) ** 2);
  close(detail.reliability, grouped.reliability);
  close(detail.availability, grouped.availability);
  close(analyze(generated(2, 1, 1, 'fifo')).mttff, 503000);
});

test('IEC 61165 Annex B: 2oo4, CCF and FIFO generate the intended transitions', () => {
  const four = generated(4, 2, 4, 'aggregate');
  assert.equal(four.states.length, 5);
  close(four.transitions.find(edge => edge.title === '4λ').rate, 0.002);
  assert.equal(four.states.filter(state => MarkovModel.isUp(state)).length, 3);
  const common = generated(2, 1, 2, 'independent', 0.0001);
  const ccf = common.states.find(state => state.title === '공통원인 불능');
  close(common.transitions.find(edge => edge.targetId === ccf.id).rate, 0.0001);
  close(common.transitions.find(edge => edge.sourceId === ccf.id).rate, 0.04);
  assert.ok(analyze(common).mttff < 503000);
  const fifo = generated(2, 1, 1, 'fifo');
  for (const state of fifo.states.filter(state => !MarkovModel.isUp(state))) {
    assert.equal(fifo.transitions.filter(edge => edge.sourceId === state.id && edge.kind === 'repair').length, 1);
  }
});

test('periodic inspection uses exact boundaries and computes mean first detection by cycles', () => {
  const model = MarkovModel.create();
  const normal = MarkovModel.addState(model, 'Normal');
  const latent = MarkovModel.addState(model, 'Latent', 'degraded');
  const failed = MarkovModel.addState(model, 'Failed', 'dangerous');
  const period = model.interval = model.horizon = 10;
  const rate = 0.1;
  MarkovModel.addTransition(model, normal, latent, 'failure', { rate });
  MarkovModel.addTransition(model, latent, failed, 'inspection', { coverage: 1 });
  const result = analyze(model);
  close(result.unreliability, -Math.expm1(-rate * period));
  close(result.avgPfd, 0);
  close(result.pfd, result.unreliability);
  close(result.mttff, period / result.unreliability);
  assert.equal(result.steadyAvailability, null);
});

test('absorbing and unreachable states do not report a finite first-failure lifetime', () => {
  const model = MarkovModel.create();
  const normal = MarkovModel.addState(model, 'Normal');
  const idle = MarkovModel.addState(model, 'Idle');
  const failed = MarkovModel.addState(model, 'Failed', 'dangerous');
  MarkovModel.addTransition(model, normal, failed, 'failure', { rate: 0.1 });
  MarkovModel.addTransition(model, normal, idle, 'switch', { rate: 0.1 });
  const result = analyze(model);
  assert.equal(result.mttff, Infinity);
  assert.equal(result.steadyAvailability, null);
  close(result.probabilities.reduce((a, p) => a + p, 0), 1);
});

test('project serialization retains analysis layouts and replaces formatted placeholder names', () => {
  const project = SysmlModel.createProject();
  SysmlModel.addModel(project, '**ㅇㄴㅇㄹㄴㅇㄹ**');
  const ReqModel = require('../docs/req-model.js');
  ReqModel.addModel(project.requirements, 'ㅇㄴㅇㄹㄴㅇㄹ'.normalize('NFKC'));
  const model = generated(1, 1, 1, 'independent');
  project.workspaceData = { fmea: [{ failure: 'stuck' }], markov: [model] };
  const restored = SysmlModel.normalizeProject(JSON.parse(JSON.stringify(project)));
  assert.equal(restored.models[0].name, '시스템 모델 1');
  assert.equal(restored.requirements.models[0].title, '요구사항 모델 1');
  assert.deepEqual(restored.workspaceData.fmea, project.workspaceData.fmea);
  assert.equal(restored.workspaceData.markov[0].states[1].x, model.states[1].x);
});

