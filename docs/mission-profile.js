function workspaceIcon(key) {
  const span = document.createElement('span');
  span.className = 'menu-icon';
  if (key === 'λ') { span.textContent = key; return span; }
  const paths = {
    projects: 'M3 6h7l2 3h9v11H3z M3 10h18',
    checklist: 'M8 4H5v17h15V4h-3 M9 2h7v4H9z M8 12l2 2 5-5 M8 17h8',
    '▦': 'M9 2h6v5H9z M12 7v5 M5 16v-4h14v4 M2 16h6v5H2z M16 16h6v5h-6z',
    '△': 'M12 3l9 17H3z M12 9v5 M12 17v.1',
    '◇': 'M12 2l8 3v6q0 7-8 11-8-4-8-11V5z M8 12l3 3 5-6',
    'Σ': 'M3 3v17h18 M7 15v-4 M12 15V6 M17 15V9',
    '∼': 'M2 17l5-7 5 4 9-10 M16 4h5v5',
    requirements: 'M5 2h10l4 4v16H5z M14 2v5h5 M8 12h8 M8 16h6',
    dfa: 'M4 5h5v5H4z M15 15h5v5h-5z M9 7h8v8 M6 10v8h9',
    settings: 'M3 6h6m4 0h8 M9 3h4v6H9z M3 17h11m4 0h3 M14 14h4v6h-4z'
  };
  span.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round"><path d="' + paths[key] + '"/></svg>';
  return span;
}

const phaseFields = [
  ['name','이름',''], ['calendar','달력 시간 (h)',1,true], ['type','유형',['OnOff','Dormant']],
  ['outside','평균 외기 온도 (°C)',0], ['cycles','연간 사이클 수',0],
  ['humidity','상대 습도 (%)',0,true], ['rise','사이클당 온도 상승 (°C)',0],
  ['duration','사이클 시간 (h)',0,true], ['maximum','사이클 최고 온도 (°C)',0,true],
  ['vibration','진동 (Grms)',0,true], ['salt','염분 오염','Low',true],
  ['environment','환경 오염','Low',true], ['pollution','사용처 오염','Low',true],
  ['protection','보호 수준','Hermetic',true], ['stress','환경 스트레스 계수 (π)',0,true]
];
const cycleFields = [['name','이름',''],['ambient','평균 주변 온도 (°C)',0],['tau','시간 비율 τ',0],
  ['self','자체 온도 상승 (°C)',0],['power','소비 전력 (W)',0]];
function profileRow(fields) {
  return Object.fromEntries(fields.map(([key,,value]) => [key, Array.isArray(value) ? value[0] : value]));
}
function profileExamples() {
  return ['Passenger Compartment','Motor Control'].map((name,i) => ({
    name: '[IEC/SN] ' + name, extended: false,
    phases: ['2 Night Starts','4 Daylight Starts','Non Used Vehicle'].map((name,j) => ({
      ...profileRow(phaseFields), name, outside:[5,15,14][j], cycles:[670,1340,30][j],
      type:j === 2 ? 'Dormant' : 'OnOff', rise:j === 2 ? 10 : 0
    })),
    cycles: (i ? [[32,.02],[60,.015],[85,.023]] : [[27,.006],[30,.046],[85,.006]])
      .map(([ambient,tau],j) => ({...profileRow(cycleFields), name:'Temp. '+(j+1),ambient,tau}))
  }));
}
function missionTotals(profile) {
  const on = profile.cycles.reduce((sum,row) => sum + row.tau,0);
  const weighted = profile.cycles.reduce((sum,row) => sum + row.ambient * row.tau,0);
  return {on, off:1-on, mean:on ? weighted/on : null};
}
function missionNode(tag,text) {
  const el=document.createElement(tag);
  if (text !== undefined) el.textContent=text;
  return el;
}
function missionButton(title,click) {
  const button=missionNode('button',title);
  button.type='button';
  button.onclick=click;
  return button;
}
const rateUnits = {'FIT':1e9,'고장 / 10⁶ h':1e6,'고장 / h':1};
function rateUnit(user) {
  const value=localStorage.getItem('weblambda.rate-unit.'+user);
  return Object.hasOwn(rateUnits,value) ? value : 'FIT';
}
function createRateSettings(user) {
  const panel=missionNode('section');
  const label=missionNode('label','미션 프로파일 환산 고장률 단위 ');
  const select=missionNode('select');
  const note=missionNode('p','1 FIT = 10⁻⁹ /h = 0.001 고장 / 10⁶ h');
  for (const unit of Object.keys(rateUnits)) select.add(new Option(unit,unit));
  select.value=rateUnit(user);
  select.onchange=()=>{
    try {localStorage.setItem('weblambda.rate-unit.'+user,select.value);}
    catch {note.textContent='단위를 저장할 수 없습니다.';}
  };
  label.append(select); panel.append(label,note); return panel;
}
function createMissionProfile(user) {
  const key='weblambda.mission.v1.'+user;
  const state=JSON.parse(localStorage.getItem(key) || 'null') || {profiles:profileExamples(),selected:0};
  const panel=missionNode('section');
  panel.className='mission-editor';
  function save() {
    try {localStorage.setItem(key,JSON.stringify(state));}
    catch {window.alert('미션 프로파일을 저장할 수 없습니다.');}
  }
  function draw() {
    const p=state.profiles[state.selected];
    const picker=missionNode('select');
    picker.setAttribute('aria-label','미션 프로파일 선택');
    state.profiles.forEach((item,i)=>picker.add(new Option(item.name,String(i))));
    picker.value=String(state.selected);
    picker.onchange=()=>{state.selected=Number(picker.value);save();draw();};
    const name=missionNode('input'); name.value=p.name;
    name.setAttribute('aria-label','프로파일 이름');
    name.onchange=()=>{p.name=name.value.trim() || p.name;save();draw();};
    const extended=missionNode('input');extended.type='checkbox';extended.checked=p.extended;
    extended.onchange=()=>{p.extended=extended.checked;save();draw();};
    const label=missionNode('label');label.append(extended,' Extended');
    const bar=missionNode('div');bar.className='mission-bar';
    bar.append(picker,missionButton('새 프로파일',()=>{
      state.selected=state.profiles.length;
      state.profiles.push({name:'사용자 프로파일 '+(state.selected-1),extended:false,
        phases:[profileRow(phaseFields)],cycles:[profileRow(cycleFields)]});
      save();draw();
    }),name,label);
    const summary=missionNode('output');
    function update() {
      const {on,off,mean}=missionTotals(p);
      const valid=on <= 1+1e-12 && !panel.querySelector('table input:invalid');
      summary.textContent=valid ? 'τ on  '+on.toFixed(3)+'　 τ off  '+Math.max(0,off).toFixed(3)+'　 평균 주변 온도  '+(mean===null?'—':mean.toFixed(3)+' °C') : '입력 범위와 τ 합계(최대 1)를 확인하세요.';
    }
    function grid(title,rows,fields) {
      const section=missionNode('section'),wrap=missionNode('div'),table=missionNode('table');
      const visible=fields.filter(field=>!field[3] || p.extended);
      const head=table.createTHead().insertRow();
      for(const [,title] of visible) head.append(missionNode('th',title));
      head.append(missionNode('th','행'));
      const body=table.createTBody();
      rows.forEach((row,index)=>{
        const tr=body.insertRow();
        for(const [key,title,initial] of visible) {
          const cell=tr.insertCell();
          if(key==='rise' && row.type==='OnOff'){cell.textContent='—';continue;}
          const input=missionNode(Array.isArray(initial)?'select':'input');
          if(Array.isArray(initial)) initial.forEach(v=>input.add(new Option(v,v)));
          if(typeof initial==='number'){
            input.type='number';input.step='any';input.required=true;
            if(!['outside','ambient','maximum'].includes(key)) input.min=0;
            if(key==='tau')input.max=1;
            if(key==='humidity')input.max=100;
          }
          input.value=row[key];input.setAttribute('aria-label',title+' '+(index+1));
          input.oninput=()=>{
            if(input.validity.valid){
              row[key]=typeof initial==='number'?input.valueAsNumber:input.value;
              save();
            }
            update();
          };
          if(key==='type')input.onchange=draw;
          cell.append(input);
        }
        tr.insertCell().append(missionButton('삭제',()=>{rows.splice(index,1);save();draw();}));
      });
      wrap.className='mission-scroll';wrap.append(table);
      section.append(missionNode('h2',title),wrap,missionButton('행 추가',()=>{rows.push(profileRow(fields));save();draw();}));
      return section;
    }
    panel.replaceChildren(bar,grid('운전 단계 · Working Phases',p.phases,phaseFields),
      grid('내부 운전 사이클 · Internal Working Cycles',p.cycles,cycleFields),summary);
    const rates=missionNode('section'), result=missionNode('output');
    rates.append(missionNode('h2','운전·정지 시간 비율에 따른 평균 고장률'));
    const inputs=['운전 중 고장률 (/h)','정지 중 고장률 (/h)'].map((title,i)=>{
      const label=missionNode('label',title+' '),input=missionNode('input');
      input.type='number';input.step='any';input.min=0;input.required=true;
      input.value=p.rates?.[i] ?? '';
      input.oninput=()=>{p.rates ??= ['',''];p.rates[i]=input.value;save();};
      label.append(input);rates.append(label);return input;
    });
    function rateResult(){
      const {on,off}=missionTotals(p),unit=rateUnit(user);
      result.textContent=inputs.every(x=>x.validity.valid) && on<=1+1e-12 && !panel.querySelector('table input:invalid')
        ? (rateUnits[unit]*(on*inputs[0].valueAsNumber+Math.max(0,off)*inputs[1].valueAsNumber)).toPrecision(6)+' '+unit : '—';
    }
    panel.oninput=rateResult;
    rates.append(result);panel.append(rates);update();rateResult();
    panel.refreshRate=rateResult;
  }
  draw();return panel;
}

