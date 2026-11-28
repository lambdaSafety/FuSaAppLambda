const SysmlModel = (() => {
  const schemaVersion = 1;
  const limits = Object.freeze({
    minWidth: 72, maxWidth: 800, minHeight: 40, maxHeight: 600,
    maxCoordinate: 250000, maxNameLength: 120, maxTextLength: 4000
  });
  const types = Object.freeze({
    element: Object.freeze({ label: '엘리먼트', icon: '◼', width: 156, height: 86, fill: '#e6f2fa', stroke: '#2f688b' }),
    port: Object.freeze({ label: '포트', icon: '⊡', width: 24, height: 24, fill: '#e1f6f3', stroke: '#258172' }),
    function: Object.freeze({ label: '기능', icon: 'ƒ', width: 148, height: 76, fill: '#eee9fa', stroke: '#6d589c' }),
    failure: Object.freeze({ label: 'Failure Mode', icon: '⚠', width: 164, height: 76, fill: '#fce9e5', stroke: '#b74b49' }),
    malfunction: Object.freeze({ label: 'Malfunction', icon: 'ϟ', width: 164, height: 76, fill: '#fff1db', stroke: '#a65f22' })
  });
  const modelKinds = Object.freeze({ system: '시스템', hardware: '하드웨어', software: '소프트웨어', other: '기타' });
  const childrenByType = {
    root: ['element', 'port', 'function'],
    element: ['element', 'port', 'function', 'failure'],
    function: ['function', 'malfunction'],
    port: [], failure: [], malfunction: []
  };

  function newId() {
    if (globalThis.crypto.randomUUID) return globalThis.crypto.randomUUID();

    const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 15) | 64;
    bytes[8] = (bytes[8] & 63) | 128;
    const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
    return [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20)].join('-');
  }

  function assert(condition, message) {
    if (!condition) throw new Error(message);
  }

  function has(object, key) {
    return Object.prototype.hasOwnProperty.call(object, key);
  }

  function text(value, max, field) {
    assert(typeof value === 'string' && value.length <= max, `${field} 형식이 올바르지 않습니다.`);
    return value;
  }

  function name(value, field) {
    const result = text(typeof value === 'string' ? value.trim() : value, limits.maxNameLength, field);
    assert(result.length > 0, `${field}을(를) 입력해 주세요.`);
    return result;
  }

  function id(value) {
    assert(typeof value === 'string' && /^[\w-]{1,120}$/.test(value), '항목의 ID가 올바르지 않습니다.');
    return value;
  }

  function number(value, min, max) {
    assert(Number.isFinite(value), '캔버스의 위치나 크기를 숫자로 입력해 주세요.');
    return Math.min(max, Math.max(min, value));
  }

  function coordinate(value) {
    return number(value, 0, limits.maxCoordinate);
  }

  function color(value) {
    assert(typeof value === 'string' && /^#[\da-f]{6}$/i.test(value), '색상 값이 올바르지 않습니다.');
    return value;
  }

  function getModel(project, modelId = project.activeModelId) {
    return project.models.find(model => model.id === modelId);
  }

  function createProject(title = '새 프로젝트') {
    return {
      schemaVersion,
      id: newId(),
      title: name(title, '프로젝트 이름'),
      revision: 0,
      activeModelId: null,
      models: []
    };
  }

  function renameModel(model, modelName, kind = model.kind) {
    assert(typeof kind === 'string' && has(modelKinds, kind), '모델 종류가 올바르지 않습니다.');
    model.name = name(modelName, '모델 이름');
    model.kind = kind;
  }

  function addModel(project, modelName, kind = 'system') {
    const model = { id: newId(), viewCenter: null, nodes: [], connectors: [] };
    renameModel(model, modelName, kind);
    project.models.push(model);
    project.activeModelId = model.id;
    return model;
  }

  function removeModel(project, modelId) {
    project.models = project.models.filter(model => model.id !== modelId);
    if (project.activeModelId === modelId) project.activeModelId = project.models[0]?.id ?? null;
  }

  function allowedTypes(model, parentId = null) {
    const parentType = parentId === null ? 'root' : model.nodes.find(node => node.id === parentId)?.type;
    return [...(childrenByType[parentType] ?? [])];
  }

  function addNode(model, type, parentId = null, point = null) {
    assert(allowedTypes(model, parentId).includes(type), '선택한 위치에 이 항목을 추가할 수 없습니다.');
    const style = types[type];
    const node = {
      id: newId(), type, parentId,
      name: style.label, text: '',
      x: point ? coordinate(point.x) : null,
      y: point ? coordinate(point.y) : null,
      width: style.width, height: style.height, fill: style.fill, stroke: style.stroke
    };
    model.nodes.push(node);
    return node;
  }

  function portPosition(owner, port, side, offset) {
    const horizontal = side === 'top' || side === 'bottom';
    const along = horizontal ? owner.width - port.width : owner.height - port.height;
    if (horizontal) return {
      x: owner.x + offset * along,
      y: side === 'top' ? owner.y - port.height : owner.y + owner.height
    };
    return {
      x: side === 'left' ? owner.x - port.width : owner.x + owner.width,
      y: owner.y + offset * along
    };
  }

  function moveNode(model, nodeId, x, y, targetId = null) {
    const node = model.nodes.find(item => item.id === nodeId);
    if (!node) return;
    x = coordinate(x);
    y = coordinate(y);
    if (node.type === 'element' && node.x !== null) {
      const moving = new Set([node.id]);
      for (const parent of moving) {
        for (const child of model.nodes) {
          if (child.parentId !== parent) continue;
          moving.add(child.id);
          if (child.x !== null) {
            child.x = coordinate(child.x + x - node.x);
            child.y = coordinate(child.y + y - node.y);
          }
        }
      }
    }
    if (node.type === 'port') {
      const target = model.nodes.find(item => item.id === targetId && item.type === 'element');
      const currentOwner = model.nodes.find(item => item.id === node.parentId);
      const owner = currentOwner?.x != null ? currentOwner : target;
      if (owner?.type === 'element' && owner.x !== null) {
        node.parentId = owner.id;
        let best = Infinity;
        for (const side of ['right', 'left', 'top', 'bottom']) {
          const horizontal = side === 'top' || side === 'bottom';
          const offset = horizontal ? (x - owner.x) / (owner.width - node.width)
            : (y - owner.y) / (owner.height - node.height);
          const fraction = Math.min(1, Math.max(0, offset));
          const point = portPosition(owner, node, side, fraction);
          const distance = Math.hypot(point.x - x, point.y - y);
          if (point.x >= 0 && point.y >= 0 && distance < best) {
            best = distance;
            node.dock = { side, offset: fraction };
          }
        }
      }
    }
    Object.assign(node, { x, y });
  }

  function duplicateConnection(model, a, b) {
    if (![a, b].every(id => ['element', 'port'].includes(model.nodes.find(node => node.id === id)?.type))) return false;
    return model.connectors.some(edge =>
      (edge.sourceId === a && edge.targetId === b) || (edge.sourceId === b && edge.targetId === a));
  }

  function connect(model, sourceId, targetId) {
    const nodeIds = new Set(model.nodes.map(node => node.id));
    assert(nodeIds.has(sourceId) && nodeIds.has(targetId), '연결할 두 항목을 선택해 주세요.');
    assert(!duplicateConnection(model, sourceId, targetId), '두 항목 사이에 이미 커넥터가 있습니다.');
    const connector = { id: newId(), sourceId, targetId, route: 'straight', name: '', color: '#516b7b' };
    model.connectors.push(connector);
    return connector;
  }

  function removeItem(model, itemId) {
    const children = new Map();
    for (const node of model.nodes) {
      if (!children.has(node.parentId)) children.set(node.parentId, []);
      children.get(node.parentId).push(node.id);
    }
    const removed = new Set([itemId]);
    for (const item of removed) {
      for (const childId of children.get(item) ?? []) removed.add(childId);
    }
    model.nodes = model.nodes.filter(node => !removed.has(node.id));
    model.connectors = model.connectors.filter(connector =>
      !removed.has(connector.id) && !removed.has(connector.sourceId) && !removed.has(connector.targetId)
    );
  }

  function arrange(model) {
    const visible = new Set(model.nodes.filter(n => n.x !== null && n.type === 'element').map(n => n.id));
    const placed = model.nodes.filter(node => node.x !== null &&
      !(['element', 'port'].includes(node.type) && visible.has(node.parentId)));
    if (placed.length === 0) return;

    const neighbors = new Map(placed.map(node => [node.id, new Set()]));
    function addNeighbors(firstId, secondId) {
      if (!neighbors.has(firstId) || !neighbors.has(secondId)) return;
      neighbors.get(firstId).add(secondId);
      neighbors.get(secondId).add(firstId);
    }
    for (const node of placed) addNeighbors(node.id, node.parentId);
    for (const edge of model.connectors) addNeighbors(edge.sourceId, edge.targetId);

    const pending = new Set(placed.map(node => node.id));
    const orderedIds = [];
    // Keep related nodes close while leaving cycles and self-links intact.
    for (const firstId of pending) {
      const group = new Set([firstId]);
      pending.delete(firstId);
      for (const itemId of group) {
        for (const nextId of neighbors.get(itemId)) {
          if (pending.delete(nextId)) group.add(nextId);
        }
      }
      for (const itemId of group) orderedIds.push(itemId);
    }

    const nodesById = new Map(placed.map(node => [node.id, node]));
    const columns = Math.ceil(Math.sqrt(placed.length * 1.4));
    const rows = [];
    const columnWidths = new Array(columns).fill(0);
    orderedIds.forEach((nodeId, index) => {
      const node = nodesById.get(nodeId);
      const column = index % columns;
      const row = Math.floor(index / columns);
      columnWidths[column] = Math.max(columnWidths[column], node.width);
      (rows[row] ??= []).push(node);
    });

    let y = 44;
    for (const row of rows) {
      let x = 44;
      let rowHeight = 0;
      row.forEach((node, column) => {
        moveNode(model, node.id, x, y);
        x += columnWidths[column] + 48;
        rowHeight = Math.max(rowHeight, node.height);
      });
      y += rowHeight + 40;
    }
  }

  function normalizeNode(raw) {
    assert(raw && typeof raw.type === 'string' && has(types, raw.type), '지원하지 않는 항목 종류입니다.');
    assert((raw.x == null) === (raw.y == null), '캔버스 위치에는 좌표 두 개가 필요합니다.');
    const style = types[raw.type];
    const port = raw.type === 'port';
    const direction = raw.direction ?? 'inout';
    if (port) assert(['in', 'out', 'inout'].includes(direction), '포트 방향을 확인하세요.');
    return {
      id: id(raw.id),
      type: raw.type,
      ...(port ? { direction, dock: raw.dock ? {
        side: ['top', 'right', 'bottom', 'left'].includes(raw.dock.side) ? raw.dock.side : 'right',
        offset: number(raw.dock.offset, 0, 1)
      } : null } : {}),
      parentId: raw.parentId == null ? null : id(raw.parentId),
      name: name(raw.name, '항목 이름'),
      text: text(raw.text ?? '', limits.maxTextLength, '텍스트'),
      x: raw.x == null ? null : coordinate(raw.x),
      y: raw.y == null ? null : coordinate(raw.y),
      width: port ? style.width : number(raw.width ?? style.width, limits.minWidth, limits.maxWidth),
      height: port ? style.height : number(raw.height ?? style.height, limits.minHeight, limits.maxHeight),
      fill: color(raw.fill ?? style.fill),
      stroke: color(raw.stroke ?? style.stroke)
    };
  }

  function validateOwnership(nodes) {
    const checked = new Set();
    for (const node of nodes.values()) {
      const parent = nodes.get(node.parentId);
      const parentType = node.parentId === null ? 'root' : parent?.type;
      assert(childrenByType[parentType]?.includes(node.type), '항목의 상위 요소가 없거나 종류가 올바르지 않습니다.');

      const trail = new Set();
      let current = node;
      while (current && !checked.has(current.id)) {
        assert(!trail.has(current.id), '모델 트리에 순환하는 상위 항목이 있습니다.');
        trail.add(current.id);
        current = nodes.get(current.parentId);
      }
      for (const itemId of trail) checked.add(itemId);
    }
  }

  function normalizeModel(raw) {
    assert(raw && Array.isArray(raw.nodes) && Array.isArray(raw.connectors), '모델의 항목 목록이 올바르지 않습니다.');
    const model = {
      id: id(raw.id),
      viewCenter: raw.viewCenter == null ? null : { x: coordinate(raw.viewCenter.x), y: coordinate(raw.viewCenter.y) },
      nodes: raw.nodes.map(normalizeNode),
      connectors: []
    };
    renameModel(model, raw.name, raw.kind ?? 'system');
    const nodeMap = new Map(model.nodes.map(node => [node.id, node]));
    assert(nodeMap.size === model.nodes.length, '같은 항목 ID가 모델에 중복되어 있습니다.');
    validateOwnership(nodeMap);
    const boxes = model.nodes.filter(node => node.type === 'element' && node.x !== null)
      .sort((a, b) => a.width * a.height - b.width * b.height);
    for (const box of boxes) {
      const container = boxes.find(other => other.width * other.height > box.width * box.height &&
        other.x <= box.x && other.y <= box.y &&
        box.x + box.width <= other.x + other.width && box.y + box.height <= other.y + other.height);
      if (container) box.parentId = container.id;
      else if (nodeMap.get(box.parentId)?.x != null) box.parentId = null;
    }
    validateOwnership(nodeMap);
    const ports = new Map();
    for (const node of model.nodes) {
      const owner = nodeMap.get(node.parentId);
      if (node.type !== 'port' || owner?.type !== 'element' || owner.x === null) continue;
      if (!ports.has(owner)) ports.set(owner, []);
      ports.get(owner).push(node);
    }
    for (const [owner, group] of ports) {
      group.forEach((port, index) => {
        const dock = port.dock ?? { side: 'right', offset: (index + 1) / (group.length + 1) };
        let point = portPosition(owner, port, dock.side, dock.offset);
        if (point.x < 0 || point.y < 0) {
          dock.side = point.x < 0 ? 'right' : 'bottom';
          point = portPosition(owner, port, dock.side, dock.offset);
        }
        Object.assign(port, point);
      });
    }

    const occupied = new Set(nodeMap.keys());
    model.connectors = raw.connectors.map(connector => {
      assert(connector && nodeMap.has(connector.sourceId) && nodeMap.has(connector.targetId), '커넥터의 연결 대상이 없습니다.');
      const connectorId = id(connector.id);
      assert(!occupied.has(connectorId), '같은 항목 ID가 모델에 중복되어 있습니다.');
      occupied.add(connectorId);
      return {
        id: connectorId,
        route: connector.route === 'orthogonal' ? 'orthogonal' : 'straight',
        sourceId: connector.sourceId,
        targetId: connector.targetId,
        name: text(connector.name ?? '', limits.maxNameLength, '커넥터 이름').trim(),
        color: color(connector.color ?? '#516b7b')
      };
    });
    return model;
  }

  function normalizeProject(raw) {
    assert(raw && raw.schemaVersion === schemaVersion, '지원하지 않는 프로젝트 파일 버전입니다.');
    assert(Array.isArray(raw.models), '프로젝트에 모델 목록이 없습니다.');
    assert(typeof raw.id === 'string' && /^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i.test(raw.id), '프로젝트 ID가 올바르지 않습니다.');
    const revision = raw.revision ?? 0;
    assert(Number.isSafeInteger(revision) && revision >= 0, '프로젝트 저장 버전이 올바르지 않습니다.');
    const models = raw.models.map(normalizeModel);
    const ids = new Set(models.map(model => model.id));
    assert(ids.size === models.length, '같은 모델 ID가 프로젝트에 중복되어 있습니다.');
    return {
      schemaVersion,
      id: raw.id,
      title: name(raw.title, '프로젝트 이름'),
      revision,
      activeModelId: ids.has(raw.activeModelId) ? raw.activeModelId : models[0]?.id ?? null,
      diagrams: (raw.diagrams ?? []).map(diagram => ({
        id: id(diagram.id), name: name(diagram.name, 'FTA 이름'),
        connectors: (diagram.connectors ?? []).map(edge => {
          const endpoints = [edge.sourceId, edge.targetId];
          assert(edge.sourceId !== edge.targetId && endpoints.every(key => diagram.nodes.some(n => n.id === key)), 'FTA 연결점을 확인하세요.');
          return { sourceId: id(edge.sourceId), targetId: id(edge.targetId) };
        }),
        nodes: diagram.nodes.map(node => {
          assert(['event', 'or', 'and', 'voting', 'transfer'].includes(node.type), 'FTA 기호를 확인하세요.');
          const edges = diagram.connectors ?? [];
          const hasParent = edges.some(edge => edge.sourceId === node.id);
          const hasChildren = edges.some(edge => edge.targetId === node.id);
          const role = hasParent ? (hasChildren ? 'intermediate' : 'basic') : 'top';
          const probability = node.probability ?? null;
          const failureRate = node.failureRate ?? null;
          if (node.type === 'event') {
            assert(probability === null || (Number.isFinite(probability) && probability >= 0 && probability <= 1), '확률은 0~1 범위로 입력하세요.');
            assert(failureRate === null || (Number.isFinite(failureRate) && failureRate >= 0), '고장률은 0 이상으로 입력하세요.');
          }
          return { id: id(node.id), type: node.type, ...(node.type === 'event' ? { role, probability, failureRate } : {}),
            fill: color(node.fill ?? '#ffffff'), stroke: color(node.stroke ?? '#184867'), name: name(node.name, '기호 이름'),
            x: coordinate(node.x), y: coordinate(node.y),
            source: node.source ? { modelId: id(node.source.modelId), nodeId: id(node.source.nodeId) } : null };
        })
      })),
      models
    };
  }

  function arrangeFaultTree(tree) {
    const pending = new Map(tree.nodes.map(node => [node.id, 0]));
    const children = new Map(tree.nodes.map(node => [node.id, []]));
    for (const { sourceId: child, targetId: parent } of tree.connectors) {
      pending.set(child, pending.get(child) + 1);
      children.get(parent).push(child);
    }
    const queue = tree.nodes.filter(node => !pending.get(node.id)).map(node => node.id);
    const depth = new Map(queue.map(id => [id, 0]));
    for (let index = 0; index < queue.length; index++) {
      const parent = queue[index];
      for (const child of children.get(parent)) {
        depth.set(child, Math.max(depth.get(child) ?? 0, depth.get(parent) + 1));
        pending.set(child, pending.get(child) - 1);
        if (!pending.get(child)) queue.push(child);
      }
    }
    assert(queue.length === tree.nodes.length, '순환 연결이 있어 자동 정렬할 수 없습니다.');
    const rows = new Map();
    for (const node of tree.nodes) {
      const level = depth.get(node.id);
      if (!rows.has(level)) rows.set(level, []);
      rows.get(level).push(node);
    }
    const widest = Math.max(0, ...Array.from(rows.values(), row => row.length));
    for (const [level, row] of rows) {
      row.forEach((node, column) => {
        node.x = 24 + ((widest - row.length) / 2 + column) * 168;
        node.y = 20 + level * 154;
      });
    }
  }

  function createHistory(project) {
    let value = normalizeProject(project);
    const past = [];
    const future = [];

    function restore(from, into) {
      if (!from.length) return false;
      const previous = from.pop();
      into.push(value);
      const viewCenters = new Map(value.models.map(model => [model.id, model.viewCenter]));
      value = {
        ...previous,
        revision: value.revision,
        activeModelId: getModel(previous, value.activeModelId) ? value.activeModelId : previous.activeModelId,
        models: previous.models.map(model => viewCenters.has(model.id) ? { ...model, viewCenter: viewCenters.get(model.id) } : model)
      };
      return true;
    }

    return {
      get value() { return value; },
      get canUndo() { return past.length > 0; },
      get canRedo() { return future.length > 0; },
      apply(edit) {
        const draft = structuredClone(value);
        const result = edit(draft);
        const next = normalizeProject(draft);
        if (JSON.stringify(next) === JSON.stringify(value)) return result;
        past.push(value);
        if (past.length > 50) past.shift();
        future.length = 0;
        value = next;
        return result;
      },
      undo() { return restore(past, future); },
      redo() { return restore(future, past); }
    };
  }

  return Object.freeze({
    schemaVersion, limits, types, modelKinds, newId, createProject, normalizeProject,
    getModel, addModel, renameModel, removeModel, allowedTypes, addNode, moveNode,
    connect, duplicateConnection, removeItem, arrange, arrangeFaultTree, createHistory
  });
})();

if (typeof module !== 'undefined' && module.exports) module.exports = SysmlModel;
