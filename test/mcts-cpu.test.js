import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { GameEngine } from '../src/game/GameEngine.js';
import { createPrototypeDeck } from '../src/game/TileSet.js';
import { createMctsSession, sampledRemainingDeck, normalizeMctsParameters } from '../src/ai/MctsCpu.js';
import { seededRandom } from '../src/ai/SeededRandom.js';

const pattern = JSON.parse(readFileSync(new URL('../training-patterns/standard-training-v1/pattern-01.json', import.meta.url)));

function setup() {
  return new GameEngine({ random: seededRandom(13), trainingPattern: pattern,
    rules: { allowVerticalMatchingPattern: true, allowTerrainHalfTurn: true, allowTerrainMirror: true },
    titles: { vertexKing: true } });
}

test('探索専用複製は実盤面と山札順を変更しない', () => {
  const game = setup(), catalog = createPrototypeDeck(() => 0, 'standard');
  const originalDeck = game.state.deck.map(tile => tile.id);
  const fork = game.forkForSearch({ deck: sampledRemainingDeck(game, catalog, seededRandom(19)) });
  assert.notEqual(fork.state.board, game.state.board);
  assert.notEqual(fork.state.players, game.state.players);
  assert.deepEqual(game.state.deck.map(tile => tile.id), originalDeck);
  fork.placeTile(fork.candidates()[0]);
  if (fork.state.phase === 'placeMeeple') fork.skipMeeple();
  assert.equal(game.state.board.tiles.length, 1);
  assert.deepEqual(game.state.deck.map(tile => tile.id), originalDeck);
});

test('同じ山札を明示した複製は、実エンジンと同じ手番遷移をする', () => {
  const game = setup();
  const fork = game.forkForSearch({ deck: game.state.deck });
  const placement = game.candidates()[0];
  game.placeTile(placement);
  fork.placeTile(placement);
  if (game.state.phase === 'placeMeeple') game.skipMeeple();
  if (fork.state.phase === 'placeMeeple') fork.skipMeeple();
  assert.equal(fork.state.board.tiles.length, game.state.board.tiles.length);
  assert.deepEqual(fork.state.players.map(player => ({ score: player.score, meeples: player.meeples })),
    game.state.players.map(player => ({ score: player.score, meeples: player.meeples })));
  assert.equal(fork.state.currentTile?.id, game.state.currentTile?.id);
  assert.deepEqual(fork.candidates().map(tile => [tile.centerX, tile.centerY, tile.rotation]).sort(),
    game.candidates().map(tile => [tile.centerX, tile.centerY, tile.rotation]).sort());
});

test('MCTSは合法手を返し、探索中に実対局を変更しない', () => {
  const game = setup(), catalog = createPrototypeDeck(() => 0, 'standard');
  const legal = game.candidates(), deckIds = game.state.deck.map(tile => tile.id);
  const session = createMctsSession(game, { catalog, rootCandidates: legal, random: seededRandom(7),
    parameters: { maxPlies: 2, rootSamples: 6, innerSamples: 3 } });
  session.step();
  const action = session.result();
  assert.equal(action.simulations, 1);
  assert.ok(legal.some(tile => tile.centerX === action.placement.centerX && tile.centerY === action.placement.centerY
    && tile.terrainPattern === action.placement.terrainPattern && tile.mirrored === action.placement.mirrored));
  assert.equal(game.state.board.tiles.length, 1);
  assert.deepEqual(game.state.deck.map(tile => tile.id), deckIds);
});

test('MCTSパラメーターを安全な範囲に制限する', () => {
  const parameters = normalizeMctsParameters({ maxPlies: 999, rolloutD210Rate: -1, exploration: NaN });
  assert.equal(parameters.maxPlies, 8);
  assert.equal(parameters.rolloutD210Rate, 0);
  assert.equal(parameters.exploration, 1.2);
});

test('探索候補キャッシュは同一局面だけ再利用し、候補の変更は他の複製へ漏れない', () => {
  const game = setup(), cache = new Map(), profile = {};
  const original = game.candidates()[0];
  const deck = game.state.deck;
  const first = game.forkForSearch({ deck, candidateCache: cache, profile });
  first.placeTile(original);
  if (first.state.phase === 'placeMeeple') first.skipMeeple();
  const expected = structuredClone(first.candidates());
  assert.ok(cache.size > 0);

  const second = game.forkForSearch({ deck, candidateCache: cache, profile });
  second.placeTile(original);
  if (second.state.phase === 'placeMeeple') second.skipMeeple();
  assert.ok(profile.candidateCacheHits > 0);
  assert.deepEqual(second.candidates(), expected);
  if (second.candidates()[0]) second.candidates()[0].centerX += 99;
  assert.deepEqual(first.candidates(), expected);

  const alternative = game.candidates().find(candidate => candidate.centerX !== original.centerX || candidate.centerY !== original.centerY);
  assert.ok(alternative);
  const third = game.forkForSearch({ deck, candidateCache: cache, profile });
  third.placeTile(alternative);
  if (third.state.phase === 'placeMeeple') third.skipMeeple();
  assert.notDeepEqual(third.state.board.tiles, second.state.board.tiles);
});

test('葉の直前だけ候補探索を省略しても終局得点は同じ', () => {
  const game = setup(), normal = game.forkForSearch({ deck: game.state.deck });
  const deferred = game.forkForSearch({ deck: game.state.deck });
  deferred.deferCandidateSearch = true;
  const placement = game.candidates()[0];
  normal.placeTile(placement);
  deferred.placeTile(placement);
  if (normal.state.phase === 'placeMeeple') normal.skipMeeple();
  if (deferred.state.phase === 'placeMeeple') deferred.skipMeeple();
  normal.finishGame();
  deferred.finishGame();
  assert.deepEqual(deferred.state.players.map(player => player.score), normal.state.players.map(player => player.score));
});

test('通常盤面でも探索候補キャッシュは確定配置と合法候補を変えない', () => {
  const game = new GameEngine({ random: seededRandom(13),
    rules: { allowVerticalMatchingPattern: true, allowTerrainHalfTurn: true, allowTerrainMirror: true } });
  const placement = game.candidates()[0], cache = new Map(), profile = {};
  const move = (candidateCache) => {
    const fork = game.forkForSearch({ deck: game.state.deck, candidateCache, profile });
    fork.placeTile(placement);
    if (fork.state.phase === 'placeMeeple') fork.skipMeeple();
    return fork.candidateGroups();
  };
  const baseline = move(null);
  assert.deepEqual(move(cache), baseline);
  assert.deepEqual(move(cache), baseline);
  assert.ok(profile.candidateCacheHits > 0);
});

test('同じ乱数列では候補キャッシュの有無でMCTSの選択が変わらない', () => {
  const game = setup(), catalog = createPrototypeDeck(() => 0, 'standard');
  const options = { catalog, parameters: { maxPlies: 2, rootSamples: 6, innerSamples: 3 } };
  const cached = createMctsSession(game, { ...options, random: seededRandom(31) });
  const plain = createMctsSession(game, { ...options, random: seededRandom(31), reuseCandidates: false });
  for (let index = 0; index < 6; index++) { cached.step(); plain.step(); }
  const one = cached.result(), two = plain.result();
  assert.deepEqual([one.placement.centerX, one.placement.centerY, one.placement.terrainPattern, one.meeple],
    [two.placement.centerX, two.placement.centerY, two.placement.terrainPattern, two.meeple]);
  assert.equal(one.value, two.value);
});
