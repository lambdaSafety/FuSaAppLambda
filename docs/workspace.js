const workspaceMenu = [
  {
    id: 'projects',
    title: '프로젝트',
    description: '시스템 모델과 안전분석 문서를 프로젝트 단위로 관리하는 작업공간입니다.',
    links: ['sysml', 'hara', 'fmea', 'fmeca', 'fmeda', 'fta']
  },
  {
    id: 'checklist',
    title: '체크리스트',
    description: '모델과 분석 결과의 검토 상태와 근거를 기록합니다.',
    features: ['검토 대상과 대상 리비전 지정', '충족·미충족 판단과 근거 기록'],
    links: ['requirements']
  },
  {
    title: '시스템',
    icon: '▦',
    children: [
      {
        id: 'sysml',
        title: 'SysML',
        description: ''
      }
    ]
  },
  {
    title: '리스크 결정',
    icon: '△',
    children: [
      { id: 'risk-agpl', title: 'ISO 25119 · AgPLr', createContent: () => riskPage('risk-agpl') },
      { id: 'risk-pl', title: 'ISO 13849 · PLr', createContent: () => riskPage('risk-pl') },
      { id: 'risk-sil', title: 'IEC 61508 · SIL', createContent: () => riskPage('risk-sil') },
      { id: 'hara', title: 'ISO 26262 · HARA / ASIL', createContent: () => riskPage('hara'), links: ['requirements', 'fmea'] },
      { id: 'risk-msil', title: 'ISO 26262-12 · MSIL', createContent: () => riskPage('risk-msil') },
      { id: 'risk-dal', title: 'ARP4761 · FHA / DAL', createContent: () => riskPage('risk-dal') }
    ]
  },
  {
    title: '안전 분석',
    icon: '◇',
    children: [
      {
        id: 'fmea',
        title: 'FMEA',
        description: '고장 모드별 원인, 영향과 조치를 검토하는 워크시트입니다.',
        createContent: createFmeaWorksheet,
        links: ['sysml', 'fmeca', 'fta']
      },
      {
        id: 'fmeca',
        title: 'FMECA',
        description: '고장 모드와 영향 분석을 바탕으로 각 고장의 치명도를 평가합니다.',
        features: ['FMEA 행과 치명도 평가 연결', '평가 기준, 근거와 우선순위 기록'],
        links: ['fmea', 'fmeda']
      },
      {
        id: 'fmeda',
        title: 'FMEDA',
        description: '하드웨어 고장률과 진단 효과를 고장 모드별로 검토합니다.',
        features: ['부품 고장률·모드 비율·출처 기록', '진단 커버리지에 따른 검출·미검출 고장률 확인'],
        links: ['sysml', 'fta', 'mission-profile']
      },
      { id: 'safety-fta', title: 'FTA', description: '최상위 사건을 일으키는 기본사상의 조합을 고장 트리로 분석합니다.' },
      { id: 'safety-rbd', title: 'RBD', description: '신뢰성 블록도로 시스템이 기능을 수행하는 데 필요한 구성요소의 관계를 나타냅니다.' },
      { id: 'safety-markov', title: '마코프', description: '시스템의 정상·고장 상태와 상태 사이의 전이를 모델링합니다.' }
    ]
  },
  {
    title: '공학 통계',
    icon: 'Σ',
    children: [
      {
        id: 'basic-probability', createContent: () => learningPage('basic-probability'),
        title: '기본 확률',
        description: '사건의 여사건, 합사건과 교사건 확률을 살펴봅니다.',
        links: ['exponential-distribution', 'conditional-probability', 'bayes']
      },
      {
        id: 'conditional-probability', createContent: () => learningPage('conditional-probability'),
        title: '조건부 확률',
        description: '주어진 조건 아래에서 사건이 발생할 확률을 살펴봅니다.',
        links: ['basic-probability', 'bayes']
      },
      {
        id: 'bayes', createContent: () => learningPage('bayes'),
        title: '베이즈 정리',
        description: '관측 정보를 반영해 사건의 사전확률을 사후확률로 갱신합니다.',
        links: ['conditional-probability']
      },
      {
        id: 'distributions', createContent: () => learningPage('distributions'),
        title: '확률 분포 개요',
        description: '분포 모수에 따라 관측값이나 고장 확률이 어떻게 달라지는지 살펴봅니다.',
        links: ['dist-count', 'dist-life', 'dist-inference']
      },
      { id: 'dist-count', title: '이산/횟수 분포', createContent: () => createDistributionLab('count') },
      { id: 'dist-life', title: '수명/고장 분포', createContent: () => createDistributionLab('life') },
      { id: 'dist-inference', title: '추론/검정 분포', createContent: () => createDistributionLab('inference') },
      { id: 'law-large-numbers', createContent: () => learningPage('law-large-numbers'), title: '큰수의 법칙', links: ['monte-carlo'] },
      {
        id: 'descriptive-statistics', createContent: () => learningPage('descriptive-statistics'),
        title: '통계적 추정과 검정',
        description: '표본으로 모평균의 신뢰구간을 추정하고 목표 평균과의 차이를 검정합니다.',
        links: ['distributions']
      }
    ]
  },
  {
    title: '확률과정·시뮬레이션',
    icon: '∼',
    children: [
      { id: 'stochastic-processes', createContent: () => learningPage('stochastic-processes'), title: '확률과정 개요' },
      { id: 'poisson-process', createContent: () => learningPage('poisson-process'), title: '포아송 과정' },
      { id: 'random-walk', createContent: () => learningPage('random-walk'), title: '랜덤 워크' },
      { id: 'markov-process', createContent: () => learningPage('markov-process'), title: '마르코프 과정' },
      { id: 'monte-carlo', title: '몬테카를로 시뮬레이션', createContent: createMonteCarlo }
    ]
  },
  {
    title: '신뢰성 공학',
    icon: 'λ',
    children: [
      {
        id: 'exponential-distribution',
        title: '지수분포1',
        description: '고장률과 임무 시간을 입력해 비수리, 수리, 주기 검사 모델의 확률과 고장 빈도를 비교합니다.',
        createContent: createExpoCalculator
      },
      {
        id: 'fta',
        title: '지수분포2',
        description: '기본사상과 OR·AND 최상위사상의 고장 확률과 빈도를 계산합니다.',
        createContent: createFtaCalculators,
        features: [
          '고장 트리 편집기에서 AND·OR 게이트와 기본사상 재사용 지원',
          'FTA 결과에서 최소 컷셋과 최상위사상 확률 확인',
          '후속 지원 범위에 k-out-of-n 게이트 포함'
        ],
        links: ['fmeda', 'mission-profile', 'exponential-distribution']
      },
      {
        id: 'ft-event',
        title: 'FT이벤트',
        description: '독립인 비수리 기본 이벤트 두 개를 조합해 OR·AND 최상위사상(TLE)의 확률과 순간 고장 빈도를 비교합니다.',
        createContent: createFtEventCalculator
      },
      {
        id: 'repair-integrals',
        title: 'Q(t), W(t)',
        description: '수리 가능한 지수 분포 이벤트 하나에 대해 임무 시작부터 T까지의 고장 횟수, 비가용 시간, 누적 고장 강도를 계산합니다.',
        createContent: createRepairIntegralsCalculator
      },
      { id: 'failure-intensity', title: 'λ(t), F(t), CFI avg.', createContent: createFailureIntensityCalculator,
        description: '단일 이벤트와 OR·AND 게이트에서 순간 고장 강도, 누적 고장 확률, 임무 평균을 비교합니다.' },
      { id: 'pfd-pfh', title: 'PFD, PFH', createContent: createPfdPfhCalculator, description: '임무 시간에 따른 평균 비가용도와 F(T)/T를 비교합니다.' },
      { id: 'mttf-mtbf', title: 'MTTF, MTBF', createContent: createMeanFailureTimesCalculator, description: '첫 고장까지의 시간, 반복 고장 간격과 유효 MTBF를 비교합니다.' },
      { id: 'q-over-t', title: 'Q/T' },
      { id: 'cut-set-importance', title: 'Cut Set, Importance' },
      { id: 'rbd', title: 'RBD' },
      { id: 'markov-analysis', title: '마코프 분석' }
    ]
  },
  {
    id: 'requirements',
    title: '요구사항',
    description: '요구사항과 검증 기준을 기록하고 시스템 요소 및 분석 결과에 연결합니다.',
    features: ['요구사항 번호·본문·검증 기준·상태 관리', '시스템 파트와 분석 문서의 연결 확인'],
    links: ['sysml', 'checklist']
  },
  { id: 'dfa', title: '종속고장 분석', description: '공통 원인과 연쇄 고장이 영향을 주는 요소와 독립성 가정을 검토합니다.', links: ['requirements', 'safety-fta'] },
  { title: '설정', icon: 'settings', children: [
    { id: 'mission-profile', title: '미션 프로파일', createContent: createMissionProfile },
    { id: 'failure-rate-unit', title: '고장률 단위', createContent: createRateSettings }
  ] }
];

function createFtaCalculators() {
  const panel = document.createElement('div');
  panel.className = 'expo-calculator expo-results';

  const topEvent = document.createElement('details');
  topEvent.className = 'expo-card fta-top-event';
  const summary = document.createElement('summary');
  summary.textContent = '최상위사상(TLE) 계산기';
  topEvent.append(summary);
  topEvent.addEventListener('toggle', function mountTopEvent() {
    if (!topEvent.open) return;
    topEvent.append(createFtEventCalculator());
    topEvent.removeEventListener('toggle', mountTopEvent);
  });

  panel.append(createExpoCalculator({ selectModel: true }), topEvent);
  return panel;
}

function createWorkspace(root) {
  const nav = root.querySelector('#module-nav');
  const menuToggle = root.querySelector('#menu-toggle');
  const location = root.querySelector('#location');
  const title = root.querySelector('#module-title');
  const description = root.querySelector('#module-description');
  const content = root.querySelector('#module-content');
  const back = root.querySelector('#back');
  const modules = new Map();
  const groups = [];
  const history = [];
  let activeId = null;
  let currentWorkspaceUser = null;
  const moduleContent = new Map();
  const sysmlWorkspace = createSysmlWorkspace({ navigate, mount: root, activeModule: () => activeId });

  function element(tag, text, className) {
    const result = document.createElement(tag);
    if (text) result.textContent = text;
    if (className) result.className = className;
    return result;
  }

  function addMenuIcon(control, symbol) {
    const icon = workspaceIcon(symbol);
    icon.setAttribute('aria-hidden', 'true');
    control.prepend(icon);
  }

  function moduleButton(module) {
    const button = element('button', module.title);
    button.type = 'button';
    button.addEventListener('click', () => navigate(module.id));
    return button;
  }

  function addModule(module, container, groupTitle, group) {
    const button = moduleButton(module);
    if (!group) addMenuIcon(button, module.id);
    container.append(button);
    if (module.id === 'sysml') container.append(sysmlWorkspace.navigation);
    if (module.id === 'safety-fta') container.append(sysmlWorkspace.fta.navigation);
    modules.set(module.id, { ...module, groupTitle, group, button });
  }

  for (const item of workspaceMenu) {
    if (!item.children) {
      addModule(item, nav);
      continue;
    }
    const group = element('details');
    const links = element('div', '', 'submenu');
    const summary = element('summary', item.title);
    addMenuIcon(summary, item.icon);
    group.append(summary, links);
    nav.append(group);
    groups.push(group);
    for (const module of item.children) {
      addModule(module, links, item.title, group);
    }
  }

  function setMenuOpen(open) {
    root.classList.toggle('menu-open', open);
    menuToggle.setAttribute('aria-expanded', String(open));
  }

  function render(moduleId) {
    const module = modules.get(moduleId);
    if (moduleId === activeId) {
      setMenuOpen(false);
      sysmlWorkspace.render(moduleId, false);
      return;
    }
    if (activeId === 'sysml') sysmlWorkspace.leaveEditor();
    modules.get(activeId)?.button.removeAttribute('aria-current');
    activeId = moduleId;
    module.button.setAttribute('aria-current', 'page');
    if (module.group) module.group.open = true;
    if (moduleId === 'safety-fta') modules.get('sysml').group.open = true;
    location.textContent = module.groupTitle ? module.groupTitle + ' / ' + module.title : '작업공간';
    title.textContent = module.title;
    description.textContent = module.description;
    description.hidden = !module.description;
    document.title = module.title + ' | 안전분석 공업 수학';
    root.classList.toggle('workspace-sysml', moduleId === 'sysml');

    content.replaceChildren();
    if (moduleId === 'projects' || moduleId === 'sysml') {
      content.append(sysmlWorkspace[moduleId]);
    } else if (moduleId === 'safety-fta') {
      content.append(sysmlWorkspace.fta.element);
    } else if (module.createContent) {
      if (!moduleContent.has(moduleId)) moduleContent.set(moduleId, ['fmea', 'mission-profile', 'failure-rate-unit'].includes(moduleId) ? module.createContent(currentWorkspaceUser) : module.createContent());
      const page = moduleContent.get(moduleId);
      content.append(page);
      page.refreshRate?.();
    }
    if (module.features) {
      const details = element('div', '', 'module-details');
      const features = element('ul');
      for (const feature of module.features) features.append(element('li', feature));
      details.append(element('h2', '구현 예정'), features);
      content.append(details);
    }

    if (module.links) {
      const related = element('div', '', 'module-links');
      const shortcuts = element('div', '', 'module-shortcuts');
      for (const id of module.links) shortcuts.append(moduleButton(modules.get(id)));
      related.append(element('h2', '관련 메뉴'), shortcuts);
      content.append(related);
    }

    back.disabled = history.length === 0;
    back.title = moduleId === 'sysml' ? '이전 메뉴로 이동' : '뒤로가기 (Ctrl+Z)';
    setMenuOpen(false);
    sysmlWorkspace.render(moduleId, true);
    title.focus();
  }

  function navigate(moduleId) {
    if (moduleId !== activeId) history.push(activeId);
    render(moduleId);
  }

  function goBack() {
    if (history.length > 0) render(history.pop());
  }

  menuToggle.addEventListener('click', () => {
    setMenuOpen(menuToggle.getAttribute('aria-expanded') === 'false');
  });
  back.addEventListener('click', goBack);
  root.addEventListener('keydown', (event) => {
    if (event.defaultPrevented) return;
    if (sysmlWorkspace.handleKey(event)) {
      event.preventDefault();
      return;
    }
    if (event.key === 'Escape' && menuToggle.getAttribute('aria-expanded') === 'true') {
      setMenuOpen(false);
      menuToggle.focus();
    }
    if (activeId === 'sysml' || !event.ctrlKey || event.shiftKey || event.altKey ||
        event.key.toLowerCase() !== 'z' || !history.length ||
        event.target.closest('input, textarea, select, [contenteditable], [role="textbox"]')) return;
    event.preventDefault();
    goBack();
  });

  function reset() {
    sysmlWorkspace.stop();
    history.length = 0;
    moduleContent.clear();
    modules.get(activeId)?.button.removeAttribute('aria-current');
    activeId = null;
    for (const group of groups) group.open = false;
    render('projects');
  }

  return {
    start(client, userId) {
      currentWorkspaceUser = userId;
      reset();
      void sysmlWorkspace.start(client, userId);
    },
    stop: reset,
    beforeLogout: sysmlWorkspace.beforeLogout
  };
}


