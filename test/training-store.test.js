import test from 'node:test';
import assert from 'node:assert/strict';
import { latestArchiveGeneration, recentTrainingGenerations } from '../src/ai/TrainingStore.js';

const generation = (number, name = '') => ({ generation: number, lineageName: name, championWeights: { immediate: number }, candidates: [], matches: [] });

test('世代JSONから配列順でなく最大世代番号を起点に選ぶ', () => {
	const selected = latestArchiveGeneration({ format: 1, type: 'penrosanne-cpu-generations', generations: [generation(8, 'A'), generation(11, 'A'), generation(9, 'A')] });
	assert.equal(selected.generation, 11);
	assert.equal(selected.lineageName, 'A');
});

test('有効な世代のないJSONは拒否する', () => {
	assert.throws(() => latestArchiveGeneration({ format: 1, generations: [] }), /No valid generations/);
	assert.throws(() => latestArchiveGeneration({ format: 2, generations: [generation(1)] }), /not supported/);
});

test('一時保存は世代番号ではなく保存順で直近10件だけを残す', () => {
	const rows = Array.from({ length: 12 }, (_, index) => ({ ...generation(index % 4, `branch-${index}`), storageId: `id-${index}`, storedAt: index + 1 }));
	const kept = recentTrainingGenerations(rows.reverse());
	assert.deepEqual(kept.map(item => item.storageId), Array.from({ length: 10 }, (_, index) => `id-${index + 2}`));
});
