import assert from 'node:assert/strict';
import test from 'node:test';
import { DEFAULT_CPU_WEIGHTS } from '../src/ai/CpuPlayer.js';
import { completeGeneration, createGenerationPlan, gamesPerPairBlock, normalizeCpuWeights, validateTrainingConfig } from '../src/ai/TrainingEvolution.js';

const config = { populationSize: 4, gamesPerGeneration: 12, generations: 2, mutation: 0.3, seed: 7 };

test('各挑戦個体は同じシードで先後を交換し、指定対戦数だけ実行する', () => {
	const plan = createGenerationPlan({ generation: 1, baseWeights: DEFAULT_CPU_WEIGHTS, config });
	assert.equal(gamesPerPairBlock(4), 6);
	assert.equal(plan.candidates.length, 4);
	assert.equal(plan.schedule.length, 12);
	for (let index = 0; index < plan.schedule.length; index += 2) {
		const first = plan.schedule[index], second = plan.schedule[index + 1];
		assert.equal(first.challenger, second.challenger);
		assert.equal(first.seed, second.seed);
		assert.equal(first.challengerFirst, true);
		assert.equal(second.challengerFirst, false);
	}
	assert.deepEqual(plan.candidates[0].weights, DEFAULT_CPU_WEIGHTS);
	assert.ok(plan.candidates.slice(1).every(item => Object.keys(item.weights).length === Object.keys(DEFAULT_CPU_WEIGHTS).length));
});

test('勝率を優先し、同率なら得点差で次世代の基準を選ぶ', () => {
	const plan = createGenerationPlan({ generation: 2, baseWeights: DEFAULT_CPU_WEIGHTS, config });
	const matches = plan.schedule.map(item => ({ challenger: item.challenger, challengerScore: 10, baselineScore: 10 }));
	for (const match of matches.filter(item => item.challenger === 1)) { match.challengerScore = 12; match.baselineScore = 10; }
	for (const match of matches.filter(item => item.challenger === 2)) { match.challengerScore = 13; match.baselineScore = 10; }
	const result = completeGeneration(plan, matches, config);
	assert.equal(result.championId, 2);
	assert.deepEqual(result.championWeights.phaseWeights, plan.candidates[2].phaseWeights);
	assert.equal(result.candidates[2].scoreDifference, 12);
	const next = createGenerationPlan({ generation: 3, baseWeights: result.championWeights, config });
	assert.deepEqual(next.candidates[0].phaseWeights, result.championWeights.phaseWeights);
});

test('パラメーターの欠損は現行デフォルトで補い、対戦数の不公平な設定は拒否する', () => {
	assert.equal(normalizeCpuWeights({ immediate: 2 }).immediate, 2);
	assert.equal(normalizeCpuWeights({ immediate: 2 }).future, DEFAULT_CPU_WEIGHTS.future);
	assert.throws(() => validateTrainingConfig({ ...config, gamesPerGeneration: 8 }));
	assert.throws(() => completeGeneration(createGenerationPlan({ generation: 1, baseWeights: {}, config }), [], config));
});
