import { createHash } from 'node:crypto';
import { GameEngine } from '../game/GameEngine.js';
import { chooseCpuAction, DEFAULT_CPU_WEIGHTS } from './CpuPlayer.js';
import { deriveSeed, seededRandom } from './SeededRandom.js';
import { createPrototypeDeck } from '../game/TileSet.js';
import { createCpuObservation } from './CpuObservation.js';
import { normalizeCpuPolicy, phaseForProgress } from './TrainingEvolution.js';

function placementLog(tile) {
	return {
		tileId: tile.id,
		shape: tile.shape,
		x: tile.centerX,
		y: tile.centerY,
		rotation: tile.rotation,
		matchingPattern: tile.matchingPattern ?? null,
		terrainPattern: tile.terrainPattern ?? null,
		mirrored: Boolean(tile.mirrored),
	};
}

export function playStandardMatch({ seed = 1, policies = [DEFAULT_CPU_WEIGHTS, DEFAULT_CPU_WEIGHTS], labels = ['A', 'B'], detailedLimit = 12, explorationCount = 4, trainingPattern = null, onTurn = () => {} } = {}) {
	if (policies.length !== 2 || labels.length !== 2) throw new Error('初版は2人戦のみです。');
	const setupStarted = performance.now();
	const game = new GameEngine({
		playerCount: 2,
		playerNames: labels,
		deckType: 'standard',
		handMode: 'single',
		fieldScoring: true,
		titles: { vertexKing: true, roadKing: false, supportKing: false },
		rules: { allowVerticalMatchingPattern: true, allowTerrainHalfTurn: true, allowTerrainMirror: true, ignoreMatchingRules: false },
		deferCandidateSearch: false,
		trainingPattern,
		random: seededRandom(deriveSeed(seed, 'deck')),
	});
	const initialManifest = [game.state.board.tiles[0], ...game.state.deck, game.state.currentTile];
	const deckFingerprint = createHash('sha256').update(JSON.stringify(initialManifest)).digest('hex');
	const publicCatalog = createPrototypeDeck(() => 0, 'standard');
	// 同一重みを先後交換するとき、席ごとの乱数も同一にして比較の揺れを抑える。
	const cpuRandom = [0, 1].map(index => seededRandom(deriveSeed(seed, `cpu-seat-${index}`)));
	const actions = [], phaseLeads = {};
	const totalTiles = game.state.board.tiles.length + game.state.deck.length + Number(Boolean(game.state.currentTile));
	const started = performance.now();
	let thinkingMs = 0, rulesMs = 0;
	while (!game.state.finished) {
		if (actions.length >= 200) throw new Error('安全上限の200手を超えました。');
		const playerIndex = game.state.turn;
		const candidates = game.candidates();
		if (!candidates.length) throw new Error('手番中に合法候補がありません。');
		const phase = phaseForProgress(game.state.board.tiles.length / totalTiles);
		const policy = normalizeCpuPolicy(policies[playerIndex]);
		const thinkingStarted = performance.now();
		const decision = chooseCpuAction(createCpuObservation(game, candidates, publicCatalog), {
			weights: policy.phaseWeights[phase],
			random: cpuRandom[playerIndex],
			detailedLimit,
			explorationCount,
		});
		thinkingMs += performance.now() - thinkingStarted;
		const scoreEventsBefore = game.state.scoreEvents.length;
		const discardedBefore = game.state.discarded.length;
		const rulesStarted = performance.now();
		game.placeTile(decision.placement);
		if (game.state.phase === 'placeMeeple') {
			if (decision.meeple) {
				if (!game.meepleOptions().some(option => option.type === decision.meeple.type && option.index === decision.meeple.index))
					throw new Error('CPUが選んだミープル位置が実盤面で合法ではありません。');
				game.placeMeeple(decision.meeple);
			} else game.skipMeeple();
		} else if (decision.meeple) throw new Error('ミープルを置く前に手番が終了しました。');
		rulesMs += performance.now() - rulesStarted;
		const completedEvents = game.state.scoreEvents.slice(scoreEventsBefore).filter(event => event.reason === 'complete');
		const scoreLead = game.state.players[0].score - game.state.players[1].score;
		phaseLeads[phase] = scoreLead;
		actions.push({
			turn: actions.length + 1,
			player: playerIndex + 1,
			...placementLog(decision.placement),
			meeple: decision.meeple,
			candidateCount: candidates.length,
			evaluation: Number(decision.value.toFixed(4)),
			phase, scoreLead,
			completedEvents,
			discarded: game.state.discarded.slice(discardedBefore).map(tile => tile.id),
		});
		onTurn({ turn: actions.length, elapsedMs: Math.round(performance.now() - started) });
	}
	const scores = game.state.players.map(player => player.score);
	return {
		seed,
		labels,
		deckType: 'standard',
		trainingPattern: trainingPattern ? { seed: trainingPattern.seed, deckSeed: trainingPattern.deckSeed ?? trainingPattern.seed, strategy: trainingPattern.strategy, forcedCount: trainingPattern.forcedCount, slotCount: game.fixedTrainingLayout.slotCount } : null,
		deckFingerprint,
		startTile: game.state.board.tiles[0].id,
		scores,
		winner: scores[0] === scores[1] ? null : labels[scores[0] > scores[1] ? 0 : 1],
		turns: actions.length,
		phaseLeads,
		discarded: game.state.discarded.map(tile => tile.id),
		elapsedMs: Math.round(performance.now() - started),
		setupMs: Math.round(started - setupStarted),
		thinkingMs: Math.round(thinkingMs),
		rulesMs: Math.round(rulesMs),
		titleAwards: game.state.titleAwards,
		actions,
	};
}
