const failureIntensity = (() => {
  function prepare(mode, parameters) {
    if (!['single', 'or', 'and'].includes(mode)) return { ok: false, fields: ['mode'] };
    const single = mode === 'single';
    const model = single ? repairIntegrals.prepare(parameters) : ftEvent.prepare(parameters);
    if (!model.ok) return model;
    const { lambda, lambda1, lambda2, t } = model.inputs;

    function sample(time) {
      if (!Number.isFinite(time) || time < 0) throw new RangeError('Invalid sample time');
      const events = model.sample(time);
      const event = single ? events : events[mode];
      let intensity, cumulativeHazard, averageIntensity, unreliability;
      if (mode === 'and') {
        // Divide both w and survival by exp(-slow*t) before taking their ratio.
        const slow = Math.min(lambda1, lambda2), fast = Math.max(lambda1, lambda2);
        const ratio = Math.exp(-(fast - slow) * time);
        const qSlow = -Math.expm1(-slow * time), qFast = -Math.expm1(-fast * time);
        const extra = ratio * qSlow;
        const denominator = 1 + extra;
        intensity = slow * (qFast / denominator) + fast * (extra / denominator);
        unreliability = event.probability;
        const correction = Math.log1p(extra);
        cumulativeHazard = unreliability < 0.5 ? -Math.log1p(-unreliability) : slow * time - correction;
        averageIntensity = Number.isFinite(cumulativeHazard) ? cumulativeHazard / time : slow - correction / time;
      } else {
        intensity = single ? lambda : lambda1 + lambda2;
        cumulativeHazard = single ? events.cumulativeHazard : lambda1 * time + lambda2 * time;
        averageIntensity = intensity;
        unreliability = single ? events.unreliability : event.probability;
      }
      return { probability: event.probability, frequency: event.frequency, intensity, cumulativeHazard,
        unreliability, averageIntensity: time === 0 ? null : averageIntensity };
    }
    return { ok: true, inputs: model.inputs, result: sample(t), sample };
  }
  function calculate(mode, parameters) {
    const model = prepare(mode, parameters);
    return model.ok ? { ok: true, ...model.result } : model;
  }
  return Object.freeze({ prepare, calculate });
})();
