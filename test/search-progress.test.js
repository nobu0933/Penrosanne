import assert from 'node:assert/strict';
import test from 'node:test';
import { createSearchCheckpoint } from '../src/ui/SearchProgress.js';

test('確定配置を24枚追加するごとに進捗を通知し、描画を待って再開する', async () => {
	const updates = [];
	let resume;
	const checkpoint = createSearchCheckpoint({
		now: () => 0,
		onProgress: count => updates.push(count),
		yieldToBrowser: () => new Promise(resolve => { resume = resolve; }),
	});
	for (let forcedCount = 0; forcedCount < 24; forcedCount++) assert.equal(checkpoint({ forcedCount }), undefined);
	let resumed = false;
	const pause = checkpoint({ forcedCount: 24 }).then(() => { resumed = true; });
	assert.deepEqual(updates, [24]);
	assert.equal(resumed, false);
	resume();
	await pause;
	assert.equal(resumed, true);
	assert.equal(checkpoint({ forcedCount: 25 }), undefined);
	const next = checkpoint({ forcedCount: 48 });
	assert.deepEqual(updates, [24, 48]);
	resume();
	await next;
});

test('追加が見つからない頂点の検査中も60msを過ぎればブラウザへ処理を戻す', async () => {
	let time = 0, yields = 0;
	const updates = [];
	const checkpoint = createSearchCheckpoint({
		now: () => time,
		onProgress: count => updates.push(count),
		yieldToBrowser: async () => { yields++; time += 20; },
	});
	time = 59;
	assert.equal(checkpoint({ forcedCount: 0 }), undefined);
	time = 60;
	await checkpoint({ forcedCount: 0 });
	assert.equal(yields, 1);
	assert.deepEqual(updates, [0]);
	// 描画に使った時間は次の探索区間の時間に含めない。
	time = 139;
	assert.equal(checkpoint({ forcedCount: 0 }), undefined);
	time = 140;
	await checkpoint({ forcedCount: 0 });
	assert.equal(yields, 2);
});
