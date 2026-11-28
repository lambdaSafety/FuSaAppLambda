const requirementModel = typeof module !== 'undefined' && module.exports ? require('./req-model.js') : ReqModel;

const markovProjectModel = typeof module !== 'undefined' && module.exports ? require('./markov-model.js') : MarkovModel;

const SysmlModel = (() => {
  const schemaVersion = 1;
  const faultTreeMissionTime = 1000;
  const faultTreeProbabilityModels = Object.freeze({
    fixed: 'Fixed probability',
    derived: 'Time independent derived probability',
    exponential: 'Exponential distribution'
  });
  const faultTreeExponentialModes = Object.freeze({
    'non-repair': 'Non-repair', repair: 'Repair', monitoring: 'Monitoring'
  });
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
      title: projectTitle(title),
      revision: 0,
      activeModelId: null,
      models: [],
      requirements: requirementModel.blank(),
      workspaceData: {}
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
    return parentId === null || [...model.nodes, ...model.connectors].some(item => item.id === parentId)
      ? Object.keys(types) : [];
  }

  function parentOptions(model, itemId) {
    const items = [...model.nodes, ...model.connectors];
    const excluded = new Set([itemId]);
    for (const parentId of excluded) {
      for (const item of items) if (item.parentId === parentId) excluded.add(item.id);
    }
    return items.filter(item => !excluded.has(item.id));
  }

  function setParent(model, itemId, parentId) {
    const item = [...model.nodes, ...model.connectors].find(entry => entry.id === itemId);
    if (!item || (parentId !== null && !parentOptions(model, itemId).some(parent => parent.id === parentId))) return;
    if (item.parentId !== parentId && item.type === 'port') item.dock = null;
    if (item.parentId !== parentId && item.type === 'failure') item.failurePercent = null;
    item.parentId = parentId;
    if (item.type === 'element') item.manualParent = true;
  }

  function ownsFailureDistribution(node) {
    return node?.type === 'element' || node?.type === 'port';
  }

  function ownedFailureModes(model, owner) {
    return model.nodes.filter(node => node.type === 'failure' && node.parentId === owner.id);
  }

  function failureModeFit(model, mode) {
    if (mode.type !== 'failure' || mode.failurePercent == null) return null;
    const owner = model.nodes.find(node => node.id === mode.parentId);
    if (!ownsFailureDistribution(owner) || owner.predictedFit == null) return null;
    return owner.predictedFit * (mode.failurePercent / 100);
  }

  function optionalFailureValue(value, max, message) {
    if (value == null) return null;
    assert(Number.isFinite(value) && value >= 0 && value <= max, message);
    return value;
  }

  function addNode(model, type, parentId = null, point = null) {
    assert(allowedTypes(model, parentId).includes(type), '선택한 위치에 이 항목을 추가할 수 없습니다.');
    const style = types[type];
    const node = {
      id: newId(), type, parentId,
      ...(type === 'element' && parentId !== null ? { manualParent: true } : {}),
      name: style.label, text: '',
      ...(type === 'element' || type === 'port' ? { predictedFit: null } : {}),
      ...(type === 'failure' ? { failurePercent: null } : {}),
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
      const owner = node.parentId !== null ? currentOwner
        : target && parentOptions(model, nodeId).includes(target) ? target : null;
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

  function duplicateConnection(model, a, b, relation = 'connector') {
    if (relation === 'dependency') {
      return model.connectors.some(edge => edge.relation === relation && edge.sourceId === a && edge.targetId === b);
    }
    if (![a, b].every(id => ['element', 'port'].includes(model.nodes.find(node => node.id === id)?.type))) return false;
    return model.connectors.some(edge => edge.relation !== 'dependency' &&
      ((edge.sourceId === a && edge.targetId === b) || (edge.sourceId === b && edge.targetId === a)));
  }

  function connect(model, sourceId, targetId, parentId = null, relation = 'connector') {
    const nodeIds = new Set(model.nodes.map(node => node.id));
    assert(nodeIds.has(sourceId) && nodeIds.has(targetId), '연결할 두 항목을 선택해 주세요.');
    assert(!duplicateConnection(model, sourceId, targetId, relation), '두 항목 사이에 이미 커넥터가 있습니다.');
    assert(allowedTypes(model, parentId).length, '커넥터의 상위 항목을 확인하세요.');
    const connector = { id: newId(), sourceId, targetId, parentId, route: 'straight', name: '', color: '#516b7b' };
    if (relation === 'dependency') Object.assign(connector, { relation, stereotype: '' });
    model.connectors.push(connector);
    return connector;
  }

  function removeItem(model, itemId) {
    const children = new Map();
    function dependOn(id, item) {
      if (!children.has(id)) children.set(id, []);
      children.get(id).push(item.id);
    }
    for (const item of [...model.nodes, ...model.connectors]) dependOn(item.parentId, item);
    for (const edge of model.connectors) {
      dependOn(edge.sourceId, edge);
      dependOn(edge.targetId, edge);
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
      ...(ownsFailureDistribution(raw) ? {
        predictedFit: optionalFailureValue(raw.predictedFit, Infinity, '예측 고장률은 0 FIT 이상으로 입력하세요.')
      } : {}),
      ...(raw.type === 'failure' ? {
        failurePercent: optionalFailureValue(raw.failurePercent, 100, '고장 비율은 0~100% 범위로 입력하세요.')
      } : {}),
      ...(port ? { direction, dock: raw.dock ? {
        side: ['top', 'right', 'bottom', 'left'].includes(raw.dock.side) ? raw.dock.side : 'right',
        offset: number(raw.dock.offset, 0, 1)
      } : null } : {}),
      ...(raw.type === 'element' && raw.manualParent === true ? { manualParent: true } : {}),
      parentId: raw.parentId == null ? null : id(raw.parentId),
      name: name(requirementModel.isPlaceholderName(raw.name) ? types[raw.type].label : raw.name, '항목 이름'),
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
      assert(node.parentId === null || nodes.has(node.parentId), '상위 항목을 찾을 수 없습니다.');

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

  function normalizeModel(raw, index) {
    assert(raw && Array.isArray(raw.nodes) && Array.isArray(raw.connectors), '모델의 항목 목록이 올바르지 않습니다.');
    const model = {
      id: id(raw.id),
      viewCenter: raw.viewCenter == null ? null : { x: coordinate(raw.viewCenter.x), y: coordinate(raw.viewCenter.y) },
      nodes: raw.nodes.map(normalizeNode),
      connectors: []
    };
    const kind = raw.kind ?? 'system';
    const modelName = requirementModel.isPlaceholderName(raw.name) ? `${modelKinds[kind]} 모델 ${index + 1}` : raw.name;
    renameModel(model, modelName, kind);
    const nodeMap = new Map(model.nodes.map(node => [node.id, node]));
    assert(nodeMap.size === model.nodes.length, '같은 항목 ID가 모델에 중복되어 있습니다.');
    const occupied = new Set(nodeMap.keys());
    model.connectors = raw.connectors.map(connector => {
      assert(connector && nodeMap.has(connector.sourceId) && nodeMap.has(connector.targetId), '커넥터의 연결 대상이 없습니다.');
      const connectorId = id(connector.id);
      assert(!occupied.has(connectorId), '같은 항목 ID가 모델에 중복되어 있습니다.');
      occupied.add(connectorId);
      return {
        id: connectorId,
        ...(connector.relation === 'dependency' ? {
          relation: 'dependency',
          stereotype: ['require', 'use'].includes(connector.stereotype) ? connector.stereotype : ''
        } : {}),
        parentId: connector.parentId == null ? null : id(connector.parentId),
        route: connector.route === 'orthogonal' ? 'orthogonal' : 'straight',
        sourceId: connector.sourceId,
        targetId: connector.targetId,
        name: text(connector.name ?? '', limits.maxNameLength, '커넥터 이름').trim(),
        color: color(connector.color ?? '#516b7b')
      };
    });
    const items = new Map([...nodeMap, ...model.connectors.map(edge => [edge.id, edge])]);
    validateOwnership(items);
    const boxes = model.nodes.filter(node => node.type === 'element' && node.x !== null)
      .sort((a, b) => a.width * a.height - b.width * b.height);
    for (const box of boxes) {
      const currentParent = items.get(box.parentId);
      if (box.manualParent || (currentParent && currentParent.type !== 'element')) continue;
      const container = boxes.find(other => other.width * other.height > box.width * box.height &&
        other.x <= box.x && other.y <= box.y &&
        box.x + box.width <= other.x + other.width && box.y + box.height <= other.y + other.height);
      if (container) {
        let ancestor = container;
        while (ancestor && ancestor.id !== box.id) ancestor = items.get(ancestor.parentId);
        if (!ancestor) box.parentId = container.id;
      }
      else if (nodeMap.get(box.parentId)?.x != null) box.parentId = null;
    }
    validateOwnership(items);
    const ports = new Map();
    for (const node of model.nodes) {
      const owner = nodeMap.get(node.parentId);
      if (node.type === 'failure' && !ownsFailureDistribution(owner)) node.failurePercent = null;
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

    return model;
  }

  function normalizeWorkspaceData(raw) {
    raw ??= {};
    const data = {};
    if (Array.isArray(raw.fmea) && raw.fmea.every(row => row && typeof row === 'object' && !Array.isArray(row))) {
      data.fmea = structuredClone(raw.fmea);
    }
    if (raw.mission && Array.isArray(raw.mission.profiles) && raw.mission.profiles.length &&
        raw.mission.profiles.every(profile => profile && Array.isArray(profile.phases) && Array.isArray(profile.cycles)) &&
        Number.isInteger(raw.mission.selected) && raw.mission.selected >= 0 && raw.mission.selected < raw.mission.profiles.length) {
      data.mission = structuredClone(raw.mission);
    }
    if (raw.markov !== undefined) data.markov = markovProjectModel.normalize(raw.markov);
    if (['FIT', '고장 / 10⁶ h', '고장 / h'].includes(raw.rateUnit)) data.rateUnit = raw.rateUnit;
    return data;
  }

  function projectTitle(value) {
    return name(requirementModel.isPlaceholderName(value) ? '안전 분석 프로젝트' : value, '프로젝트 이름');
  }

  function contentStamp(project) {
    const { title, activeModelId, models, diagrams, requirements, workspaceData } = project;
    // PostgreSQL jsonb can return object keys in a different order. Array order still matters.
    return JSON.stringify([title, activeModelId, models, diagrams, requirements, workspaceData], (key, value) => {
      if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
      return Object.fromEntries(Object.keys(value).sort().map(field => [field, value[field]]));
    });
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
      title: projectTitle(raw.title),
      revision,
      activeModelId: ids.has(raw.activeModelId) ? raw.activeModelId : models[0]?.id ?? null,
      requirements: requirementModel.normalize(raw.requirements),
      workspaceData: normalizeWorkspaceData(raw.workspaceData),
      diagrams: (raw.diagrams ?? []).map((diagram, index) => ({
        id: id(diagram.id), name: name(requirementModel.isPlaceholderName(diagram.name) ? `FTA ${index + 1}` : diagram.name, 'FTA 이름'),
        missionTime: faultTreeMissionTime,
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
          const threshold = node.threshold ?? 1;
          if (node.type === 'voting') assert(Number.isSafeInteger(threshold) && threshold >= 1, 'VOTING 기준은 1 이상의 정수로 입력하세요.');
          const nodeName = requirementModel.isPlaceholderName(node.name)
            ? (node.type === 'event' ? { top: '최상위 이벤트', intermediate: '중간 이벤트', basic: '기본 이벤트' }[role] : `${node.type.toUpperCase()} 게이트`)
            : node.name;
          return { id: id(node.id), type: node.type, ...(node.type === 'event' ? { role, ...normalizeFaultTreeEvent(node) } : {}),
            ...(node.type === 'voting' ? { threshold } : {}),
            fill: color(node.fill ?? '#ffffff'), stroke: color(node.stroke ?? '#184867'), name: name(nodeName, '기호 이름'),
            x: coordinate(node.x), y: coordinate(node.y),
            source: node.source ? { modelId: id(node.source.modelId), nodeId: id(node.source.nodeId) } : null };
        })
      })),
      models
    };
  }

  function normalizeFaultTreeEvent(node) {
    const probabilityModel = node.probabilityModel ?? 'exponential';
    const exponentialMode = node.exponentialMode ?? 'non-repair';
    assert(has(faultTreeProbabilityModels, probabilityModel), 'FTA 확률 모델을 확인하세요.');
    assert(has(faultTreeExponentialModes, exponentialMode), 'FTA 지수분포 모드를 확인하세요.');
    const values = {
      probability: node.probability ?? 0,
      derivedPercent: node.derivedPercent ?? 0,
      failureRate: node.failureRate === null && node.source ? null : node.failureRate ?? 0.00001,
      repairRate: node.repairRate ?? 0.1,
      inspectionInterval: node.inspectionInterval ?? 340
    };
    for (const [key, max, label] of [
      ['probability', 1, '확률은 0~1 범위로 입력하세요.'],
      ['derivedPercent', 100, 'Safety mechanism 확률은 0~100% 범위로 입력하세요.'],
      ['failureRate', Infinity, '고장률은 0 이상으로 입력하세요.'],
      ['repairRate', Infinity, '수리율은 0 이상으로 입력하세요.'],
      ['inspectionInterval', Infinity, '검사 주기는 0 이상으로 입력하세요.']
    ]) {
      const value = values[key];
      if (key === 'failureRate' && value === null) continue;
      assert(Number.isFinite(value) && value >= 0 && value <= max, label);
    }
    return { probabilityModel, exponentialMode, ...values };
  }

  function addFaultTreeSource(tree, model, original, x, y, targetId) {
    if (original.type !== 'element' && original.type !== 'failure') return;
    const target = tree.nodes.find(node => node.id === targetId);
    if (target && !['or', 'and', 'voting'].includes(target.type)) return;

    function append(type, name, x, y, parent, attributes = {}) {
      while (tree.nodes.some(node => Math.abs(node.x - x) < 128 && Math.abs(node.y - y) < 128)) x += 168;
      const node = { id: newId(), type, name, x, y, ...attributes };
      tree.nodes.push(node);
      if (parent) tree.connectors.push({ sourceId: node.id, targetId: parent.id });
      return node;
    }

    function appendEvent(item, x, y, parent) {
      const fit = item.type === 'failure' ? failureModeFit(model, item) : item.predictedFit;
      return append('event', item.name, x, y, parent, {
        source: { modelId: model.id, nodeId: item.id },
        failureRate: fit == null ? null : fit * 1e-9
      });
    }

    const event = appendEvent(original, target?.x ?? x, target ? target.y + 154 : y, target);
    if (original.type === 'element') {
      const modes = ownedFailureModes(model, original);
      if (modes.length) {
        const gate = append('or', 'OR 게이트', event.x, event.y + 154, event);
        modes.forEach((mode, index) => appendEvent(mode, gate.x + index * 168, gate.y + 154, gate));
      }
    }
    return event;
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
    schemaVersion, limits, types, modelKinds, faultTreeMissionTime, faultTreeProbabilityModels, faultTreeExponentialModes,
    newId, createProject, normalizeProject, projectTitle, contentStamp,
    getModel, addModel, renameModel, removeModel, allowedTypes, addNode, moveNode, parentOptions, setParent,
    ownsFailureDistribution, ownedFailureModes, failureModeFit,
    connect, duplicateConnection, removeItem, arrange, arrangeFaultTree, addFaultTreeSource, createHistory
  });
})();

if (typeof module !== 'undefined' && module.exports) module.exports = SysmlModel;
