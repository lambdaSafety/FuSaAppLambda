const expoModes = [
  {
    id: 'non-repair',
    label: '비수리 (Non-repair)',
    explanation: '임무 시간까지 한 번이라도 고장날 확률입니다.',
    formula: '<mn>1</mn><mo>−</mo><msup><mi>e</mi><mrow><mo>−</mo><mi>λ</mi><mi>t</mi></mrow></msup>'
  },
  {
    id: 'repair',
    label: '수리 (Repair)',
    explanation: '초기에 정상이고 수리 후 정상으로 복귀할 때, 시점 t에 고장 상태일 확률입니다.',
    formula: '<mfrac><mi>λ</mi><mrow><mi>λ</mi><mo>+</mo><mi>μ</mi></mrow></mfrac><mo>·</mo><mo>(</mo><mn>1</mn><mo>−</mo><msup><mi>e</mi><mrow><mo>−</mo><mo>(</mo><mi>λ</mi><mo>+</mo><mi>μ</mi><mo>)</mo><mi>t</mi></mrow></msup><mo>)</mo>'
  },
  {
    id: 'monitoring',
    label: '주기 검사 (Monitoring)',
    explanation: '고장을 발견하면 즉시 복구합니다. 양의 검사 시점 t = nτ에서는 검사 직전 값을 사용하고, 검사 직후에는 확률이 0으로 돌아갑니다. τ = 0이면 유효 경과 시간 a를 0으로 둡니다.',
    formula: '<mn>1</mn><mo>−</mo><msup><mi>e</mi><mrow><mo>−</mo><mi>λ</mi><mi>a</mi><mo>(</mo><mi>t</mi><mo>,</mo><mi>τ</mi><mo>)</mo></mrow></msup>',
    extra: '<p>유효 경과 시간 a는 t 또는 τ가 0이면 0, 양의 검사 시점이면 τ, 그 외에는 t를 τ로 나눈 나머지입니다.</p>'
  }
];

function createExpoCalculator({ selectModel = false } = {}) {
  const panel = document.createElement('div');
  panel.className = 'expo-calculator';
  const modelField = selectModel ? `<label>지수 분포 모델
    <select name="mode">${expoModes.map(mode => `<option value="${mode.id}">${mode.label}</option>`).join('')}</select>
  </label>` : '';
  panel.innerHTML = `
    <form class="expo-form" novalidate>
      <h2>${selectModel ? '기본사상 지수 분포' : '사용자 입력'}</h2>
      <div class="expo-fields">
        ${modelField}
        <label>고장률 λ (1/h)<input name="lambda" type="text" value="1e-8" spellcheck="false" required></label>
        <label>임무 시간 t (h)<input name="t" type="text" value="1000" spellcheck="false" required></label>
        <label>수리율 μ (1/h)<input name="mu" type="text" value="0.1" spellcheck="false" required></label>
        <label>검사 주기 τ (h)<input name="tau" type="text" value="340" spellcheck="false" required></label>
      </div>
      <div class="expo-actions">
        <button type="submit">계산</button>
        <p class="expo-status" role="status"></p>
      </div>
    </form>
    <p class="expo-note">Frequency는 정상 상태에서 고장 상태로 전이하는 순간 빈도입니다. 입력은 소수 또는 과학적 표기법(예: 1e-8)을 사용할 수 있습니다.</p>
    <div class="expo-results"></div>
  `;
  const form = panel.querySelector('form');
  const fields = [...form.querySelectorAll('input')];
  const model = form.elements.namedItem('mode');
  const status = panel.querySelector('.expo-status');
  const results = panel.querySelector('.expo-results');

  function updateVisibleFields() {
    form.elements.mu.parentElement.hidden = model.value !== 'repair';
    form.elements.tau.parentElement.hidden = model.value !== 'monitoring';
  }

  function calculate() {
    const parameters = Object.fromEntries(fields.map(field => [field.name, field.value]));
    const selected = model ? expoModes.filter(mode => mode.id === model.value) : expoModes;
    const evaluations = selected.map(mode => ({
      mode,
      prepared: exponentialDistribution.prepare(mode.id, parameters)
    }));
    const invalidFields = new Set(evaluations.flatMap(({ prepared }) => prepared.ok ? [] : prepared.fields));
    for (const field of fields) {
      if (invalidFields.has(field.name)) field.setAttribute('aria-invalid', 'true');
      else field.removeAttribute('aria-invalid');
    }
    if (invalidFields.size) {
      status.textContent = '강조된 항목에 0 이상의 표현 가능한 수를 입력하세요.' +
        (results.firstElementChild ? ' 마지막으로 계산한 결과를 표시합니다.' : '');
      fields.find(field => invalidFields.has(field.name)).focus();
      return;
    }

    results.replaceChildren();
    for (const { mode, prepared } of evaluations) {
      const { probability, frequency } = prepared.result;
      const format = value => value === 0 ? '0' : value.toExponential(14);
      const card = document.createElement('section');
      card.className = 'expo-card';
      card.innerHTML = `
        <h2>${mode.label}</h2>
        <p>${mode.explanation}</p>
        <div class="expo-formula">
          <math display="block"><mi>P</mi><mo>(</mo><mi>t</mi><mo>)</mo><mo>=</mo>${mode.formula}</math>
        </div>
        ${mode.extra ?? ''}
        <dl class="expo-values">
          <div><dt>확률 P(t)</dt><dd>${format(probability)}</dd></div>
          <div><dt>Frequency (1/h)</dt><dd>${format(frequency)}</dd></div>
        </dl>
        <div class="expo-chart"></div>
      `;
      results.append(card);
      createExpoChart(card.querySelector('.expo-chart'), {
        mode: mode.id,
        inputs: prepared.inputs,
        result: prepared.result,
        evaluate: prepared.sample,
        label: mode.label
      });
    }
    status.textContent = '계산 기준 t = ' + form.elements.t.value.trim() + ' h';
  }

  form.addEventListener('input', event => {
    event.target.removeAttribute('aria-invalid');
    status.textContent = '입력이 변경되었습니다. 계산을 누르면 결과가 갱신됩니다.';
  });
  form.addEventListener('submit', event => {
    event.preventDefault();
    calculate();
  });
  if (model) {
    model.addEventListener('change', () => {
      updateVisibleFields();
      results.replaceChildren();
      calculate();
    });
    updateVisibleFields();
  }
  calculate();
  return panel;
}
