function formatRepairValue(value, digits = 14) {
  if (value === null) return '정의되지 않음 (T = 0)';
  if (!Number.isFinite(value)) return '표현 범위 초과';
  if (value === 0) return '0';
  if (value < 1e-5 || value >= 1e6) {
    const [coefficient, exponent] = value.toExponential(digits - 1).split('e');
    return Number(coefficient) + 'e' + exponent;
  }
  return Number(value.toPrecision(digits)).toString();
}

function drawRepairTrend(container, metric, samples, end) {
  const { field, symbol, unit, title } = metric;
  const maximum = samples[samples.length - 1][field];
  if (!Number.isFinite(maximum)) {
    container.textContent = '임무 시간의 누적값이 숫자 표현 범위를 초과합니다.';
    return;
  }
  const left = 62, right = 282, top = 25, bottom = 114;
  const x = time => left + (end ? time / end : 0) * (right - left);
  const y = value => bottom - (maximum ? value / maximum : 0) * (bottom - top);
  const path = samples.map((sample, i) =>
    (i ? 'L' : 'M') + x(sample.time).toFixed(3) + ' ' + y(sample[field]).toFixed(3)
  ).join(' ');
  const yTicks = [...new Set([0, maximum / 2, maximum])];
  const xTicks = [...new Set([0, end / 2, end])];
  container.innerHTML = `
    <svg viewBox="0 0 310 157" role="img" aria-label="${title}. 0시간부터 ${formatRepairValue(end)}시간까지, 마지막 값 ${formatRepairValue(maximum)} ${unit}.">
      <text x="${left}" y="14">${symbol} (${unit})</text>
      <rect class="repair-plot-area" x="${left}" y="${top}" width="${right-left}" height="${bottom-top}"></rect>
      ${yTicks.map(value => `
        <line class="repair-gridline" x1="${left}" x2="${right}" y1="${y(value)}" y2="${y(value)}"></line>
        <text x="${left - 5}" y="${y(value) + 4}" text-anchor="end">${formatRepairValue(value, 3)}</text>
      `).join('')}
      ${xTicks.map(time => `
        <line class="repair-gridline" x1="${x(time)}" x2="${x(time)}" y1="${top}" y2="${bottom}"></line>
        <text x="${x(time)}" y="${bottom + 18}" text-anchor="${time > 0 && time === end ? 'end' : 'middle'}">${formatRepairValue(time, 3)}</text>
      `).join('')}
      <path class="repair-curve" d="${path}"></path>
      <circle class="repair-endpoint" cx="${x(end)}" cy="${y(maximum)}" r="3.5"></circle>
      <text x="${(left + right) / 2}" y="152" text-anchor="middle">시간 t (h)</text>
    </svg>`;
}

function createRepairIntegralsCalculator() {
  const sub = (letter, name) => `<msub><mi>${letter}</mi><mi mathvariant="normal">${name}</mi></msub>`;
  const at = variable => `<mo>(</mo><mi>${variable}</mi><mo>)</mo>`;
  const metrics = [
    {
      field: 'expectedFailures', title: '기대 고장 횟수', symbol: 'W(t)', unit: '회',
      lhs: sub('W', 'sys') + at('T'), integrand: 'ω',
      meaning: '임무 중 정상에서 고장으로 전이한 횟수의 기댓값입니다. 수리 뒤 다시 발생한 고장도 셉니다.',
      details: [['frequency', '순간 고장 빈도 ω(T)', 'h⁻¹']]
    },
    {
      field: 'expectedDowntime', title: '기대 비가용 시간', symbol: 'Qavg(t)·t', unit: 'h',
      lhs: sub('Q', 'avg') + at('T') + '<mo>·</mo><mi>T</mi>', integrand: 'Q',
      meaning: '임무 중 고장 상태로 보낸 총시간의 기댓값입니다. 이를 임무 시간 T로 나누면 평균 비가용도입니다.',
      details: [['probability', '시점 비가용도 Q(T)', ''], ['averageUnavailability', '평균 비가용도 Qavg(T)', '']]
    },
    {
      field: 'cumulativeHazard', title: '누적 고장 강도', symbol: 'H(t)', unit: '무차원',
      lhs: '<mi>H</mi>' + at('T'), integrand: 'λ',
      meaning: '정상 상태를 조건으로 한 고장 강도를 누적합니다. 이 모델에서는 H(T) = λT이며, 1 − exp(−H(T))가 임무 중 한 번 이상 고장 날 확률입니다.',
      details: [['unreliability', '한 번 이상 고장 날 확률 F(T)', '']]
    }
  ];
  const panel = document.createElement('div');
  panel.className = 'expo-calculator repair-integrals';
  panel.innerHTML = `
    <form class="expo-form" novalidate>
      <h2>수리 가능한 기본 이벤트</h2>
      <div class="expo-fields">
        <label>고장률 λ (1/h)<input name="lambda" type="text" value="5e-7" spellcheck="false" required></label>
        <label>임무 시간 T (h)<input name="t" type="text" value="1000" spellcheck="false" required></label>
        <label>수리율 μ (1/h)<input name="mu" type="text" value="0.01" spellcheck="false" required></label>
      </div>
      <div class="expo-actions">
        <button type="submit">계산</button>
        <p class="expo-status" role="status"></p>
      </div>
    </form>
    <div class="repair-metrics">
      ${metrics.map(metric => `
        <section class="expo-card repair-metric" data-metric="${metric.field}">
          <h2>${metric.title}</h2>
          <div class="repair-total"><output></output> <span></span></div>
          <math display="block">
            ${metric.lhs}<mo>=</mo><msubsup><mo>∫</mo><mn>0</mn><mi>T</mi></msubsup>
            ${sub(metric.integrand, 'sys')}${at('t')}<mspace width="0.18em"></mspace><mi mathvariant="normal">d</mi><mi>t</mi>
          </math>
          <p>${metric.meaning}</p>
          <div class="repair-trend"></div>
          <dl>${metric.details.map(([field, label]) => `<div><dt>${label}</dt><dd data-value="${field}"></dd></div>`).join('')}</dl>
        </section>
      `).join('')}
    </div>
    <section class="expo-card repair-method">
      <h2>적분 구간과 정밀도</h2>
      <p>처음에는 정상이며 고장률과 수리율은 일정합니다. k = λ + μ &gt; 0일 때 비가용도는 Q<sub>sys</sub>(t) = (λ/k)(1 − e<sup>−kt</sup>)입니다. 고장 빈도는 ω<sub>sys</sub>(t) = λ[1 − Q<sub>sys</sub>(t)]이므로 조건부 고장 강도 λ<sub>sys</sub>(t)는 λ입니다.</p>
      <p>표시값은 지수함수의 해석적 적분식으로 구합니다. 검산할 때는 시간을 시정수 1/(λ + μ)로 환산하고, 한 구간과 두 반쪽 구간의 심프슨 적분값 차이를 15로 나누어 오차를 추정합니다. 허용치를 넘으면 구간과 허용치를 각각 절반으로 나눕니다.</p>
      <p>무차원 적분의 최초 허용치는 10⁻¹³입니다. 40시정수 이후의 지수 꼬리와 상수 고장 강도는 해석식으로 적분합니다.</p>
      <p class="repair-check"></p>
    </section>`;

  const form = panel.querySelector('form');
  const fields = [...form.querySelectorAll('input')];
  const status = form.querySelector('.expo-status');
  const cards = [...panel.querySelectorAll('.repair-metric')];

  function calculate() {
    const parameters = Object.fromEntries(fields.map(field => [field.name, field.value]));
    const prepared = repairIntegrals.prepare(parameters);
    fields.forEach(field => field.removeAttribute('aria-invalid'));
    if (!prepared.ok) {
      const invalid = fields.filter(field => prepared.fields.includes(field.name));
      invalid.forEach(field => field.setAttribute('aria-invalid', 'true'));
      invalid[0]?.focus();
      status.textContent = '강조된 항목에 0 이상의 표현 가능한 수를 입력하세요. 마지막 계산 결과를 표시합니다.';
      return;
    }

    const { lambda, mu, t } = prepared.inputs;
    const rate = Number.isFinite(lambda + mu) ? lambda + mu : Math.max(lambda, mu);
    const samples = expoSampleTimes(t, 128, [rate]).map(time => ({
      time, ...(time === t ? prepared.result : prepared.sample(time))
    }));
    const numerical = prepared.checkIntegration();
    const differences = [];
    metrics.forEach((metric, index) => {
      const card = cards[index];
      const value = prepared.result[metric.field];
      card.querySelector('output').textContent = formatRepairValue(value);
      card.querySelector('.repair-total span').textContent = Number.isFinite(value) ? metric.unit : '';
      for (const [field, , unit] of metric.details) {
        card.querySelector(`[data-value="${field}"]`).textContent =
          formatRepairValue(prepared.result[field]) + (unit ? ' ' + unit : '');
      }
      drawRepairTrend(card.querySelector('.repair-trend'), metric, samples, t);
      if (Number.isFinite(value) && value > 0) {
        differences.push(Math.abs(numerical[metric.field] - value) / value);
      }
    });
    const check = panel.querySelector('.repair-check');
    check.textContent = numerical.panels
      ? '이번 검산에 사용한 심프슨 구간 수 ' + numerical.panels + '개' +
        (differences.length ? ' · 배정밀도로 비교한 최대 상대차 ' + formatRepairValue(Math.max(...differences), 3) : '')
      : '이 입력에서는 세 적분이 모두 0이므로 구간 분할이 필요하지 않습니다.';
    status.textContent = '계산 기준 T = ' + parameters.t.trim() + ' h';
  }
  form.addEventListener('input', event => {
    event.target.removeAttribute('aria-invalid');
    status.textContent = '입력이 변경되었습니다. 계산을 누르면 결과가 갱신됩니다.';
  });
  form.addEventListener('submit', event => {
    event.preventDefault();
    calculate();
  });
  calculate();
  return panel;
}
