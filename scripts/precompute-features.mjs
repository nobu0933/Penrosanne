import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { preprocessDecisionRecord } from '../src/ai/FeatureDataset.js';

function args(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    if (!['--input', '--out'].includes(key) || !argv[index + 1]) throw new Error('Usage: npm run precompute-features -- --input decision.json --out features.json');
    options[key.slice(2)] = argv[index + 1];
  }
  if (!options.input || !options.out) throw new Error('--input and --out are required.');
  return options;
}

const options = args(process.argv.slice(2)), output = resolve(options.out);
if (existsSync(output)) throw new Error(`Output already exists: ${output}`);
const raw = readFileSync(resolve(options.input), 'utf8');
const sourceHash = createHash('sha256').update(raw).digest('hex');
const implementationHash = createHash('sha256');
for (const file of ['src/ai/FeatureDataset.js', 'src/game/Rules.js', 'src/game/Scoring.js', 'src/game/TileSet.js', 'src/game/Board.js'])
  implementationHash.update(readFileSync(new URL(`../${file}`, import.meta.url)));
const started = performance.now();
const dataset = await preprocessDecisionRecord(JSON.parse(raw), {
  onProgress: ({ completed, total, collapsed }) => process.stdout.write(`\r${completed}/${total} turns; ${collapsed} duplicate options`),
  yieldControl: () => new Promise(resolve => setImmediate(resolve)),
});
dataset.source.sha256 = sourceHash;
dataset.implementationSha256 = implementationHash.digest('hex');
dataset.summary.elapsedMs = Math.round(performance.now() - started);
writeFileSync(output, JSON.stringify(dataset));
console.log(`\nSaved ${output} (${dataset.summary.elapsedMs} ms, ${dataset.summary.decisions} turns, ${dataset.summary.rawAssessments} options → ${dataset.summary.rawAssessments - dataset.summary.collapsed} groups)`);
