import { FEATURE_DATASET_FORMAT, FEATURE_DATASET_VERSION, FEATURE_NAMES } from './FeatureDataset.js';
import { MATCH_CPU_WEIGHTS } from './MatchCpuDefaults.js';
import { seededRandom } from './SeededRandom.js';
import { TRAINING_PHASES } from './TrainingEvolution.js';

export const TRAINING_WEIGHTS = Object.freeze(Object.keys(MATCH_CPU_WEIGHTS.phaseWeights.middle));
const INDEX = Object.fromEntries(FEATURE_NAMES.map((name, index) => [name, index]));
const reviewedNegative = { 'runner-up': 1, risky: 1.35, bad: 1.6 };
const certainty = { confident: 1, uncertain: 0.7, guess: 0.5 };
const clamp = value => Math.min(20, Math.max(0.001, value));

export function validateFeatureDataset(dataset) {
  if (dataset?.format !== FEATURE_DATASET_FORMAT || dataset.version !== FEATURE_DATASET_VERSION
    || JSON.stringify(dataset.featureNames) !== JSON.stringify(FEATURE_NAMES) || !Array.isArray(dataset.decisions)) throw new Error('対応する特徴量JSONではありません。');
  for (const decision of dataset.decisions) {
    if (!TRAINING_PHASES.includes(decision.phase) || !Array.isArray(decision.groups) || !decision.groups.some(group => group.id === decision.selectedId)) throw new Error(`${decision.id}: 採用候補または段階が不正です。`);
    if (decision.groups.some(group => !Array.isArray(group.features) || group.features.length !== FEATURE_NAMES.length || group.features.some(value => !Number.isFinite(value)))) throw new Error(`${decision.id}: 特徴量が不正です。`);
  }
  return dataset;
}

// 事前計算済みベクトルのみを扱う。ここから Board/Rules/Scoring は呼ばない。
export function featureScore(features, weights) {
  const f = name => features[INDEX[name]];
  return weights.immediate * f('immediate')
    + weights.future * (f('futureCity') + f('futureRoad') + f('futureMonastery'))
    + weights.fieldFuture * f('futureField')
    - weights.meepleCost * (f('meepleCost') - f('fieldMeepleCost') + 1.5 * f('lastMeeple'))
    - weights.fieldMeepleCost * f('fieldMeepleCost')
    + weights.vertex * f('vertex') + weights.obstruction * f('obstruction')
    + weights.poach * f('poach') + weights.poachBridge * f('theft')
    + weights.poachProximity * (f('siteMobility') + f('terrainVariety') * 0.25)
    + weights.obstructionMobility * (f('completionOpportunity') - f('completionDeadEnd'))
    + 0.1 * (f('openingCity') + f('openingMonastery') + f('openingField') + f('comeback') - f('fieldClosure'));
}

export function decisionLoss(decision, weights) {
  const selected = decision.groups.find(group => group.id === decision.selectedId);
  if (!selected || decision.conflicting?.includes(selected.id)) return null;
  const selectedScore = featureScore(selected.features, weights);
  let loss = 0, comparisons = 0;
  for (const group of decision.groups) {
    const severity = reviewedNegative[group.rating];
    if (!severity || decision.conflicting?.includes(group.id)) continue;
    const difference = selectedScore - featureScore(group.features, weights);
    // 数値安定なペア比較損失。未検討は負例にしない。
    loss += severity * (Math.max(0, -difference) + Math.log1p(Math.exp(-Math.abs(difference))));
    comparisons++;
  }
  return comparisons ? { loss: loss / comparisons * (certainty[selected.rating] || 1), comparisons } : null;
}

export function datasetLoss(decisions, weights, baseline, { regularization = 0.035 } = {}) {
  let loss = 0, count = 0;
  for (const decision of decisions) {
    const item = decisionLoss(decision, weights);
    if (item) { loss += item.loss; count++; }
  }
  const dataLoss = count ? loss / count : Infinity;
  const penalty = TRAINING_WEIGHTS.reduce((sum, key) => sum + (Math.log(clamp(weights[key])) - Math.log(clamp(baseline[key]))) ** 2, 0);
  return { loss: dataLoss + regularization * penalty, dataLoss, count };
}

function gaussian(random) {
  return Math.sqrt(-2 * Math.log(Math.max(1e-12, random()))) * Math.cos(2 * Math.PI * random());
}
function identity(n) { return Array.from({ length: n }, (_, row) => Array.from({ length: n }, (_, col) => Number(row === col))); }
function cholesky(matrix) {
  const n = matrix.length, lower = Array.from({ length: n }, () => Array(n).fill(0));
  for (let row = 0; row < n; row++) for (let col = 0; col <= row; col++) {
    let value = matrix[row][col];
    for (let k = 0; k < col; k++) value -= lower[row][k] * lower[col][k];
    lower[row][col] = row === col ? Math.sqrt(Math.max(value, 1e-12)) : value / lower[col][col];
  }
  return lower;
}
function multiplyLower(lower, vector) { return lower.map((row, index) => row.slice(0, index + 1).reduce((sum, value, col) => sum + value * vector[col], 0)); }
function fromLog(vector) { return Object.fromEntries(TRAINING_WEIGHTS.map((key, index) => [key, clamp(Math.exp(vector[index]))])); }

export function optimizePhase(decisions, baseline, { iterations = 32, population = 8, seed = 1, regularization = 0.035, onProgress = () => {} } = {}) {
  const informative = decisions.filter(decision => decisionLoss(decision, baseline));
  if (!informative.length) return { weights: { ...baseline }, loss: null, comparisons: 0, iterations: 0 };
  const n = TRAINING_WEIGHTS.length, lambda = Math.max(4, population), mu = Math.floor(lambda / 2), random = seededRandom(seed);
  const recombination = Array.from({ length: mu }, (_, index) => Math.log(mu + 0.5) - Math.log(index + 1));
  const total = recombination.reduce((sum, value) => sum + value, 0), w = recombination.map(value => value / total);
  const muEff = 1 / w.reduce((sum, value) => sum + value * value, 0);
  const cSigma = (muEff + 2) / (n + muEff + 5), dSigma = 1 + 2 * Math.max(0, Math.sqrt((muEff - 1) / (n + 1)) - 1) + cSigma;
  const cc = (4 + muEff / n) / (n + 4 + 2 * muEff / n), c1 = 2 / ((n + 1.3) ** 2 + muEff);
  const cMu = Math.min(1 - c1, 2 * (muEff - 2 + 1 / muEff) / ((n + 2) ** 2 + muEff));
  const expectedNorm = Math.sqrt(n) * (1 - 1 / (4 * n) + 1 / (21 * n * n));
  let mean = TRAINING_WEIGHTS.map(key => Math.log(clamp(baseline[key]))), sigma = 0.28, covariance = identity(n);
  let pSigma = Array(n).fill(0), pC = Array(n).fill(0);
  let best = { weights: { ...baseline }, ...datasetLoss(informative, baseline, baseline, { regularization }) };
  for (let generation = 0; generation < iterations; generation++) {
    const lower = cholesky(covariance), candidates = [];
    // 同じ世代の全個体に同じ局面を使う。先に小標本で選抜し、上位を全件評価する。
    const sample = informative.length <= 24 ? informative : informative.filter((_, index) => (index + generation) % 3 === 0);
    for (let index = 0; index < lambda; index++) {
      const z = Array.from({ length: n }, () => gaussian(random)), y = multiplyLower(lower, z);
      const vector = mean.map((value, dimension) => value + sigma * y[dimension]);
      const weights = fromLog(vector);
      candidates.push({ z, y, weights, sampleLoss: datasetLoss(sample, weights, baseline, { regularization }).loss });
    }
    candidates.sort((a, b) => a.sampleLoss - b.sampleLoss);
    const finalists = candidates.slice(0, Math.min(lambda, Math.max(mu, 4)));
    for (const candidate of finalists) candidate.fullLoss = datasetLoss(informative, candidate.weights, baseline, { regularization }).loss;
    finalists.sort((a, b) => a.fullLoss - b.fullLoss);
    if (finalists[0].fullLoss < best.loss) best = { weights: finalists[0].weights, ...datasetLoss(informative, finalists[0].weights, baseline, { regularization }) };
    const chosen = finalists.slice(0, mu);
    const stepY = Array.from({ length: n }, (_, dimension) => chosen.reduce((sum, candidate, index) => sum + w[index] * candidate.y[dimension], 0));
    const stepZ = Array.from({ length: n }, (_, dimension) => chosen.reduce((sum, candidate, index) => sum + w[index] * candidate.z[dimension], 0));
    mean = mean.map((value, dimension) => value + sigma * stepY[dimension]);
    pSigma = pSigma.map((value, dimension) => (1 - cSigma) * value + Math.sqrt(cSigma * (2 - cSigma) * muEff) * stepZ[dimension]);
    const norm = Math.hypot(...pSigma);
    const hSigma = norm / Math.sqrt(1 - (1 - cSigma) ** (2 * (generation + 1))) < (1.4 + 2 / (n + 1)) * expectedNorm ? 1 : 0;
    pC = pC.map((value, dimension) => (1 - cc) * value + hSigma * Math.sqrt(cc * (2 - cc) * muEff) * stepY[dimension]);
    const old = covariance;
    covariance = old.map((row, i) => row.map((value, j) => {
      let updated = (1 - c1 - cMu) * value + c1 * (pC[i] * pC[j] + (1 - hSigma) * cc * (2 - cc) * value);
      for (let k = 0; k < chosen.length; k++) updated += cMu * w[k] * chosen[k].y[i] * chosen[k].y[j];
      return updated;
    }));
    sigma = Math.max(0.01, Math.min(1.5, sigma * Math.exp((cSigma / dSigma) * (norm / expectedNorm - 1))));
    onProgress({ generation: generation + 1, iterations, bestLoss: best.loss, informative: informative.length });
  }
  return { ...best, comparisons: informative.length, iterations };
}

export function trainFeatureDataset(dataset, options = {}) {
  validateFeatureDataset(dataset);
  const baseline = options.baseline?.phaseWeights || MATCH_CPU_WEIGHTS.phaseWeights;
  const phaseWeights = {}, phases = {};
  for (let index = 0; index < TRAINING_PHASES.length; index++) {
    const phase = TRAINING_PHASES[index], examples = dataset.decisions.filter(decision => decision.phase === phase);
    const result = optimizePhase(examples, baseline[phase], { ...options, seed: (options.seed ?? 1) + index * 1009,
      onProgress: progress => options.onProgress?.({ phase, ...progress }) });
    phaseWeights[phase] = result.weights;
    phases[phase] = { loss: result.loss, dataLoss: result.dataLoss, informative: result.comparisons, examples: examples.length };
  }
  return { format: 'penrosanne-feature-policy', version: 1, createdAt: new Date().toISOString(),
    source: dataset.source, featureDatasetVersion: dataset.version, method: 'CMA-ES',
    options: { iterations: options.iterations ?? 32, population: options.population ?? 8, seed: options.seed ?? 1, regularization: options.regularization ?? 0.035 },
    phases, phaseWeights, baseline };
}
