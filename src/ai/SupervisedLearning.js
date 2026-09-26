import { Board } from '../game/Board.js';
import { chooseCpuAction } from './CpuPlayer.js';
import { normalizeCpuWeights, phaseForProgress } from './TrainingEvolution.js';

export const MANUAL_LOG_FORMAT = 1;

export function placementKey(tile) {
	return JSON.stringify([
		tile?._handTileId || tile?.id || '', Number(tile?.centerX?.toFixed?.(5) ?? tile?.centerX),
		Number(tile?.centerY?.toFixed?.(5) ?? tile?.centerY), Number(tile?.rotation?.toFixed?.(5) ?? tile?.rotation),
		tile?.matchingPattern ?? null, tile?.terrainPattern ?? null, Boolean(tile?.mirrored), Boolean(tile?.terrainMirrored),
	]);
}

export function captureDecisionState(engine, candidates, gameSeed) {
	const state = engine.state;
	const handCount = Object.values(state.hands || {}).reduce((sum, hand) => sum + hand.length, 0);
	const totalTiles = state.board.tiles.length + state.deck.length + state.discarded.length + handCount + Number(Boolean(state.currentTile));
	return {
		gameSeed, turn: state.turnHistory.length + 1,
		phase: phaseForProgress(state.board.tiles.length / Math.max(1, totalTiles)),
		progress: state.board.tiles.length / Math.max(1, totalTiles),
		side: state.board.side,
		boardTiles: structuredClone(state.board.tiles),
		currentTile: structuredClone(state.currentTile), hands: structuredClone(state.hands),
		players: structuredClone(state.players), turnIndex: state.turn,
		meeples: structuredClone(state.meeples), scored: [...state.scored], countedVertices: [...state.countedVertices],
		discarded: structuredClone(state.discarded), deckRemainingCount: state.deck.length,
		fieldScoring: engine.fieldScoring, rules: structuredClone(engine.rules), titles: structuredClone(engine.titleRules), deckType: engine.deckType, handMode: state.handMode,
		candidates: structuredClone(candidates),
	};
}

function restoreSnapshot(snapshot) {
	const board = new Board(snapshot.side);
	for (const tile of snapshot.boardTiles) board.add(tile);
	const state = {
		players: structuredClone(snapshot.players), turn: snapshot.turnIndex, phase: 'placeTile', board,
		meeples: structuredClone(snapshot.meeples), scored: [...snapshot.scored], countedVertices: [...snapshot.countedVertices],
	};
	const engine = {
		state, rules: structuredClone(snapshot.rules), fieldScoring: snapshot.fieldScoring, tilePool: [],
		candidates: () => snapshot.candidates,
	};
	Object.defineProperty(engine, 'activePlayer', { get: () => state.players[state.turn] });
	return engine;
}

export function rankManualDecision(example, weights) {
	if (!example?.snapshot || !example?.actual?.placement) return null;
	const result = chooseCpuAction(restoreSnapshot(example.snapshot), {
		weights: normalizeCpuWeights(weights), random: () => 0.5,
		rankAll: true, returnRanking: true, tacticalLimit: 0,
	});
	const actualPlacementKey = placementKey(example.actual.placement);
	const rank = result.ranking.findIndex(choice => placementKey(choice.placement) === actualPlacementKey
		&& (choice.meeple?.type ?? null) === (example.actual.meeple?.type ?? null)
		&& (choice.meeple?.index ?? null) === (example.actual.meeple?.index ?? null));
	return { rank: rank < 0 ? result.ranking.length + 1 : rank + 1, options: result.ranking.length, candidateCount: example.snapshot.candidates.length };
}

export async function evaluateManualExamples(examples, weights, { onProgress = () => {}, isCancelled = () => false } = {}) {
	let top1 = 0, top3 = 0, top5 = 0, reciprocalRank = 0, ranked = 0;
	for (let index = 0; index < examples.length; index++) {
		if (isCancelled()) return null;
		const result = rankManualDecision(examples[index], weights);
		if (result) {
			ranked++;
			if (result.rank <= 1) top1++;
			if (result.rank <= 3) top3++;
			if (result.rank <= 5) top5++;
			reciprocalRank += 1 / result.rank;
		}
		if ((index + 1) % 4 === 0 || index + 1 === examples.length) {
			onProgress({ completed: index + 1, total: examples.length });
			await new Promise(resolve => setTimeout(resolve, 0));
		}
	}
	const meanReciprocalRank = ranked ? reciprocalRank / ranked : 0;
	return {
		samples: ranked, top1, top3, top5, meanReciprocalRank,
		fitness: ranked ? (top5 / ranked) * 1000 + (top3 / ranked) * 100 + (top1 / ranked) * 10 + meanReciprocalRank : 0,
	};
}
