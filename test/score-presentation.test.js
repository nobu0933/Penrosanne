import test from 'node:test';
import assert from 'node:assert/strict';
import { finalCrownRanks, finalScoreAtTime } from '../src/ui/ScorePresentation.js';

test('終局演出は全員同じ速度で増え、各自の最終得点で止まる', () => {
	assert.equal(finalScoreAtTime(8, 0), 0);
	assert.equal(finalScoreAtTime(8, 200), 5);
	assert.equal(finalScoreAtTime(30, 200), 5);
	assert.equal(finalScoreAtTime(8, 320), 8);
	assert.equal(finalScoreAtTime(30, 320), 8);
	assert.equal(finalScoreAtTime(8, 1200), 8);
	assert.equal(finalScoreAtTime(30, 1200), 30);
});

test('最多得点者は金、3人以上の次点は銀で、同点も同順位になる', () => {
	const ranks = finalCrownRanks([
		{ id:'p1', score:30 }, { id:'p2', score:20 },
		{ id:'p3', score:20 }, { id:'p4', score:10 },
	]);
	assert.deepEqual([...ranks], [['p1','gold'],['p2','silver'],['p3','silver'],['p4',null]]);
	assert.deepEqual([...finalCrownRanks([{id:'p1',score:12},{id:'p2',score:12}])], [['p1','gold'],['p2','gold']]);
});
