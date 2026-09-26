import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { DEFAULT_CPU_WEIGHTS } from '../src/ai/CpuPlayer.js';
import { deriveSeed, seededRandom } from '../src/ai/SeededRandom.js';
import { playStandardMatch } from '../src/ai/SelfPlay.js';
import { loadTrainingPatterns, patternForSeed } from './training-patterns.mjs';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function parseArgs(argv) {
	const options = { rounds: 3, pairs: 1, validationPairs: 1, seed: 1, mutation: 0.3, weights: null, patterns: null, out: null };
	for (let index = 0; index < argv.length; index++) {
		if (argv[index] === '--help') {
			console.log('Usage: node scripts/train-cpu.mjs [--rounds N] [--pairs N] [--validation-pairs N] [--seed N] [--mutation F] [--weights weights.json] [--patterns directory] [--out directory]');
			process.exit(0);
		}
		const key = argv[index].replace(/^--/, '');
		const normalized = key === 'validation-pairs' ? 'validationPairs' : key;
		if (!argv[index].startsWith('--') || !(normalized in options) || !argv[index + 1]) throw new Error(`Unknown or incomplete option: ${argv[index]}`);
		options[normalized] = argv[++index];
	}
	for (const key of ['rounds', 'pairs', 'validationPairs', 'seed']) {
		options[key] = Number(options[key]);
		if (!Number.isSafeInteger(options[key]) || options[key] < (key === 'seed' ? 0 : 1)) throw new Error(`${key} must be a valid positive integer.`);
	}
	options.mutation = Number(options.mutation);
	if (!Number.isFinite(options.mutation) || options.mutation <= 0 || options.mutation > 2) throw new Error('mutation must be greater than 0 and at most 2.');
	return options;
}

function readWeights(filename) {
	const weights = { ...DEFAULT_CPU_WEIGHTS };
	if (!filename) return weights;
	for (const [key, value] of Object.entries(JSON.parse(readFileSync(resolve(filename), 'utf8')))) {
		if (!(key in weights) || !Number.isFinite(value) || value < 0) throw new Error(`Invalid weight: ${key}`);
		weights[key] = value;
	}
	return weights;
}

function mutatedWeights(current, random, amplitude) {
	const proposed = { ...current }, keys = Object.keys(proposed);
	for (let change = 0; change < 2; change++) {
		const key = keys[Math.floor(random() * keys.length)];
		proposed[key] = Number((Math.max(0.001, proposed[key]) * Math.exp((random() * 2 - 1) * amplitude)).toFixed(5));
	}
	return proposed;
}

function isBetter(result) { return result.wins > result.losses || (result.wins === result.losses && result.scoreDifference > 0); }

function compare(challenger, incumbent, { firstSeed, pairs, round, phase, output, patterns }) {
	let wins = 0, draws = 0, losses = 0, scoreDifference = 0;
	for (let pair = 0; pair < pairs; pair++) {
		const seed = firstSeed + pair;
		for (let seat = 0; seat < 2; seat++) {
			const challengerFirst = seat === 0;
			const result = playStandardMatch({ seed, trainingPattern: patternForSeed(patterns, seed), policies: challengerFirst ? [challenger, incumbent] : [incumbent, challenger], labels: challengerFirst ? ['challenger', 'incumbent'] : ['incumbent', 'challenger'], onTurn: ({ turn }) => {
				if (turn % 20 === 0) console.log(`  round ${round} ${phase} seed ${seed} seat ${seat + 1}: ${turn} turns`);
			} });
			const diff = result.scores[challengerFirst ? 0 : 1] - result.scores[challengerFirst ? 1 : 0];
			scoreDifference += diff;
			if (diff > 0) wins++; else if (diff < 0) losses++; else draws++;
			const filename = `round-${String(round).padStart(3, '0')}-${phase}-seed-${seed}-seat-${seat + 1}.json`;
			writeFileSync(join(output, filename), JSON.stringify(result));
			console.log(`  ${filename}: ${diff > 0 ? 'win' : diff < 0 ? 'loss' : 'draw'} (${diff >= 0 ? '+' : ''}${diff}), ${result.elapsedMs} ms`);
		}
	}
	return { wins, draws, losses, scoreDifference, pairs };
}

const options = parseArgs(process.argv.slice(2));
const patterns = loadTrainingPatterns(options.patterns);
const output = options.out ? resolve(options.out) : join(projectRoot, 'self-play-results', `training-${Date.now()}`);
if (existsSync(output)) throw new Error(`Output already exists: ${output}`);
mkdirSync(dirname(output), { recursive: true });
mkdirSync(output);
let incumbent = readWeights(options.weights);
const random = seededRandom(deriveSeed(options.seed, 'weight-search'));
const codeFingerprint = createHash('sha256');
for (const filename of ['src/game/GameEngine.js', 'src/game/FixedTrainingLayout.js', 'src/game/GameState.js', 'src/game/Board.js', 'src/game/Tile.js', 'src/game/Rules.js', 'src/game/Scoring.js', 'src/game/TileSet.js', 'src/ai/CpuPlayer.js', 'src/ai/CpuObservation.js', 'src/ai/TacticalSearch.js', 'src/ai/SeededRandom.js', 'src/ai/SelfPlay.js']) codeFingerprint.update(readFileSync(join(projectRoot, filename)));
writeFileSync(join(output, 'run.json'), JSON.stringify({ format: 1, rules: 'standard-2p', createdAt: new Date().toISOString(), ...options, codeFingerprint: codeFingerprint.digest('hex'), patternFingerprint: patterns ? createHash('sha256').update(JSON.stringify(patterns)).digest('hex') : null, initialWeights: incumbent }, null, 2));
writeFileSync(join(output, 'best-weights.json'), JSON.stringify(incumbent, null, 2));
for (let round = 1; round <= options.rounds; round++) {
	const challenger = mutatedWeights(incumbent, random, options.mutation);
	console.log(`Round ${round}/${options.rounds}: comparing mutated weights`);
	const train = compare(challenger, incumbent, { firstSeed: options.seed + round * 100000, pairs: options.pairs, round, phase: 'train', output, patterns });
	let validation = null;
	if (isBetter(train)) validation = compare(challenger, incumbent, { firstSeed: options.seed + round * 100000 + 50000, pairs: options.validationPairs, round, phase: 'validation', output, patterns });
	const accepted = isBetter(train) && validation && (isBetter(validation) || (validation.wins === validation.losses && validation.scoreDifference === 0));
	appendFileSync(join(output, 'training.jsonl'), `${JSON.stringify({ round, challenger, train, validation, accepted })}\n`);
	if (accepted) {
		incumbent = challenger;
		writeFileSync(join(output, 'best-weights.json'), JSON.stringify(incumbent, null, 2));
	}
	console.log(`Round ${round}: ${accepted ? 'accepted' : 'rejected'}; train ${train.wins}-${train.draws}-${train.losses}${validation ? `, validation ${validation.wins}-${validation.draws}-${validation.losses}` : ''}`);
}
console.log(`Best weights: ${join(output, 'best-weights.json')}`);
