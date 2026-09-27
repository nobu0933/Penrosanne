import assert from 'node:assert/strict';
import test from 'node:test';
import { Board } from '../src/game/Board.js';
import { GameEngine } from '../src/game/GameEngine.js';
import { structuralPlacementFrontier, structuralPlacementFrontierProgressively, structuralPositionKey, vertexSequenceAt, isCyclicSegment, VERTEX_PATTERNS } from '../src/game/Rules.js';
import { buildVertexExpansionTemplates, cachedVertexExpansionTemplates, minimalVertexBoard } from '../src/game/TrainingVertexTemplates.js';
import { seededRandom } from '../src/ai/SeededRandom.js';
import { playMctsMatch } from '../src/ai/MctsMatch.js';

const partial = {
  sun: [0, 1, 2, 3, 4], moon: [0, 1, 2, 3], king: [5, 0, 1, 2],
  queen: [2, 3, 4, 5], jack: [1, 2, 3], ace: [0, 1],
  deuce: [0, 1], star: [2],
};
const expectedCounts = { sun: 30, moon: 10, king: 99, queen: 50,
  jack: 31, ace: 7, deuce: 13, star: 3 };
const positions = tiles => tiles.map(structuralPositionKey).sort();
const candidateKey = tile => JSON.stringify([structuralPositionKey(tile), tile.idPrefix,
  tile.terrainPattern, Boolean(tile.mirrored), tile.matchingPattern, tile.matchingPatternOptions]);

test('8種類の最小頂点型から従来探索で拡張記録を構築する', () => {
  const templates = buildVertexExpansionTemplates();
  for (const [type, count] of Object.entries(expectedCounts)) {
    const seed = minimalVertexBoard(type);
    assert.equal(seed.tiles.length, VERTEX_PATTERNS[type].length);
    assert.ok(isCyclicSegment(vertexSequenceAt(seed, null, { x: 0, y: 0 }), VERTEX_PATTERNS[type]));
    assert.equal(templates[type].tiles.length, count);
    assert.equal(new Set(positions(templates[type].tiles)).size, count);
  }
});

test('保存済みの拡張記録は従来探索の生成結果と一致し、辺長変更にも対応する', () => {
  for (const side of [120, 90]) {
    const generated = buildVertexExpansionTemplates(side);
    const saved = cachedVertexExpansionTemplates(side);
    assert.equal(cachedVertexExpansionTemplates(side), saved);
    for (const type of Object.keys(VERTEX_PATTERNS)) {
      assert.equal(saved[type].seedCount, generated[type].seedCount);
      assert.deepEqual(saved[type].seedVertexIds, generated[type].seedVertexIds);
      assert.deepEqual(positions(saved[type].tiles), positions(generated[type].tiles), `${type}, side=${side}`);
    }
  }
});

test('8種類の部分配置からの高速拡張は従来探索と完全一致する', () => {
  const templates = buildVertexExpansionTemplates();
  for (const [type, indices] of Object.entries(partial)) {
    const seed = minimalVertexBoard(type), board = new Board(seed.side);
    for (const index of indices) board.add(seed.tiles[index]);
    const standard = structuralPlacementFrontier(board);
    const fast = structuralPlacementFrontier(board, { vertexTemplates: templates });
    assert.deepEqual(positions(fast.forced), positions(standard.forced), type);
    assert.ok(fast.macroApplications > 0, `${type}: マクロが使われていません`);
    assert.ok(fast.skippedSealedVertices > 0, `${type}: 検証済み頂点を省略していません`);
  }
});

test('拡張記録を回転・平行移動しても従来探索と一致する', () => {
  const templates = buildVertexExpansionTemplates(), angle = Math.PI * 2 / 5;
  for (const type of ['king', 'queen', 'ace']) {
    const seed = minimalVertexBoard(type), board = new Board(seed.side);
    for (const index of partial[type]) {
      const tile = seed.tiles[index];
      board.add({ ...tile,
        centerX: 83 + tile.centerX * Math.cos(angle) - tile.centerY * Math.sin(angle),
        centerY: -41 + tile.centerX * Math.sin(angle) + tile.centerY * Math.cos(angle),
        rotation: tile.rotation + angle,
      });
    }
    assert.deepEqual(positions(structuralPlacementFrontier(board, { vertexTemplates: templates }).forced),
      positions(structuralPlacementFrontier(board).forced), type);
  }
});

test('高速探索の順次通知は一頂点のテンプレート分をまとめ、結果は同期・通常探索と一致する', async () => {
  const seed = minimalVertexBoard('king'), board = new Board(seed.side);
  for (const index of partial.king) board.add(seed.tiles[index]);
  const batches = [], singles = [];
  const progressive = await structuralPlacementFrontierProgressively(board,
    { vertexTemplates: cachedVertexExpansionTemplates(board.side) }, {
      onForced: tile => singles.push(tile),
      onForcedBatch: batch => batches.push(batch),
    });
  assert.ok(batches.some(batch => batch.length > 1));
  assert.deepEqual(positions([...singles, ...batches.flat()]), positions(progressive.forced));
  assert.deepEqual(positions(progressive.forced), positions(structuralPlacementFrontier(board).forced));
  assert.deepEqual(positions(progressive.forced), positions(structuralPlacementFrontier(board,
    { vertexTemplates: cachedVertexExpansionTemplates(board.side) }).forced));
});

test('通常ゲームの高速順次探索でも確定位置と合法候補は通常方式と一致する', async () => {
  const normal = new GameEngine({ random: seededRandom(31), deferCandidateSearch: true });
  const fast = new GameEngine({ random: seededRandom(31), deferCandidateSearch: true, trainingFastFrontier: true });
  let groupedAnnouncements = 0;
  for (let turn = 0; turn < 12; turn++) {
    const standard = await normal.candidateGroupsProgressively();
    const accelerated = await fast.candidateGroupsProgressively({ onForcedBatch: batch => {
      if (batch.length > 1) groupedAnnouncements++;
    } });
    assert.deepEqual(positions(accelerated.forced), positions(standard.forced), `確定: ${turn}`);
    assert.deepEqual(accelerated.regular.map(candidateKey).sort(), standard.regular.map(candidateKey).sort(), `候補: ${turn}`);
    const selected = standard.regular[turn % standard.regular.length];
    const counterpart = accelerated.regular.find(tile => candidateKey(tile) === candidateKey(selected));
    normal.placeTile(selected); fast.placeTile(counterpart);
    if (normal.state.phase === 'placeMeeple') normal.skipMeeple();
    if (fast.state.phase === 'placeMeeple') fast.skipMeeple();
  }
  assert.ok(groupedAnnouncements > 0);
});

test('動的学習盤面でも通常探索と各手番の候補・確定位置・得点が一致する', () => {
  const standard = new GameEngine({ random: seededRandom(19) });
  const training = new GameEngine({ random: seededRandom(19), trainingFastFrontier: true });
  for (let turn = 0; turn < 12; turn++) {
    const normalChoices = standard.candidates(), fastChoices = training.candidates();
    assert.deepEqual(normalChoices.map(candidateKey).sort(), fastChoices.map(candidateKey).sort(), `候補: ${turn}`);
    const selected = normalChoices[turn % normalChoices.length];
    const counterpart = fastChoices.find(tile => candidateKey(tile) === candidateKey(selected));
    assert.ok(counterpart);
    standard.placeTile(selected);
    training.placeTile(counterpart);
    if (standard.state.phase === 'placeMeeple') standard.skipMeeple();
    if (training.state.phase === 'placeMeeple') training.skipMeeple();
    assert.deepEqual(positions(training.structuralCandidates()), positions(standard.structuralCandidates()), `確定: ${turn}`);
    assert.deepEqual(training.state.players.map(player => player.score), standard.state.players.map(player => player.score));
  }
});

test('MCTS学習対局は固定盤面なしで学習専用高速探索を選べる', async () => {
  const result = await playMctsMatch({ seed: 19, trainingFastFrontier: true,
    seats: [{ kind: 'mcts', parameters: { maxPlies: 2, rootSamples: 4, innerSamples: 2 } },
      { kind: 'random' }], simulations: 1, maxTurns: 2 });
  assert.equal(result.turns, 2);
  assert.equal(result.censored, true);
  assert.equal(result.patternSeed, null);
});
