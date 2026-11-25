const sysmlDragType = 'application/x-sysml-item';

function setSysmlDragData(event, item) {
  event.dataTransfer.setData(sysmlDragType, JSON.stringify(item));
  event.dataTransfer.effectAllowed = 'copy';
}

function createSysmlIcon(type) {
  const glyphs = {
    element: '▣',
    port: '◇',
    function: 'ƒ',
    failure: '!',
    malfunction: 'ϟ',
    connector: '↔',
    model: '▤',
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
  icon.textContent = glyphs[type] ?? '•';
  return icon;
}

function createSysmlCanvas({
  kindIcon = createSysmlIcon,
  onDrop,
  onSelect,
  onMove,
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
    return node.name || SysmlModel.types[node.type].label;
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
    return drag?.id === node.id && drag.moved ? drag.position : node;
  }

  function setCardPosition(card, node) {
    const { x, y } = nodePoint(node);
    card.style.left = x + 'px';
    card.style.top = y + 'px';
  }

  function sizeSurface() {
    let right = 0;
    let bottom = 0;
    for (const node of placed.values()) {
      const { x, y } = nodePoint(node);
      right = Math.max(right, x + node.width);
      bottom = Math.max(bottom, y + node.height);
    }
    surface.style.width = right ? right + 160 + 'px' : '';
    surface.style.height = bottom ? bottom + 106 + 'px' : '';
  }

  function center(node) {
    const point = nodePoint(node);
    return { x: point.x + node.width / 2, y: point.y + node.height / 2 };
  }

  function borderPoint(node, toward) {
    const origin = center(node);
    const dx = toward.x - origin.x;
    const dy = toward.y - origin.y;
    const extent = Math.max(Math.abs(dx) / (node.width / 2), Math.abs(dy) / (node.height / 2));
    if (extent === 0) return { x: origin.x + node.width / 2, y: origin.y };
    return { x: origin.x + dx / extent, y: origin.y + dy / extent };
  }

  function connectorPath(from, to, index, count) {
    const a = center(from);
    const b = center(to);
    if (from.id === to.id || (a.x === b.x && a.y === b.y)) {
      const x = a.x + from.width / 2;
      const y = a.y;
      const spread = Math.max(9, Math.min(from.height / 4, 24));
      const reach = 44 + index * 13;
      return {
        path: 'M ' + x + ' ' + (y - spread) + ' C ' + (x + reach) + ' ' + (y - 2 * spread) +
          ', ' + (x + reach) + ' ' + (y + 2 * spread) + ', ' + x + ' ' + (y + spread),
        labelX: x + reach * .75,
        labelY: y - 9
      };
    }
    const distance = Math.hypot(b.x - a.x, b.y - a.y);
    const direction = from.id < to.id ? 1 : -1;
    const offset = (index - (count - 1) / 2) * 36 * direction;
    const midpoint = {
      x: (a.x + b.x) / 2 - (b.y - a.y) / distance * offset,
      y: (a.y + b.y) / 2 + (b.x - a.x) / distance * offset
    };
    const start = borderPoint(from, midpoint);
    const end = borderPoint(to, midpoint);
    return {
      path: 'M ' + start.x + ' ' + start.y + ' Q ' + midpoint.x + ' ' + midpoint.y +
        ', ' + end.x + ' ' + end.y,
      labelX: (start.x + midpoint.x * 2 + end.x) / 4,
      labelY: (start.y + midpoint.y * 2 + end.y) / 4 - 8
    };
  }

  function drawConnectors() {
    const byPair = new Map();
    const connectors = document.createDocumentFragment();
    const connectorLabels = document.createDocumentFragment();
    for (const connector of model?.connectors ?? []) {
      if (!placed.has(connector.sourceId) || !placed.has(connector.targetId)) continue;
      const pair = JSON.stringify([connector.sourceId, connector.targetId].sort());
      if (!byPair.has(pair)) byPair.set(pair, []);
      byPair.get(pair).push(connector);
    }
    for (const group of byPair.values()) {
      group.forEach((connector, index) => {
        const from = placed.get(connector.sourceId);
        const to = placed.get(connector.targetId);
        const geometry = connectorPath(from, to, index, group.length);
        const isSelected = selection?.kind === 'edge' && selection.id === connector.id;
        const label = connector.name || '커넥터';
        const edge = svgElement('g', {
          class: 'sysml-canvas-edge' + (isSelected ? ' is-selected' : ''),
          role: 'button',
          tabindex: '0',
          'aria-label': label + ' · ' + nodeLabel(from) + ' ↔ ' + nodeLabel(to),
          'aria-pressed': String(isSelected),
          'data-edge-id': connector.id
        });
        const visible = svgElement('path', {
          d: geometry.path, class: 'sysml-canvas-line', stroke: connector.color
        });
        const hit = svgElement('path', { d: geometry.path, class: 'sysml-canvas-line-hit' });
        edge.append(visible, hit);
        if (connector.name) {
          const text = svgElement('text', {
            x: geometry.labelX, y: geometry.labelY, class: 'sysml-canvas-edge-label',
            'data-edge-id': connector.id
          });
          text.textContent = connector.name;
          connectorLabels.append(text);
        }
        connectors.append(edge);
      });
    }
    lines.replaceChildren(connectors);
    labels.replaceChildren(connectorLabels);
  }

  function drawCard(node) {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'sysml-canvas-card';
    card.dataset.nodeId = node.id;
    card.dataset.nodeType = node.type;
    card.style.setProperty('--node-fill', node.fill);
    card.style.setProperty('--node-stroke', node.stroke);
    card.style.setProperty('--node-ink', textColor(node.fill));
    card.style.width = node.width + 'px';
    card.style.height = node.height + 'px';
    const isSelected = selection?.kind === 'node' && selection.id === node.id;
    card.classList.toggle('is-selected', isSelected);
    card.classList.toggle('is-connect-from', linking && connectFrom === node.id);
    card.setAttribute('aria-pressed', String(isSelected));
    card.setAttribute('aria-label', SysmlModel.types[node.type].label + ' · ' + nodeLabel(node));
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
    card.append(kindIcon(node.type), info);
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
    placed = new Map((model?.nodes ?? [])
      .filter((node) => node.x !== null && node.y !== null)
      .map((node) => [node.id, node]));
    cardById.clear();
    const nodeCards = document.createDocumentFragment();
    for (const node of placed.values()) nodeCards.append(drawCard(node));
    cards.replaceChildren(nodeCards);
    empty.hidden = placed.size > 0;
    empty.textContent = model
      ? '모델 트리 또는 팔레트 항목을 여기에 끌어오세요.'
      : '시스템 → SysML에서 모델을 만들거나 선택하세요.';
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
    drag = { id, card, origin, pointer, pointerId: event.pointerId, moved: false };
    card.setPointerCapture(event.pointerId);
  });

  viewport.addEventListener('pointermove', (event) => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    const current = pointAt(event);
    const dx = current.x - drag.pointer.x;
    const dy = current.y - drag.pointer.y;
    if (!drag.moved && Math.hypot(dx, dy) < 4) return;
    drag.moved = true;
    drag.position = limitPosition({ x: drag.origin.x + dx, y: drag.origin.y + dy });
    drag.card.classList.add('is-dragging');
    setCardPosition(drag.card, drag.origin);
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
      onMove(completed.id, completed.position);
    } else {
      setCardPosition(completed.card, completed.origin);
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
    if (item?.kind === 'tree' || item?.kind === 'palette') {
      const target = event.target.closest('[data-node-id]')?.dataset.nodeId ?? null;
      onDrop(item, limitPosition(pointAt(event)), target);
    }
  });

  viewport.addEventListener('contextmenu', (event) => {
    if (!model || !onCanvasMenu) return;
    event.preventDefault();
    const nodeId = event.target.closest('[data-node-id]')?.dataset.nodeId ?? null;
    onCanvasMenu(event, nodeId, limitPosition(pointAt(event)));
  });

  return { element: viewport, render, getCenter, setCenter, centerOn };
}
