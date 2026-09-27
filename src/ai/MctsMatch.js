import { GameEngine } from '../game/GameEngine.js';
import { createPrototypeDeck } from '../game/TileSet.js';
import { chooseCpuAction } from './CpuPlayer.js';
import { createCpuObservation } from './CpuObservation.js';
import { MATCH_CPU_WEIGHTS } from './MatchCpuDefaults.js';
import { createMctsSession } from './MctsCpu.js';
import { deriveSeed, seededRandom } from './SeededRandom.js';
import { phaseForProgress } from './TrainingEvolution.js';

const rules = { allowVerticalMatchingPattern: true, allowTerrainHalfTurn: true,
  allowTerrainMirror: true, ignoreMatchingRules: false };

function weightsFor(game, aggressive = false) {
  const total = game.state.board.tiles.length + game.state.deck.length + game.state.discarded.length + 1;
  const weights = MATCH_CPU_WEIGHTS.phaseWeights[phaseForProgress(game.state.board.tiles.length / total)];
  if (!aggressive) return weights;
  return { ...weights, immediate: weights.immediate * 1.8, obstruction: weights.obstruction * 2.5,
    poach: weights.poach * 2, poachBridge: weights.poachBridge * 1.7, meepleCost: weights.meepleCost * 0.7 };
}

function decide(game, policy, catalog, random, simulations) {
  const legal = game.candidates();
  if (!legal.length) throw new Error('合法なタイル配置がありません。');
  if (policy.kind === 'random') return { placement: legal[Math.floor(random() * legal.length)], meeple: 'random' };
  if (policy.kind === 'mcts') {
    const session = createMctsSession(game, { catalog, parameters: policy.parameters, random,
      rootCandidates: legal, tacticalLimit: 0 });
    for (let count = 0; count < simulations; count++) session.step();
    return session.result();
  }
  return chooseCpuAction(createCpuObservation(game, legal, catalog), {
    weights: weightsFor(game, policy.kind === 'aggressive'), random, tacticalLimit: policy.kind === 'd210' ? 3 : 0,
  });
}

export async function playMctsMatch({ seed, pattern = null, trainingFastFrontier = false, seats, simulations = 2,
  isCancelled = () => false, onTurn = () => {}, yieldControl = () => new Promise(resolve => setTimeout(resolve, 0)),
  allowEarlyStop = false, maxTurns = Infinity } = {}) {
  if ((!pattern && !trainingFastFrontier) || !Array.isArray(seats) || seats.length !== 2)
    throw new Error('固定盤面または学習専用の高速探索と、2つのCPUを指定してください。');
  const game = new GameEngine({ playerCount: 2, deckType: 'standard', handMode: 'single',
    fieldScoring: true, titles: { vertexKing: true }, rules, trainingPattern: pattern, trainingFastFrontier,
    random: seededRandom(deriveSeed(seed, 'deck')) });
  const catalog = createPrototypeDeck(() => 0, 'standard');
  const cpuRandom = seats.map((_, index) => seededRandom(deriveSeed(seed, `mcts-seat-${index}`)));
  const start = performance.now();
  let turns = 0, censored = false;
  while (!game.state.finished) {
    if (isCancelled()) return null;
    if (turns > 180) throw new Error('対局が180手を超えました。');
    const seat = game.state.turn;
    const action = decide(game, seats[seat], catalog, cpuRandom[seat], simulations);
    const available = game.placeTile(action.placement);
    if (game.state.phase === 'placeMeeple') {
      let meeple = action.meeple;
      if (meeple === 'random') {
        const choices = [null, ...available];
        meeple = choices[Math.floor(cpuRandom[seat]() * choices.length)];
      }
      if (meeple && available.some(item => item.type === meeple.type && item.index === meeple.index)) game.placeMeeple(meeple);
      else game.skipMeeple();
    }
    turns++;
    if (turns >= maxTurns) { censored = true; break; }
    if (allowEarlyStop && turns >= 40 && game.state.deck.length <= 8) {
      // A deliberately conservative preview-only abort. It is never counted as a win/loss.
      const difference = game.state.players[0].score - game.state.players[1].score;
      if (Math.abs(difference) > 120) { censored = true; break; }
    }
    if (turns % 4 === 0) { onTurn({ turns, scores: game.state.players.map(player => player.score) }); await yieldControl(); }
  }
  if (censored) {
    const preview = game.forkForSearch({ deck: [] });
    preview.finishGame();
    return { seed, patternSeed: pattern?.seed ?? null, turns, censored, scores: preview.state.players.map(player => player.score),
      elapsedMs: performance.now() - start };
  }
  return { seed, patternSeed: pattern?.seed ?? null, turns, censored,
    scores: game.state.players.map(player => player.score), elapsedMs: performance.now() - start };
}
