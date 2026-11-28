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
