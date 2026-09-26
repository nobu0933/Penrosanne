import { GameEngine } from '../game/GameEngine.js';
import { createPrototypeDeck } from '../game/TileSet.js';
import { chooseCpuAction } from './CpuPlayer.js';
import { createCpuObservation } from './CpuObservation.js';
import { deriveSeed, seededRandom } from './SeededRandom.js';
import { normalizeCpuPolicy, phaseForProgress } from './TrainingEvolution.js';

const nextFrame = () => new Promise(resolve => setTimeout(resolve, 0));
const rounded = number => Math.round(number * 100) / 100;

// Web Worker 専用。描画せず、実際の GameEngine の合法候補・配置・採点を使用する。
export async function playBrowserTrainingMatch({ seed, policies, pattern, onTurn = () => {}, isCancelled = () => false }) {
	const game = new GameEngine({
		playerCount: 2, deckType: 'standard', handMode: 'single', fieldScoring: true,
		titles: { vertexKing: true, roadKing: false, supportKing: false },
		rules: { allowVerticalMatchingPattern: true, allowTerrainHalfTurn: true, allowTerrainMirror: true, ignoreMatchingRules: false },
		trainingPattern: pattern, deferCandidateSearch: false,
		random: seededRandom(deriveSeed(seed, 'deck')),
	});
	const catalog = createPrototypeDeck(() => 0, 'standard');
	const cpuRandom = [0, 1].map(index => seededRandom(deriveSeed(seed, `cpu-seat-${index}`)));
	const actions = [], turnEvaluations = [], phaseLeads = {}, phaseEvaluationSums = {}, started = performance.now();
	const totalTiles = game.state.board.tiles.length + game.state.deck.length + game.state.discarded.length + Number(Boolean(game.state.currentTile));
	while (!game.state.finished) {
		if (isCancelled()) return null;
		if (actions.length >= 200) throw new Error('Safety limit of 200 turns exceeded.');
		const playerIndex = game.state.turn, candidates = game.candidates();
		if (!candidates.length) throw new Error('No legal candidate during a turn.');
		const progress = game.state.board.tiles.length / totalTiles, phase = phaseForProgress(progress);
		const policy = normalizeCpuPolicy(policies[playerIndex]);
		const decision = chooseCpuAction(createCpuObservation(game, candidates, catalog), {
			weights: policy.phaseWeights[phase], random: cpuRandom[playerIndex],
			detailedLimit: 12, explorationCount: 4,
		});
		const scoreEventsBefore = game.state.scoreEvents.length;
		game.placeTile(decision.placement);
		if (game.state.phase === 'placeMeeple') {
			const option = decision.meeple && game.meepleOptions().find(item => item.type === decision.meeple.type && item.index === decision.meeple.index);
			if (decision.meeple && !option) throw new Error('CPU selected an illegal meeple position.');
			if (option) game.placeMeeple(option);
			else game.skipMeeple();
		}
		const placed = decision.placement;
		actions.push({
			turn: actions.length + 1, player: playerIndex + 1, tileId: placed.id, shape: placed.shape,
			x: rounded(placed.centerX), y: rounded(placed.centerY), rotation: rounded(placed.rotation),
			meeple: decision.meeple, phase, evaluation: rounded(decision.value), candidateCount: candidates.length,
			points: game.state.scoreEvents.slice(scoreEventsBefore).filter(event => event.reason === 'complete').map(event => ({ playerId: event.playerId, points: event.points, type: event.type })),
		});
		const scores = game.state.players.map(player => player.score), scoreLead = scores[0] - scores[1];
		turnEvaluations.push({ turn: actions.length, phase, player: playerIndex + 1, evaluation: rounded(decision.value), scores, scoreLead });
		phaseLeads[phase] = scoreLead;
		phaseEvaluationSums[phase] ||= [0, 0, 0, 0];
		phaseEvaluationSums[phase][playerIndex * 2] += decision.value;
		phaseEvaluationSums[phase][playerIndex * 2 + 1]++;
		if (actions.length % 5 === 0) onTurn({ turn: actions.length, elapsedMs: Math.round(performance.now() - started) });
		await nextFrame();
	}
	return {
		seed, patternSeed: pattern.seed, turns: actions.length, scores: game.state.players.map(player => player.score),
		discarded: game.state.discarded.length, elapsedMs: Math.round(performance.now() - started), actions,
		turnEvaluations, phaseLeads,
		phaseEvaluations: Object.fromEntries(Object.entries(phaseEvaluationSums).map(([phase, [sum0, count0, sum1, count1]]) => [phase, [count0 ? sum0 / count0 : 0, count1 ? sum1 / count1 : 0]])),
	};
}
