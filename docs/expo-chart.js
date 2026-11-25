function createExpoChart(container, { mode, inputs, result, evaluate, label }) {
  const { t, tau, lambda, mu } = inputs;
  const requestedEnd = t === 0 ? (mode === 'monitoring' && tau > 0 ? tau : 1) : t;
  const extendedEnd = t > 0 && t <= Number.MAX_VALUE / 1.2 ? t * 1.2 : requestedEnd;
  const monitoring = mode === 'monitoring' && tau > 0;
  const end = monitoring ? Math.min(extendedEnd, 12 * tau) : extendedEnd;
  const mission = t <= end ? { ...result, x: t / end } : null;
  const points = [];

  function sample(time, age) {
    points.push({ ...evaluate(time, age), x: time / end });
  }

  function sampleTimes(duration, steps, rate) {
    const times = new Set(Array.from({ length: steps + 1 }, (_, step) => duration * (step / steps)));
    // Add points around the exponential transition even on a long time axis.
    if (rate > 0) {
      for (let factor = 1 / 32; factor <= 32; factor *= 2) {
        const time = factor / rate;
        if (time > 0 && time < duration) times.add(time);
      }
    }
    return [...times].sort((a, b) => a - b);
  }

  if (monitoring) {
    // Sample both sides of every inspection within the visible range.
    for (let cycle = 0; cycle < 12; cycle += 1) {
      const from = cycle * tau;
      if (from >= end) break;
      const next = (cycle + 1) * tau;
      const to = Math.min(end, next);
      const duration = next <= end ? tau : to - from;
      for (const age of sampleTimes(duration, 32, lambda)) {
        sample(age === duration ? to : Math.min(to, from + age), age);
      }
    }
  } else {
    const rate = mode === 'repair' ? Math.max(lambda, mu) : lambda;
    for (const time of sampleTimes(end, 224, rate)) {
      sample(time);
    }
  }

  const probabilityMax = Math.max(mission?.probability ?? 0, ...points.map(point => point.probability)) || 1;
  const frequencyMax = Math.max(mission?.frequency ?? 0, ...points.map(point => point.frequency)) || 1;
  const canvas = document.createElement('canvas');
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', label + ' 그래프. 시간은 가로축, 확률은 왼쪽 축, Frequency는 오른쪽 축.');
  canvas.textContent = canvas.getAttribute('aria-label');
  container.append(canvas);

  if (!mission) {
    const note = document.createElement('p');
    note.className = 'expo-chart-note';
    note.textContent = '그래프는 처음 12회 검사 구간을 표시합니다. 입력한 미션 시간은 그래프 범위 밖에 있습니다.';
    container.append(note);
  }

  function formatTick(value) {
    if (value !== 0 && (value < 0.001 || value >= 10000)) return value.toExponential(2);
    return Number(value.toPrecision(3)).toString();
  }

  function draw() {
    const width = Math.max(270, Math.min(container.clientWidth || 660, 660));
    const height = width < 440 ? 266 : 308;
    const scale = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    const context = canvas.getContext('2d');
    if (!context) return;
    context.scale(scale, scale);
    context.font = '12px system-ui, "Malgun Gothic", sans-serif';

    const probabilityColor = '#08786f';
    const frequencyColor = '#6240ab';
    const missionColor = '#4d6372';
    const axesColor = '#607684';
    const divisions = 4;
    const ticks = Array.from({ length: divisions + 1 }, (_, index) => index / divisions);
    const labelWidth = maximum => Math.max(...ticks.map(tick => context.measureText(formatTick(maximum * tick)).width));
    const left = Math.max(46, labelWidth(probabilityMax) + 10);
    const right = width - Math.max(52, labelWidth(frequencyMax) + 10);
    const top = 31;
    const bottom = height - 73;
    const x = ratio => left + (right - left) * ratio;
    const y = ratio => bottom - (bottom - top) * ratio;

    function text(value, horizontal, vertical, color, align = 'left') {
      context.fillStyle = color;
      context.textAlign = align;
      context.fillText(value, horizontal, vertical);
    }

    function line(x1, y1, x2, y2, color) {
      context.strokeStyle = color;
      context.beginPath();
      context.moveTo(x1, y1);
      context.lineTo(x2, y2);
      context.stroke();
    }

    text('확률', left, 17, probabilityColor);
    text('Frequency (1/h)', right, 17, frequencyColor, 'right');
    context.fillStyle = '#f4f8fa';
    context.fillRect(left, top, right - left, bottom - top);
    for (const [index, ratio] of ticks.entries()) {
      const horizontal = x(ratio);
      const vertical = y(ratio);
      line(left, vertical, right, vertical, '#d7e3e8');
      line(horizontal, top, horizontal, bottom, '#d7e3e8');
      text(formatTick(probabilityMax * ratio), left - 6, vertical + 4, probabilityColor, 'right');
      text(formatTick(frequencyMax * ratio), right + 6, vertical + 4, frequencyColor);
      if (width >= 440 || index % 2 === 0) {
        text(formatTick(end * ratio), horizontal, bottom + 17, axesColor, 'center');
      }
    }
    line(left, top, left, bottom, axesColor);
    line(right, top, right, bottom, axesColor);
    line(left, bottom, right, bottom, axesColor);
    text('시간 t (h)', (left + right) / 2, bottom + 36, axesColor, 'center');

    function series(field, maximum, color, dash) {
      context.strokeStyle = color;
      context.lineWidth = 2;
      context.setLineDash(dash);
      context.beginPath();
      for (const [index, point] of points.entries()) {
        const horizontal = x(point.x);
        const vertical = y(point[field] / maximum);
        if (index === 0) context.moveTo(horizontal, vertical);
        else context.lineTo(horizontal, vertical);
      }
      context.stroke();
      context.setLineDash([]);
    }

    if (mission) {
      context.setLineDash([2, 4]);
      line(x(mission.x), top, x(mission.x), bottom, missionColor);
      context.setLineDash([]);
    }
    series('probability', probabilityMax, probabilityColor, []);
    series('frequency', frequencyMax, frequencyColor, [5, 3]);

    if (mission) {
      for (const [value, max, color] of [
        [mission.probability, probabilityMax, probabilityColor],
        [mission.frequency, frequencyMax, frequencyColor]
      ]) {
        context.fillStyle = color;
        context.beginPath();
        context.arc(x(mission.x), y(value / max), 3.5, 0, 2 * Math.PI);
        context.fill();
      }
    }

    function legend(start, labelText, color, dash) {
      context.setLineDash(dash);
      line(start, height - 14, start + 15, height - 14, color);
      context.setLineDash([]);
      text(labelText, start + 20, height - 10, color);
    }

    const legendStart = Math.max(9, (width - (mission ? 246 : 153)) / 2);
    legend(legendStart, '확률', probabilityColor, []);
    legend(legendStart + 60, 'Frequency', frequencyColor, [5, 3]);
    if (mission) legend(legendStart + 153, '미션 시간 t', missionColor, [2, 4]);
  }

  draw();
  if (!container.clientWidth) window.requestAnimationFrame(draw);
}
