const test = require('node:test');
const assert = require('node:assert/strict');
const ReqModel = require('../docs/req-model.js');
const SysmlModel = require('../docs/sysml-model.js');

test('project history keeps a single requirements repository and independent diagram layouts', () => {
  const legacy = SysmlModel.createProject();
  delete legacy.requirements;
  const history = SysmlModel.createHistory(legacy);
  assert.deepEqual(history.value.requirements, ReqModel.blank());
  let goalId;
  history.apply(project => {
    const data = project.requirements;
    const system = ReqModel.addModel(data, 'System 요구사항');
    const hardware = ReqModel.addModel(data, 'HW 요구사항');
    const goal = ReqModel.addEntity(data, system.id, 'goal');
    goalId = goal.id;
    Object.assign(goal, { domain: 'safety', attributes: { ASIL: 'D' } });
    const requirement = ReqModel.addEntity(data, hardware.id, 'requirement');
    Object.assign(requirement, { domain: 'sotif', attributes: { 'Triggering Condition': 'Low visibility' } });
    const child = ReqModel.addEntity(data, hardware.id, 'requirement');
    const gsn = ReqModel.addEntity(data, hardware.id, 'gsnGoal');
    ReqModel.place(system.diagrams[0], requirement.id, { x: 5, y: 10 });
    ReqModel.place(hardware.diagrams[0], requirement.id, { x: 250, y: 150 });
    ReqModel.link(data, goal.id, requirement.id, 'DECOMPOSES');
    ReqModel.link(data, requirement.id, child.id, 'DECOMPOSES');
    ReqModel.link(data, gsn.id, child.id, 'REFERENCES');
  });

  history.apply(project => ReqModel.update(project.requirements, goalId, { description: 'Changed' }));
  const copy = SysmlModel.normalizeProject(JSON.parse(JSON.stringify(history.value))).requirements;
  assert.equal(copy.entities.find(entity => entity.id === goalId).version, 2);
  assert.equal(copy.models[0].diagrams[0].layout[0].x, 5);
  assert.equal(copy.models[1].diagrams[0].layout[0].x, 250);
  assert.equal(copy.entities.filter(entity => entity.id === copy.models[0].diagrams[0].layout[0].entityId).length, 1);
  assert.ok(copy.links.every(link => link.suspect));
  history.undo();
  assert.ok(history.value.requirements.links.every(link => !link.suspect));
});

test('requirements validation audits coverage and rejects invalid or cyclic GSN relations', () => {
  const data = ReqModel.blank();
  const model = ReqModel.addModel(data, 'System');
  const goal = ReqModel.addEntity(data, model.id, 'goal');
  const requirement = ReqModel.addEntity(data, model.id, 'requirement');
  const gsn = ReqModel.addEntity(data, model.id, 'gsnGoal');
  const strategy = ReqModel.addEntity(data, model.id, 'strategy');
  const context = ReqModel.addEntity(data, model.id, 'context');
  assert.deepEqual(new Set(ReqModel.validate(data, model.id).map(issue => issue.id)), new Set([goal.id, requirement.id, gsn.id, strategy.id]));
  ReqModel.link(data, gsn.id, context.id, 'SUPPORTED_BY');
  assert.throws(() => ReqModel.normalize(data), /연결 유형/);
  data.links.length = 0;
  ReqModel.link(data, gsn.id, strategy.id, 'SUPPORTED_BY');
  ReqModel.link(data, strategy.id, gsn.id, 'SUPPORTED_BY');
  assert.throws(() => ReqModel.normalize(data), /순환/);
});

