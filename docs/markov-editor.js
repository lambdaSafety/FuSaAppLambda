function createMarkovEditor(userId, projectData) {
  const { categories, transitionKinds } = MarkovModel;
  const el = sysmlElement;
  const button = sysmlButton;
  const element = el('section', 'markov-editor');
  const status = el('p', 'sysml-prompt');
  status.setAttribute('role', 'status');
  const body = el('div', 'markov-content');
  const results = el('div', 'markov-results');
  element.append(status, body, results);
  let models = structuredClone(projectData.read('markov') ?? []);
  let modelId = models[0]?.id;
  let selected = null;
  let linkSource = null;
  let linking = false;
  let componentTitle = '';
  let result = null;

  const canvas = createSysmlCanvas({
    nodeTypes: { markov: { label: '마코프 상태' } },
    kindIcon: () => document.createDocumentFragment(),
    dragKinds: ['tree'],
    emptyMessage: '왼쪽 시스템 모델에서 엘리먼트를 끌어 놓은 뒤 상태를 생성하거나, 상태를 직접 추가하세요.',
    onDrop(item) {
      if (item.type !== 'element') { setStatus('시스템 엘리먼트를 끌어 놓으세요.'); return; }
      const original = projectData.systemElement(item.modelId, item.id, item.projectId);
      if (!original) { setStatus('현재 프로젝트의 시스템 엘리먼트를 선택하세요.'); return; }
      update(draft => MarkovModel.addComponent(draft, { modelId: item.modelId, nodeId: item.id }, original.name));
    },
    onSelect(item) {
      if (linking && item?.kind === 'node') {
        linkSource = item.id;
        paint();
      } else {
        selected = item;
        draw();
      }
    },
    onConnect(source, target) {
      if (source === target) { setStatus('시작과 도착 상태를 다르게 선택하세요.'); return; }
      if (update(draft => MarkovModel.addTransition(draft, source, target, 'failure', { rate: 0.0005 }),
        id => { selected = { kind: 'edge', id }; linking = false; linkSource = null; })) setStatus('전이 속성에서 구체적인 전이율을 지정하세요.');
    },
    onLinkCancelled() { linking = false; linkSource = null; draw(); },
    onCanvasMenu(event, id, point, edgeId) {
      selected = edgeId ? { kind: 'edge', id: edgeId } : id ? { kind: 'node', id } : null;
      draw();
    },
    onMove(id, point) { update(draft => Object.assign(draft.states.find(state => state.id === id), point)); },
    onResize(id, size) { update(draft => Object.assign(draft.states.find(state => state.id === id), size)); }
  });
  canvas.element.classList.add('markov-canvas');

  function model() { return models.find(item => item.id === modelId); }
  function setStatus(text) {
    status.textContent = text;
    status.hidden = !text;
  }

  function commit(updateModels, after, redraw = true) {
    try {
      const draft = structuredClone(models);
      const value = updateModels(draft);
      const normalized = MarkovModel.normalize(draft);
      if (!projectData.write('markov', normalized)) throw Error('프로젝트 초안에 반영할 수 없습니다.');
      models = normalized;
      after?.(value);
      result = null;
      setStatus('');
      if (redraw) draw();
      else {
        paint();
        results.replaceChildren();
      }
      return true;
    } catch (error) {
      setStatus(error.message);
      return false;
    }
  }
  function update(change, after, redraw) {
    const id = model()?.id;
    if (!id) return false;
    return commit(draft => change(draft.find(item => item.id === id)), after, redraw);
  }
  function switchModel(id) {
    modelId = id;
    selected = null;
    linkSource = null;
    linking = false;
    result = null;
    draw();
  }

  function createExample(key) {
    const examples = {
      empty: ['New Markov 모델', 0, 'independent', 1, 1],
      single: ['B.1 · 단일 요소', 1, 'independent', 1, 1],
      degraded: ['B.2–B.4 · 성능 저하 및 직접 고장', 1, 'degraded', 1, 1],
      dual: ['C · 1oo2 능동 중복', 2, 'aggregate', 1, 2],
      common: ['B.8 · 1oo2 공통원인고장', 2, 'independent', 1, 2],
      fifo: ['B.9 · 1oo2 FIFO 복구', 2, 'fifo', 1, 1],
      aggregate: ['B.3 · 2oo4 집약', 4, 'aggregate', 2, 4],
      monitored: ['정기 검사 · 잠재 고장', 1, 'independent', 1, 1]
    };
    const [title, n, mode, needed, teams] = examples[key];
    commit(draft => {
      const next = MarkovModel.create(title);
      for (let i = 0; i < n; i++) MarkovModel.addComponent(next, null, `요소 ${i + 1}`);
      if (key === 'monitored') {
        next.horizon = 168;
        const up = MarkovModel.addState(next, '작동');
        const latent = MarkovModel.addState(next, '잠재 위험 고장', 'dangerous');
        const isolated = MarkovModel.addState(next, '검출·격리', 'safe');
        MarkovModel.addTransition(next, up, latent, 'failure', { rate: 0.0005 });
        MarkovModel.addTransition(next, latent, isolated, 'inspection', { coverage: 1 });
        MarkovModel.addTransition(next, isolated, up, 'repair', { rate: 0.25 });
      } else if (n) {
        const failure = ['common', 'degraded'].includes(key) ? 0.00005 : 0;
        next.generator = { mode, needed, teams, commonFailure: failure, commonRepair: 0.1, down: 'dangerous' };
        MarkovModel.generate(next, next.generator);
      }
      draft.push(next);
      return next.id;
    }, id => {
      modelId = id;
      selected = null;
      linkSource = null;
      linking = false;
    });
  }

  function field(container, label, control) {
    const wrapper = el('label', 'sysml-field', label);
    wrapper.append(control);
    container.append(wrapper);
    return control;
  }
  function pick(values, current, onChange) {
    const control = el('select');
    for (const [value, text] of values) control.add(new Option(text, value));
    control.value = current;
    control.addEventListener('change', () => onChange(control.value));
    return control;
  }
  function number(value, onChange, { max = 1e12, integer = false } = {}) {
    const control = el('input');
    control.type = 'number';
    control.step = integer ? '1' : 'any';
    control.min = 0;
    control.max = max;
    control.required = true;
    control.value = value;
    control.addEventListener('change', () => {
      if (control.reportValidity()) onChange(control.valueAsNumber);
    });
    return control;
  }
  function text(value, onChange, multiline = false) {
    const control = el(multiline ? 'textarea' : 'input');
    control.value = value;
    control.maxLength = multiline ? 4000 : 120;
    control.addEventListener('change', () => onChange(control.value));
    return control;
  }
  function check(value, onChange) {
    const control = el('input');
    control.type = 'checkbox';
    control.checked = value;
    control.addEventListener('change', () => onChange(control.checked));
    return control;
  }

  function componentPanel(current) {
    const panel = el('details', 'markov-panel');
    panel.open = true;
    panel.append(el('summary', '', '구성 요소와 상태 생성'));
    const manual = el('div', 'sysml-actions');
    const input = el('input');
    input.value = componentTitle;
    input.placeholder = '독립 구성 요소 이름';
    input.setAttribute('aria-label', '독립 구성 요소 이름');
    input.addEventListener('input', () => { componentTitle = input.value; });
    manual.append(input, button('구성 요소 추가', () => {
      const title = input.value.trim();
      if (title) update(draft => MarkovModel.addComponent(draft, null, title), () => { componentTitle = ''; });
    }));
    panel.append(manual);
    for (const component of current.components) {
      const line = el('div', 'markov-component');
      const source = component.nodeId ? projectData.systemElement(component.modelId, component.nodeId) : null;
      line.append(el('strong', '', (source?.name ?? component.title) + (component.nodeId && !source ? ' · 원본 없음' : '')));
      const set = (key, value) => update(draft => { draft.components.find(item => item.id === component.id)[key] = value; }, undefined, false);
      field(line, '고장률 λ (/h)', number(component.failure, value => set('failure', value)));
      field(line, '복구율 μ (/h)', number(component.repair, value => set('repair', value)));
      line.append(button('제거', () => update(draft => { draft.components = draft.components.filter(item => item.id !== component.id); })));
      panel.append(line);
    }
    const setup = el('div', 'markov-fields');
    const count = current.components.length;
    const options = current.generator;
    const setOption = (key, value) => update(draft => { draft.generator[key] = value; }, undefined, false);
    field(setup, '구성', pick([
      ['independent', '독립 요소 · k-out-of-n'], ['aggregate', '동일 요소 · 상태 집약'],
      ['fifo', '두 요소 · FIFO 복구'], ['degraded', '단일 요소 · 성능 저하']
    ], options.mode, value => setOption('mode', value)));
    field(setup, '필요 작동 요소 수', number(options.needed ?? Math.max(1, count), value => setOption('needed', value), { max: 79, integer: true }));
    field(setup, '복구팀 수', number(options.teams ?? Math.max(1, count), value => setOption('teams', value), { max: 79, integer: true }));
    field(setup, '시스템 불능 분류', pick([['dangerous', '위험 불능'], ['safe', '안전 불능']], options.down, value => setOption('down', value)));
    field(setup, '공통원인 고장률 λC (/h)', number(options.commonFailure, value => setOption('commonFailure', value)));
    field(setup, '공통원인 복구율 μC (/h)', number(options.commonRepair, value => setOption('commonRepair', value)));
    panel.append(setup, button('상태와 전이 생성', () => {
      if (current.states.length && !window.confirm('현재 상태와 전이를 구성 요소 입력으로 다시 생성할까요?')) return;
      update(draft => {
        for (const item of draft.components) {
          if (item.nodeId) item.title = projectData.systemElement(item.modelId, item.nodeId)?.name ?? item.title;
        }
        MarkovModel.generate(draft, { ...draft.generator, needed: draft.generator.needed ?? count, teams: draft.generator.teams ?? count });
      }, () => { selected = null; linking = false; linkSource = null; });
    }));
    panel.append(el('p', '', '독립 상태 모델에서 복구 자원이 모자라면 위에서 먼저 추가한 요소에 우선권을 부여합니다. 생성 후 전이를 개별 편집할 수 있습니다.'));
    return panel;
  }

  function inspector(current) {
    const panel = el('aside', 'markov-panel markov-inspector');
    const state = selected?.kind === 'node' ? current.states.find(item => item.id === selected.id) : null;
    const edge = selected?.kind === 'edge' ? current.transitions.find(item => item.id === selected.id) : null;
    if (state) {
      panel.append(el('h3', '', '상태 속성'));
      const set = (key, value) => update(draft => { draft.states.find(item => item.id === state.id)[key] = value; });
      field(panel, '이름', text(state.title, value => set('title', value)));
      field(panel, '설명', text(state.description, value => set('description', value), true));
      field(panel, '분류', pick(Object.entries(categories), state.category, value => set('category', value)));
      field(panel, '초기 확률 가중치', number(state.initial, value => set('initial', value), { max: 1 }));
      field(panel, '흡수 상태', check(state.absorbing, value => set('absorbing', value)));
      panel.append(button('상태 삭제', () => update(draft => {
        draft.states = draft.states.filter(item => item.id !== state.id);
        draft.transitions = draft.transitions.filter(item => item.sourceId !== state.id && item.targetId !== state.id);
        if (!draft.states.some(item => item.initial > 0) && draft.states.length) draft.states[0].initial = 1;
      }, () => { selected = null; })));
    } else if (edge) {
      panel.append(el('h3', '', '전이 속성'));
      const states = current.states.map(item => [item.id, item.title]);
      const set = (key, value) => update(draft => { draft.transitions.find(item => item.id === edge.id)[key] = value; });
      field(panel, '출발 상태', pick(states, edge.sourceId, value => set('sourceId', value)));
      field(panel, '도착 상태', pick(states, edge.targetId, value => set('targetId', value)));
      field(panel, '이름 또는 기호', text(edge.title, value => set('title', value)));
      field(panel, '전이 유형', pick(Object.entries(transitionKinds), edge.kind, value => set('kind', value)));
      if (edge.kind === 'inspection') {
        field(panel, '검사 간격 (h) · 0이면 모델 기본값', number(edge.interval, value => set('interval', value)));
        field(panel, '검사 시 전이 확률', number(edge.coverage, value => set('coverage', value), { max: 1 }));
      } else field(panel, '전이율 (/h)', number(edge.rate, value => set('rate', value)));
      panel.append(button('전이 삭제', () => update(draft => {
        draft.transitions = draft.transitions.filter(item => item.id !== edge.id);
      }, () => { selected = null; })));
    } else panel.append(el('p', 'sysml-prompt', '상태 또는 전이선을 선택해서 속성을 편집하세요.'));
    return panel;
  }

  function paint() {
    const current = model();
    if (!current) return;
    const styles = {
      up: ['#e4f4ed', '#276b53'], degraded: ['#fef3d9', '#99651f'],
      safe: ['#e9eef6', '#526783'], dangerous: ['#fce7e5', '#a52e30']
    };
    canvas.render({
      model: { id: current.id, nodes: current.states.map((state, index) => ({
        ...state, type: 'markov', fill: styles[state.category][0], stroke: styles[state.category][1],
        name: `S${index} · ${state.title}`,
        text: [categories[state.category], state.absorbing ? '흡수' : '', state.initial > 0 ? '초기 ' + state.initial : '', state.description].filter(Boolean).join(' · ')
      })), connectors: current.transitions.map(edge => ({
        ...edge, name: `${edge.title || transitionKinds[edge.kind]} · ${edge.kind === 'inspection'
          ? `${edge.interval || current.interval} h / ${edge.coverage}` : `${edge.rate} /h`}`,
        relation: 'dependency', solid: edge.kind !== 'inspection',
        arrowhead: 'filled', color: edge.kind === 'repair' ? '#246956' : edge.kind === 'inspection' ? '#5855a5' : '#8e4c37'
      })) }, selection: selected, connectFrom: linkSource, linking
    });
  }

  function chart(series) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 700 258');
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', '시간별 가용도, 최초 고장 확률, PFD와 정비도');
    function add(tag, attributes, content) {
      const node = document.createElementNS(svg.namespaceURI, tag);
      for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value);
      if (content !== undefined) node.textContent = content;
      svg.append(node);
    }
    for (const value of [0, .25, .5, .75, 1]) {
      const y = 222 - 194 * value;
      add('line', { x1: 58, y1: y, x2: 674, y2: y, stroke: '#dce7e8' });
      add('text', { x: 48, y: y + 4, 'text-anchor': 'end', fill: '#47636d', 'font-size': 12 }, value);
    }
    const end = series.at(-1).time;
    for (const [key, color] of [['availability', '#0b725e'], ['firstFailure', '#a42f35'], ['pfd', '#8a5b16'], ['maintainability', '#365fa2']]) {
      if (series[0][key] === null) continue;
      add('polyline', { points: series.map(sample => `${58 + 616 * (end ? sample.time / end : 0)},${222 - 194 * sample[key]}`).join(' '),
        fill: 'none', stroke: color, 'stroke-width': 2.5 });
    }
    add('text', { x: 58, y: 246, fill: '#47636d', 'font-size': 12 }, '0 h');
    add('text', { x: 674, y: 246, 'text-anchor': 'end', fill: '#47636d', 'font-size': 12 }, end + ' h');
    return svg;
  }

  function renderResults(current) {
    results.replaceChildren();
    if (!result) return;
    const format = value => value === null ? '산출 불가' : value === Infinity ? '∞' : Number(value.toPrecision(6)).toString();
    const metrics = [
      ['가용도 A(t)', result.availability], ['평균 가용도', result.avgAvailability],
      ['신뢰도 R(t)', result.reliability], ['최초 고장 확률 F(t)', result.unreliability],
      ['최초 고장 평균 MTTFF (h)', result.mttff], ['임무 시간 내 제한 평균 수명 (h)', result.restrictedLifetime],
      ['최초 고장 P10 / P50 / P90 (h)', [result.p10, result.median, result.p90].map(format).join(' / ')],
      ['첫 복구 확률 M(t)', result.maintainability], ['첫 복구 평균 (h)', result.mttr],
      ['순간 PFD', result.pfd], ['평균 PFD', result.avgPfd],
      ['최초 위험 상태 도달 확률', result.firstDanger], ['최초 위험 고장 평균 MTTFH (h)', result.mttfh],
      ['연속 위험 고장률 DFR (/h)', result.hazardRate], ['순간 시스템 고장강도 (/h)', result.entering],
      ['정상상태 가용도', result.steadyAvailability], ['정상상태 구간 신뢰도', result.intervalReliability],
      ['정상상태 고장빈도 (/h)', result.steadyFailure],
      ['평균 작동 시간 MUT (h)', result.mut], ['평균 불능 시간 MDT (h)', result.mdt]
    ];
    const stats = el('dl', 'markov-metrics');
    for (const [label, value] of metrics) {
      const item = el('div');
      item.append(el('dt', '', label), el('dd', '', typeof value === 'string' ? value : format(value)));
      stats.append(item);
    }
    const notes = result.periodic
      ? (result.commonPeriod
        ? '동일한 검사 주기가 반복될 때 첫 고장·복구 평균을 계산합니다. 검사 주기 모델에서 정상상태 지표는 표시하지 않습니다.'
        : '검사 주기가 서로 다르면 임무 구간 지표만 계산합니다.')
      : '최초 고장 분석은 불능 상태를 흡수 상태로 처리합니다. 정상상태 지표는 유일한 정상상태 해가 있을 때 표시합니다.';
    results.append(el('h2', '', '분석 결과 · ' + current.horizon + ' h'), el('p', '', notes),
      el('p', '', '고장 시간 분위수는 조회 구간 안에서 선형 보간한 값입니다. 표본 곡선에서 도달하지 않은 분위수는 산출 불가로 표시합니다.'), stats,
      el('p', '', '초록 가용도 · 빨강 최초 고장 확률 · 갈색 PFD · 파랑 정비도'), chart(result.series));
    const table = el('table', 'markov-table');
    const head = table.createTHead().insertRow();
    for (const label of ['상태', '임무 종료 확률', '정상상태 확률', '평균 체류 (h)', '순간 진입 (/h)', '순간 이탈 (/h)']) head.append(el('th', '', label));
    current.states.forEach((state, i) => {
      const row = table.insertRow();
      const values = [state.title, format(result.probabilities[i]), format(result.equilibrium?.[i] ?? null),
        format(result.exit[i] ? 1 / result.exit[i] : Infinity), format(result.enterFlow[i]), format(result.exitFlow[i])];
      for (const value of values) row.insertCell().textContent = value;
    });
    const scroll = el('div', 'markov-table-scroll');
    scroll.append(table);
    results.append(scroll);
  }

  function draw() {
    const current = model();
    body.replaceChildren();
    const toolbar = el('div', 'sysml-actions');
    const names = models.map(item => [item.id, item.title]);
    if (names.length) field(toolbar, '마코프 모델', pick(names, modelId, switchModel));
    const examples = pick([
      ['empty', '빈 다이어그램'], ['single', 'B.1 · 단일 요소'], ['degraded', 'B.2–B.4 · 성능 저하'],
      ['dual', 'C · 1oo2 능동 중복'], ['common', 'B.8 · 공통원인고장'], ['fifo', 'B.9 · FIFO 복구'],
      ['aggregate', 'B.3 · 2oo4 상태 집약'], ['monitored', '정기 검사 · 잠재 고장']
    ], 'empty', () => {});
    field(toolbar, '모델 시작점', examples);
    toolbar.append(button('마코프 모델 추가', () => createExample(examples.value), { icon: 'plus' }));
    body.append(toolbar);
    if (!current) {
      body.append(el('p', 'sysml-prompt', '빈 다이어그램이나 IEC 61165 예제로 시작하세요.'));
      results.replaceChildren();
      return;
    }
    field(toolbar, '이름', text(current.title, value => update(draft => { draft.title = value; })));
    toolbar.append(button('모델 삭제', () => {
      if (!window.confirm(`‘${current.title}’ 모델을 삭제할까요?`)) return;
      commit(draft => { draft.splice(draft.findIndex(item => item.id === current.id), 1); return draft[0]?.id; },
        id => { modelId = id; selected = null; linking = false; linkSource = null; });
    }, { className: 'sysml-delete' }));
    const settings = el('div', 'markov-fields');
    field(settings, '임무 시간 (h)', number(current.horizon, value => update(draft => { draft.horizon = value; }, undefined, false)));
    field(settings, '기본 검사 간격 (h)', number(current.interval, value => update(draft => { draft.interval = value; }, undefined, false)));
    const down = current.states.filter(state => !MarkovModel.isUp(state));
    field(settings, '정비도 시작 상태', pick([['', '첫 번째 불능 상태'], ...down.map(state => [state.id, state.title])],
      current.repairFrom ?? '', id => update(draft => { draft.repairFrom = id || null; })));
    body.append(settings, componentPanel(current));
    const graphTools = el('div', 'sysml-actions');
    graphTools.append(button('상태 추가', () => update(draft => MarkovModel.addState(draft, '새 상태'),
      id => { selected = { kind: 'node', id }; })), button(linking ? '전이 연결 취소' : '전이 연결', () => {
      linking = !linking;
      linkSource = null;
      setStatus(linking ? '출발 상태와 도착 상태를 차례대로 선택하세요.' : '');
      draw();
    }), button('분석 실행', () => {
      try { result = MarkovAnalysis.analyze(model()); setStatus(''); renderResults(model()); }
      catch (error) { result = null; results.replaceChildren(); setStatus(error.message); }
    }, { className: 'sysml-primary' }));
    const grid = el('div', 'markov-grid');
    grid.append(canvas.element, inspector(current));
    body.append(graphTools, grid);
    paint();
    renderResults(current);
  }
  draw();
  return element;
}

