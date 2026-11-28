const MarkovAnalysis = (() => {
  const modelApi = typeof module !== 'undefined' && module.exports ? require('./markov-model.js') : MarkovModel;
  const sum = values => values.reduce((a, b) => a + b, 0);
  const matrix = (n, value) => Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => value(i, j)));
  const identity = n => matrix(n, (i, j) => Number(i === j));
  function multiply(a, b) {
    const n = a.length;
    const result = matrix(n, () => 0);
    for (let i = 0; i < n; i++) for (let k = 0; k < n; k++) {
      if (a[i][k] === 0) continue;
      for (let j = 0; j < n; j++) result[i][j] += a[i][k] * b[k][j];
    }
    return result;
  }
  function advance(vector, p) {
    const result = vector.map(() => 0);
    for (let i = 0; i < vector.length; i++) {
      if (!vector[i]) continue;
      for (let j = 0; j < vector.length; j++) result[j] += vector[i] * p[i][j];
    }
    return result;
  }
  function normalizeRows(p) {
    return p.map(row => {
      const total = sum(row);
      return row.map(value => value / total);
    });
  }

  // Uniformize a short time step, then double both the transition matrix and
  // its time average. The latter integrates state occupation without sampling error.
  function kernel(rates, time) {
    const n = rates.length;
    const exit = rates.map(sum);
    const speed = Math.max(...exit);
    if (speed === 0 || time === 0) return { p: identity(n), avg: identity(n) };
    const intensity = speed * time;
    if (!Number.isFinite(intensity)) throw Error('전이율과 분석 시간의 곱이 계산 범위를 초과했습니다.');
    const doubles = Math.max(0, Math.ceil(Math.log2(intensity * 2)));
    const a = intensity / 2 ** doubles;
    const step = matrix(n, (i, j) => i === j ? 1 - exit[i] / speed : rates[i][j] / speed);
    let power = identity(n);
    let p = matrix(n, () => 0);
    let avg = matrix(n, () => 0);
    let poisson = Math.exp(-a);
    let integratedPrefactor = 1;
    for (let k = 0; k <= 18; k++) {
      // Integral of exp(-a*x) x^k on [0,1], scaled by (k+1).
      let term = 1;
      let series = 1;
      for (let j = 1; j <= 18; j++) {
        term *= -a / j;
        series += term * (k + 1) / (k + j + 1);
      }
      const weight = integratedPrefactor * series;
      for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
        p[i][j] += poisson * power[i][j];
        avg[i][j] += weight * power[i][j];
      }
      if (poisson < 1e-32 && k > 1) break;
      poisson *= a / (k + 1);
      integratedPrefactor *= a / (k + 2);
      power = multiply(power, step);
    }
    p = normalizeRows(p);
    avg = normalizeRows(avg);
    for (let i = 0; i < doubles; i++) {
      const after = multiply(p, avg);
      avg = normalizeRows(matrix(n, (r, c) => (avg[r][c] + after[r][c]) / 2));
      p = normalizeRows(multiply(p, p));
    }
    return { p, avg };
  }

  function solve(a, b) {
    const rows = a.map((row, i) => [...row, b[i]]);
    const n = rows.length;
    for (let i = 0; i < n; i++) {
      let pivot = i;
      for (let j = i + 1; j < n; j++) if (Math.abs(rows[j][i]) > Math.abs(rows[pivot][i])) pivot = j;
      if (rows[pivot][i] === 0) return null;
      [rows[i], rows[pivot]] = [rows[pivot], rows[i]];
      const divisor = rows[i][i];
      for (let k = i; k <= n; k++) rows[i][k] /= divisor;
      for (let j = 0; j < n; j++) if (j !== i) {
        const factor = rows[j][i];
        for (let k = i; k <= n; k++) rows[j][k] -= factor * rows[i][k];
      }
    }
    const values = rows.map(row => row[n]);
    return values.every(value => Number.isFinite(value) && value >= -1e-9) ? values.map(value => Math.max(0, value)) : null;
  }

  function meanFirst(rates, initial, absorbing, rewards = null) {
    const absorbingSet = new Set(absorbing);
    const reachable = new Set(initial.map((p, i) => p > 0 && !absorbingSet.has(i) ? i : -1).filter(i => i >= 0));
    for (const i of reachable) {
      rates[i].forEach((rate, j) => { if (rate > 0 && !absorbingSet.has(j)) reachable.add(j); });
    }
    if (!reachable.size) return 0;
    const canAbsorb = new Set(absorbing);
    for (const target of canAbsorb) rates.forEach((row, i) => { if (row[target] > 0) canAbsorb.add(i); });
    const visiting = [...reachable];
    if (visiting.some(i => !canAbsorb.has(i))) return Infinity;
    const solution = solve(visiting.map(i => {
      const exit = sum(rates[i]);
      return visiting.map(j => i === j ? 1 : -rates[i][j] / exit);
    }), visiting.map(i => (rewards?.[i] ?? 1) / sum(rates[i])));
    return solution ? sum(solution.map((value, i) => initial[visiting[i]] * value)) : null;
  }

  function firstMeanWithInspection(rates, initial, targets, inspection) {
    if (!inspection.size) return meanFirst(rates, initial, targets);
    if (inspection.size !== 1) return null;
    const [[period, events]] = inspection;
    const absorbed = new Set(targets);
    const generator = rates.map((row, i) => absorbed.has(i) ? row.map(() => 0) : row);
    const { p, avg } = kernel(generator, period);
    const checks = identity(rates.length);
    for (const { from, to, coverage } of events) {
      if (absorbed.has(from)) continue;
      checks[from][from] -= coverage;
      checks[from][to] += coverage;
    }
    if (checks.some((row, index) => row[index] < -1e-12)) {
      throw Error('한 검사 시점에서 한 상태의 전이 확률 합은 1 이하여야 합니다.');
    }
    for (let i = 0; i < checks.length; i++) checks[i][i] = Math.max(0, checks[i][i]);
    const jump = multiply(p, normalizeRows(checks));
    const offDiagonal = jump.map((row, i) => row.map((probability, j) => i === j ? 0 : probability));
    const rewards = avg.map(row => period * sum(row.filter((_, i) => !absorbed.has(i))));
    return meanFirst(offDiagonal, initial, targets, rewards);
  }

  function stationary(rates) {
    const n = rates.length;
    const exit = rates.map(sum);
    const speed = Math.max(...exit);
    if (!speed && n > 1) return null;
    return solve(matrix(n, (i, j) => i === n - 1 ? 1 : (i === j ? -exit[j] : rates[j][i]) / speed),
      Array.from({ length: n }, (_, i) => Number(i === n - 1)));
  }

  function flow(vector, rates, from, to) {
    return sum(from.map(i => vector[i] * sum(to.map(j => rates[i][j]))));
  }

  function trajectory(rates, initial, absorbing, inspections, horizon, steps) {
    const n = initial.length;
    const blocks = new Set(absorbing);
    const q = rates.map((row, i) => blocks.has(i) ? row.map(() => 0) : row);
    const schedules = [...inspections.entries()].filter(([, events]) => events.some(event => !blocks.has(event.from)))
      .map(([interval, events]) => ({ interval, index: 1, events: events.filter(event => !blocks.has(event.from)) }));
    const kernels = new Map();
    let current = initial;
    let now = 0;
    const occupation = initial.map(() => 0);
    const samples = [{ time: 0, vector: initial }];
    function integrate(until) {
      const dt = Math.max(0, until - now);
      if (!dt) return;
      const key = dt.toPrecision(14);
      if (!kernels.has(key)) {
        if (kernels.size >= 24) kernels.clear();
        kernels.set(key, kernel(q, dt));
      }
      const { p, avg } = kernels.get(key);
      advance(current, avg).forEach((value, i) => { occupation[i] += value * dt; });
      current = advance(current, p);
      now = until;
    }
    for (let index = 1; index <= steps; index++) {
      const end = horizon * (index / steps);
      while (schedules.length) {
        const next = Math.min(...schedules.map(schedule => schedule.interval * schedule.index));
        const tolerance = Math.max(next, end) * Number.EPSILON * 8;
        if (next > end + tolerance) break;
        integrate(Math.min(next, end));
        const due = schedules.filter(schedule => Math.abs(schedule.interval * schedule.index - next) <= tolerance);
        const fractions = Array(n).fill(0);
        const moved = Array(n).fill(0);
        for (const schedule of due) {
          schedule.index++;
          for (const { from, to, coverage } of schedule.events) {
            fractions[from] += coverage;
            moved[to] += current[from] * coverage;
          }
        }
        if (fractions.some(fraction => fraction > 1 + 1e-12)) throw Error('같은 검사 시점에서 한 상태의 전이 확률 합은 1 이하여야 합니다.');
        current = current.map((p, i) => p * Math.max(0, 1 - fractions[i]) + moved[i]);
      }
      integrate(end);
      samples.push({ time: end, vector: current });
    }
    return { current, occupation, samples, rates: q };
  }

  function analyze(model, steps = 36) {
    if (!model.states.length) throw Error('분석할 상태를 추가하세요.');
    const states = model.states;
    const ids = new Map(states.map((state, index) => [state.id, index]));
    const initialWeights = states.map(state => state.initial);
    const total = sum(initialWeights);
    if (!(total > 0)) throw Error('초기 확률이 양수인 상태를 지정하세요.');
    const initial = initialWeights.map(weight => weight / total);
    const up = states.map((state, i) => modelApi.isUp(state) ? i : -1).filter(i => i >= 0);
    const down = states.map((_, i) => i).filter(i => !up.includes(i));
    const hazard = down.filter(i => states[i].category === 'dangerous');
    const all = states.map((_, i) => i);
    const nonHazard = all.filter(i => !hazard.includes(i));
    const q = matrix(states.length, () => 0);
    const inspection = new Map();
    let events = 0;
    for (const edge of model.transitions) {
      const from = ids.get(edge.sourceId), to = ids.get(edge.targetId);
      if (states[from].absorbing) continue;
      if (edge.kind === 'inspection' && edge.coverage > 0) {
        const interval = edge.interval || model.interval;
        if (!interval) throw Error('정기 검사 간격을 0보다 크게 입력하세요.');
        if (!inspection.has(interval)) {
          inspection.set(interval, []);
          events += Math.floor(model.horizon / interval);
        }
        inspection.get(interval).push({ from, to, coverage: edge.coverage });
      } else if (edge.kind !== 'inspection') q[from][to] += edge.rate;
    }
    if (events > 2500) throw Error('분석 구간의 검사 시점이 너무 많습니다. 구간을 줄이거나 검사 간격을 늘리세요.');
    const horizon = model.horizon;
    const periodic = inspection.size > 0;
    const actual = trajectory(q, initial, [], inspection, horizon, steps);
    const first = trajectory(q, initial, down, inspection, horizon, steps);
    const danger = !hazard.length ? actual : trajectory(q, initial, hazard, inspection, horizon, steps);
    const restoredFrom = ids.get(model.repairFrom) ?? down[0];
    const repairStart = initial.map((_, i) => Number(i === restoredFrom));
    const restore = restoredFrom === undefined ? null : trajectory(q, repairStart, up, inspection, horizon, steps);
    const mass = (vector, indices) => sum(indices.map(i => vector[i]));
    const availability = mass(actual.current, up);
    const pfd = mass(actual.current, hazard);
    const entering = flow(actual.current, q, up, down);
    const hazardSurvival = mass(danger.current, nonHazard);
    const equilibrium = periodic ? null : stationary(q);
    const steadyAvailability = equilibrium && mass(equilibrium, up);
    const steadyFailure = equilibrium && flow(equilibrium, q, up, down);
    const intervalReliability = equilibrium && mass(advance(equilibrium, kernel(first.rates, horizon).p), up);
    const series = actual.samples.map(({ time, vector }, i) => ({
      time, availability: mass(vector, up), firstFailure: mass(first.samples[i].vector, down),
      pfd: mass(vector, hazard), danger: mass(danger.samples[i].vector, hazard),
      maintainability: restore && mass(restore.samples[i].vector, up)
    }));
    function quantile(probability) {
      const index = series.findIndex(sample => sample.firstFailure >= probability);
      if (index <= 0) return index === 0 ? 0 : null;
      const a = series[index - 1], b = series[index];
      return a.time + (b.time - a.time) * (probability - a.firstFailure) / (b.firstFailure - a.firstFailure);
    }
    return {
      horizon, periodic, commonPeriod: inspection.size === 1, series, probabilities: actual.current, firstProbabilities: first.current,
      equilibrium, exit: q.map(sum), exitFlow: actual.current.map((value, i) => value * sum(q[i])),
      enterFlow: all.map(j => flow(actual.current, q, all, [j])),
      availability, reliability: mass(first.current, up), unreliability: mass(first.current, down),
      pfd, avgPfd: horizon ? mass(actual.occupation, hazard) / horizon : pfd,
      avgAvailability: horizon ? mass(actual.occupation, up) / horizon : availability,
      mttff: firstMeanWithInspection(q, initial, down, inspection),
      mttfh: firstMeanWithInspection(q, initial, hazard, inspection),
      mttr: restore ? firstMeanWithInspection(q, repairStart, up, inspection) : null,
      restrictedLifetime: mass(first.occupation, up),
      median: quantile(0.5), p10: quantile(0.1), p90: quantile(0.9),
      maintainability: restore && mass(restore.current, up), firstDanger: mass(danger.current, hazard),
      entering, hazardRate: hazardSurvival > 0 ? flow(danger.current, q, nonHazard, hazard) / hazardSurvival : null,
      steadyAvailability, steadyFailure, intervalReliability,
      mut: steadyFailure > 0 ? steadyAvailability / steadyFailure : null,
      mdt: steadyFailure > 0 ? mass(equilibrium, down) / steadyFailure : null
    };
  }

  return { analyze };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = MarkovAnalysis;

