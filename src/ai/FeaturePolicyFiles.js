import { TRAINING_PHASES } from './TrainingEvolution.js';
import { TRAINING_WEIGHTS } from './FeatureLearning.js';

export function parseExportedCpu(payload) {
  if (payload?.format !== 'penrosanne-feature-policy' || payload.version !== 1) {
    throw new Error('比較には、この画面で書き出したCPUのJSONを指定してください。');
  }
  for (const phase of TRAINING_PHASES) for (const key of TRAINING_WEIGHTS) {
    const value = payload.phaseWeights?.[phase]?.[key];
    if (!Number.isFinite(value) || value < 0) throw new Error(`${phase}.${key} の重みが不正です。`);
  }
  return { phaseWeights: payload.phaseWeights };
}
