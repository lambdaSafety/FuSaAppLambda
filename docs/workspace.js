const workspaceMenu = [
  {
    id: 'projects',
    title: '프로젝트',
    description: '시스템 모델과 안전분석 문서를 프로젝트 단위로 관리하는 작업공간입니다.',
    links: ['sysml', 'hara', 'fmea', 'fmeca', 'fmeda', 'fta']
  },
  {
    title: '시스템',
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
    expanded: true,
    children: [
      {
        id: 'hara',
        title: 'HARA',
        description: '위험원과 운전 상황을 식별하고 위험 등급과 안전 목표를 검토합니다.',
        features: ['위험원·운전 상황별 평가와 위험 매트릭스', '평가 기준과 결과를 안전 목표에 연결'],
        links: ['requirements', 'fmea']
      }
    ]
  },
  {
    title: '안전분석',
    expanded: true,
    children: [
      {
        id: 'fmea',
        title: 'FMEA',
        description: '고장 모드별 원인, 영향과 조치를 검토하는 워크시트입니다.',
        features: ['시스템 파트·기능·고장 모드에서 분석 행 생성', '국부·상위 영향과 예방·검출 조치 기록'],
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
      {
        id: 'fta',
        title: 'FTA',
        description: '기본사상의 지수 분포 모델을 선택해 임무 시간에서의 고장 확률과 빈도를 계산합니다.',
        createContent: () => createExpoCalculator({ selectModel: true }),
        features: [
          'AND·OR 게이트와 기본사상 재사용을 우선 지원',
          'FTA 결과에서 최소 컷셋과 최상위사상 확률 확인',
          '후속 지원 범위에 k-out-of-n 게이트 포함'
        ],
        links: ['fmeda', 'mission-profile', 'exponential-distribution']
      }
    ]
  },
  {
    title: '분석 조건',
    children: [
      {
        id: 'mission-profile',
        title: '미션 프로파일',
        description: '분석의 기준이 되는 운전 상태와 지속 시간을 단계별로 정의합니다.',
        features: ['운전 단계, 지속 시간과 단위 관리', '단계별 고장률을 지정하고 FTA 계산에 적용'],
        links: ['fta', 'distributions']
      }
    ]
  },
  {
    title: '확률',
    children: [
      {
        id: 'basic-probability',
        title: '기본 확률',
        description: '사건의 여사건, 합사건과 교사건 확률을 살펴봅니다.',
        features: ['사건의 확률과 사건 간 관계 입력', '계산식과 결과 확인'],
        links: ['exponential-distribution', 'conditional-probability', 'bayes']
      },
      {
        id: 'exponential-distribution',
        title: '지수 분포',
        description: '고장률과 임무 시간을 입력해 비수리, 수리, 주기 검사 모델의 확률과 고장 빈도를 비교합니다.',
        createContent: createExpoCalculator
      },
      {
        id: 'conditional-probability',
        title: '조건부 확률',
        description: '주어진 조건 아래에서 사건이 발생할 확률을 살펴봅니다.',
        features: ['교사건과 조건 사건의 확률 입력', '정의식과 입력 범위 확인'],
        links: ['basic-probability', 'bayes']
      },
      {
        id: 'bayes',
        title: '베이즈 정리',
        description: '관측 정보를 반영해 사건의 사전확률을 사후확률로 갱신합니다.',
        features: ['사전확률과 조건부확률 입력', '관측 이후의 확률과 계산 과정 확인'],
        links: ['conditional-probability']
      }
    ]
  },
  {
    title: '통계',
    children: [
      {
        id: 'descriptive-statistics',
        title: '기술통계',
        description: '관측 데이터의 중심과 산포를 요약합니다.',
        features: ['관측값과 표본·모집단 옵션 입력', '평균·분산·표준편차 확인'],
        links: ['distributions']
      },
      {
        id: 'distributions',
        title: '확률분포',
        description: '분포 모수에 따라 관측값이나 고장 확률이 어떻게 달라지는지 살펴봅니다.',
        features: ['이항분포·정규분포 계산과 그래프', '후속 단계에서 지수분포·Weibull 분포를 FTA와 공유'],
        links: ['descriptive-statistics', 'fta']
      }
    ]
  },
  {
    id: 'requirements',
    title: '요구사항',
    description: '요구사항과 검증 기준을 기록하고 시스템 요소 및 분석 결과에 연결합니다.',
    features: ['요구사항 번호·본문·검증 기준·상태 관리', '시스템 파트와 분석 문서의 연결 확인'],
    links: ['sysml', 'checklist']
  },
  {
    id: 'checklist',
    title: '체크리스트',
    description: '모델과 분석 결과의 검토 상태와 근거를 기록합니다.',
    features: ['검토 대상과 대상 리비전 지정', '충족·미충족 판단과 근거 기록'],
    links: ['requirements']
  },
  {
    id: 'settings',
    title: '설정',
    description: '계정별로 작업공간 표시 방식을 관리합니다.',
    features: ['표시 언어와 기본 시간 단위 선택', '확률 표시 자릿수 설정']
  }
];

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
  const moduleContent = new Map();
  const sysmlWorkspace = createSysmlWorkspace({ navigate, mount: root, activeModule: () => activeId });

  function element(tag, text, className) {
    const result = document.createElement(tag);
    if (text) result.textContent = text;
    if (className) result.className = className;
    return result;
  }

  function moduleButton(module) {
    const button = element('button', module.title);
    button.type = 'button';
    button.addEventListener('click', () => navigate(module.id));
    return button;
  }

  function addModule(module, container, groupTitle, group) {
    const button = moduleButton(module);
    container.append(button);
    if (module.id === 'sysml') container.append(sysmlWorkspace.navigation);
    modules.set(module.id, { ...module, groupTitle, group, button });
  }

  for (const item of workspaceMenu) {
    if (!item.children) {
      addModule(item, nav);
      continue;
    }
    const group = element('details');
    const links = element('div', '', 'submenu');
    group.append(element('summary', item.title), links);
    nav.append(group);
    groups.push({ group, expanded: Boolean(item.expanded) });
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
    location.textContent = module.groupTitle ? module.groupTitle + ' / ' + module.title : '작업공간';
    title.textContent = module.title;
    description.textContent = module.description;
    description.hidden = !module.description;
    document.title = module.title + ' | 안전분석 공업 수학';
    root.classList.toggle('workspace-sysml', moduleId === 'sysml');

    content.replaceChildren();
    if (moduleId === 'projects' || moduleId === 'sysml') {
      content.append(sysmlWorkspace[moduleId]);
    } else if (module.createContent) {
      if (!moduleContent.has(moduleId)) moduleContent.set(moduleId, module.createContent());
      content.append(moduleContent.get(moduleId));
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
    for (const { group, expanded } of groups) group.open = expanded;
    render('projects');
  }

  return {
    start(client, userId) {
      reset();
      void sysmlWorkspace.start(client, userId);
    },
    stop: reset,
    beforeLogout: sysmlWorkspace.beforeLogout
  };
}
