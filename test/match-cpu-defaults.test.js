import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_CPU_WEIGHTS } from '../src/ai/CpuPlayer.js';
import { MATCH_CPU_WEIGHTS } from '../src/ai/MatchCpuDefaults.js';
import { normalizeCpuPolicy } from '../src/ai/TrainingEvolution.js';

test('通常対戦CPUのD210は三段階すべての評価項目を持つ', () => {
	const policy = normalizeCpuPolicy(MATCH_CPU_WEIGHTS);
	for (const phase of ['early', 'middle', 'late']) {
		assert.deepEqual(Object.keys(policy.phaseWeights[phase]).sort(), Object.keys(DEFAULT_CPU_WEIGHTS).sort());
	}
	assert.equal(policy.phaseWeights.early.immediate, 0.60752);
	assert.equal(policy.phaseWeights.middle.future, 0.58642);
	assert.equal(policy.phaseWeights.late.poachBridge, 1.01318);
});
