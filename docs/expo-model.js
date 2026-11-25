const exponentialDistribution = (() => {
  // Keep the entered decimal value alongside its binary64 approximation.
  function parseExpoInput(text) {
    const value = text.trim();
    if (value.length > 128) return null;
    const match = /^\+?(?:(\d+)(?:\.(\d*))?|\.(\d+))(?:e([+-]?\d+))?$/i.exec(value);
    if (!match) return null;

    const fraction = match[2] ?? match[3] ?? '';
    const coefficient = BigInt((match[1] ?? '') + fraction);
    if (coefficient === 0n) return { number: 0, coefficient, exponent: 0 };

    const number = Number(value);
    if (!Number.isFinite(number) || number === 0) return null;
    return { number, coefficient, exponent: Number(match[4] ?? 0) - fraction.length };
  }

  function expoMonitoringExposure(lambda, time, interval) {
    if (time.coefficient === 0n || interval.coefficient === 0n) return 0;
    const exponent = Math.min(time.exponent, interval.exponent);
    const ticks = time.coefficient * 10n ** BigInt(time.exponent - exponent);
    const period = interval.coefficient * 10n ** BigInt(interval.exponent - exponent);
    const remainder = ticks % period;
    const age = remainder === 0n ? period : remainder;
    const exposure = age * lambda.coefficient;
    return Number(exposure + 'e' + (exponent + lambda.exponent));
  }

  function expoDecayFrequency(rate, exposure) {
    return exposure > 700 && rate > 0
      ? Math.exp(Math.log(rate) - exposure)
      : rate * Math.exp(-exposure);
  }

  function expoFailureAtExposure(lambda, exposure) {
    return {
      probability: Math.abs(Math.expm1(-exposure)),
      frequency: expoDecayFrequency(lambda, exposure)
    };
  }

  function evaluateExpo(mode, inputs, time, age) {
    const { lambda, mu } = inputs;
    if (lambda === 0) return { probability: 0, frequency: 0 };

    if (mode !== 'repair' || mu === 0) {
      return expoFailureAtExposure(lambda, lambda * (mode === 'monitoring' ? age : time));
    }

    // Scale before summing the rates so lambda + mu cannot overflow.
    const scale = Math.max(lambda, mu);
    const rateFactor = lambda / scale + mu / scale;
    const exposure = (scale * time) * rateFactor;
    const change = Math.abs(Math.expm1(-exposure));
    const failedShare = (lambda / scale) / rateFactor;
    // For small exposures retain lambda * t even when the rate fraction is tiny.
    const probability = exposure < 1
      ? lambda * time * (exposure === 0 ? 1 : change / exposure)
      : failedShare * change;
    const steadyFrequency = Math.min(lambda, mu) / rateFactor;
    const frequency = expoDecayFrequency(lambda, exposure) + steadyFrequency * change;
    return { probability, frequency: Math.min(lambda, frequency) };
  }

  const modelFields = new Map([
    ['non-repair', ['lambda', 't']],
    ['repair', ['lambda', 't', 'mu']],
    ['monitoring', ['lambda', 't', 'tau']]
  ]);

  function prepare(mode, parameters) {
    const required = modelFields.get(mode);
    if (!required) throw new RangeError('Unknown exponential distribution model: ' + mode);

    const values = {};
    const inputs = { lambda: 0, t: 0, mu: 0, tau: 0 };
    const invalid = [];
    for (const field of required) {
      const raw = parameters?.[field];
      const parsed = typeof raw === 'string' || typeof raw === 'number'
        ? parseExpoInput(String(raw))
        : null;
      if (parsed) {
        values[field] = parsed;
        inputs[field] = parsed.number;
      } else {
        invalid.push(field);
      }
    }
    if (invalid.length) return { ok: false, fields: invalid };

    const sample = (time, monitoringAge = 0) => evaluateExpo(mode, inputs, time, monitoringAge);
    const mission = mode === 'monitoring'
      ? expoFailureAtExposure(inputs.lambda, expoMonitoringExposure(values.lambda, values.t, values.tau))
      : sample(inputs.t);
    return { ok: true, inputs: Object.freeze(inputs), result: { ok: true, ...mission }, sample };
  }

  function calculate(mode, parameters) {
    const prepared = prepare(mode, parameters);
    return prepared.ok ? prepared.result : prepared;
  }

  return Object.freeze({ calculate, prepare });
})();
