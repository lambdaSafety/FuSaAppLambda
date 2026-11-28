function createFailureIntensityCalculator() {
  const metrics = [
    { field: 'intensity', title: '순간 조건부 고장 강도', symbol: 'λ(t)', unit: '1/h',
      formula: String.raw`\lambda(t)=\frac{w(t)}{1-Q(t)}`,
      meaning: '시각 t에 정상인 시스템이 다음 짧은 시간 동안 고장으로 전이하는 비율입니다.' },
    { field: 'unreliability', title: '누적 고장 확률', symbol: 'F(t)', unit: '확률',
      formula: String.raw`F(t)=1-\exp\!\left(-\int_0^t\lambda(u)\,du\right)`,
      meaning: '처음에 정상인 시스템이 t까지 한 번 이상 고장 날 확률입니다. 수리 후 다시 정상이어도 과거 고장은 포함합니다.' },
    { field: 'averageIntensity', title: '임무 평균 조건부 고장 강도', symbol: 'CFI avg.', unit: '1/h',
      formula: String.raw`\mathrm{CFI}_{\mathrm{avg}}(T)=\frac{1}{T}\int_0^T\lambda(u)\,du`,
      meaning: '그래프의 각 시점까지 순간 강도를 시간 평균한 값입니다. 같은 시간 동안 이 평균이 일정하게 유지되면 같은 F(t)를 얻습니다.' }
  ];
  return createFtMetricPanel({ model: failureIntensity, metrics, guides: {
      single: '수리율 μ만 높여 다시 계산해 보세요. 임무 종료 시 고장 상태일 확률 Q(T)는 낮아집니다. 정상일 때의 고장률 λ는 같으므로 λ(t)와 CFI avg.는 같은 높이의 수평선이고 F(t) 곡선도 같습니다.',
      or: '서로 독립인 두 부품 중 하나가 고장 나면 시스템이 고장 납니다. λ₁을 높이면 순간 강도와 평균 강도의 수평선이 함께 높아지고 F(t)는 더 빨리 1에 접근합니다.',
      and: '서로 독립인 두 부품이 모두 고장 나야 시스템이 고장 납니다. 처음에는 둘 다 정상이므로 순간 강도는 0입니다. 두 고장률을 같게 두고 T를 늘려 보세요. 순간 강도가 상승하는 구간에서는 그 시점까지의 평균이 순간값보다 낮습니다.'
    },
    details: r => 'Q(T) = ' + formatRepairValue(r.probability) +
      ' · w(T) = ' + formatRepairValue(r.frequency) + ' /h',
    footTitle: '최상위 사건의 고장 발생 빈도 w(t)', footText: '기본 사건 Eᵢ의 상태를 고정해 두 조건부 트리로 나눕니다. 첫 항은 Eᵢ 자체의 고장이 최상위 사건을 일으키는 기여분입니다. 나머지 두 항은 각 상태에서 다른 사건이 일으키는 기여분입니다.', footFormula: String.raw`\begin{aligned}
    w(t)&=w(E_i)[P(\mathrm{TLE}\mid E_i)-P(\mathrm{TLE}\mid\neg E_i)]\\
    &+P(E_i)w(\mathrm{TLE}\mid E_i)\\
    &+P(\neg E_i)w(\mathrm{TLE}\mid\neg E_i)\end{aligned}`
  });
}

function createFtMetricPanel({ model, metrics, guides, details, footTitle, footText, footFormula, displayValue }) {
  const panel = document.createElement('div');
  panel.className = 'expo-calculator repair-integrals';
  panel.innerHTML = `
    <form class="expo-form" novalidate><div class="expo-fields">
      <label>모델<select name="mode"><option value="single">수리 가능한 단일 이벤트</option>
        <option value="or">비수리 OR 게이트</option><option value="and">비수리 AND 게이트</option></select></label>
      <label><span data-first></span><input name="first" value="0.001"></label>
      <label>수리율 μ (1/h)<input name="mu" value="0.01"></label>
      <label>고장률 λ₂ (1/h)<input name="lambda2" value="0.001"></label>
      <label>임무 시간 T (h)<input name="t" value="1000"></label></div>
      <div class="expo-actions"><button>계산</button><p role="status" class="expo-status"></p></div></form>
    <section class="expo-card"><h2 data-model></h2><p data-guide></p><p data-event></p></section>
    <div class="repair-metrics">${metrics.map(m => `<section class="expo-card repair-metric">
      <h2>${m.title}</h2><div class="repair-total"><output></output></div><div class="expo-formula"></div>
      <p>${m.meaning}</p><div class="repair-trend"></div></section>`).join('')}</div>
    <section class="expo-card"><h2>${footTitle}</h2>
    ${footFormula ? '<div class="expo-formula"></div>' : ''}<p>${footText}</p></section>`;
  const equations = metrics.map(m => m.formula).concat(footFormula);
  function render() {
    panel.querySelectorAll('.expo-formula').forEach((el, i) => {
      if (window.katex) window.katex.render(equations[i], el, { displayMode: true, output: 'mathml' });
      else el.textContent = equations[i];
    });
  }
  render();
  if (!window.katex) document.querySelector('#ft-math-renderer')?.addEventListener('load', render, { once: true });
  const form = panel.querySelector('form');
  const { mode, first, mu, lambda2, t } = form.elements;
  const status = panel.querySelector('[role=status]');
  function updateFields() {
    const single = mode.value === 'single';
    panel.querySelector('[data-first]').textContent = single ? '고장률 λ (1/h)' : '고장률 λ₁ (1/h)';
    mu.parentElement.hidden = !single;
    lambda2.parentElement.hidden = single;
  }
  function calculate() {
    const fields = mode.value === 'single' ? { lambda: first, mu, t } : { lambda1: first, lambda2, t };
    const params = Object.fromEntries(Object.entries(fields).map(([name, input]) => [name, input.value]));
    const prepared = model.prepare(mode.value, params);
    for (const input of form.querySelectorAll('input')) input.removeAttribute('aria-invalid');
    if (!prepared.ok) {
      for (const key of prepared.fields) fields[key].setAttribute('aria-invalid', 'true');
      fields[prepared.fields[0]]?.focus();
      status.textContent = '표시된 항목에 0 이상의 유한한 수를 입력하세요. 아래에는 직전 계산 결과가 표시됩니다.';
      return;
    }
    const { inputs, result } = prepared;
    const samples = expoSampleTimes(inputs.t, 128, [inputs.lambda ?? inputs.lambda1, inputs.lambda2 ?? inputs.mu])
      .map(time => ({ time, ...prepared.sample(time) }));
    panel.querySelector('[data-model]').textContent = mode.selectedOptions[0].text + ' · T = ' + inputs.t + ' h';
    panel.querySelector('[data-guide]').textContent = guides[mode.value];
    panel.querySelector('[data-event]').textContent = details(result);
    panel.querySelectorAll('.repair-metric').forEach((card, i) => {
      const m = metrics[i], value = result[m.field];
      card.querySelector('output').textContent = displayValue ? displayValue(m.field, value, result)
        : formatRepairValue(value) + (Number.isFinite(value) ? ' ' + m.unit : '');
      const graph = card.querySelector('.repair-trend');
      const plot = m.plotField ? { ...m, field: m.plotField, unit: m.plotUnit ?? m.unit } : m;
      const points = samples.filter(s => s[plot.field] !== null);
      if (points.length) drawRepairTrend(graph, plot, points, inputs.t);
      else graph.textContent = 'T > 0일 때 평균을 계산합니다.';
    });
    status.textContent = '계산 완료';
  }
  form.addEventListener('input', () => { updateFields(); status.textContent = '계산을 누르면 결과와 그래프가 갱신됩니다.'; });
  form.addEventListener('submit', event => { event.preventDefault(); calculate(); });
  updateFields();
  calculate();
  return panel;
}
