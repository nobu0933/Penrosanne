import assert from 'node:assert/strict';
import test from 'node:test';
import { championOf, initialMctsPopulation, parseMctsPopulation,
  spawnMctsCandidates, summarizeMctsGeneration } from '../src/ai/MctsPopulation.js';
import { seededRandom } from '../src/ai/SeededRandom.js';

test('最新1世代のJSONを読み込み、指定された最優秀個体を選ぶ', () => {
  const source = initialMctsPopulation();
  const imported = parseMctsPopulation(JSON.parse(JSON.stringify(source)));
  assert.equal(championOf(imported).id, 0);
  const multiple = parseMctsPopulation({ ...source, championId: 2, individuals: [
    source.individuals[0], { id: 2, parameters: { ...source.individuals[0].parameters, exploration: 2 }, wins: 1 },
  ] });
  assert.equal(championOf(multiple).parameters.exploration, 2);
  assert.throws(() => parseMctsPopulation({ ...source, championId: 9 }));
});

test('MCTSパラメーターだけを変異し、敗者の結果も相関集計に残す', () => {
  const source = initialMctsPopulation();
  const candidates = spawnMctsCandidates(source, 3, 0.3, seededRandom(17));
  assert.equal(candidates.length, 3);
  assert.deepEqual(candidates[0].parameters, source.individuals[0].parameters);
  const matches = [
    { candidateId: 1, opponent: 'current', candidateScore: 15, opponentScore: 10 },
    { candidateId: 2, opponent: 'aggressive', candidateScore: 4, opponentScore: 30 },
  ];
  const next = summarizeMctsGeneration({ source, candidates, matches, survivors: [0, 1] });
  assert.equal(next.generation, 1);
  assert.ok(next.evaluated.some(row => row.id === 2 && row.losses === 1));
  assert.equal(next.individuals.length, 2);
  assert.equal(championOf(parseMctsPopulation(next)).id, 1);
  assert.ok(Object.keys(next.parameterEffects).length > 0);
});

test('途中打ち切りの暫定得点を正式な勝敗に混ぜない', () => {
  const source = initialMctsPopulation(), candidates = spawnMctsCandidates(source, 2, 0.2, seededRandom(3));
  const next = summarizeMctsGeneration({ source, candidates, survivors: [0, 1], matches: [
    { candidateId: 1, opponent: 'random', candidateScore: 30, opponentScore: 10, censored: true },
  ] });
  const row = next.evaluated.find(item => item.id === 1);
  assert.equal(row.wins, 0);
  assert.equal(row.censored, 1);
  assert.equal(row.partialDifference, 20);
});
