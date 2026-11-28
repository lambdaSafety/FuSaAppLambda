function sysmlElement(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text) element.textContent = text;
  return element;
}

function sysmlButton(label, action, { icon, className, iconOnly } = {}) {
  const button = sysmlElement('button', className);
  button.type = 'button';
  if (icon) button.append(createSysmlIcon(icon));
  if (iconOnly) {
    button.title = label;
    button.setAttribute('aria-label', label);
  } else {
    button.append(document.createTextNode(label));
  }
  button.addEventListener('click', action);
  return button;
}

function createSysmlEditor({ edit, renameModel, removeModel, refreshSelection }) {
  const { types, modelKinds, limits } = SysmlModel;
  const element = sysmlElement('section', 'sysml-editor');
  const toolbar = sysmlElement('div', 'sysml-editor-toolbar');
  const heading = sysmlElement('h2');
  const modelKind = sysmlElement('span', 'sysml-model-kind');
  const headingGroup = sysmlElement('div', 'sysml-editor-heading');
  headingGroup.append(createSysmlIcon('model'), heading, modelKind);
  const tools = sysmlElement('div', 'sysml-actions');
  const linkButton = sysmlButton('연결', () => linking ? stopLink() : startLink(), { icon: 'connector' });
  const arrangeButton = sysmlButton('Auto Arrange', () => {
    edit(SysmlModel.arrange);
    canvas.setCenter(null);
  }, { icon: 'arrange' });
  arrangeButton.title = '캔버스에 배치된 항목 자동 정렬';
  tools.append(linkButton, arrangeButton, sysmlButton('모델 편집', renameModel));
  toolbar.append(headingGroup, tools);

  const panes = sysmlElement('div', 'sysml-panes');
  const workArea = sysmlElement('div', 'sysml-work-area');
  const workHeader = sysmlElement('div', 'sysml-pane-heading');
  const canvasHeading = sysmlElement('h3', '', '다이어그램');
  const canvasStatus = sysmlElement('p', 'sysml-canvas-status');
  canvasStatus.setAttribute('role', 'status');
  workHeader.append(canvasHeading, canvasStatus);

  const sidebar = sysmlElement('aside', 'sysml-properties');
  const palette = sysmlElement('div', 'sysml-palette');
  const paletteHeader = sysmlElement('div', 'sysml-pane-heading');
  paletteHeader.append(sysmlElement('h3', '', '팔레트'));
  const paletteItems = sysmlElement('div', 'sysml-palette-items');
  const propertyHeader = sysmlElement('div', 'sysml-pane-heading');
  propertyHeader.append(sysmlElement('h3', '', '속성'));
  const properties = sysmlElement('div', 'sysml-property-fields');
  palette.append(paletteHeader, paletteItems);
  sidebar.append(palette, propertyHeader, properties);

  const menu = sysmlElement('div', 'sysml-context-menu');
  menu.hidden = true;
  menu.setAttribute('role', 'menu');
  menu.setAttribute('aria-label', '모델 항목 메뉴');

  let model = null;
  let selection = null;
  let linking = false;
  let connectFrom = null;
  let message = '';
  let restoreFocus = null;
  let inspectorKey = '';

  const fields = new Map();

  const canvas = createSysmlCanvas({
    kindIcon: createSysmlIcon,
    onDrop: drop,
    onSelect: (item) => {
      if (linking && !connectFrom && item?.kind === 'node') startLink(item.id);
      else select(item);
    },
    onMove: (id, { x, y }, targetId) => {
      selection = { kind: 'node', id };
      edit((draft) => SysmlModel.moveNode(draft, id, x, y, targetId));
    },
    onResize: (id, size) => {
      selection = { kind: 'node', id };
      edit(draft => Object.assign(draft.nodes.find(node => node.id === id), size));
    },
    onConnect: connect,
    onLinkCancelled: () => stopLink(),
    onCanvasMenu: (event, parentId, point) => showMenu(event, parentId, point)
  });
  workArea.append(workHeader, canvas.element);
  panes.append(workArea, sidebar);
  element.append(toolbar, panes, menu);

  function setMessage(text) {
    message = text;
    paintCanvas();
  }

  function paintCanvas() {
    if (!model) return;
    const from = model.nodes.find((node) => node.id === connectFrom);
    const count = model.nodes.filter((node) => node.x !== null).length;
    canvasStatus.textContent = message || (linking
      ? (from ? `${from.name} → 연결할 항목을 선택하세요.` : '시작 항목을 선택하세요.')
      : `${count}개 배치 · 연결 ${model.connectors.length}개`);
    linkButton.setAttribute('aria-pressed', String(linking));
    arrangeButton.disabled = !count;
    canvas.render({ model, selection, connectFrom, linking });
  }

  function newPoint(size, nodes = model.nodes) {
    const center = canvas.getCenter();
    const x = Math.max(0, Math.min(limits.maxCoordinate, center.x - size.width / 2));
    let y = Math.max(0, center.y - size.height / 2);
    const sameColumn = nodes.filter((node) => node.x !== null && node.x - 16 < x + size.width && x < node.x + node.width + 16)
      .sort((first, second) => first.y - second.y);
    for (const node of sameColumn) {
      if (y + size.height + 16 <= node.y) break;
      y = Math.max(y, node.y + node.height + 16);
    }
    return { x: Math.round(x), y: Math.round(Math.min(y, limits.maxCoordinate)) };
  }

  function createNode(type, requestedParent, point, useRootFallback = false) {
    let parentId = requestedParent;
    if (useRootFallback && !SysmlModel.allowedTypes(model, parentId).includes(type)) parentId = null;
    if (!SysmlModel.allowedTypes(model, parentId).includes(type)) {
      const owner = type === 'failure' ? types.element.label : types.function.label;
      setMessage(`${types[type].label}을 추가할 ${owner} 항목을 선택하거나 그 위에 놓으세요.`);
      return;
    }
    const node = edit((draft) => SysmlModel.addNode(draft, type, parentId, point));
    if (node) {

      select({ kind: 'node', id: node.id });
      if (point) canvas.centerOn(node.id);
    }
  }

  function startLink(id = null) {
    linking = true;
    connectFrom = id;
    setMessage('');
  }

  function stopLink(render = true) {
    linking = false;
    connectFrom = null;
    message = '';
    if (render) paintCanvas();
  }

  function connect(sourceId, targetId) {
    if (SysmlModel.duplicateConnection(model, sourceId, targetId)) {
      stopLink();
      window.alert('두 항목 사이에 이미 커넥터가 있습니다.');
      return;
    }
    const edge = edit((draft) => {
      for (const id of new Set([sourceId, targetId])) {
        const node = draft.nodes.find((item) => item.id === id);
        if (node?.x === null) {
          const point = newPoint(node, draft.nodes);
          SysmlModel.moveNode(draft, id, point.x, point.y);
        }
      }
      return SysmlModel.connect(draft, sourceId, targetId);
    });
    stopLink(false);
    select(edge ? { kind: 'edge', id: edge.id } : null);
  }

  function select(item) {
    selection = item;
    message = '';
    refreshSelection();
    renderProperties();
    paintCanvas();
  }

  function selectTree(item) {
    if (linking && item.kind === 'node') {
      if (connectFrom) connect(connectFrom, item.id);
      else startLink(item.id);
      return;
    }
    select(item);
    if (item.kind === 'node') canvas.centerOn(item.id);
  }

  function drop(item, point, nodeId) {
    if (item.kind === 'palette') {
      if (item.type === 'connector') startLink(nodeId);
      else if (types[item.type]) createNode(item.type, nodeId || selectedNodeId(), point, true);
    } else if (item.kind === 'tree' && item.modelId === model.id && model.nodes.some((node) => node.id === item.id)) {
      edit((draft) => SysmlModel.moveNode(draft, item.id, point.x, point.y, nodeId));
      select({ kind: 'node', id: item.id });
    }
  }

  function selectedNodeId() {
    return selection?.kind === 'node' ? selection.id : null;
  }

  const paletteTypes = [...Object.keys(types).filter((type) => type !== 'connector'), 'connector'];
  for (const type of paletteTypes) {
    const label = type === 'connector' ? '커넥터' : types[type].label;
    const item = sysmlButton(label, () => {
      if (type === 'connector') startLink(selectedNodeId());
      else createNode(type, selectedNodeId(), newPoint(types[type]), true);
    }, { icon: type });
    item.draggable = true;
    item.title = `${label} 추가 · 클릭하거나 캔버스로 끌어 놓기`;
    item.addEventListener('dragstart', (event) => setSysmlDragData(event, { kind: 'palette', type }));
    paletteItems.append(item);
  }

  function showMenu(event, parentId, point = null, edgeId = null) {
    event.preventDefault();
    menu.replaceChildren();
    restoreFocus = document.activeElement;
    const row = (label, action, icon) => {
      const button = sysmlButton(label, () => {
        hideMenu();
        action();
      }, { icon });
      button.setAttribute('role', 'menuitem');
      menu.append(button);
    };
    if (!edgeId) {
      for (const type of SysmlModel.allowedTypes(model, parentId)) {
        row(`${types[type].label} 추가`, () => createNode(type, parentId, point), type);
      }
      row(parentId ? '이 항목에서 연결' : '커넥터 추가', () => startLink(parentId), 'connector');
    }
    const itemId = edgeId ?? parentId;
    if (itemId) row('항목 삭제', () => deleteItem(itemId));
    else if (!point) {
      row('모델 편집', renameModel);
      row('모델 삭제', removeModel);
    }
    const trigger = event.currentTarget?.getBoundingClientRect?.();
    const x = event.clientX || trigger?.left || 8;
    const y = event.clientY || trigger?.bottom || 8;
    menu.hidden = false;
    menu.style.left = `${Math.max(8, Math.min(x, window.innerWidth - menu.offsetWidth - 8))}px`;
    menu.style.top = `${Math.max(8, Math.min(y, window.innerHeight - menu.offsetHeight - 8))}px`;
    menu.querySelector('button')?.focus();
  }

  function hideMenu(focus = false) {
    if (menu.hidden) return;
    menu.hidden = true;
    if (focus && restoreFocus?.isConnected) restoreFocus.focus();
  }

  document.addEventListener('pointerdown', (event) => {
    if (!menu.contains(event.target)) hideMenu();
  });
  menu.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      hideMenu(true);
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const buttons = [...menu.querySelectorAll('button')];
      const delta = event.key === 'ArrowDown' ? 1 : -1;
      buttons[(buttons.indexOf(document.activeElement) + buttons.length + delta) % buttons.length]?.focus();
    }
  });

  function deleteItem(id) {
    const node = model.nodes.find((candidate) => candidate.id === id);
    if (node && model.nodes.some((candidate) => candidate.parentId === id) &&
        !window.confirm(`‘${node.name}’과 하위 항목을 삭제할까요?`)) return;
    edit((draft) => SysmlModel.removeItem(draft, id));
  }

  function renderProperties() {
    const isNode = selection?.kind === 'node';
    const items = isNode ? model.nodes : model.connectors;
    const item = items.find((entry) => entry.id === selection?.id);
    const key = item ? `${item.id}:${item.x === null}` : 'empty';
    if (inspectorKey !== key) {
      inspectorKey = key;
      properties.replaceChildren();
      fields.clear();
      if (!item) {
        properties.append(sysmlElement('p', 'sysml-prompt', '항목을 선택하면 이름과 스타일을 편집할 수 있습니다.'));
        return;
      }
      const type = isNode ? item.type : 'connector';
      const label = sysmlElement('div', 'sysml-property-type', isNode ? types[type].label : '커넥터');
      label.prepend(createSysmlIcon(type));
      properties.append(label);
      if (isNode) {
        field('이름', 'name', 'text', { maxLength: limits.maxNameLength, required: true });
        field('텍스트', 'text', 'textarea', { maxLength: limits.maxTextLength, rows: 3 });
        if (item.type === 'port') {
          const label = sysmlElement('label', 'sysml-field', '포트 방향');
          const direction = sysmlElement('select');
          for (const [value, glyph] of Object.entries({ in: '←', out: '→', inout: '↔' })) {
            const option = sysmlElement('option', '', value + ' ' + glyph);
            option.value = value;
            direction.append(option);
          }
          direction.onchange = () => edit(draft => { draft.nodes.find(node => node.id === item.id).direction = direction.value; });
          fields.set('direction', direction);
          label.append(direction);
          properties.append(label);
        } else {
          const size = sysmlElement('div', 'sysml-field-pair');
          field('너비', 'width', 'number', { min: limits.minWidth, max: limits.maxWidth }, size);
          field('높이', 'height', 'number', { min: limits.minHeight, max: limits.maxHeight }, size);
          properties.append(size);
        }
        const color = sysmlElement('div', 'sysml-field-pair');
        field('채우기', 'fill', 'color', {}, color);
        field('테두리', 'stroke', 'color', {}, color);
        properties.append(color);
        if (item.x === null) {
          properties.append(sysmlButton('캔버스에 배치', () => {
            const point = newPoint(item);
            edit((draft) => SysmlModel.moveNode(draft, item.id, point.x, point.y));
            canvas.centerOn(item.id);
          }));
        }
      } else {
        const endpoints = sysmlElement('p', 'sysml-edge-endpoints');
        endpoints.dataset.endpoints = '';
        properties.append(endpoints);
        field('연결선 이름', 'name', 'text', { maxLength: limits.maxNameLength });
        field('선 색상', 'color', 'color');
        const label = sysmlElement('label', 'sysml-field', '선 형태');
        const route = sysmlElement('select');
        for (const [value, caption] of [['straight', '직선'], ['orthogonal', '직각 꺾임선']]) {
          const option = sysmlElement('option', '', caption);
          option.value = value;
          route.append(option);
        }
        route.onchange = () => edit(draft => { draft.connectors.find(edge => edge.id === item.id).route = route.value; });
        fields.set('route', route);
        label.append(route);
        properties.append(label);
      }
      properties.append(sysmlButton('항목 삭제', () => deleteItem(item.id), { className: 'sysml-delete' }));
    }
    if (!item) return;
    if (!isNode) {
      const name = (id) => model.nodes.find((node) => node.id === id)?.name ?? '';
      properties.querySelector('[data-endpoints]').textContent = `${name(item.sourceId)} → ${name(item.targetId)}`;
    }
    for (const [property, input] of fields) {
      if (document.activeElement !== input) input.value = item[property];
    }

    function field(label, property, type, attributes = {}, container = properties) {
      const wrapper = sysmlElement('label', 'sysml-field', label);
      const input = sysmlElement(type === 'textarea' ? 'textarea' : 'input');
      if (type !== 'textarea') input.type = type;
      Object.assign(input, attributes);
      input.addEventListener('change', () => {
        const current = (isNode ? model.nodes : model.connectors).find((entry) => entry.id === item.id);
        if (!current) return;
        const value = type === 'number' ? input.valueAsNumber : type === 'textarea' ? input.value : input.value.trim();
        if (!input.checkValidity() || (attributes.required && !value) || (type === 'number' && !Number.isFinite(value))) {
          input.value = current[property];
          return;
        }
        if (value === current[property]) return;
        edit((draft) => {
          const entries = isNode ? draft.nodes : draft.connectors;
          entries.find((entry) => entry.id === item.id)[property] = value;
        });
        input.value = (isNode ? model.nodes : model.connectors).find((entry) => entry.id === item.id)[property];
      });
      wrapper.append(input);
      container.append(wrapper);
      fields.set(property, input);
    }
  }

  return {
    element, selectTree, showMenu,
    deleteSelection() {
      if (!selection || !model) return false;
      deleteItem(selection.id);
      return true;
    },
    selectedId: () => selection?.id,
    render(nextModel) {
      if (model === nextModel) return;
      const changed = model?.id !== nextModel?.id;
      model = nextModel;
      if (changed) {
        selection = null;

        stopLink(false);
        hideMenu();
      }
      if (!model) return;
      if (selection && !(selection.kind === 'node' ? model.nodes : model.connectors).some((item) => item.id === selection.id)) {
        selection = null;
      }
      if (connectFrom && !model.nodes.some((item) => item.id === connectFrom)) stopLink(false);
      heading.textContent = model.name;
      modelKind.textContent = modelKinds[model.kind];

      renderProperties();
      paintCanvas();
      if (changed) this.restoreView();
    },
    captureView() {
      if (model && element.isConnected && element.getClientRects().length) return canvas.getCenter();
      return null;
    },
    restoreView() {
      canvas.setCenter(model?.viewCenter);
    },
    cancel() {
      if (!menu.hidden) hideMenu(true);
      else if (linking) stopLink();
      else return false;
      return true;
    }
  };
}

function renderSysmlNavigationTree({ tree, model, collapsed, selectTree, itemMenu, projectId, selectedId }) {
    const focused = tree.contains(document.activeElement) ? document.activeElement.dataset.itemId : null;
    tree.replaceChildren();
    const children = new Map();
    for (const node of model.nodes) {
      if (!children.has(node.parentId)) children.set(node.parentId, []);
      children.get(node.parentId).push(node);
    }
    function itemRow(kind, item, label, depth) {
      const row = sysmlElement('div', 'sysml-tree-row');
      row.style.setProperty('--tree-depth', depth);
      const hasChildren = kind === 'node' && children.has(item.id);
      if (hasChildren) {
        const toggle = sysmlButton(collapsed.has(item.id) ? '펼치기' : '접기', () => {
          if (collapsed.has(item.id)) collapsed.delete(item.id);
          else collapsed.add(item.id);
          renderSysmlNavigationTree({ tree, model, collapsed, selectTree, itemMenu, projectId, selectedId });
        }, { className: 'sysml-tree-toggle', iconOnly: true });
        toggle.textContent = collapsed.has(item.id) ? '▸' : '▾';
        toggle.setAttribute('aria-expanded', String(!collapsed.has(item.id)));
        row.append(toggle);
      } else row.append(sysmlElement('span', 'sysml-tree-spacer'));
      const button = sysmlButton(label, () => selectTree({ kind, id: item.id }), {
        icon: kind === 'node' ? item.type : 'connector', className: 'sysml-tree-item'
      });
      button.dataset.itemId = item.id;
      button.title = label;
      button.setAttribute('aria-pressed', String(selectedId() === item.id));
      if (kind === 'node') {
        button.draggable = true;
        button.addEventListener('dragstart', (event) => setSysmlDragData(event, {
          kind: 'tree', id: item.id, modelId: model.id, projectId, type: item.type
        }));
        if (item.x === null) button.append(sysmlElement('span', 'sysml-tree-unplaced', '미배치'));
      }
      const openMenu = event => itemMenu(event, kind, item.id);
      button.addEventListener('contextmenu', openMenu);
      button.addEventListener('keydown', (event) => {
        if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) openMenu(event);
      });
      row.append(button);
      tree.append(row);
      if (focused === item.id) button.focus({ preventScroll: true });
    }
    const stack = (children.get(null) ?? []).map((node) => ({ node, depth: 0 })).reverse();
    while (stack.length) {
      const { node, depth } = stack.pop();
      itemRow('node', node, node.name, depth);
      if (!collapsed.has(node.id)) {
        const nested = children.get(node.id) ?? [];
        for (let i = nested.length - 1; i >= 0; i--) stack.push({ node: nested[i], depth: depth + 1 });
      }
    }
    if (model.connectors.length) {
      tree.append(sysmlElement('p', 'sysml-tree-section', '연결'));
      const names = new Map(model.nodes.map((node) => [node.id, node.name]));
      for (const edge of model.connectors) {
        itemRow('edge', edge, edge.name || `${names.get(edge.sourceId)} → ${names.get(edge.targetId)}`, 0);
      }
    }

  }

