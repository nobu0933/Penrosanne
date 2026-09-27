import { GameEngine } from '../game/GameEngine.js';
import { createPrototypeDeck } from '../game/TileSet.js';
import { chooseCpuAction } from '../ai/CpuPlayer.js';
import { createCpuObservation } from '../ai/CpuObservation.js';
import { MATCH_CPU_WEIGHTS } from '../ai/MatchCpuDefaults.js';
import { deriveSeed, seededRandom } from '../ai/SeededRandom.js';
import { normalizeCpuPolicy, phaseForProgress } from '../ai/TrainingEvolution.js';

self.onmessage = ({ data }) => {
	try {
		const seed = Number(data.seed), turns = Number(data.turns);
		const game = new GameEngine({
			playerCount: 2, playerNames: ['プレイヤー1', 'プレイヤー2'],
			deckType: 'standard', handMode: 'single', fieldScoring: true,
			titles: { vertexKing: true },
			rules: { allowVerticalMatchingPattern: true, allowTerrainHalfTurn: true, allowTerrainMirror: true },
			random: seededRandom(deriveSeed(seed, 'deck')),
		});
		const totalTiles = game.state.board.tiles.length + game.state.deck.length + Number(Boolean(game.state.currentTile));
		const catalog = createPrototypeDeck(() => 0, 'standard');
		const policy = normalizeCpuPolicy(MATCH_CPU_WEIGHTS);
		const random = [0, 1].map((index) => seededRandom(deriveSeed(seed, `cpu-seat-${index}`)));
		let played = 0;
		while (played < turns && !game.state.finished) {
			const candidates = game.candidates();
			if (!candidates.length) break;
			const phase = phaseForProgress(game.state.board.tiles.length / totalTiles);
			const decision = chooseCpuAction(createCpuObservation(game, candidates, catalog), {
				weights: policy.phaseWeights[phase], random: random[game.state.turn],
			});
			game.placeTile(decision.placement);
			if (game.state.phase === 'placeMeeple') {
				if (decision.meeple && game.meepleOptions().some((option) => option.type === decision.meeple.type && option.index === decision.meeple.index))
					game.placeMeeple(decision.meeple);
				else game.skipMeeple();
			}
			played++;
			self.postMessage({ type: 'progress', played, turns });
		}
		const { board, ...state } = game.state;
		self.postMessage({ type: 'complete', played, seed, state: structuredClone(state), boardTiles: structuredClone(board.tiles) });
	} catch (error) {
		self.postMessage({ type: 'error', message: error?.message || String(error) });
	}
};
