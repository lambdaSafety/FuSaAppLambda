// Seeded generator with an open (0, 1) interval for inverse transforms.
function mcRandom(seed) {
  return () => {
    seed = (seed + 0x6D2B79F5) >>> 0;
    let t = Math.imul(seed ^ seed >>> 15, seed | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return (((t ^ t >>> 14) >>> 0) + 0.5) / 4294967296;
  };
}

const mcDistributions = {
  normal: ['정규', '평균 μ', '표준편차 σ', 5, 1,
    (a,b,u) => a+b*Math.sqrt(-2*Math.log(u()))*Math.cos(2*Math.PI*u())],
  uniform: ['균등', '하한', '상한', 3, 7, (a,b,u) => a+(b-a)*u()],
  weibull: ['와이블', '형상 k', '척도 η', 2, 5, (a,b,u) => b*(-Math.log(u()))**(1/a)],
  exponential: ['지수', '발생률 λ', '', 0.2, 0, (a,b,u) => -Math.log(u())/a]
};

// A small arithmetic grammar keeps user formulas separate from JavaScript.
function mcFormula(source) {
  const tokens = source.match(/(?:\d*\.\d+|\d+\.?\d*)(?:e[+-]?\d+)?|x[12]|sqrt|[^\s]/gi) || [];
  if (tokens.length > 100) throw Error('사용자 식을 100개 이하의 기호로 입력하세요.');
  let i = 0;
  function atom() {
    const token = tokens[i++]?.toLowerCase();
    if (token === '-') { const f = atom(); return (x,y) => -f(x,y); }
    if (token === 'x1') return x => x;
    if (token === 'x2') return (x,y) => y;
    if (token === '(' || token === 'sqrt') {
      if (token === 'sqrt' && tokens[i++] !== '(') throw Error('sqrt는 sqrt(식)으로 입력하세요.');
      const f = sum();
      if (tokens[i++] !== ')') throw Error('수식의 괄호를 확인하세요.');
      return token === '(' ? f : (x,y) => Math.sqrt(f(x,y));
    }
    if (Number.isFinite(Number(token))) return () => Number(token);
    throw Error('X1, X2, 숫자, 사칙연산, 괄호 또는 sqrt를 사용하세요.');
  }
  function product() {
    let f = atom();
    while (tokens[i] === '*' || tokens[i] === '/') {
      const op = tokens[i++], left = f, right = atom();
      f = (x,y) => op === '*' ? left(x,y)*right(x,y) : left(x,y)/right(x,y);
    }
    return f;
  }
  function sum() {
    let f = product();
    while (tokens[i] === '+' || tokens[i] === '-') {
      const op = tokens[i++], left = f, right = product();
      f = (x,y) => op === '+' ? left(x,y)+right(x,y) : left(x,y)-right(x,y);
    }
    return f;
  }
  const f = sum();
  if (i !== tokens.length) throw Error('수식의 연산 기호를 확인하세요.');
  return f;
}

function createMonteCarlo() {
  const root = document.createElement('section');
  root.className = 'expo-calculator mc-lab';
  root.innerHTML = `
    <p>두 입력을 독립적으로 추출해 매번 Y를 계산합니다. 표본을 추가하며 누적 평균이 이론값에 가까워지는 과정과 임계치를 넘긴 점을 살펴보세요.</p>
    <form class="expo-form"><div class="expo-fields">
    <label>출력 모델<select name="model"><option value="sum">공차 누적 · Y = X1 + X2</option><option value="norm">합성 크기 · Y = √(X1² + X2²)</option><option value="margin">안전 마진 · M = X1 − X2</option><option value="custom">사용자 식</option></select></label>
    <label hidden>사용자 식 (+ − * /, sqrt)<input name="formula" value="X1 + X2" maxlength="200"></label>
    <label>판정 임계치<input name="threshold" type="number" step="any" required value="12"></label></div>
    <div class="mc-inputs"></div>
    <div class="expo-fields"><label>추가 표본 수<select name="batch"><option>10</option><option selected>100</option><option>1000</option><option>10000</option></select></label>
    <label>난수 시드<input name="seed" type="number" min="0" max="4294967295" step="1" value="42" required></label></div>
    <div class="expo-actions"><button type="submit">선택한 표본 수 추가</button><button type="button" data-one>1회 추가</button><button type="button" data-reset>같은 시드로 초기화</button></div></form>
    <p role="alert"></p><p role="status"></p><div class="mc-charts"></div>
    <details><summary>표본 수와 추정 정밀도</summary><p>표본 평균의 표준오차는 SE ≈ s/√N입니다. 같은 조건에서 표준오차를 약 1/10로 줄이려면 표본이 약 100배 필요합니다. 관측된 초과가 0건이어도 실제 확률이 0이라는 뜻은 아닙니다.</p></details>`;
  const form = root.querySelector('form'), fields = form.elements;
  const alert = root.querySelector('[role=alert]'), result = root.querySelector('[role=status]');
  const charts = root.querySelector('.mc-charts');
  const configs = [1,2].map(i => {
    const group = document.createElement('fieldset');
    group.innerHTML = '<legend>X'+i+'</legend><div class="expo-fields"><label>분포<select></select></label><label><span></span><input type="number" step="any" required></label><label><span></span><input type="number" step="any" required></label></div>';
    root.querySelector('.mc-inputs').append(group);
    const kind = group.querySelector('select'), inputs = [...group.querySelectorAll('input')];
    for (const [id, spec] of Object.entries(mcDistributions)) kind.add(new Option(spec[0], id));
    function defaults() {
      const spec = mcDistributions[kind.value];
      inputs.forEach((el,j) => {
        el.previousElementSibling.textContent = spec[j+1];
        el.value = spec[j+3];
        el.disabled = el.parentElement.hidden = !spec[j+1];
      });
    }
    defaults();
    kind.addEventListener('change', defaults);
    return () => {
      const k = kind.value, [a,b] = inputs.map(el => Number(el.value));
      if ((k === 'normal' && b <= 0) || (k === 'uniform' && a >= b) ||
          (k === 'weibull' && Math.min(a,b) <= 0) || (k === 'exponential' && a <= 0))
        throw Error('X'+i+' 분포의 범위를 확인하세요. 표준편차·형상·척도·발생률은 양수이고 하한은 상한보다 작아야 합니다.');
      return {k,a,b};
    };
  });
  let samples, random, theory;
  function clear() {
    samples = [];
    theory = null;
    random = mcRandom(Number(fields.seed.value));
    alert.textContent = '';
    result.textContent = '표본 0개 · 실행 버튼을 눌러 시작하세요.';
    charts.replaceChildren();
  }
  function run(n) {
    if (!form.reportValidity()) return;
    try {
      if (samples.length+n > 100000) throw Error('한 실습에서 최대 100,000개까지 누적할 수 있습니다.');
      const [p,q] = configs.map(read => read());
      const mode = fields.model.value;
      const model = {sum:(x,y)=>x+y, norm:Math.hypot, margin:(x,y)=>x-y}[mode] || mcFormula(fields.formula.value);
      theory = p.k === 'normal' && q.k === 'normal' && ['sum','margin'].includes(mode)
        ? [model(p.a,q.a),Math.hypot(p.b,q.b)] : null;
      for (let i=0; i<n; i++) {
        const draw = v => mcDistributions[v.k][5](v.a,v.b,random);
        const x=draw(p), y=draw(q), z=model(x,y);
        if (![x,y,z].every(v => Number.isFinite(v) && Math.abs(v)<1e140)) {
          clear(); throw Error('표본 계산 범위를 벗어났습니다. 입력 범위나 사용자 식을 확인하세요.');
        }
        samples.push({x,y,z});
      }
      render();
    } catch (e) { alert.textContent=e.message; }
  }
  function render() {
    alert.textContent='';
    if (!samples.length || !form.reportValidity()) return;
    const t=Number(fields.threshold.value), margin=fields.model.value==='margin';
    const fails=z=>margin ? z<t : z>t;
    const summary=mcPlots(charts,samples,t,fails,theory);
    const fmt=mcFormat;
    result.textContent = 'N = '+samples.length.toLocaleString()+' · 평균 '+fmt(summary.mean)+' · 표본 분산 '+fmt(summary.variance)+' · 표준편차 '+fmt(Math.sqrt(summary.variance))+' · SE '+fmt(Math.sqrt(summary.variance/samples.length))+' · P99.9 '+fmt(summary.percentile)+' · '+(margin?'P(M < 임계치)':'P(Y > 임계치)')+' = '+summary.count+'/'+samples.length+' ('+fmt(100*summary.count/samples.length)+'%)'+(theory?' · 이론 평균 '+fmt(theory[0])+' / 이론 표준편차 '+fmt(theory[1]):'');
  }
  form.onsubmit=e=>{e.preventDefault();run(Number(fields.batch.value));};
  root.querySelector('[data-one]').onclick=()=>run(1);
  root.querySelector('[data-reset]').onclick=clear;
  form.onchange=e=>{
    if (e.target===fields.batch) return;
    if (e.target===fields.threshold) { render(); return; }
    if (e.target===fields.model) {
      fields.formula.parentElement.hidden=fields.model.value!=='custom';
      fields.threshold.value=fields.model.value==='margin'?0:12;
    }
    clear();
  };
  clear();run(100);
  return root;
}

function mcFormat(v) { return Number.isFinite(v) ? Number(v.toPrecision(5)).toString() : '—'; }

