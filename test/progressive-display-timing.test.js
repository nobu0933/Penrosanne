import assert from 'node:assert/strict';
import test from 'node:test';
import { progressiveDisplayPacing } from '../src/ui/ProgressiveDisplayTiming.js';

test('少数の確定配置は従来の120ms間隔・1枚ずつを維持する', () => {
	for (const count of [0, 1, 4, 8])
		assert.deepEqual(progressiveDisplayPacing(count), { intervalMs: 120, batchSize: 1 });
});

test('多数の確定配置は表示時間と再描画回数を抑え、表示枚数を保つ', () => {
	for (const count of [12, 30, 120, 500]) {
		const { intervalMs, batchSize } = progressiveDisplayPacing(count);
		const frames = Math.ceil(count / batchSize);
		assert.ok(intervalMs < 120);
		assert.ok(frames <= 48);
		assert.ok(frames * intervalMs <= 1000 + 1e-8);
		assert.ok(frames * batchSize >= count);
	}
});
