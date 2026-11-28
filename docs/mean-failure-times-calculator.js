function createMeanFailureTimesCalculator() {
  return createFtMetricPanel({
    model: meanFailureTimes,
    metrics: [
      { field: 'mttf', title: '첫 고장까지 평균 시간', symbol: '∫ R', unit: 'h', plotField: 'truncated',
        formula: String.raw`\mathrm{MTTF}=\int_0^\infty R(t)\,dt,\quad R(t)=1-F(t)`,
        meaning: '결과값은 무한 시간까지의 면적입니다. 그래프는 0부터 각 시점까지 쌓인 생존곡선 아래 면적(h)입니다. T를 늘리면 면적이 MTTF에 접근합니다.' },
      { field: 'mtbf', title: '정상상태 평균 고장 간격', symbol: 'w(t)', unit: 'h', plotField: 'frequency', plotUnit: '1/h',
        formula: String.raw`\mathrm{MTBF}=\lim_{t\to\infty}\frac{1}{w(t)}`,
        meaning: '그래프는 시간당 고장 발생 빈도 w(t)입니다. 수리 가능한 모델에서는 곡선이 수렴하는 높이의 역수가 MTBF입니다. 고장부터 다음 고장까지의 간격에는 수리 시간도 포함됩니다.' },
      { field: 'effective', title: '임무 시간 기준 유효 MTBF', symbol: 'F(t)', unit: 'h', plotField: 'unreliability', plotUnit: '확률',
        formula: String.raw`\mathrm{MTBF}_{\mathrm{eff}}(T)=\frac{\int_0^T R(t)\,dt}{1-R(T)}`,
        meaning: '첫 그래프의 누적 면적을 이 그래프의 누적 고장 확률 F(T)로 나눈 값입니다. 지수분포 단일 이벤트와 OR에서는 두 값이 같은 비율로 증가하므로 유효 MTBF가 일정합니다.' }
    ],
    guides: {
      single: '수리율 μ를 0.01에서 0.001로 낮춰 보세요. 첫 고장까지 걸리는 시간은 같고 수리 시간은 길어집니다. w(t)의 장기값은 낮아지고 MTBF는 커집니다.',
      or: '서로 독립인 비수리 부품 중 하나가 고장 나면 시스템이 고장 납니다. 한 부품의 고장률을 높이면 첫 고장이 빨라져 MTTF가 짧아집니다. 고장 후 복구가 없어 반복 고장 간격은 관측할 수 없습니다.',
      and: '서로 독립인 비수리 부품이 모두 고장 나야 시스템이 고장 납니다. 짧은 임무에서는 F(T)가 작아 유효 MTBF가 큽니다. T를 늘리면 F(T)는 1에, 누적 면적과 유효 MTBF는 MTTF에 접근합니다.'
    },
    displayValue(field, value, result) {
      if (field === 'mtbf' && !result.repeating) return '∞ · 반복 고장 없음';
      if (value === Infinity && !result.possible) return '∞ · 고장 발생 확률 0';
      return formatRepairValue(value) + (Number.isFinite(value) ? ' h' : '');
    },
    details: r => '임무 종료 시 누적 생존 면적 = ' + formatRepairValue(r.truncated) + ' h · F(T) = ' + formatRepairValue(r.unreliability),
    footTitle: '최상위 사건의 고장 발생 빈도',
    footFormula: String.raw`\begin{aligned}w(t)&=w(E_i)[P(\mathrm{TLE}\mid E_i)-P(\mathrm{TLE}\mid\neg E_i)]\\
      &+P(E_i)w(\mathrm{TLE}\mid E_i)+P(\neg E_i)w(\mathrm{TLE}\mid\neg E_i)\end{aligned}`,
    footText: 'FT이벤트와 같은 조건부 전개로 계산합니다. 시점 T의 w(T)는 그래프의 끝점이고, MTBF 계산에는 무한 시간에서의 극한을 사용합니다.'
  });
}
