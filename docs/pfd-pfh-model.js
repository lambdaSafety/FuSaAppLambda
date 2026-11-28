const pfdPfh = (() => {
  // Eight-point Gauss–Legendre nodes and weights on [-1, 1] (positive half).
  const nodes = [0.1834346424956498, 0.525532409916329, 0.7966664774136267, 0.9602898564975363];
  const weights = [0.362683783378362, 0.3137066458778873, 0.2223810344533745, 0.1012285362903763];

  function gateMean(mode, x, y) {
    // Integrate on mission fractions. Split at each exponential transient,
    // including for very different event rates and very long missions.
    const ends = new Set([1]);
    for (const exposure of [x, y]) {
      for (const level of [1, 4, 12, 32, 64]) {
        const u = level / exposure;
        if (u > 0 && u < 1) ends.add(u);
      }
    }
    function probability(u) {
      if (mode === 'or') return -Math.expm1(-(x * u + y * u));
      return Math.expm1(-x * u) * Math.expm1(-y * u);
    }
    let left = 0, total = 0;
    for (const right of [...ends].sort((a, b) => a - b)) {
      const width = right - left;
      let mean = 0;
      for (let i = 0; i < nodes.length; i++) {
        const a = left + width * ((1 - nodes[i]) / 2);
        const b = left + width * ((1 + nodes[i]) / 2);
        mean += weights[i] * ((probability(a) + probability(b)) / 2);
      }
      total += width * mean;
      left = right;
    }
    return Math.min(1, total);
  }

  function prepare(mode, parameters) {
    const model = mode === 'single' ? repairIntegrals.prepare(parameters) : failureIntensity.prepare(mode, parameters);
    if (!model.ok) return model;
    const { lambda, lambda1, lambda2, t } = model.inputs;
    function sample(time) {
      const event = model.sample(time);
      let pfd = null, pfh = null;
      if (time > 0) {
        pfd = mode === 'single' ? event.averageUnavailability : gateMean(mode, lambda1 * time, lambda2 * time);
        pfh = event.unreliability / time;
        // Preserve the quotient when the probability itself rounds to a subnormal.
        if (event.unreliability < 2 ** -1022) {
          if (mode === 'and') {
            pfh = Math.min(lambda1, lambda2) * -Math.expm1(-Math.max(lambda1, lambda2) * time);
          } else {
            pfh = mode === 'single' ? lambda : lambda1 + lambda2;
          }
        }
      }
      return { probability: event.probability, unreliability: event.unreliability, pfd, pfh };
    }
    return { ok: true, inputs: model.inputs, result: sample(t), sample };
  }
  function calculate(mode, parameters) {
    const model = prepare(mode, parameters);
    return model.ok ? { ok: true, ...model.result } : model;
  }
  return Object.freeze({ prepare, calculate });
})();
