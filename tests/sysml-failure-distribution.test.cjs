const test = require('node:test');
const assert = require('node:assert/strict');
const sysml = require('../docs/sysml-model.js');

test('element and port allocate their own FIT to direct failure modes across save and history', () => {
  const project = sysml.createProject();
  const model = sysml.addModel(project, 'System');
  const element = sysml.addNode(model, 'element');
  const port = sysml.addNode(model, 'port', element.id);
  const halt = sysml.addNode(model, 'failure', element.id);
  const drift = sysml.addNode(model, 'failure', element.id);
  const open = sysml.addNode(model, 'failure', port.id);
  sysml.addNode(model, 'malfunction', element.id);
  delete element.predictedFit;
  delete halt.failurePercent;

  const history = sysml.createHistory(project);
  const current = () => sysml.getModel(history.value);
  const fits = () => current().nodes.slice(2, 5).map(mode => sysml.failureModeFit(current(), mode));
  assert.deepEqual(fits(), [null, null, null]);
  assert.deepEqual(sysml.ownedFailureModes(current(), element).map(node => node.id), [halt.id, drift.id]);
  assert.deepEqual(sysml.ownedFailureModes(current(), port).map(node => node.id), [open.id]);

  history.apply(draft => {
    const [owner, socket, first, second, third] = sysml.getModel(draft).nodes;
    owner.predictedFit = 125;
    socket.predictedFit = 10;
    first.failurePercent = 20.5;
    second.failurePercent = 79.5;
    third.failurePercent = 0;
  });
  assert.deepEqual(fits(), [25.625, 99.375, 0]);
  assert.deepEqual(sysml.normalizeProject(JSON.parse(JSON.stringify(history.value))), history.value);

  history.apply(draft => sysml.setParent(sysml.getModel(draft), halt.id, port.id));
  assert.deepEqual(fits(), [null, 99.375, 0]);
  history.undo();
  assert.deepEqual(fits(), [25.625, 99.375, 0]);
  history.redo();
  assert.deepEqual(fits(), [null, 99.375, 0]);
  assert.throws(() => history.apply(draft => { sysml.getModel(draft).nodes[2].failurePercent = 101; }), /0~100%/);
  assert.throws(() => history.apply(draft => { sysml.getModel(draft).nodes[0].predictedFit = -1; }), /0 FIT/);
});
