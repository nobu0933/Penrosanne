import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { trainFeatureDataset } from '../src/ai/FeatureLearning.js';
import { playStandardMatch } from '../src/ai/SelfPlay.js';
import { MATCH_CPU_WEIGHTS } from '../src/ai/MatchCpuDefaults.js';

function args(argv) {
  const options = { iterations: 32, population: 8, seed: 1901, verifyPairs: 1 };
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    if (!['--features', '--out', '--iterations', '--population', '--seed', '--verify-pairs'].includes(key) || !argv[index + 1])
      throw new Error('Usage: npm run learn-features -- --features features.json --out policy.json [--iterations 32] [--population 8] [--verify-pairs 1]');
    options[key.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())] = argv[index + 1];
  }
  if (!options.features || !options.out) throw new Error('--features and --out are required.');
  for (const key of ['iterations', 'population', 'seed', 'verifyPairs']) {
    options[key] = Number(options[key]);
    if (!Number.isSafeInteger(options[key]) || options[key] < (key === 'verifyPairs' ? 0 : 1)) throw new Error(`${key} must be an integer.`);
  }
  if (options.verifyPairs > 10 || options.population > 64 || options.iterations > 1000) throw new Error('The requested budget is too large.');
  return options;
}

const options = args(process.argv.slice(2)), output = resolve(options.out);
if (existsSync(output)) throw new Error(`Output already exists: ${output}`);
const dataset = JSON.parse(readFileSync(resolve(options.features), 'utf8'));
const started = performance.now();
const result = trainFeatureDataset(dataset, {
  iterations: options.iterations, population: options.population, seed: options.seed,
  onProgress: ({ phase, generation, iterations, bestLoss }) => {
    if (generation === iterations || generation % 5 === 0) console.log(`${phase} ${generation}/${iterations}: loss ${bestLoss.toFixed(5)}`);
  },
});
result.learningElapsedMs = Math.round(performance.now() - started);
writeFileSync(output, JSON.stringify(result, null, 2));
console.log(`Saved trained policy ${output} after ${result.learningElapsedMs} ms.`);

// 対戦結果が悪くても重みを自動採用しない。未使用シード・通常盤面でのみ最終確認。
if (options.verifyPairs) {
  const verification = { baseline: 'D210', fixedTrainingLayout: false, seed: options.seed + 1000000, games: [], wins: 0, draws: 0, losses: 0, scoreDifference: 0 };
  for (let pair = 0; pair < options.verifyPairs; pair++) for (let seat = 0; seat < 2; seat++) {
    const first = seat === 0, seed = verification.seed + pair;
    const policies = first ? [result, MATCH_CPU_WEIGHTS] : [MATCH_CPU_WEIGHTS, result];
    console.log(`Verification ${pair * 2 + seat + 1}/${options.verifyPairs * 2}: normal board, seed ${seed}, ${first ? 'first' : 'second'} seat`);
    const game = playStandardMatch({ seed, policies, labels: first ? ['trained', 'D210'] : ['D210', 'trained'],
      onTurn: ({ turn }) => { if (turn % 20 === 0) console.log(`  ${turn} turns`); } });
    const trainedScore = game.scores[first ? 0 : 1], baselineScore = game.scores[first ? 1 : 0];
    const difference = trainedScore - baselineScore;
    if (difference > 0) verification.wins++; else if (difference < 0) verification.losses++; else verification.draws++;
    verification.scoreDifference += difference;
    verification.games.push({ seed, trainedFirst: first, trainedScore, baselineScore, elapsedMs: game.elapsedMs });
    console.log(`  trained ${trainedScore} / D210 ${baselineScore}`);
  }
  writeFileSync(`${output}.verification.json`, JSON.stringify(verification, null, 2));
  console.log(`Saved verification ${output}.verification.json`);
}
