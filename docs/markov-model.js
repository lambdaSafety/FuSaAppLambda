const MarkovModel = (() => {
  const maxStates = 80;
  const categories = { up: '작동', degraded: '성능 저하 · 작동', safe: '안전 불능', dangerous: '위험 불능' };
  const transitionKinds = { failure: '고장', repair: '복구', common: '공통원인', switch: '전환', inspection: '정기 검사' };
  const isUp = state => state.category === 'up' || state.category === 'degraded';
  const makeId = () => globalThis.crypto.randomUUID?.() ?? Array.from(globalThis.crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, '0')).join('');
  const number = (value, max = 1e12) => {
    if (!Number.isFinite(value) || value < 0 || value > max) throw new Error('수치 입력의 범위를 확인하세요.');
    return value;
  };
  const name = (value, fallback) => String(value ?? '').trim().slice(0, 120) || fallback;
  const choice = (value, choices, fallback) => Object.hasOwn(choices, value) ? value : fallback;

  function create(title = 'New Markov 모델') {
    return { id: makeId(), title, horizon: 1000, interval: 24, generator: {}, components: [], states: [], transitions: [], repairFrom: null };
  }

  function normalize(models = []) {
    if (!Array.isArray(models)) throw new Error('마코프 모델 목록이 올바르지 않습니다.');
    const modelIds = new Set();
    return models.map(raw => {
      if (typeof raw.id !== 'string' || modelIds.has(raw.id)) throw new Error('마코프 모델 ID를 확인하세요.');
      modelIds.add(raw.id);
      if (raw.states.length > maxStates) throw new Error(`다이어그램은 상태 ${maxStates}개까지 지원합니다.`);
      const ids = new Set();
      const states = raw.states.map(state => {
        if (typeof state.id !== 'string' || ids.has(state.id)) throw new Error('마코프 상태 ID를 확인하세요.');
        ids.add(state.id);
        return { id: state.id, title: name(state.title, '상태'), category: choice(state.category, categories, 'up'),
          description: String(state.description ?? '').slice(0, 4000),
          width: Math.max(72, number(state.width ?? 190, 800)), height: Math.max(40, number(state.height ?? 94, 600)),
          initial: number(state.initial ?? 0, 1),
          absorbing: Boolean(state.absorbing), x: number(state.x ?? 0, 250000), y: number(state.y ?? 0, 250000) };
      });
      const edgeIds = new Set();
      const transitions = raw.transitions.map(edge => {
        if (typeof edge.id !== 'string' || edgeIds.has(edge.id) || edge.sourceId === edge.targetId ||
            !ids.has(edge.sourceId) || !ids.has(edge.targetId)) throw new Error('마코프 전이 ID와 시작·대상 상태를 확인하세요.');
        edgeIds.add(edge.id);
        return { id: edge.id, sourceId: edge.sourceId, targetId: edge.targetId, title: name(edge.title, ''),
          kind: choice(edge.kind, transitionKinds, 'failure'), rate: number(edge.rate ?? 0),
          interval: number(edge.interval ?? 0), coverage: number(edge.coverage ?? 1, 1) };
      });
      const componentIds = new Set();
      const components = raw.components.map(component => {
        if (typeof component.id !== 'string' || componentIds.has(component.id)) throw new Error('구성 요소 ID를 확인하세요.');
        componentIds.add(component.id);
        return { id: component.id, title: name(component.title, '구성 요소'),
          modelId: typeof component.modelId === 'string' ? component.modelId : null,
          nodeId: typeof component.nodeId === 'string' ? component.nodeId : null,
          failure: number(component.failure ?? 0), repair: number(component.repair ?? 0) };
      });
      const options = raw.generator ?? {};
      const generator = {
        mode: ['independent', 'aggregate', 'fifo', 'degraded'].includes(options.mode) ? options.mode : 'independent',
        needed: options.needed == null ? null : number(options.needed, 79),
        teams: options.teams == null ? null : number(options.teams, 79),
        commonFailure: number(options.commonFailure ?? 0), commonRepair: number(options.commonRepair ?? 0),
        down: options.down === 'safe' ? 'safe' : 'dangerous'
      };
      return { id: raw.id, generator, title: name(raw.title, 'Markov 모델'), horizon: number(raw.horizon ?? 1000),
        interval: number(raw.interval ?? 24), components, states, transitions,
        repairFrom: ids.has(raw.repairFrom) ? raw.repairFrom : null };
    });
  }

  function addState(model, title, category = 'up', point) {
    const i = model.states.length;
    const state = { id: makeId(), title, category, description: '', initial: i === 0 ? 1 : 0, absorbing: false,
      x: point?.x ?? 30 + (i % 4) * 240, y: point?.y ?? 35 + Math.floor(i / 4) * 145 };
    model.states.push(state);
    return state.id;
  }

  function addTransition(model, sourceId, targetId, kind = 'failure', fields = {}) {
    const edge = { id: makeId(), sourceId, targetId, kind, title: '', rate: 0, interval: 0, coverage: 1, ...fields };
    model.transitions.push(edge);
    return edge.id;
  }

  function addComponent(model, source, title) {
    if (source && model.components.some(item => item.modelId === source.modelId && item.nodeId === source.nodeId)) return;
    model.components.push({ id: makeId(), title, ...source, failure: 0.0005, repair: 0.25 });
  }

  function generate(model, options) {
    const { mode, needed, teams, commonFailure, commonRepair, down } = options;
    const elements = model.components;
    const n = elements.length;
    if (!n) throw new Error('먼저 시스템 엘리먼트 또는 독립 구성 요소를 추가하세요.');
    if (!Number.isInteger(needed) || needed < 1 || needed > n ||
        !Number.isInteger(teams) || teams < 1 || teams > n) throw new Error('필요 작동 수와 복구팀 수를 확인하세요.');
    model.states = [];
    model.transitions = [];
    model.repairFrom = null;
    const add = (title, failed, row) => addState(model, title, n - failed < needed ? down : failed ? 'degraded' : 'up',
      { x: 30 + 235 * failed, y: 35 + 130 * row });
    const edge = (from, to, kind, rate, title = '') => {
      if (rate > 0) addTransition(model, from, to, kind, { rate, title });
    };
    const [first, second] = elements;
    let full;
    if (mode === 'degraded') {
      if (n !== 1) throw new Error('단일 요소 성능 저하 예제에는 구성 요소 하나가 필요합니다.');
      full = addState(model, '정상 작동', 'up', { x: 30, y: 35 });
      const degraded = addState(model, '성능 저하', 'degraded', { x: 270, y: 35 });
      const failed = addState(model, '불능', down, { x: 510, y: 35 });
      edge(full, degraded, 'failure', first.failure, 'λ₁');
      edge(degraded, full, 'repair', first.repair, 'μ₁');
      edge(degraded, failed, 'failure', first.failure, 'λ₂');
      edge(failed, degraded, 'repair', first.repair, 'μ₂');
    } else if (mode === 'fifo') {
      if (n !== 2) throw new Error('FIFO 예제에는 구성 요소 두 개가 필요합니다.');
      full = add('정상 작동', 0, 0);
      const a = add(first.title + ' 고장', 1, 0);
      const b = add(second.title + ' 고장', 1, 1);
      const ab = add(first.title + ' 먼저 고장', 2, 0);
      const ba = add(second.title + ' 먼저 고장', 2, 1);
      edge(full, a, 'failure', first.failure); edge(full, b, 'failure', second.failure);
      edge(a, full, 'repair', first.repair); edge(b, full, 'repair', second.repair);
      edge(a, ab, 'failure', second.failure); edge(b, ba, 'failure', first.failure);
      edge(ab, b, 'repair', first.repair); edge(ba, a, 'repair', second.repair);
    } else if (mode === 'aggregate') {
      if (n >= maxStates || elements.some(item => item.failure !== first.failure || item.repair !== first.repair)) {
        throw new Error('집약 모델은 동일한 고장률·복구율을 가진 요소에서 사용할 수 있습니다.');
      }
      const states = Array.from({ length: n + 1 }, (_, i) => add(i + '개 고장', i, 0));
      [full] = states;
      for (let i = 0; i < n; i++) {
        edge(states[i], states[i + 1], 'failure', (n - i) * first.failure, `${n - i}λ`);
        edge(states[i + 1], states[i], 'repair', Math.min(i + 1, teams) * first.repair, `${Math.min(i + 1, teams)}μ`);
      }
    } else {
      if (n > 6) throw new Error('독립 상태 열거는 요소 6개까지 지원합니다. 동일 요소는 상태 집약을 사용하세요.');
      const positions = Array(n + 1).fill(0);
      const states = Array.from({ length: 2 ** n }, (_, mask) => {
        const failed = elements.filter((_, i) => mask & (1 << i));
        return add(failed.length ? failed.map(item => item.title).join(', ') + ' 고장' : '정상 작동',
          failed.length, positions[failed.length]++);
      });
      [full] = states;
      for (let mask = 0; mask < states.length; mask++) {
        let available = teams;
        for (const [i, component] of elements.entries()) {
          const bit = 1 << i;
          if (!(mask & bit)) edge(states[mask], states[mask | bit], 'failure', component.failure, component.title);
          else if (available > 0 && component.repair > 0) {
            edge(states[mask], states[mask ^ bit], 'repair', component.repair, component.title);
            available--;
          }
        }
      }
    }
    if (commonFailure > 0) {
      const common = addState(model, '공통원인 불능', down, { x: 30 + 235 * Math.max(n + 1, 3), y: 35 });
      edge(full, common, 'common', commonFailure, 'λC');
      edge(common, full, 'repair', commonRepair, 'μC');
    }
  }

  return { maxStates, categories, transitionKinds, isUp, create, normalize, addState, addTransition, addComponent, generate };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = MarkovModel;

