import test from 'node:test';
import assert from 'node:assert/strict';
import { recordTournamentResult, roundRobinSchedule } from '../src/ai/TrainingTournament.js';

test('2～4世代の全組み合わせで同じシードの先後交換を行う', () => {
	for (const count of [2, 3, 4]) {
		const schedule = roundRobinSchedule(count);
		assert.equal(schedule.length, count * (count - 1));
		for (let index = 0; index < schedule.length; index += 2) {
			assert.deepEqual(schedule[index].seats, [...schedule[index + 1].seats].reverse());
			assert.equal(schedule[index].seed, schedule[index + 1].seed);
			assert.equal(schedule[index].patternIndex, schedule[index + 1].patternIndex);
		}
	}
});

test('勝分負と得点差を座席に関係なく集計する', () => {
	let results = [0, 1].map(index => ({ index, wins: 0, draws: 0, losses: 0, score: 0, scoreDifference: 0 }));
	results = recordTournamentResult(results, [0, 1], [10, 8]);
	results = recordTournamentResult(results, [1, 0], [7, 7]);
	assert.deepEqual(results.map(item => [item.wins, item.draws, item.losses, item.score, item.scoreDifference]), [[1, 1, 0, 17, 2], [0, 1, 1, 15, -2]]);
});
