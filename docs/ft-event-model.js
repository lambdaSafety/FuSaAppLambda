const ftEvent = (() => {
  function weightedFrequency(frequency, probability, otherRate, time) {
    if (probability >= 2 ** -1022) return frequency * probability;

    // For a subnormal exposure, 1 − exp(−λt) rounds like λt. Multiply the
    // smallest and largest factors first so λt need not be representable.
    const [smallest, middle, largest] = [frequency, otherRate, time].sort((a, b) => a - b);
    return (smallest * largest) * middle;
  }

  function prepare(parameters) {
    const { lambda1, lambda2, t } = parameters ?? {};
    const first = exponentialDistribution.prepare('non-repair', { lambda: lambda1, t });
    const second = exponentialDistribution.prepare('non-repair', { lambda: lambda2, t });
    if (!first.ok || !second.ok) {
      const fields = [];
      if (first.fields?.includes('lambda')) fields.push('lambda1');
      if (second.fields?.includes('lambda')) fields.push('lambda2');
      if (first.fields?.includes('t')) fields.push('t');
      return { ok: false, fields };
    }

    const rate1 = first.inputs.lambda;
    const rate2 = second.inputs.lambda;
    const missionTime = first.inputs.t;
    const totalRate = rate1 + rate2;
    // The Shannon sum for OR is 1 − S1*S2. Both frequency terms also share
    // S1*S2, so the OR is evaluated as one exponential with the combined rate.
    const orSample = Number.isFinite(totalRate)
      ? exponentialDistribution.prepare('non-repair', { lambda: totalRate, t: missionTime }).sample
      : time => {
        // Form the exposure and scale the frequency without summing the rates.
        const exposure = rate1 * time + rate2 * time;
        const scale = Math.max(rate1, rate2);
        const factor = 1 + Math.min(rate1, rate2) / scale;
        return {
          probability: Math.abs(Math.expm1(-exposure)),
          frequency: exposure > 700
            ? Math.exp(Math.log(scale) + Math.log(factor) - exposure)
            : scale * (factor * Math.exp(-exposure))
        };
      };

    function sample(time) {
      const event1 = first.sample(time);
      const event2 = second.sample(time);
      return {
        or: orSample(time),
        and: {
          probability: event1.probability * event2.probability,
          frequency: weightedFrequency(event1.frequency, event2.probability, rate2, time)
            + weightedFrequency(event2.frequency, event1.probability, rate1, time)
        }
      };
    }

    return {
      ok: true,
      inputs: Object.freeze({ lambda1: rate1, lambda2: rate2, t: missionTime }),
      result: sample(missionTime),
      sample
    };
  }

  function calculate(parameters) {
    const prepared = prepare(parameters);
    return prepared.ok ? { ok: true, ...prepared.result } : prepared;
  }

  return Object.freeze({ calculate, prepare });
})();
