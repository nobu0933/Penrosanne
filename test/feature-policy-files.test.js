import test from 'node:test';
import assert from 'node:assert/strict';
import { parseExportedCpu } from '../src/ai/FeaturePolicyFiles.js';
import { MATCH_CPU_WEIGHTS } from '../src/ai/MatchCpuDefaults.js';

test('書き出した特徴量CPUを比較用に読み込む', () => {
  const payload = { format:'penrosanne-feature-policy', version:1, phaseWeights:MATCH_CPU_WEIGHTS.phaseWeights };
  assert.deepEqual(parseExportedCpu(payload).phaseWeights, payload.phaseWeights);
});

test('形式違いと壊れた重みを拒否する', () => {
  assert.throws(() => parseExportedCpu({}), /JSON/);
  const phaseWeights = structuredClone(MATCH_CPU_WEIGHTS.phaseWeights);
  phaseWeights.early.future = NaN;
  assert.throws(() => parseExportedCpu({ format:'penrosanne-feature-policy', version:1, phaseWeights }), /early.future/);
});
