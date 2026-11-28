const test = require('node:test');
const assert = require('node:assert/strict');
const model = require('../docs/sysml-model.js');

function scene() {
  const history = model.createHistory(model.createProject());
  history.apply(project => {
    const diagram = model.addModel(project, 'System');
    function box(x, y, width, height) {
      return Object.assign(model.addNode(diagram, 'element', null, { x, y }), { width, height });
    }
    box(30, 30, 500, 400);
    const parent = box(100, 100, 250, 180);
    box(145, 150, 80, 48);
    model.addNode(diagram, 'port', parent.id);
  });
  function move(index, x, y, target) {
    history.apply(project => {
      const diagram = project.models[0];
      model.moveNode(diagram, diagram.nodes[index].id, x, y, target);
    });
  }
  return { history, move, nodes: () => history.value.models[0].nodes };
}

test('port snaps flush outside each face of its owner inside another element', () => {
  const { history, move, nodes } = scene();
  const [outer, owner] = nodes();
  for (const [x, y, side, expectedX, expectedY] of [
    [80, 160, 'left', 76, 160], [180, 75, 'top', 180, 76],
    [355, 180, 'right', 350, 180], [180, 285, 'bottom', 180, 280]
  ]) {
    move(3, x, y, outer.id);
    const port = nodes()[3];
    assert.equal(port.parentId, owner.id);
    assert.deepEqual([port.dock.side, port.x, port.y], [side, expectedX, expectedY]);
  }
  assert.deepEqual(model.normalizeProject(JSON.parse(JSON.stringify(history.value))), history.value);
});

test('containment follows the smallest enclosing box on move, undo and redo', () => {
  const { history, move, nodes } = scene();
  const [outer, parent, child] = nodes();
  assert.equal(child.parentId, parent.id);
  move(2, 330, 180);
  assert.equal(nodes()[2].parentId, outer.id);
  move(2, 550, 200);
  assert.equal(nodes()[2].parentId, null);
  history.undo();
  assert.equal(nodes()[2].parentId, outer.id);
  history.redo();
  assert.equal(nodes()[2].parentId, null);
});

test('connectors and all node types can own items across a project round trip', () => {
  const project = model.createProject();
  const diagram = model.addModel(project, 'System');
  const element = model.addNode(diagram, 'element', null, { x: 100, y: 100 });
  const port = model.addNode(diagram, 'port', element.id);
  const failure = model.addNode(diagram, 'failure', port.id);
  const edge = model.connect(diagram, element.id, port.id, failure.id);
  const malfunction = model.addNode(diagram, 'malfunction', edge.id);
  const fn = model.addNode(diagram, 'function', malfunction.id);
  const child = model.addNode(diagram, 'element', fn.id, { x: 120, y: 120 });

  model.setParent(diagram, element.id, child.id);
  assert.equal(element.parentId, null);
  const restored = model.normalizeProject(JSON.parse(JSON.stringify(project))).models[0];
  assert.deepEqual(restored.nodes.map(node => node.parentId), [
    null, element.id, port.id, edge.id, malfunction.id, fn.id
  ]);
  assert.equal(restored.connectors[0].parentId, failure.id);

  model.removeItem(restored, port.id);
  assert.deepEqual(restored.nodes.map(node => node.id), [element.id]);
  assert.deepEqual(restored.connectors, []);
});

test('deleting a connector endpoint also removes items owned by the connector', () => {
  const project = model.createProject();
  const diagram = model.addModel(project, 'System');
  const source = model.addNode(diagram, 'element');
  const target = model.addNode(diagram, 'port');
  const edge = model.connect(diagram, source.id, target.id);
  model.addNode(diagram, 'failure', edge.id);

  model.removeItem(diagram, source.id);
  assert.deepEqual(diagram.nodes.map(node => node.id), [target.id]);
  assert.deepEqual(diagram.connectors, []);
});

test('directed dependencies coexist with connectors and retain their stereotypes', () => {
  const project = model.createProject();
  const diagram = model.addModel(project, 'System');
  const client = model.addNode(diagram, 'element');
  const supplier = model.addNode(diagram, 'element');
  const connector = model.connect(diagram, client.id, supplier.id);
  const use = model.connect(diagram, client.id, supplier.id, client.id, 'dependency');
  use.stereotype = 'use';
  const requireEdge = model.connect(diagram, supplier.id, client.id, null, 'dependency');
  requireEdge.stereotype = 'require';

  assert.equal(model.duplicateConnection(diagram, client.id, supplier.id, 'dependency'), true);
  assert.equal(model.duplicateConnection(diagram, supplier.id, client.id), true);
  const restored = model.normalizeProject(JSON.parse(JSON.stringify(project))).models[0];
  assert.deepEqual(restored.connectors, [connector, use, requireEdge]);
});
