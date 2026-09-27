import test from 'node:test';
import assert from 'node:assert/strict';
import { GameEngine } from '../src/game/GameEngine.js';
import { captureDecisionContext, describeTileCandidate } from '../src/recording/DecisionData.js';
import { FEATURE_DATASET_FORMAT, FEATURE_DATASET_VERSION, FEATURE_NAMES, buildPositionInformation, preprocessDecisionRecord } from '../src/ai/FeatureDataset.js';
import { datasetLoss, featureScore, trainFeatureDataset, validateFeatureDataset } from '../src/ai/FeatureLearning.js';
import { MATCH_CPU_WEIGHTS } from '../src/ai/MatchCpuDefaults.js';

test('直接編集した局面を前処理へ渡せない', async () => {
  await assert.rejects(preprocessDecisionRecord({ format: 'penrosanne-decision-record', version: 2, origin: 'editor', decisions: [] }), /編集/);
});

test('対称な候補を統合し、元IDと採用手を保持する', async () => {
  const game = new GameEngine({ playerCount: 2, deckType: 'standard', deferCandidateSearch: true, random: () => 0.5 });
  const candidate = game.candidates()[0];
  assert.ok(candidate);
  const one = describeTileCandidate(game, candidate, 0), two = describeTileCandidate(game, candidate, 1);
  const record = {
    format: 'penrosanne-decision-record', version: 2, origin: 'full', seed: 1,
    setup: { playerCount: 2, deckType: 'standard', handMode: 'single' },
    decisions: [{ id: 'decision-1', kind: 'turn', context: captureDecisionContext(game), candidates: [one, two], chosenId: '0:skip:-',
      assessments: {
        '0:skip:-': { id: '0:skip:-', tileCandidateId: one.id, meeple: { type: 'skip', index: null }, rating: 'confident', features: { meeple: { remainingMeeplesAfter: 7 } } },
        '1:skip:-': { id: '1:skip:-', tileCandidateId: two.id, meeple: { type: 'skip', index: null }, rating: 'unreviewed', features: { meeple: { remainingMeeplesAfter: 7 } } },
      } }],
  };
  const dataset = await preprocessDecisionRecord(record);
  assert.equal(dataset.summary.rawAssessments, 2);
  assert.equal(dataset.summary.collapsed, 1);
  assert.equal(dataset.decisions[0].groups.length, 1);
  assert.deepEqual(dataset.decisions[0].groups[0].aliases, ['0:skip:-', '1:skip:-']);
  assert.equal(dataset.decisions[0].selectedId, dataset.decisions[0].groups[0].id);
  assert.equal(dataset.decisions[0].groups[0].rating, 'confident');
  assert.equal(dataset.decisions[0].groups[0].features.length, FEATURE_NAMES.length);
});

test('辺記号が異なる候補は地形が同じでも統合しない', async () => {
  const game = new GameEngine({ playerCount: 2, deckType: 'standard', deferCandidateSearch: true, random: () => 0.5 });
  const candidate = game.candidates()[0];
  const one = describeTileCandidate(game, candidate, 0), two = describeTileCandidate(game, candidate, 1);
  two.placement.matchingPattern = one.placement.matchingPattern === 'normal' ? 'verticalInverse' : 'normal';
  const record = { format: 'penrosanne-decision-record', version: 2, origin: 'full',
    setup: { playerCount: 2, deckType: 'standard', handMode: 'single' }, decisions: [{
      id: 'distinct', kind: 'turn', context: captureDecisionContext(game), candidates: [one, two], chosenId: '0:skip:-', assessments: {
        '0:skip:-': { id: '0:skip:-', tileCandidateId: one.id, meeple: { type: 'skip', index: null }, rating: 'confident' },
        '1:skip:-': { id: '1:skip:-', tileCandidateId: two.id, meeple: { type: 'skip', index: null }, rating: 'runner-up' },
      },
    }] };
  const dataset = await preprocessDecisionRecord(record);
  assert.equal(dataset.decisions[0].groups.length, 2);
});

test('次手番の位置別情報は増分更新と盤面全探索で一致する', () => {
  const game = new GameEngine({ playerCount: 2, deckType: 'standard', deferCandidateSearch: true, random: () => 0.5 });
  const before = buildPositionInformation(captureDecisionContext(game));
  const placement = game.candidates()[0];
  game.placeTile(placement);
  if (game.state.phase === 'placeMeeple') game.skipMeeple();
  const context = captureDecisionContext(game);
  const incremental = buildPositionInformation(context, {
    previousFrontier: before.frontier, previousFillabilityCache: before.fillabilityCache,
    changedTile: context.boardTiles.find(tile => tile.id === placement.id),
  });
  const fresh = buildPositionInformation(context);
  assert.deepEqual(incremental.positions, fresh.positions);
  assert.equal(incremental.forcedCount, fresh.forcedCount);
});

test('未検討は負例にならず、数値ベクトルだけで重みを学習する', () => {
  const features = () => Array(FEATURE_NAMES.length).fill(0);
  const chosen = features(), rejected = features();
  chosen[FEATURE_NAMES.indexOf('immediate')] = 2;
  rejected[FEATURE_NAMES.indexOf('immediate')] = 0;
  const decision = { id: 'one', phase: 'early', selectedId: 'chosen', conflicting: [], groups: [
    { id: 'chosen', rating: 'confident', features: chosen },
    { id: 'rejected', rating: 'runner-up', features: rejected },
    { id: 'unreviewed', rating: 'unreviewed', features: rejected },
  ] };
  const dataset = { format: FEATURE_DATASET_FORMAT, version: FEATURE_DATASET_VERSION, featureNames: FEATURE_NAMES, decisions: [decision] };
  validateFeatureDataset(dataset);
  const baseline = MATCH_CPU_WEIGHTS.phaseWeights.early;
  assert.ok(featureScore(chosen, baseline) > featureScore(rejected, baseline));
  assert.equal(datasetLoss([decision], baseline, baseline).count, 1);
  const result = trainFeatureDataset(dataset, { iterations: 6, population: 6, seed: 3 });
  assert.ok(result.phaseWeights.early.immediate > 0);
  assert.ok(result.phases.early.loss <= datasetLoss([decision], baseline, baseline).loss);
  assert.deepEqual(result.phaseWeights.middle, MATCH_CPU_WEIGHTS.phaseWeights.middle);
});
