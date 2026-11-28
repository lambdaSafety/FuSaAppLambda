const meanFailureTimes = (() => {
  function prepare(mode, parameters) {
    const base = failureIntensity.prepare(mode, parameters);
    if (!base.ok) return base;
    const { lambda, lambda1, lambda2, mu, t } = base.inputs;
    const single = mode === 'single', and = mode === 'and';
    const fast = single ? lambda : Math.max(lambda1, lambda2);
    const slow = single ? 0 : Math.min(lambda1, lambda2);
    const factor = fast ? 1 + slow / fast : 1;
    const orMean = (1 / factor) / fast;
    // E[max(X,Y)] = 1/slow + (slow/fast)/(fast+slow).
    const mttf = and ? 1 / slow + (slow / (fast || 1)) * orMean : orMean;
    const meanFirst = and && slow === 0 ? Infinity : mttf;
    const repeating = single && lambda > 0 && mu > 0;
    const mtbf = repeating ? 1 / lambda + 1 / mu : Infinity;
    function area(time, exposure, mean) {
      if (exposure === 0) return time;
      const change = -Math.expm1(-exposure);
      return exposure < 1 ? time * (change / exposure) : change * mean;
    }
    function sample(time) {
      const event = base.sample(time);
      const x = fast * time, y = slow * time;
      const combined = x + y;
      let truncated = area(time, combined, orMean);
      let effective = orMean;
      if (and) {
        const first = area(time, y, 1 / slow);
        const second = area(time, x, 1 / fast);
        truncated = Math.min(time, first + Math.max(0, second - truncated));
        if (!slow) effective = Infinity;
        else if (event.unreliability >= 2 ** -1022) effective = truncated / event.unreliability;
        else {
          const qFast = -Math.expm1(-x);
          // T/Qslow tends to 1/slow when the joint probability underflows.
          effective = ((truncated / time) / slow) / qFast;
        }
      }
      return { mttf: meanFirst, mtbf, effective: time === 0 ? null : effective,
        truncated, frequency: event.frequency, unreliability: event.unreliability,
        repeating, possible: and ? slow > 0 : fast > 0 };
    }
    return { ok: true, inputs: base.inputs, result: sample(t), sample };
  }
  function calculate(mode, parameters) {
    const model = prepare(mode, parameters);
    return model.ok ? { ok: true, ...model.result } : model;
  }
  return Object.freeze({ prepare, calculate });
})();
