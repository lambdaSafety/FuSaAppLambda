function createFaultTreeEditor({ project, edit, navigate }) {
  const el = sysmlElement;
  const navigation = el('div', 'sysml-navigation');
  const links = el('div', 'sysml-model-links');
  const element = el('div', 'sysml-workspace');
  const layout = el('section', 'fta-layout');
  const canvas = el('div', 'fta-board');
  const viewport = el('div', 'fta-viewport');
  viewport.append(canvas);
  const palette = el('aside', 'fta-palette');
  const heading = el('h2');
  layout.append(viewport, palette);
  const toolbar = el('div', 'fta-toolbar');
  const arrange = sysmlButton('Auto-rearrange', () => edit(p => SysmlModel.arrangeFaultTree(diagram(p))));
  const scaleLabel = el('span', '', '100%');
  const remove = sysmlButton('삭제', removeSelected);
  remove.title = '선택한 기호와 연결선 삭제 (Delete)';
  toolbar.append(heading, arrange, remove, scaleLabel);
  element.append(toolbar, layout);
  let zoom = 1;
  viewport.addEventListener('wheel', event => {
    if (!event.ctrlKey) return;
    event.preventDefault();
    const bounds = viewport.getBoundingClientRect();
    const x = event.clientX - bounds.left;
    const y = event.clientY - bounds.top;
    const worldX = (viewport.scrollLeft + x) / zoom;
    const worldY = (viewport.scrollTop + y) / zoom;
    zoom = Math.max(0.25, Math.min(3, zoom * (event.deltaY < 0 ? 1.15 : 1 / 1.15)));
    canvas.style.zoom = zoom;
    viewport.scrollLeft = worldX * zoom - x;
    viewport.scrollTop = worldY * zoom - y;
    scaleLabel.textContent = Math.round(zoom * 100) + '%';
  }, { passive: false });
  const labels = { event: '이벤트', or: 'OR 게이트', and: 'AND 게이트', voting: 'VOTING 게이트', transfer: 'Transfer 게이트' };
  const mime = 'application/x-fusa-fta';
  let selected;
  let locked;
  let selectedNode;
  let connecting = false;
  let from = null;
  let visibleTree;
  const roles = { basic: '기본 이벤트', intermediate: '중간 이벤트', top: '최상위 이벤트' };
  function symbol(type, role = 'top', showTails = true) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 64 64');
    svg.setAttribute('aria-hidden', 'true');
    function path(d) {
      const shape = document.createElementNS(svg.namespaceURI, 'path');
      shape.setAttribute('d', d);
      svg.append(shape);
    }
    if (showTails) path('M32 2V12');
    if (type === 'event') {
      path(role === 'basic' ? 'M32 12a20 20 0 1 1 0 40a20 20 0 1 1 0 -40Z' : 'M4 12h56v38H4Z');
    } else if (type === 'transfer') {
      path('M32 12L56 52H8Z');
    } else {
      if (showTails) path('M23 45v16M41 45v16');
      path(type === 'and' ? 'M12 51V32a20 20 0 0 1 40 0v19Z' : 'M12 52V37Q12 20 32 12Q52 20 52 37V52Q32 41 12 52Z');
      if (type === 'voting') {
        const mark = document.createElementNS(svg.namespaceURI, 'text');
        mark.setAttribute('x', '32');
        mark.setAttribute('y', '39');
        mark.textContent = 'm';
        svg.append(mark);
      }
    }
    return svg;
  }
  function removeSelected() {
    const id = selectedNode;
    if (locked || !diagram(project())?.nodes.some(node => node.id === id)) return false;
    edit(p => {
      const tree = diagram(p);
      tree.nodes = tree.nodes.filter(node => node.id !== id);
      tree.connectors = tree.connectors.filter(edge => edge.sourceId !== id && edge.targetId !== id);
    });
    return true;
  }
  element.addEventListener('keydown', event => {
    if (event.key !== 'Delete' || event.target.closest('input, textarea, select, [contenteditable]')) return;
    if (removeSelected()) event.preventDefault();
  });
  function diagram(p) {
    return p?.diagrams.find(item => item.id === selected) ?? p?.diagrams[0];
  }
  function appendDiagram(p, name) {
    const item = { id: SysmlModel.newId(), name, nodes: [] };
    selected = item.id;
    p.diagrams.push(item);
    return item;
  }
  const add = sysmlButton('FTA 다이어그램 추가', () => {
    if (!project()) return navigate('projects');
    const name = window.prompt('FTA 다이어그램 이름', 'FTA ' + (project().diagrams.length + 1))?.trim();
    if (name && edit(p => appendDiagram(p, name))) navigate('safety-fta');
  }, { icon: 'plus' });
  navigation.append(add, links);
  function place(data, x, y, parentId = null, dropOnParent = false) {
    if (locked || !project()) return;
    edit(p => {
      const tree = diagram(p) ?? appendDiagram(p, 'FTA 1');
      if (data.move) {
        const node = tree.nodes.find(n => n.id === data.move);
        if (node) Object.assign(node, { x, y });
        return;
      }
      if (!Object.hasOwn(labels, data.type)) return;
      const source = data.source;
      const original = source && p.models.find(m => m.id === source.modelId)?.nodes.find(n => n.id === source.nodeId && n.type === 'element');
      if (source && !original) return;
      const parent = tree.nodes.find(n => n.id === parentId);
      if (parent && dropOnParent) {
        x = parent.x;
        y = parent.y + 154;
        while (tree.nodes.some(n => Math.abs(n.x - x) < 128 && Math.abs(n.y - y) < 128)) x += 160;
      }
      const id = SysmlModel.newId();
      if (parent) tree.connectors.push({ sourceId: id, targetId: parent.id });
      tree.nodes.push({ id, type: data.type, name: original?.name ?? labels[data.type], source, x, y });
    });
  }
  function draggable(button, data) {
    button.draggable = true;
    button.ondragstart = event => {
      const rect = button.getBoundingClientRect();
      event.dataTransfer.setData(mime, JSON.stringify({ ...data, dx: data.move ? event.clientX - rect.left : 0, dy: data.move ? event.clientY - rect.top : 0 }));
    };
  }
  canvas.ondragover = event => {
    if ((event.dataTransfer.types.includes(mime) || event.dataTransfer.types.includes(sysmlDragType))) event.preventDefault();
  };
  canvas.ondrop = event => {
    if (!(event.dataTransfer.types.includes(mime) || event.dataTransfer.types.includes(sysmlDragType))) return;
    event.preventDefault();
    let data;
    try {
      if (event.dataTransfer.types.includes(sysmlDragType)) {
        const item = JSON.parse(event.dataTransfer.getData(sysmlDragType));
        if (item.kind !== 'tree' || item.type !== 'element' || item.projectId !== project()?.id) return;
        data = { type: 'event', source: { modelId: item.modelId, nodeId: item.id }, dx: 0, dy: 0 };
      } else data = JSON.parse(event.dataTransfer.getData(mime));
    } catch { return; }
    const rect = canvas.getBoundingClientRect();
    const targetId = event.target.closest?.('.fta-node')?.dataset.nodeId;
    const parentId = data.source ? null : targetId ?? selectedNode;
    place(data, Math.max(0, (event.clientX - rect.left) / zoom - data.dx), Math.max(0, (event.clientY - rect.top) / zoom - data.dy), parentId, Boolean(targetId));
  };
  function render(p, switching, active) {
    locked = switching || !p;
    add.disabled = switching;
    const tree = diagram(p);
    links.replaceChildren();
    for (const item of p?.diagrams ?? []) {
      const button = sysmlButton(item.name, () => { selected = item.id; navigate('safety-fta'); });
      if (active && item === tree) button.setAttribute('aria-current', 'true');
      links.append(button);
    }
    if (!active || visibleTree !== tree?.id) {
      connecting = false;
      from = null;
      selectedNode = null;
    }
    visibleTree = tree?.id;
    if (!active) return;
    arrange.disabled = locked || !tree?.nodes.length;
    canvas.style.minWidth = Math.max(300, ...(tree?.nodes ?? []).map(n => n.x + 240)) + 'px';
    canvas.style.minHeight = Math.max(480, ...(tree?.nodes ?? []).map(n => n.y + 240)) + 'px';
    heading.textContent = tree?.name ?? (p ? 'FTA 1' : 'FTA · 프로젝트를 먼저 열어 주세요');
    canvas.replaceChildren();
    palette.replaceChildren(el('strong', '', '팔레트'));
    function tool(name, data) {
      const button = sysmlButton(name, () => {
        const count = tree?.nodes.length ?? 0;
        place(data, 20 + count % 3 * 145, 20 + Math.floor(count / 3) * 150);
      });
      button.prepend(symbol(data.type));
      button.disabled = locked;
      draggable(button, data);
      palette.append(button);
    }
    for (const [type, name] of Object.entries(labels)) tool(name, { type });
    const connect = sysmlButton('커넥터', () => {
      connecting = !connecting;
      from = null;
      updateConnectionTool();
    });
    const hint = el('small');
    function updateConnectionTool() {
      connect.setAttribute('aria-pressed', String(connecting));
      hint.textContent = connecting ? (from ? '자식 기호를 선택하세요.' : '부모 기호를 선택하세요.') : '';
    }
    connect.disabled = locked || !tree?.nodes.length;
    palette.append(connect, hint);
    if (from && !tree?.nodes.some(node => node.id === from)) {
      connecting = false;
      from = null;
    }
    updateConnectionTool();
    const ns = 'http://www.w3.org/2000/svg';
    const lines = document.createElementNS(ns, 'svg');
    lines.classList.add('fta-lines');
    canvas.append(lines);
    const positions = new Map((tree?.nodes ?? []).map(n => [n.id, { x: n.x, y: n.y }]));
    function drawLines() {
      lines.replaceChildren();
      for (const edge of tree?.connectors ?? []) {
        const child = positions.get(edge.sourceId);
        const parent = positions.get(edge.targetId);
        const upper = tree.nodes.find(n => n.id === edge.targetId);
        const gate = ['or', 'and', 'voting'].includes(upper.type);
        const endX = parent.x + 2 * (gate ? (child.x < parent.x ? 23 : 41) : 32);
        const endY = parent.y + 2 * (gate ? (upper.type === 'and' ? 51 : 47.615) : upper.type === 'event' && upper.role !== 'basic' ? 50 : 52);
        const middle = (child.y + 24 + endY) / 2;
        const path = document.createElementNS(ns, 'path');
        path.setAttribute('d', 'M' + (child.x + 64) + ' ' + (child.y + 24) + 'V' + middle + 'H' + endX + 'V' + endY);
        lines.append(path);
      }
    }
    drawLines();
    function updateInspector() {
      palette.querySelector('.fta-role')?.remove();
      const inspected = tree?.nodes.find(node => node.id === selectedNode);
      remove.disabled = locked || !inspected;
      if (!inspected) selectedNode = null;
      if (!inspected) return;
      const panel = el('div', 'fta-role');
      if (inspected.role) panel.append(el('strong', '', roles[inspected.role]));
      for (const [key, title] of [['name', '라벨'], ['fill', '채우기'], ['stroke', '테두리']]) {
        const label = el('label', '', title);
        const input = el('input');
        input.type = key === 'name' ? 'text' : 'color';
        input.value = inspected[key];
        input.maxLength = SysmlModel.limits.maxNameLength;
        input.onchange = () => {
          const value = input.value.trim() || inspected[key];
          edit(p => { diagram(p).nodes.find(n => n.id === inspected.id)[key] = value; });
        };
        label.append(input);
        panel.append(label);
      }
      if (inspected.type === 'event') {
        for (const [key, title] of [['probability', '확률 (0~1)'], ['failureRate', '고장률 λ (1/h)']]) {
          const label = el('label', '', title);
          const input = el('input');
          input.type = 'number';
          input.min = '0';
          if (key === 'probability') input.max = '1';
          input.step = 'any';
          input.placeholder = '미입력';
          input.value = inspected[key] ?? '';
          input.onchange = () => {
            if (!input.reportValidity()) {
              input.value = inspected[key] ?? '';
              return;
            }
            const value = input.value === '' ? null : input.valueAsNumber;
            edit(p => { diagram(p).nodes.find(n => n.id === inspected.id)[key] = value; });
          };
          label.append(input);
          panel.append(label);
        }
      }
      palette.append(panel);
    }
    updateInspector();
    for (const node of tree?.nodes ?? []) {
      const button = symbol(node.type, node.role, false);
      button.dataset.nodeId = node.id;
      button.removeAttribute('aria-hidden');
      button.classList.add('fta-node');
      button.setAttribute('role', 'button');
      button.setAttribute('tabindex', '0');
      let moved = false;
      function choose() {
        if (moved || locked) return;
        selectedNode = node.id;
        button.focus({ preventScroll: true });
        canvas.querySelector('[aria-pressed="true"]')?.setAttribute('aria-pressed', 'false');
        button.setAttribute('aria-pressed', 'true');
        updateInspector();
        if (!connecting) return;
        if (!from) from = node.id;
        else if (from !== node.id) {
          const parentId = from;
          from = null;
          connecting = false;
          edit(p => {
            const edges = diagram(p).connectors;
            if (edges.some(e => e.sourceId === node.id && e.targetId === parentId)) return;
            const ancestors = [parentId];
            const seen = new Set();
            for (let i = 0; i < ancestors.length; i++) {
              const id = ancestors[i];
              if (id === node.id) throw new Error('순환 연결은 만들 수 없습니다.');
              if (seen.has(id)) continue;
              seen.add(id);
              for (const edge of edges) if (edge.sourceId === id) ancestors.push(edge.targetId);
            }
            edges.push({ sourceId: node.id, targetId: parentId });
          });
        }
        updateConnectionTool();
      }
      button.onclick = choose;
      button.onkeydown = event => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          moved = false;
          choose();
        }
      };
      button.setAttribute('aria-pressed', String(node.id === selectedNode));
      button.setAttribute('aria-label', (roles[node.role] ?? labels[node.type]) + ' · ' + node.name);
      button.style.fill = node.fill;
      button.style.stroke = node.stroke;
      const caption = document.createElementNS(ns, 'text');
      caption.classList.add('fta-inner-label');
      const title = document.createElementNS(ns, 'title');
      title.textContent = node.name;
      const available = node.type === 'transfer' ? 22 : node.role === 'top' || node.role === 'intermediate' ? 50 : 33;
      const chars = Array.from(node.name);
      const maxChars = Math.floor(available / 5);
      const rows = [];
      while (chars.length && rows.length < 2) rows.push(chars.splice(0, maxChars).join(''));
      if (chars.length) rows[1] = rows[1].slice(0, -1) + '…';
      rows.forEach((row, i) => {
        const span = document.createElementNS(ns, 'tspan');
        span.setAttribute('x', '32');
        const center = node.type === 'transfer' ? 42 : node.type === 'voting' ? 38 : 33;
        span.setAttribute('y', center + 2 + (i - (rows.length - 1) / 2) * 6);
        span.textContent = row;
        caption.append(span);
      });
      button.append(title, caption);
      function position(x, y) {
        button.style.left = x + 'px';
        button.style.top = y + 'px';
        positions.set(node.id, { x, y });
      }
      position(node.x, node.y);
      button.onpointerdown = event => {
        if (event.button !== 0 || locked) return;
        moved = false;
        if (connecting) return;
        const rect = canvas.getBoundingClientRect();
        const dx = (event.clientX - rect.left) / zoom - node.x;
        const dy = (event.clientY - rect.top) / zoom - node.y;
        button.setPointerCapture(event.pointerId);
        button.onpointermove = move => {
          const bounds = canvas.getBoundingClientRect();
          const x = Math.max(0, Math.round((move.clientX - bounds.left) / zoom - dx));
          const y = Math.max(0, Math.round((move.clientY - bounds.top) / zoom - dy));
          if (!moved && Math.hypot(x - node.x, y - node.y) < 3) return;
          moved = true;
          position(x, y);
          drawLines();
        };
        button.onpointerup = button.onpointercancel = end => {
          button.onpointermove = button.onpointerup = button.onpointercancel = null;
          if (end.type === 'pointercancel') {
            position(node.x, node.y);
            drawLines();
          } else if (moved) {
            const point = positions.get(node.id);
            place({ move: node.id }, point.x, point.y);
          }
        };
      };
      button.ondblclick = () => {
        if (locked || connecting) return;
        const input = el('input', 'fta-inline-name');
        input.value = node.name;
        input.maxLength = SysmlModel.limits.maxNameLength;
        input.setAttribute('aria-label', '도형 라벨');
        input.style.left = (node.x + 16) + 'px';
        input.style.top = (node.y + 51) + 'px';
        canvas.append(input);
        input.focus();
        input.select();
        input.onblur = () => {
          const value = input.value.trim();
          input.remove();
          if (value && value !== node.name) edit(p => { diagram(p).nodes.find(n => n.id === node.id).name = value; });
        };
        input.onkeydown = event => {
          if (event.key === 'Escape') input.value = node.name;
          if (['Escape', 'Enter'].includes(event.key) && !event.isComposing) input.blur();
        };
      };
      canvas.append(button);
    }
  }
  return { element, navigation, render };
}
