import { Board } from '../game/Board.js';
import { featureCanReceiveMeeple } from '../game/Rules.js';
import { createCpuObservation } from './CpuObservation.js';
import { chooseCpuAction } from './CpuPlayer.js';
import { publicRemainingTilePool } from './TacticalSearch.js';
import { MATCH_CPU_WEIGHTS } from './MatchCpuDefaults.js';
import { phaseForProgress } from './TrainingEvolution.js';

export const DEFAULT_MCTS_PARAMETERS = Object.freeze({
  exploration: 1.2,
  maxPlies: 3,
  widening: 1.6,
  rootSamples: 28,
  innerSamples: 8,
  rolloutD210Rate: 0.35,
  scoreScale: 30,
});

export function normalizeMctsParameters(raw = {}) {
  const bounded = (key, low, high) => {
    const value = Number(raw[key]);
    return Number.isFinite(value) ? Math.min(high, Math.max(low, value)) : DEFAULT_MCTS_PARAMETERS[key];
  };
  return {
    exploration: bounded('exploration', 0.05, 5),
    maxPlies: Math.round(bounded('maxPlies', 1, 8)),
    widening: bounded('widening', 0.2, 6),
    rootSamples: Math.round(bounded('rootSamples', 4, 100)),
    innerSamples: Math.round(bounded('innerSamples', 2, 30)),
    rolloutD210Rate: bounded('rolloutD210Rate', 0, 1),
    scoreScale: bounded('scoreScale', 5, 100),
  };
}

export function visibleTilesForCpu(engine) {
  const visible = [...engine.state.board.tiles, ...engine.state.discarded];
  if (engine.privatePlanning) for (const player of engine.state.players) visible.push(...engine.handForPlayer(player.id));
  else if (engine.state.currentTile) visible.push(engine.state.currentTile);
  return visible;
}

// Only counts from public information are used. IDs in simulations are private to the fork.
export function sampledRemainingDeck(engine, catalog, random = Math.random, serial = 0) {
  const entries = publicRemainingTilePool(catalog, visibleTilesForCpu(engine));
  const deck = [];
  for (const { tile, copies } of entries) for (let copy = 0; copy < copies; copy++) {
    deck.push({ ...structuredClone(tile), id: `__mcts-${serial}-${deck.length}` });
  }
  for (let index = deck.length - 1; index > 0; index--) {
    const swap = Math.floor(random() * (index + 1));
    [deck[index], deck[swap]] = [deck[swap], deck[index]];
  }
  return deck;
}

// The public pool does not change during one decision. Only the order is
// sampled per simulation; forkForSearch makes the mutable deck copy.
function remainingDeckTemplate(engine, catalog) {
  const entries = publicRemainingTilePool(catalog, visibleTilesForCpu(engine));
  const deck = [];
  for (const { tile, copies } of entries) for (let copy = 0; copy < copies; copy++)
    deck.push({ ...tile, id: `__mcts-pool-${deck.length}` });
  return deck;
}

function shuffleDeckTemplate(template, random) {
  const deck = [...template];
  for (let index = deck.length - 1; index > 0; index--) {
    const swap = Math.floor(random() * (index + 1));
    [deck[index], deck[swap]] = [deck[swap], deck[index]];
  }
  return deck;
}

function policyWeights(engine) {
  const tiles = engine.state.board.tiles.length + engine.state.deck.length + engine.state.discarded.length + 1;
  return MATCH_CPU_WEIGHTS.phaseWeights[phaseForProgress(engine.state.board.tiles.length / Math.max(1, tiles))];
}

function meepleOptionsFor(engine, placement) {
  const options = [null];
  if (!engine.activePlayer.meeples) return options;
  const preview = new Board(engine.state.board.side);
  preview.tiles = [...engine.state.board.tiles, placement];
  for (const type of engine.fieldScoring ? ['city', 'road', 'field'] : ['city', 'road']) {
    for (let index = 0; index < (placement.featureGroups[type]?.length || 0); index++) {
      if (featureCanReceiveMeeple(preview, engine.state, placement, type, index)) options.push({ type, index });
    }
  }
  if (placement.hasMonastery) options.push({ type: 'monastery', index: 0 });
  return options;
}

function actionKey(action) {
  const tile = action.placement;
  return [tile.idPrefix, tile.shape, tile.centerX.toFixed(4), tile.centerY.toFixed(4),
    (((tile.rotation || 0) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2)).toFixed(5),
    tile.matchingPattern || '', tile.terrainPattern || '', Number(Boolean(tile.mirrored)),
    action.meeple?.type || '', action.meeple?.index ?? ''].join(':');
}

function sampledIndices(length, count, random) {
  const selected = new Set();
  while (selected.size < Math.min(length, count)) selected.add(Math.floor(random() * length));
  return [...selected];
}

function actionsFor(engine, catalog, random, limit, baseline = null) {
  const legal = engine.candidates();
  if (!legal.length) return [];
  let ranked = baseline;
  if (!ranked) {
    ranked = chooseCpuAction(createCpuObservation(engine, legal, catalog), {
      weights: policyWeights(engine), random, detailedLimit: Math.min(2, legal.length),
      explorationCount: Math.min(1, Math.max(0, legal.length - 2)), tacticalLimit: 0, returnRanking: true,
    });
  }
  const seen = new Set(), result = [];
  const add = (action) => {
    const key = actionKey(action);
    if (!seen.has(key)) { seen.add(key); result.push({ placement: action.placement, meeple: action.meeple ?? null,
      key, visits: 0, valueSum: 0, outcomes: new Map() }); }
  };
  // Guaranteed D210 baseline, then distinct low-ranked placements from the whole legal set.
  add(ranked);
  for (const item of (ranked.ranking || []).slice(0, Math.max(2, Math.floor(limit / 4)))) add(item);
  const indices = sampledIndices(legal.length, Math.max(0, limit - result.length), random);
  for (const index of indices) {
    const placement = legal[index], options = meepleOptionsFor(engine, placement);
    add({ placement, meeple: options[Math.floor(random() * options.length)] });
  }
  return result;
}

function chooseTreeAction(node, playerId, rootPlayerId, parameters, random, forceDiverse = false) {
  if (forceDiverse) {
    const unseen = node.actions.filter(action => !action.visits);
    if (unseen.length) return unseen[Math.floor(random() * unseen.length)];
  }
  const available = Math.min(node.actions.length, Math.max(1, 1 + Math.floor(parameters.widening * Math.sqrt(node.visits + 1))));
  const pool = node.actions.slice(0, available);
  const unvisited = pool.filter(action => !action.visits);
  if (unvisited.length) return unvisited[Math.floor(random() * unvisited.length)];
  const sign = playerId === rootPlayerId ? 1 : -1;
  let best = null, bestValue = -Infinity;
  for (const action of pool) {
    const value = sign * action.valueSum / action.visits
      + parameters.exploration * Math.sqrt(Math.log(node.visits + 1) / action.visits);
    if (value > bestValue) { bestValue = value; best = action; }
  }
  return best;
}

function applyAction(game, action, profile = null) {
  // A chance child may be revisited with a different physical copy of the same
  // tile kind. Rebind the stored action to this fork's current tile ID.
  const key = action.key || actionKey(action);
  const lookupStart = profile ? performance.now() : 0;
  const placement = game.candidates().find(candidate => actionKey({ placement: candidate, meeple: action.meeple }) === key);
  if (profile) profile.lookupMs = (profile.lookupMs || 0) + performance.now() - lookupStart;
  if (!placement) throw new Error('探索木の手が現在の局面で合法ではありません。');
  const placeStart = profile ? performance.now() : 0;
  const options = game.placeTile(placement);
  if (profile) profile.placeTileMs = (profile.placeTileMs || 0) + performance.now() - placeStart;
  if (game.state.phase !== 'placeMeeple') return;
  const meepleStart = profile ? performance.now() : 0;
  if (action.meeple && options.some(option => option.type === action.meeple.type && option.index === action.meeple.index))
    game.placeMeeple(action.meeple);
  else game.skipMeeple();
  if (profile) profile.meepleMs = (profile.meepleMs || 0) + performance.now() - meepleStart;
}

function rolloutAction(engine, catalog, random, parameters) {
  const legal = engine.candidates();
  if (!legal.length) return null;
  if (random() < parameters.rolloutD210Rate) return chooseCpuAction(createCpuObservation(engine, legal, catalog), {
    weights: policyWeights(engine), random, detailedLimit: Math.min(2, legal.length),
    explorationCount: 0, tacticalLimit: 0,
  });
  const placement = legal[Math.floor(random() * legal.length)];
  const options = meepleOptionsFor(engine, placement);
  return { placement, meeple: options[Math.floor(random() * options.length)] };
}

function leafValue(game, rootPlayerId, scale) {
  // An isolated fork can be finalized without modifying the actual match.
  if (!game.state.finished) game.finishGame();
  const self = game.state.players.find(player => player.id === rootPlayerId);
  const opponent = game.state.players.find(player => player.id !== rootPlayerId);
  return Math.tanh((self.score - opponent.score) / scale);
}

function newNode() { return { visits: 0, actions: null }; }
function tileKind(tile) { return tile ? `${tile.shape}:${tile.idPrefix}` : 'finished'; }

export function createMctsSession(engine, { catalog, parameters = {}, random = Math.random,
  rootCandidates = engine.candidates(), tacticalLimit = 3, profile = null, reuseCandidates = true } = {}) {
  if (!catalog?.length) throw new Error('MCTS には公開山札の定義が必要です。');
  if (engine.state.players.length !== 2 || engine.privatePlanning || engine.state.phase !== 'placeTile')
    throw new Error('MCTS 初版は2人・手札1枚の配置フェーズ専用です。');
  const config = normalizeMctsParameters(parameters);
  const observation = createCpuObservation(engine, rootCandidates, catalog);
  const fallback = chooseCpuAction(observation, { weights: policyWeights(engine), random, tacticalLimit,
    returnRanking: true });
  const deckTemplate = remainingDeckTemplate(engine, catalog);
  const candidateCache = reuseCandidates ? new Map() : null;
  const root = newNode(), rootPlayerId = engine.activePlayer.id;
  root.actions = actionsFor(engine, catalog, random, config.rootSamples, fallback);
  const pendingRoot = [...rootCandidates];
  for (let index = pendingRoot.length - 1; index > 0; index--) {
    const swap = Math.floor(random() * (index + 1));
    [pendingRoot[index], pendingRoot[swap]] = [pendingRoot[swap], pendingRoot[index]];
  }
  const rootKeys = new Set(root.actions.map(action => action.key));
  let simulations = 0;
  return {
    fallback,
    get simulations() { return simulations; },
    step() {
      const timed = (key, action) => {
        if (!profile) return action();
        const start = performance.now();
        try { return action(); }
        finally { profile[key] = (profile[key] || 0) + performance.now() - start; }
      };
      // Do not permanently exclude legal low-ranked placements or their
      // meeple alternatives. Widen the root from a shuffled full legal list.
      timed('rootExpansionMs', () => { while (pendingRoot.length) {
        const placement = pendingRoot.pop();
        let added = false;
        for (const meeple of meepleOptionsFor(engine, placement)) {
          const key = actionKey({ placement, meeple });
          if (rootKeys.has(key)) continue;
          rootKeys.add(key);
          root.actions.push({ placement, meeple, key, visits: 0, valueSum: 0, outcomes: new Map() });
          added = true;
        }
        if (added) break;
      } });
      const deck = timed('deckMs', () => shuffleDeckTemplate(deckTemplate, random));
      const simulated = timed('forkMs', () => engine.forkForSearch({ deck, random, profile, candidateCache }));
      let node = root, plies = 0, expanded = false;
      const path = [];
      while (!simulated.state.finished && plies < config.maxPlies) {
        if (!node.actions) node.actions = timed('rankMs', () => actionsFor(simulated, catalog, random, config.innerSamples));
        if (!node.actions.length) break;
        const playerId = simulated.activePlayer.id;
        const action = chooseTreeAction(node, playerId, rootPlayerId, config, random,
          node === root && simulations % 3 === 2);
        const newAction = action.visits === 0;
        path.push({ node, action });
        // The leaf is scored on the board after this move. Generating legal
        // candidates for a next turn that will not be searched is wasted work.
        if (plies + 1 === config.maxPlies) simulated.deferCandidateSearch = true;
        timed('applyMs', () => applyAction(simulated, action, profile));
        plies++;
        if (simulated.state.finished || plies >= config.maxPlies) break;
        const kind = tileKind(simulated.state.currentTile);
        if (!action.outcomes.has(kind)) { action.outcomes.set(kind, newNode()); expanded = true; }
        node = action.outcomes.get(kind);
        if (newAction || expanded) break;
      }
      while (!simulated.state.finished && plies < config.maxPlies) {
        const action = timed('rolloutRankMs', () => rolloutAction(simulated, catalog, random, config));
        if (!action) break;
        if (plies + 1 === config.maxPlies) simulated.deferCandidateSearch = true;
        timed('applyMs', () => applyAction(simulated, action, profile));
        plies++;
      }
      const value = timed('leafMs', () => leafValue(simulated, rootPlayerId, config.scoreScale));
      for (const item of path) {
        item.node.visits++;
        item.action.visits++;
        item.action.valueSum += value;
      }
      simulations++;
      return value;
    },
    result() {
      const best = [...root.actions].sort((a, b) => b.visits - a.visits || b.valueSum / Math.max(1, b.visits) - a.valueSum / Math.max(1, a.visits))[0];
      if (!best?.visits) return { ...fallback, simulations, usedFallback: true };
      return { placement: best.placement, meeple: best.meeple, value: best.valueSum / best.visits,
        simulations, usedFallback: false };
    },
  };
}

export async function chooseMctsAction(engine, { timeBudgetMs = 1000, maxSimulations = 1000,
  yieldControl = () => new Promise(resolve => setTimeout(resolve, 0)), isCancelled = () => false, ...options } = {}) {
  const started = performance.now();
  const session = createMctsSession(engine, options);
  const deadline = started + timeBudgetMs;
  let lastStepMs = 0;
  while (session.simulations < maxSimulations && performance.now() < deadline && !isCancelled()) {
    if (lastStepMs && deadline - performance.now() < lastStepMs * 1.2) break;
    const stepStarted = performance.now();
    try { session.step(); }
    catch (error) {
      console.error('MCTS探索を中止し、D210の合法手を使用します。', error);
      return { ...session.fallback, simulations: session.simulations, usedFallback: true };
    }
    lastStepMs = performance.now() - stepStarted;
    await yieldControl();
  }
  return session.result();
}
