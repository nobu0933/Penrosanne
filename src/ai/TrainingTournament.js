import { deriveSeed } from './SeededRandom.js';

export function roundRobinSchedule(count) {
	if (!Number.isInteger(count) || count < 2 || count > 4) throw new RangeError('Choose 2–4 generations.');
	const schedule = [];
	for (let a = 0; a < count; a++) for (let b = a + 1; b < count; b++) {
		const seed = deriveSeed(74001, `${a}:${b}`), patternIndex = (a + b) % 3;
		schedule.push({ seats: [a, b], seed, patternIndex }, { seats: [b, a], seed, patternIndex });
	}
	return schedule;
}

export function recordTournamentResult(results, seats, scores) {
	const next = results.map(item => ({ ...item }));
	for (const [seat, index] of seats.entries()) {
		const own = scores[seat], other = scores[1 - seat];
		next[index].score += own;
		next[index].scoreDifference += own - other;
		if (own > other) next[index].wins++;
		else if (own < other) next[index].losses++;
		else next[index].draws++;
	}
	return next;
}
