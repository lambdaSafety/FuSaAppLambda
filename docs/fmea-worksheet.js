const fmeaColumns = [
  ['structure', '구조'], ['element', '엘리먼트'], ['function', '기능'],
  ['failure', '고장 모드'], ['effect', '고장 영향'], ['cause', '고장 원인'],
  ['prevention', '예방 관리 (Prevention)'], ['detection', '검출 관리 (Detection)'],
  ['s', 'S (심각도)'], ['o', 'O (발생도)'], ['d', 'D (검출도)'], ['ap', 'AP']
];

function createFmeaWorksheet(userId, projectData) {
  const storageKey = 'weblambda.fmea.v1.' + userId;
  const panel = document.createElement('section');
  const add = document.createElement('button');
  add.type = 'button';
  add.textContent = '행 추가';
  const status = document.createElement('p');
  status.setAttribute('role', 'status');
  status.textContent = '입력 내용은 Supabase 저장 시 프로젝트와 함께 저장됩니다.';
  const viewport = document.createElement('div');
  viewport.className = 'fmea-scroll';
  const table = document.createElement('table');
  table.setAttribute('aria-label', 'FMEA 워크시트');
  const head = table.createTHead().insertRow();
  const body = table.createTBody();
  for (const [, label] of fmeaColumns) {
    const th = document.createElement('th');
    th.scope = 'col';
    th.textContent = label;
    head.append(th);
  }
  function exampleRows() {
    return [
      { structure: '냉각 시스템', element: '냉각 팬', function: '공기를 순환시킨다', failure: '팬 회전 정지', effect: '장치 온도 상승', cause: '베어링 고착', prevention: '베어링 수명 검토', detection: '회전 내구 시험', s: 6, o: 3, d: 4, ap: 'M' },
      { structure: '냉각 시스템', element: '온도 센서', function: '장치 온도를 측정한다', failure: '온도를 낮게 출력', effect: '팬 작동 지연', cause: '센서 특성 편차', prevention: '센서 공차 검토', detection: '기준 온도와 비교 시험', s: 5, o: 2, d: 3, ap: 'L' }
    ];
  }
  let rows = [];
  let canSave = true;
  try {
    const saved = projectData.read('fmea');
    const legacy = saved === undefined ? localStorage.getItem(storageKey) : null;
    const stored = saved ?? (legacy === null ? exampleRows() : JSON.parse(legacy));
    if (saved === undefined && legacy === null) status.textContent = '사용성 평가용 예시 2행입니다. 평가값은 직접 수정할 수 있습니다.';
    if (!Array.isArray(stored) || stored.some(row => !row || typeof row !== 'object')) throw Error();
    rows = structuredClone(stored);
  } catch {
    canSave = false;
    status.textContent = '기존 데이터를 읽을 수 없습니다. 이 화면의 변경은 임시로만 유지됩니다.';
  }
  function save() {
    if (!canSave) return;
    if (projectData.write('fmea', rows)) {
      status.textContent = '프로젝트 초안에 반영됐습니다.';
    } else {
      status.textContent = '프로젝트 초안에 반영하지 못했습니다.';
    }
  }
  function appendRow(row) {
    const tr = body.insertRow();
    for (const [key, label] of fmeaColumns) {
      const choices = ['s', 'o', 'd'].includes(key) ? Array.from({length: 10}, (_, i) => i + 1)
        : key === 'ap' ? ['H', 'M', 'L'] : null;
      const field = document.createElement(choices ? 'select' : 'textarea');
      if (choices) {
        field.add(new Option('선택', ''));
        for (const value of choices) field.add(new Option(value, value));
      }
      field.setAttribute('aria-label', tr.rowIndex + '행 ' + label);
      field.value = row[key] ?? '';
      field.addEventListener(choices ? 'change' : 'input', () => {
        row[key] = choices && key !== 'ap' && field.value ? Number(field.value) : field.value;
        save();
      });
      tr.insertCell().append(field);
    }
    return tr;
  }
  if (!rows.length) rows.push({});
  rows.forEach(appendRow);
  add.addEventListener('click', () => {
    const row = {};
    rows.push(row);
    appendRow(row).querySelector('textarea').focus();
    save();
  });
  const help = document.createElement('p');
  help.textContent = '드래그로 범위 선택 · Ctrl+C 복사 · 시작 셀 클릭 후 Ctrl+V 붙여넣기 · 더블클릭 또는 Enter로 셀 편집';
  table.tabIndex = 0;
  let anchor, end;
  function select(from, to) {
    anchor = from;
    end = to;
    for (const row of body.rows) {
      for (const cell of row.cells) {
        cell.classList.toggle('range-selected',
          between(row.sectionRowIndex, from.parentElement.sectionRowIndex, to.parentElement.sectionRowIndex) &&
          between(cell.cellIndex, from.cellIndex, to.cellIndex));
      }
    }
  }
  function between(value, a, b) {
    return value >= Math.min(a, b) && value <= Math.max(a, b);
  }
  body.addEventListener('mousedown', event => {
    const cell = event.target.closest('td');
    if (!cell || event.button !== 0) return;
    const field = cell.firstElementChild;
    if (field.tagName === 'TEXTAREA' && field === document.activeElement) return;
    if (event.target === field && field.tagName === 'SELECT' &&
        event.clientX >= field.getBoundingClientRect().right - 24) return;
    event.preventDefault();
    table.focus({ preventScroll: true });
    select(cell, cell);
  });
  body.addEventListener('mouseover', event => {
    const cell = event.target.closest('td');
    if (document.activeElement === table && event.buttons === 1 && anchor && cell && cell !== end) select(anchor, cell);
  });
  body.addEventListener('dblclick', event => event.target.closest('td')?.firstElementChild.focus());
  body.addEventListener('focusin', event => {
    const cell = event.target.closest('td');
    if (cell) select(cell, cell);
  });
  table.addEventListener('keydown', event => {
    if (event.target === table && end && event.key === 'Enter') {
      event.preventDefault();
      end.firstElementChild.focus();
    }
  });
  table.addEventListener('copy', event => {
    if (!anchor || document.activeElement.tagName === 'TEXTAREA') return;
    const matrix = Array.from(body.rows, row => Array.from(row.querySelectorAll('.range-selected'),
      cell => cell.firstElementChild.value)).filter(row => row.length);
    const quote = value => /["\t\r\n]/.test(value) ? '"' + value.replaceAll('"', '""') + '"' : value;
    event.clipboardData.setData('text/plain', matrix.map(row => row.map(quote).join('\t')).join('\r\n'));
    event.preventDefault();
  });
  table.addEventListener('paste', event => {
    const text = event.clipboardData.getData('text/plain');
    if (!anchor || !text || (document.activeElement.tagName === 'TEXTAREA' && !/[\t\n\r]/.test(text))) return;
    event.preventDefault();
    const matrix = parseFmeaClipboard(text);
    const top = Math.min(anchor.parentElement.sectionRowIndex, end.parentElement.sectionRowIndex);
    const left = Math.min(anchor.cellIndex, end.cellIndex);
    const updates = [];
    for (const [i, values] of matrix.entries()) {
      for (const [j, value] of values.entries()) {
        const column = fmeaColumns[left + j];
        if (!column) {
          status.textContent = '붙여넣을 범위가 마지막 열 AP를 넘어갑니다.';
          return;
        }
        const [key, label] = column;
        const ranked = ['s', 'o', 'd'].includes(key);
        const input = ranked || key === 'ap' ? value.trim().toUpperCase() : value;
        if (input && ((ranked && !/^(10|[1-9])$/.test(input)) || (key === 'ap' && !/^[HML]$/.test(input)))) {
          status.textContent = (top+i+1) + '행 ' + label + ' 값을 확인하세요. ' + (ranked ? '1~10' : 'H, M, L') + ' 중에서 입력하세요.';
          return;
        }
        updates.push({ index: top+i, col: left+j, key, value: ranked && input ? Number(input) : input });
      }
    }
    for (const update of updates) {
      if (update.index === rows.length) {
        rows.push({});
        appendRow(rows[update.index]);
      }
      rows[update.index][update.key] = update.value;
      body.rows[update.index].cells[update.col].firstElementChild.value = update.value;
    }
    save();
  });
  viewport.append(table);
  const examples = document.createElement('button');
  examples.type = 'button';
  examples.textContent = '예시 2행 추가';
  examples.addEventListener('click', () => {
    for (const row of exampleRows()) {
      rows.push(row);
      appendRow(row);
    }
    save();
  });
  panel.append(add, examples, help, status, viewport);
  return panel;
}

function parseFmeaClipboard(text) {
  const rows = [];
  let row = [], value = '', quoted = false;
  text = text.replace(/\r\n?/g, '\n');
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"' && quoted && text[i + 1] === '"') {
      value += '"';
      i++;
    } else if (ch === '"' && (quoted || !value)) {
      quoted = !quoted;
    } else if (!quoted && (ch === '\t' || ch === '\n')) {
      row.push(value);
      value = '';
      if (ch === '\n') {
        rows.push(row);
        row = [];
      }
    } else value += ch;
  }
  if (row.length || value || !text.endsWith('\n')) rows.push([...row, value]);
  return rows;
}