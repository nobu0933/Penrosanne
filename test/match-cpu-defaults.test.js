import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_CPU_WEIGHTS } from '../src/ai/CpuPlayer.js';
import { MATCH_CPU_A123 } from '../src/ai/MatchCpuDefaults.js';
import { normalizeCpuPolicy } from '../src/ai/TrainingEvolution.js';

test('通常対戦CPUのA123は三段階すべての評価項目を持つ', () => {
	const policy = normalizeCpuPolicy(MATCH_CPU_A123);
	for (const phase of ['early', 'middle', 'late']) {
		assert.deepEqual(Object.keys(policy.phaseWeights[phase]).sort(), Object.keys(DEFAULT_CPU_WEIGHTS).sort());
	}
	assert.equal(policy.phaseWeights.early.immediate, 1.05644);
	assert.equal(policy.phaseWeights.middle.future, 1.08632);
	assert.equal(policy.phaseWeights.late.poachBridge, 1.26387);
});
