import { DEFAULT_MCTS_PARAMETERS, normalizeMctsParameters } from './MctsCpu.js';

export const MCTS_POPULATION_FORMAT = 'penrosanne-mcts-population-v1';
export const MUTABLE_MCTS_KEYS = Object.freeze(['exploration', 'maxPlies', 'widening', 'rootSamples', 'innerSamples', 'rolloutD210Rate']);

export function parseMctsPopulation(data) {
  if (!data || data.format !== MCTS_POPULATION_FORMAT || !Number.isSafeInteger(data.generation)
    || data.generation < 0 || !Array.isArray(data.individuals) || !data.individuals.length
    || data.individuals.length > 16) throw new Error('MCTS個体群JSONの形式が正しくありません。');
  const ids = new Set();
  const individuals = data.individuals.map((item, index) => {
    if (!item || !Number.isSafeInteger(item.id) || ids.has(item.id) || !item.parameters || typeof item.parameters !== 'object')
      throw new Error(`個体${index + 1}の形式が正しくありません。`);
    ids.add(item.id);
    for (const key of Object.keys(DEFAULT_MCTS_PARAMETERS)) {
      if (!Number.isFinite(item.parameters[key])) throw new Error(`個体${index + 1}の ${key} が不正です。`);
    }
    return { ...item, parameters: normalizeMctsParameters(item.parameters) };
  });
  if (!ids.has(data.championId)) throw new Error('最優秀個体が個体群に含まれていません。');
  return { ...data, individuals };
}

export function initialMctsPopulation() {
  return { format: MCTS_POPULATION_FORMAT, generation: 0, createdAt: new Date().toISOString(),
    championId: 0, individuals: [{ id: 0, parameters: { ...DEFAULT_MCTS_PARAMETERS },
      wins: 0, draws: 0, losses: 0, scoreDifference: 0 }], parameterEffects: {} };
}

export function championOf(population) {
  const parsed = parseMctsPopulation(population);
  return parsed.individuals.find(item => item.id === parsed.championId);
}

const clamp = (number, lower, upper) => Math.min(upper, Math.max(lower, number));

export function spawnMctsCandidates(source, count, mutation, random = Math.random) {
  const population = parseMctsPopulation(source);
  if (!Number.isInteger(count) || count < 2 || count > 8) throw new Error('個体数は2～8にしてください。');
  if (!(mutation > 0 && mutation <= 1)) throw new Error('変異の強さは0～1にしてください。');
  const sorted = [...population.individuals].sort((a, b) => (b.wins + b.draws / 2) / Math.max(1, b.wins + b.draws + b.losses)
    - (a.wins + a.draws / 2) / Math.max(1, a.wins + a.draws + a.losses));
  const leader = championOf(population);
  const candidates = [{ id: 0, parameters: { ...leader.parameters }, parentId: leader.id, source: 'incumbent' }];
  for (let id = 1; id < count; id++) {
    const parent = id % 3 === 0 && sorted.length > 1 ? sorted[1] : leader;
    const parameters = { ...parent.parameters };
    const keys = [...MUTABLE_MCTS_KEYS];
    for (let changes = 0; changes < Math.min(2, keys.length); changes++) {
      const keyWeights = keys.map(key => 1 + Math.min(1, Math.abs(population.parameterEffects?.[key]?.direction || 0)));
      let pick = random() * keyWeights.reduce((sum, value) => sum + value, 0);
      let selected = 0;
      for (; selected < keyWeights.length - 1; selected++) if ((pick -= keyWeights[selected]) < 0) break;
      const key = keys.splice(selected, 1)[0];
      const effect = population.parameterEffects?.[key]?.direction || 0;
      const direction = effect && random() < 0.65 ? Math.sign(effect) : random() < 0.5 ? -1 : 1;
      const amplitude = mutation * (0.3 + random()) * (1 + 0.5 * Math.abs(effect));
      if (key === 'maxPlies' || key === 'rootSamples' || key === 'innerSamples')
        parameters[key] += direction * Math.max(1, Math.round(parameters[key] * amplitude));
      else parameters[key] *= Math.exp(direction * amplitude);
    }
    candidates.push({ id, parameters: normalizeMctsParameters(parameters), parentId: parent.id, source: 'mutation' });
  }
  return candidates;
}

export function summarizeMctsGeneration({ source, candidates, matches, survivors, name = '' }) {
  const rows = candidates.map(item => ({ ...item, wins: 0, draws: 0, losses: 0, scoreDifference: 0,
    censored: 0, partialDifference: 0, opponents: {} }));
  for (const match of matches) {
    const row = rows[match.candidateId];
    if (!row) continue;
    if (match.censored) { row.censored++; row.partialDifference += match.candidateScore - match.opponentScore; continue; }
    const difference = match.candidateScore - match.opponentScore;
    row.scoreDifference += difference;
    if (difference > 0) row.wins++;
    else if (difference < 0) row.losses++;
    else row.draws++;
    const opponent = row.opponents[match.opponent] || { wins: 0, draws: 0, losses: 0, difference: 0 };
    opponent.difference += difference;
    if (difference > 0) opponent.wins++;
    else if (difference < 0) opponent.losses++;
    else opponent.draws++;
    row.opponents[match.opponent] = opponent;
  }
  const quality = row => (row.wins + row.draws / 2) / Math.max(1, row.wins + row.draws + row.losses);
  const elite = rows.filter(row => survivors.includes(row.id)).sort((a, b) => quality(b) - quality(a) || b.scoreDifference - a.scoreDifference);
  if (!elite.length) throw new Error('残す個体がありません。');
  const baseline = candidates[0].parameters, effects = {};
  for (const key of MUTABLE_MCTS_KEYS) {
    let numerator = 0, denominator = 0, samples = 0;
    for (const row of rows.slice(1)) {
      const games = row.wins + row.draws + row.losses;
      const evidence = games + 0.35 * row.censored;
      if (!evidence) continue;
      const delta = (row.parameters[key] - baseline[key]) / Math.max(1, Math.abs(baseline[key]));
      const fullPerformance = games ? quality(row) - 0.5 : 0;
      const partialPerformance = row.censored ? Math.tanh(row.partialDifference / (30 * row.censored)) / 2 : 0;
      numerator += delta * (fullPerformance * games + 0.35 * partialPerformance * row.censored);
      denominator += delta * delta * evidence;
      samples += evidence;
    }
    effects[key] = { direction: denominator ? clamp(numerator / (denominator + 0.1), -1, 1) : 0, samples };
  }
  return { format: MCTS_POPULATION_FORMAT, generation: source.generation + 1, name: String(name).slice(0, 24),
    createdAt: new Date().toISOString(), championId: elite[0].id, individuals: elite,
    parameterEffects: effects, evaluated: rows, matches: matches.map(({ actions, ...match }) => match) };
}
