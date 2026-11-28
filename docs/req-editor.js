function createReqWorkspace({ project, edit, requestModel, renameModel, removeModel, navigate }) {
  const { kinds, domains, statuses, linkTypes } = ReqModel;
  const linkLabels = {
    TRACE: 'TRACE · 추적성',
    CONTRIBUTES_TO: 'CONTRIBUTES_TO · Contribution',
    DECOMPOSES: 'DECOMPOSES · Subrequirement'
  };
  const linkOptions = types => types.map(type => [type, linkLabels[type] ?? type]);
  const el = sysmlElement;
  const button = sysmlButton;
  const navigation = el('div', 'sysml-navigation');
  const addModelLink = button('Req 모델 추가', requestModel, { icon: 'plus', className: 'sysml-new-model' });
  const modelLinks = el('div', 'sysml-model-links');
  navigation.append(addModelLink, modelLinks);
  const element = el('div', 'sysml-workspace req-workspace');
  const body = el('div', 'req-content');
  const notice = el('p', 'sysml-prompt');
  notice.setAttribute('role', 'status');
  element.append(notice, body);

  let projectId = null;
  let modelId = null;
  let activeDiagramId = null;
  let selectedId = null;
  let view = 'diagram';
  let linking = false;
  let sourceId = null;
  let relation = 'TRACE';
  const openModels = new Map();
  let navStamp = '';
  let lastData;
  let lastSwitching;
  const pendingForms = [];
  const canvas = createSysmlCanvas({
    nodeTypes: Object.fromEntries(Object.entries(kinds).map(([kind, label]) => [kind, { label }])),
    emptyMessage: '팔레트에서 항목을 추가하거나 기존 항목을 배치하세요.',
    dragKinds: ['req-tree', 'req-palette'],
    kindIcon: () => document.createDocumentFragment(),
    onSelect(item) {
      if (item?.kind === 'node') select(item.id);
      else if (item?.kind === 'edge') showLink(item.id);
      else select(null);
    },
    onConnect: (source, target) => commitLink(source, target, relation),
    onLinkCancelled: () => { linking = false; sourceId = null; paint(); },
    onCanvasMenu(event, id, point, edgeId) {
      if (edgeId) showLink(edgeId);
      else if (id) select(id);
    },
    onDrop(item, point) {
      if (item.kind === 'req-palette' && allowedKinds().includes(item.type)) create(item.type, point);
      if (item.kind === 'req-tree' && item.projectId === projectId) place(item.id, point);
    },
    onMove(id, point) { updateBox(id, point); },
    onResize(id, size) { updateBox(id, size); }
  });
  canvas.element.classList.add('req-canvas');

  function data() { return project()?.requirements; }
  function model() { return data()?.models.find(item => item.id === modelId); }
  function diagram() { return model()?.diagrams.find(item => item.id === activeDiagramId) ?? model()?.diagrams[0]; }
  function entity(id) { return data()?.entities.find(item => item.id === id); }
  function modelEntities() { return data().entities.filter(item => item.modelId === modelId); }
  function allowedKinds() { return diagram()?.type === 'gsn' ? ReqModel.gsnKinds : ['goal', 'requirement', 'verification']; }
  function kindLabel(item) {
    const domainGoals = { safety: 'Safety Goal', sotif: 'SOTIF Goal', cyber: 'Cybersecurity Goal' };
    return item.kind === 'goal' ? domainGoals[item.domain] ?? kinds.goal : kinds[item.kind];
  }
  function setNotice(text) {
    notice.textContent = text;
    notice.hidden = !text;
  }

  function registerForm(form, applyChanges) {
    const snapshot = () => JSON.stringify([...form.elements].map(field =>
      field.type === 'checkbox' ? field.checked : field.value));
    const original = snapshot();
    pendingForms.push({ changed: () => snapshot() !== original, form, applyChanges });
  }

  function hasPending() {
    return pendingForms.some(entry => entry.changed());
  }

  function flushPending() {
    const changes = pendingForms.filter(entry => entry.changed());
    if (!changes.length) return true;
    if (changes.some(({ form }) => !form.reportValidity())) return false;
    const applied = edit(draft => {
      for (const { applyChanges } of changes) applyChanges(draft.requirements);
      return true;
    }) === true;
    if (applied && hasPending()) draw();
    return applied;
  }

  function activate(id) {
    if (!flushPending()) return;
    if (modelId !== id) {
      modelId = id;
      activeDiagramId = null;
      selectedId = null;
      linking = false;
      sourceId = null;
      view = 'diagram';
    }
    openModels.set(id, true);
    navigate('requirements');
    draw();
  }

  function change(update) {
    if (!flushPending()) return undefined;
    return edit(draft => {
      const target = draft.requirements.models.find(item => item.id === modelId);
      return update(draft.requirements, target, target?.diagrams.find(item => item.id === diagram()?.id));
    });
  }

  function create(kind, point) {
    const created = change((store, target, layout) => {
      const item = ReqModel.addEntity(store, target.id, kind);
      ReqModel.place(layout, item.id, point, item.kind);
      return item;
    });
    if (created) {
      select(created.id);
      canvas.centerOn(created.id);
    }
  }

  function place(id, point) {
    const item = entity(id);
    if (!item || !allowedKinds().includes(item.kind)) return;
    change((store, target, layout) => ReqModel.place(layout, id, point, item.kind));
    canvas.centerOn(id);
  }

  function updateBox(id, properties) {
    change((store, target, layout) => Object.assign(layout.layout.find(box => box.entityId === id), properties));
  }

  function commitLink(source, target, type) {
    if (change(store => { ReqModel.link(store, source, target, type); return true; })) {
      linking = false;
      sourceId = null;
      select(source);
      return true;
    }
    return false;
  }

  function select(id) {
    if (!flushPending()) return;
    if (linking && id) {
      if (sourceId) return commitLink(sourceId, id, relation);
      sourceId = id;
      paint();
      return;
    }
    selectedId = id;
    draw();
  }

  function selectTree(id) {
    if (!flushPending()) return;
    if (linking) return select(id);
    const item = entity(id);
    if (!item) return;
    if (item.modelId !== modelId) activate(item.modelId);
    if (!allowedKinds().includes(item.kind)) {
      activeDiagramId = model().diagrams.find(layout => (layout.type === 'gsn') === ReqModel.isGsn(item)).id;
    }
    view = 'diagram';
    select(id);
    canvas.centerOn(id);
  }

  function addOption(select, value, label) { select.add(new Option(label, value)); }
  function selectControl(values, value, label) {
    const control = el('select');
    for (const [key, text] of values) addOption(control, key, text);
    control.value = value ?? '';
    control.setAttribute('aria-label', label);
    return control;
  }
  function field(form, label, input) {
    const wrapper = el('label', 'sysml-field', label);
    wrapper.append(input);
    form.append(wrapper);
    return input;
  }
  function textControl(value, multiline = false) {
    const input = el(multiline ? 'textarea' : 'input');
    input.value = value ?? '';
    return input;
  }

  function renderNav() {
    const store = data();
    const stamp = JSON.stringify([store, modelId, selectedId, [...openModels]]);
    if (stamp === navStamp) return;
    navStamp = stamp;
    modelLinks.replaceChildren();
    if (!store) return;
    for (const current of store.models) {
      const items = store.entities.filter(item => item.modelId === current.id);
      const ids = new Set(items.map(item => item.id));
      const parent = new Map();
      const children = new Map();
      for (const edge of store.links) {
        if (!ReqModel.hierarchy(edge.type) || !ids.has(edge.sourceId) || !ids.has(edge.targetId) || parent.has(edge.targetId)) continue;
        parent.set(edge.targetId, edge.sourceId);
        if (!children.has(edge.sourceId)) children.set(edge.sourceId, []);
        children.get(edge.sourceId).push(edge.targetId);
      }
      const branch = el('div', 'sysml-nav-branch');
      const tree = el('div', 'sysml-tree');
      const header = el('div', 'sysml-nav-model');
      const modelButton = button(current.title, () => activate(current.id), { icon: 'model' });
      if (modelId === current.id) modelButton.setAttribute('aria-current', 'true');
      const editModelName = event => {
        event.preventDefault();
        renameModel(current);
      };
      modelButton.addEventListener('contextmenu', editModelName);
      modelButton.addEventListener('keydown', event => {
        if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) editModelName(event);
      });
      const toggle = button(current.title, () => {
        openModels.set(current.id, tree.hidden);
        sync();
      }, { iconOnly: true, className: 'sysml-tree-toggle' });
      function sync() {
        tree.hidden = !openModels.get(current.id);
        toggle.textContent = tree.hidden ? '▸' : '▾';
        toggle.setAttribute('aria-expanded', String(!tree.hidden));
      }
      sync();
      header.append(toggle, modelButton);
      const itemIndex = new Map(items.map(item => [item.id, item]));
      const stack = items.filter(item => !parent.has(item.id)).reverse().map(item => [item.id, 0]);
      while (stack.length) {
        const [id, depth] = stack.pop();
        const item = itemIndex.get(id);
        const row = el('div', 'sysml-tree-row');
        row.style.setProperty('--tree-depth', Math.min(depth, 8));
        const itemButton = button(item.title, () => { if (modelId !== current.id) activate(current.id); selectTree(id); },
          { className: 'sysml-tree-item' });
        itemButton.title = kindLabel(item) + ' · ' + item.title;
        itemButton.setAttribute('aria-pressed', String(id === selectedId));
        itemButton.draggable = true;
        itemButton.addEventListener('dragstart', event => setSysmlDragData(event, { kind: 'req-tree', id, projectId }));
        const nested = children.get(id) ?? [];
        row.append(el('span'), itemButton);
        tree.append(row);
        for (let i = nested.length - 1; i >= 0; i--) stack.push([nested[i], depth + 1]);
      }
      branch.append(header, tree);
      modelLinks.append(branch);
    }
  }

  function paint() {
    const layout = diagram();
    if (!layout) return;
    const ids = new Set(layout.layout.map(box => box.entityId));
    const colors = {
      goal: '#e6f2fa', requirement: '#e1f6f3', verification: '#e1f6f3',
      gsnGoal: '#e6f2fa', strategy: '#eee9fa', solution: '#e1f6f3',
      context: '#f0f4f8', assumption: '#fff1db', justification: '#fff1db'
    };
    const nodes = layout.layout.map(box => {
      const item = entity(box.entityId);
      const references = data().links.filter(edge => edge.type === 'REFERENCES' && edge.sourceId === item.id);
      const statements = references.map(edge => {
        const target = entity(edge.targetId);
        return [target.title, target.description].filter(Boolean).join(' · ');
      });
      const badge = item.kind === 'assumption' ? 'A · ' : item.kind === 'justification' ? 'J · ' : '';
      return { ...box, id: item.id, type: item.kind, fill: colors[item.kind], stroke: '#39647a',
        name: badge + item.title, text: [item.description, ...statements].filter(Boolean).join('\n'),
        undeveloped: item.undeveloped };
    });
    const connectors = data().links.filter(edge => ids.has(edge.sourceId) && ids.has(edge.targetId)).map(edge => ({
      ...edge, relation: 'dependency', route: 'straight',
      solid: ['SUPPORTED_BY', 'IN_CONTEXT_OF'].includes(edge.type),
      arrowhead: edge.type === 'SUPPORTED_BY' ? 'filled' : edge.type === 'IN_CONTEXT_OF' ? 'hollow' : null,
      color: edge.suspect ? '#b52626' : '#426276', name: edge.type + (edge.suspect ? ' · Suspect' : '')
    }));
    canvas.render({ model: { id: layout.id, nodes, connectors }, selection: { kind: 'node', id: selectedId }, connectFrom: sourceId, linking });
    if (linking) setNotice(sourceId ? '링크의 대상 항목을 선택하세요.' : '링크의 시작 항목을 선택하세요.');
  }

  function showLink(id) {
    const edge = data().links.find(item => item.id === id);
    if (edge) select(edge.sourceId);
  }

  function linkForm(item, controls) {
    const form = el('form', 'req-form');
    const type = field(form, '연결 유형', selectControl(linkOptions(linkTypes), '', '연결 유형'));
    const target = field(form, '대상 항목', selectControl([], '', '대상 항목'));
    const submit = el('button', 'sysml-primary', '링크 추가');
    submit.type = 'submit';
    function options() {
      target.replaceChildren();
      for (const other of data().entities) {
        if (ReqModel.canLink(type.value, item, other)) {
          const owner = data().models.find(model => model.id === other.modelId);
          addOption(target, other.id, owner.title + ' / ' + other.title);
        }
      }
      submit.disabled = !target.options.length;
    }
    type.value = ReqModel.isGsn(item) ? (item.kind === 'solution' ? 'REFERENCES' : 'SUPPORTED_BY') : 'DECOMPOSES';
    type.addEventListener('change', options);
    form.addEventListener('submit', event => { event.preventDefault(); if (target.value) commitLink(item.id, target.value, type.value); });
    form.append(submit);
    options();
    controls.append(form);
    const relations = el('ul', 'req-links');
    for (const edge of data().links.filter(edge => edge.sourceId === item.id || edge.targetId === item.id)) {
      const outgoing = edge.sourceId === item.id;
      const other = entity(outgoing ? edge.targetId : edge.sourceId);
      const row = el('li', '', (outgoing ? '→ ' : '← ') + edge.type + (edge.suspect ? ' · Suspect Link' : ''));
      row.append(button(other.title, () => selectTree(other.id)));
      if (edge.suspect) row.append(button('검토 완료', () => change(store => { store.links.find(link => link.id === edge.id).suspect = false; })));
      row.append(button('링크 삭제', () => change(store => { store.links = store.links.filter(link => link.id !== edge.id); })));
      relations.append(row);
    }
    controls.append(relations);
  }

  function renderInspector() {
    const item = entity(selectedId);
    const inspector = el('aside', 'req-inspector');
    if (!item) {
      inspector.append(el('p', 'sysml-prompt', '항목을 선택해 속성과 연결을 편집하세요.'));
      return inspector;
    }
    inspector.append(el('h3', '', kindLabel(item)));
    const form = el('form', 'req-form');
    const id = field(form, 'ID', textControl(item.id));
    id.readOnly = true;
    const version = field(form, 'Version', textControl(item.version));
    version.readOnly = true;
    const title = field(form, 'Title', textControl(item.title));
    title.required = true;
    title.maxLength = 120;
    const description = field(form, 'Description', textControl(item.description, true));
    const status = field(form, 'Status', selectControl(statuses.map(value => [value, value]), item.status, 'Status'));
    const domain = field(form, '도메인', selectControl(Object.entries(domains), item.domain, '도메인'));
    const extensionFields = el('div', 'req-form');
    const custom = field(form, '확장 속성 (JSON)', textControl(JSON.stringify(item.attributes, null, 2), true));
    let domainValues = new Map();
    function refreshDomain() {
      extensionFields.replaceChildren();
      domainValues = new Map(ReqModel.domainFields[domain.value].map(key => [
        key, field(extensionFields, key, textControl(item.attributes[key]))
      ]));
    }
    domain.addEventListener('change', refreshDomain);
    refreshDomain();
    custom.parentElement.before(extensionFields);
    const undeveloped = el('input');
    undeveloped.type = 'checkbox';
    undeveloped.checked = item.undeveloped;
    if (['gsnGoal', 'strategy'].includes(item.kind)) field(form, 'Undeveloped', undeveloped);
    const save = el('button', 'sysml-primary', '속성 적용');
    save.type = 'submit';
    form.append(save);
    registerForm(form, store => {
      const attributes = JSON.parse(custom.value);
      if (!attributes || Array.isArray(attributes) || typeof attributes !== 'object') throw new Error('확장 속성은 JSON 객체로 입력하세요.');
      for (const [key, input] of domainValues) {
        if (input.value !== (item.attributes[key] ?? '')) attributes[key] = input.value;
      }
      ReqModel.update(store, item.id, {
        title: title.value.trim(), description: description.value, status: status.value,
        domain: domain.value, attributes, undeveloped: undeveloped.checked
      });
    });
    form.addEventListener('submit', event => { event.preventDefault(); flushPending(); });
    inspector.append(form);
    if (allowedKinds().includes(item.kind)) {
      const placed = diagram().layout.some(box => box.entityId === item.id);
      inspector.append(placed ? button('이 다이어그램에서 숨기기', () => change((store, target, layout) => {
        layout.layout = layout.layout.filter(box => box.entityId !== item.id);
      })) : button('이 다이어그램에 배치', () => place(item.id)));
    }
    linkForm(item, inspector);
    inspector.append(button('모델에서 항목 삭제', () => {
      if (!window.confirm(`‘${item.title}’ 항목과 연결을 삭제할까요?`)) return;
      change(store => ReqModel.remove(store, new Set([item.id])));
    }, { className: 'sysml-delete' }));
    return inspector;
  }

  function renderTable() {
    const form = el('form', 'req-table-wrap');
    const table = el('table', 'req-table');
    const header = table.createTHead().insertRow();
    for (const label of ['종류', 'Title', 'Description', 'Status', '도메인', 'Version']) header.append(el('th', '', label));
    const tbody = table.createTBody();
    const rows = modelEntities().map(item => {
      const row = tbody.insertRow();
      row.insertCell().append(button(kindLabel(item), () => selectTree(item.id)));
      const title = textControl(item.title);
      title.required = true;
      title.maxLength = 120;
      const description = textControl(item.description, true);
      const status = selectControl(statuses.map(value => [value, value]), item.status, 'Status');
      const domain = selectControl(Object.entries(domains), item.domain, '도메인');
      for (const [control, label] of [[title, 'Title'], [description, 'Description'], [status, 'Status'], [domain, '도메인']]) {
        control.setAttribute('aria-label', item.title + ' · ' + label);
        row.insertCell().append(control);
      }
      row.insertCell().textContent = item.version;
      return { item, title, description, status, domain };
    });
    const apply = el('button', 'sysml-primary', '테이블 변경 적용');
    apply.type = 'submit';
    apply.disabled = !rows.length;
    form.append(table, apply);
    registerForm(form, store => {
      for (const row of rows) ReqModel.update(store, row.item.id, {
        title: row.title.value.trim(), description: row.description.value, status: row.status.value, domain: row.domain.value
      });
    });
    form.addEventListener('submit', event => { event.preventDefault(); flushPending(); });
    return form;
  }

  function renderReport() {
    const report = el('ul', 'req-links');
    const issues = ReqModel.validate(data(), modelId);
    for (const issue of issues) {
      const row = el('li', '', issue.message);
      row.append(button(entity(issue.id).title, () => selectTree(issue.id)));
      report.append(row);
    }
    return issues.length ? report : el('p', '', '검증에서 발견된 문제가 없습니다.');
  }

  function importControls() {
    const file = el('input');
    file.type = 'file';
    file.accept = '.reqif,.xml';
    file.hidden = true;
    file.addEventListener('change', async () => {
      const selected = file.files[0];
      if (!selected) return;
      const origin = projectId;
      try {
        const xml = await selected.text();
        if (origin !== project()?.id) return;
        const imported = edit(draft => ReqIf.importModel(draft.requirements, xml, selected.name.replace(/\.[^.]+$/, '')));
        if (imported) activate(imported.id);
      } catch (error) { setNotice(error.message); }
    });
    return [button('ReqIF 가져오기', () => file.click()), file];
  }

  function draw() {
    pendingForms.length = 0;
    renderNav();
    body.replaceChildren();
    setNotice('');
    if (!model()) {
      body.append(el('p', 'sysml-prompt', project() ? 'Req 모델을 추가하거나 선택하세요.' : '프로젝트를 먼저 열거나 만드세요.'));
      if (project()) body.append(...importControls());
      return;
    }
    if (selectedId && !entity(selectedId)) selectedId = null;
    const toolbar = el('div', 'sysml-actions req-toolbar');
    toolbar.append(el('h2', '', model().title), button('이름 편집', () => renameModel(model())));
    for (const [key, label] of [['diagram', '다이어그램'], ['table', '테이블'], ['report', '검증 보고서']]) {
      const control = button(label, () => { if (flushPending()) { view = key; linking = false; sourceId = null; draw(); } });
      control.setAttribute('aria-pressed', String(view === key));
      toolbar.append(control);
    }
    const download = button('ReqIF 내보내기', () => {
      const url = URL.createObjectURL(new Blob([ReqIf.exportModel(data(), model())], { type: 'application/xml' }));
      const anchor = el('a');
      anchor.href = url;
      anchor.download = model().title + '.reqif';
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    });
    const deleteButton = button('모델 삭제', () => removeModel(model().id), { className: 'sysml-delete' });
    download.disabled = modelEntities().length === 0;
    toolbar.append(download, ...importControls(), deleteButton);
    body.append(toolbar);
    if (view !== 'diagram') {
      body.append(view === 'table' ? renderTable() : renderReport());
      return;
    }

    const diagrams = el('div', 'sysml-actions');
    const choice = selectControl(model().diagrams.map(layout => [layout.id, layout.title]), diagram().id, '다이어그램');
    choice.addEventListener('change', () => {
      if (!flushPending()) { choice.value = diagram().id; return; }
      activeDiagramId = choice.value;
      linking = false;
      sourceId = null;
      draw();
    });
    function addDiagram(type, label) {
      if (!flushPending()) return;
      const name = window.prompt('다이어그램 이름', label);
      if (!name?.trim()) return;
      const added = change((store, target) => ReqModel.addDiagram(target, name, type));
      if (added) { activeDiagramId = added.id; draw(); }
    }
    diagrams.append(choice, button('추적성 다이어그램 추가', () => addDiagram('trace', '추적성')),
      button('GSN 다이어그램 추가', () => addDiagram('gsn', 'GSN')));
    const palette = el('div', 'sysml-actions req-palette');
    palette.append(el('strong', '', '팔레트'));
    for (const kind of allowedKinds()) {
      const control = button(kinds[kind], () => create(kind));
      control.draggable = true;
      control.addEventListener('dragstart', event => setSysmlDragData(event, { kind: 'req-palette', type: kind }));
      palette.append(control);
    }
    const types = diagram().type === 'gsn' ? ['SUPPORTED_BY', 'IN_CONTEXT_OF'] : linkTypes.filter(type => !['SUPPORTED_BY', 'IN_CONTEXT_OF', 'REFERENCES'].includes(type));
    const type = selectControl(linkOptions(types), types.includes(relation) ? relation : types[0], '커넥터 유형');
    type.addEventListener('change', () => { if (linking) relation = type.value; });
    const link = button('커넥터', () => {
      linking = !linking;
      link.setAttribute('aria-pressed', String(linking));
      relation = type.value;
      sourceId = null;
      setNotice('');
      paint();
    }, { icon: 'connector' });
    link.setAttribute('aria-pressed', String(linking));
    palette.append(type, link);
    const grid = el('div', 'req-editor-grid');
    grid.append(canvas.element, renderInspector());
    body.append(diagrams, palette, grid);
    paint();
  }

  return { element, navigation, activate, hasPending, flushPending, render(current, switching, active) {
    addModelLink.disabled = switching;
    if (current?.id !== projectId) {
      projectId = current?.id;
      modelId = null;
      selectedId = null;
      activeDiagramId = null;
      view = 'diagram';
      linking = false;
      sourceId = null;
      openModels.clear();
      pendingForms.length = 0;
      navStamp = '';
    }
    if (!model()) {
      modelId = current?.requirements?.models[0]?.id ?? null;
      activeDiagramId = null;
      selectedId = null;
      linking = false;
      sourceId = null;
    }
    if (modelId && !openModels.has(modelId)) openModels.set(modelId, true);
    if (active && (lastData !== data() || switching !== lastSwitching)) draw();
    else renderNav();
    lastData = active ? data() : undefined;
    lastSwitching = switching;
    if (active && switching) body.inert = true;
    else body.inert = false;
  } };
}

