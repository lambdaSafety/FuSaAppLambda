const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const model = require('../docs/sysml-model.js');

const runtime = vm.createContext({});
for (const file of ['expo-model.js', 'fta-analysis.js']) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../docs', file), 'utf8'), runtime);
}
const { evaluateFaultTree, faultTreeCutSets } = runtime;

function tree(type, missionTime) {
  const nodes = ['a', 'b', 'c', 'middle', 'gate', 'top'].map(id => ({
    id, name: id, x: 0, y: 0, type: id === 'gate' ? type : 'event', threshold: 2
  }));
  const connectors = [['a', 'middle'], ['middle', 'gate'], ['b', 'gate'], ['c', 'gate'], ['gate', 'top']]
    .map(([sourceId, targetId]) => ({ sourceId, targetId }));
  const project = model.createProject();
  project.diagrams = [{ id: 'fta', name: 'FTA', missionTime, nodes, connectors }];
  return model.normalizeProject(project).diagrams[0];
}

function near(actual, expected) {
  assert.ok(Math.abs(actual - expected) < 1e-12, `${actual} differs from ${expected}`);
}

test('SysML drops connect source events and expand an element through an OR gate', () => {
  const project = model.createProject();
  const system = model.addModel(project, 'System');
  const element = model.addNode(system, 'element');
  element.predictedFit = 200;
  const first = model.addNode(system, 'failure', element.id);
  first.failurePercent = 75;
  const second = model.addNode(system, 'failure', element.id);
  second.failurePercent = 25;
  const port = model.addNode(system, 'port', element.id);
  port.predictedFit = 20;
  const portMode = model.addNode(system, 'failure', port.id);
  portMode.failurePercent = 0;
  const parent = { id: 'parent', type: 'and', name: 'AND', x: 0, y: 0 };
  const diagram = { id: 'fta', name: 'FTA', nodes: [parent], connectors: [] };
  project.diagrams = [diagram];
  const elementEvent = model.addFaultTreeSource(diagram, system, element, 10, 10, parent.id);
  const [gate, firstEvent, secondEvent] = diagram.nodes.slice(2);
  const direct = model.addFaultTreeSource(diagram, system, portMode, 10, 10, parent.id);
  assert.equal(model.addFaultTreeSource(diagram, system, portMode, 0, 0, elementEvent.id), undefined);
  assert.equal(gate.type, 'or');
  assert.deepEqual(diagram.connectors.map(edge => [edge.sourceId, edge.targetId]), [
    [elementEvent.id, parent.id], [gate.id, elementEvent.id], [firstEvent.id, gate.id],
    [secondEvent.id, gate.id], [direct.id, parent.id]
  ]);
  const saved = model.normalizeProject(JSON.parse(JSON.stringify(project))).diagrams[0];
  const [savedFirst, savedSecond, savedDirect] = saved.nodes.slice(3);
  assert.deepEqual(savedFirst.source, { modelId: system.id, nodeId: first.id });
  near(savedFirst.failureRate, 150e-9);
  near(savedSecond.failureRate, 50e-9);
  assert.equal(savedDirect.failureRate, 0);
  const results = evaluateFaultTree(saved);
  near(results.get(elementEvent.id).probability, -Math.expm1(-200e-9 * saved.missionTime));
});

test('SysML drop retains a missing mode rate and names the event during evaluation', () => {
  const project = model.createProject();
  const system = model.addModel(project, 'System');
  const mode = model.addNode(system, 'failure');
  mode.name = 'Unrated failure';
  const diagram = { id: 'fta', name: 'FTA', nodes: [], connectors: [] };
  project.diagrams = [diagram];
  model.addFaultTreeSource(diagram, system, mode, 10, 10);
  const saved = model.normalizeProject(project).diagrams[0];
  assert.equal(saved.nodes[0].failureRate, null);
  assert.throws(() => evaluateFaultTree(saved), /Unrated failure.*고장률/);
});

test('legacy events get a default rate and gate CDF and PDF propagate to the TLE', () => {
  const rate = 0.00001;
  const time = 1000;
  const survival = Math.exp(-rate * time);
  const p = 1 - survival;
  const f = rate * survival;
  for (const [type, probability, frequency] of [
    ['or', 1 - survival ** 3, 3 * f * survival ** 2],
    ['and', p ** 3, 3 * f * p ** 2],
    ['voting', 3 * p ** 2 - 2 * p ** 3, 6 * f * p * survival]
  ]) {
    const diagram = tree(type, 10000);
    assert.equal(diagram.nodes[0].failureRate, rate);
    assert.equal(diagram.missionTime, time);
    const result = evaluateFaultTree(diagram);
    for (const id of ['a', 'middle']) {
      near(result.get(id).probability, p);
      near(result.get(id).frequency, f);
    }
    near(result.get('top').probability, probability);
    near(result.get('top').frequency, frequency);
  }
});

test('zero rates, impossible thresholds and repeated inputs are handled explicitly', () => {
  const diagram = tree('voting', 0);
  for (const node of diagram.nodes) node.failureRate = 0;
  const result = evaluateFaultTree(diagram);
  assert.equal(result.get('a').frequency, 0);
  assert.equal(result.get('top').probability, 0);
  assert.equal(result.get('top').frequency, 0);
  diagram.nodes.find(node => node.id === 'gate').threshold = 4;
  assert.throws(() => evaluateFaultTree(diagram), /초과/);
  diagram.nodes.find(node => node.id === 'gate').threshold = 2;
  diagram.connectors.push({ sourceId: 'a', targetId: 'gate' });
  assert.throws(() => evaluateFaultTree(diagram), /동일한 기본 이벤트/);
});

test('minimal cut sets for two-input OR and AND and three-input voting', () => {
  for (const [type, expected] of [
    ['or', ['a', 'b']],
    ['and', ['a,b']],
    ['voting', ['a,b', 'a,c', 'b,c']]
  ]) {
    const diagram = tree(type);
    if (type !== 'voting') {
      diagram.nodes = diagram.nodes.filter(node => node.id !== 'c');
      diagram.connectors = diagram.connectors.filter(edge => edge.sourceId !== 'c');
    }
    const results = evaluateFaultTree(diagram);
    const [{ rows }] = faultTreeCutSets(diagram, diagram.nodes.filter(node => node.id === 'top'), results);
    assert.deepEqual(Array.from(rows, row => row.names.join(',')).sort(), expected);
    for (const row of rows) {
      assert.equal(row.order, type === 'or' ? 1 : 2);
      near(row.probability, (-Math.expm1(-0.01)) ** row.order);
    }
  }
});

test('mixed probability models feed the top event and cut set', () => {
  const diagram = tree('and');
  Object.assign(diagram.nodes[0], { probabilityModel: 'fixed', probability: 0.2 });
  Object.assign(diagram.nodes[1], { probabilityModel: 'derived', derivedPercent: 25 });
  const result = evaluateFaultTree(diagram);
  const p = -Math.expm1(-0.01);
  const f = 0.00001 * Math.exp(-0.01);
  assert.equal(result.get('a').frequency, 0);
  assert.equal(result.get('b').probability, 0.25);
  assert.equal(result.get('b').frequency, 0);
  near(result.get('top').probability, 0.05 * p);
  near(result.get('top').frequency, 0.05 * f);
  const [{ rows }] = faultTreeCutSets(diagram, [diagram.nodes.find(node => node.id === 'top')], result);
  near(rows[0].probability, 0.05 * p);
});

test('repair and monitoring reuse the reliability probability and entry frequency conventions', () => {
  const diagram = tree('or');
  const [repair, monitoring] = diagram.nodes;
  Object.assign(repair, { exponentialMode: 'repair', failureRate: 0.001, repairRate: 0.004 });
  Object.assign(monitoring, { exponentialMode: 'monitoring', failureRate: 0.002, inspectionInterval: 250 });
  const result = evaluateFaultTree(diagram);
  const repairProbability = 0.2 * -Math.expm1(-5);
  near(result.get('a').probability, repairProbability);
  near(result.get('a').frequency, 0.001 * (1 - repairProbability));
  near(result.get('b').probability, -Math.expm1(-0.5));
  near(result.get('b').frequency, 0.002 * Math.exp(-0.5));

  const project = model.createProject();
  project.diagrams = [diagram];
  const saved = model.normalizeProject(JSON.parse(JSON.stringify(project))).diagrams[0];
  assert.equal(saved.nodes[0].repairRate, 0.004);
  assert.equal(saved.nodes[1].inspectionInterval, 250);
  monitoring.derivedPercent = 101;
  assert.throws(() => model.normalizeProject(project), /0~100%/);
});
