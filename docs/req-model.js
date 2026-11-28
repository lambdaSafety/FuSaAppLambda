const ReqModel = (() => {
  const kinds = {
    goal: 'Goal', requirement: '요구사항', verification: '검증 결과',
    gsnGoal: 'Goal', strategy: 'Strategy', solution: 'Solution', context: 'Context',
    assumption: 'Assumption', justification: 'Justification'
  };
  const domains = {
    general: '일반', safety: 'ISO 26262 · Safety', sotif: 'ISO 21448 · SOTIF', cyber: 'ISO/SAE 21434 · Cybersecurity'
  };
  const domainFields = { general: [], safety: ['ASIL'], sotif: ['Triggering Condition'], cyber: ['CAL'] };
  const gsnKinds = ['gsnGoal', 'strategy', 'solution', 'context', 'assumption', 'justification'];
  const linkTypes = ['TRACE', 'CONTRIBUTES_TO', 'DECOMPOSES', 'MITIGATES', 'SATISFIED_BY', 'SUPPORTED_BY', 'IN_CONTEXT_OF', 'REFERENCES'];
  const statuses = ['Draft', 'In Review', 'Approved', 'Retired'];
  const blank = () => ({ models: [], entities: [], links: [] });
  const newId = () => globalThis.crypto.randomUUID?.() ?? Array.from(globalThis.crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, '0')).join('');
  const isGsn = entity => gsnKinds.includes(entity.kind);

  function assert(condition, message) {
    if (!condition) throw new Error(message);
  }

  function title(value) {
    assert(typeof value === 'string' && value.trim() && value.trim().length <= 120, '이름은 1~120자로 입력하세요.');
    return value.trim();
  }

  function identifier(value) {
    assert(typeof value === 'string' && /^[a-zA-Z0-9_.-]{1,128}$/.test(value), '요구사항 모델 ID가 올바르지 않습니다.');
    return value;
  }

  function index(items) {
    const result = new Map(items.map(item => [item.id, item]));
    assert(result.size === items.length, '요구사항 모델에 중복 ID가 있습니다.');
    return result;
  }

  function canLink(type, source, target) {
    if (!source || !target || source.id === target.id || !linkTypes.includes(type)) return false;
    if (type === 'SUPPORTED_BY') {
      return (source.kind === 'gsnGoal' && ['gsnGoal', 'strategy', 'solution'].includes(target.kind)) ||
        (source.kind === 'strategy' && target.kind === 'gsnGoal');
    }
    if (type === 'IN_CONTEXT_OF') {
      return ['gsnGoal', 'strategy'].includes(source.kind) && ['context', 'assumption', 'justification'].includes(target.kind);
    }
    if (type === 'REFERENCES') {
      return (source.kind === 'gsnGoal' && ['goal', 'requirement'].includes(target.kind)) ||
        (source.kind === 'solution' && ['goal', 'requirement', 'verification'].includes(target.kind));
    }
    if (isGsn(source) || isGsn(target)) return false;
    return type !== 'DECOMPOSES' || [source.kind, target.kind].every(kind => ['goal', 'requirement'].includes(kind));
  }

  function hierarchy(type) {
    return type === 'DECOMPOSES' || type === 'SUPPORTED_BY';
  }

  function validateHierarchy(entities, links) {
    const counts = new Map(entities.map(entity => [entity.id, 0]));
    const children = new Map();
    for (const link of links.filter(link => hierarchy(link.type))) {
      counts.set(link.targetId, counts.get(link.targetId) + 1);
      if (!children.has(link.sourceId)) children.set(link.sourceId, []);
      children.get(link.sourceId).push(link.targetId);
    }
    const queue = [...counts.keys()].filter(id => counts.get(id) === 0);
    for (let i = 0; i < queue.length; i++) {
      for (const child of children.get(queue[i]) ?? []) {
        counts.set(child, counts.get(child) - 1);
        if (!counts.get(child)) queue.push(child);
      }
    }
    assert(queue.length === entities.length, '분해 또는 GSN 지원 링크가 순환합니다.');
  }

  function normalize(raw = blank()) {
    const legacyPlaceholder = 'ㅇㄴㅇㄹㄴㅇㄹ';
    const models = raw.models.map((model, index) => ({
      id: identifier(model.id),
      title: title(model.title?.trim() === legacyPlaceholder ? `요구사항 모델 ${index + 1}` : model.title),
      diagrams: model.diagrams.map(diagram => ({
        id: identifier(diagram.id), title: title(diagram.title), type: diagram.type === 'gsn' ? 'gsn' : 'trace',
        layout: diagram.layout.map(box => {
          const fields = ['x', 'y', 'width', 'height'];
          assert(fields.every(field => Number.isFinite(box[field])), '다이어그램 좌표나 크기가 올바르지 않습니다.');
          return { entityId: identifier(box.entityId),
            x: Math.max(0, Math.min(250000, box.x)), y: Math.max(0, Math.min(250000, box.y)),
            width: Math.max(56, Math.min(2000, box.width)), height: Math.max(36, Math.min(2000, box.height)) };
        })
      }))
    }));
    const modelIndex = index(models);
    index(models.flatMap(model => model.diagrams));
    const entities = raw.entities.map(entity => {
      assert(modelIndex.has(entity.modelId) && Object.hasOwn(kinds, entity.kind), '요구사항 항목의 모델 또는 종류를 확인하세요.');
      const attributes = Object.entries(entity.attributes ?? {});
      assert(attributes.every(([key, value]) => key.trim() && typeof value === 'string'), '확장 속성은 이름과 텍스트 값으로 입력하세요.');
      return {
        id: identifier(entity.id), modelId: entity.modelId, kind: entity.kind, title: title(entity.title),
        description: String(entity.description ?? ''), status: statuses.includes(entity.status) ? entity.status : 'Draft',
        version: Number.isSafeInteger(entity.version) && entity.version > 0 ? entity.version : 1,
        domain: Object.hasOwn(domains, entity.domain) ? entity.domain : 'general',
        attributes: Object.fromEntries(attributes), undeveloped: ['gsnGoal', 'strategy'].includes(entity.kind) && Boolean(entity.undeveloped)
      };
    });
    const entityIndex = index(entities);
    for (const diagram of models.flatMap(model => model.diagrams)) {
      const layoutIds = new Set();
      for (const box of diagram.layout) {
        const entity = entityIndex.get(box.entityId);
        assert(entity && (diagram.type === 'gsn') === isGsn(entity) && !layoutIds.has(entity.id), '다이어그램의 항목 참조가 올바르지 않습니다.');
        layoutIds.add(entity.id);
      }
    }
    const signatures = new Set();
    const links = raw.links.map(link => {
      assert(canLink(link.type, entityIndex.get(link.sourceId), entityIndex.get(link.targetId)), '연결 유형과 시작·대상 항목을 확인하세요.');
      const signature = JSON.stringify([link.sourceId, link.type, link.targetId]);
      assert(!signatures.has(signature), '같은 유형의 연결이 이미 있습니다.');
      signatures.add(signature);
      return { id: identifier(link.id), type: link.type, sourceId: link.sourceId, targetId: link.targetId, suspect: Boolean(link.suspect) };
    });
    index(links);
    validateHierarchy(entities, links);
    return { models, entities, links };
  }

  function addDiagram(model, name, type) {
    const diagram = { id: newId(), title: title(name), type, layout: [] };
    model.diagrams.push(diagram);
    return diagram;
  }

  function addModel(data, name) {
    const model = { id: newId(), title: title(name), diagrams: [] };
    addDiagram(model, '추적성', 'trace');
    addDiagram(model, 'GSN', 'gsn');
    data.models.push(model);
    return model;
  }

  function addEntity(data, modelId, kind, name = kinds[kind]) {
    const entity = { id: newId(), modelId, kind, title: title(name), description: '', status: 'Draft',
      version: 1, domain: 'general', attributes: {}, undeveloped: false };
    data.entities.push(entity);
    return entity;
  }

  function place(diagram, entityId, point = {}, kind = null) {
    if (diagram.layout.some(box => box.entityId === entityId)) return;
    const i = diagram.layout.length;
    diagram.layout.push({ entityId, x: point.x ?? 32 + (i % 3) * 242,
      y: point.y ?? 32 + Math.floor(i / 3) * 130, width: kind === 'solution' ? 112 : 206, height: kind === 'solution' ? 112 : 94 });
  }

  function link(data, sourceId, targetId, type) {
    data.links.push({ id: newId(), sourceId, targetId, type, suspect: false });
  }

  function update(data, id, changes) {
    const entity = data.entities.find(item => item.id === id);
    if (!entity || Object.entries(changes).every(([key, value]) => JSON.stringify(entity[key]) === JSON.stringify(value))) return;
    Object.assign(entity, changes);
    entity.version += 1;
    const affected = new Set([id]);
    for (const current of affected) {
      for (const edge of data.links) {
        if ((edge.sourceId === current && hierarchy(edge.type)) ||
            (edge.targetId === current && edge.type === 'REFERENCES')) {
          edge.suspect = true;
          affected.add(edge.sourceId === current ? edge.targetId : edge.sourceId);
        }
        if (edge.sourceId === id || edge.targetId === id) edge.suspect = true;
      }
    }
  }

  function remove(data, ids) {
    data.entities = data.entities.filter(entity => !ids.has(entity.id));
    data.links = data.links.filter(edge => !ids.has(edge.sourceId) && !ids.has(edge.targetId));
    for (const diagram of data.models.flatMap(model => model.diagrams)) {
      diagram.layout = diagram.layout.filter(box => !ids.has(box.entityId));
    }
  }

  function validate(data, modelId) {
    const issues = [];
    const outgoingLinks = new Map();
    const incomingLinks = new Map();
    for (const link of data.links) {
      if (!outgoingLinks.has(link.sourceId)) outgoingLinks.set(link.sourceId, []);
      if (!incomingLinks.has(link.targetId)) incomingLinks.set(link.targetId, []);
      outgoingLinks.get(link.sourceId).push(link);
      incomingLinks.get(link.targetId).push(link);
    }
    const coveredByRequirements = new Set(data.entities.filter(item => item.kind === 'requirement').map(item => item.id));
    for (const id of coveredByRequirements) {
      for (const link of incomingLinks.get(id) ?? []) {
        if (link.type === 'DECOMPOSES') coveredByRequirements.add(link.sourceId);
      }
    }
    for (const entity of data.entities.filter(item => item.modelId === modelId)) {
      const outgoing = outgoingLinks.get(entity.id) ?? [];
      const incoming = incomingLinks.get(entity.id) ?? [];
      const report = message => issues.push({ id: entity.id, message });
      if (entity.kind === 'goal' && !coveredByRequirements.has(entity.id)) report('하위 요구사항 미분해');
      if (entity.kind === 'requirement' && !incoming.some(edge => edge.type === 'DECOMPOSES') &&
          !outgoing.some(edge => ['MITIGATES', 'CONTRIBUTES_TO'].includes(edge.type))) report('상위 근거 없음 (Orphan)');
      if (entity.undeveloped || (['gsnGoal', 'strategy'].includes(entity.kind) && !outgoing.some(edge => edge.type === 'SUPPORTED_BY')) ||
          (entity.kind === 'solution' && !outgoing.some(edge => edge.type === 'REFERENCES'))) report('GSN 미해결');
      if ([...outgoing, ...incoming].some(edge => edge.suspect)) report('Suspect Link 검토 필요');
    }
    return issues;
  }

  return { kinds, domains, domainFields, gsnKinds, linkTypes, statuses, blank, normalize, canLink, hierarchy, isGsn,
    addModel, addDiagram, addEntity, place, link, update, remove, validate };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = ReqModel;

