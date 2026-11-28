const sysmlDragType = 'application/x-sysml-item';

function setSysmlDragData(event, item) {
  event.dataTransfer.setData(sysmlDragType, JSON.stringify(item));
  event.dataTransfer.effectAllowed = 'copy';
}

function createSysmlIcon(type) {
  const glyphs = {
    element: '▭',
    port: '↔',
    function: 'ƒ',
    failure: '!',
    malfunction: 'ϟ',
    connector: '↔',
    dependency: '⇢',
    plus: '+',
    undo: '↶',
    redo: '↷',
    arrange: '⋮',
    expand: '⤢'
  };
  const icon = document.createElement('span');
  icon.className = 'sysml-icon';
  icon.dataset.icon = type;
  icon.setAttribute('aria-hidden', 'true');
  if (type === 'model') {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    const path = document.createElementNS(svg.namespaceURI, 'path');
    path.setAttribute('d', 'M9 3h6v5H9z M3 16h6v5H3z M15 16h6v5h-6z M12 8v4 M6 16v-4h12v4');
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', 'currentColor');
    path.setAttribute('stroke-width', '1.7');
    path.setAttribute('stroke-linejoin', 'round');
    svg.append(path);
    icon.append(svg);
  } else icon.textContent = glyphs[type] ?? '•';
  return icon;
}

function createSysmlCanvas({
  kindIcon = createSysmlIcon,
  nodeTypes = SysmlModel.types,
  emptyMessage = null,
  dragKinds = ['tree', 'palette'],
  onDrop,
  onSelect,
  onMove,
  onResize,
  onConnect,
  onLinkCancelled,
  onCanvasMenu
}) {
  const viewport = document.createElement('div');
  viewport.className = 'sysml-canvas';
  viewport.setAttribute('role', 'region');
  viewport.setAttribute('aria-label', 'SysML 다이어그램 캔버스');
  viewport.tabIndex = 0;
  const surface = document.createElement('div');
  surface.className = 'sysml-canvas-surface';
  const markerPrefix = 'sysml-arrow-' + SysmlModel.newId();
  const lines = svgElement('svg', { class: 'sysml-canvas-lines' });
  const cards = document.createElement('div');
  cards.className = 'sysml-canvas-cards';
  const labels = svgElement('svg', { class: 'sysml-canvas-labels', 'aria-hidden': 'true' });
  const empty = document.createElement('p');
  empty.className = 'sysml-canvas-empty';
  surface.append(lines, cards, labels, empty);
  viewport.append(surface);

  let model = null;
  let selection = null;
  let linking = false;
  let connectFrom = null;
  let drag = null;
  let suppressedClick = null;
  let placed = new Map();
  const cardById = new Map();

  function svgElement(tag, attributes = {}) {
    const element = document.createElementNS('http://www.w3.org/2000/svg', tag);
    for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, value);
    return element;
  }

  function nodeLabel(node) {
    return node.name || nodeTypes[node.type].label;
  }

  function textColor(fill) {
    const channels = [1, 3, 5].map((offset) => parseInt(fill.slice(offset, offset + 2), 16) / 255);
    const [red, green, blue] = channels.map((value) =>
      value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4);
    const luminance = red * .2126 + green * .7152 + blue * .0722;
    if (luminance > .35) return '#173b45';
    return luminance > .18 ? '#000' : '#fff';
  }

  function nodePoint(node) {
    if (!drag?.position || !drag.group.has(node.id)) return node;
    return limitPosition({ x: node.x + drag.position.x - drag.origin.x, y: node.y + drag.position.y - drag.origin.y });
  }

  function setCardPosition(card, node) {
    const { x, y } = nodePoint(node);
    card.style.left = x + 'px';
    card.style.top = y + 'px';
  }

  function nodeSize(node) {
    return drag?.id === node.id && drag.size ? drag.size : node;
  }

  function sizeSurface() {
    let right = 0;
    let bottom = 0;
    for (const node of placed.values()) {
      const { x, y } = nodePoint(node);
      const { width, height } = nodeSize(node);
      right = Math.max(right, x + width);
      bottom = Math.max(bottom, y + height);
    }
    surface.style.width = right ? right + 160 + 'px' : '';
    surface.style.height = bottom ? bottom + 106 + 'px' : '';
  }

  function center(node) {
    const point = nodePoint(node);
    const { width, height } = nodeSize(node);
    return { x: point.x + width / 2, y: point.y + height / 2 };
  }

  function borderPoint(node, toward) {
    const origin = center(node);
    const dx = toward.x - origin.x;
    const dy = toward.y - origin.y;
    const { width, height } = nodeSize(node);
    const offsetX = dx / (width / 2);
    const offsetY = dy / (height / 2);
    const extent = ['solution', 'assumption', 'justification'].includes(node.type)
      ? Math.hypot(offsetX, offsetY) : Math.max(Math.abs(offsetX), Math.abs(offsetY));
    if (extent === 0) return { x: origin.x + width / 2, y: origin.y };
    return { x: origin.x + dx / extent, y: origin.y + dy / extent };
  }

  function connectorPath(from, to, route, index, lane) {
    const a = center(from);
    const b = center(to);
    if (from.id === to.id || (a.x === b.x && a.y === b.y)) {
      const { width, height } = nodeSize(from);
      const x = a.x + width / 2;
      const y = a.y;
      const spread = Math.min(height / 2, Math.max(9, Math.min(height / 4, 24)));
      const reach = 44 + index * 13;
      if (route === 'orthogonal') return {
        path: 'M ' + x + ' ' + (y - spread) + ' h ' + reach + ' v ' + (2 * spread) + ' h ' + (-reach),
        labelX: x + reach, labelY: y - 8
      };
      return {
        path: 'M ' + x + ' ' + (y - spread) + ' C ' + (x + reach) + ' ' + (y - 2 * spread) +
          ', ' + (x + reach) + ' ' + (y + 2 * spread) + ', ' + x + ' ' + (y + spread),
        labelX: x + reach * .75,
        labelY: y - 9
      };
    }
    const distance = Math.hypot(b.x - a.x, b.y - a.y);
    const bend = {
      x: (a.x + b.x) / 2 - (b.y - a.y) / distance * lane,
      y: (a.y + b.y) / 2 + (b.x - a.x) / distance * lane
    };
    const start = borderPoint(from, lane ? bend : b);
    const end = borderPoint(to, lane ? bend : a);
    const midX = (start.x + end.x) / 2;
    const midY = (start.y + end.y) / 2;
    let path = `M ${start.x} ${start.y}`;
    if (route === 'orthogonal') {
      const x = midX + lane;
      const y = midY + lane;
      path += Math.abs(a.x - b.x) >= Math.abs(a.y - b.y)
        ? ` H ${x} V ${end.y} H ${end.x}`
        : ` V ${y} H ${end.x} V ${end.y}`;
      return { path, labelX: x, labelY: y - 8 };
    }
    path += ` L ${end.x} ${end.y}`;
    return { path, labelX: midX, labelY: midY - 8 };
  }

  let hiddenItems = new Set();

  function drawConnectors() {
    const byPair = new Map();
    const definitions = svgElement('defs');
    const connectors = document.createDocumentFragment();
    const connectorLabels = document.createDocumentFragment();
    for (const connector of model?.connectors ?? []) {
      if (hiddenItems.has(connector.id) || !placed.has(connector.sourceId) || !placed.has(connector.targetId)) continue;
      const pair = JSON.stringify([connector.sourceId, connector.targetId].sort());
      if (!byPair.has(pair)) byPair.set(pair, []);
      byPair.get(pair).push(connector);
    }
    for (const group of byPair.values()) {
      const separate = group.some(edge => edge.relation === 'dependency');
      group.forEach((connector, index) => {
        const from = placed.get(connector.sourceId);
        const to = placed.get(connector.targetId);
        const lane = separate ? (index - (group.length - 1) / 2) * 28 : 0;
        const geometry = connectorPath(from, to, connector.route, index, from.id < to.id ? lane : -lane);
        const dependency = connector.relation === 'dependency';
        const isSelected = selection?.kind === 'edge' && selection.id === connector.id;
        const caption = [connector.stereotype && `«${connector.stereotype}»`, connector.name].filter(Boolean).join(' ');
        const label = caption || (dependency ? 'Dependency' : '커넥터');
        const edge = svgElement('g', {
          class: 'sysml-canvas-edge' + (isSelected ? ' is-selected' : ''),
          role: 'button',
          tabindex: '0',
          'aria-label': label + ' · ' + nodeLabel(from) + (dependency ? ' → ' : ' ↔ ') + nodeLabel(to),
          'aria-pressed': String(isSelected),
          'data-edge-id': connector.id
        });
        const visible = svgElement('path', {
          d: geometry.path, class: 'sysml-canvas-line', stroke: connector.color
        });
        if (dependency) {
          const markerId = markerPrefix + '-' + connector.id;
          const marker = svgElement('marker', {
            id: markerId, viewBox: '0 0 12 12', markerWidth: 12, markerHeight: 12,
            refX: 11, refY: 6, orient: 'auto', markerUnits: 'userSpaceOnUse'
          });
          marker.append(svgElement('path', {
            d: connector.arrowhead ? 'M 2 1 L 11 6 L 2 11 Z' : 'M 2 1 L 11 6 L 2 11',
            fill: connector.arrowhead === 'filled' ? connector.color : connector.arrowhead === 'hollow' ? '#fff' : 'none',
            stroke: connector.color,
            'stroke-width': 1.7, 'stroke-linejoin': 'round'
          }));
          definitions.append(marker);
          if (!connector.solid) visible.setAttribute('stroke-dasharray', '7 5');
          visible.setAttribute('marker-end', `url(#${markerId})`);
        }
        const hit = svgElement('path', { d: geometry.path, class: 'sysml-canvas-line-hit' });
        edge.append(visible, hit);
        if (caption) {
          const text = svgElement('text', {
            x: geometry.labelX, y: geometry.labelY, class: 'sysml-canvas-edge-label',
            'data-edge-id': connector.id
          });
          text.textContent = caption;
          connectorLabels.append(text);
        }
        connectors.append(edge);
      });
    }
    lines.replaceChildren(definitions, connectors);
    labels.replaceChildren(connectorLabels);
  }

  function drawCard(node, hasFailureChild) {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'sysml-canvas-card';
    card.dataset.nodeId = node.id;
    card.dataset.nodeType = node.type;
    if (node.undeveloped) card.classList.add('is-undeveloped');
    card.style.setProperty('--node-fill', node.fill);
    card.style.setProperty('--node-stroke', hasFailureChild ? '#c52222' : node.stroke);
    card.style.setProperty('--node-ink', textColor(node.fill));
    card.style.width = node.width + 'px';
    card.style.height = node.height + 'px';
    const isSelected = selection?.kind === 'node' && selection.id === node.id;
    card.classList.toggle('is-selected', isSelected);
    card.classList.toggle('is-connect-from', linking && connectFrom === node.id);
    card.setAttribute('aria-pressed', String(isSelected));
    card.setAttribute('aria-label', nodeTypes[node.type].label + ' · ' + nodeLabel(node));
    card.title = node.text ? nodeLabel(node) + '\n' + node.text : nodeLabel(node);
    setCardPosition(card, node);
    const info = document.createElement('span');
    info.className = 'sysml-canvas-card-info';
    const heading = document.createElement('span');
    heading.className = 'sysml-canvas-card-heading';
    heading.textContent = nodeLabel(node);
    info.append(heading);
    if (node.text) {
      const text = document.createElement('span');
      text.className = 'sysml-canvas-card-text';
      text.textContent = node.text;
      info.append(text);
    }
    if (node.type === 'port') {
      card.textContent = { in: '←', out: '→', inout: '↔' }[node.direction];
      card.setAttribute('aria-label', card.title + ' · ' + node.direction);
    } else card.append(kindIcon(node.type), info);
    if (node.type !== 'port') {
      const handle = document.createElement('span');
      handle.className = 'sysml-resize-handle';
      handle.title = '드래그하여 크기 조절';
      card.append(handle);
    }
    cardById.set(node.id, card);
    return card;
  }

  function render({ model: nextModel, selection: nextSelection, connectFrom: source, linking: enabled }) {
    const focused = viewport.contains(document.activeElement) ? document.activeElement : null;
    const nodeFocus = focused?.dataset?.nodeId;
    const edgeFocus = focused?.dataset?.edgeId;
    const switching = model?.id !== nextModel?.id;
    model = nextModel;
    selection = nextSelection;
    connectFrom = source;
    linking = enabled;
    if (switching) drag = null;
    viewport.classList.toggle('is-linking', Boolean(linking));
    const nodes = model?.nodes ?? [];
    const children = new Map();
    for (const item of [...nodes, ...(model?.connectors ?? [])]) {
      if (!children.has(item.parentId)) children.set(item.parentId, []);
      children.get(item.parentId).push(item.id);
    }
    hiddenItems = new Set(nodes.filter(node => node.type === 'port').flatMap(port => children.get(port.id) ?? []));
    for (const id of hiddenItems) {
      for (const child of children.get(id) ?? []) hiddenItems.add(child);
    }
    const failureParents = new Set(nodes
      .filter(node => node.type === 'failure' || node.type === 'malfunction')
      .map(node => node.parentId));
    placed = new Map(nodes
      .filter(node => node.x !== null && node.y !== null && !hiddenItems.has(node.id))
      .map(node => [node.id, node]));
    cardById.clear();
    const nodeCards = document.createDocumentFragment();
    for (const node of placed.values()) {
      const card = drawCard(node, failureParents.has(node.id) && ['element', 'port', 'function'].includes(node.type));
      let depth = 0;
      for (let owner = placed.get(node.parentId); owner; owner = placed.get(owner.parentId)) depth++;
      card.style.zIndex = String(depth * 2 + (node.type === 'port' ? 1 : 0));
      nodeCards.append(card);
    }
    cards.replaceChildren(nodeCards);
    empty.hidden = placed.size > 0;
    empty.textContent = emptyMessage ?? (model
      ? '모델 트리 또는 팔레트 항목을 여기에 끌어오세요.'
      : '시스템 → SysML에서 모델을 만들거나 선택하세요.');
    sizeSurface();
    drawConnectors();
    if (switching) {
      viewport.scrollLeft = 0;
      viewport.scrollTop = 0;
      return;
    }
    const focusTarget = nodeFocus ? cardById.get(nodeFocus)
      : edgeFocus && Array.from(lines.children).find((edge) => edge.dataset.edgeId === edgeFocus);
    focusTarget?.focus({ preventScroll: true });
  }

  function pointAt(event) {
    const rect = surface.getBoundingClientRect();
    return {
      x: Math.max(0, Math.round(event.clientX - rect.left)),
      y: Math.max(0, Math.round(event.clientY - rect.top))
    };
  }

  function limitPosition(position) {
    const max = SysmlModel.limits.maxCoordinate;
    return { x: Math.min(max, Math.max(0, position.x)), y: Math.min(max, Math.max(0, position.y)) };
  }

  function getCenter() {
    return {
      x: Math.round(viewport.scrollLeft + viewport.clientWidth / 2),
      y: Math.round(viewport.scrollTop + viewport.clientHeight / 2)
    };
  }

  function setCenter(point) {
    viewport.scrollLeft = point ? point.x - viewport.clientWidth / 2 : 0;
    viewport.scrollTop = point ? point.y - viewport.clientHeight / 2 : 0;
  }

  function centerOn(id) {
    const node = placed.get(id);
    if (node) setCenter(center(node));
  }

  function clickNode(nodeId) {
    if (linking && connectFrom) {
      onConnect(connectFrom, nodeId);
      return;
    }
    onSelect({ kind: 'node', id: nodeId });
  }

  viewport.addEventListener('pointerdown', (event) => {
    const card = event.target.closest('[data-node-id]');
    suppressedClick = null;
    if (!card || linking || !event.isPrimary || event.button !== 0) return;
    const id = card.dataset.nodeId;
    const pointer = pointAt(event);
    const origin = placed.get(id);
    const group = new Set([id]);
    if (origin.type === 'element') {
      for (const parent of group) {
        for (const child of placed.values()) if (child.parentId === parent) group.add(child.id);
      }
    }
    drag = { id, card, origin, pointer, group, resize: event.target.classList.contains('sysml-resize-handle'), pointerId: event.pointerId, moved: false };
    card.setPointerCapture(event.pointerId);
  });

  viewport.addEventListener('pointermove', (event) => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    const current = pointAt(event);
    const dx = current.x - drag.pointer.x;
    const dy = current.y - drag.pointer.y;
    if (!drag.moved && Math.hypot(dx, dy) < 4) return;
    drag.moved = true;
    if (drag.resize) {
      const limits = SysmlModel.limits;
      drag.size = {
        width: Math.min(limits.maxWidth, Math.max(limits.minWidth, drag.origin.width + dx)),
        height: Math.min(limits.maxHeight, Math.max(limits.minHeight, drag.origin.height + dy))
      };
      if (drag.origin.type === 'solution') {
        const size = Math.max(drag.size.width, drag.size.height);
        drag.size = { width: size, height: size };
      }
      drag.card.style.width = drag.size.width + 'px';
      drag.card.style.height = drag.size.height + 'px';
      sizeSurface();
      drawConnectors();
      return;
    }
    drag.position = limitPosition({ x: drag.origin.x + dx, y: drag.origin.y + dy });
    drag.card.classList.add('is-dragging');
    for (const id of drag.group) setCardPosition(cardById.get(id), placed.get(id));
    sizeSurface();
    drawConnectors();
  });

  function endDrag(event, commit) {
    if (!drag || event.pointerId !== drag.pointerId) return;
    const completed = drag;
    drag = null;
    if (!completed.moved) return;
    completed.card.classList.remove('is-dragging');
    if (commit) {
      suppressedClick = completed.id;
      if (completed.resize) onResize(completed.id, completed.size);
      else {
        const target = document.elementsFromPoint(event.clientX, event.clientY)
          .map(hit => hit.closest('[data-node-id]'))
          .find(card => card && cards.contains(card) && card.dataset.nodeId !== completed.id && card.dataset.nodeType === 'element');
        onMove(completed.id, completed.position, target?.dataset.nodeId);
      }
    } else {
      completed.card.style.width = completed.origin.width + 'px';
      completed.card.style.height = completed.origin.height + 'px';
      for (const id of completed.group) setCardPosition(cardById.get(id), placed.get(id));
      sizeSurface();
      drawConnectors();
    }
  }

  viewport.addEventListener('pointerup', (event) => endDrag(event, true));
  viewport.addEventListener('pointercancel', (event) => endDrag(event, false));
  viewport.addEventListener('lostpointercapture', (event) => endDrag(event, false));
  viewport.addEventListener('click', (event) => {
    const nodeId = event.target.closest('[data-node-id]')?.dataset.nodeId;
    if (nodeId) {
      if (event.detail > 0 && suppressedClick === nodeId) {
        suppressedClick = null;
        return;
      }
      clickNode(nodeId);
      return;
    }
    const edgeId = event.target.closest('[data-edge-id]')?.dataset.edgeId;
    onSelect(edgeId ? { kind: 'edge', id: edgeId } : null);
  });

  viewport.addEventListener('keydown', (event) => {
    const edgeId = event.target.closest('[data-edge-id]')?.dataset.edgeId;
    if (edgeId && (event.key === 'Enter' || event.key === ' ')) {
      event.preventDefault();
      onSelect({ kind: 'edge', id: edgeId });
    }
    if (linking && event.key === 'Escape') {
      event.preventDefault();
      onLinkCancelled?.();
    }
  });

  viewport.addEventListener('dragover', (event) => {
    if (!model || !Array.from(event.dataTransfer.types).includes(sysmlDragType)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
    viewport.classList.add('is-drop-target');
  });

  viewport.addEventListener('dragleave', (event) => {
    if (!event.relatedTarget || !viewport.contains(event.relatedTarget)) {
      viewport.classList.remove('is-drop-target');
    }
  });

  viewport.addEventListener('drop', (event) => {
    viewport.classList.remove('is-drop-target');
    if (!model) return;
    const payload = event.dataTransfer.getData(sysmlDragType);
    if (!payload) return;
    event.preventDefault();
    let item;
    try {
      item = JSON.parse(payload);
    } catch {
      return;
    }
    if (dragKinds.includes(item?.kind)) {
      const target = event.target.closest('[data-node-id]')?.dataset.nodeId ?? null;
      onDrop(item, limitPosition(pointAt(event)), target);
    }
  });

  viewport.addEventListener('contextmenu', (event) => {
    if (!model || !onCanvasMenu) return;
    event.preventDefault();
    const nodeId = event.target.closest('[data-node-id]')?.dataset.nodeId ?? null;
    const edgeId = event.target.closest('[data-edge-id]')?.dataset.edgeId ?? null;
    onCanvasMenu(event, nodeId, limitPosition(pointAt(event)), edgeId);
  });

  return { element: viewport, render, getCenter, setCenter, centerOn };
}
