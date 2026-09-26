import { DEFAULT_CPU_WEIGHTS } from './CpuPlayer.js';
import { deriveSeed, seededRandom } from './SeededRandom.js';

export const TRAINING_FORMAT = 1;
export const TRAINING_SCHEMA = 2;
export const TRAINING_PHASES = Object.freeze(['early', 'middle', 'late']);

export function normalizeCpuWeights(weights = {}) {
	const normalized = { ...DEFAULT_CPU_WEIGHTS };
	for (const [key, value] of Object.entries(weights || {})) if (Number.isFinite(value) && value >= 0) normalized[key] = value;
	return normalized;
}

export function normalizeCpuPolicy(policy = {}) {
	const source = policy.phaseWeights || policy;
	if (TRAINING_PHASES.some(phase => source?.[phase])) return {
		phaseWeights: Object.fromEntries(TRAINING_PHASES.map(phase => [phase, normalizeCpuWeights(source[phase] || source.middle || DEFAULT_CPU_WEIGHTS)])),
	};
	const weights = normalizeCpuWeights(policy.weights || policy);
	return { phaseWeights: Object.fromEntries(TRAINING_PHASES.map(phase => [phase, weights])) };
}

export function phaseForProgress(progress) {
	return progress < 1 / 3 ? 'early' : progress < 2 / 3 ? 'middle' : 'late';
}

export function gamesPerPairBlock(populationSize) {
	return 2 * (populationSize - 1);
}

export function validateTrainingConfig(config) {
	const { populationSize, gamesPerGeneration, generations, mutation, seed } = config;
	if (!Number.isInteger(populationSize) || populationSize < 2 || populationSize > 8) throw new Error('populationSize must be 2–8');
	if (!Number.isInteger(gamesPerGeneration) || gamesPerGeneration < gamesPerPairBlock(populationSize)
		|| gamesPerGeneration % gamesPerPairBlock(populationSize)) throw new Error(`gamesPerGeneration must be a multiple of ${gamesPerPairBlock(populationSize)}`);
	if (!Number.isInteger(generations) || generations < 1 || generations > 100) throw new Error('generations must be 1–100');
	if (!Number.isFinite(mutation) || mutation <= 0 || mutation > 2) throw new Error('mutation must be greater than 0 and at most 2');
	if (!Number.isSafeInteger(seed) || seed < 0) throw new Error('seed must be a non-negative integer');
	return config;
}

export function createGenerationPlan({ generation, baseWeights, config }) {
	validateTrainingConfig(config);
	const base = normalizeCpuPolicy(baseWeights).phaseWeights;
	const keys = [...new Set([...Object.keys(base.middle), ...Object.values(baseWeights?.phaseParents || {}).flatMap(parent => Object.keys(normalizeCpuPolicy(parent).phaseWeights.middle))])];
	const candidates = [{ id: 0, weights: base.middle, phaseWeights: base }];
	for (let id = 1; id < config.populationSize; id++) {
		const random = seededRandom(deriveSeed(config.seed, `generation-${generation}-individual-${id}`));
		const parentPhase = baseWeights?.phaseParents ? TRAINING_PHASES[(id - 1) % TRAINING_PHASES.length] : null;
		const parent = parentPhase && baseWeights.phaseParents[parentPhase]
			? normalizeCpuPolicy(baseWeights.phaseParents[parentPhase]).phaseWeights
			: base;
		const phaseWeights = Object.fromEntries(TRAINING_PHASES.map(phase => {
			const weights = { ...parent[phase] };
			for (let change = 0; change < Math.min(2, keys.length); change++) {
				const key = keys[Math.floor(random() * keys.length)];
				weights[key] = Number((Math.min(100, Math.max(0.001, weights[key]) * Math.exp((random() * 2 - 1) * config.mutation))).toFixed(5));
			}
			return [phase, weights];
		}));
		candidates.push({ id, weights: phaseWeights.middle, phaseWeights, ...(parentPhase ? { parentPhase } : {}) });
	}
	const pairsPerChallenger = config.gamesPerGeneration / gamesPerPairBlock(config.populationSize);
	const schedule = [];
	for (let pair = 0; pair < pairsPerChallenger; pair++) {
		const seed = deriveSeed(config.seed, `generation-${generation}-pair-${pair}`);
		for (let challenger = 1; challenger < config.populationSize; challenger++)
			for (let seat = 0; seat < 2; seat++)
				schedule.push({ challenger, seed, challengerFirst: seat === 0 });
	}
	return { generation, candidates, schedule, config: { populationSize: config.populationSize, gamesPerGeneration: config.gamesPerGeneration, generations: config.generations, mutation: config.mutation, seed: config.seed } };
}

export function completeGeneration(plan, matches, config) {
	if (matches.length !== plan.schedule.length) throw new Error('A generation requires all scheduled games.');
	const standings = plan.candidates.map(candidate => ({ id: candidate.id, wins: 0, draws: 0, losses: 0, scoreDifference: 0, progressScoreDifference: 0, progressEvaluationDifference: 0 }));
	for (const match of matches) {
		const row = standings[match.challenger];
		const difference = match.challengerScore - match.baselineScore;
		row.scoreDifference += difference;
		row.progressScoreDifference += match.progressScoreDifference || 0;
		row.progressEvaluationDifference += match.progressEvaluationDifference || 0;
		if (difference > 0) row.wins++;
		else if (difference < 0) row.losses++;
		else row.draws++;
	}
	// 引き分けを半勝として勝率→得点差の順で比較する。基準個体は50%を基準値とする。
	let championId = 0;
	for (let id = 1; id < standings.length; id++) {
		const row = standings[id], best = standings[championId];
		const points = row.wins + row.draws / 2;
		const bestPoints = championId === 0 ? matches.length / (config.populationSize - 1) / 2 : best.wins + best.draws / 2;
		const bestDifference = championId === 0 ? 0 : best.scoreDifference;
		const bestProgress = championId === 0 ? 0 : best.progressScoreDifference;
		const bestEvaluation = championId === 0 ? 0 : best.progressEvaluationDifference;
		const isBetter = points > bestPoints
			|| (points === bestPoints && row.scoreDifference > bestDifference)
			|| (points === bestPoints && row.scoreDifference === bestDifference && row.progressScoreDifference > bestProgress)
			|| (points === bestPoints && row.scoreDifference === bestDifference && row.progressScoreDifference === bestProgress
				&& row.progressEvaluationDifference > bestEvaluation);
		if (isBetter) championId = id;
	}
	return {
		format: TRAINING_FORMAT, trainingSchema: TRAINING_SCHEMA, method: 'self-play', generation: plan.generation, createdAt: new Date().toISOString(),
		config: { populationSize: config.populationSize, gamesPerGeneration: config.gamesPerGeneration, mutation: config.mutation, seed: config.seed },
		candidates: plan.candidates.map(candidate => ({ ...candidate, ...standings[candidate.id] })),
		championId, championWeights: { phaseWeights: plan.candidates[championId].phaseWeights },
		matches,
	};
}
