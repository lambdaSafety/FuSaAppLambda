const riskTables = {};
function riskPage(id) {
  const spec = riskTables[id];
  const root = document.createElement('section');
  root.className = 'risk-assessment';
  function element(tag, text) {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    return node;
  }
  root.append(element('p', spec.context));
  const controls = element('div');
  controls.className = 'risk-inputs';
  const selects = spec.axes.map(([label, options], i) => {
    const field = element('label', label), select = element('select');
    options.forEach(([code, meaning]) => select.add(new Option(code + ' · ' + meaning, code)));
    select.value = spec.initial[i];
    field.append(select); controls.append(field);
    return select;
  });
  const result = element('output');
  result.setAttribute('aria-live','polite');
  root.append(controls, result);
  function table(caption, columns, rows) {
    const wrap = element('div'); wrap.className = 'risk-table-scroll';
    const grid = element('table'); grid.append(element('caption', caption));
    const header = grid.createTHead().insertRow();
    columns.forEach(c => { const th = element('th',c); th.scope='col'; header.append(th); });
    const body = grid.createTBody();
    rows.forEach(values => {
      const tr = body.insertRow();
      values.forEach((v,i) => {
        const cell = element(i ? 'td' : 'th', v);
        if (!i) cell.scope='row';
        tr.append(cell);
      });
    });
    wrap.append(grid); root.append(wrap); return body;
  }
  const columns = spec.axes.at(-1)[1].map(option => option[0]);
  const prefixes = spec.axes.slice(0,-1).reduce((rows, [,options]) =>
    rows.flatMap(row => options.map(([code]) => [...row,code])), [[]]);
  const body = table(spec.caption, [spec.axes.slice(0,-1).map(a=>a[0]).join(' · ') || '분류', ...columns],
    prefixes.map(prefix => [prefix.join(' · ') || '상위 기능 FDAL', ...columns.map(code => spec.grade([...prefix,code]))]));
  function update() {
    const values = selects.map(select => select.value);
    const row = prefixes.findIndex(p => p.every((code,i) => code===values[i]));
    body.querySelector('.risk-selected')?.classList.remove('risk-selected');
    body.rows[row].cells[1+columns.indexOf(values.at(-1))].classList.add('risk-selected');
    result.textContent = values.join(' · ') + ' → ' + spec.grade(values);
  }
  controls.addEventListener('change',update); update();
  root.append(element('p',spec.note));
  for (const extra of spec.extra || []) table(...extra);
  const sources = element('p'); sources.append('근거 자료　');
  spec.sources.forEach(([title,url]) => {
    const link=element('a',title); link.href=url; link.target='_blank'; link.rel='noopener noreferrer';
    sources.append(link,'　');
  });
  root.append(sources);
  return root;
}
function riskAxis(label, prefix, meanings, start=0) {
  return [label, meanings.map((meaning,i) => [prefix+(start+i),meaning])];
}
riskTables['risk-agpl'] = {
  context:'농림기계의 오작동 상황을 정하고 작업자·주변인의 상해, 노출, 위해 회피 가능성을 평가합니다. 농기계에서 E0인 상황도 S3·C3이면 AgPLr a가 됩니다.',
  axes:[riskAxis('상해 S','S',['인적 피해 없음','회복 가능한 상해','중상·생존 가능성 높음','생존 불확실 또는 중증 장애']),
    riskAxis('노출 E','E',['극히 드묾','드묾','간헐적','잦음','거의 매 작업']),
    riskAxis('제어 C','C',['쉽게 회피','대부분 쉽게 회피','대체로 회피','일반적으로 회피 곤란'])],
  initial:['S3','E3','C2'], caption:'ISO 25119-2:2019 그림 1 · 요구 농업 성능수준',
  grade:([s,e,c])=>{
    if(s==='S0'||c==='C0')return 'QM';
    const level=Number(s[1])+Number(e[1])+Number(c[1])-5;
    return level<=0?'QM':'AgPLr '+'abcde'[level-1];
  },
  note:'부속서 H의 비교는 결정된 AgPLr에 대해 같은 적용 조건에서 타 표준으로 개발한 요소를 검토할 때 사용합니다. H.3~H.5의 하드웨어·소프트웨어 요건을 함께 확인해야 합니다. AgPLr c에 SIL 1 하드웨어를 사용할 때는 필요한 위험고장 수치를 입증해야 합니다. 아래 부등호는 첨부 표의 표기를 따릅니다. ASIL은 차량 HARA에서 결정하며 여기의 시간당 수치로 역산하지 않습니다.',
  extra:[['첨부 표 H.1 · 동일 적용 조건에서 타 표준 요소의 호환성 검토',['AgPLr','PL','PL 비교값 (1/h)','SIL','SIL 비교값 (1/h)','ASIL','ASIL 비교값 (1/h)'],[
    ['QM','—','—','안전 요구 없음','—','QM','—'],
    ['a','a','10⁻⁵ < x < 10⁻⁴','특별 안전 요구 없음','—','A','H.5 a) 참조'],
    ['b','b','3 × 10⁻⁶ < x < 10⁻⁵','1','10⁻⁶ < x < 10⁻⁵','A','H.5 a) 참조'],
    ['c','c','10⁻⁶ < x < 3 × 10⁻⁶','1 · H.3 조건','10⁻⁶ < x < 10⁻⁵','A','H.5 a) 참조'],
    ['d','d','10⁻⁷ < x < 10⁻⁶','2','10⁻⁷ < x < 10⁻⁶','B','10⁻⁸ < x < 10⁻⁷'],
    ['e','e','10⁻⁸ < x < 10⁻⁷','3','10⁻⁸ < x < 10⁻⁷','C','10⁻⁸ < x < 10⁻⁷'],
    ['대응 없음','—','—','4','10⁻⁹ < x < 10⁻⁸','D','x < 10⁻⁸']]]],
  sources:[['ISO 25119-2:2019 · §6.3.7, 그림 1, 부속서 H','https://www.iso.org/standard/78306.html'],['VTT · 표 5의 조합 확인','https://publications.vtt.fi/pdf/technology/2015/T241.pdf']]
};
riskTables['risk-pl'] = {
  context:'기계의 안전기능 하나를 정하고 그 기능이 제공해야 할 위험 감소 수준을 선택합니다. 예를 들어 프레스 방호문을 열 때 정지하는 기능은 작업자의 접근 빈도와 회피 가능성을 함께 평가합니다.',
  axes:[riskAxis('상해 S','S',['경상·통상 가역적','중상·통상 비가역적 또는 사망'],1),
    riskAxis('노출 F','F',['드물거나 짧음','빈번·지속적이거나 장시간'],1),
    riskAxis('회피 P','P',['특정 조건에서 가능','거의 불가능'],1)],
  initial:['S2','F2','P1'],caption:'ISO 13849-1:2023 부속서 A 그림 A.1 · 기본 위험 그래프',
  grade:([s,f,p])=>'PLr '+'abcde'[(Number(s[1])-1)*2+Number(f[1])+Number(p[1])-2],
  note:'표는 위험사건 발생 가능성에 대한 별도 하향 조정 전의 PLr입니다. 낮은 발생 가능성에 따른 조정에는 문서화된 근거가 필요합니다. 달성 PL의 확인에는 구조, 진단, 공통원인 및 체계적 고장 대책도 포함합니다.',
  extra:[['달성 PL 검토용 시간당 평균 위험고장빈도 · 하한 포함, 상한 제외',['PL','하한 (1/h)','상한 (1/h)'],[
  ['a','10⁻⁵','10⁻⁴'],['b','3 × 10⁻⁶','10⁻⁵'],['c','10⁻⁶','3 × 10⁻⁶'],['d','10⁻⁷','10⁻⁶'],['e','10⁻⁸','10⁻⁷']]]],
  sources:[['ISO 13849-1:2023 · 부속서 A','https://www.iso.org/standard/73481.html'],['ABB · 위험 추정 그래프','https://library.e.abb.com/public/1d68e9918ebe4a8098f002bdd5181197/EN_ISO_13849-1_2TLC172003B02002.pdf']]
};
riskTables['risk-sil'] = {
  context:'IEC 61508-5:2010 부속서 E 그림 E.2의 교육용 위험 그래프입니다. 보호 기능을 추가하기 전의 결과 C, 노출 F, 회피 가능성 P와 원치 않는 사건의 발생 가능성 W를 선택합니다. 실제 프로젝트에서는 허용 위험과 산업 조건에 맞춰 그래프를 보정합니다.',
  axes:[riskAxis('결과 C','C',['경상','영구 중상 또는 한 명 사망','여러 명 사망','매우 많은 사망'],1),
    riskAxis('노출 F','F',['드물거나 간헐적','빈번하거나 지속적'],1),
    riskAxis('회피 P','P',['조건부 가능','거의 불가능'],1),
    riskAxis('발생 W','W',['상대적으로 낮음','중간','상대적으로 높음'],1)],
  initial:['C2','F2','P1','W3'],caption:'부속서 E의 예시 판정 · W에 따른 요구 위험 감소',
  grade:([c,f,p,w])=>{
    const branch={C1:1,C2:2+(f==='F2'?2:0)+(p==='P2'?1:0),C3:f==='F1'?6:7,C4:8}[c];
    return ['안전 요구 없음','특별 안전 요구 없음','SIL 1','SIL 1','SIL 2','SIL 3','SIL 3','SIL 4','추가 위험 저감 필요'][Math.max(0,branch+Number(w[1])-3)];
  },
  note:'이 예시에서 C1과 C4는 F·P에 관계없이 같은 분기로 가고 C3에서는 F만 다음 분기를 정합니다. 최상단 위험에서는 단일 E/E/PE 안전관련 시스템 이외의 위험 저감 수단도 검토합니다.',
  extra:[['IEC 61508-1:2010 표 2·3 · 안전기능의 정량 목표 범위',['등급','저빈도 요구 PFDavg (무차원)','고빈도·연속 PFH (1/h)'],[
  ['SIL 1','[10⁻², 10⁻¹)','[10⁻⁶, 10⁻⁵)'],['SIL 2','[10⁻³, 10⁻²)','[10⁻⁷, 10⁻⁶)'],['SIL 3','[10⁻⁴, 10⁻³)','[10⁻⁸, 10⁻⁷)'],['SIL 4','[10⁻⁵, 10⁻⁴)','[10⁻⁹, 10⁻⁸)']]]],
  sources:[['IEC 61508-5:2010 · 부속서 E','https://webstore.iec.ch/en/publication/5519'],['IEC · SIL과 목표 고장척도','https://assets.iec.ch/public/acos/IEC%2061508%20%26%20Functional%20Safety-2022.pdf']]
};
function roadRiskAxes(rider){
  return [riskAxis('상해 S','S',['인적 상해 없음','경상 또는 중등도 상해','중상·생존 가능성 높음','생존 불확실 또는 사망']),
    riskAxis('운행 상황 E','E',['현실성 없는 상황','노출 가능성 매우 낮음','낮음','중간','높음']),
    riskAxis(rider?'라이더 등의 제어 C':'운전자 등의 제어 C','C',['일반적으로 제어 가능','쉽게 제어','통상적으로 제어','어렵거나 불가능'])];
}
function roadRiskLevel([s,e,c]){
  if([s,e,c].some(code=>code.endsWith('0')))return null;
  const index=Number(s[1])+Number(e[1])+Number(c[1])-6;
  return ['QM','A','B','C','D'][Math.max(0,index)];
}
riskTables.hara = {
  context:'차량 기능의 오작동과 운행 상황을 하나의 위험 사건으로 정의합니다. 상해 심각도 S, 그 운행 상황에 노출될 가능성 E, 관련자가 사고를 피할 수 있는 정도 C로 안전 목표의 ASIL을 정합니다.',
  axes:roadRiskAxes(false), initial:['S3','E3','C2'],caption:'ISO 26262-3:2018 §6.4.3 · 표 4 및 등급 할당 예외',
  grade:inputs=>{const level=roadRiskLevel(inputs);return !level?'할당 불필요':level==='QM'?'QM':'ASIL '+level;},
  note:'S0·E0·C0에 따른 할당 불필요와 표 4 안의 QM을 구분합니다. E는 운행 상황 노출입니다. S3·E1·C3은 기본 A이며, 여러 희귀 상황의 조합을 근거로 하는 §6.4.3.11의 별도 판단은 자동 적용하지 않습니다.',
  sources:[['ISO 26262-3:2018 · §6.4.3, 표 4','https://www.iso.org/standard/68385.html'],['i-Q · 2018 HARA 분류표','https://www.i-q.de/downloads/hara-bewertungstabellen/i-q_iso26262-2018_hara-ranking-cards_2018_gb_v3.0_ovda_mwz.pdf']]
};
const motorcycleAsil={QM:'QM',A:'QM',B:'ASIL A',C:'ASIL B',D:'ASIL C'};
riskTables['risk-msil'] = {
  context:'이륜차 위험 사건은 라이더·동승자·주변 사람을 고려해 분류합니다. 같은 S/E/C 기호를 사용해도 이륜차 운행 상황과 라이더의 회피 가능성을 판단해야 합니다.',
  axes:roadRiskAxes(true),initial:['S3','E4','C3'],caption:'ISO 26262-12:2018 표 5 · MSIL과 표 6의 최소 적용 ASIL',
  grade:inputs=>{
    const level=roadRiskLevel(inputs);
    if(!level)return '할당 불필요';
    return (level==='QM'?'QM':'MSIL '+level)+' → '+motorcycleAsil[level];
  },
  note:'표 5로 위험 사건의 MSIL을 결정하고 표 6에 따라 안전 목표를 정의하기 전에 적용 ASIL로 연결합니다. MSIL A와 QM은 표 5에서 서로 다른 판정입니다.',
  extra:[['표 6 · 이륜차 안전 목표에 적용할 수준',['MSIL 판정','최소 적용 수준'],Object.entries(motorcycleAsil)]],
  sources:[['ISO 26262-12:2018 · §8.4.3, 표 5·6','https://www.iso.org/standard/69605.html']]
};
const fhaEffects=[
  ['No Safety Effect','안전 영향 없음','E'],
  ['Minor','안전 여유가 약간 줄거나 승무원 업무가 조금 늘어남','D'],
  ['Major','안전 여유가 크게 줄거나 승무원 업무가 상당히 늘어남','C'],
  ['Hazardous','안전 여유가 대폭 줄고 승무원의 정확한 대응을 기대하기 어려움','B'],
  ['Catastrophic','통상 항공기 상실과 다수 사망에 이르는 영향','A']
];
riskTables['risk-dal'] = {
  context:'민항기 FHA에서 비행 단계, 항공기 거동, 승무원·탑승자 영향을 평가합니다. 상위 기능에 연결된 고장 상태 중 가장 심각한 분류를 선택하면 초기 기능 개발보증수준(FDAL)을 확인할 수 있습니다.',
  axes:[['고장 상태 분류',fhaEffects.map(([name,effect])=>[name,effect])]],initial:['Major'],
  caption:'상위 기능 초기 FDAL · 아키텍처 독립성에 대한 별도 크레딧 적용 전',
  grade:([name])=>'FDAL '+fhaEffects.find(row=>row[0]===name)[2],
  note:'FHA는 고장 상태의 영향을 분류합니다. 개발보증 할당은 ARP4754 계열과 연계하며, 상세 FDAL과 개별 항목 IDAL에는 기능 실패 조합, 아키텍처와 독립성 근거가 필요합니다. 정량 발생확률은 별도의 안전 목표입니다.',
  extra:[['분류별 영향 판단 예시',['고장 상태','영향의 예','초기 FDAL'],fhaEffects]],
  sources:[['SAE ARP4761A · 안전성 평가','https://doi.org/10.4271/ARP4761A'],['SAE ARP4754B · 개발보증','https://doi.org/10.4271/ARP4754B'],['상위 기능 FDAL 할당 표 2 예시','https://www.energy.gov/sites/prod/files/2018/02/f48/kimsey-lin_aircraft_nashville18.pdf']]
};
