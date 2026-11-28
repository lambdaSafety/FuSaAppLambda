function createPfdPfhCalculator() {
  return createFtMetricPanel({
    model: pfdPfh,
    metrics: [
      {field: 'pfd', title: '평균 요구 시 고장 확률', symbol: 'PFD avg.', unit: '확률',
        formula: String.raw`\mathrm{PFD}_{\mathrm{avg}}(T)=\frac{1}{T}\int_0^T Q(t)\,dt`,
        meaning: '임무 중 임의의 시점에 요구가 한 번 들어올 때, 그 순간 시스템이 고장 상태일 확률입니다. 요구 시점은 임무 구간에서 균일하고 고장 상태와 독립이라고 가정합니다.'},
      {field: 'pfh', title: '임무 시간당 최초 고장 확률', symbol: 'PFH', unit: '1/h',
        formula: String.raw`\mathrm{PFH}(T)=\frac{F(T)}{T},\quad F(T)=1-e^{-\int_0^T\lambda(t)\,dt}`,
        meaning: '이 실습은 임무 중 한 번 이상 고장 날 확률을 임무 시간으로 나눕니다. 수리 후 반복 고장까지 세는 시간당 평균 발생 횟수는 W(T)/T로 별도로 계산합니다.'}
    ],
    guides: {
      single: '수리율 μ만 0.01에서 0.1로 높여 보세요. 수리 시간이 짧아져 PFD 곡선은 낮아집니다. 첫 고장까지의 시간 분포는 같으므로 PFH 곡선은 그대로입니다.',
      or: '독립인 두 부품 중 하나가 고장 나면 시스템이 고장 납니다. T를 늘리면 PFD는 커집니다. 반면 F(T)는 최대 1이므로, F(T)/T는 장시간 임무에서 0에 가까워집니다.',
      and: '독립인 두 부품이 모두 고장 나야 시스템이 고장 납니다. 두 고장률을 0.001/h로 두고 T를 5000 h로 늘려 보세요. PFH 곡선은 처음에 상승하다가 F(t)가 1에 가까워지면서 하락합니다.'
    },
    details: r => '임무 종료 시 고장 상태일 확률 Q(T) = ' + formatRepairValue(r.probability) +
      ' · 임무 중 한 번 이상 고장 날 확률 F(T) = ' + formatRepairValue(r.unreliability),
    footTitle: '그래프의 가로축 읽기',
    footText: '가로축의 각 t를 임무 종료 시점으로 두고 0부터 t까지 다시 계산합니다. 오른쪽 끝 점은 입력한 T의 결과입니다. T = 0에서는 두 평균이 정의되지 않습니다.'
  });
}
