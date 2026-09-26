import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { DEFAULT_CPU_WEIGHTS } from '../src/ai/CpuPlayer.js';
import { playStandardMatch } from '../src/ai/SelfPlay.js';
import { loadTrainingPatterns, patternForSeed } from './training-patterns.mjs';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function usage() {
	console.log('Usage: node scripts/self-play.mjs [--pairs N] [--seed N] [--challenger weights.json] [--baseline weights.json] [--patterns directory] [--out directory]');
	console.log('Runs two games per seed, swapping the policies between first and second player. No browser or Codex API is used.');
}

function argumentsFrom(argv) {
	const options = { pairs: 1, seed: 1, challenger: null, baseline: null, patterns: null, out: null };
	for (let index = 0; index < argv.length; index++) {
		const key = argv[index];
		if (key === '--help') { usage(); process.exit(0); }
		if (!['--pairs', '--seed', '--challenger', '--baseline', '--patterns', '--out'].includes(key) || !argv[index + 1]) throw new Error(`Unknown or incomplete option: ${key}`);
		options[key.slice(2)] = argv[++index];
	}
	for (const key of ['pairs', 'seed']) {
		const value = Number(options[key]);
		if (!Number.isSafeInteger(value) || value < (key === 'pairs' ? 1 : 0)) throw new Error(`${key} must be a non-negative integer${key === 'pairs' ? ' greater than zero' : ''}.`);
		options[key] = value;
	}
	return options;
}

function loadWeights(filename) {
	if (!filename) return { ...DEFAULT_CPU_WEIGHTS };
	const source = JSON.parse(readFileSync(resolve(filename), 'utf8'));
	const merged = { ...DEFAULT_CPU_WEIGHTS };
	for (const [key, value] of Object.entries(source)) {
		if (!(key in merged) || typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`Invalid CPU weight: ${key}`);
		merged[key] = value;
	}
	return merged;
}

function readableLog(result) {
	const lines = [
		`Seed ${result.seed} / Standard / 開始タイル ${result.startTile}`,
		`山札指紋 ${result.deckFingerprint}`,
		'',
	];
	for (const action of result.actions) {
		const placement = `(${action.x.toFixed(1)}, ${action.y.toFixed(1)}) 回転${action.rotation.toFixed(3)} 地形${action.terrainPattern || 'normal'}${action.mirrored ? '・左右反転' : ''}`;
		const meeple = action.meeple ? ` / ミープル ${action.meeple.type}[${action.meeple.index}]` : '';
		const points = action.completedEvents.map(event => ` / ${event.playerId} ${event.type}完成 +${event.points}`).join('');
		lines.push(`${String(action.turn).padStart(2, '0')}. ${result.labels[action.player - 1]}: ${action.tileId} ${placement}${meeple}${points}`);
	}
	lines.push('', `最終得点: ${result.labels[0]} ${result.scores[0]} / ${result.labels[1]} ${result.scores[1]}`, `勝者: ${result.winner || '引き分け'}`, `所要時間: ${(result.elapsedMs / 1000).toFixed(1)}秒`);
	return `${lines.join('\n')}\n`;
}

const options = argumentsFrom(process.argv.slice(2));
const patterns = loadTrainingPatterns(options.patterns);
const challenger = loadWeights(options.challenger), baseline = loadWeights(options.baseline);
const sameWeights = JSON.stringify(challenger) === JSON.stringify(baseline);
const output = options.out ? resolve(options.out) : join(projectRoot, 'self-play-results', `run-${Date.now()}`);
if (existsSync(output)) throw new Error(`Output already exists: ${output}`);
mkdirSync(dirname(output), { recursive: true });
mkdirSync(output);
const codeFingerprint = createHash('sha256');
for (const filename of ['src/game/GameEngine.js', 'src/game/FixedTrainingLayout.js', 'src/game/GameState.js', 'src/game/Board.js', 'src/game/Tile.js', 'src/game/Rules.js', 'src/game/Scoring.js', 'src/game/TileSet.js', 'src/ai/CpuPlayer.js', 'src/ai/CpuObservation.js', 'src/ai/TacticalSearch.js', 'src/ai/SeededRandom.js', 'src/ai/SelfPlay.js']) codeFingerprint.update(readFileSync(join(projectRoot, filename)));
writeFileSync(join(output, 'run.json'), JSON.stringify({ format: 1, rules: 'standard-2p', createdAt: new Date().toISOString(), pairs: options.pairs, seed: options.seed, codeFingerprint: codeFingerprint.digest('hex'), patternFingerprint: patterns ? createHash('sha256').update(JSON.stringify(patterns)).digest('hex') : null, sameWeights, challenger, baseline }, null, 2));
if (sameWeights) console.log('Both policies have identical weights. This run is a headless-play smoke test, not a strength comparison.');
let wins = 0, draws = 0, losses = 0, scoreDifference = 0;
for (let pair = 0; pair < options.pairs; pair++) {
	const seed = options.seed + pair;
	for (let seat = 0; seat < 2; seat++) {
		const challengerFirst = seat === 0;
		const result = playStandardMatch({ seed, trainingPattern: patternForSeed(patterns, seed), policies: challengerFirst ? [challenger, baseline] : [baseline, challenger], labels: challengerFirst ? ['challenger', 'baseline'] : ['baseline', 'challenger'], onTurn: ({ turn, elapsedMs }) => {
			if (turn % 10 === 0) console.log(`  game ${pair * 2 + seat + 1}: ${turn} turns (${Math.round(elapsedMs / 1000)} s)`);
		} });
		const challengerScore = result.scores[challengerFirst ? 0 : 1], baselineScore = result.scores[challengerFirst ? 1 : 0];
		const diff = challengerScore - baselineScore;
		scoreDifference += diff;
		if (diff > 0) wins++; else if (diff < 0) losses++; else draws++;
		const gameNumber = pair * 2 + seat + 1;
		writeFileSync(join(output, `game-${String(gameNumber).padStart(5, '0')}.json`), JSON.stringify(result));
		writeFileSync(join(output, `game-${String(gameNumber).padStart(5, '0')}.txt`), readableLog(result));
		appendFileSync(join(output, 'summary.jsonl'), `${JSON.stringify({ gameNumber, seed, challengerFirst, challengerScore, baselineScore, winner: result.winner, turns: result.turns, elapsedMs: result.elapsedMs, thinkingMs: result.thinkingMs, rulesMs: result.rulesMs })}\n`);
		console.log(`${gameNumber}/${options.pairs * 2}: challenger ${challengerScore} - baseline ${baselineScore} (${result.elapsedMs} ms)`);
	}
}
const summary = { games: options.pairs * 2, wins, draws, losses, scoreDifference, averageScoreDifference: scoreDifference / (options.pairs * 2) };
writeFileSync(join(output, 'result.json'), JSON.stringify(summary, null, 2));
console.log(JSON.stringify({ output, ...summary }, null, 2));
