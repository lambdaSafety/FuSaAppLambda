function evaluateFaultTree(tree) {
  const nodes = new Map(tree.nodes.map(node => [node.id, node]));
  const children = new Map(tree.nodes.map(node => [node.id, new Set()]));
  const results = new Map();
  const pending = new Set();
  for (const edge of tree.connectors) children.get(edge.targetId).add(edge.sourceId);

  function evaluate(id) {
    if (results.has(id)) return results.get(id);
    if (pending.has(id)) throw new Error('FTA에 순환 연결이 있습니다.');
    pending.add(id);
    const node = nodes.get(id);
    const inputs = Array.from(children.get(id), evaluate);
    const fail = message => { throw new Error(`${node.name} · ${message}`); };
    let result;
    if (node.type === 'event' && inputs.length === 0) {
      result = { ...evaluateFaultTreeEvent(node, tree.missionTime), leaves: new Set([id]) };
    } else if (node.type === 'event' || node.type === 'transfer') {
      if (inputs.length !== 1) fail('하위 기호를 하나 연결하세요. 분기에는 게이트를 사용하세요.');
      result = inputs[0];
    } else {
      if (!inputs.length) fail('게이트에 하위 기호를 연결하세요.');
      const threshold = faultTreeThreshold(node, inputs.length);
      if (threshold > inputs.length) fail(`VOTING 기준 ${threshold}이 입력 수 ${inputs.length}을 초과합니다.`);
      const leaves = new Set();
      for (const input of inputs) {
        for (const leaf of input.leaves) {
          if (leaves.has(leaf)) fail('입력 분기에 동일한 기본 이벤트가 있어 독립 게이트로 계산할 수 없습니다.');
          leaves.add(leaf);
        }
      }
      result = { ...evaluateFaultTreeGate(inputs, threshold), leaves };
    }
    if (!Number.isFinite(result.frequency)) fail('frequency가 계산 가능한 범위를 초과합니다.');
    pending.delete(id);
    results.set(id, result);
    return result;
  }

  for (const node of tree.nodes) evaluate(node.id);
  return results;
}

function evaluateFaultTreeEvent(node, time) {
  if (node.probabilityModel === 'fixed' || node.probabilityModel === 'derived') {
    const probability = node.probabilityModel === 'fixed' ? node.probability : node.derivedPercent / 100;
    return { probability, frequency: 0, survival: 1 - probability };
  }
  const lambda = node.failureRate;
  if (lambda === null) throw new Error(`${node.name} · 고장률 λ (1/h)을 입력하세요.`);
  const mode = node.exponentialMode;
  const { probability, frequency } = exponentialDistribution.calculate(mode, {
    lambda, t: time, mu: node.repairRate, tau: node.inspectionInterval
  });
  // Use λ × availability from the shared model when subtracting from 1 would lose precision.
  const survival = mode === 'non-repair' ? Math.exp(-lambda * time)
    : probability > 0.5 ? frequency / lambda : 1 - probability;
  return { probability, frequency, survival };
}

function faultTreeThreshold(node, inputCount) {
  if (node.type === 'and') return inputCount;
  if (node.type === 'voting') return node.threshold;
  return 1;
}

function faultTreeCutSets(tree, tops, results) {
  const nodes = new Map(tree.nodes.map(node => [node.id, node]));
  const children = new Map(tree.nodes.map(node => [node.id, new Set()]));
  const cache = new Map();
  for (const edge of tree.connectors) children.get(edge.targetId).add(edge.sourceId);

  function setsFor(id) {
    if (cache.has(id)) return cache.get(id);
    const inputs = Array.from(children.get(id), setsFor);
    const sets = inputs.length ? combine(inputs, faultTreeThreshold(nodes.get(id), inputs.length)) : [[id]];
    cache.set(id, sets);
    return sets;
  }

  function combine(inputs, threshold) {
    // Validated input branches have disjoint basic events, so selecting exactly m branches
    // and one minimal cut set from each produces only minimal cut sets.
    const combinations = Array.from({ length: threshold + 1 }, () => []);
    combinations[0] = [[]];
    inputs.forEach((sets, i) => {
      const minimum = Math.max(1, threshold - (inputs.length - i - 1));
      for (let k = Math.min(threshold, i + 1); k >= minimum; k--) {
        for (const prefix of combinations[k - 1]) {
          for (const set of sets) combinations[k].push(prefix.concat(set));
        }
      }
    });
    return combinations[threshold];
  }

  return tops.map(top => ({
    name: top.name,
    rows: setsFor(top.id).map(ids => ({
      order: ids.length,
      names: ids.map(id => nodes.get(id).name),
      probability: ids.reduce((product, id) => product * results.get(id).probability, 1)
    })).sort((first, second) => first.order - second.order)
  }));
}

function evaluateFaultTreeGate(inputs, threshold) {
  if (threshold === 1 || threshold === inputs.length) {
    const any = threshold === 1;
    let probability = any ? 0 : 1;
    let survival = 1 - probability;
    let frequency = 0;
    for (const input of inputs) {
      frequency = any
        ? frequency * input.survival + survival * input.frequency
        : frequency * input.probability + probability * input.frequency;
      if (any) {
        probability += survival * input.probability;
        survival *= input.survival;
      } else {
        survival += probability * input.survival;
        probability *= input.probability;
      }
    }
    return { probability: Math.min(1, probability), survival: Math.min(1, survival), frequency };
  }

  // Track the mass at exactly k failures and the probability and entry frequency of at least k.
  const mass = new Float64Array(threshold);
  const tails = new Float64Array(threshold + 1);
  const densities = new Float64Array(threshold + 1);
  mass[0] = tails[0] = 1;
  for (const input of inputs) {
    for (let k = threshold; k >= 1; k--) {
      densities[k] = input.survival * densities[k] + input.probability * densities[k - 1] + input.frequency * mass[k - 1];
      tails[k] += input.probability * mass[k - 1];
      if (k < threshold) mass[k] = input.survival * mass[k] + input.probability * mass[k - 1];
    }
    mass[0] *= input.survival;
  }
  return { probability: Math.min(1, tails[threshold]), survival: Math.min(1, mass.reduce((sum, value) => sum + value, 0)), frequency: densities[threshold] };
}
