export const FINAL_SCORE_POINTS_PER_SECOND = 25;

export function scoreProgressAtTime(elapsedMs) {
	return Math.floor(Math.max(0, elapsedMs) * FINAL_SCORE_POINTS_PER_SECOND / 1000);
}

export function finalScoreAtTime(score, elapsedMs) {
	return Math.min(Math.max(0, score), scoreProgressAtTime(elapsedMs));
}

export function finalCrownRanks(players) {
	const distinctScores = [...new Set(players.map((player) => player.score))].sort((a, b) => b - a);
	return new Map(players.map((player) => [
		player.id,
		player.score === distinctScores[0]
			? 'gold'
			: players.length >= 3 && player.score === distinctScores[1] ? 'silver' : null,
	]));
}
