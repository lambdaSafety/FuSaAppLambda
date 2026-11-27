const repairIntegrals = (() => {
  // Scale factors by exact powers of two. For example, (λ/k) may underflow
  // even though (λ/k) * T is a perfectly representable downtime.
  function scaledProduct(factors, divisor = 1) {
    if (factors.includes(0)) return 0;
    const exponentOf = value => Math.min(1023, Math.floor(Math.log2(value)));
    const divisorExponent = exponentOf(divisor);
    let fraction = (2 ** divisorExponent) / divisor;
    let exponent = -divisorExponent;
    for (const value of factors) {
      const power = exponentOf(value);
      fraction *= value / (2 ** power);
      exponent += power;
    }
    while (fraction >= 2) {
      fraction /= 2;
      exponent++;
    }
    while (fraction < 1) {
      fraction *= 2;
      exponent--;
    }
    if (exponent < -1022) return (fraction * 2 ** (exponent + 1074)) * Number.MIN_VALUE;
    return fraction * 2 ** exponent;
  }

  // [x − (1 − exp(−x))] / x², including the limit 1/2 at zero.
  function smallDowntimeFactor(x) {
    let term = 0.5;
    let sum = term;
    for (let n = 3; ; n++) {
      term *= -x / n;
      const next = sum + term;
      if (next === sum) return sum;
      sum = next;
    }
  }

  // Both kernels used below are smooth on bounded, dimensionless intervals.
  function adaptiveSimpson(evaluate, end, stats) {
    function refine(a, b, left, middle, right, whole, budget) {
      const m = (a + b) / 2;
      const lm = evaluate((a + m) / 2);
      const rm = evaluate((m + b) / 2);
      const first = (m - a) / 6 * (left + 4 * lm + middle);
      const second = (b - m) / 6 * (middle + 4 * rm + right);
      const halves = first + second;
      const correction = (halves - whole) / 15;
      if (Math.abs(correction) <= budget || m === a || m === b) {
        stats.panels += 2;
        return halves + correction;
      }
      return refine(a, m, left, lm, middle, first, budget / 2)
        + refine(m, b, middle, rm, right, second, budget / 2);
    }
    const left = evaluate(0);
    const middle = evaluate(end / 2);
    const right = evaluate(end);
    return refine(0, end, left, middle, right, end / 6 * (left + 4 * middle + right), 1e-13);
  }

  function prepare(parameters) {
    const event = exponentialDistribution.prepare('repair', parameters);
    if (!event.ok) return event;
    const { lambda, mu, t } = event.inputs;
    const scale = Math.max(lambda, mu);
    const smallerRate = Math.min(lambda, mu);
    const rateFactor = scale ? 1 + smallerRate / scale : 1;
    const failedShare = scale ? (lambda / scale) / rateFactor : 0;

    function integrals(time, stats) {
      const cumulativeHazard = lambda * time;
      let expectedFailures = 0;
      let expectedDowntime = 0;
      let meanDown = 0;
      if (time > 0 && lambda > 0) {
        const x = (scale * time) * rateFactor;
        if (x < 1) {
          // Integrate Q without subtracting nearly equal numbers. The check
          // integrates (1 − exp(−x*s))/x for 0 <= s <= 1.
          const factor = stats ? adaptiveSimpson(s => {
            const z = x * s;
            return z === 0 ? s : s * (-Math.expm1(-z) / z);
          }, 1, stats) : smallDowntimeFactor(x);
          meanDown = scaledProduct([lambda, time, factor]);
          expectedDowntime = scaledProduct([lambda, time, time, factor]);
          expectedFailures = cumulativeHazard * (1 - meanDown);
        } else {
          // Integrate exp(−u) in time-constant units. Treat the tail exactly
          // so a very long mission can never hide the initial transient.
          let change;
          if (stats) {
            const end = Math.min(x, 40);
            change = adaptiveSimpson(u => Math.exp(-u), end, stats);
            if (x > end) change += Math.exp(-end) * -Math.expm1(-(x - end));
          } else {
            change = -Math.expm1(-x);
          }
          const downFactor = (1 - change / x) / rateFactor;
          meanDown = scaledProduct([lambda, downFactor], scale);
          expectedDowntime = scaledProduct([lambda, time, downFactor], scale);
          // A sum of positive contributions also works for μ = 0 and Q ≈ 1.
          expectedFailures = scaledProduct([smallerRate, time, 1 / rateFactor])
            + failedShare * failedShare * change;
        }
      }
      return {
        expectedFailures, expectedDowntime, cumulativeHazard,
        averageUnavailability: time > 0 ? meanDown : null,
        unreliability: Math.abs(Math.expm1(-cumulativeHazard))
      };
    }

    function sample(time) {
      if (!Number.isFinite(time) || time < 0) throw new RangeError('Time must be finite and nonnegative.');
      return { ...event.sample(time), ...integrals(time) };
    }

    function checkIntegration() {
      const stats = { panels: 0 };
      const numerical = integrals(t, stats);
      return { panels: stats.panels, ...numerical };
    }

    return { ok: true, inputs: Object.freeze({ lambda, mu, t }), result: sample(t), sample, checkIntegration };
  }

  function calculate(parameters) {
    const prepared = prepare(parameters);
    return prepared.ok ? { ok: true, ...prepared.result } : prepared;
  }

  return Object.freeze({ calculate, prepare });
})();
