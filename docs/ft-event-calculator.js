function createFtEventCalculator() {
  const gates = [
    {
      id: 'or',
      title: 'OR 게이트',
      explanation: '기본 이벤트 중 하나 이상이 고장 상태일 때 최상위 이벤트(TLE)가 발생합니다. E₁이 발생하면 TLE가 확정되고, E₁이 발생하지 않으면 TLE는 E₂와 같습니다.',
      equations: [
        String.raw`Q_{\mathrm{OR}}(t) = Q_1(t) + S_1(t)Q_2(t)`,
        String.raw`\omega_{\mathrm{OR}}(t) = \omega_1(t)S_2(t) + S_1(t)\omega_2(t)`
      ]
    },
    {
      id: 'and',
      title: 'AND 게이트',
      explanation: '두 기본 이벤트가 모두 고장 상태일 때 최상위 이벤트(TLE)가 발생합니다. E₁이 발생하면 TLE는 E₂와 같고, E₁이 발생하지 않으면 TLE도 발생하지 않습니다.',
      equations: [
        String.raw`Q_{\mathrm{AND}}(t) = Q_1(t)Q_2(t)`,
        String.raw`\omega_{\mathrm{AND}}(t) = \omega_1(t)Q_2(t) + Q_1(t)\omega_2(t)`
      ]
    }
  ];
  const panel = document.createElement('div');
  panel.className = 'expo-calculator';
  panel.innerHTML = `
    <form class="expo-form" novalidate>
      <h2>사용자 입력</h2>
      <div class="expo-fields">
        <label>기본 이벤트 E₁ 고장률 λ₁ (1/h)<input name="lambda1" type="text" value="1e-8" spellcheck="false" required></label>
        <label>기본 이벤트 E₂ 고장률 λ₂ (1/h)<input name="lambda2" type="text" value="2e-8" spellcheck="false" required></label>
        <label>임무 시간 t (h)<input name="t" type="text" value="1000" spellcheck="false" required></label>
      </div>
      <div class="expo-actions">
        <button type="submit">계산</button>
        <p class="expo-status" role="status"></p>
      </div>
    </form>
    <p class="expo-note">두 기본 이벤트는 처음에 정상이며, 서로 독립인 비수리 지수 분포를 따릅니다. 입력은 소수 또는 과학적 표기법(예: 1e-8)을 사용할 수 있습니다.</p>
    <div class="expo-results">
      ${gates.map(gate => `
        <section class="expo-card" data-gate="${gate.id}">
          <h2>${gate.title}</h2>
          <p>${gate.explanation}</p>
          <div class="expo-formula"></div>
          <dl class="expo-values">
            <div><dt>발생 확률 Q(t)</dt><dd data-value="probability"></dd></div>
            <div><dt>순간 고장 빈도 ω(t) (1/h)</dt><dd data-value="frequency"></dd></div>
          </dl>
          <div class="expo-chart"></div>
        </section>
      `).join('')}
      <section class="expo-card ft-reference">
        <h2>계산식과 조건부 확률</h2>
        <p>기본 이벤트 Eᵢ의 고장 확률은 Qᵢ(t), 생존 확률은 Sᵢ(t)입니다. ωᵢ(t)는 시점 t에 정상에서 고장으로 전이하는 비조건부 순간 빈도입니다.</p>
        <div class="expo-formula ft-basic-equations"></div>
        <p>섀넌 전개는 기본 이벤트 Eᵢ의 고장 여부에 따른 최상위 이벤트의 조건부 확률을 합칩니다. 순간 고장 빈도 식은 Eᵢ 자체의 고장 기여와 두 조건에서의 빈도 기여를 더합니다.</p>
        <div class="expo-formula ft-conditional-equations"></div>
        <p>위 식에 i = 1을 대입합니다. 조건부 TLE가 E₂와 같으면 독립성에 따라 Q₂(t)와 ω₂(t)를 사용합니다. TLE가 항상 발생하거나 항상 발생하지 않는 조건에서는 순간 고장 빈도가 0입니다.</p>
      </section>
    </div>
  `;

  const formulas = [];
  function addEquations(container, equations) {
    for (const latex of equations) {
      const line = document.createElement('div');
      line.className = 'ft-equation';
      const source = document.createElement('code');
      source.textContent = latex;
      line.append(source);
      container.append(line);
      formulas.push({ line, latex });
    }
  }

  const cards = gates.map(gate => {
    const card = panel.querySelector(`[data-gate="${gate.id}"]`);
    addEquations(card.querySelector('.expo-formula'), gate.equations);
    return {
      gate,
      probabilityValue: card.querySelector('[data-value="probability"]'),
      frequencyValue: card.querySelector('[data-value="frequency"]'),
      chart: card.querySelector('.expo-chart')
    };
  });

  addEquations(panel.querySelector('.ft-basic-equations'), [
    String.raw`\begin{aligned}
      Q_i(t) &= 1 - e^{-\lambda_i t}\\
      S_i(t) &= 1 - Q_i(t) = e^{-\lambda_i t}\\
      \omega_i(t) &= \lambda_i S_i(t)
    \end{aligned}`
  ]);
  addEquations(panel.querySelector('.ft-conditional-equations'), [
    String.raw`\begin{aligned}
      Q_{\mathrm{sys}}(t) &= Q_i(t)P(\mathrm{TLE}\mid E_i)\\
        &\quad + S_i(t)P(\mathrm{TLE}\mid \overline{E_i})
    \end{aligned}`,
    String.raw`\begin{aligned}
      \omega_{\mathrm{sys}}(t) &= \omega_i(t)\bigl(p_i^+ - p_i^-\bigr)\\
        &\quad + Q_i(t)\omega(\mathrm{TLE}\mid E_i)\\
        &\quad + S_i(t)\omega(\mathrm{TLE}\mid \overline{E_i})
    \end{aligned}`,
    String.raw`\begin{aligned}
      p_i^+ &= P(\mathrm{TLE}\mid E_i)\\
      p_i^- &= P(\mathrm{TLE}\mid \overline{E_i})
    \end{aligned}`
  ]);
  function renderLatex() {
    for (const { line, latex } of formulas) {
      window.katex.render(latex, line, { displayMode: true, output: 'mathml', throwOnError: false });
    }
  }
  if (window.katex) renderLatex();
  else document.querySelector('#ft-math-renderer')?.addEventListener('load', renderLatex, { once: true });

  const form = panel.querySelector('form');
  const fields = [...form.querySelectorAll('input')];
  const status = panel.querySelector('.expo-status');
  let hasResult = false;

  function formatValue(value) {
    if (!Number.isFinite(value)) return '표현 범위 초과';
    return value === 0 ? '0' : value.toExponential(14);
  }

  function calculate() {
    const parameters = Object.fromEntries(fields.map(field => [field.name, field.value]));
    const prepared = ftEvent.prepare(parameters);
    const invalid = fields.filter(field => !prepared.ok && prepared.fields.includes(field.name));

    for (const field of fields) field.removeAttribute('aria-invalid');
    for (const field of invalid) field.setAttribute('aria-invalid', 'true');
    if (!prepared.ok) {
      status.textContent = '강조된 항목에 0 이상의 표현 가능한 수를 입력하세요.' +
        (hasResult ? ' 마지막으로 계산한 결과를 표시합니다.' : '');
      invalid[0]?.focus();
      return;
    }

    const { lambda1, lambda2, t } = prepared.inputs;
    for (const { gate, probabilityValue, frequencyValue, chart } of cards) {
      const result = prepared.result[gate.id];
      probabilityValue.textContent = formatValue(result.probability);
      frequencyValue.textContent = formatValue(result.frequency);
      chart.replaceChildren();
      createExpoChart(chart, {
        mode: 'non-repair',
        inputs: { t },
        rates: [lambda1, lambda2],
        result,
        evaluate: time => prepared.sample(time)[gate.id],
        label: gate.title,
        probabilityLabel: 'Q(t)',
        frequencyLabel: 'ω(t)'
      });
    }
    hasResult = true;
    status.textContent = '계산 기준 t = ' + parameters.t.trim() + ' h';
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
