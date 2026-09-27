import { preprocessDecisionRecord } from './FeatureDataset.js';
import { trainFeatureDataset } from './FeatureLearning.js';
import { parseExportedCpu } from './FeaturePolicyFiles.js';
import { playBrowserTrainingMatch } from './BrowserSelfPlay.js';

const report = (event, detail) => self.postMessage({ event, detail });

self.onmessage = async ({ data }) => {
  try {
    if (data.action === 'preprocess') {
      const record = JSON.parse(data.recordText);
      const result = await preprocessDecisionRecord(record, {
        onProgress: detail => report('progress', detail),
        yieldControl: () => new Promise(resolve => setTimeout(resolve, 0)),
      });
      report('complete', result);
    } else if (data.action === 'train') {
      const dataset = JSON.parse(data.datasetText);
      const result = trainFeatureDataset(dataset, {
        ...data.options, onProgress: detail => report('progress', detail),
      });
      report('complete', result);
    } else if (data.action === 'verify') {
      const cpuA = parseExportedCpu(JSON.parse(data.cpuAText));
      const cpuB = parseExportedCpu(JSON.parse(data.cpuBText));
      const matches = [];
      for (let pair = 0; pair < data.pairs; pair++) {
        const seed = data.seed + pair;
        for (let seat = 0; seat < 2; seat++) {
          const policies = seat === 0 ? [cpuA, cpuB] : [cpuB, cpuA];
          const game = await playBrowserTrainingMatch({ seed, policies, pattern: null,
            onTurn: detail => report('progress', { pair: pair + 1, seat: seat + 1, ...detail }),
          });
          const scores = seat === 0 ? game.scores : [...game.scores].reverse();
          matches.push({ seed, firstPlayer: seat === 0 ? 'A' : 'B', scores, turns: game.turns, elapsedMs: game.elapsedMs });
          report('match', matches.at(-1));
        }
      }
      const wins = [0, 0], draws = matches.filter(match => match.scores[0] === match.scores[1]).length;
      for (const match of matches) if (match.scores[0] !== match.scores[1]) wins[Number(match.scores[1] > match.scores[0])]++;
      report('complete', { format: 'penrosanne-feature-verification', version: 1, createdAt: new Date().toISOString(), seed: data.seed, pairs: data.pairs,
        cpuA: data.cpuAName, cpuB: data.cpuBName, wins, draws, scoreDifference: matches.reduce((sum, match) => sum + match.scores[0] - match.scores[1], 0), matches });
    } else throw new Error('不明な処理です。');
  } catch (error) { report('error', error?.message || String(error)); }
};
